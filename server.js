'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const initSqlJs = require('sql.js');

function normalizeBasePath(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DB_PATH = path.join(DATA_DIR, 'portfolio.sqlite');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '').trim();
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH);
const COOKIE_PATH = BASE_PATH || '/';
const COOKIE_SECURE_MODE = String(process.env.COOKIE_SECURE || 'auto').trim().toLowerCase();
const ADMIN_BIND_IP = String(process.env.ADMIN_BIND_IP || 'false').trim().toLowerCase() === 'true';
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .flatMap(item => {
      try {
        return [new URL(item).origin];
      } catch {
        console.warn(`Ignoring invalid ALLOWED_ORIGINS entry: ${item}`);
        return [];
      }
    })
);

function withBasePath(routePath = '/') {
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return BASE_PATH ? `${BASE_PATH}${normalized === '/' ? '' : normalized}` : normalized;
}

function toPublicAssetUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return BASE_PATH && !normalized.startsWith(`${BASE_PATH}/`) ? `${BASE_PATH}${normalized}` : normalized;
}

const app = express();
const router = express.Router();
app.disable('x-powered-by');

const rawTrustProxy = process.env.TRUST_PROXY_HOPS;
const trustProxyHops = Number(rawTrustProxy === undefined || rawTrustProxy.trim() === '' ? '1' : rawTrustProxy);
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS must be a non-negative whole number.');
}
if (trustProxyHops >= 1) {
  app.set('trust proxy', trustProxyHops);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', ...ALLOWED_ORIGINS],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS],
      upgradeInsecureRequests: null
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

if (ALLOWED_ORIGINS.size > 0) {
  app.use((req, res, next) => {
    const requestOrigin = req.get('origin');
    if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    return next();
  });
}

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '8mb' }));

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many messages from this connection. Please try again later.' }
});

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many AI requests. Please try again later.' }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many admin requests. Please try again later.' }
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many login requests. Please try again later.' }
});

const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many view events. Please try again later.' }
});

let db;
let SQL;
let lastPersistedDatabase;

const DEFAULT_PORTFOLIO_CONTENT = {
  hero: {
    eyebrow: 'Software Development & Visual Media',
    name: 'Raian Ibne Kabir',
    lead: 'I am a software development student and visual storyteller based in Dhaka, Bangladesh. I build responsive web applications and create polished visual content, combining technical problem-solving with thoughtful design.',
    primaryCta: 'View my work',
    secondaryCta: 'Contact me',
    talkCta: "Let's talk",
    roles: ['Software Development Student', 'Web Application Developer', 'C++ & JavaScript Programmer', 'Videographer', 'Photographer', 'Video Editor']
  },
  navigation: {
    about: 'About', education: 'Education', skills: 'Skills', projects: 'Projects', creative: 'Creative', contact: 'Contact'
  },
  about: {
    kicker: '01 — About',
    title: 'Thoughtful code.',
    titleAccent: 'Purposeful visuals.',
    paragraphs: [
      'I am currently studying at Daffodil International University, where I am developing skills in software development and digital media. My interests include JavaScript and C++ development, SQL databases, interface design, photography, and video production.',
      'I value clear requirements, maintainable code, reliable performance, and thoughtful visual design. I enjoy applying these principles to practical projects and collaborative work.'
    ],
    stats: [
      { value: 3, suffix: '', label: 'Three GPA 5.00 scores' },
      { value: 5, suffix: '', label: 'Portfolio projects' },
      { value: 10, suffix: '+', label: 'Tools & technologies' },
      { value: 4, suffix: 'K', label: 'Video quality' }
    ]
  },
  education: {
    kicker: '02 — Education',
    title: 'Academic',
    titleAccent: 'journey',
    entries: [
      { degree: 'Primary Education Completion (PEC)', school: 'Shahid Carat Academy', location: 'Tangail', result: 'GPA 5.00', note: 'Academic distinction', current: false },
      { degree: 'Secondary School Certificate (SSC)', school: 'Gazipur Shaheen Carat Academy', location: 'Gazipur', result: 'GPA 5.00', note: 'Perfect score', current: false },
      { degree: 'Higher Secondary Certificate (HSC)', school: 'Rajendrapur Cantonment Public School & College', location: 'Rajendrapur', result: 'GPA 5.00', note: 'Perfect score', current: false },
      { degree: 'University · Currently studying', school: 'Daffodil International University', location: 'Dhaka · Building skills in software & creative media', result: 'Ongoing', note: 'Currently enrolled', current: true }
    ],
    certificates: []
  },
  skills: {
    kicker: '03 — Skills',
    title: 'Technical and',
    titleAccent: 'creative skills',
    programmingTab: 'Programming',
    creativeTab: 'Creative',
    note: 'I continue to expand my knowledge of programming languages and tools.',
    programming: [
      { name: 'C++', level: 85 }, { name: 'JavaScript', level: 88 }, { name: 'SQL & Databases', level: 80 },
      { name: 'Web Architecture', level: 82 }, { name: 'Node.js & APIs', level: 80 }, { name: 'UI Design · Figma', level: 84 }
    ],
    creative: [
      { name: 'Videography · 4K', level: 90 }, { name: 'Photography', level: 88 }, { name: 'Premiere Pro', level: 88 },
      { name: 'After Effects', level: 80 }, { name: 'Lightroom', level: 86 }, { name: 'Video Editing', level: 90 }
    ]
  },
  projects: {
    kicker: '04 — Projects',
    title: 'Selected',
    titleAccent: 'concepts',
    description: 'Projects exploring product design, AI, software architecture, and visual storytelling. Each project is labeled with its current status.',
    detailNote: 'Project details are provided for context. Contact me to discuss implementation.'
  },
  process: { kicker: '05 — Process', title: 'From idea to', titleAccent: 'impact' },
  creative: {
    kicker: '06 — Creative',
    title: 'Behind the',
    titleAccent: 'lens',
    items: [
      { icon: '🎬', title: 'Videography', description: 'I produce 4K videos with an emphasis on lighting, motion, and storytelling.' },
      { icon: '📷', title: 'Photography', description: 'I capture portraits, locations, and moments with a consistent visual style.' },
      { icon: '✂️', title: 'Post-production', description: 'I edit video in Premiere Pro, create motion graphics in After Effects, and grade colour in Lightroom.' },
      { icon: '🎨', title: 'Interface design', description: 'I design interfaces and layouts in Figma using consistent visual systems.' }
    ]
  },
  contact: {
    kicker: '07 — Contact',
    title: "Let's build",
    titleAccent: 'something great',
    description: 'For professional inquiries, project opportunities, or collaboration proposals, please send a message. Submissions are delivered to the private admin inbox.',
    email: 'raiankabir106@gmail.com',
    linkedin: 'https://linkedin.com/in/raian0001',
    instagram: 'https://instagram.com/raian.0001',
    location: 'Dhaka, Bangladesh',
    nameLabel: 'Name',
    emailLabel: 'Email',
    subjectLabel: 'Subject',
    messageLabel: 'Message',
    sendLabel: 'Send message'
  },
  resume: { title: 'Résumé & CV', label: 'Download my résumé', url: '' },
  footer: { invite: 'Have a project, idea or collaboration in mind?', cta: 'Discuss an opportunity', copyright: 'Raian Ibne Kabir' }
};

const PORTFOLIO_ARRAY_DEFAULTS = {
  'hero.roles': '',
  'about.paragraphs': '',
  'about.stats': { value: 0, suffix: '', label: '' },
  'education.entries': { degree: '', school: '', location: '', result: '', note: '', current: false },
  'education.certificates': { title: '', issuer: '', date: '', url: '' },
  'skills.programming': { name: '', level: 0 },
  'skills.creative': { name: '', level: 0 },
  'creative.items': { icon: '✦', title: '', description: '' }
};

const DEFAULT_PROJECTS = [
  ['DevFlow', 'A developer workflow dashboard concept for managing tasks, deployments, and team activity.', 'JavaScript, UI', 10],
  ['Synth AI', 'An AI assistant interface concept designed around clear conversations and practical tools.', 'AI, Node.js', 20],
  ['Nexus Stack', 'A full-stack architecture concept connecting APIs, databases, and a responsive front end.', 'SQL, Architecture', 30],
  ['Frame Story', 'A cinematic storytelling concept focused on 4K video and photography.', 'Premiere, 4K', 40],
  ['Matrix Core', 'A systems programming concept exploring performance and low-level C++ engineering.', 'C++, Systems', 50]
];

function sanitizePortfolioContent(value, template, key = 'content') {
  if (typeof template === 'string') {
    if (typeof value !== 'string') throw new Error(`${key} must be text.`);
    const maxLength = key.endsWith('.description') || key.endsWith('.lead') ? 1200 : 500;
    const text = value.trim();
    if (text.length > maxLength) throw new Error(`${key} is too long.`);
    if (['resume.url', 'linkedin', 'instagram', 'url'].some(part => key === part || key.endsWith(`.${part}`))) {
      if (!text) return '';
      return safeHttpUrl(text, key);
    }
    if (key.endsWith('.email') && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      throw new Error('Contact email must be valid.');
    }
    return text;
  }
  if (typeof template === 'number') {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || (key.endsWith('.level') && number > 100)) {
      throw new Error(`${key} must be a valid non-negative number.`);
    }
    return number;
  }
  if (typeof template === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${key} must be true or false.`);
    return value;
  }
  if (Array.isArray(template)) {
    if (!Array.isArray(value) || value.length > 40) throw new Error(`${key} must be a list with at most 40 items.`);
    const arrayKey = key.startsWith('content.') ? key.slice('content.'.length) : key;
    const itemTemplate = template[0] ?? PORTFOLIO_ARRAY_DEFAULTS[arrayKey];
    if (itemTemplate === undefined) throw new Error(`No item type is configured for ${key}.`);
    return value.map((item, index) => sanitizePortfolioContent(item, itemTemplate, `${key}.${index}`));
  }
  if (template && typeof template === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} must be an object.`);
    const unknownKeys = Object.keys(value).filter(childKey => !Object.hasOwn(template, childKey));
    if (unknownKeys.length) throw new Error(`${key} contains unsupported fields.`);
    return Object.fromEntries(Object.entries(template).map(([childKey, childTemplate]) => [
      childKey,
      sanitizePortfolioContent(value[childKey] ?? childTemplate, childTemplate, `${key}.${childKey}`)
    ]));
  }
  throw new Error(`${key} has an unsupported value.`);
}

function validatePortfolioContent(value) {
  const content = sanitizePortfolioContent(value, DEFAULT_PORTFOLIO_CONTENT);
  if (!content.hero.name || !content.hero.roles.length) throw new Error('Add a profile name and at least one role.');
  if (content.education.entries.some(entry => !entry.degree || !entry.school)) {
    throw new Error('Each academic journey item needs a qualification and school.');
  }
  if (content.education.certificates.some(item => !item.title || !item.issuer)) {
    throw new Error('Each certificate needs a title and issuer.');
  }
  if ([...content.skills.programming, ...content.skills.creative].some(item => !item.name)) {
    throw new Error('Each skill needs a name.');
  }
  if (content.creative.items.some(item => !item.title || !item.description)) {
    throw new Error('Each creative item needs a title and description.');
  }
  return content;
}

function getPortfolioContent() {
  const raw = rowsFrom("SELECT value FROM portfolio_settings WHERE key = 'portfolio_content'")[0]?.value;
  if (!raw) return DEFAULT_PORTFOLIO_CONTENT;
  try {
    return validatePortfolioContent(JSON.parse(raw));
  } catch (error) {
    console.error('Stored portfolio content is invalid:', error.message);
    throw new Error('Portfolio content could not be loaded.');
  }
}

function persistDatabase() {
  const bytes = Buffer.from(db.export());
  const tempPath = `${DB_PATH}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tempPath, bytes, { flag: 'wx' });
    fs.renameSync(tempPath, DB_PATH);
    lastPersistedDatabase = bytes;
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.error('Temporary database cleanup failed:', cleanupError.message);
      }
    }
    if (lastPersistedDatabase) {
      try {
        db.close();
        db = new SQL.Database(lastPersistedDatabase);
      } catch (restoreError) {
        console.error('Database rollback after a persistence failure failed:', restoreError.message);
      }
    }
    throw error;
  }
}

function decodeImage(dataUrl, subFolder, filename) {
  if (typeof dataUrl !== 'string') throw new Error('An image file is required.');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match) throw new Error('Only JPG, PNG, or WebP images are allowed.');
  const mime = match[1].toLowerCase();
  const encoded = match[2];
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('Image must be smaller than 5 MB.');
  if (buffer.toString('base64') !== encoded) throw new Error('The image data is invalid.');
  const validSignature = mime === 'image/jpeg'
    ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : mime === 'image/png'
      ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!validSignature) throw new Error('The image contents do not match the selected file type.');
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
  const directory = path.join(UPLOADS_DIR, subFolder);
  fs.mkdirSync(directory, { recursive: true });
  const safeName = `${filename}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
  const target = path.join(directory, safeName);
  fs.writeFileSync(target, buffer);
  return { url: `/uploads/${subFolder}/${safeName}`, path: target };
}

function removeUploadedImage(imageUrl, legacyFolder, prefix) {
  if (typeof imageUrl !== 'string' || !imageUrl) return;
  const cleanUrl = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  if (cleanUrl.startsWith('/uploads/')) {
    const uploadsRoot = path.resolve(UPLOADS_DIR);
    const relativePath = cleanUrl.slice('/uploads/'.length);
    const target = path.resolve(UPLOADS_DIR, relativePath);
    if (target.startsWith(`${uploadsRoot}${path.sep}`) && path.basename(target).startsWith(`${prefix}-`) && fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
    return;
  }
  if (!cleanUrl.startsWith(`/${legacyFolder}/${prefix}-`)) return;
  const root = path.resolve(PUBLIC_DIR);
  const target = path.resolve(PUBLIC_DIR, cleanUrl.slice(1));
  if (!target.startsWith(`${root}${path.sep}`)) return;
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

function rowsFrom(sql, params = []) {
  const statement = db.prepare(sql);
  try {
    if (params.length) statement.bind(params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

function safeString(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function safeHttpUrl(value, fieldName) {
  const text = safeString(value, 500);
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error(`${fieldName} must be a valid URL.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${fieldName} must use http or https and cannot contain credentials.`);
  }
  return url.href;
}

function safeSortOrder(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < -100000 || number > 100000) {
    throw new Error('Project order must be a whole number from -100000 to 100000.');
  }
  return number;
}

function adminPasswordMatches(candidate) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (expected.length < 8) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const candidateBuffer = Buffer.from(String(candidate || ''), 'utf8');
  return expectedBuffer.length === candidateBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
}

const adminLoginAttempts = new Map();
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_ADMIN_ATTEMPTS = 5;

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function createAdminSession(token, ipAddress) {
  const now = Date.now();
  db.run('DELETE FROM admin_sessions WHERE expires_at <= ?', [now]);
  db.run(
    'INSERT OR REPLACE INTO admin_sessions (token_hash, ip_address, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [hashSessionToken(token), safeString(ipAddress, 120), now, now + ADMIN_SESSION_MS]
  );
  persistDatabase();
}

function deleteAdminSession(token) {
  if (!token) return;
  db.run('DELETE FROM admin_sessions WHERE token_hash = ?', [hashSessionToken(token)]);
  if (db.getRowsModified() > 0) persistDatabase();
}

function clearAllAdminSessions() {
  db.run('DELETE FROM admin_sessions');
  if (db.getRowsModified() > 0) persistDatabase();
}

function pruneStaleLoginAttempts(now = Date.now()) {
  for (const [key, entry] of adminLoginAttempts.entries()) {
    if (now - entry.firstAttempt >= ADMIN_LOCKOUT_MS) {
      adminLoginAttempts.delete(key);
    }
  }
}

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function addAdminAudit(action, details = '', req) {
  try {
    db.run(
      'INSERT INTO admin_audit (action, details, ip_address) VALUES (?, ?, ?)',
      [safeString(action, 80), safeString(details, 500), req ? clientKey(req) : 'server']
    );
    persistDatabase();
  } catch (error) {
    console.error('Admin audit log failed:', error.message);
  }
}

function getPublicOrigin(req) {
  const useForwarded = Boolean(req.app.get('trust proxy'));
  const forwardedProto = useForwarded
    ? String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase()
    : '';
  const protocol = forwardedProto === 'https' || forwardedProto === 'http'
    ? forwardedProto
    : req.protocol;
  const forwardedHost = useForwarded
    ? String(req.get('x-forwarded-host') || '').split(',')[0].trim()
    : '';
  const host = forwardedHost || req.get('host');
  if (!host) return null;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return res.status(403).json({ message: 'A same-origin request is required.' });
  try {
    const requestOrigin = new URL(origin).origin;
    const expectedOrigin = getPublicOrigin(req);
    if (ALLOWED_ORIGINS.has(requestOrigin) || (expectedOrigin && requestOrigin === expectedOrigin)) {
      return next();
    }
    return res.status(403).json({ message: 'Cross-origin request blocked.' });
  } catch {
    return res.status(403).json({ message: 'Invalid request origin.' });
  }
}

router.use('/api', (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

router.use('/api/admin', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function readCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0) {
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = '';
      }
    }
  }
  return cookies;
}

function isHttpsRequest(req) {
  if (COOKIE_SECURE_MODE === 'true') return true;
  if (COOKIE_SECURE_MODE === 'false') return false;
  if (req.secure) return true;
  if (req.app.get('trust proxy')) {
    const proto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    if (proto === 'https') return true;
  }
  return false;
}

function setAdminCookie(req, res, token) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=28800${secure}`);
}

function clearAdminCookie(req, res) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `admin_session=; HttpOnly; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=0${secure}`);
}

function requireAdmin(req, res, next) {
  if ((process.env.ADMIN_PASSWORD || '').length < 8) {
    return res.status(503).json({ message: 'Admin access is disabled. Set an 8+ character ADMIN_PASSWORD in .env and restart the server.' });
  }
  const cookies = readCookies(req);
  const sessionToken = cookies.admin_session;
  let sessionValid = false;
  if (sessionToken) {
    const tokenHash = hashSessionToken(sessionToken);
    const session = rowsFrom('SELECT ip_address, expires_at FROM admin_sessions WHERE token_hash = ?', [tokenHash])[0];
    if (session) {
      const ipMatches = !ADMIN_BIND_IP || session.ip_address === clientKey(req);
      if (Number(session.expires_at) > Date.now() && ipMatches) {
        sessionValid = true;
      } else {
        db.run('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]);
        persistDatabase();
      }
    }
  }
  if (!sessionValid) {
    return res.status(401).json({ message: 'A valid admin session is required.' });
  }
  return next();
}

router.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Raian Portfolio API', timestamp: new Date().toISOString() });
});

router.post('/api/chat', chatLimiter, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ message: 'AI chat is not configured. Add OPENAI_API_KEY to .env and restart the server.' });
  }

  const submittedMessages = req.body?.messages;
  if (!Array.isArray(submittedMessages) || submittedMessages.length < 1 || submittedMessages.length > 10) {
    return res.status(400).json({ message: 'Send between 1 and 10 chat messages.' });
  }

  const messages = [];
  for (const entry of submittedMessages) {
    const role = entry?.role;
    const content = typeof entry?.content === 'string' ? entry.content.trim() : '';
    if (!['user', 'assistant'].includes(role) || !content || content.length > 1000) {
      return res.status(400).json({ message: 'Each chat message must have a valid role and contain 1 to 1000 characters.' });
    }
    messages.push({ role, content });
  }

  if (messages[messages.length - 1].role !== 'user' ||
      messages.reduce((total, message) => total + message.content.length, 0) > 6000) {
    return res.status(400).json({ message: 'The latest message must be from you and the conversation must be under 6000 characters.' });
  }

  let publicContent;
  try {
    publicContent = getPortfolioContent();
  } catch (error) {
    console.error('Could not load portfolio context for chat:', error.message);
    publicContent = DEFAULT_PORTFOLIO_CONTENT;
  }
  let publishedProjects = [];
  try {
    publishedProjects = rowsFrom(
      'SELECT title, description, tags FROM portfolio_projects WHERE active = 1 ORDER BY sort_order ASC, id ASC'
    ).slice(0, 30);
  } catch (error) {
    console.error('Could not load project context for chat:', error.message);
  }
  const projectNames = publishedProjects.map(project => project.title).filter(Boolean);
  const systemMessage = {
    role: 'system',
    content: [
      'You are the AI assistant on Raian Ibne Kabir’s portfolio website. You are an AI, not Raian; never claim to be him.',
      'Answer in the language the visitor uses, including English or Bangla. Be friendly, concise, and helpful.',
      `Use only this public portfolio information: ${JSON.stringify({
        hero: publicContent.hero,
        about: publicContent.about,
        education: publicContent.education,
        skills: publicContent.skills,
        projects: projectNames,
        creative: publicContent.creative,
        contact: publicContent.contact
      }).slice(0, 12000)}`,
      'Do not describe portfolio concept projects as completed client products unless the public content explicitly presents them as completed work.',
      'If a question is outside these facts, say you do not know and suggest contacting Raian. Do not invent personal details, credentials, or project results.'
    ].join(' ')
  };

  let upstreamResponse;
  try {
    upstreamResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [systemMessage, ...messages],
        max_tokens: 400,
        temperature: 0.6
      }),
      signal: AbortSignal.timeout(30000)
    });
  } catch (error) {
    console.error('OpenAI chat request failed:', error.name, error.message);
    return res.status(502).json({ message: 'The AI service could not be reached. Please try again.' });
  }

  let result;
  try {
    result = await upstreamResponse.json();
  } catch (error) {
    console.error('OpenAI returned an unreadable chat response:', error.message);
    return res.status(502).json({ message: 'The AI service returned an invalid response. Please try again.' });
  }

  if (!upstreamResponse.ok) {
    console.error(
      'OpenAI chat request failed:',
      upstreamResponse.status,
      result?.error?.code || result?.error?.type || 'unknown provider error'
    );
    const message = upstreamResponse.status === 429
      ? 'The AI is busy right now. Please try again shortly.'
      : 'The AI service is temporarily unavailable. Please try again later.';
    return res.status(502).json({ message });
  }

  const reply = result?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    console.error('OpenAI chat response did not contain a reply.');
    return res.status(502).json({ message: 'The AI returned an empty reply. Please try again.' });
  }

  return res.json({ reply: reply.trim() });
});

router.post('/api/contact', contactLimiter, (req, res) => {
  const name = safeString(req.body?.name, 80);
  const email = safeString(req.body?.email, 160).toLowerCase();
  const subject = safeString(req.body?.subject, 120) || 'General enquiry';
  const message = safeString(req.body?.message, 3000);
  const website = safeString(req.body?.website, 200);

  // Honeypot: return the same success response but do not store bot submissions.
  if (website) return res.status(201).json({ message: 'Message received. Thank you for reaching out!' });

  if (name.length < 2) return res.status(400).json({ message: 'Please enter a name with at least 2 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Please enter a valid email address.' });
  if (message.length < 10) return res.status(400).json({ message: 'Please write a message with at least 10 characters.' });

  try {
    db.run(
      'INSERT INTO messages (name, email, subject, message, status) VALUES (?, ?, ?, ?, ?)',
      [name, email, subject, message, 'new']
    );
    persistDatabase();
    return res.status(201).json({ message: 'Message sent successfully. Thank you!' });
  } catch (error) {
    console.error('Contact message save failed:', error.message);
    return res.status(500).json({ message: 'The message could not be saved. Please try again later.' });
  }
});

router.post('/api/analytics/view', analyticsLimiter, (req, res) => {
  try {
    const source = safeString(req.body?.source, 80) || 'direct';
    db.run('INSERT INTO page_views (source) VALUES (?)', [source]);
    persistDatabase();
    res.status(204).end();
  } catch (error) {
    console.error('View tracking failed:', error.message);
    res.status(500).json({ message: 'Could not record the visit.' });
  }
});

router.post('/api/admin/login', adminLoginLimiter, requireSameOrigin, (req, res) => {
  if ((process.env.ADMIN_PASSWORD || '').length < 8) {
    return res.status(503).json({ message: 'Admin access is disabled. Set an 8+ character ADMIN_PASSWORD in .env and restart the server.' });
  }
  const now = Date.now();
  pruneStaleLoginAttempts(now);
  const key = clientKey(req);
  const attempt = adminLoginAttempts.get(key);
  if (attempt && attempt.count >= MAX_ADMIN_ATTEMPTS && now - attempt.firstAttempt < ADMIN_LOCKOUT_MS) {
    const seconds = Math.ceil((ADMIN_LOCKOUT_MS - (now - attempt.firstAttempt)) / 1000);
    addAdminAudit('login_locked', `Account blocked for ${seconds}s`, req);
    res.setHeader('Retry-After', String(seconds));
    return res.status(429).json({ message: `Too many failed attempts. Try again in ${Math.ceil(seconds / 60)} minutes.` });
  }
  if (!adminPasswordMatches(req.body?.password)) {
    const nextAttempt = attempt && now - attempt.firstAttempt < ADMIN_LOCKOUT_MS
      ? { count: attempt.count + 1, firstAttempt: attempt.firstAttempt }
      : { count: 1, firstAttempt: now };
    adminLoginAttempts.set(key, nextAttempt);
    addAdminAudit('login_failed', 'Incorrect password', req);
    const remaining = Math.max(0, MAX_ADMIN_ATTEMPTS - nextAttempt.count);
    return res.status(401).json({ message: remaining ? `Incorrect admin password. ${remaining} attempts remaining.` : 'Too many failed attempts. Please wait 15 minutes.' });
  }
  adminLoginAttempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  createAdminSession(token, key);
  setAdminCookie(req, res, token);
  addAdminAudit('login_success', 'Admin session created', req);
  res.json({ message: 'Unlocked.' });
});

router.post('/api/admin/logout', requireSameOrigin, (req, res) => {
  const token = readCookies(req).admin_session;
  deleteAdminSession(token);
  clearAdminCookie(req, res);
  addAdminAudit('logout', 'Admin session ended', req);
  res.json({ message: 'Signed out.' });
});

router.get('/api/portfolio/projects', (_req, res) => {
  try {
    const projects = rowsFrom('SELECT id, title, description, tags, image_url, demo_url, sort_order FROM portfolio_projects WHERE active = 1 ORDER BY sort_order ASC, id ASC')
      .map(project => ({ ...project, image_url: toPublicAssetUrl(project.image_url) }));
    res.json({ projects });
  } catch (error) {
    console.error('Portfolio projects failed:', error.message);
    res.status(500).json({ message: 'Could not load projects.' });
  }
});

router.get('/api/portfolio/settings', (_req, res) => {
  try {
    const portrait = rowsFrom("SELECT value FROM portfolio_settings WHERE key = 'portrait_image_url'")[0]?.value;
    res.json({ portraitImageUrl: toPublicAssetUrl(portrait || '/images/portrait.jpg') });
  } catch (error) {
    console.error('Portfolio settings failed:', error.message);
    res.status(500).json({ message: 'Could not load portfolio settings.' });
  }
});

router.get('/api/portfolio/content', (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ content: getPortfolioContent() });
  } catch (error) {
    console.error('Portfolio content failed:', error.message);
    res.status(500).json({ message: 'Could not load portfolio content.' });
  }
});

router.get('/api/admin/portfolio/content', adminLimiter, requireAdmin, (_req, res) => {
  try {
    res.json({ content: getPortfolioContent() });
  } catch (error) {
    console.error('Admin portfolio content failed:', error.message);
    res.status(500).json({ message: 'Could not load portfolio content.' });
  }
});

router.put('/api/admin/portfolio/content', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  let content;
  let serialized;
  try {
    content = validatePortfolioContent(req.body?.content);
    serialized = JSON.stringify(content);
    if (Buffer.byteLength(serialized, 'utf8') > 160 * 1024) {
      return res.status(400).json({ message: 'Portfolio content is too large.' });
    }
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Could not update portfolio content.' });
  }
  try {
    db.run(
      "INSERT OR REPLACE INTO portfolio_settings (key, value) VALUES ('portfolio_content', ?)",
      [serialized]
    );
    persistDatabase();
    addAdminAudit('portfolio_content_updated', 'Portfolio content updated', req);
    res.json({ message: 'Portfolio content updated.', content });
  } catch (error) {
    console.error('Portfolio content update failed:', error.message);
    res.status(500).json({ message: 'Could not persist portfolio content.' });
  }
});

router.get('/api/portfolio/steps', (_req, res) => {
  try {
    res.json({
      steps: rowsFrom('SELECT id, title, description FROM portfolio_steps ORDER BY id ASC')
    });
  } catch (error) {
    console.error('Portfolio steps failed:', error.message);
    res.status(500).json({ message: 'Could not load portfolio steps.' });
  }
});

router.get('/api/admin/steps', adminLimiter, requireAdmin, (_req, res) => {
  try {
    res.json({
      steps: rowsFrom('SELECT id, title, description FROM portfolio_steps ORDER BY id ASC')
    });
  } catch (error) {
    console.error('Admin portfolio steps failed:', error.message);
    res.status(500).json({ message: 'Could not load portfolio steps.' });
  }
});

router.put('/api/admin/steps', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const submittedSteps = req.body?.steps;
  if (!Array.isArray(submittedSteps) || submittedSteps.length !== 3) {
    return res.status(400).json({ message: 'Provide all three portfolio steps.' });
  }
  if (submittedSteps.some(step =>
    typeof step?.title !== 'string' ||
    typeof step?.description !== 'string'
  )) {
    return res.status(400).json({ message: 'Each step title and description must be text.' });
  }

  const steps = submittedSteps.map((step, index) => ({
    id: index + 1,
    title: safeString(step?.title, 80),
    description: safeString(step?.description, 320)
  }));
  if (steps.some(step => !step.title || !step.description)) {
    return res.status(400).json({ message: 'Each step needs a title and description.' });
  }
  if (submittedSteps.some((step, index) =>
    String(step?.title ?? '').trim().length > 80 ||
    String(step?.description ?? '').trim().length > 320 ||
    Number(step?.id) !== index + 1
  )) {
    return res.status(400).json({ message: 'Step content is too long or the step order is invalid.' });
  }

  try {
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM portfolio_steps');
    steps.forEach(step => {
      db.run(
        'INSERT INTO portfolio_steps (id, title, description) VALUES (?, ?, ?)',
        [step.id, step.title, step.description]
      );
    });
    db.run('COMMIT');
    persistDatabase();
    addAdminAudit('portfolio_steps_updated', 'Portfolio process steps updated', req);
    res.json({ message: 'Portfolio steps updated.' });
  } catch (error) {
    try {
      db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('Portfolio steps rollback failed:', rollbackError.message);
    }
    console.error('Portfolio steps update failed:', error.message);
    res.status(500).json({ message: 'Could not update portfolio steps.' });
  }
});

router.get('/api/admin/projects', adminLimiter, requireAdmin, (_req, res) => {
  try {
    const projects = rowsFrom('SELECT id, title, description, tags, image_url, demo_url, sort_order, active FROM portfolio_projects ORDER BY sort_order ASC, id ASC')
      .map(project => ({ ...project, image_url: toPublicAssetUrl(project.image_url) }));
    res.json({ projects });
  } catch (error) {
    res.status(500).json({ message: 'Could not load projects.' });
  }
});

router.post('/api/admin/projects', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const title = safeString(req.body?.title, 100);
  const description = safeString(req.body?.description, 500);
  const tags = safeString(req.body?.tags, 200);
  let demoUrl;
  let sortOrder;
  try {
    demoUrl = safeHttpUrl(req.body?.demoUrl, 'Project URL');
    sortOrder = safeSortOrder(req.body?.sortOrder ?? 0);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  if (!title || !description) return res.status(400).json({ message: 'Title and description are required.' });
  try {
    let imageUrl = '';
    if (req.body?.image) imageUrl = decodeImage(req.body.image, 'projects', 'project').url;
    db.run(
      'INSERT INTO portfolio_projects (title, description, tags, image_url, demo_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, tags, imageUrl, demoUrl, sortOrder]
    );
    persistDatabase();
    addAdminAudit('project_added', title, req);
    res.status(201).json({ message: 'Project added.' });
  } catch (error) {
    console.error('Project add failed:', error.message);
    res.status(400).json({ message: error.message || 'Could not add project.' });
  }
});

router.put('/api/admin/projects/:id', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid project ID.' });
  const title = safeString(req.body?.title, 100);
  const description = safeString(req.body?.description, 500);
  const tags = safeString(req.body?.tags, 200);
  let demoUrl;
  let sortOrder;
  try {
    demoUrl = safeHttpUrl(req.body?.demoUrl, 'Project URL');
    sortOrder = safeSortOrder(req.body?.sortOrder ?? 0);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  if (!title || !description) return res.status(400).json({ message: 'Title and description are required.' });
  try {
    const previous = rowsFrom('SELECT image_url FROM portfolio_projects WHERE id = ?', [id])[0];
    if (!previous) return res.status(404).json({ message: 'Project not found.' });
    const previousImageUrl = previous.image_url;
    let imageSql = '';
    const params = [title, description, tags, demoUrl, sortOrder];
    if (req.body?.image) {
      params.push(decodeImage(req.body.image, 'projects', 'project').url);
      imageSql = ', image_url = ?';
    }
    params.push(id);
    db.run(`UPDATE portfolio_projects SET title = ?, description = ?, tags = ?, demo_url = ?, sort_order = ?${imageSql} WHERE id = ?`, params);
    if (db.getRowsModified() === 0) return res.status(404).json({ message: 'Project not found.' });
    persistDatabase();
    if (req.body?.image) removeUploadedImage(previousImageUrl, 'images/projects', 'project');
    addAdminAudit('project_updated', title, req);
    res.json({ message: 'Project updated.' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Could not update project.' });
  }
});

router.delete('/api/admin/projects/:id', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid project ID.' });
  try {
    const project = rowsFrom('SELECT image_url FROM portfolio_projects WHERE id = ?', [id])[0];
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    db.run('DELETE FROM portfolio_projects WHERE id = ?', [id]);
    persistDatabase();
    removeUploadedImage(project.image_url, 'images/projects', 'project');
    addAdminAudit('project_deleted', `Project ${id}`, req);
    res.json({ message: 'Project deleted.' });
  } catch (error) {
    console.error('Project delete failed:', error.message);
    res.status(500).json({ message: 'Could not delete project.' });
  }
});

router.post('/api/admin/portrait', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  try {
    const image = decodeImage(req.body?.image, 'portrait', 'portrait');
    const previousUrl = rowsFrom("SELECT value FROM portfolio_settings WHERE key = 'portrait_image_url'")[0]?.value;
    db.run(
      "INSERT OR REPLACE INTO portfolio_settings (key, value) VALUES ('portrait_image_url', ?)",
      [image.url]
    );
    persistDatabase();
    removeUploadedImage(previousUrl, 'images', 'portrait');
    addAdminAudit('portrait_updated', 'Portfolio portrait replaced', req);
    res.json({ message: 'Portrait updated.', url: toPublicAssetUrl(image.url) });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Could not update portrait.' });
  }
});

router.post('/api/admin/security/password', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const current = req.body?.currentPassword;
  const next = String(req.body?.newPassword || '');
  if (!adminPasswordMatches(current)) return res.status(401).json({ message: 'Current password is incorrect.' });
  if (next.length < 12) return res.status(400).json({ message: 'New password must be at least 12 characters.' });
  if (!/^[A-Za-z0-9!@$%^&*()_+\-=\[\]{};:,.?~]+$/.test(next)) {
    return res.status(400).json({ message: 'Use letters, numbers, and common symbols only; spaces, quotes, and line breaks are not supported.' });
  }
  const envPath = path.join(ROOT, '.env');
  let envPersisted = false;
  if (fs.existsSync(envPath)) {
    try {
      const env = fs.readFileSync(envPath, 'utf8');
      const updated = /^ADMIN_PASSWORD=.*$/m.test(env)
        ? env.replace(/^ADMIN_PASSWORD=.*$/m, () => `ADMIN_PASSWORD=${next}`)
        : `${env}\nADMIN_PASSWORD=${next}\n`;
      fs.writeFileSync(envPath, updated, 'utf8');
      envPersisted = true;
    } catch (error) {
      console.warn('Could not update .env file:', error.message);
    }
  }
  process.env.ADMIN_PASSWORD = next;
  clearAllAdminSessions();
  addAdminAudit('password_changed', 'Admin password changed and sessions revoked', req);
  clearAdminCookie(req, res);
  res.json({
    message: envPersisted
      ? 'Password changed. Sign in again.'
      : 'Password changed for the running server. Update ADMIN_PASSWORD in your hosting dashboard so it persists across restarts.'
  });
});

router.post('/api/admin/security/logout-all', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  clearAllAdminSessions();
  addAdminAudit('sessions_revoked', 'All admin sessions revoked', req);
  clearAdminCookie(req, res);
  res.json({ message: 'All admin sessions revoked.' });
});

router.get('/api/admin/messages', adminLimiter, requireAdmin, (_req, res) => {
  try {
    const messages = rowsFrom(
      'SELECT id, name, email, subject, message, status, created_at FROM messages ORDER BY id DESC LIMIT 250'
    );
    const counts = rowsFrom(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS unread FROM messages"
    )[0] || { total: 0, unread: 0 };
    res.json({ messages, counts });
  } catch (error) {
    console.error('Admin message list failed:', error.message);
    res.status(500).json({ message: 'Could not load messages.' });
  }
});

router.get('/api/admin/stats', adminLimiter, requireAdmin, (_req, res) => {
  try {
    const totals = rowsFrom(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS unread FROM messages"
    )[0] || { total: 0, unread: 0 };
    const views = rowsFrom('SELECT COUNT(*) AS total FROM page_views')[0]?.total || 0;
    const todayViews = rowsFrom(
      "SELECT COUNT(*) AS total FROM page_views WHERE created_at >= datetime('now', '-1 day')"
    )[0]?.total || 0;
    const trend = rowsFrom(
      "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS views FROM page_views WHERE created_at >= datetime('now', '-7 days') GROUP BY day ORDER BY day"
    );
    res.json({ ...totals, unread: totals.unread || 0, views, todayViews, trend });
  } catch (error) {
    console.error('Admin stats failed:', error.message);
    res.status(500).json({ message: 'Could not load dashboard statistics.' });
  }
});

router.get('/api/admin/security', adminLimiter, requireAdmin, (_req, res) => {
  try {
    const recent = rowsFrom(
      'SELECT action, details, ip_address, created_at FROM admin_audit ORDER BY id DESC LIMIT 20'
    );
    res.json({
      sessionHours: ADMIN_SESSION_MS / 3600000,
      failedAttemptsBlocked: MAX_ADMIN_ATTEMPTS,
      lockoutMinutes: ADMIN_LOCKOUT_MS / 60000,
      recent
    });
  } catch (error) {
    console.error('Admin security log failed:', error.message);
    res.status(500).json({ message: 'Could not load security activity.' });
  }
});

router.patch('/api/admin/messages/bulk/read', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isSafeInteger).filter(id => id > 0) : [];
  if (!ids.length) return res.status(400).json({ message: 'Select at least one message.' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`UPDATE messages SET status = 'read' WHERE id IN (${placeholders})`, ids);
    persistDatabase();
    addAdminAudit('messages_marked_read', `${ids.length} message(s)`, req);
    res.json({ message: 'Selected messages marked as read.' });
  } catch (error) {
    console.error('Bulk mark-read failed:', error.message);
    res.status(500).json({ message: 'Could not update selected messages.' });
  }
});

router.post('/api/admin/messages/bulk/delete', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isSafeInteger).filter(id => id > 0) : [];
  if (!ids.length) return res.status(400).json({ message: 'Select at least one message.' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM messages WHERE id IN (${placeholders})`, ids);
    persistDatabase();
    addAdminAudit('messages_deleted', `${ids.length} message(s)`, req);
    res.json({ message: 'Selected messages deleted.' });
  } catch (error) {
    console.error('Bulk delete failed:', error.message);
    res.status(500).json({ message: 'Could not delete selected messages.' });
  }
});

router.get('/api/admin/export', adminLimiter, requireAdmin, (_req, res) => {
  try {
    const messages = rowsFrom(
      'SELECT id, name, email, subject, message, status, created_at FROM messages ORDER BY id DESC'
    );
    const escapeCsv = (value) => {
      const text = String(value ?? '');
      const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [
      ['id', 'name', 'email', 'subject', 'message', 'status', 'created_at'].join(','),
      ...messages.map(row => [row.id, row.name, row.email, row.subject, row.message, row.status, row.created_at].map(escapeCsv).join(','))
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio-messages.csv"');
    addAdminAudit('messages_exported', `${messages.length} message(s)`, _req);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('Admin export failed:', error.message);
    res.status(500).json({ message: 'Could not export messages.' });
  }
});

router.patch('/api/admin/messages/:id/read', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid message ID.' });
  try {
    db.run("UPDATE messages SET status = 'read' WHERE id = ?", [id]);
    if (db.getRowsModified() === 0) return res.status(404).json({ message: 'Message not found.' });
    persistDatabase();
    addAdminAudit('message_marked_read', `Message ${id}`, req);
    res.json({ message: 'Marked as read.' });
  } catch (error) {
    console.error('Mark-read failed:', error.message);
    res.status(500).json({ message: 'Could not update this message.' });
  }
});

router.delete('/api/admin/messages/:id', adminLimiter, requireAdmin, requireSameOrigin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid message ID.' });
  try {
    db.run('DELETE FROM messages WHERE id = ?', [id]);
    if (db.getRowsModified() === 0) return res.status(404).json({ message: 'Message not found.' });
    persistDatabase();
    addAdminAudit('message_deleted', `Message ${id}`, req);
    res.json({ message: 'Message deleted.' });
  } catch (error) {
    console.error('Delete message failed:', error.message);
    res.status(500).json({ message: 'Could not delete this message.' });
  }
});

router.get('/admin', (req, res) => {
  if (req.originalUrl.split('?')[0].endsWith('/admin/')) {
    return res.redirect(301, withBasePath('/admin'));
  }
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.sendFile('admin.html', { root: PUBLIC_DIR });
});

router.get('/admin.html', (_req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.sendFile('admin.html', { root: PUBLIC_DIR });
});

router.get('/vendor/lottie.min.js', (_req, res) => {
  const lottiePath = require.resolve('lottie-web/build/player/lottie.min.js');
  res.sendFile(path.basename(lottiePath), { root: path.dirname(lottiePath) });
});

router.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

router.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
router.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));

if (BASE_PATH) {
  app.use((req, res, next) => {
    const cleanPath = req.originalUrl.split('?')[0];
    if (cleanPath === BASE_PATH) {
      const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      return res.redirect(301, `${BASE_PATH}/${query}`);
    }
    return next();
  });
}

app.use(BASE_PATH || '/', router);

app.use((req, res) => {
  if (req.path.startsWith(withBasePath('/api/'))) return res.status(404).json({ message: 'API route not found.' });
  res.status(404).send(`Page not found. <a href="${withBasePath('/')}">Return to the portfolio</a>.`);
});

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'The request body contains invalid JSON.' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'The request body is too large.' });
  }
  console.error('Unhandled server error:', error.message);
  res.status(500).json({ message: 'An unexpected server error occurred.' });
});

async function startServer() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const sqlJsDirectory = path.dirname(require.resolve('sql.js'));
  SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsDirectory, file) });
  if (fs.existsSync(DB_PATH)) {
    const databaseFile = fs.readFileSync(DB_PATH);
    db = new SQL.Database(new Uint8Array(databaseFile));
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL DEFAULT 'direct',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    ip_address TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS portfolio_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    demo_url TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS portfolio_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS portfolio_steps (
    id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 3),
    title TEXT NOT NULL,
    description TEXT NOT NULL
  )`);
  db.run(
    "INSERT OR IGNORE INTO portfolio_settings (key, value) VALUES ('portrait_image_url', '/images/portrait.jpg')"
  );
  db.run(
    "INSERT OR IGNORE INTO portfolio_settings (key, value) VALUES ('portfolio_content', ?)",
    [JSON.stringify(DEFAULT_PORTFOLIO_CONTENT)]
  );
  if (!rowsFrom("SELECT value FROM portfolio_settings WHERE key = 'default_projects_seeded'").length) {
    DEFAULT_PROJECTS.forEach(([title, description, tags, order]) => {
      db.run(
        'INSERT INTO portfolio_projects (title, description, tags, sort_order) VALUES (?, ?, ?, ?)',
        [title, description, tags, order]
      );
    });
    db.run(
      "INSERT INTO portfolio_settings (key, value) VALUES ('default_projects_seeded', '1')"
    );
  }
  [
    [1, 'Think with clarity', 'I break complex ideas into practical systems, clear requirements, and focused user experiences.'],
    [2, 'Build with precision', 'I connect front-end, APIs, and databases with clean code, reliable architecture, and useful interactions.'],
    [3, 'Create lasting polish', 'I finish every project with thoughtful motion, visual storytelling, and attention to the smallest details.']
  ].forEach(step => {
    db.run('INSERT OR IGNORE INTO portfolio_steps (id, title, description) VALUES (?, ?, ?)', step);
  });
  persistDatabase();

  const onListening = () => {
    const baseDisplay = BASE_PATH || '';
    console.log(`\nRAIAN PORTFOLIO IS RUNNING`);
    console.log(`Portfolio : http://localhost:${PORT}${baseDisplay || '/'}`);
    console.log(`Admin     : http://localhost:${PORT}${baseDisplay}/admin`);
    console.log(`API       : http://localhost:${PORT}${baseDisplay}/api/health\n`);
    if ((process.env.ADMIN_PASSWORD || '').length < 8) {
      console.warn('ADMIN WARNING: set ADMIN_PASSWORD (8+ characters) in .env or host environment variables to enable the admin dashboard API.');
    }
  };
  const server = HOST ? app.listen(PORT, HOST, onListening) : app.listen(PORT, onListening);

  const shutdown = () => {
    server.close(() => {
      try {
        if (db) {
          persistDatabase();
          db.close();
        }
      } catch (error) {
        console.error('Error closing database on shutdown:', error.message);
      }
      process.exit(0);
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((error) => {
  console.error('Could not start the portfolio server:', error);
  process.exit(1);
});

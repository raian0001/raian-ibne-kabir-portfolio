# Raian Ibne Kabir — Cinematic Portfolio

A responsive, animated personal portfolio with an Express backend, a SQLite database (WebAssembly-based `sql.js`, so no native compiler is needed on Windows), a working contact form, and a password-protected admin dashboard.

## 1. Requirements

- Windows 10/11, macOS or Linux
- Node.js 18.3 or later; use a current Node.js LTS release
- Internet connection for the first `npm install` and Google Fonts; live AI chat also requires OpenAI access

Node.js official download: <https://nodejs.org/en/download>

## 2. Run in VS Code on Windows

1. Extract the ZIP file.
2. Open the extracted `raian-ibne-kabir-portfolio` folder in VS Code (`File → Open Folder`).
3. Open the VS Code terminal (`Terminal → New Terminal`).
4. Check Node and npm:

   ```powershell
   node -v
   npm -v
   ```

5. Create your private environment file:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

6. In `.env`, replace `ADMIN_PASSWORD` with your own private password (at least 8 characters) and set `OPENAI_API_KEY` to your OpenAI API key to enable live AI chat. Keep `.env` private; never paste or commit the key.
7. Install the project packages:

   ```powershell
   npm install
   ```

8. Start the website:

   ```powershell
   npm start
   ```

9. Open the portfolio at <http://localhost:3000>.
10. Open the admin inbox at <http://localhost:3000/admin> and enter the password from `.env`.

Keep the terminal window open while using the website. Press `Ctrl + C` in that terminal to stop the server.

## 3. If PowerShell says `npm is not recognized`

This means Node.js/npm is not available in that terminal's PATH. Install the current Node.js LTS release from <https://nodejs.org/en/download> and keep the installer option that adds Node.js to PATH enabled. Then close **all** VS Code and PowerShell windows, reopen VS Code, open this project folder, and run `node -v` and `npm -v` again. Only after both commands show versions should you run `npm install`.

## 4. What works

- Cinematic hero with your supplied portrait, animated particle canvas, spotlight, parallax, orbiting elements, scroll progress, preloader and reveal animations.
- Staggered scroll reveals, scroll parallax, animated gradient text, a custom desktop cursor, a liquid SVG preloader, and CSS-orbiting visual accents.
- Scroll-linked project showcase, project detail modal, and support for projects published from the admin panel.
- Animated liquid background accents on the portfolio and admin dashboard, with reduced-motion support.
- Edit the three process showcase steps from the dedicated **Portfolio steps** section in the admin dashboard.
- Manage public portfolio copy and repeatable sections from **Portfolio content**: profile, About, academic journey, certificates, skills, section headings, creative work, contact details, résumé link, and footer.
- Use the redesigned, step-by-step Portfolio content tabs to edit one dedicated section at a time. Open the glassmorphic sliding admin panel from the three-dot button in the upper-left corner. Theme and language controls sit beside the menu button; navigation and sign-out are in the panel.
- Add, edit, reorder, and remove education entries, certificates, skills, and creative cards. Update any project from the Projects section.
- Add a Google Drive résumé share link in **Résumé / CV**. Set the Drive file permission to **Anyone with the link — Viewer**; the public portfolio provides a download link when a résumé URL is configured.
- Responsive navigation, timeline, skill showcase and clickable project detail modal.
- OpenAI-powered English/Bangla portfolio chat. The API key stays server-side, chat requests are rate-limited, and replies are grounded in the public portfolio details.
- Contact form validation and POST `/api/contact` endpoint.
- SQLite persistence at `data/portfolio.sqlite`.
- Admin dashboard at `/admin`: manage messages, update the portrait and all portfolio content, edit projects and process steps, and review security activity. Content changes are persisted in SQLite and appear on the public portfolio immediately or after refresh.
- Admin sign-in uses a rate-limited login, a short-lived session cookie, failed-attempt lockout, and origin checks.
- Security headers, request-size limits, input validation, rate limits, and a contact-form honeypot.
- Visit analytics record one visit per browser tab session; they are not a unique-visitor count.

## 5. Appearance and language

- Use the **বাংলা / EN** button in the top navigation to switch between English and Bangla. The selected language is saved in this browser.
- Use the **sun / moon** button to switch between the default dark theme and light theme. The selected theme is saved in this browser.
- The admin panel and public portfolio share saved theme and language settings across browser tabs.
- Bangla typography uses the Noto Sans Bengali web font. An internet connection is needed to load it.
- The default portrait is included at `public/images/portrait.jpg`. You can replace it from the admin panel.

## 6. Important notes

- The five projects included in the source content are concepts, not completed client products. Add your own work through the admin panel and label project status accurately.
- Contact messages are saved to the SQLite database. This starter does **not** send email notifications. You can read submissions in `/admin`.
- If you forget the admin password, edit `ADMIN_PASSWORD` in `.env` and restart the server; email-based password recovery is not configured.
- Admin sessions are held in memory and end when the server restarts. They are not shared across multiple Node.js instances.
- The SQLite database is loaded into memory and saved to `data/portfolio.sqlite` after writes. Keep one app instance per database file, back it up, and move to a server database for higher traffic or multiple instances.
- Visit analytics and contact messages are retained until manually deleted; configure a retention policy if the site will collect data long term.
- Live AI chat requires an OpenAI API key in `.env`, an internet connection, and may incur API usage charges. Visitor prompts are sent to OpenAI; do not send sensitive information. Never put the key in frontend code or publish it.
- Before deployment, use HTTPS, set a strong unique `ADMIN_PASSWORD`, configure your hosting provider's persistent disk for the `data/` folder, and review the privacy/legal requirements that apply to your site.
- If deploying behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops; do not trust arbitrary forwarded headers.
- Google Fonts are loaded from Google’s CDN; the system font stack remains available if that service is unreachable.
- Do not publish your `.env` file or commit it to source control.

## 7. Portrait photo

Upload a replacement portrait from the admin panel. JPEG, PNG, and WebP files up to 5 MB are supported.

## 8. Deploy to any custom domain

This package is pre-configured to work on **any domain, subdomain, or subpath** behind HTTPS reverse proxies (Cloudflare, Nginx, Caddy, Render, Railway, Fly.io, cPanel, Hostinger, etc.) without changing any portfolio content.

### Included deployment files

- `app.js` & `server.js` — Node.js entrypoints (`app.js` provides compatibility for cPanel/Hostinger Node.js Selector).
- `.env.example` — Full environment template (`PORT`, `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `TRUST_PROXY_HOPS`, `COOKIE_SECURE`, `ALLOWED_ORIGINS`, `BASE_PATH`, `DATA_DIR`).
- `render.yaml` — Ready-to-deploy Render blueprint.
- `Procfile` — Standard process definition (`web: node server.js`) for Heroku, Railway, Dokku, etc.
- `Dockerfile` & `.dockerignore` — Container build for Docker, Coolify, CapRover, Fly.io, or Cloud Run.
- `deploy/nginx.conf.example` & `deploy/ecosystem.config.cjs` — Reference Nginx reverse-proxy (with 10 MB upload limit) and PM2 configs for VPS hosting.

### Option A: Cloud Node.js hosting (Render, Railway, Fly.io, Coolify)

1. Upload this extracted folder to a private Git repository (or deploy directly via CLI/Docker).
2. Set build command to `npm ci --omit=dev` and start command to `npm start`.
3. Set environment variables in the host dashboard:
   - `ADMIN_PASSWORD` = strong private password (12+ characters)
   - `TRUST_PROXY_HOPS` = `1` (or `2` if behind Cloudflare + another proxy)
   - `OPENAI_API_KEY` = optional OpenAI API key for live AI chat
   - `DATA_DIR` = optional persistent disk mount path (e.g. `/var/data`) so `portfolio.sqlite` and uploaded images survive redeploys
4. Attach your custom domain in the hosting dashboard and point your domain's `A` / `CNAME` DNS record as instructed by the host. HTTPS SSL works automatically.

### Option B: cPanel / Hostinger Node.js hosting

1. Upload and extract the ZIP contents into a directory outside `public_html` (e.g. `portfolio-app/`).
2. Open **Setup Node.js App** in cPanel (Node 18.3+ or 20/22 LTS).
3. Set Application Startup File to `app.js` (or `server.js`), Application Mode to `Production`, and click **Run NPM Install**.
4. Add `ADMIN_PASSWORD` (and optional `OPENAI_API_KEY`) in Environment Variables (or create `.env` from `.env.example`) and restart the app.
5. If hosting under a subdirectory (e.g. `https://yourdomain.com/portfolio`), set `BASE_PATH=/portfolio`.

### Option C: VPS (Ubuntu + PM2 + Nginx + SSL)

1. Copy the extracted folder to the server (e.g. `/var/www/raian-portfolio`), run `npm ci --omit=dev`, and create `.env` from `.env.example`.
2. Start with PM2: `pm2 start deploy/ecosystem.config.cjs && pm2 save`.
3. Configure Nginx using `deploy/nginx.conf.example` with your domain name and enable free HTTPS via Certbot (`sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com`).

### Option D: Static-only hosting (no Node.js backend)

If your host only supports static HTML/CSS/JS (GitHub Pages, Netlify static, or standard shared `public_html`), upload only the contents of the `public/` directory. All animations, portrait, projects, theme switcher, and English/Bangla translation work statically; the `/admin` dashboard, SQLite contact inbox, and AI chat require a Node.js host (`server.js`).

(() => {
  'use strict';
  const BASE_PATH = (() => {
    const src = document.currentScript?.src;
    if (src) return new URL('..', src).pathname.replace(/\/+$/, '');
    return new URL('.', location.href).pathname.replace(/\/+$/, '');
  })();
  const apiUrl = endpoint => `${BASE_PATH}${endpoint}`;
  const assetUrl = url => {
    if (!url) return '';
    if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
    const clean = url.startsWith('/') ? url : `/${url}`;
    return BASE_PATH && !clean.startsWith(`${BASE_PATH}/`) ? `${BASE_PATH}${clean}` : clean;
  };
  if (!sessionStorage.getItem('portfolioVisitRecorded')) {
    sessionStorage.setItem('portfolioVisitRecorded', '1');
    fetch(apiUrl('/api/analytics/view'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: document.referrer ? 'referral' : 'direct' })
    }).catch(error => console.warn('Portfolio visit tracking failed:', error.message));
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let portfolioContent = null;

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = localizeText(value);
  }
  function setSplitHeading(selector, first, accent) {
    const heading = $(selector);
    if (!heading) return;
    const highlight = document.createElement('span');
    highlight.className = 'grad';
    highlight.textContent = localizeText(accent);
    heading.replaceChildren(document.createTextNode(localizeText(`${first} `)), highlight);
  }
  function setExternalLink(selector, url, displayText = url) {
    const link = $(selector);
    if (!link) return;
    link.hidden = !url;
    if (url) link.href = url;
    if (displayText) {
      const label = link.querySelector('span');
      if (label) label.textContent = displayText;
      else link.textContent = displayText;
    }
  }
  function driveDownloadUrl(url) {
    if (!url) return '';
    const parsed = new URL(url);
    if (parsed.hostname === 'docs.google.com') {
      const documentMatch = parsed.pathname.match(/\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([^/]+)/);
      if (documentMatch) {
        const [type, id] = documentMatch.slice(1);
        const exportPath = type === 'presentation' ? 'export/pdf' : 'export?format=pdf';
        return `https://docs.google.com/${type}/d/${encodeURIComponent(id)}/${exportPath}`;
      }
    }
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return url;
    const fileId = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || parsed.searchParams.get('id');
    return fileId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}` : url;
  }
  function renderPortfolioContent(content) {
    portfolioContent = content;
    setText('.hero-copy .eyebrow', content.hero.eyebrow);
    const heroTitle = $('.hero-copy h1');
    const name = document.createElement('span');
    name.className = 'grad';
    name.textContent = localizeText(content.hero.name);
    heroTitle.replaceChildren(document.createTextNode(localizeText('Hello, I’m ')), name);
    setText('.hero-copy .lead', content.hero.lead);
    words = (content.hero.roles.length ? content.hero.roles : ['']).map(localizeText);
    wi = 0;
    ci = 0;
    del = false;
    if (typed) typed.textContent = '';
    const navigationIds={about:'#navAbout',education:'#navEducation',skills:'#navSkills',projects:'#navProjects',creative:'#navCreative',contact:'#navContact'};
    Object.entries(content.navigation).forEach(([key,label])=>setText(navigationIds[key],label));
    setText('#heroPrimaryCTA',content.hero.primaryCta);
    setText('#heroSecondaryCTA',content.hero.secondaryCta);
    setText('#navContactCTA',content.hero.talkCta);

    setText('#about .kicker', content.about.kicker);
    setSplitHeading('#about h2', content.about.title, content.about.titleAccent);
    const aboutGrid = $('#about .about-grid > div:first-child');
    aboutGrid.replaceChildren(...content.about.paragraphs.map(text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = localizeText(text);
      return paragraph;
    }));
    const stats = $('#about .stats');
    stats.replaceChildren(...content.about.stats.map(stat => {
      const card = document.createElement('div');
      card.className = 'stat glass';
      const value = document.createElement('b');
      value.dataset.count = String(stat.value);
      if (stat.suffix) value.dataset.suffix = stat.suffix;
      value.textContent = '0';
      const label = document.createElement('small');
      label.textContent = localizeText(stat.label);
      card.append(value, label);
      return card;
    }));
    if (stats.classList.contains('in')) stats.querySelectorAll('[data-count]').forEach(animateCount);

    setText('#education .kicker', content.education.kicker);
    setSplitHeading('#education h2', content.education.title, content.education.titleAccent);
    const timeline = $('#timeline');
    const line = timeline.querySelector('.line');
    timeline.replaceChildren(line);
    content.education.entries.forEach(entry => {
      const item = document.createElement('article');
      item.className = `t-item reveal${entry.current ? ' current' : ''}`;
      const node = document.createElement('span');
      node.className = `node${entry.current ? ' pulse' : ''}`;
      const card = document.createElement('div');
      card.className = 'glass card tilt';
      card.dataset.tilt = '';
      const degree = document.createElement('span');
      degree.className = 'tag';
      degree.textContent = localizeText(entry.degree);
      const school = document.createElement('h3');
      school.textContent = localizeText(entry.school);
      const location = document.createElement('p');
      location.className = 'meta';
      location.textContent = localizeText(entry.location);
      const result = document.createElement('div');
      result.className = 'gpa';
      const score = document.createElement('b');
      score.textContent = localizeText(entry.result);
      const note = document.createElement('span');
      note.textContent = localizeText(entry.note);
      result.append(score, note);
      card.append(degree, school, location, result);
      item.append(node, card);
      timeline.append(item);
    });
    const certificateList = $('#certificateList');
    certificateList.replaceChildren(...content.education.certificates.map(certificate => {
      const card = document.createElement(certificate.url ? 'a' : 'article');
      card.className = 'certificate-card glass';
      if (certificate.url) {
        card.href = certificate.url;
        card.target = '_blank';
        card.rel = 'noopener';
      }
      const title = document.createElement('h4');
      title.textContent = localizeText(certificate.title);
      const issuer = document.createElement('p');
      issuer.textContent = localizeText(certificate.issuer);
      const date = document.createElement('small');
      date.textContent = localizeText(certificate.date);
      card.append(title, issuer, date);
      if (certificate.url) {
        const view = document.createElement('span');
        view.className = 'certificate-link';
        view.textContent = localizeText('View certificate ↗');
        card.append(view);
      }
      return card;
    }));
    $('#certificatesSection').hidden = !content.education.certificates.length;

    setText('#skills .kicker', content.skills.kicker);
    setSplitHeading('#skills h2', content.skills.title, content.skills.titleAccent);
    setText('.tab[data-tab="code"]',content.skills.programmingTab);
    setText('.tab[data-tab="creative"]',content.skills.creativeTab);
    setText('#skills .note', content.skills.note);
    [['code', content.skills.programming], ['creative', content.skills.creative]].forEach(([group, entries]) => {
      const grid = $(`#tab-${group} .skill-grid`);
      grid.replaceChildren(...entries.map(skill => {
        const card = document.createElement('div');
        card.className = 'skill glass reveal';
        const top = document.createElement('div');
        top.className = 'skill-top';
        const label = document.createElement('span');
        label.textContent = localizeText(skill.name);
        const percentage = document.createElement('em');
        percentage.dataset.pct = String(skill.level);
        percentage.textContent = '0%';
        top.append(label, percentage);
        const bar = document.createElement('div');
        bar.className = 'bar';
        const fill = document.createElement('i');
        fill.dataset.w = String(skill.level);
        bar.append(fill);
        card.append(top, bar);
        return card;
      }));
    });

    setText('#projects .kicker', content.projects.kicker);
    setSplitHeading('#projects h2', content.projects.title, content.projects.titleAccent);
    setText('#projects .lead', content.projects.description);
    setText('#projectDetailNote',content.projects.detailNote);
    setText('#story .kicker', content.process.kicker);
    setSplitHeading('#story h2', content.process.title, content.process.titleAccent);
    setText('#creative .kicker', content.creative.kicker);
    setSplitHeading('#creative h2', content.creative.title, content.creative.titleAccent);
    const creativeGrid = $('#creative .creative-grid');
    creativeGrid.replaceChildren(...content.creative.items.map(entry => {
      const card = document.createElement('article');
      card.className = 'c-card glass tilt reveal';
      card.dataset.tilt = '';
      const icon = document.createElement('div');
      icon.className = 'c-ico';
      icon.textContent = entry.icon;
      const title = document.createElement('h3');
      title.textContent = localizeText(entry.title);
      const description = document.createElement('p');
      description.textContent = localizeText(entry.description);
      card.append(icon, title, description);
      return card;
    }));

    setText('#contact .kicker', content.contact.kicker);
    setSplitHeading('#contactTitle', content.contact.title, content.contact.titleAccent);
    setText('#contact .contact-grid .lead', content.contact.description);
    setExternalLink('#heroEmail', content.contact.email ? `mailto:${content.contact.email}` : '', 'Email');
    setExternalLink('#contactEmail', content.contact.email ? `mailto:${content.contact.email}` : '', content.contact.email);
    setExternalLink('#footerEmail', content.contact.email ? `mailto:${content.contact.email}` : '', 'Email');
    setExternalLink('#heroLinkedIn', content.contact.linkedin, 'LinkedIn');
    setExternalLink('#contactLinkedIn', content.contact.linkedin, content.contact.linkedin.replace(/^https?:\/\//, ''));
    setExternalLink('#footerLinkedIn', content.contact.linkedin, 'LinkedIn');
    setExternalLink('#heroInstagram', content.contact.instagram, 'Instagram');
    setExternalLink('#contactInstagram', content.contact.instagram, content.contact.instagram.replace(/^https?:\/\//, ''));
    setExternalLink('#footerInstagram', content.contact.instagram, 'Instagram');
    setText('#contactLocation', content.contact.location);
    setText('#contactNameLabel',content.contact.nameLabel);
    setText('#contactEmailLabel',content.contact.emailLabel);
    setText('#contactSubjectLabel',content.contact.subjectLabel);
    setText('#contactMessageLabel',content.contact.messageLabel);
    setText('#sendBtn',content.contact.sendLabel);
    const emailRow = $('#contactEmail')?.closest('li');
    const linkedinRow = $('#contactLinkedIn')?.closest('li');
    const instagramRow = $('#contactInstagram')?.closest('li');
    if (emailRow) emailRow.hidden = !content.contact.email;
    if (linkedinRow) linkedinRow.hidden = !content.contact.linkedin;
    if (instagramRow) instagramRow.hidden = !content.contact.instagram;
    setText('#footerInvite', content.footer.invite);
    setText('#footerCTA', content.footer.cta);
    setText('#footerName',content.hero.name);
    const resumeSection = $('#resumeSection');
    const resumeLink = $('#resumeDownload');
    const downloadUrl = driveDownloadUrl(content.resume.url);
    resumeSection.hidden = !downloadUrl;
    setText('#resumeTitle', content.resume.title);
    resumeLink.href = downloadUrl || '#';
    resumeLink.textContent = localizeText(content.resume.label);
    resumeLink.setAttribute('download', '');

    if (io) {
      $$('.reveal:not(.in)').forEach(element => io.observe(element));
      observeSkills();
    }
  }

  function loadPortfolioSettings() {
    fetch(apiUrl('/api/portfolio/settings'), { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return response.json();
    })
    .then(settings => {
      if (settings.portraitImageUrl) {
        $$('.portrait img').forEach(image => { image.src = assetUrl(settings.portraitImageUrl); });
      }
    })
      .catch(error => console.warn('Portfolio settings could not be loaded:', error.message));
  }
  loadPortfolioSettings();

  /* ---------- Preloader ---------- */
  document.body.classList.add('loading');
  let pct = 0;
  const fill = $('#preFill'), txt = $('#preText');
  const tick = setInterval(() => {
    pct = Math.min(100, pct + Math.random() * 5 + 2);
    if (fill) fill.style.width = pct + '%';
    if (txt) txt.textContent = Math.floor(pct) + '%';
    if (pct >= 100) { clearInterval(tick); setTimeout(finishLoad, 300); }
  }, 70);
  function finishLoad() {
    $('#preloader').classList.add('done');
    document.body.classList.remove('loading');
    startReveals();
  }

  /* ---------- Particle network background ---------- */
  const canvas = $('#bg-canvas'), ctx = canvas?.getContext('2d');
  let W = 0, H = 0, dots = [], mouse = { x: -999, y: -999 };
  let backgroundFrame = 0, resizeFrame = 0, lastDrawAt = 0;
  function size() {
    if (!canvas || !ctx) return;
    W = innerWidth;
    H = innerHeight;
    const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * pixelRatio);
    canvas.height = Math.round(H * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const n = Math.max(18, Math.min(fine ? 72 : 36, Math.floor(W * H / (fine ? 26000 : 32000))));
    dots = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: Math.random() * 1.6 + .6
    }));
  }
  addEventListener('resize', () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; size(); });
  }, { passive: true });
  size();
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  function draw(time) {
    backgroundFrame = 0;
    if (reduce || document.hidden || !ctx) return;
    const frameScale = lastDrawAt ? Math.min((time - lastDrawAt) / 16.67, 2) : 1;
    lastDrawAt = time;
    ctx.clearRect(0, 0, W, H);
    for (const p of dots) {
      p.x += p.vx * frameScale; p.y += p.vy * frameScale;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > 0 && distanceSquared < 14400) {
        const distance = Math.sqrt(distanceSquared);
        p.x += dx / distance * 1.2 * frameScale;
        p.y += dy / distance * 1.2 * frameScale;
      }
      ctx.fillStyle = 'rgba(41,211,145,.7)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      const a = dots[i], b = dots[j], dx = a.x - b.x, dy = a.y - b.y, distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < 16900) {
        const distance = Math.sqrt(distanceSquared);
        ctx.strokeStyle = `rgba(41,211,145,${(1 - distance / 130) * .30})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    backgroundFrame = requestAnimationFrame(draw);
  }
  function startBackground() {
    if (!reduce && !document.hidden && ctx && !backgroundFrame) {
      backgroundFrame = requestAnimationFrame(draw);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(backgroundFrame);
      backgroundFrame = 0;
      lastDrawAt = 0;
    } else {
      startBackground();
    }
  });
  if (!reduce) {
    startBackground();
  }

  /* ---------- Nav, progress, back-to-top ---------- */
  const nav = $('#nav'), prog = $('#progress'), toTop = $('#toTop'), fillLine = $('#lineFill'), tl = $('#timeline');
  const links = $$('#menu a'), sections = links.map(a => $(a.getAttribute('href')));
  let scrollFrame = 0;
  function updateScrollState() {
    scrollFrame = 0;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, y / max)) : 0})`;
    nav.classList.toggle('scrolled', y > 40);
    toTop.classList.toggle('show', y > 600);
    const mid = y + innerHeight / 3;
    sections.forEach((s, i) => links[i].classList.toggle('active', s.offsetTop <= mid && s.offsetTop + s.offsetHeight > mid));
    if (tl) {
      const r = tl.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * .6 - r.top) / r.height));
      fillLine.style.height = (p * 100) + '%';
    }
    $$('.hero-visual .portrait').forEach(el => el.style.translate = `0 ${Math.min(y, 600) * -.05}px`);
  }
  function onScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollState);
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  toTop.onclick = () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });

  const burger = $('#burger'), menu = $('#menu');
  burger.onclick = () => {
    const o = menu.classList.toggle('open');
    burger.classList.toggle('open', o); burger.setAttribute('aria-expanded', o);
  };
  links.forEach(a => a.addEventListener('click', () => { menu.classList.remove('open'); burger.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }));

  /* ---------- Contact side panel ---------- */
  const contactPanel = $('#contact');
  let contactLastFocus = null, contactCloseTimer;
  function openContact(trigger) {
    clearTimeout(contactCloseTimer);
    contactPanel.classList.remove('is-closing');
    contactLastFocus = trigger;
    if (!contactPanel.open) contactPanel.showModal();
    $('#contactClose').focus();
    document.body.classList.add('contact-open');
  }
  function closeContact() {
    if (!contactPanel.open) return;
    contactPanel.classList.add('is-closing');
    contactCloseTimer = setTimeout(() => {
      if (contactPanel.open) contactPanel.close();
    }, 420);
  }
  contactPanel.addEventListener('close', () => {
    clearTimeout(contactCloseTimer);
    contactPanel.classList.remove('is-closing');
    document.body.classList.remove('contact-open');
    if (contactLastFocus && contactLastFocus.isConnected) contactLastFocus.focus();
  });
  contactPanel.addEventListener('click', e => { if (e.target === contactPanel) closeContact(); });
  $('#contactClose').addEventListener('click', closeContact);
  $$('a[href="#contact"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    openContact(a);
  }));

  /* ---------- Typing effect ---------- */
  let words = ['Software Development Student', 'Web Application Developer', 'C++ & JavaScript Programmer', 'Videographer', 'Photographer', 'Video Editor'];
  const typed = $('#typed'); let wi = 0, ci = 0, del = false;
  if (typed && words.length) {
    if (reduce) {
      typed.textContent = words[0];
    } else {
      (function type() {
        const w = words[wi];
        typed.textContent = w.slice(0, ci += del ? -1 : 1);
        let t = del ? 40 : 85;
        if (!del && ci === w.length) { del = true; t = 1400; }
        else if (del && ci === 0) { del = false; wi = (wi + 1) % words.length; t = 300; }
        setTimeout(type, t);
      })();
    }
  }

  /* ---------- Reveal, counters, skill bars ---------- */
  function animateCount(el) {
    const target = +el.dataset.count, suf = el.dataset.suffix || '', t0 = performance.now(), dur = 1500;
    if (reduce) { el.textContent = target + suf; return; }
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))) + suf;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function animateBar(card) {
    const i = $('i[data-w]', card), em = $('em[data-pct]', card);
    if (!i || !em || i.dataset.done) return;
    i.dataset.done = 1;
    const target = +em.dataset.pct, t0 = performance.now();
    i.style.width = i.dataset.w + '%';
    if (reduce) { em.textContent = target + '%'; return; }
    (function step(t) {
      const k = Math.min(1, (t - t0) / 1600);
      em.textContent = Math.round(target * k) + '%';
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  let io;
  function startReveals() {
    io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $$('[data-count]', e.target).forEach(animateCount);
      if (e.target.classList.contains('skill')) animateBar(e.target);
      io.unobserve(e.target);
    }), { threshold: .15 });
    $$('.reveal').forEach((el, i) => { el.style.setProperty('--d', (i % 4) * .08 + 's'); io.observe(el); });
    observeSkills();
  }
  function observeSkills() { $$('.skill-panel.active .skill').forEach(s => io.observe(s)); }

  /* ---------- Skill tabs ---------- */
  $$('.tab').forEach(btn => btn.onclick = () => {
    $$('.tab').forEach(b => b.classList.toggle('active', b === btn));
    $$('.skill-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
    $$('.skill-panel.active .skill').forEach(s => { s.classList.add('in'); animateBar(s); });
  });

  /* ---------- Scroll-driven project showcase ---------- */
  const projectVisuals = $$('[data-project-visual]');
  let projectObserver = null;
  function activateProject(index) {
    $$('.project-step').forEach(step => step.classList.toggle('is-active', step.dataset.projectStep === String(index)));
    const visualIndex = Math.min(Number(index), projectVisuals.length - 1);
    projectVisuals.forEach(visual => visual.classList.toggle('is-active', visual.dataset.projectVisual === String(visualIndex)));
  }
  if (projectVisuals.length) {
    projectObserver = new IntersectionObserver(entries => {
      const current = entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (current) activateProject(current.target.dataset.projectStep);
    }, { rootMargin: '-35% 0px -35% 0px', threshold: [0, .25, .5, .75] });
    $$('.project-step').forEach(step => projectObserver.observe(step));
  }

  /* ---------- Scroll showcase ---------- */
  const storySection = $('#story'), storySlides = $$('.story-slide'), storyVisuals = $$('.story-visual');
  let loadedStorySteps = null;
  function renderStorySteps() {
    if (!loadedStorySteps) return;
    loadedStorySteps.forEach((step, index) => {
      const slide = storySlides[index];
      if (!slide) return;
      $('[data-story-title]', slide).textContent = localizeText(step.title);
      $('[data-story-description]', slide).textContent = localizeText(step.description);
    });
  }
  if (storySection && storySlides.length) {
    const activateStory = index => {
      storySlides.forEach(slide => slide.classList.toggle('is-active', slide.dataset.storySlide === String(index)));
      storyVisuals.forEach(visual => visual.classList.toggle('is-active', visual.dataset.storyVisual === String(index)));
    };
    addEventListener('scroll', () => {
      const rect = storySection.getBoundingClientRect();
      const distance = Math.max(1, rect.height - innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / distance));
      activateStory(Math.min(storySlides.length - 1, Math.floor(progress * storySlides.length)));
    }, { passive: true });
  }
  function loadPortfolioSteps() {
    fetch(apiUrl('/api/portfolio/steps'), { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data.steps) || data.steps.length !== 3) {
        throw new Error('The portfolio steps response is invalid.');
      }
      if (data.steps.some(step => !step.title || !step.description)) {
          throw new Error('A portfolio step is missing required content.');
      }
      loadedStorySteps = data.steps;
      renderStorySteps();
    })
      .catch(error => console.warn('Portfolio steps could not be loaded:', error.message));
  }
  loadPortfolioSteps();

  /* ---------- 3D tilt, glow, magnetic buttons, cursor ---------- */
  if (fine && !reduce) {
    document.addEventListener('mousemove', e => {
      if (!(e.target instanceof Element)) return;
      const el = e.target.closest('[data-tilt], .glass');
      if (!el) return;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const academicCard = el.matches('.card.tilt');
      const depth = academicCard ? 14 : 0;
      const tiltX = academicCard ? 20 : 10;
      const tiltY = academicCard ? 24 : 12;
      el.style.transform = `perspective(900px) rotateX(${(.5 - y) * tiltX}deg) rotateY(${(x - .5) * tiltY}deg) translateZ(${depth}px)`;
      el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%');
    });
    document.addEventListener('mouseout', e => {
      if (!(e.target instanceof Element)) return;
      const el = e.target.closest('[data-tilt], .glass');
      if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
    });
    $$('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .25}px,${(e.clientY - r.top - r.height / 2) * .35}px)`;
      });
      el.addEventListener('mouseleave', () => el.style.transform = '');
    });
    const c = $('#cursor'), d = $('#cursorDot'); let cx = 0, cy = 0, tx = 0, ty = 0, cursorFrame = 0;
    function followCursor() {
      cursorFrame = 0;
      cx += (tx - cx) * .2;
      cy += (ty - cy) * .2;
      c.style.setProperty('--cursor-x', `${cx}px`);
      c.style.setProperty('--cursor-y', `${cy}px`);
      if (Math.abs(tx - cx) > .2 || Math.abs(ty - cy) > .2) cursorFrame = requestAnimationFrame(followCursor);
    }
    addEventListener('mousemove', e => {
      tx = e.clientX; ty = e.clientY;
      c.classList.add('on'); d.classList.add('on');
      d.style.transform = `translate(${tx - 3}px,${ty - 3}px)`;
      if (!cursorFrame) cursorFrame = requestAnimationFrame(followCursor);
    });
    document.addEventListener('mouseleave', () => { c.classList.remove('on', 'hover'); d.classList.remove('on'); });
    document.addEventListener('mouseover', e => c.classList.toggle('hover', !!e.target.closest('a,button,.project,input,textarea')));
  }

  /* ---------- Project modal ---------- */
  const projects = [
    { t: 'DevFlow', tag: 'JavaScript · UI', d: 'A developer workflow dashboard concept for managing tasks, deployments, and team activity.', l: ['Task boards and deployment status', 'Team activity feed', 'A clear, efficient interface'] },
    { t: 'Synth AI', tag: 'AI · Node.js', d: 'An AI assistant interface concept designed around clear conversations and practical tools.', l: ['Conversation-focused layout', 'Practical tools panel', 'English and Bangla support'] },
    { t: 'Nexus Stack', tag: 'SQL · Architecture', d: 'A full-stack architecture concept connecting APIs, databases, and a responsive front end.', l: ['REST API layer', 'Relational database design', 'Responsive front end'] },
    { t: 'Frame Story', tag: 'Premiere · 4K', d: 'A cinematic storytelling concept focused on 4K video and photography.', l: ['4K video workflow', 'Colour grading in Lightroom', 'Motion graphics in After Effects'] },
    { t: 'Matrix Core', tag: 'C++ · Systems', d: 'A systems programming concept exploring performance and low-level C++ engineering.', l: ['Low-level performance concepts', 'Memory-aware data structures', 'Benchmark-driven development'] }
  ];
  const modal = $('#modal'); let lastFocus;
  function localizeText(text) {
    return translatePortfolioText(text);
  }
  const openModal = i => {
    const p = projects[i]; lastFocus = document.activeElement;
    if (!p) return;
    $('#mTag').textContent = localizeText(p.tag); $('#mTitle').textContent = localizeText(p.t); $('#mText').textContent = localizeText(p.d);
    $('#mList').replaceChildren(...p.l.map(x => Object.assign(document.createElement('li'), { textContent: localizeText(x) })));
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); $('#mClose').focus();
  };
  const closeModal = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); lastFocus?.focus(); };
  $$('.project').forEach(el => {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.onclick = () => openModal(+el.dataset.project);
    el.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(+el.dataset.project);
      }
    };
  });
  $('#mClose').onclick = closeModal;
  modal.onclick = e => { if (e.target === modal) closeModal(); };
  addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (contactPanel.open) {
      event.preventDefault();
      closeContact();
    }
    if (modal.classList.contains('open')) closeModal();
    setChatOpen(false);
  });
  function loadPortfolioProjects() {
    fetch(apiUrl('/api/portfolio/projects'), { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data.projects)) throw new Error('The projects response is invalid.');
      const customProjects = data.projects;
      const list = $('.project-list');
      if (!list) return;
      list.replaceChildren();
      projects.splice(0, projects.length);
      customProjects.forEach(project => {
        const index = projects.length;
        const tags = String(project.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
        const article = document.createElement('article');
        article.className = 'project project-step glass reveal';
        article.dataset.project = String(index);
        article.dataset.projectStep = String($$('.project-step').length);
        article.innerHTML = `<span class="num">${String(index + 1).padStart(2, '0')}</span><h3></h3><p></p><div class="tags"></div><span class="project-open" aria-hidden="true">↗</span>`;
        article.querySelector('h3').textContent = localizeText(project.title);
        article.querySelector('p').textContent = localizeText(project.description);
        article.querySelector('.tags').replaceChildren(...tags.map(tag => Object.assign(document.createElement('span'), { textContent: localizeText(tag) })));
        if (project.image_url) {
          const safeBgUrl = assetUrl(project.image_url).replace(/"/g, '%22');
          article.style.backgroundImage = `linear-gradient(145deg,rgba(9,12,10,.55),rgba(9,12,10,.92)),url("${safeBgUrl}")`;
          article.style.backgroundSize = 'cover';
          article.style.backgroundPosition = 'center';
        }
        if (project.demo_url) {
          const link=document.createElement('a');link.className='project-open';link.href=project.demo_url;link.target='_blank';link.rel='noopener';
          link.setAttribute('aria-label',`Open ${project.title}`);link.textContent='↗';link.addEventListener('click',event=>event.stopPropagation());
          link.addEventListener('keydown',event=>event.stopPropagation());article.querySelector('.project-open').replaceWith(link);
        }
        article.tabIndex = 0;
        article.setAttribute('role', 'button');
        article.onclick = () => openModal(index);
        article.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openModal(index);
          }
        };
        list.append(article);
        projects.push({
          t: project.title,
          tag: tags.join(' · ') || 'Portfolio project',
          d: project.description,
          l: tags.length ? tags : ['Portfolio project']
        });
      });
      const projectCount = $('#projectCount');
      if (projectCount) {
        projectCount.dataset.count = String(projects.length);
        if (projectCount.closest('.reveal')?.classList.contains('in')) {
          projectCount.textContent = String(projects.length);
        }
      }
      $$('.project-step').forEach((step, i) => {
        step.dataset.projectStep = String(i);
      });
      $('#projectPreview').hidden = !customProjects.length;
      if (projectObserver) {
        projectObserver.disconnect();
        $$('.project-step').forEach(step => projectObserver.observe(step));
        if (customProjects.length) activateProject(0);
      }
      if (io) $$('.project-step.reveal').forEach(step => io.observe(step));
    })
      .catch(error => console.warn('Portfolio projects could not be loaded:', error.message));
  }
  loadPortfolioProjects();

  /* ---------- Contact form ---------- */
  const form = $('#contactForm'), msg = $('#formMsg'), btn = $('#sendBtn');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    msg.className = 'form-msg'; msg.textContent = '';
    if (data.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.message.trim().length < 10) {
      msg.classList.add('err'); msg.textContent = localizeText('Please provide your name, a valid email address, and a message of at least 10 characters.'); return;
    }
    btn.disabled = true; btn.textContent = localizeText('Sending…');
    try {
      const r = await fetch(apiUrl('/api/contact'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      msg.classList.add(r.ok ? 'ok' : 'err'); msg.textContent = localizeText(j.message || (r.ok ? 'Message sent successfully.' : 'Something went wrong.'));
      if (r.ok) form.reset();
    } catch { msg.classList.add('err'); msg.textContent = localizeText('Network error. Please try again.'); }
    btn.disabled = false; btn.textContent = localizeText('Send message');
  });

  /* ---------- AI chat ---------- */
  const chat = $('#chat'), chatFab = $('#chatFab'), log = $('#chatLog'), history = [];
  function setChatOpen(open) {
    chat.classList.toggle('open', open);
    chat.setAttribute('aria-hidden', String(!open));
    chat.toggleAttribute('inert', !open);
    chatFab.setAttribute('aria-expanded', String(open));
    if (open) $('#chatInput').focus();
    else if (chat.contains(document.activeElement)) chatFab.focus();
  }
  chatFab.onclick = () => setChatOpen(!chat.classList.contains('open'));
  $('#chatClose').onclick = () => setChatOpen(false);
  const addMsg = (cls, text) => { const m = Object.assign(document.createElement('div'), { className: 'msg ' + cls, textContent: text }); log.append(m); log.scrollTop = log.scrollHeight; return m; };
  $('#chatForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#chatInput'), text = input.value.trim(); if (!text) return;
    input.value = ''; addMsg('user', text); history.push({ role: 'user', content: text });
    const wait = addMsg('bot', '…');
    try {
      const r = await fetch(apiUrl('/api/chat'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-8) }) });
      const j = await r.json().catch(() => ({}));
      wait.textContent = j.reply || localizeText(j.message || 'No reply.');
      if (j.reply) history.push({ role: 'assistant', content: j.reply });
    } catch { wait.textContent = localizeText('Could not reach the server.'); }
  });

  $$('.portrait img').forEach(img => { const rm = () => img.remove(); img.addEventListener('error', rm); if (img.complete && !img.naturalWidth) rm(); });


  /* ---------- Theme + English/Bangla language ---------- */
  const themeToggle = $('#themeToggle'), languageToggle = $('#languageToggle');
  const translations = {
    'nav': ['About','Education','Skills','Projects','Creative','Contact'],
    'bnNav': ['পরিচিতি','শিক্ষা','দক্ষতা','প্রজেক্ট','সৃজনশীল কাজ','যোগাযোগ'],
    'text': {
      'About':'পরিচিতি','Education':'শিক্ষা','Skills':'দক্ষতা','Projects':'প্রজেক্ট','Creative':'সৃজনশীল কাজ','Contact':'যোগাযোগ',
      'Software Development & Visual Media':'সফটওয়্যার ডেভেলপমেন্ট ও ভিজ্যুয়াল মিডিয়া',
      'Hello, I’m ':'হ্যালো, আমি ',
      'I am a software development student and visual storyteller based in Dhaka, Bangladesh. I build responsive web applications and create polished visual content, combining technical problem-solving with thoughtful design.':'আমি ঢাকায় বসবাসকারী সফটওয়্যার ডেভেলপমেন্টের শিক্ষার্থী ও ভিজ্যুয়াল স্টোরিটেলার। প্রযুক্তিগত সমস্যা সমাধান ও চিন্তাশীল ডিজাইনের সমন্বয়ে রেসপনসিভ ওয়েব অ্যাপ্লিকেশন এবং পরিশীলিত ভিজ্যুয়াল কনটেন্ট তৈরি করি।',
      'Thoughtful code. ':'চিন্তাশীল কোড। ',
      'Purposeful visuals.':'উদ্দেশ্যপূর্ণ ভিজ্যুয়াল।',
      'I am currently studying at Daffodil International University, where I am developing skills in software development and digital media. My interests include JavaScript and C++ development, SQL databases, interface design, photography, and video production.':'আমি বর্তমানে ড্যাফোডিল ইন্টারন্যাশনাল ইউনিভার্সিটিতে পড়াশোনা করছি এবং সফটওয়্যার ডেভেলপমেন্ট ও ডিজিটাল মিডিয়ায় দক্ষতা অর্জন করছি। JavaScript ও C++ ডেভেলপমেন্ট, SQL ডেটাবেস, ইন্টারফেস ডিজাইন, ফটোগ্রাফি এবং ভিডিও প্রোডাকশনে আমার আগ্রহ রয়েছে।',
      'I value clear requirements, maintainable code, reliable performance, and thoughtful visual design. I enjoy applying these principles to practical projects and collaborative work.':'আমি স্পষ্ট চাহিদা, রক্ষণাবেক্ষণযোগ্য কোড, নির্ভরযোগ্য পারফরম্যান্স এবং চিন্তাশীল ভিজ্যুয়াল ডিজাইনকে গুরুত্ব দিই। বাস্তবধর্মী প্রজেক্ট ও দলগত কাজে এসব নীতি প্রয়োগ করতে ভালো লাগে।',
      'Portfolio projects':'পোর্টফোলিও প্রজেক্ট',
      'Academic distinction':'শিক্ষাগত কৃতিত্ব',
      'Currently enrolled':'বর্তমানে অধ্যয়নরত',
      'Technical and ':'প্রযুক্তিগত ও ',
      'creative skills':'সৃজনশীল দক্ষতা',
      'I continue to expand my knowledge of programming languages and tools.':'প্রোগ্রামিং ভাষা ও টুল সম্পর্কে আমার জ্ঞান নিয়মিত বাড়িয়ে চলেছি।',
      'Projects exploring product design, AI, software architecture, and visual storytelling. Each project is labeled with its current status.':'প্রোডাক্ট ডিজাইন, AI, সফটওয়্যার আর্কিটেকচার এবং ভিজ্যুয়াল স্টোরিটেলিং নিয়ে প্রজেক্ট। প্রতিটি প্রজেক্টের বর্তমান অবস্থা উল্লেখ করা হয়েছে।',
      'A developer workflow dashboard concept for managing tasks, deployments, and team activity.':'কাজ, ডিপ্লয়মেন্ট এবং দলের কার্যক্রম পরিচালনার জন্য ডেভেলপার ওয়ার্কফ্লো ড্যাশবোর্ডের ধারণা।',
      'An AI assistant interface concept designed around clear conversations and practical tools.':'স্পষ্ট কথোপকথন ও ব্যবহারিক টুলকে কেন্দ্র করে তৈরি AI সহকারী ইন্টারফেসের ধারণা।',
      'A full-stack architecture concept connecting APIs, databases, and a responsive front end.':'API, ডেটাবেস এবং রেসপনসিভ ফ্রন্টএন্ড সংযুক্ত করা ফুল-স্ট্যাক আর্কিটেকচারের ধারণা।',
      'A cinematic storytelling concept focused on 4K video and photography.':'4K ভিডিও ও ফটোগ্রাফিনির্ভর সিনেম্যাটিক স্টোরিটেলিংয়ের ধারণা।',
      'A systems programming concept exploring performance and low-level C++ engineering.':'পারফরম্যান্স ও লো-লেভেল C++ ইঞ্জিনিয়ারিং নিয়ে সিস্টেমস প্রোগ্রামিংয়ের ধারণা।',
      'Task boards and deployment status':'টাস্ক বোর্ড ও ডিপ্লয়মেন্টের অবস্থা',
      'Team activity feed':'দলের কার্যক্রমের ফিড',
      'A clear, efficient interface':'পরিষ্কার ও কার্যকর ইন্টারফেস',
      'Conversation-focused layout':'কথোপকথনকেন্দ্রিক লেআউট',
      'Practical tools panel':'ব্যবহারিক টুল প্যানেল',
      'English and Bangla support':'ইংরেজি ও বাংলা সমর্থন',
      'REST API layer':'REST API স্তর',
      'Relational database design':'রিলেশনাল ডেটাবেস ডিজাইন',
      'Responsive front end':'রেসপনসিভ ফ্রন্টএন্ড',
      '4K video workflow':'4K ভিডিও ওয়ার্কফ্লো',
      'Colour grading in Lightroom':'Lightroom-এ কালার গ্রেডিং',
      'Motion graphics in After Effects':'After Effects-এ মোশন গ্রাফিক্স',
      'Low-level performance concepts':'লো-লেভেল পারফরম্যান্স ধারণা',
      'Memory-aware data structures':'মেমোরি-সচেতন ডেটা স্ট্রাকচার',
      'Benchmark-driven development':'বেঞ্চমার্কনির্ভর ডেভেলপমেন্ট',
      '05 — Process':'০৫ — কাজের প্রক্রিয়া',
      'From idea to ':'ধারণা থেকে ',
      'impact':'বাস্তব প্রভাব',
      'Think with clarity':'স্পষ্টভাবে ভাবুন',
      'I break complex ideas into practical systems, clear requirements, and focused user experiences.':'জটিল ধারণাকে ব্যবহারিক সিস্টেম, স্পষ্ট চাহিদা এবং ব্যবহারকারীকেন্দ্রিক অভিজ্ঞতায় রূপ দিই।',
      'Build with precision':'নির্ভুলভাবে তৈরি করুন',
      'I connect front-end, APIs, and databases with clean code, reliable architecture, and useful interactions.':'পরিচ্ছন্ন কোড, নির্ভরযোগ্য আর্কিটেকচার এবং কার্যকর ইন্টারঅ্যাকশনের মাধ্যমে ফ্রন্টএন্ড, API ও ডেটাবেস সংযুক্ত করি।',
      'Create lasting polish':'পরিশীলিতভাবে সম্পন্ন করুন',
      'I finish every project with thoughtful motion, visual storytelling, and attention to the smallest details.':'চিন্তাশীল মোশন, ভিজ্যুয়াল স্টোরিটেলিং এবং সূক্ষ্ম বিষয়ের প্রতি মনোযোগ দিয়ে প্রতিটি প্রজেক্ট সম্পন্ন করি।',
      '06 — Creative':'০৬ — সৃজনশীল কাজ',
      'I produce 4K videos with an emphasis on lighting, motion, and storytelling.':'আলো, গতি ও গল্প বলার ওপর গুরুত্ব দিয়ে আমি 4K ভিডিও তৈরি করি।',
      'I capture portraits, locations, and moments with a consistent visual style.':'একটি সামঞ্জস্যপূর্ণ ভিজ্যুয়াল স্টাইলে আমি পোর্ট্রেট, স্থান ও মুহূর্ত ধারণ করি।',
      'I edit video in Premiere Pro, create motion graphics in After Effects, and grade colour in Lightroom.':'আমি Premiere Pro-তে ভিডিও সম্পাদনা, After Effects-এ মোশন গ্রাফিক্স তৈরি এবং Lightroom-এ রঙের কাজ করি।',
      'I design interfaces and layouts in Figma using consistent visual systems.':'সামঞ্জস্যপূর্ণ ভিজ্যুয়াল সিস্টেম ব্যবহার করে আমি Figma-তে ইন্টারফেস ও লেআউট ডিজাইন করি।',
      '4K video production with an emphasis on lighting, motion, and narrative.':'আলো, গতি ও গল্প বলার ওপর গুরুত্ব দিয়ে 4K ভিডিও প্রোডাকশন।',
      'Portraits, locations, and moments captured with a consistent visual approach.':'সামঞ্জস্যপূর্ণ ভিজ্যুয়াল পদ্ধতিতে পোর্ট্রেট, স্থান ও মুহূর্ত ধারণ।',
      'Video editing in Premiere Pro, motion graphics in After Effects, and colour work in Lightroom.':'Premiere Pro-তে ভিডিও এডিটিং, After Effects-এ মোশন গ্রাফিক্স এবং Lightroom-এ কালার কাজ।',
      'Interfaces and layouts designed in Figma using consistent visual systems.':'সামঞ্জস্যপূর্ণ ভিজ্যুয়াল সিস্টেমে Figma দিয়ে ইন্টারফেস ও লেআউট ডিজাইন।',
      '07 — Contact':'০৭ — যোগাযোগ',
      'For professional inquiries, project opportunities, or collaboration proposals, please send a message. Submissions are delivered to the private admin inbox.':'পেশাগত যোগাযোগ, প্রজেক্টের সুযোগ বা যৌথভাবে কাজের প্রস্তাবের জন্য বার্তা পাঠান। বার্তাটি ব্যক্তিগত অ্যাডমিন ইনবক্সে পৌঁছাবে।',
      'Discuss an opportunity':'কাজের সুযোগ নিয়ে আলোচনা করুন',
      'Have a project, idea or collaboration in mind?':'কোনো প্রজেক্ট, ধারণা বা যৌথ কাজের পরিকল্পনা আছে?',
      'Project details are provided for context. Contact me to discuss implementation.':'প্রজেক্টের বিবরণ ধারণা দেওয়ার জন্য উল্লেখ করা হয়েছে। বাস্তবায়ন নিয়ে আলোচনা করতে যোগাযোগ করুন।',
      'Welcome. I am Raian’s AI assistant. Ask me about his skills, education, or projects in English or Bangla.':'স্বাগতম। আমি Raian-এর AI সহকারী। তাঁর দক্ষতা, শিক্ষা বা প্রজেক্ট সম্পর্কে বাংলা বা ইংরেজিতে জিজ্ঞাসা করুন।',
      'Please provide your name, a valid email address, and a message of at least 10 characters.':'আপনার নাম, সঠিক ইমেইল ঠিকানা এবং কমপক্ষে ১০ অক্ষরের বার্তা লিখুন।',
      'Sending…':'পাঠানো হচ্ছে…',
      'Message sent successfully.':'বার্তাটি সফলভাবে পাঠানো হয়েছে।',
      'Message received. Thank you for reaching out!':'বার্তা পেয়েছি। যোগাযোগ করার জন্য ধন্যবাদ!',
      'Please enter a name with at least 2 characters.':'কমপক্ষে ২ অক্ষরের একটি নাম লিখুন।',
      'Please enter a valid email address.':'একটি সঠিক ইমেইল ঠিকানা লিখুন।',
      'Please write a message with at least 10 characters.':'কমপক্ষে ১০ অক্ষরের একটি বার্তা লিখুন।',
      'Too many messages from this connection. Please try again later.':'এই সংযোগ থেকে অনেক বার্তা পাঠানো হয়েছে। পরে আবার চেষ্টা করুন।',
      'The message could not be saved. Please try again later.':'বার্তাটি সংরক্ষণ করা যায়নি। পরে আবার চেষ্টা করুন।',
      'Something went wrong.':'একটি সমস্যা হয়েছে।',
      'Network error. Please try again.':'নেটওয়ার্ক সমস্যা হয়েছে। আবার চেষ্টা করুন।',
      'No reply.':'কোনো উত্তর পাওয়া যায়নি।',
      'Could not reach the server.':'সার্ভারের সঙ্গে সংযোগ করা যায়নি।',
      'Available for projects':'প্রজেক্টের জন্য যোগাযোগ করতে পারেন',
      'Software Development Student':'সফটওয়্যার ডেভেলপমেন্টের শিক্ষার্থী',
      'Web Application Developer':'ওয়েব অ্যাপ্লিকেশন ডেভেলপার',
      'C++ & JavaScript Programmer':'C++ ও JavaScript প্রোগ্রামার',
      'Videographer':'ভিডিওগ্রাফার',
      'Videography':'ভিডিওগ্রাফি',
      'Photographer':'ফটোগ্রাফার',
      'Photography':'ফটোগ্রাফি',
      'Video Editor':'ভিডিও এডিটর',
      'Post-production':'পোস্ট-প্রোডাকশন',
      'Interface design':'ইন্টারফেস ডিজাইন',
      "Hi, I'm ":'হ্যালো, আমি ',
      'I am a ':'আমি একজন ',
      'Software engineer, full‑stack developer and visual storyteller from Dhaka, Bangladesh — building fast web products and cinematic visuals with the same attention to detail.':'আমি ঢাকার একজন সফটওয়্যার ইঞ্জিনিয়ার, ফুল-স্ট্যাক ডেভেলপার ও ভিজ্যুয়াল স্টোরিটেলার। যত্ন ও নিখুঁততার সঙ্গে দ্রুত ওয়েব পণ্য এবং সিনেম্যাটিক ভিজ্যুয়াল তৈরি করি।',
      'View my work':'আমার কাজ দেখুন','Contact me':'যোগাযোগ করুন',"Let's talk":'কথা বলুন',
      '01 — About':'০১ — পরিচিতি','Code that works. ':'কার্যকর কোড। ','Visuals that move.':'প্রাণবন্ত ভিজ্যুয়াল।',
      "I'm a student of Daffodil International University who loves where engineering and storytelling meet. I write software in several languages, design interfaces, shoot and edit videos, and take photographs — and I enjoy bringing all of it together in one project.":'আমি ড্যাফোডিল ইন্টারন্যাশনাল ইউনিভার্সিটির একজন শিক্ষার্থী। ইঞ্জিনিয়ারিং ও গল্প বলার মেলবন্ধন ভালোবাসি। বিভিন্ন প্রোগ্রামিং ভাষায় কাজ করি, ইন্টারফেস ডিজাইন করি, ভিডিও ধারণ ও সম্পাদনা করি এবং ছবি তুলি—এসব একসঙ্গে একটি প্রজেক্টে নিয়ে আসতে ভালো লাগে।',
      'Whether it\'s a backend API, a smooth interface or a cinematic edit, I care about clean structure, good performance and polish.':'ব্যাকএন্ড API, সাবলীল ইন্টারফেস কিংবা সিনেম্যাটিক এডিট—সব ক্ষেত্রেই পরিচ্ছন্ন গঠন, ভালো পারফরম্যান্স ও নিখুঁত কাজকে গুরুত্ব দিই।',
      'Three GPA 5.00 scores':'তিনটি পরীক্ষায় জিপিএ ৫.০০','GPA 5.00 in three exams':'তিনটি পরীক্ষায় জিপিএ ৫.০০','Three GPA 5.00 results':'তিনটি পরীক্ষায় জিপিএ ৫.০০','Perfect GPA 5 results':'জিপিএ ৫ অর্জন','Concept projects':'ধারণাভিত্তিক প্রজেক্ট','Tools & technologies':'টুলস ও প্রযুক্তি','Video quality':'ভিডিওর মান',
      '02 — Education':'০২ — শিক্ষা','Academic ':'শিক্ষাজীবনের ','journey':'অগ্রযাত্রা','Primary Education Completion (PEC)':'প্রাথমিক শিক্ষা সমাপন (PEC)','Secondary School Certificate (SSC)':'মাধ্যমিক সার্টিফিকেট (এসএসসি)','Higher Secondary Certificate (HSC)':'উচ্চমাধ্যমিক সার্টিফিকেট (এইচএসসি)','University · Currently studying':'বিশ্ববিদ্যালয় · অধ্যয়নরত','Golden start':'সোনালি শুরু','Perfect score':'সর্বোচ্চ ফলাফল','Learning every day':'প্রতিদিন শিখছি',
      '03 — Skills':'০৩ — দক্ষতা','What I ':'আমি যা ','can do':'করতে পারি','Programming':'প্রোগ্রামিং','Creative':'সৃজনশীলতা','…and more languages and tools that I keep learning.':'…এছাড়াও নতুন ভাষা ও টুলস নিয়মিত শিখছি।',
      '04 — Projects':'০৪ — প্রজেক্ট','Selected ':'নির্বাচিত ','concepts':'ধারণা','Five concept projects exploring product design, AI, infrastructure and storytelling.':'প্রোডাক্ট ডিজাইন, AI, অবকাঠামো ও গল্প বলার ধারণা নিয়ে পাঁচটি কনসেপ্ট প্রজেক্ট।',
      'A developer workflow dashboard concept for tasks, deployments and team activity.':'কাজ, ডিপ্লয়মেন্ট ও টিম কার্যক্রম পরিচালনার ডেভেলপার ড্যাশবোর্ডের ধারণা।','An AI assistant interface concept focused on clear conversation and smart tools.':'সহজ কথোপকথন ও স্মার্ট টুলকেন্দ্রিক AI সহকারীর ইন্টারফেস ধারণা।','A full-stack architecture concept connecting APIs, databases and a fast front end.':'API, ডেটাবেস ও দ্রুত ফ্রন্টএন্ড যুক্ত করা ফুল-স্ট্যাক আর্কিটেকচারের ধারণা।','A cinematic video and photo storytelling concept built around 4K footage.':'4K ফুটেজনির্ভর সিনেম্যাটিক ভিডিও ও ফটোগ্রাফি গল্প বলার ধারণা।','A performance-focused systems concept inspired by low-level C++ engineering.':'লো-লেভেল C++ ইঞ্জিনিয়ারিং থেকে অনুপ্রাণিত পারফরম্যান্সকেন্দ্রিক সিস্টেম ধারণা।',
      '05 — Creative':'০৫ — সৃজনশীল কাজ','Behind the ':'লেন্সের ','lens':'পেছনের গল্প','Cinematic 4K shooting with focus on light, motion and story.':'আলো, গতি ও গল্পকে গুরুত্ব দিয়ে সিনেম্যাটিক 4K ভিডিও ধারণ।','Portraits, places and moments captured with a clean visual style.':'পরিচ্ছন্ন ভিজ্যুয়াল স্টাইলে পোর্ট্রেট, স্থান ও মুহূর্ত ধারণ।','Premiere Pro cuts, After Effects motion and Lightroom colour work.':'Premiere Pro এডিট, After Effects মোশন ও Lightroom কালার গ্রেডিং।','Interfaces and layouts crafted in Figma with consistent systems.':'সামঞ্জস্যপূর্ণ ডিজাইন সিস্টেমে Figma দিয়ে ইন্টারফেস ও লেআউট তৈরি।',
      '06 — Contact':'০৬ — যোগাযোগ',"Let's build ":'চলুন তৈরি করি ','something great':'দারুণ কিছু','Have a project, idea or collaboration in mind? Send a message — it goes straight to my private inbox.':'কোনো প্রজেক্ট, আইডিয়া বা একসঙ্গে কাজ করার পরিকল্পনা আছে? বার্তা পাঠান—সরাসরি আমার ব্যক্তিগত ইনবক্সে পৌঁছে যাবে।',
      'Name':'নাম','Email':'ইমেইল','Subject':'বিষয়','Message':'বার্তা','Send message':'বার্তা পাঠান','Built with Node.js, Express & a lot of coffee.':'Node.js, Express ও অনেকটা কফি দিয়ে তৈরি।',
      'Ask about Raian':'Raian সম্পর্কে জিজ্ঞাসা করুন','Hi! I\'m Raian\'s AI assistant. Ask me about his skills, education or projects — English or বাংলা.':'হ্যালো! আমি Raian-এর AI সহকারী। তার দক্ষতা, শিক্ষা বা প্রজেক্ট সম্পর্কে বাংলা বা ইংরেজিতে জিজ্ঞাসা করুন।','Type a message…':'বার্তা লিখুন…','Send':'পাঠান'
    }
  };
  const textTranslations = Object.entries(translations.text).sort((a, b) => b[0].length - a[0].length);
  function translatePortfolioText(text) {
    if (document.documentElement.lang !== 'bn') return text;
    return textTranslations.reduce((value, [english, bangla]) => value.replaceAll(english, bangla), text);
  }
  const textNodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) { const n=walker.currentNode; if(n.nodeValue.trim()) textNodes.push({node:n, original:n.nodeValue}); }
  const originalAttrs = [...document.querySelectorAll('input,textarea')].map(el=>({el,placeholder:el.getAttribute('placeholder')}));
  function setLanguage(lang,persist=true){
    const bn=lang==='bn'; document.documentElement.lang=bn?'bn':'en';
    wi=0; ci=0; del=false; typed.textContent='';
    textNodes.forEach(({node,original})=>{node.nodeValue=translatePortfolioText(original);});
    renderStorySteps();
    const navLinks=$$('#menu a'); navLinks.forEach((a,i)=>a.textContent=(bn?translations.bnNav:translations.nav)[i]||a.textContent);
    originalAttrs.forEach(({el,placeholder})=>{if(placeholder)el.placeholder=bn?({'Type a message…':'বার্তা লিখুন…'}[placeholder]||placeholder):placeholder;});
    languageToggle.textContent=bn?'EN':'বাংলা'; languageToggle.setAttribute('aria-label',bn?'Switch to English':'বাংলায় পরিবর্তন করুন');
    if(portfolioContent)renderPortfolioContent(portfolioContent);
    $$('.project-step').forEach((card,index)=>{
      const project=projects[index];if(!project)return;
      const title=card.querySelector('h3'),description=card.querySelector('p');
      if(title)title.textContent=localizeText(project.t);
      if(description)description.textContent=localizeText(project.d);
      card.querySelectorAll('.tags span').forEach((tag,tagIndex)=>{tag.textContent=localizeText(project.l[tagIndex]||tag.textContent)});
    });
    if(persist)localStorage.setItem('portfolio-language',lang);
  }
  function setTheme(theme,persist=true){
    document.documentElement.dataset.theme=theme;
    themeToggle.textContent=theme==='light'?'☾':'☀';
    themeToggle.title=theme==='light'?'Switch to dark mode':'Switch to light mode';
    themeToggle.setAttribute('aria-label',themeToggle.title);
    const metaTheme=$('meta[name="theme-color"]');
    if(metaTheme)metaTheme.setAttribute('content',theme==='light'?'#edf3ed':'#000000');
    if(persist)localStorage.setItem('portfolio-theme',theme);
  }
  setTheme(localStorage.getItem('portfolio-theme')||'dark');
  setLanguage(localStorage.getItem('portfolio-language')||'en');
  themeToggle.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
  languageToggle.addEventListener('click',()=>setLanguage(document.documentElement.lang==='bn'?'en':'bn'));

  async function loadPortfolioContent() {
    try {
      const response = await fetch(apiUrl('/api/portfolio/content'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const data = await response.json();
      if (!data.content || typeof data.content !== 'object') throw new Error('The portfolio content response is invalid.');
      renderPortfolioContent(data.content);
    } catch (error) {
      console.warn('Portfolio content could not be loaded:', error.message);
    }
  }
  loadPortfolioContent();
  addEventListener('storage', event => {
    if(event.key==='portfolio-theme'&&['light','dark'].includes(event.newValue))setTheme(event.newValue,false);
    if(event.key==='portfolio-language'&&['en','bn'].includes(event.newValue))setLanguage(event.newValue,false);
    if (event.key === 'portfolio-content-updated') loadPortfolioContent();
    if (event.key === 'portfolio-projects-updated') loadPortfolioProjects();
    if (event.key === 'portfolio-steps-updated') loadPortfolioSteps();
    if (event.key === 'portfolio-settings-updated') loadPortfolioSettings();
  });

  $('#year').textContent = new Date().getFullYear();
})();

/* ============================================================================
   ELSEWHERE — script.js
   ----------------------------------------------------------------------------
   A single-page "OTT for websites". Plain JS, zero dependencies.

   SECTIONS
     01. Constants & catalogue seed data
     02. Tiny utilities (dom, escape, hashing, posters)
     03. Persistence layer  ← replace with a real API + database in production
     04. Authentication (PBKDF2 via Web Crypto)  ← replace with a real backend
     05. State & derived data (ratings, history, search)
     06. Splash / intro animation
     07. Top bar, category nav, profile menu, mobile drawer
     08. Hero banner
     09. Rows, cards, rails (drag + arrows)
     10. Search
     11. Site detail modal + rating widget
     12. Auth modal
     13. Admin studio (CRUD + bulk import)
     14. Modals, toasts, confirm helper
     15. Boot
   ========================================================================== */

(function () {
  'use strict';

  /* ==========================================================================
     01. CONSTANTS & CATALOGUE
     ========================================================================== */

  /* Storage keys — namespaced + versioned so a schema change can be migrated. */
  /* v2: the fake vote counts, seeded reviews and demo accounts are gone, so
     the prefix is bumped — every browser starts from a clean, honest slate
     instead of inheriting the old demo data. */
  const KEY = {
    sites:      'elsewhere.v3.sites',
    categories: 'elsewhere.v3.categories',
    users:      'elsewhere.v3.users',
    session:    'elsewhere.v3.session',
    history:    'elsewhere.v3.history',
    ratings:    'elsewhere.v3.ratings',
    feedback:   'elsewhere.v3.feedback',
    popups:     'elsewhere.v3.popups',
    popupSeen:  'elsewhere.v3.popupSeen',
    draft:      'elsewhere.v3.draft'          /* true = unpublished admin edits */
  };

  const SESSION_DAYS = 7;

  /* The five rating criteria. Every one offers the same simple pattern:
       [0] good  → scores 3
       [1] okay  → scores 2
       [2] bad   → scores 1
     Normalised to a 0–10 scale. The wording is deliberately plain and always
     reads left-to-right from best to worst — no jargon, no guessing.
     `hint` explains the criterion in one short line under its name. */
  const CRITERIA = [
    { id: 'speed',       label: 'Speed',       hint: 'How quickly pages open',
      options: ['Fast', 'Okay', 'Slow'] },
    { id: 'ads',         label: 'Ads',         hint: 'How many ads you have to dodge',
      options: ['No ads', 'Some ads', 'Too many ads'] },
    { id: 'content',     label: 'Content',     hint: 'Is what you find worth your time',
      options: ['Good', 'Okay', 'Poor'] },
    { id: 'design',      label: 'Design',      hint: 'How it looks and feels to use',
      options: ['Great', 'Okay', 'Outdated'] },
    { id: 'reliability', label: 'Reliability', hint: 'Does it work every time you visit',
      options: ['Always works', 'Sometimes down', 'Often down'] }
  ];

  /* Plain-language word for each of the three positions (used for a11y labels). */
  const RATING_TONES = ['best', 'okay', 'worst'];

  const ACCENTS = ['#ff6a00', '#ff8f3f', '#ffb020', '#ff4d6d', '#ff7a45', '#c9a227', '#7c8cff', '#28c2a0'];

  /* Categories are seeded here but live in storage, so bulk-imported rows can
     introduce new ones. `accent` feeds the generated poster art. */
  /* ==========================================================================
     THE CATALOGUE  —  catalogue.js
     --------------------------------------------------------------------------
     Every destination the site knows about lives in `catalogue.js`, next to
     this file. That file is the single source of truth: edit it, commit it,
     push — every visitor picks the new version up on their next load. Nothing
     here is faked: no synthetic vote counts, no invented reviews, no demo
     accounts. What you publish is exactly what people see.

     Format (one entry per destination):

       {
         "categories": [{ "id": "design", "name": "Design & Inspiration",
                          "accent": "#ff8f3f", "blurb": "…" }],
         "sites": [{ "id": "godly", "name": "Godly", "category": "design",
                     "link": "https://godly.website", "description": "…",
                     "issues": "…", "featured": true }]
       }

     `category` may be a category id or its display name. `issues` and
     `featured` are optional; `link` must start with http:// or https://.

     STARTER_* below is only a fallback for the case where the fetch cannot
     run at all — opening index.html straight off the disk, or offline.
     ========================================================================== */
  /* catalogue.js defines this global (see the file itself for the format). */
  const CATALOGUE_SOURCE = () => (typeof window !== 'undefined' ? window.ELSEWHERE_CATALOGUE : null);

  const STARTER_CATEGORIES = [
    { id: 'design',  name: 'Design & Inspiration', accent: '#ff8f3f', blurb: 'Interfaces worth stealing ideas from.' },
    { id: 'dev',     name: 'Dev & Code',           accent: '#ff6a00', blurb: 'Docs, playgrounds and places to get unstuck.' },
    { id: 'reading', name: 'Reading Room',         accent: '#ff8f3f', blurb: 'Longform and public-domain books.' }
  ];

  /* Column order: [id, name, category, link, description, known issues, featured] */
  const STARTER_SITES = [
    ['godly', 'Godly', 'design', 'https://godly.website',
      'A daily-updated feed of astronomically good web design, heavy on motion, 3D and typography.',
      'Homepage autoplays several heavy video previews, so it crawls on mobile data.', true],
    ['dribbble', 'Dribbble', 'design', 'https://dribbble.com',
      'Shot-sized UI, branding and illustration inspiration from working designers.',
      'Free accounts hit a paywall for contact info and advanced search filters.', false],
    ['mdn', 'MDN Web Docs', 'dev', 'https://developer.mozilla.org',
      'The reference for HTML, CSS and JavaScript, with browser-compatibility notes built into every page.',
      'Search sometimes ranks stale translated pages above the current English docs.', true],
    ['github', 'GitHub', 'dev', 'https://github.com',
      'Where most of the open web is written, reviewed and shipped.',
      'Notification overload is real, and some search filters need a paid plan.', false],
    ['gutenberg', 'Project Gutenberg', 'reading', 'https://www.gutenberg.org',
      'Seventy thousand free public-domain books, downloadable in every format that matters.',
      'The interface is stuck in 2004 and the file names are cryptic.', false]
  ];

  /* Extra colour used when a brand-new category arrives without an accent. */
  /* ==========================================================================
     02. TINY UTILITIES
     ========================================================================== */

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /** Escape anything that came from a user before it touches innerHTML. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'site-' + Date.now().toString(36);
  }

  /* FNV-1a — deterministic hashing so generated art and community scores
     stay identical between reloads. */
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* Small deterministic PRNG so seed data is stable. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mix(hexA, hexB, amount) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    const t = Math.max(0, Math.min(1, amount));
    const to = (x, y) => Math.round(x + (y - x) * t);
    return 'rgb(' + to(a.r, b.r) + ',' + to(a.g, b.g) + ',' + to(a.b, b.b) + ')';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /* '—' whenever nobody has voted yet, so an unrated site never shows a
     number that looks like a score. */
  function formatScore(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  /* ---- Generated poster art ------------------------------------------------
     Every tile gets deterministic SVG artwork built from the site id, so the
     catalogue looks designed without shipping a single binary asset and without
     depending on the network (which sandboxed previews block). A real image URL
     supplied by the admin always wins — see `artFor()`. */
  const posterCache = new Map();

  /* Companion colours used to give neighbouring tiles in the same category
     different moods — pure category colour looked far too repetitive. */
  const COMPANIONS = ['#ff6a00', '#ff2d6f', '#7c5cff', '#00c2b2', '#ffd166',
                      '#ff7a45', '#2dd4bf', '#f472b6', '#60a5fa', '#ffb020'];

  function categoryAccent(catId) {
    const cat = state.categories.find((c) => c.id === catId);
    return (cat && cat.accent) || ACCENTS[0];
  }

  /* One of four deterministic geometric compositions. */
  function posterShapes(variant, rnd, accent, accent2, wide) {
    const unit = wide ? 0.22 : 1;   /* the wide hero canvas is ~13x wider per SVG unit */
    const out = [];

    if (variant === 0) {
      /* Orb + expanding rings */
      const cx = (34 + rnd() * 34).toFixed(1);
      const cy = (30 + rnd() * 30).toFixed(1);
      const r = (16 + rnd() * 10).toFixed(1);
      out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="url(#orb)"/>');
      for (let i = 0; i < 4; i++) {
        out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (Number(r) + 8 + i * 10).toFixed(1) +
          '" fill="none" stroke="' + (i % 2 ? accent2 : '#ffffff') + '" stroke-opacity="' +
          (0.34 - i * 0.07).toFixed(2) + '" stroke-width="0.4"/>');
      }
    } else if (variant === 1) {
      /* Diagonal bands */
      const tilt = (-26 + rnd() * 14).toFixed(1);
      for (let i = 0; i < 5; i++) {
        const y = (4 + i * 20 + rnd() * 8).toFixed(1);
        out.push('<rect x="-30" y="' + y + '" width="170" height="' + (4 + rnd() * 8).toFixed(1) +
          '" fill="' + (i % 2 ? accent : accent2) + '" fill-opacity="' + (0.24 + rnd() * 0.2).toFixed(2) +
          '" transform="rotate(' + tilt + ' 50 50)"/>');
      }
      out.push('<circle cx="' + (58 + rnd() * 26).toFixed(1) + '" cy="' + (16 + rnd() * 18).toFixed(1) +
        '" r="' + (20 + rnd() * 10).toFixed(1) + '" fill="url(#orb)" opacity="0.9"/>');
    } else if (variant === 2) {
      /* Quarter arcs sweeping out of a corner */
      const corners = [[2, 2], [98, 2], [2, 98], [98, 98]];
      const corner = corners[Math.floor(rnd() * 4)];
      for (let i = 0; i < 5; i++) {
        out.push('<circle cx="' + corner[0] + '" cy="' + corner[1] + '" r="' + (26 + i * 17) +
          '" fill="none" stroke="' + (i % 2 ? accent2 : '#ffffff') + '" stroke-opacity="' +
          (0.4 - i * 0.07).toFixed(2) + '" stroke-width="0.55"/>');
      }
      out.push('<circle cx="' + corner[0] + '" cy="' + corner[1] + '" r="20" fill="url(#orb)"/>');
    } else {
      /* Dot lattice + soft orb */
      for (let gx = 0; gx < 6; gx++) {
        for (let gy = 0; gy < 6; gy++) {
          out.push('<circle cx="' + (13 + gx * 15) + '" cy="' + (13 + gy * 15) + '" r="' +
            ((0.7 + rnd() * 0.9) * unit).toFixed(2) + '" fill="#ffffff" fill-opacity="' +
            (0.16 + rnd() * 0.2).toFixed(2) + '"/>');
        }
      }
      out.push('<circle cx="' + (26 + rnd() * 48).toFixed(1) + '" cy="' + (28 + rnd() * 40).toFixed(1) +
        '" r="' + (26 + rnd() * 14).toFixed(1) + '" fill="url(#orb)"/>');
    }

    return out.join('');
  }

  /* Diagonal directions for the colour wash (percentages = objectBoundingBox). */
  const WASH_DIRS = [
    'x1="0%" y1="0%" x2="100%" y2="100%"',
    'x1="100%" y1="0%" x2="0%" y2="100%"',
    'x1="0%" y1="100%" x2="100%" y2="0%"',
    'x1="0%" y1="0%" x2="55%" y2="100%"'
  ];

  function makePoster(site, wide) {
    const accent = categoryAccent(site.cat);
    const seed = hash32(site.id + (wide ? ':wide' : ':tall'));
    const rnd = mulberry32(seed);

    /* Mix the category colour with a companion hue so each tile is distinct. */
    const companion = COMPANIONS[hash32(site.id + 'c') % COMPANIONS.length];
    const accent2 = mix(accent, companion, 0.55);

    /* The dot lattice reads as smudges at hero scale, so wide art only uses
       the three shape-led compositions. */
    const variant = wide ? [0, 1, 2][seed % 3] : seed % 4;
    const initial = (site.name || '?').trim().charAt(0).toUpperCase();
    const tilt = (-30 + rnd() * 60).toFixed(1);
    const washAngle = Math.floor(rnd() * 4);

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">' +
        '<defs>' +
          /* Saturated colour wash — using stop-opacity keeps the hue vivid instead
             of turning muddy when blended with a dark base. */
          '<linearGradient id="wash" ' + WASH_DIRS[washAngle] + '>' +
            '<stop offset="0" stop-color="' + accent + '" stop-opacity="1"/>' +
            '<stop offset="0.45" stop-color="' + accent2 + '" stop-opacity="0.46"/>' +
            '<stop offset="1" stop-color="' + accent2 + '" stop-opacity="0"/>' +
          '</linearGradient>' +
          /* A second, brighter light source in the companion hue: one accent
             per corner is what makes a wall of tiles read as colourful
             instead of one long smear of the same orange. */
          '<radialGradient id="spark" cx="' + (22 + Math.floor(rnd() * 56)) + '%" cy="' +
            (14 + Math.floor(rnd() * 40)) + '%" r="52%">' +
            '<stop offset="0" stop-color="' + companion + '" stop-opacity="0.62"/>' +
            '<stop offset="0.55" stop-color="' + accent2 + '" stop-opacity="0.22"/>' +
            '<stop offset="1" stop-color="' + accent2 + '" stop-opacity="0"/>' +
          '</radialGradient>' +
          '<radialGradient id="orb" cx="50%" cy="50%" r="50%">' +
            '<stop offset="0" stop-color="' + accent + '" stop-opacity="1"/>' +
            '<stop offset="0.45" stop-color="' + accent2 + '" stop-opacity="0.58"/>' +
            '<stop offset="1" stop-color="' + accent2 + '" stop-opacity="0"/>' +
          '</radialGradient>' +
          '<radialGradient id="vig" cx="48%" cy="42%" r="72%">' +
            '<stop offset="0.46" stop-color="#04040a" stop-opacity="0"/>' +
            '<stop offset="1" stop-color="#04040a" stop-opacity="0.62"/>' +
          '</radialGradient>' +
          '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#05050a" stop-opacity="0"/>' +
            '<stop offset="0.6" stop-color="#05050a" stop-opacity="0.62"/>' +
            '<stop offset="1" stop-color="#05050a" stop-opacity="0.94"/>' +
          '</linearGradient>' +
          '<pattern id="grain" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(' + tilt + ')">' +
            '<line x1="0" y1="0" x2="0" y2="4" stroke="#ffffff" stroke-opacity="0.028" stroke-width="0.3"/>' +
          '</pattern>' +
        '</defs>' +
        '<rect width="100" height="100" fill="#0a0912"/>' +
        '<rect width="100" height="100" fill="url(#wash)"/>' +
        '<rect width="100" height="100" fill="url(#spark)"/>' +
        posterShapes(variant, rnd, accent, accent2, wide) +
        '<rect width="100" height="100" fill="url(#vig)"/>' +
        '<rect width="100" height="100" fill="url(#grain)"/>' +
        '<rect x="2.5" y="2.5" width="95" height="95" rx="2" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="0.4"/>' +
        /* Monogram, top-left — reads like an app icon rather than a watermark.
           Skipped on the wide hero art, where the site name is already huge. */
        (wide ? '' :
        '<g transform="translate(7.5 7.5)">' +
          '<rect width="13" height="13" rx="4" fill="#05050a" fill-opacity="0.55"/>' +
          '<rect width="13" height="13" rx="4" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="0.4"/>' +
          '<text x="6.5" y="9.9" text-anchor="middle" font-family="Sora, Inter, system-ui, sans-serif" ' +
            'font-weight="700" font-size="8" fill="#ffffff" fill-opacity="0.86">' + esc(initial) + '</text>' +
        '</g>') +
        '<rect y="56" width="100" height="44" fill="url(#fade)"/>' +
      '</svg>';

    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /** Real admin-supplied image wins; otherwise use deterministic generated art. */
  function artFor(site, wide) {
    if (site.image) return site.image;
    const key = site.id + (wide ? ':w' : ':t');
    if (!posterCache.has(key)) posterCache.set(key, makePoster(site, wide));
    return posterCache.get(key);
  }

  /** Used by <img onerror> — if a remote poster 404s we fall back to art. */
  function fallbackArt(img) {
    const id = img.getAttribute('data-fallback');
    const site = state.sites.find((s) => s.id === id);
    if (!site) return;
    img.onerror = null;
    img.src = makePoster(site, img.getAttribute('data-wide') === '1');
    img.removeAttribute('data-wide');
  }

  /* ==========================================================================
     03. PERSISTENCE LAYER
     --------------------------------------------------------------------------
     ┌────────────────────────────────────────────────────────────────────────┐
     │ PRODUCTION NOTE                                                        │
     │ Everything below writes to localStorage. For a real deployment:        │
     │   • sites/categories  → REST or GraphQL endpoints + a database         │
     │   • users             → POST /auth/register, POST /auth/login          │
     │   • session           → httpOnly, Secure, SameSite=Lax cookie          │
     │   • ratings/history   → rows keyed by (user_id, site_id)               │
     │ The function signatures are already shaped like API calls so swapping  │
     │ this object for fetch() calls is a mechanical change.                  │
     └────────────────────────────────────────────────────────────────────────┘
     localStorage throws in sandboxed iframes (opaque origins), so every access
     is guarded and falls back to an in-memory Map for the current tab. */
  const Store = {
    mem: new Map(),

    available() {
      try {
        const probe = '__elsewhere_probe__';
        window.localStorage.setItem(probe, '1');
        window.localStorage.removeItem(probe);
        return true;
      } catch (err) {
        return false;
      }
    },

    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw !== null) return JSON.parse(raw);
      } catch (err) { /* blocked or corrupt — fall through */ }

      if (this.mem.has(key)) return this.mem.get(key);
      return fallback === undefined ? null : fallback;
    },

    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        /* Quota exceeded or storage blocked: keep working in memory. */
      }
      this.mem.set(key, value);
    },

    remove(key) {
      try { window.localStorage.removeItem(key); } catch (err) { /* noop */ }
      this.mem.delete(key);
    }
  };

  /* ==========================================================================
     04. AUTHENTICATION
     --------------------------------------------------------------------------
     Passwords are salted and hashed with PBKDF2-SHA-256 (150k iterations) via
     the Web Crypto API before they are stored. Plain-text passwords are never
     persisted. This is still a client-side store, so it protects a shared demo
     device, not a hostile server operator.

     PRODUCTION: delete `Auth.hash` usage on the client entirely. Send the
     password once over TLS to a backend, hash there with a slow KDF, and keep
     only a session cookie in the browser.
     ========================================================================== */
  const Auth = {
    ITERATIONS: 150000,

    bytesToB64(bytes) {
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return window.btoa(bin);
    },

    b64ToBytes(b64) {
      const bin = window.atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    },

    randomSalt() {
      const bytes = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      return this.bytesToB64(bytes);
    },

    /** PBKDF2-SHA-256 → base64 digest. */
    async hash(password, saltB64) {
      const salt = this.b64ToBytes(saltB64);
      const enc = new TextEncoder();

      if (window.crypto && window.crypto.subtle && window.crypto.subtle.deriveBits) {
        try {
          const key = await window.crypto.subtle.importKey(
            'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
          );
          const bits = await window.crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: salt, iterations: this.ITERATIONS, hash: 'SHA-256' },
            key,
            256
          );
          return 'pbkdf2$' + this.ITERATIONS + '$' + this.bytesToB64(new Uint8Array(bits));
        } catch (err) {
          /* fall through to the legacy path below */
        }
      }

      /* INSECURE FALLBACK — only reached when Web Crypto is unavailable (old
         browser, insecure context). Documented so nobody ships it by accident. */
      return 'weak$' + this.slowMix(password, salt);
    },

    slowMix(password, salt) {
      let acc = '';
      const enc = new TextEncoder();
      const bytes = enc.encode(password + '|' + this.bytesToB64(salt));
      for (let round = 0; round < 5000; round++) {
        let h = 2166136261 ^ round;
        for (let i = 0; i < bytes.length; i++) {
          h ^= bytes[i];
          h = Math.imul(h, 16777619);
        }
        acc = (h >>> 0).toString(16) + acc.slice(0, 40);
      }
      return acc;
    },

    async createUser(email, password, name, role) {
      const users = Store.get(KEY.users, []);
      const normal = String(email).trim().toLowerCase();

      if (users.some((u) => u.email === normal)) {
        throw new Error('An account already exists for that email.');
      }

      const salt = this.randomSalt();
      const hash = await this.hash(password, salt);
      const user = {
        id: 'u_' + hash32(normal + Date.now()).toString(36),
        email: normal,
        name: name || normal.split('@')[0],
        role: role || 'user',
        salt: salt,
        hash: hash,
        createdAt: Date.now()
      };
      users.push(user);
      Store.set(KEY.users, users);
      return user;
    },

    async verify(email, password) {
      const users = Store.get(KEY.users, []);
      const normal = String(email).trim().toLowerCase();
      const user = users.find((u) => u.email === normal);
      if (!user) throw new Error('No account found for that email in this browser.');

      const attempt = await this.hash(password, user.salt);
      if (attempt !== user.hash) throw new Error('That password does not match.');
      return user;
    },

    startSession(user) {
      const session = { userId: user.id, expiresAt: Date.now() + SESSION_DAYS * 864e5 };
      Store.set(KEY.session, session);
      return session;
    },

    currentUser() {
      const session = Store.get(KEY.session, null);
      if (!session || !session.userId) return null;
      if (session.expiresAt && session.expiresAt < Date.now()) {
        Store.remove(KEY.session);
        return null;
      }
      const users = Store.get(KEY.users, []);
      return users.find((u) => u.id === session.userId) || null;
    },

    logout() { Store.remove(KEY.session); }
  };

  /* ==========================================================================
     05. STATE & DERIVED DATA
     ========================================================================== */
  const state = {
    sites: [],
    categories: [],
    user: null,
    query: '',
    heroIndex: 0,
    heroIds: [],
    catalogueSource: 'starter',   /* draft | published | cache | starter */
    detailId: null,
    pendingLaunch: null,
    editingId: null,
    adminFilter: '',
    editingPopup: null,
    announceSiteId: '',
    authMode: 'login',
    heroTimer: null,
    heroPaused: false,
    splashDone: false
  };

  const ratingCache = new Map();

  const currentUid = () => (state.user ? state.user.id : 'guest');

  /* ---- History (most recent first, per user) ---- */
  function getHistoryMap() { return Store.get(KEY.history, {}); }

  function getHistory() {
    const map = getHistoryMap();
    return (map[currentUid()] || []).slice();
  }

  function recordVisit(siteId) {
    const map = getHistoryMap();
    const list = (map[currentUid()] || []).filter((entry) => entry.id !== siteId);
    list.unshift({ id: siteId, at: Date.now() });
    map[currentUid()] = list.slice(0, 24);
    Store.set(KEY.history, map);
    renderRows(true);
    if (state.detailId === siteId) paintVisitedLine(siteId);
  }

  function lastVisited(siteId) {
    const entry = getHistory().find((item) => item.id === siteId);
    return entry ? entry.at : null;
  }

  function clearHistory() {
    const map = getHistoryMap();
    map[currentUid()] = [];
    Store.set(KEY.history, map);
    renderRows(false);
    toast('History cleared for this profile.');
  }

  /* ---- Ratings ------------------------------------------------------------
     Model: ratings[siteId][userId][criterionId] = optionIndex (0,1,2)

     These are real votes only. There is no seeded "community baseline" any
     more: until somebody actually rates a site, its score is `null` and the
     UI says so. A catalogue with no votes should look like a catalogue with
     no votes — that honesty is the whole point of a recommendation site.

     PRODUCTION NOTE: with a static host these votes live in the visitor's own
     browser. To pool them across visitors you need a small backend — see the
     seam marked in PUBLISHING.md (Supabase free tier is the usual choice). */
  function getAllRatings() { return Store.get(KEY.ratings, {}); }

  function ratingFor(siteId) {
    if (ratingCache.has(siteId)) return ratingCache.get(siteId);

    const all = getAllRatings();
    const perUser = all[siteId] || {};

    const perCrit = CRITERIA.map((crit) => {
      const counts = [0, 0, 0];

      Object.keys(perUser).forEach((uid) => {
        const vote = perUser[uid] && perUser[uid][crit.id];
        if (typeof vote === 'number' && counts[vote] !== undefined) counts[vote] += 1;
      });

      const total = counts[0] + counts[1] + counts[2];
      const weighted = total ? (counts[0] * 3 + counts[1] * 2 + counts[2] * 1) / total : 0;
      const score = total ? ((weighted - 1) / 2) * 10 : null;   // null = nobody voted
      const topIndex = total ? counts.indexOf(Math.max(counts[0], counts[1], counts[2])) : -1;

      return {
        id: crit.id,
        label: crit.label,
        hint: crit.hint,
        options: crit.options,
        topIndex: topIndex,
        counts: counts,
        total: total,
        score: score,
        topLabel: total ? crit.options[topIndex] : '',
        topPct: total ? Math.round((counts[topIndex] / total) * 100) : 0
      };
    });

    const rated = perCrit.filter((c) => c.total > 0);
    const overall = rated.length ? rated.reduce((sum, c) => sum + c.score, 0) / rated.length : null;
    const votes = rated.length ? Math.round(rated.reduce((sum, c) => sum + c.total, 0) / rated.length) : 0;
    const mine = perUser[currentUid()] || {};

    const result = { overall: overall, votes: votes, criteria: perCrit, mine: mine, rated: rated.length };
    ratingCache.set(siteId, result);
    return result;
  }

  function myVotes(siteId) {
    const all = getAllRatings();
    return (all[siteId] && all[siteId][currentUid()]) || {};
  }

  function saveVote(siteId, critId, optionIndex) {
    const all = getAllRatings();
    if (!all[siteId]) all[siteId] = {};
    if (!all[siteId][currentUid()]) all[siteId][currentUid()] = {};
    all[siteId][currentUid()][critId] = optionIndex;
    Store.set(KEY.ratings, all);

    ratingCache.delete(siteId);
    refreshScoreChips(siteId);
    paintDetailScore(siteId);
    renderRateBlock(siteId);
    flashSaved();
  }

  /* Small inline confirmation instead of a toast — a toast at the bottom of the
     screen would sit on top of the next row the user is about to rate. */
  let savedTimer = null;
  function flashSaved() {
    const badge = $('#rateSaved');
    if (!badge) return;
    badge.hidden = false;
    badge.classList.add('is-on');
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(function () {
      badge.classList.remove('is-on');
      window.setTimeout(function () { badge.hidden = true; }, 260);
    }, 1400);
  }

  /* Sorting helper: unrated sites sink to the bottom instead of producing NaN. */
  function scoreOf(siteId) {
    const overall = ratingFor(siteId).overall;
    return overall === null ? -1 : overall;
  }

  function hasVotes(siteId) { return ratingFor(siteId).rated > 0; }

  /* ---- Site lookup helpers ---- */
  function siteById(id) { return state.sites.find((s) => s.id === id) || null; }

  function categoryName(catId) {
    const cat = state.categories.find((c) => c.id === catId);
    return cat ? cat.name : 'Unsorted';
  }

  function matchesQuery(site, query) {
    const q = query.toLowerCase();
    return (
      site.name.toLowerCase().indexOf(q) > -1 ||
      (site.desc || '').toLowerCase().indexOf(q) > -1 ||
      (site.issues || '').toLowerCase().indexOf(q) > -1 ||
      categoryName(site.cat).toLowerCase().indexOf(q) > -1
    );
  }

  /* ==========================================================================
     06. SPLASH / INTRO
     ========================================================================== */
  function runSplash() {
    const splash = $('#splash');
    const fill = $('#splashFill');
    const counter = $('#splashCount');
    const status = $('#splashStatus');
    if (!splash) { finishSplash(); return; }

    const phases = [
      'indexing the catalogue',
      'scoring ' + state.sites.length + ' destinations',
      'syncing your history',
      'ready'
    ];

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 420 : 2150;
    const started = performance.now();
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;

      splash.classList.add('is-exiting');
      document.body.classList.remove('is-booting');
      document.body.classList.add('is-ready');

      window.setTimeout(function () {
        splash.classList.add('is-gone');
        state.splashDone = true;
      }, reduced ? 120 : 820);

      window.removeEventListener('keydown', onSkip);
      splash.removeEventListener('pointerdown', finish);
    }

    function onSkip(event) {
      /* Space / page keys would otherwise scroll the page behind the overlay. */
      if (event && event.type === 'keydown' && /^( |Spacebar|ArrowDown|ArrowUp|PageDown|PageUp|End|Home)$/.test(event.key)) {
        event.preventDefault();
      }
      finish();
    }

    splash.addEventListener('pointerdown', finish);
    window.addEventListener('keydown', onSkip);

    function tick(now) {
      if (finished) return;
      const p = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - p, 2.1);

      if (fill) fill.style.width = (eased * 100).toFixed(1) + '%';
      if (counter) counter.textContent = pad2(Math.round(eased * 100));

      if (status) {
        const label = phases[Math.min(phases.length - 1, Math.floor(p * phases.length))];
        if (status.textContent !== label) status.textContent = label;
      }

      if (p < 1) requestAnimationFrame(tick);
      else finish();
    }

    requestAnimationFrame(tick);
  }

  function finishSplash() {
    const splash = $('#splash');
    document.body.classList.remove('is-booting');
    document.body.classList.add('is-ready');
    if (splash) splash.classList.add('is-gone');
    state.splashDone = true;
  }

  /* ==========================================================================
     07. TOP BAR, NAV, PROFILE, DRAWER
     ========================================================================== */
  function renderNav() {
    const navCats = $('#navCats');
    const drawerNav = $('#drawerNav');

    navCats.innerHTML = state.categories.map(function (cat) {
      return '<button class="nav-link" type="button" data-jump="' + esc(cat.id) + '">' + esc(cat.name) + '</button>';
    }).join('');

    drawerNav.innerHTML = state.categories.map(function (cat) {
      const count = state.sites.filter(function (s) { return s.cat === cat.id; }).length;
      return '<button class="drawer-link" type="button" data-jump="' + esc(cat.id) + '">' +
               '<span>' + esc(cat.name) + '</span><small>' + count + '</small>' +
             '</button>';
    }).join('');

    $('#drawerFoot').innerHTML =
      '<button class="btn btn-ghost btn-block" type="button" data-action="auth">' +
        (state.user ? 'Signed in as ' + esc(state.user.name) : 'Log in / Sign up') +
      '</button>';
  }

  function renderProfile() {
    const user = state.user;
    const initials = user
      ? (user.name || user.email).trim().charAt(0).toUpperCase()
      : 'G';

    $('#avatarInitials').textContent = initials;
    $('#menuInitials').textContent = initials;
    $('#menuName').textContent = user ? user.name : 'Guest';
    $('#menuEmail').textContent = user ? user.email : 'Browsing without an account';

    const items = [];
    if (user) {
      items.push('<div class="menu-item" style="pointer-events:none;color:var(--dim);font-size:12px;">' +
        '<span>Role</span><span class="role">' + (user.role === 'admin' ? 'Owner' : 'Member') + '</span></div>');
      items.push('<div class="menu-sep"></div>');
      if (user.role === 'admin') {
        items.push('<button class="menu-item is-accent" type="button" data-action="admin"><span>Admin studio</span><span>→</span></button>');
      }
      items.push('<button class="menu-item" type="button" data-action="recent"><span>Recently used</span><span>↗</span></button>');
      items.push('<button class="menu-item" type="button" data-action="clear-history"><span>Clear my history</span></button>');
      items.push('<div class="menu-sep"></div>');
      items.push('<button class="menu-item" type="button" data-action="logout"><span>Log out</span></button>');
    } else {
      items.push('<button class="menu-item is-accent" type="button" data-href="#login" data-action="auth"><span>Log in / Sign up</span><span>→</span></button>');
      items.push('<button class="menu-item" type="button" data-action="recent"><span>Recently used</span><span>↗</span></button>');
      items.push('<div class="menu-sep"></div>');
      items.push('<div class="menu-item" style="pointer-events:none;color:var(--dim);font-size:11.5px;line-height:1.5;">' +
        '<span>Ratings are saved per profile. Sign in to keep yours separate.</span></div>');
    }
    $('#profileMenuBody').innerHTML = items.join('');

    $('#footAdmin').hidden = !(user && user.role === 'admin');
    renderNav();
  }

  function toggleMenu(force) {
    const menu = $('#profileMenu');
    const btn = $('#avatarBtn');
    const open = typeof force === 'boolean' ? force : menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function openDrawer() {
    $('#mobileNav').hidden = false;
    $('#drawerScrim').hidden = false;
    $('#menuBtn').classList.add('is-open');
    $('#menuBtn').setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-locked');
  }

  function closeDrawer() {
    $('#mobileNav').hidden = true;
    $('#drawerScrim').hidden = true;
    $('#menuBtn').classList.remove('is-open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    if (!$('.modal.is-open')) document.body.classList.remove('is-locked');
  }

  function jumpToCategory(catId) {
    closeDrawer();
    toggleMenu(false);
    $('#searchInput').value = '';
    applySearch('');
    const row = document.querySelector('[data-row="cat-' + catId + '"]');
    if (!row) {
      /* Empty category: the rails are not rendered until a site exists, so a
         silent no-op would feel broken. Say what is actually going on. */
      const cat = state.categories.find(function (c) { return c.id === catId; });
      const name = cat ? cat.name : 'That category';
      const isAdmin = !!(state.user && state.user.role === 'admin');
      toast(name + ' has no sites yet — ' +
        (isAdmin ? 'add one in Admin studio → Add / Edit.' : 'the owner has not filled it yet.'), '');
      return;
    }
    const top = row.getBoundingClientRect().top + window.pageYOffset - 84;
    window.scrollTo({ top: top, behavior: 'smooth' });
    row.classList.add('is-highlight');
    window.setTimeout(function () { row.classList.remove('is-highlight'); }, 1400);
  }

  /* ==========================================================================
     08. HERO
     ========================================================================== */
  function pickHeroIds() {
    const featured = state.sites.filter(function (s) { return s.featured; });
    const pool = featured.length >= 3 ? featured : state.sites.slice(0, 6);
    return pool.slice(0, 6).map(function (s) { return s.id; });
  }

  /* Which of the two stacked art layers is currently on top. */
  let heroLayerIndex = 1;      /* layer A is marked is-on in the markup */
  let heroFirstPaint = true;

  /* Cross-fade the background on the GPU.
     --------------------------------------------------------------------
     The old version faded the single art element out, swapped its
     background-image and faded it back in — which forces the browser to
     repaint a full-viewport layer twice per slide. Now the incoming poster
     is written to the *hidden* layer, decoded off-screen first, and only
     its `opacity` changes. Two big slides therefore cost zero paint work
     and no dropped frames, even mid-scroll. */
  function paintHeroArt(site, instant) {
    const layers = [$('#heroLayerA'), $('#heroLayerB')];
    if (!layers[0] || !layers[1]) return;

    const src = artFor(site, true);
    const incoming = layers[1 - heroLayerIndex];
    const outgoing = layers[heroLayerIndex];

    if (instant) {
      incoming.style.backgroundImage = 'url("' + src + '")';
      incoming.classList.add('is-on');
      outgoing.classList.remove('is-on');
      heroLayerIndex = 1 - heroLayerIndex;
      return;
    }

    let painted = false;
    const commit = function () {
      if (painted) return;           /* decode() calls both then and catch */
      painted = true;
      incoming.style.backgroundImage = 'url("' + src + '")';
      /* Force the new background to be laid out before the fade starts so the
         first frame of the transition already shows the new slide. */
      void incoming.offsetWidth;
      incoming.classList.add('is-on');
      outgoing.classList.remove('is-on');
      heroLayerIndex = 1 - heroLayerIndex;
    };

    const probe = new Image();
    probe.decoding = 'async';
    probe.onload = commit;
    probe.onerror = commit;
    probe.src = src;
    if (probe.decode) probe.decode().then(commit).catch(commit);

    /* Warm the next slide while this one is on screen, so the following
       rotation starts instantly instead of decoding in front of you. */
    window.setTimeout(function () { preloadHeroArt(state.heroIndex + 1); }, 400);
  }

  const heroPreloaded = new Set();
  function preloadHeroArt(index) {
    if (!state.heroIds.length) return;
    const id = state.heroIds[((index % state.heroIds.length) + state.heroIds.length) % state.heroIds.length];
    const site = siteById(id);
    if (!site) return;
    const src = artFor(site, true);
    if (heroPreloaded.has(src)) return;
    heroPreloaded.add(src);
    const probe = new Image();
    probe.decoding = 'async';
    probe.src = src;
  }

  function renderHero(forceIndex) {
    if (!state.heroIds.length) state.heroIds = pickHeroIds();
    if (!state.heroIds.length) return;

    if (typeof forceIndex === 'number') state.heroIndex = forceIndex;
    state.heroIndex = state.heroIndex % state.heroIds.length;

    const site = siteById(state.heroIds[state.heroIndex]);
    if (!site) return;

    const rating = ratingFor(site.id);
    const content = $('#heroContent');

    /* Art: instant on the very first paint (it is behind the splash anyway),
       cross-faded on every rotation after that. */
    paintHeroArt(site, heroFirstPaint);

    const writeCopy = function () {
      $('#heroCat').textContent = categoryName(site.cat) + ' · featured';
      $('#heroTitle').textContent = site.name;
      $('#heroDesc').textContent = site.desc;
      $('#heroNote').textContent = site.issues || 'No known issues reported.';

      $('#heroMeta').innerHTML =
        (rating.overall === null
          ? '<span class="chip">Not rated yet</span>'
          : '<span class="chip score">★ ' + formatScore(rating.overall) + '/10</span>' +
            '<span class="chip">' + rating.votes + (rating.votes === 1 ? ' rating' : ' ratings') + '</span>') +
        '<span class="chip">' + (lastVisited(site.id) ? 'Visited ' + timeAgo(lastVisited(site.id)) : 'Not opened yet') + '</span>';

      $('#heroOpen').dataset.open = site.id;
      $('#heroInfo').dataset.info = site.id;

      $('#heroDots').innerHTML = state.heroIds.map(function (id, index) {
        const s = siteById(id);
        return '<button class="hero-dot' + (index === state.heroIndex ? ' is-active' : '') + '" type="button" ' +
               'data-hero="' + index + '" aria-label="' + esc(s ? s.name : 'Featured') + '"></button>';
      }).join('');
    };

    if (heroFirstPaint) {
      writeCopy();
      heroFirstPaint = false;
      return;
    }

    /* Dip the copy out, swap it and bring it back — 240ms, opacity only. */
    if (content) content.classList.add('is-swapping');
    window.setTimeout(function () {
      writeCopy();
      if (content) content.classList.remove('is-swapping');
    }, 170);
  }

  /* Stop animating what nobody is looking at. Cheaper than it sounds: the
     compositor keeps ticking an infinite keyframe even when the element is
     off-screen, and that tick competes with your scroll. */
  function watchHeroVisibility() {
    const hero = $('#hero');
    if (!hero) return;

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(function (entries) {
        hero.classList.toggle('is-idle', !entries[0].isIntersecting);
      }, { threshold: 0.01 });
      io.observe(hero);
    }

    document.addEventListener('visibilitychange', function () {
      document.body.classList.toggle('is-hidden', document.hidden);
    });
  }

  /* A single long-lived interval; pausing is a flag rather than clearInterval
     so the rotation always resumes correctly after hover, a modal or a search. */
  function startHeroRotation() {
    window.clearInterval(state.heroTimer);
    state.heroTimer = window.setInterval(function () {
      if (state.heroPaused || document.hidden || $('.modal.is-open') || state.query) return;
      renderHero(state.heroIndex + 1);
    }, 9000);
  }

  /* ==========================================================================
     08b. CURSOR LIGHT
     --------------------------------------------------------------------------
     One delegated listener for the whole page. While the pointer moves over a
     tile (or the hero) we write the cursor position into that element as
     --mx / --my, and CSS puts a radial highlight exactly there. Work is done
     once per animation frame, at most, and only when the pointer actually
     changed cell — so this costs nothing while you scroll or type.
     ========================================================================== */
  function initSpotlight() {
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    let queued = null;
    let current = null;

    function apply() {
      frame = 0;
      if (!queued) return;

      const target = queued.target;
      const x = queued.x;
      const y = queued.y;
      queued = null;

      const host = target && target.closest ? target.closest('.card, .hero') : null;
      if (!host) { current = null; return; }

      const rect = host.getBoundingClientRect();
      const px = Math.round(x - rect.left);
      const py = Math.round(y - rect.top);
      host.style.setProperty('--mx', px + 'px');
      host.style.setProperty('--my', py + 'px');
      current = host;
    }

    document.addEventListener('pointermove', function (event) {
      if (event.pointerType !== 'mouse') return;
      queued = { target: event.target, x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(apply);
    }, { passive: true });

    document.addEventListener('pointerleave', function () {
      if (current) current.style.removeProperty('--mx');
      current = null;
    }, { passive: true });
  }

  /* ==========================================================================
     09. ROWS, CARDS, RAILS
     ========================================================================== */
  function cardEl(site, showCategory) {
    const rated = hasVotes(site.id);
    const score = rated ? formatScore(scoreOf(site.id)) : '';
    const cat = categoryName(site.cat);
    /* Mixed rows (recent / top rated) label the category; single-category rails
       do not, because repeating the same word eight times is noise. */
    const catLabel = showCategory === false ? '' : '<span class="card-cat">' + esc(cat) + '</span>';

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML =
      '<button class="card-open" type="button" data-open="' + esc(site.id) + '" aria-label="Open ' + esc(site.name) + '">' +
        '<span class="card-art">' +
          '<img src="' + esc(artFor(site, false)) + '" alt="" loading="lazy" decoding="async" ' +
               'data-fallback="' + esc(site.id) + '" onerror="ELSEWHERE.fallbackArt&&ELSEWHERE.fallbackArt(this)" />' +
        '</span>' +
        '<span class="card-shade"></span>' +
        '<span class="card-glow"></span>' +
        '<span class="card-sheen"></span>' +
        '<span class="card-score' + (rated ? '' : ' is-empty') + '" data-score="' + esc(site.id) + '">' +
          '<i></i><b>' + score + '</b></span>' +
        '<span class="card-cta">Open ↗</span>' +
        '<span class="card-meta">' +
          catLabel +
          '<span class="card-title">' + esc(site.name) + '</span>' +
        '</span>' +
      '</button>' +
      '<button class="card-info" type="button" data-info="' + esc(site.id) + '" aria-label="Details and ratings for ' + esc(site.name) + '">i</button>';

    return card;
  }

  function buildRow(rowId, title, sites, meta, showCategory) {
    const section = document.createElement('section');
    section.className = 'row';
    section.setAttribute('data-row', rowId);
    section.setAttribute('aria-label', title);

    const head = document.createElement('div');
    head.className = 'row-head';
    head.innerHTML =
      '<div class="row-title-wrap">' +
        '<h2 class="row-title">' + esc(title) + '</h2>' +
        '<span class="row-count">' + esc(meta) + '</span>' +
      '</div>' +
      (sites.length < 2 ? '' :
        '<div class="row-nav">' +
          '<button class="row-arrow" type="button" data-scroll="-1" aria-label="Scroll ' + esc(title) + ' left">' +
            '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
          '<button class="row-arrow" type="button" data-scroll="1" aria-label="Scroll ' + esc(title) + ' right">' +
            '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
        '</div>');

    const rail = document.createElement('div');
    rail.className = 'rail';
    rail.dataset.row = rowId;
    sites.forEach(function (site) { rail.appendChild(cardEl(site, showCategory)); });

    section.appendChild(head);
    section.appendChild(rail);

    enableRail(section, rail);
    return section;
  }

  function enableRail(section, rail) {
    const arrows = $$('.row-arrow', section);
    const update = function () {
      const maxScroll = rail.scrollWidth - rail.clientWidth - 2;
      arrows.forEach(function (btn) {
        const dir = Number(btn.dataset.scroll);
        btn.disabled = dir < 0 ? rail.scrollLeft <= 2 : rail.scrollLeft >= maxScroll;
      });
    };

    arrows.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const dir = Number(btn.dataset.scroll);
        const amount = Math.max(rail.clientWidth * 0.82, 240);
        rail.scrollBy({ left: dir * amount, behavior: 'smooth' });
      });
    });

    rail.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update);
    window.setTimeout(update, 60);

    /* Rows are render-skipped while off-screen (see .row in styles.css), so a
       rail can only be measured once it is near the viewport. Re-measure then,
       which is what re-enables the arrows. */
    if ('IntersectionObserver' in window) {
      const wake = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        wake.disconnect();
        window.requestAnimationFrame(function () {
          update();
          window.setTimeout(update, 150);
        });
      }, { rootMargin: '400px 0px' });
      wake.observe(rail);
    }

    /* Drag-to-scroll with a mouse (touch already scrolls natively). */
    let down = false;
    let startX = 0;
    let startScroll = 0;
    let dragged = false;

    rail.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'touch') return;
      down = true;
      dragged = false;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
      rail.classList.add('is-dragging');
    });

    rail.addEventListener('pointermove', function (event) {
      if (!down) return;
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 6) dragged = true;
      if (dragged) {
        rail.scrollLeft = startScroll - dx;
        event.preventDefault();
      }
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (type) {
      rail.addEventListener(type, function () {
        down = false;
        rail.classList.remove('is-dragging');
        window.setTimeout(function () { dragged = false; }, 30);
      });
    });

    rail.addEventListener('click', function (event) {
      if (dragged) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  function renderRows(preserveScroll) {
    const rowsEl = $('#rows');
    if (!rowsEl) return;

    const scrolls = new Map();
    if (preserveScroll) {
      $$('.rail', rowsEl).forEach(function (rail) { scrolls.set(rail.dataset.row, rail.scrollLeft); });
    }

    rowsEl.innerHTML = '';
    const fragment = document.createDocumentFragment();

    /* 9a. Recently used — only exists once the profile has opened something. */
    const history = getHistory();
    const recentSites = history
      .map(function (entry) { return siteById(entry.id); })
      .filter(Boolean);

    if (recentSites.length) {
      fragment.appendChild(buildRow('recent', 'Recently used', recentSites, recentSites.length + ' opened', true));
    }

    /* 9b. The third rail is honest about what it is.
       With enough real votes it ranks by score. Before that (a brand-new
       install, which is the normal state on day one) it becomes a curated
       "Start here" rail instead of pretending to know what people like. */
    const voted = state.sites.filter(function (site) { return hasVotes(site.id); });

    if (voted.length >= 4) {
      const ranked = voted
        .sort(function (a, b) { return scoreOf(b.id) - scoreOf(a.id); })
        .slice(0, 14);
      fragment.appendChild(buildRow('top', 'Highest rated right now', ranked, 'community scores', true));
    } else {
      const picks = state.sites
        .slice()
        .sort(function (a, b) { return Number(!!b.featured) - Number(!!a.featured); })
        .slice(0, 14);
      if (picks.length) {
        fragment.appendChild(buildRow('top', 'Start here', picks, 'editor picks · no votes yet', true));
      }
    }

    /* 9c. One rail per category. */
    state.categories.forEach(function (cat) {
      const sites = state.sites.filter(function (s) { return s.cat === cat.id; });
      if (!sites.length) return;
      fragment.appendChild(buildRow('cat-' + cat.id, cat.name, sites, sites.length + ' sites', false));
    });

    rowsEl.appendChild(fragment);

    if (preserveScroll) {
      $$('.rail', rowsEl).forEach(function (rail) {
        const value = scrolls.get(rail.dataset.row);
        if (value) rail.scrollLeft = value;
      });
    }
  }

  /** Update every visible score chip for one site (after a rating is saved). */
  /* Keeps the pill beside the site name in step with the numbers below it. */
  function paintDetailScore(siteId) {
    const pill = $('#detailScore');
    if (!pill || !state.detailId || state.detailId !== siteId) return;
    const rating = ratingFor(siteId);
    pill.textContent = rating.overall === null ? 'Not rated' : formatScore(rating.overall) + ' / 10';
    pill.classList.toggle('is-empty', rating.overall === null);
  }

  function refreshScoreChips(siteId) {
    const rated = hasVotes(siteId);
    const value = formatScore(scoreOf(siteId));
    $$('[data-score="' + siteId + '"]').forEach(function (chip) {
      /* A chip stays hidden until the site has an actual vote behind it, then
         un-hides itself the moment the score exists. */
      chip.classList.toggle('is-empty', !rated);
      const b = chip.querySelector('b');
      if (b) b.textContent = value;
      else chip.textContent = value;
    });

    $$('.hero-meta .chip.score').forEach(function (chip) {
      const heroSite = siteById(state.heroIds[state.heroIndex]);
      if (heroSite && heroSite.id === siteId) chip.textContent = '★ ' + value + '/10';
    });
  }

  /* ==========================================================================
     10. SEARCH
     ========================================================================== */
  function applySearch(rawQuery) {
    const query = String(rawQuery || '').trim();
    state.query = query;

    const results = $('#results');
    const rows = $('#rows');
    const hero = $('#hero');
    const clearBtn = $('#searchClear');

    if (clearBtn) clearBtn.hidden = query.length === 0;

    if (!query) {
      results.hidden = true;
      rows.hidden = false;
      hero.hidden = false;
      return;
    }

    const matches = state.sites
      .filter(function (site) { return matchesQuery(site, query); })
      .sort(function (a, b) { return scoreOf(b.id) - scoreOf(a.id); });

    hero.hidden = true;
    rows.hidden = true;
    results.hidden = false;

    $('#resultsTitle').innerHTML = 'Results for “<span>' + esc(query) + '</span>” — ' + matches.length;
    $('#resultsEmpty').hidden = matches.length > 0;

    const grid = $('#resultsGrid');
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    matches.forEach(function (site) { fragment.appendChild(cardEl(site)); });
    grid.appendChild(fragment);
  }

  /* ==========================================================================
     11. OPENING A SITE + DETAIL MODAL
     ========================================================================== */

  /* Sandboxed preview iframes (sandbox="allow-scripts" without allow-popups)
     deny window.open() and log a browser warning. An opaque-origin document
     reports window.origin === "null", so we can spot that case up front and go
     straight to the same-tab fallback instead of triggering the warning. */
  function sandboxedPreview() {
    const opaqueOrigin = typeof window.origin === 'string' && window.origin === 'null';
    const framed = window.top !== window.self;
    return opaqueOrigin && framed;
  }

  /* The destination URL exists only in this closure / storage. It is never
     written into an href, a data attribute, or the visible page text. */
  function launch(url) {
    if (sandboxedPreview()) return false;

    let win = null;
    try {
      win = window.open(url, '_blank');
    } catch (err) {
      win = null;
    }

    if (win) {
      try { win.opener = null; } catch (err) { /* cross-origin: fine */ }
      try { win.focus(); } catch (err) { /* noop */ }
      return true;
    }
    return false;
  }

  function visitSite(siteId) {
    const site = siteById(siteId);
    if (!site) return;

    const opened = launch(site.url);

    if (opened) {
      recordVisit(siteId);      /* only log a visit that actually happened */
      toast('Opening ' + site.name + ' in a new tab.', 'good');
      checkMilestones('visit', siteId);
    } else {
      /* Sandboxed preview iframes (and strict browser settings) block pop-ups.
         Offer a same-tab open instead of leaving the user stuck. */
      openLaunchFallback(site);
    }
  }

  function openLaunchFallback(site) {
    state.pendingLaunch = site.id;

    const sandboxed = sandboxedPreview();
    $('#launchTitle').textContent = sandboxed ? 'Preview panel blocks new tabs' : 'Pop-ups are blocked';
    $('#launchText').textContent = sandboxed
      ? 'This embedded preview cannot open ' + site.name + ' in a new tab.'
      : 'Your browser blocked the new tab for ' + site.name + '.';
    $('#launchHint').textContent = sandboxed
      ? 'Open it in this panel instead — reload the preview afterwards to come back to ELSEWHERE. In a normal browser tab, tiles open in a new tab as expected.'
      : 'You can open the site in this tab instead. Use the browser back button to return to ELSEWHERE.';

    openModal('launchModal');
    window.setTimeout(function () { $('#launchHere').focus(); }, 240);
  }

  function paintVisitedLine(siteId) {
    const visited = lastVisited(siteId);
    const count = getHistory().filter(function (entry) { return entry.id === siteId; }).length;
    $('#detailVisited').textContent = visited
      ? 'Last opened ' + timeAgo(visited) + (count > 1 ? ' · in your recent list' : '')
      : 'Not opened on this profile yet.';
  }

  function openSiteModal(siteId) {
    const site = siteById(siteId);
    if (!site) return;

    state.detailId = siteId;
    const rating = ratingFor(siteId);

    const img = $('#detailImg');
    img.src = artFor(site, false);
    img.alt = site.name + ' artwork';
    img.setAttribute('data-fallback', site.id);

    paintDetailScore(siteId);
    $('#detailCat').textContent = categoryName(site.cat);
    $('#detailTitle').textContent = site.name;
    $('#detailDesc').textContent = site.desc;
    $('#detailIssues').textContent = site.issues || 'No known issues reported by the community yet.';
    $('#detailOpen').dataset.open = site.id;

    paintVisitedLine(siteId);
    renderRateBlock(siteId);
    renderFeedback(siteId);
    $('#fbText').value = '';
    $('#fbLeft').textContent = '280';
    openModal('siteModal');
  }

  function renderRateBlock(siteId) {
    const rating = ratingFor(siteId);
    const mine = myVotes(siteId);
    const container = $('#rateCriteria');

    container.innerHTML = rating.criteria.map(function (crit) {
      const buttons = crit.options.map(function (label, index) {
        const on = mine[crit.id] === index;
        const tone = RATING_TONES[index];
        return '<button class="seg-btn seg-btn--' + tone + (on ? ' is-on' : '') + '" type="button" ' +
               'data-vote="' + esc(crit.id) + '" data-opt="' + index + '" ' +
               'aria-pressed="' + (on ? 'true' : 'false') + '" ' +
               'aria-label="' + esc(crit.label + ': ' + label) + '">' + esc(label) + '</button>';
      }).join('');

      /* Which position is winning the vote — a colour dot spells it out.
         With no votes yet there is no winner to show, so the row renders bare
         instead of inventing a 0% consensus. */
      const topTone = RATING_TONES[crit.topIndex] || 'okay';
      const topBit = crit.total
        ? '<span class="crit-top tone-' + topTone + '"><i></i>' + esc(crit.topLabel) +
          ' · ' + crit.topPct + '% of votes</span>'
        : '<span class="crit-top is-empty">No votes yet</span>';
      const barWidth = crit.score === null ? 0 : Math.max(2, crit.score * 10);

      return '<div class="crit">' +
               '<div class="crit-head">' +
                 '<span class="crit-name">' + esc(crit.label) +
                   '<em class="crit-hint">' + esc(crit.hint || '') + '</em>' +
                 '</span>' +
                 topBit +
               '</div>' +
               '<div class="bar"><i style="width:' + barWidth + '%"></i></div>' +
               '<div class="seg">' + buttons + '</div>' +
             '</div>';
    }).join('');

    const ratedCount = Object.keys(mine).length;
    const summary = $('#rateSummary');

    if (ratedCount === 0) {
      summary.innerHTML = 'You have not rated <strong>' + esc(siteById(siteId).name) + '</strong> yet. ' +
        'Scores are the average of every profile rating it on this device.';
    } else {
      const scoreBit = rating.overall === null
        ? 'No community score yet — yours is the first.'
        : 'Overall score: <strong>' + formatScore(rating.overall) + '/10</strong> from ' +
          rating.votes + (rating.votes === 1 ? ' rating.' : ' ratings.');
      summary.innerHTML = 'You rated <strong>' + ratedCount + ' of ' + CRITERIA.length + '</strong> rows. ' + scoreBit;
    }
  }

  /* ==========================================================================
     12. AUTH MODAL
     ========================================================================== */
  let authReturnFocus = null;

  function openAuth(mode) {
    state.authMode = mode === 'signup' ? 'signup' : mode === 'login' ? 'login' : defaultAuthMode();
    setAuthMode(state.authMode);
    $('#authError').hidden = true;
    $('#authForm').reset();
    paintStorageWarning();
    openModal('authModal');
    window.setTimeout(function () { $('#authEmail').focus(); }, 240);
  }

  /** The "Log in" dead end, one click away from success: keep the address the
      visitor typed and switch the sheet to Sign up. */
  function switchToSignupKeepingEmail() {
    const email = $('#authEmail').value.trim();
    setAuthMode('signup');
    $('#authEmail').value = email;
    $('#authPassword').value = '';
    $('#authTitle').textContent = 'Make an ELSEWHERE profile';
    $('#authName').focus();
  }

  /** No accounts in this browser yet? Then "Log in" can only ever fail, so
      open the sheet on Sign up instead of making the visitor guess. */
  function defaultAuthMode() {
    const users = Store.get(KEY.users, []) || [];
    return users.length ? 'login' : 'signup';
  }

  function paintStorageWarning() {
    const warn = $('#authStorageWarn');
    if (!warn) return;
    const blocked = !Store.available();
    warn.hidden = !blocked;
    if (blocked) {
      warn.textContent = 'This preview cannot save data — accounts will disappear on reload. ' +
        'Open the site in its own browser tab (or download the files and open index.html) to create the owner account.';
    }
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    const isSignup = mode === 'signup';

    $$('[data-auth-tab]').forEach(function (tab) {
      const active = tab.dataset.authTab === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    $('#nameField').hidden = !isSignup;
    $('#authSubmit').textContent = isSignup ? 'Create account' : 'Log in';
    $('#authTitle').textContent = isSignup ? 'Make an ELSEWHERE profile' : 'Welcome back';
    $('#authPassword').setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
    $('#authError').hidden = true;
    const sw = $('#authSwitchToSignup');
    if (sw) sw.hidden = true;
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const errorEl = $('#authError');
    const submit = $('#authSubmit');

    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    const name = $('#authName').value.trim();

    function fail(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('Enter a valid email address.');
    if (password.length < 8) return fail('Passwords need at least 8 characters.');

    submit.disabled = true;
    submit.textContent = state.authMode === 'signup' ? 'Hashing…' : 'Checking…';
    errorEl.hidden = true;

    try {
      if (state.authMode === 'login') {
        /* Wired so a wrong-free click on "Log in" before signing up cannot
           dead-end: the error line offers to create the account instead. */
        const known = (Store.get(KEY.users, []) || []).some(function (u) {
          return u.email === email.toLowerCase();
        });
        if (!known) {
          const sw = $('#authSwitchToSignup');
          if (sw) sw.hidden = false;
        }
      }

      if (state.authMode === 'signup') {
        /* Who becomes the owner:
             - if catalogue.js names an ownerEmail, ONLY that address can ever
               be the owner, whoever signs up first;
             - if it is blank, the first account created owns the site.
           Either way there is exactly one owner, and a second account can
           never promote itself. */
        const users = Store.get(KEY.users, []) || [];
        const ownerExists = users.some(function (u) { return u.role === 'admin'; });
        const named = hasConfiguredOwner();
        const normalEmail = String(email).trim().toLowerCase();

        let role = 'user';
        if (!ownerExists) {
          role = (named ? await isConfiguredOwnerEmail(normalEmail) : true) ? 'admin' : 'user';
        }
        const user = await Auth.createUser(email, password, name, role);

        Auth.startSession(user);
        state.user = user;
        closeModal('authModal');
        renderProfile();
        renderRows(true);
        paintEmptyState();
        checkMilestones('login');
        if (user.role === 'admin') {
          toast('Welcome, ' + user.name + '. You are the owner — admin studio is in the menu.', 'good');
        } else if (!ownerExists && named && user.role !== 'admin') {
          toast('Welcome, ' + user.name + '. This site has an owner already, so this account can browse, rate and write notes.', '');
        } else {
          toast('Welcome, ' + user.name + '. Your profile is ready.', 'good');
        }
      } else {
        const user = await Auth.verify(email, password);
        Auth.startSession(user);
        state.user = user;
        closeModal('authModal');
        renderProfile();
        renderRows(true);
        checkMilestones('login');
        toast('Signed in as ' + user.email + '.', 'good');
      }
    } catch (err) {
      fail(err && err.message ? err.message : 'Something went wrong. Try again.');
    } finally {
      /* Restore the button label by hand: calling setAuthMode() here would wipe
         the error message we just displayed. */
      submit.disabled = false;
      submit.textContent = state.authMode === 'signup' ? 'Create account' : 'Log in';
    }
  }

  function logout() {
    Auth.logout();
    state.user = null;
    toggleMenu(false);
    renderProfile();
    renderRows(false);
    toast('Signed out. Browsing as a guest.');
  }

  /* ==========================================================================
     13. ADMIN STUDIO
     ========================================================================== */
  function openAdmin() {
    if (!state.user || state.user.role !== 'admin') {
      toast('Admin access only.', 'bad');
      return;
    }
    $('#adminFilter').value = '';
    state.adminFilter = '';
    paintPublishStatus();
    setAdminTab('library');
    renderAdminTable();
    openModal('adminModal');
  }

  function setAdminTab(tab) {
    $$('[data-admin-tab]').forEach(function (btn) {
      const active = btn.dataset.adminTab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('[data-admin-panel]').forEach(function (panel) {
      panel.hidden = panel.dataset.adminPanel !== tab;
    });

    if (tab === 'popups') {
      fillPopupSiteSelect();
      renderPopupList();
      if (!state.editingPopup) resetPopupForm();
    }
  }

  function renderAdminTable() {
    const body = $('#adminRows');
    const filter = state.adminFilter.toLowerCase();

    const rows = state.sites.filter(function (site) {
      if (!filter) return true;
      return site.name.toLowerCase().indexOf(filter) > -1 ||
             categoryName(site.cat).toLowerCase().indexOf(filter) > -1 ||
             (site.desc || '').toLowerCase().indexOf(filter) > -1;
    });

    $('#adminCount').textContent = rows.length + (rows.length === 1 ? ' site' : ' sites');

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" style="padding:22px;color:var(--muted)">No sites match that filter.</td></tr>';
      return;
    }

    body.innerHTML = rows.map(function (site) {
      return '<tr>' +
        '<td>' +
          '<div class="cell-site">' +
            '<img class="cell-thumb" src="' + esc(artFor(site, false)) + '" alt="" loading="lazy" data-fallback="' + esc(site.id) + '" onerror="ELSEWHERE.fallbackArt&&ELSEWHERE.fallbackArt(this)" />' +
            '<div><span class="cell-name">' + esc(site.name) + (site.featured ? ' ★' : '') + '</span>' +
            '<span class="cell-sub">' + esc(site.desc) + '</span></div>' +
          '</div>' +
        '</td>' +
        '<td><span class="pill-cat">' + esc(categoryName(site.cat)) + '</span></td>' +
        '<td><span class="pill-cat">' + formatScore(scoreOf(site.id)) + '</span></td>' +
        '<td><span class="pill-cat fb-pill' + (feedbackFor(site.id).length ? ' has-fb' : '') + '">' +
          feedbackFor(site.id).length + ' note' + (feedbackFor(site.id).length === 1 ? '' : 's') + '</span></td>' +
        '<td><span class="pill-lock" title="Destination stored, never rendered">' +
          '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 7V5.2a2 2 0 014 0V7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>' +
          'stored</span></td>' +
        '<td class="right">' +
          '<button class="icon-action" type="button" data-edit="' + esc(site.id) + '" aria-label="Edit ' + esc(site.name) + '">✎</button>' +
          '<button class="icon-action danger" type="button" data-delete="' + esc(site.id) + '" aria-label="Delete ' + esc(site.name) + '">✕</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function fillCategorySelect() {
    $('#f-cat').innerHTML = state.categories.map(function (cat) {
      return '<option value="' + esc(cat.id) + '">' + esc(cat.name) + '</option>';
    }).join('');
  }

  function resetSiteForm() {
    state.editingId = null;
    $('#siteForm').reset();
    $('#f-id').value = '';
    $('#editorTitle').textContent = 'Add a new site';
    $('#siteSubmit').textContent = 'Save site';
    $('#siteError').hidden = true;
    fillCategorySelect();
  }

  function editSite(siteId) {
    const site = siteById(siteId);
    if (!site) return;

    fillCategorySelect();
    state.editingId = siteId;
    $('#editorTitle').textContent = 'Editing “' + site.name + '”';
    $('#siteSubmit').textContent = 'Update site';
    $('#f-id').value = site.id;
    $('#f-name').value = site.name;
    $('#f-cat').value = site.cat;
    $('#f-url').value = site.url;
    $('#f-image').value = site.image || '';
    $('#f-desc').value = site.desc;
    $('#f-issues').value = site.issues || '';
    $('#f-featured').checked = !!site.featured;
    $('#siteError').hidden = true;
    setAdminTab('editor');
  }

  function persistSites() {
    Store.set(KEY.sites, state.sites);
    Store.set(KEY.categories, state.categories);
    Store.set(KEY.draft, true);          /* unpublished until exported */
    paintPublishStatus();
    paintEmptyState();
    ratingCache.clear();
    renderNav();
    renderRows(true);
    renderHero();
    renderAdminTable();
    $('#footCount').textContent = state.sites.length + ' sites · ' + state.categories.length + ' categories';
  }

  function handleSiteSubmit(event) {
    /* Cancel the native form submit FIRST. If the guard returned before this
       line, a member pressing the button would navigate the page away instead
       of just being told no. */
    event.preventDefault();
    if (!requireAdmin('add or edit sites')) return;
    const errorEl = $('#siteError');

    const name = $('#f-name').value.trim();
    const cat = $('#f-cat').value;
    const url = $('#f-url').value.trim();
    const image = $('#f-image').value.trim();
    const desc = $('#f-desc').value.trim();
    const issues = $('#f-issues').value.trim();
    const featured = $('#f-featured').checked;

    if (!name) return showSiteError('A name is required.');
    if (!/^https?:\/\/.+\..+/i.test(url)) return showSiteError('The link must be a full http(s) URL.');
    if (!desc) return showSiteError('Add a short description of the specialty.');

    errorEl.hidden = true;

    if (state.editingId) {
      const site = siteById(state.editingId);
      if (site) {
        site.name = name;
        site.cat = cat;
        site.url = url;
        site.image = image;
        site.desc = desc;
        site.issues = issues;
        site.featured = featured;
      }
      toast('Updated ' + name + '.', 'good');
    } else {
      let id = slugify(name);
      let suffix = 2;
      while (siteById(id)) { id = slugify(name) + '-' + suffix; suffix++; }

      state.sites.push({
        id: id, name: name, cat: cat, url: url, image: image,
        desc: desc, issues: issues, featured: featured, addedAt: Date.now()
      });
      toast('Added ' + name + ' to ' + categoryName(cat) + '.', 'good');
    }

    persistSites();
    resetSiteForm();
    setAdminTab('library');
    state.heroIds = pickHeroIds();
  }

  function showSiteError(message) {
    const errorEl = $('#siteError');
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function deleteSite(siteId) {
    const site = siteById(siteId);
    if (!site) return;

    confirmAction(
      'Delete ' + site.name + '?',
      'This removes the tile, its ratings baseline and its place in every row. It cannot be undone.',
      function () {
        state.sites = state.sites.filter(function (s) { return s.id !== siteId; });

        /* Clean up dependent records so nothing dangles. */
        const allRatings = getAllRatings();
        delete allRatings[siteId];
        Store.set(KEY.ratings, allRatings);

        const historyMap = getHistoryMap();
        Object.keys(historyMap).forEach(function (uid) {
          historyMap[uid] = (historyMap[uid] || []).filter(function (entry) { return entry.id !== siteId; });
        });
        Store.set(KEY.history, historyMap);

        state.heroIds = state.heroIds.filter(function (id) { return id !== siteId; });
        if (!state.heroIds.length) state.heroIds = pickHeroIds();

        persistSites();
        renderAdminTable();
        toast('Deleted ' + site.name + '.');
      }
    );
  }

  /* ---- Empty catalogue ----------------------------------------------------
     A published catalogue with zero sites is a legitimate state (that is what
     a brand-new install looks like before you add anything). Rather than an
     empty page with a broken hero, show a short, honest next step.
     ------------------------------------------------------------------------ */
  function paintEmptyState() {
    const wrap = $('#emptyCatalogue');
    const hero = $('#hero');
    const rows = $('#rows');
    const isEmpty = state.sites.length === 0;

    if (wrap) wrap.hidden = !isEmpty;
    if (hero) hero.hidden = isEmpty;
    if (rows) rows.hidden = isEmpty;

    const button = $('#emptyAdmin');
    const hint = $('#emptyHint');
    if (!isEmpty || !button) return;

    const isAdmin = !!(state.user && state.user.role === 'admin');
    const named = hasConfiguredOwner();

    if (isAdmin) {
      button.hidden = false;
      button.textContent = 'Add the first site';
      if (hint) hint.textContent = 'Admin studio → Add / Edit. Publish when you are ready to show it to everyone.';
      return;
    }

    if (state.user) {
      /* Signed in, but not the owner: say so plainly instead of showing a
         button that leads to a refusal. */
      button.hidden = true;
      if (hint) {
        hint.textContent = 'You are signed in as a member — you can browse, rate and write notes. ' +
          'Only the owner account can add sites.';
      }
      return;
    }

    button.hidden = false;
    button.textContent = 'Sign in to add sites';
    if (hint) {
      hint.textContent = named
        ? 'Only the owner account can add sites — sign in with the owner email.'
        : 'Sign in, then the first account created becomes the owner and can publish destinations for everyone.';
    }
  }

  /* ---- Drafts & publishing ------------------------------------------------
     Admin edits are written to localStorage so a refresh never loses them, and
     the draft flag makes them win over catalogue.js until you publish. The
     Publish tab exports exactly the file the live site reads.
     ------------------------------------------------------------------------ */
  function markDraft(reason) {
    Store.set(KEY.draft, true);
    paintPublishStatus();
    if (reason) toast(reason, '');
  }

  function paintPublishStatus() {
    const el = $('#publishStatus');
    if (!el) return;

    const source = state.catalogueSource;
    const count = state.sites.length + (state.sites.length === 1 ? ' site' : ' sites');

    if (isDraft()) {
      el.textContent = '⚠ Showing your unpublished draft — ' + count + '. Download catalogue.js to make it live.';
      el.className = 'publish-status is-draft';
    } else if (source === 'published') {
      el.textContent = '✓ Showing the published catalogue.js — ' + count + '.';
      el.className = 'publish-status is-live';
    } else if (source === 'cache') {
      el.textContent = 'Showing the copy cached in this browser — ' + count + '.';
      el.className = 'publish-status';
    } else {
      el.textContent = 'catalogue.js could not be read, so the offline starter list is on screen.';
      el.className = 'publish-status is-draft';
    }
  }

  function downloadFile(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* The publish file: categories + sites, in the documented shape. */
  function buildCatalogueDoc() {
    return {
      version: 1,
      updated: new Date().toISOString().slice(0, 10),
      about: 'The whole catalogue for ELSEWHERE. Edit, commit, push — every visitor sees it.',
      categories: state.categories.map(function (cat) {
        return { id: cat.id, name: cat.name, accent: cat.accent, blurb: cat.blurb || '' };
      }),
      sites: state.sites.map(function (site) {
        const row = {
          id: site.id,
          name: site.name,
          category: site.cat,
          link: site.url,
          description: site.desc
        };
        if (site.issues) row.issues = site.issues;
        if (site.featured) row.featured = true;
        if (site.image) row.image = site.image;
        return row;
      })
    };
  }

  function exportCatalogue() {
    const header = '/* ELSEWHERE catalogue — replace catalogue.js with this file to publish.\n' +
      '   Generated ' + new Date().toISOString() + ' */\n';
    downloadFile('catalogue.js', header + 'window.ELSEWHERE_CATALOGUE = ' +
      JSON.stringify(buildCatalogueDoc(), null, 2) + ';\n');
    toast('catalogue.js downloaded — replace the file on your host to publish.', 'good');
  }

  function exportBackup() {
    const dump = {
      exported: new Date().toISOString(),
      note: 'Private backup: includes this browser only data (votes, notes, accounts, pop-ups).',
      catalogue: buildCatalogueDoc(),
      ratings: Store.get(KEY.ratings, {}),
      feedback: Store.get(KEY.feedback, {}),
      history: Store.get(KEY.history, {}),
      popups: Store.get(KEY.popups, [])
    };
    downloadFile('elsewhere-backup-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify(dump, null, 2) + '\n');
    toast('Backup downloaded.', 'good');
  }

  async function discardDraft() {
    Store.set(KEY.draft, false);
    Store.remove(KEY.sites);
    Store.remove(KEY.categories);
    toast('Draft discarded — reloading the published catalogue.');
    window.setTimeout(function () { window.location.reload(); }, 600);
  }

  /* ---- Bulk import -------------------------------------------------------- */
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
      } else if (ch !== '\r') {
        cell += ch;
      }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }

    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  function normaliseImportedRecord(raw) {
    const pick = function (keys) {
      for (let i = 0; i < keys.length; i++) {
        const value = raw[keys[i]];
        if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
      }
      return '';
    };

    return {
      name: pick(['name', 'title', 'site']),
      category: pick(['category', 'cat', 'topic', 'group']),
      link: pick(['link', 'url', 'href', 'destination']),
      image: pick(['image', 'cover', 'poster', 'thumbnail']),
      description: pick(['description', 'desc', 'specialty', 'summary']),
      issues: pick(['issues', 'issue', 'notes', 'known_issues', 'problems']),
      featured: /^(true|yes|1)$/i.test(pick(['featured', 'hero', 'top']))
    };
  }

  function ensureCategory(rawName) {
    const name = (rawName || 'Unsorted').trim();
    const existing = state.categories.find(function (cat) {
      return cat.id === slugify(name) || cat.name.toLowerCase() === name.toLowerCase();
    });
    if (existing) return existing.id;

    const cat = {
      id: slugify(name),
      name: name,
      accent: ACCENTS[state.categories.length % ACCENTS.length],
      blurb: ''
    };
    state.categories.push(cat);
    return cat.id;
  }

  function runImport() {
    const report = $('#impReport');
    const raw = $('#impText').value.trim();
    const format = $('#impFormat').value;

    if (!raw) {
      report.hidden = false;
      report.textContent = 'Nothing to import — paste JSON or CSV first.';
      return;
    }

    let records = [];

    try {
      const looksJson = format === 'json' || (format === 'auto' && (raw.charAt(0) === '[' || raw.charAt(0) === '{'));

      if (looksJson) {
        const parsed = JSON.parse(raw);
        records = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        const rows = parseCSV(raw);
        if (!rows.length) throw new Error('CSV appears to be empty.');
        const header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
        records = rows.slice(1).map(function (cells) {
          const obj = {};
          header.forEach(function (key, index) { obj[key] = cells[index]; });
          return obj;
        });
      }
    } catch (err) {
      report.hidden = false;
      report.textContent = '✕ Could not parse the input: ' + err.message;
      return;
    }

    const added = [];
    const updated = [];
    const skipped = [];

    records.forEach(function (rawRecord, index) {
      const record = normaliseImportedRecord(rawRecord || {});
      const label = record.name || 'row ' + (index + 1);

      if (!record.name || !record.link || !record.description) {
        skipped.push(label + ' (missing name, link or description)');
        return;
      }
      if (!/^https?:\/\//i.test(record.link)) {
        skipped.push(label + ' (link must start with http/https)');
        return;
      }

      const catId = ensureCategory(record.category);
      const existing = state.sites.find(function (site) {
        return site.name.toLowerCase() === record.name.toLowerCase();
      });

      if (existing) {
        existing.cat = catId;
        existing.url = record.link;
        existing.image = record.image;
        existing.desc = record.description;
        existing.issues = record.issues;
        existing.featured = record.featured || existing.featured;
        updated.push(record.name);
      } else {
        let id = slugify(record.name);
        let suffix = 2;
        while (siteById(id)) { id = slugify(record.name) + '-' + suffix; suffix++; }

        state.sites.push({
          id: id,
          name: record.name,
          cat: catId,
          url: record.link,
          image: record.image,
          desc: record.description,
          issues: record.issues,
          featured: record.featured,
          addedAt: Date.now()
        });
        added.push(record.name);
      }
    });

    persistSites();
    state.heroIds = pickHeroIds();
    renderAdminTable();

    report.hidden = false;
    report.textContent =
      '✓ Import finished\n' +
      '  added:   ' + added.length + (added.length ? ' → ' + added.join(', ') : '') + '\n' +
      '  updated: ' + updated.length + (updated.length ? ' → ' + updated.join(', ') : '') + '\n' +
      '  skipped: ' + skipped.length + (skipped.length ? '\n    · ' + skipped.join('\n    · ') : '');

    toast('Imported ' + added.length + ' new and updated ' + updated.length + '.', added.length || updated.length ? 'good' : 'bad');
  }

  const SAMPLE_IMPORT =
    'name,category,link,image,description,issues,featured\n' +
    'Hacker News,news,https://news.ycombinator.com,,Crowd-ranked tech links.,Threads get heated fast.,false\n' +
    'Squoosh,tools,https://squoosh.app,,Visual image compression with live comparison.,Large images are capped.,true\n';

  /* ==========================================================================
     13b. FEEDBACK  (short written notes attached to a site)
     --------------------------------------------------------------------------
     Model: feedback[siteId] = [{ id, uid, name, text, at }]

     PRODUCTION: replace with a real table (site_id, user_id, body, created_at)
     behind POST /sites/:id/feedback and DELETE /feedback/:id, with moderation
     on the server rather than "who is logged in locally".
     ========================================================================== */
  function getAllFeedback() { return Store.get(KEY.feedback, {}); }

  function feedbackFor(siteId) {
    const all = getAllFeedback();
    return (all[siteId] || []).slice().sort(function (a, b) { return b.at - a.at; });
  }

  function postFeedback(siteId, text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (clean.length < 3) return false;
    if (!siteById(siteId)) return false;

    const all = getAllFeedback();
    if (!all[siteId]) all[siteId] = [];
    all[siteId].push({
      id: 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      uid: currentUid(),
      name: state.user ? state.user.name : 'Guest',
      text: clean,
      at: Date.now()
    });
    Store.set(KEY.feedback, all);
    return true;
  }

  function deleteFeedback(siteId, fbId) {
    const all = getAllFeedback();
    const entry = (all[siteId] || []).find(function (f) { return f.id === fbId; });
    if (!entry) return;

    const mine = entry.uid === currentUid();
    const isAdmin = !!(state.user && state.user.role === 'admin');
    if (!mine && !isAdmin) return;

    all[siteId] = all[siteId].filter(function (f) { return f.id !== fbId; });
    Store.set(KEY.feedback, all);
    renderFeedback(siteId);
    renderAdminTable();
  }

  function renderFeedback(siteId) {
    const list = feedbackFor(siteId);
    const isAdmin = !!(state.user && state.user.role === 'admin');

    $('#fbCount').textContent = list.length;
    $('#fbWho').textContent = 'Posting as ' + (state.user ? state.user.name : 'Guest');
    $('#fbLeft').textContent = String(280 - $('#fbText').value.length);

    const host = $('#fbList');
    if (!list.length) {
      host.innerHTML = '<p class="fb-empty">No feedback yet — be the first to leave a note about ' +
        esc(siteById(siteId).name) + '.</p>';
      return;
    }

    host.innerHTML = list.slice(0, 20).map(function (item) {
      const own = item.uid === currentUid();
      const canDelete = own || isAdmin;
      return '<article class="fb-item">' +
        '<span class="fb-avatar" aria-hidden="true">' + esc((item.name || 'G').trim().charAt(0).toUpperCase()) + '</span>' +
        '<div class="fb-main">' +
          '<p class="fb-meta"><strong>' + esc(item.name) + '</strong>' +
            (own ? '<span class="fb-you">you</span>' : '') +
            '<span class="fb-when">' + timeAgo(item.at) + '</span></p>' +
          '<p class="fb-text">' + esc(item.text) + '</p>' +
        '</div>' +
        (canDelete
          ? '<button class="fb-del" type="button" data-fb-del="' + esc(item.id) + '" ' +
            'aria-label="Delete this feedback">&times;</button>'
          : '') +
      '</article>';
    }).join('');

    if (list.length > 20) {
      host.innerHTML += '<p class="fb-more">Showing the 20 newest of ' + list.length + ' notes.</p>';
    }
  }

  /* ==========================================================================
     13c. POP-UPS / ANNOUNCEMENTS
     --------------------------------------------------------------------------
     An admin writes a pop-up at any time; each visitor sees it once, and only
     once, after the intro has finished. Nothing is pre-written — a fresh
     install has no pop-ups at all.
     Model: popups = [{ id, title, body, tone, siteId, active, createdAt }]
     ========================================================================== */
  function getPopups() { return Store.get(KEY.popups, []); }
  function setPopups(list) { Store.set(KEY.popups, list); }
  function getSeenPopups() { return Store.get(KEY.popupSeen, {}); }

  function markPopupSeen(popupId) {
    const map = getSeenPopups();
    const uid = currentUid();
    const list = (map[uid] || []).filter(function (id) { return id !== popupId; });
    list.push(popupId);
    map[uid] = list.slice(-40);
    Store.set(KEY.popupSeen, map);
  }

  function nextUnseenPopup() {
    const seen = getSeenPopups()[currentUid()] || [];
    return getPopups().filter(function (popup) {
      return popup.active && seen.indexOf(popup.id) === -1;
    })[0] || null;
  }

  function toneLabel(tone) {
    if (tone === 'warn') return 'Known issue';
    if (tone === 'info') return 'Heads up';
    return 'Update';
  }

  function showAnnouncement(popup, isPreview) {
    if (!popup) return;

    const badge = $('#announceBadge');
    badge.textContent = toneLabel(popup.tone);
    badge.className = 'announce-badge tone-' + (popup.tone || 'update');

    $('#announceTitle').textContent = popup.title;
    $('#announceBody').textContent = popup.body;

    const site = popup.siteId ? siteById(popup.siteId) : null;
    const openBtn = $('#announceOpen');

    state.announceSiteId = site ? site.id : '';
    state.announceAction = '';

    if (site && popup.action === 'detail') {
      state.announceAction = 'detail';
      openBtn.textContent = 'Rate ' + site.name;
    } else if (site) {
      state.announceAction = 'site';
      openBtn.textContent = 'Open ' + site.name;
    } else if (popup.action === 'auth') {
      state.announceAction = 'auth';
      openBtn.textContent = 'Create an account';
    } else if (popup.action === 'admin') {
      state.announceAction = 'admin';
      openBtn.textContent = 'Open admin studio';
    }

    openBtn.hidden = !state.announceAction;

    if (!isPreview) {
      if (popup.milestone) markMilestoneSeen(popup.id);
      else markPopupSeen(popup.id);
    }
    openModal('announceModal');
  }

  /* Show one admin-written pop-up if there is an unseen one. Returns true when
     something was actually shown, so the caller can start the quiet gap. */
  function maybeShowAnnouncement() {
    const popup = nextUnseenPopup();
    if (!popup) return false;
    showAnnouncement(popup, false);
    return true;
  }

  function renderPopupList() {
    const list = getPopups();
    const host = $('#popList');

    if (!list.length) {
      host.innerHTML = '<p class="pop-empty">No pop-ups yet. Write one above — it will greet visitors ' +
        'once, right after the intro.</p>';
      return;
    }

    host.innerHTML = list.slice().reverse().map(function (popup) {
      return '<div class="pop-row">' +
        '<div class="pop-row-main">' +
          '<strong>' + esc(popup.title) + '</strong>' +
          '<span class="pop-row-body">' + esc(popup.body) + '</span>' +
        '</div>' +
        '<span class="pop-status' + (popup.active ? ' is-live' : '') + '">' +
          (popup.active ? 'Live' : 'Hidden') + '</span>' +
        '<div class="pop-row-actions">' +
          '<button class="icon-action" type="button" data-pop-preview="' + esc(popup.id) + '" aria-label="Preview pop-up">◉</button>' +
          '<button class="icon-action" type="button" data-pop-edit="' + esc(popup.id) + '" aria-label="Edit pop-up">✎</button>' +
          '<button class="icon-action" type="button" data-pop-toggle="' + esc(popup.id) + '" aria-label="Show or hide pop-up">' +
            (popup.active ? '❚❚' : '▶') + '</button>' +
          '<button class="icon-action danger" type="button" data-pop-del="' + esc(popup.id) + '" aria-label="Delete pop-up">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function fillPopupSiteSelect() {
    $('#p-site').innerHTML = '<option value="">— none —</option>' + state.sites.map(function (site) {
      return '<option value="' + esc(site.id) + '">' + esc(site.name) + '</option>';
    }).join('');
  }

  function resetPopupForm() {
    state.editingPopup = null;
    $('#p-id').value = '';
    $('#p-title').value = '';
    $('#p-body').value = '';
    $('#p-tone').value = 'update';
    $('#p-site').value = '';
    $('#p-active').checked = true;
    $('#popError').hidden = true;
    $('#popEditorTitle').textContent = 'New pop-up';
    $('#popSave').textContent = 'Save pop-up';
    fillPopupSiteSelect();
  }

  function editPopup(popupId) {
    const popup = getPopups().find(function (p) { return p.id === popupId; });
    if (!popup) return;

    fillPopupSiteSelect();
    state.editingPopup = popupId;
    $('#p-id').value = popup.id;
    $('#p-title').value = popup.title;
    $('#p-body').value = popup.body;
    $('#p-tone').value = popup.tone || 'update';
    $('#p-site').value = popup.siteId || '';
    $('#p-active').checked = !!popup.active;
    $('#popEditorTitle').textContent = 'Editing “' + popup.title + '”';
    $('#popSave').textContent = 'Update pop-up';
    $('#popError').hidden = true;
  }

  function savePopupFromForm() {
    const title = $('#p-title').value.trim();
    const body = $('#p-body').value.trim();
    const tone = $('#p-tone').value;
    const siteId = $('#p-site').value;
    const active = $('#p-active').checked;
    const errorEl = $('#popError');

    if (!title) { errorEl.textContent = 'Give the pop-up a title.'; errorEl.hidden = false; return; }
    if (!body) { errorEl.textContent = 'Add a short message.'; errorEl.hidden = false; return; }
    errorEl.hidden = true;

    const list = getPopups();

    if (state.editingPopup) {
      const popup = list.find(function (p) { return p.id === state.editingPopup; });
      if (popup) {
        popup.title = title;
        popup.body = body;
        popup.tone = tone;
        popup.siteId = siteId;
        popup.active = active;
      }
      toast('Pop-up updated.', 'good');
    } else {
      list.push({
        id: 'pop_' + Date.now().toString(36),
        title: title,
        body: body,
        tone: tone,
        siteId: siteId,
        active: active,
        createdAt: Date.now()
      });
      toast(active ? 'Pop-up is live for visitors.' : 'Pop-up saved as hidden.', 'good');
    }

    setPopups(list);
    renderPopupList();
    resetPopupForm();
  }

  function showPopupPreviewFromForm() {
    const draft = {
      id: 'preview',
      title: $('#p-title').value.trim() || 'Your pop-up title',
      body: $('#p-body').value.trim() || 'Your message appears here for visitors.',
      tone: $('#p-tone').value,
      siteId: $('#p-site').value
    };
    showAnnouncement(draft, true);
  }

  /* ==========================================================================
     13d. WHEN POP-UPS APPEAR  (the editorial rules)
     --------------------------------------------------------------------------
     Nobody likes a site that interrupts every 30 seconds, so pop-ups are tied
     to real milestones and each one is shown exactly ONCE per profile:

       welcome      → first ever session, 3s after the intro
       first-visit  → just after the first site you open
       search       → once you have opened 4 different sites
       account      → after 6 visits, and only while browsing as a guest
       admin        → the first time an admin signs in

     Rules: never on top of an open dialog, never two in a row, at least 20
     seconds apart, and only after the splash has finished. Anything an admin
     writes in Admin studio takes priority over the built-in ones.
     ========================================================================== */
  const KEY_MILESTONE = 'elsewhere.v3.milestones';
  const POPUP_GAP_MS = 20000;

  let popupQueue = [];      /* [{ id, at }] */
  let popupTimer = null;
  let lastPopupAt = 0;

  function seenMilestoneMap() { return Store.get(KEY_MILESTONE, {}); }

  function milestoneSeen(id) {
    return (seenMilestoneMap()[currentUid()] || []).indexOf(id) > -1;
  }

  function markMilestoneSeen(id) {
    const map = seenMilestoneMap();
    const uid = currentUid();
    const list = (map[uid] || []).filter(function (entry) { return entry !== id; });
    list.push(id);
    map[uid] = list.slice(-40);
    Store.set(KEY_MILESTONE, map);
  }

  const MILESTONES = {
    welcome: {
      popup: function () {
        return {
          id: 'welcome', milestone: true, tone: 'info',
          title: 'Welcome to ELSEWHERE',
          body: 'Every tile is a real website. Click one and it opens in a new tab — you never ' +
                'see a link. Tap the ⓘ on any tile to rate it or leave a note.'
        };
      }
    },
    'first-visit': {
      popup: function (siteId) {
        return {
          id: 'first-visit', milestone: true, tone: 'update',
          title: 'Saved to Recently used',
          body: 'The site you just opened is now pinned to the top of the page, newest first. ' +
                'Rate it once and the catalogue starts learning what is actually good.',
          siteId: siteId, action: 'detail'
        };
      }
    },
    search: {
      popup: function () {
        return {
          id: 'search', milestone: true, tone: 'info',
          title: 'Find things faster',
          body: 'Press / anywhere to jump into search. Try a mood ("ambient"), a topic ("chess") ' +
                'or just the name of a site.'
        };
      }
    },
    account: {
      popup: function () {
        return {
          id: 'account', milestone: true, tone: 'info',
          title: 'Keep your own history',
          body: 'You are browsing as a guest. Create a free account — just an email and a ' +
                'password — and your ratings and Recently used stay separate from everyone else on this device.',
          action: 'auth'
        };
      }
    },
    admin: {
      popup: function () {
        return {
          id: 'admin', milestone: true, tone: 'update',
          title: 'You have the keys',
          body: 'Admin studio lives in the avatar menu: add or edit sites, bulk-import JSON or CSV, ' +
                'and write pop-ups exactly like this one.',
          action: 'admin'
        };
      }
    }
  };

  function offerMilestone(id, delayMs, arg) {
    if (milestoneSeen(id)) return;
    if (popupQueue.some(function (entry) { return entry.id === id; })) return;
    popupQueue.push({ id: id, at: Date.now() + (delayMs || 2500), arg: arg });
    drainPopupQueue();
  }

  /* One pop-up at a time, only when the screen is quiet. */
  function drainPopupQueue() {
    if (popupTimer) return;

    popupTimer = window.setInterval(function () {
      if (!popupQueue.length) {
        window.clearInterval(popupTimer); popupTimer = null; return;
      }
      if (!state.splashDone) return;
      if ($('.modal.is-open')) return;
      if (Date.now() - lastPopupAt < POPUP_GAP_MS) return;

      const next = popupQueue[0];
      if (Date.now() < next.at) return;

      popupQueue.shift();
      window.clearInterval(popupTimer); popupTimer = null;

      if (milestoneSeen(next.id)) { drainPopupQueue(); return; }
      const def = MILESTONES[next.id];
      if (!def) { drainPopupQueue(); return; }

      lastPopupAt = Date.now();
      showAnnouncement(def.popup(next.arg), false);
    }, 700);
  }

  /* Called whenever the visitor does something worth acknowledging. */
  function checkMilestones(context, siteId) {
    const visits = getHistory().length;

    if (context === 'visit') {
      if (visits === 1) offerMilestone('first-visit', 2600, siteId);
      if (visits >= 4) offerMilestone('search', visits === 4 ? 3200 : 1500);
      if (visits >= 6 && !state.user) offerMilestone('account', 4200);
    }

    if (context === 'login' && state.user && state.user.role === 'admin') {
      offerMilestone('admin', 2200);
    }
  }

  function seedPopupsIfNeeded() {
    if (Store === undefined) return;
    /* Pop-ups start empty on purpose: any message on screen has to be one an
       admin actually wrote. The old "example pop-up" is gone. */
    if (!Array.isArray(Store.get(KEY.popups, null))) setPopups([]);
  }


  /* ==========================================================================
     14. MODALS, TOASTS, CONFIRM
     ========================================================================== */
  let lastFocused = null;
  let confirmCallback = null;

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    toggleMenu(false);

    /* The site sheet is a document, not a form: it must open at the top, where
       the poster, the name and the score are. Sending the cursor into the
       feedback box would scroll all of that away before you saw it. */
    const card = modal.querySelector('.modal-card');
    const isDocument = modal.id === 'siteModal';
    if (isDocument && card) card.scrollTop = 0;

    /* Focus the first form field when there is one; otherwise focus the dialog
       itself so no button is left wearing a focus ring on open. */
    const field = isDocument ? null : modal.querySelector('input:not([type="hidden"]), textarea, select');

    window.setTimeout(function () {
      if (field) {
        field.focus();
      } else if (card) {
        card.setAttribute('tabindex', '-1');
        card.focus({ preventScroll: true });
      }
    }, 240);
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');

    if (!$('.modal.is-open') && $('#mobileNav').hidden) document.body.classList.remove('is-locked');
    if (id === 'siteModal') state.detailId = null;

    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (err) { /* noop */ }
    }
  }

  function closeAllModals() {
    $$('.modal.is-open').forEach(function (modal) { closeModal(modal.id); });
  }

  function confirmAction(title, text, onYes) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    confirmCallback = onYes;
    openModal('confirmModal');
  }

  function toast(message, tone) {
    const host = $('#toasts');
    if (!host) return;

    const node = document.createElement('div');
    node.className = 'toast' + (tone === 'good' ? ' is-good' : tone === 'bad' ? ' is-bad' : '');
    node.textContent = message;
    host.appendChild(node);

    window.setTimeout(function () {
      node.classList.add('is-out');
      window.setTimeout(function () { node.remove(); }, 320);
    }, 3400);
  }

  /* ==========================================================================
     15. EVENT WIRING
     ========================================================================== */
  function wireEvents() {
    /* ---- Global delegated clicks ---- */
    document.addEventListener('click', function (event) {
      const target = event.target;

      /* Open a destination (the id is the only thing in the DOM). */
      const openBtn = target.closest('[data-open]');
      if (openBtn) {
        event.preventDefault();
        visitSite(openBtn.dataset.open);
        return;
      }

      /* Detail modal. */
      const infoBtn = target.closest('[data-info]');
      if (infoBtn) {
        event.preventDefault();
        openSiteModal(infoBtn.dataset.info);
        return;
      }

      /* Rating buttons. */
      const voteBtn = target.closest('[data-vote]');
      if (voteBtn && state.detailId) {
        event.preventDefault();
        saveVote(state.detailId, voteBtn.dataset.vote, Number(voteBtn.dataset.opt));
        return;
      }

      /* Hero dots. */
      const dot = target.closest('[data-hero]');
      if (dot) {
        event.preventDefault();
        renderHero(Number(dot.dataset.hero));
        startHeroRotation();
        return;
      }

      /* Category jump (nav + drawer). */
      const jump = target.closest('[data-jump]');
      if (jump) {
        event.preventDefault();
        jumpToCategory(jump.dataset.jump);
        return;
      }

      /* Profile menu actions. */
      const action = target.closest('[data-action]');
      if (action) {
        const name = action.dataset.action;
        if (name === 'auth') { toggleMenu(false); closeDrawer(); openAuth(); }
        if (name === 'admin') { toggleMenu(false); openAdmin(); }
        if (name === 'logout') logout();
        if (name === 'recent') {
          toggleMenu(false);
          const row = document.querySelector('[data-row="recent"]');
          if (row) {
            window.scrollTo({ top: row.getBoundingClientRect().top + window.pageYOffset - 84, behavior: 'smooth' });
          } else {
            toast('Nothing here yet — open a site and it will show up in Recently used.');
          }
        }
        if (name === 'clear-history') { toggleMenu(false); clearHistory(); }
        return;
      }

      /* Delete a feedback note (author or admin only — checked in the handler) */
      const fbDel = target.closest('[data-fb-del]');
      if (fbDel && state.detailId) {
        event.preventDefault();
        deleteFeedback(state.detailId, fbDel.dataset.fbDel);
        return;
      }

      /* Admin: pop-up list actions */
      const popPreview = target.closest('[data-pop-preview]');
      if (popPreview) {
        const popup = getPopups().find(function (p) { return p.id === popPreview.dataset.popPreview; });
        if (popup) showAnnouncement(popup, true);
        return;
      }

      /* Everything below changes the site. Re-check the role here so a
         hand-crafted click (or the console) cannot slip past a hidden button. */
      if (target.closest('[data-edit],[data-delete],[data-pop-edit],[data-pop-toggle],[data-pop-del],[data-imp-run]')) {
        if (!requireAdmin('change the catalogue')) return;
      }

      const popEdit = target.closest('[data-pop-edit]');
      if (popEdit) { editPopup(popEdit.dataset.popEdit); return; }

      const popToggle = target.closest('[data-pop-toggle]');
      if (popToggle) {
        const list = getPopups();
        const popup = list.find(function (p) { return p.id === popToggle.dataset.popToggle; });
        if (popup) {
          popup.active = !popup.active;
          setPopups(list);
          renderPopupList();
          toast(popup.active ? 'Pop-up is live.' : 'Pop-up hidden.', popup.active ? 'good' : '');
        }
        return;
      }

      const popDel = target.closest('[data-pop-del]');
      if (popDel) {
        const id = popDel.dataset.popDel;
        confirmAction('Delete this pop-up?', 'It disappears for everyone immediately.', function () {
          setPopups(getPopups().filter(function (p) { return p.id !== id; }));
          renderPopupList();
          toast('Pop-up deleted.');
        });
        return;
      }

      /* Admin table actions. */
      const edit = target.closest('[data-edit]');
      if (edit) { editSite(edit.dataset.edit); return; }

      const del = target.closest('[data-delete]');
      if (del) { deleteSite(del.dataset.delete); return; }

      /* Admin tabs. */
      const adminTab = target.closest('[data-admin-tab]');
      if (adminTab) { setAdminTab(adminTab.dataset.adminTab); return; }

      /* Auth tabs. */
      const authTab = target.closest('[data-auth-tab]');
      if (authTab) { setAuthMode(authTab.dataset.authTab); return; }

      /* Modal close affordances. */
      const closer = target.closest('[data-close]');
      if (closer) { closeModal(closer.dataset.close); return; }

      /* Close the profile dropdown when clicking outside it. */
      if (!target.closest('#profile')) toggleMenu(false);
    });

    /* ---- Search ---- */
    const searchInput = $('#searchInput');
    let searchTimer = null;

    searchInput.addEventListener('input', function () {
      window.clearTimeout(searchTimer);
      const value = searchInput.value;
      searchTimer = window.setTimeout(function () { applySearch(value); }, 110);
    });

    searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        searchInput.value = '';
        applySearch('');
        searchInput.blur();
      }
    });

    $('#searchClear').addEventListener('click', function () {
      searchInput.value = '';
      applySearch('');
      searchInput.focus();
    });

    $('#resultsClear').addEventListener('click', function () {
      searchInput.value = '';
      applySearch('');
    });

    /* "/" focuses search, Escape closes overlays */
    document.addEventListener('keydown', function (event) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchInput.focus();
      }
      if (event.key === 'Escape') {
        if ($('.modal.is-open')) closeAllModals();
        else if (!$('#mobileNav').hidden) closeDrawer();
        else toggleMenu(false);
      }
    });

    /* ---- Profile + drawer ---- */
    $('#avatarBtn').addEventListener('click', function (event) {
      event.stopPropagation();
      toggleMenu();
    });

    $('#menuBtn').addEventListener('click', function () {
      if ($('#mobileNav').hidden) openDrawer(); else closeDrawer();
    });
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerScrim').addEventListener('click', closeDrawer);

    /* ---- Hero ---- */
    $('#hero').addEventListener('mouseenter', function () { state.heroPaused = true; });
    $('#hero').addEventListener('mouseleave', function () { state.heroPaused = false; });

    /* ---- Auth ---- */
    $('#authForm').addEventListener('submit', handleAuthSubmit);
    $('#footAdmin').addEventListener('click', openAdmin);

    /* ---- Admin ---- */
    $('#adminNew').addEventListener('click', function () { resetSiteForm(); setAdminTab('editor'); });
    $('#siteForm').addEventListener('submit', handleSiteSubmit);
    const switchBtn = $('#authSwitchToSignup');
    if (switchBtn) switchBtn.addEventListener('click', switchToSignupKeepingEmail);
    $('#siteReset').addEventListener('click', function () { resetSiteForm(); toast('Form cleared.'); });
    $('#adminFilter').addEventListener('input', function (event) {
      state.adminFilter = event.target.value;
      renderAdminTable();
    });
    $('#impRun').addEventListener('click', runImport);

    /* Publishing */
    $('#expPublish').addEventListener('click', exportCatalogue);
    $('#expBackup').addEventListener('click', exportBackup);
    $('#expDiscard').addEventListener('click', function () {
      if (!requireAdmin('import the list')) return;
      confirmAction('Discard your unpublished draft?',
        'Your local edits are thrown away and the published catalogue.js is loaded again.',
        discardDraft);
    });

    /* Empty state call to action */
    $('#emptyAdmin').addEventListener('click', function () {
      if (state.user && state.user.role === 'admin') openAdmin();
      else openAuth();
    });
    $('#impSample').addEventListener('click', function () {
      $('#impText').value = SAMPLE_IMPORT;
      $('#impFormat').value = 'csv';
      $('#impReport').hidden = true;
    });

    /* ---- Feedback ---- */
    $('#fbForm').addEventListener('submit', function (event) {
      event.preventDefault();
      const input = $('#fbText');
      if (!state.detailId) return;
      if (!postFeedback(state.detailId, input.value)) {
        input.focus();
        return;
      }
      input.value = '';
      $('#fbLeft').textContent = '280';
      renderFeedback(state.detailId);
      renderAdminTable();
    });

    $('#fbText').addEventListener('input', function (event) {
      const left = 280 - event.target.value.length;
      $('#fbLeft').textContent = String(Math.max(0, left));
    });

    /* ---- Admin: pop-up manager ---- */
    $('#popSave').addEventListener('click', savePopupFromForm);
    $('#popPreview').addEventListener('click', showPopupPreviewFromForm);
    $('#popReset').addEventListener('click', function () {
      if (!requireAdmin('edit pop-ups')) return; resetPopupForm(); toast('Pop-up form cleared.'); });

    /* ---- Announcement action button ---- */
    $('#announceOpen').addEventListener('click', function () {
      const action = state.announceAction;
      const siteId = state.announceSiteId;
      closeModal('announceModal');

      window.setTimeout(function () {
        if (action === 'site') visitSite(siteId);
        else if (action === 'detail') openSiteModal(siteId);
        else if (action === 'auth') openAuth();
        else if (action === 'admin') openAdmin();
      }, 60);
    });

    /* ---- Pop-up blocked fallback ---- */
    $('#launchHere').addEventListener('click', function () {
      const site = siteById(state.pendingLaunch);
      if (!site) { closeModal('launchModal'); return; }
      closeModal('launchModal');
      recordVisit(site.id);
      /* Same-tab navigation: works even where window.open() is denied. */
      window.location.assign(site.url);
    });

    /* ---- Confirm dialog ---- */
    $('#confirmNo').addEventListener('click', function () {
      confirmCallback = null;
      closeModal('confirmModal');
    });
    $('#confirmYes').addEventListener('click', function () {
      const cb = confirmCallback;
      confirmCallback = null;
      closeModal('confirmModal');
      if (typeof cb === 'function') window.setTimeout(cb, 30);
    });

    /* ---- Brand = go home ---- */
    $('#brandHome').addEventListener('click', function (event) {
      event.preventDefault();
      searchInput.value = '';
      applySearch('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* ---- Keep rails' arrow states correct after resize/orientation ---- */
    window.addEventListener('resize', function () {
      $$('.rail').forEach(function (rail) {
        const section = rail.closest('.row');
        if (!section) return;
        const arrows = $$('.row-arrow', section);
        if (!arrows.length) return;
        const maxScroll = rail.scrollWidth - rail.clientWidth - 2;
        arrows[0].disabled = rail.scrollLeft <= 2;
        arrows[1].disabled = rail.scrollLeft >= maxScroll;
      });
    });
  }

  /* ==========================================================================
     BOOT
     ========================================================================== */
  /* ---- Catalogue loading --------------------------------------------------
     Order of authority:
       1. your own unpublished draft (you edited in Admin studio) — wins until
          you publish it, so nothing you type is silently lost
       2. catalogue.js from the server — what the world sees
       3. whatever was cached in this browser last time (offline)
       4. STARTER_SITES — the tiny offline fallback
     ------------------------------------------------------------------------ */
  function resolveCategoryRef(value) {
    const key = String(value == null ? '' : value).trim();
    if (!key) return ensureCategory('Unsorted');

    const exact = state.categories.find(function (cat) { return cat.id === key; });
    if (exact) return exact.id;

    const slug = slugify(key);
    const bySlug = state.categories.find(function (cat) { return cat.id === slug; });
    if (bySlug) return bySlug.id;

    const byName = state.categories.find(function (cat) {
      return cat.name.toLowerCase() === key.toLowerCase();
    });
    if (byName) return byName.id;

    return ensureCategory(key);
  }

  /* Accepts both the catalogue.js objects and the compact STARTER_SITES rows. */
  function siteFromDoc(raw, index) {
    if (Array.isArray(raw)) {
      return {
        id: String(raw[0]), name: raw[1], cat: raw[2], url: raw[3],
        desc: raw[4] || '', issues: raw[5] || '', featured: !!raw[6],
        image: '', addedAt: Date.now() - index * 1000
      };
    }

    return {
      id: String(raw.id || slugify(raw.name)),
      name: String(raw.name || '').trim(),
      cat: resolveCategoryRef(raw.category || raw.cat),
      url: String(raw.link || raw.url || '').trim(),
      desc: String(raw.description || raw.desc || '').trim(),
      issues: String(raw.issues || raw.notes || '').trim(),
      featured: !!(raw.featured || raw.hero),
      image: String(raw.image || '').trim(),
      addedAt: Number(raw.addedAt) || (Date.now() - index * 1000)
    };
  }

  function applyCatalogue(doc) {
    const source = doc || {};
    const cats = Array.isArray(source.categories) ? source.categories : STARTER_CATEGORIES;

    state.categories = cats.map(function (cat) {
      return {
        id: String(cat.id || slugify(cat.name)),
        name: String(cat.name || 'Unsorted'),
        accent: cat.accent || ACCENTS[0],
        blurb: cat.blurb || ''
      };
    });

    const rows = Array.isArray(source.sites) ? source.sites : STARTER_SITES;

    /* Two passes: ids first so `category` references resolve even when the
       file lists a site before the category it belongs to. */
    state.sites = rows
      .map(function (raw, index) { return { raw: raw, index: index }; })
      .filter(function (entry) {
        const rec = Array.isArray(entry.raw) ? null : entry.raw;
        return Array.isArray(entry.raw) || (rec && rec.name && (rec.link || rec.url));
      })
      .map(function (entry) { return siteFromDoc(entry.raw, entry.index); })
      .filter(function (site) {
        return site.name && /^https?:\/\//i.test(site.url);
      });

    state.heroIds = pickHeroIds();
  }

  /* ---- Who may change the catalogue ---------------------------------------
     Only the owner account can add, edit or remove sites. Everyone else is a
     normal visitor: they can browse, search, rate and write notes, and that is
     all. Three separate locks enforce it, because a hidden button is not a
     permission:

       1. the menu entry and the admin studio button only render for the owner
       2. openAdmin() refuses anyone else
       3. every mutation (save / edit / delete / import) re-checks the role

     WHICH account is the owner comes from catalogue.js:

         "ownerEmail": "you@example.com"   -> only that address can be owner
         "ownerEmail": ""                  -> the first account created wins

     Set it before you publish. With it empty, whoever signs up first on the
     live site becomes the owner — fine while testing, not fine in public.
     ---------------------------------------------------------------------- */
  /** SHA-256 of an address, lowercase. Lets catalogue.js name the owner
      without printing the address into a file the whole world can read. */
  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(String(text).trim().toLowerCase());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  }

  /** True when this address is the one catalogue.js names as owner. */
  async function isConfiguredOwnerEmail(email) {
    const doc = CATALOGUE_SOURCE() || {};
    const plain = String(doc.ownerEmail || '').trim().toLowerCase();
    const hashed = String(doc.ownerEmailHash || '').trim().toLowerCase();
    const normal = String(email || '').trim().toLowerCase();

    if (plain) return normal === plain;
    if (hashed) return (await sha256Hex(normal)) === hashed;
    return false;
  }

  /** Has the catalogue named an owner at all? */
  function hasConfiguredOwner() {
    const doc = CATALOGUE_SOURCE() || {};
    return !!(String(doc.ownerEmail || '').trim() || String(doc.ownerEmailHash || '').trim());
  }

  function isAdmin() {
    return !!(state.user && state.user.role === 'admin');
  }

  /** Guard for anything that writes to the catalogue. */
  function requireAdmin(action) {
    if (isAdmin()) return true;
    toast('Only the owner can ' + (action || 'change the catalogue') + '.', 'bad');
    return false;
  }

  const isDraft = () => !!Store.get(KEY.draft, false);

  function loadCatalogue() {
    const localSites = Store.get(KEY.sites, null);
    const localCats = Store.get(KEY.categories, null);

    state.catalogueSource = 'starter';

    /* 1. Unpublished draft — your own admin edits, until you publish them. */
    if (isDraft() && Array.isArray(localSites)) {
      state.sites = localSites;
      state.categories = (Array.isArray(localCats) && localCats.length) ? localCats : STARTER_CATEGORIES.slice();
      state.catalogueSource = 'draft';
      state.heroIds = pickHeroIds();
      return;
    }

    /* 2. The published catalogue.js file. */
    const doc = CATALOGUE_SOURCE();
    if (doc && (Array.isArray(doc.sites) || Array.isArray(doc.categories))) {
      applyCatalogue(doc);
      state.catalogueSource = 'published';
      Store.set(KEY.sites, state.sites);
      Store.set(KEY.categories, state.categories);
      return;
    }

    /* 3. Cache from a previous visit (catalogue.js failed to load). */
    if (Array.isArray(localSites) && localSites.length) {
      state.sites = localSites;
      state.categories = (Array.isArray(localCats) && localCats.length) ? localCats : STARTER_CATEGORIES.slice();
      state.catalogueSource = 'cache';
      state.heroIds = pickHeroIds();
      return;
    }

    /* 4. Offline starter set. */
    applyCatalogue({ categories: STARTER_CATEGORIES, sites: STARTER_SITES });
  }

  async function boot() {
    /* 1. Catalogue first — catalogue.js is already parsed (plain script tag). */
    loadCatalogue();
    seedPopupsIfNeeded();

    /* 2. Intro. */
    runSplash();

    /* 3. Paint the shell. */
    state.user = Auth.currentUser();
    fillCategorySelect();
    renderProfile();
    renderHero(0);
    renderRows(false);
    paintEmptyState();
    /* The Publish line must be truthful the moment the sheet is opened, not
       only after the first edit — otherwise a returning admin reads
       "Catalogue loaded" while their unpublished work is what is on screen. */
    paintPublishStatus();
    wireEvents();
    $('#footCount').textContent = state.sites.length + ' sites · ' + state.categories.length + ' categories';
    watchHeroVisibility();
    initSpotlight();
    startHeroRotation();

    /* 4. Sessions can expire while the tab is closed; re-read once. */
    state.user = Auth.currentUser();
    renderProfile();
    renderRows(true);

    /* 5. Pop-ups: anything an admin queued comes first, then the welcome note.
          The queue only releases when no dialog is open and nothing is loading. */
    window.setTimeout(function () {
      if (maybeShowAnnouncement()) lastPopupAt = Date.now();
      offerMilestone('welcome', 3000);
    }, 1500);

    /* Keep sessions honest across tabs (real apps use a server check here). */
    window.addEventListener('storage', function (event) {
      if (event.key === KEY.session) {
        state.user = Auth.currentUser();
        renderProfile();
        renderRows(true);
      }
    });
  }

  /* `<img onerror>` handlers need a small global hook. */
  window.ELSEWHERE = { fallbackArt: fallbackArt };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

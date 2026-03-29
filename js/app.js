/**
 * app.js — Shared JavaScript for PDF Tools Website
 * Provides: i18n, navigation, upload zones, file lists, progress bars,
 * result sections, format helpers, FAQ accordion, animations, schema.org
 */

'use strict';

// ─────────────────────────────────────────────
// 1. i18n System
// ─────────────────────────────────────────────

const SUPPORTED_LANGS = ['en', 'zh', 'ja', 'ko', 'es', 'pt', 'fr', 'de'];
const DEFAULT_LANG = 'en';

let _translations = {};
let _currentLang = DEFAULT_LANG;

/**
 * Inline English fallback — used when JSON fetch fails (e.g. file:// protocol).
 * Keeps all UI readable without a local server.
 */
const EN_FALLBACK = {
  nav: { home: 'Home', allTools: 'All Tools', language: 'Language' },
  hero: {
    title: 'Free Online PDF Tools',
    subtitle: 'No Upload, No Signup, 100% Private',
    description: 'Process your PDF files directly in the browser. Fast, secure, and completely free.',
    ctaButton: 'Choose a Tool'
  },
  tools: {
    mergePdf:    { name: 'Merge PDF',      description: 'Combine multiple PDF files into one' },
    compressPdf: { name: 'Compress PDF',   description: 'Reduce PDF file size while maintaining quality' },
    pdfToJpg:    { name: 'PDF to JPG',     description: 'Convert PDF pages to JPG images' },
    jpgToPdf:    { name: 'JPG to PDF',     description: 'Convert images to a PDF document' },
    splitPdf:    { name: 'Split PDF',      description: 'Split PDF into multiple files' },
    rotatePdf:   { name: 'Rotate PDF',     description: 'Rotate PDF pages easily' },
    pdfToWord:   { name: 'PDF to Word',    description: 'Convert PDF to editable Word document' },
    wordToPdf:   { name: 'Word to PDF',    description: 'Convert Word documents to PDF' },
    pdfToPng:    { name: 'PDF to PNG',     description: 'Convert PDF pages to PNG images' },
    addWatermark:{ name: 'Add Watermark',  description: 'Add text or image watermark to PDF' },
    unlockPdf:   { name: 'Unlock PDF',     description: 'Remove PDF password protection' },
    protectPdf:  { name: 'Protect PDF',    description: 'Add password protection to PDF' }
  },
  trust: {
    privacy:  { title: '100% Private',      description: 'Files never leave your browser. All processing happens locally on your device.' },
    free:     { title: 'Always Free',        description: 'No hidden fees, no subscription required. Use all tools completely free.' },
    noSignup: { title: 'No Signup Needed',   description: 'Start using any tool instantly. No account, no email required.' }
  },
  faq: {
    title: 'Frequently Asked Questions',
    q1: 'Are my files safe?',          a1: 'Yes, 100%. All PDF processing happens directly in your browser. Your files never get uploaded to any server.',
    q2: 'Is this really free?',        a2: 'Yes, all tools are completely free with no hidden fees or usage limits.',
    q3: "What's the maximum file size?", a3: 'Most modern browsers can handle files up to 500MB without issues.',
    q4: 'Do I need to install anything?', a4: 'No installation required. Everything works in your web browser.',
    q5: 'Which browsers are supported?',  a5: 'Chrome, Firefox, Safari, Edge, and Opera.',
    q6: 'Will you add more tools?',      a6: 'We now offer 12 PDF tools including Merge, Compress, Split, Rotate, and conversion tools. More are on the way!'
  },
  footer: {
    tools: 'Tools', legal: 'Legal',
    privacy: 'Privacy Policy',
    copyright: '© 2024 PDFSlick. All rights reserved.',
    tagline: 'Free PDF tools that respect your privacy.'
  },
  upload: {
    dragDrop: 'Drag & drop your PDF here', or: 'or',
    browse: 'Browse Files', supports: 'Supports PDF files up to 500MB'
  },
  common: {
    download: 'Download', downloadAll: 'Download All',
    processing: 'Processing...', done: 'Done!',
    reset: 'Process Another File', fileSize: 'File size',
    pages: 'Pages', comingSoon: 'Coming Soon'
  },
  steps: {
    step1: 'Upload',   step1Desc: 'Select or drag your PDF file',
    step2: 'Process',  step2Desc: 'We process it in your browser',
    step3: 'Download', step3Desc: 'Download your result instantly'
  },
  merge: {
    title: 'Merge PDF Files',
    subtitle: 'Combine multiple PDF files into one document online for free',
    uploadMultiple: 'Drag & drop PDF files here',
    supportsMultiple: 'Add multiple PDF files to merge',
    mergeButton: 'Merge PDFs', filesAdded: 'files added',
    dragToReorder: 'Drag to reorder', addMore: 'Add More Files',
    resultTitle: 'Your merged PDF is ready!',
    resultDesc: 'All files have been merged successfully'
  },
  compress: {
    title: 'Compress PDF',
    subtitle: 'Reduce your PDF file size while maintaining quality',
    compressButton: 'Compress PDF', quality: 'Compression Level',
    low: 'Low (Best Quality)', medium: 'Medium (Balanced)', high: 'High (Smallest Size)',
    resultTitle: 'PDF Compressed!', originalSize: 'Original size',
    compressedSize: 'Compressed size', savedPercent: 'saved'
  },
  pdfToJpg: {
    title: 'PDF to JPG',
    subtitle: 'Convert PDF pages to high-quality JPG images',
    convertButton: 'Convert to JPG', quality: 'Image Quality',
    resultTitle: 'Conversion Complete!', pageCount: 'pages converted',
    downloadAll: 'Download All Images'
  },
  jpgToPdf: {
    title: 'JPG to PDF',
    subtitle: 'Convert JPG images to a PDF document',
    uploadImages: 'Drag & drop images here', supportsImages: 'Supports JPG, PNG, GIF, WebP',
    convertButton: 'Convert to PDF', resultTitle: 'PDF Created!', imagesAdded: 'images added'
  },
  split: {
    title: 'Split PDF',
    subtitle: 'Split your PDF into multiple files by page ranges',
    splitButton: 'Split PDF', splitMode: 'Split Mode',
    byRange: 'By Page Range', everyPage: 'Every Single Page',
    pageRange: 'Page Range (e.g. 1-3, 5, 7-9)',
    resultTitle: 'PDF Split Complete!', filesCreated: 'files created'
  },
  rotate: {
    title: 'Rotate PDF',
    subtitle: 'Rotate PDF pages to the correct orientation',
    rotateButton: 'Rotate PDF', rotation: 'Rotation',
    rotate90: '90° Clockwise', rotate180: '180°', rotate270: '90° Counter-clockwise',
    allPages: 'All Pages', resultTitle: 'PDF Rotated!'
  }
};

/**
 * Compute the site root URL from this script's own <script src>.
 * Works for both http:// (server) and file:// (local open).
 * e.g. script at /js/app.js or /merge-pdf/../js/app.js → strips /js/app.js
 */
function _siteRoot() {
  const scriptEl = document.querySelector('script[src*="app.js"]');
  if (scriptEl && scriptEl.src) {
    return scriptEl.src.replace(/\/js\/app\.js(\?.*)?$/, '');
  }
  // Fallback: strip filename from current page URL
  return window.location.href.replace(/\/[^/]*$/, '');
}

/**
 * Detect language from URL path prefix (e.g. /zh/merge-pdf/).
 * Returns the language code if found, otherwise null.
 */
function _detectLangFromPath() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length > 0 && SUPPORTED_LANGS.includes(pathParts[0])) {
    return pathParts[0];
  }
  return null;
}

/**
 * Get the current page's base path (without language prefix).
 * e.g. /zh/merge-pdf/ → /merge-pdf/
 *      /merge-pdf/    → /merge-pdf/
 *      /zh/           → /
 */
function _getPageBasePath() {
  let pathname = window.location.pathname;
  const langFromPath = _detectLangFromPath();
  if (langFromPath) {
    // Strip the /{lang} prefix
    pathname = pathname.replace(new RegExp('^/' + langFromPath + '(/|$)'), '/');
  }
  return pathname || '/';
}

/**
 * Build the full URL for switching to a given language.
 * English uses the root path; other languages use /{lang}/ prefix.
 */
function _buildLangUrl(targetLang) {
  const basePath = _getPageBasePath();
  if (targetLang === 'en') {
    return basePath;
  }
  // Ensure basePath starts with /
  const cleanBase = basePath.startsWith('/') ? basePath : '/' + basePath;
  return '/' + targetLang + cleanBase;
}

/**
 * Detect the preferred language.
 * Priority: URL path > URL param > localStorage > browser language > 'en'
 */
function detectLang() {
  // 1. URL path prefix (highest priority — the page was built for this language)
  const pathLang = _detectLangFromPath();
  if (pathLang) return pathLang;

  // 2. URL query parameter (legacy fallback for bookmarks/links)
  const urlParam = new URLSearchParams(window.location.search).get('lang');
  if (urlParam && SUPPORTED_LANGS.includes(urlParam)) return urlParam;

  // 3. localStorage (user's previous choice)
  const stored = localStorage.getItem('preferredLang');
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;

  // 4. Browser language
  const browserLang = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
  if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;

  return DEFAULT_LANG;
}

/**
 * Fetch translations JSON for a given language code.
 * Falls back to EN_FALLBACK on any error (covers file:// CORS blocks).
 */
async function loadTranslations(lang) {
  const root = _siteRoot();
  try {
    const res = await fetch(`${root}/i18n/${lang}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[i18n] Failed to load "${lang}.json" — trying English JSON.`, err.message);
    // If we requested a non-English lang, try fetching English JSON
    if (lang !== DEFAULT_LANG) {
      try {
        const res = await fetch(`${root}/i18n/${DEFAULT_LANG}.json`);
        if (res.ok) return await res.json();
      } catch {}
    }
    // Last resort: inline English fallback (no network required)
    console.warn('[i18n] Using inline English fallback (file:// mode or missing JSON).');
    return EN_FALLBACK;
  }
}

/**
 * Get a nested translation value by dot-separated key, e.g. t('nav.home').
 * Returns the key itself if not found (never undefined/null).
 */
function t(key) {
  const parts = key.split('.');
  let node = _translations;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return key;
    node = node[part];
  }
  return (node != null && typeof node !== 'object') ? String(node) : key;
}

/**
 * Update every element with [data-i18n] attribute using current translations.
 * Supports:
 *   data-i18n="key"            → sets textContent
 *   data-i18n-html="key"       → sets innerHTML
 *   data-i18n-placeholder="key"→ sets placeholder attribute
 *   data-i18n-title="key"      → sets title attribute
 *   data-i18n-aria-label="key" → sets aria-label attribute
 */
function applyTranslations() {
  // textContent — only replace when a real translation exists (t(key) !== key)
  // This preserves the HTML's inline English fallback text when a key is missing.
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val !== key) el.textContent = val;
  });
  // innerHTML
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const val = t(key);
    if (val !== key) el.innerHTML = val;
  });
  // placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val !== key) el.placeholder = val;
  });
  // title
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = t(key);
    if (val !== key) el.title = val;
  });
  // aria-label
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    const val = t(key);
    if (val !== key) el.setAttribute('aria-label', val);
  });

  // Update <html lang> attribute
  document.documentElement.lang = _currentLang;

  // Update document title if a translation exists
  const titleKey = 'page.title';
  const titleTranslation = t(titleKey);
  if (titleTranslation !== titleKey) document.title = titleTranslation;
}

/**
 * Switch to a new language by navigating to the correct path-based URL.
 * If the page was pre-built with build-i18n.js, this navigates to /{lang}/page.
 * Falls back to in-place switching for local dev (file:// or localhost).
 */
async function switchLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  localStorage.setItem('preferredLang', lang);

  // If we are on a static-hosted site, navigate to the language-specific page
  const protocol = window.location.protocol;
  if (protocol === 'http:' || protocol === 'https:') {
    const targetUrl = _buildLangUrl(lang);
    if (targetUrl !== window.location.pathname) {
      window.location.href = targetUrl;
      return;
    }
  }

  // Fallback: in-place language switch (for local dev / file:// mode)
  _currentLang = lang;
  _translations = await loadTranslations(lang);
  applyTranslations();

  // Update active state and button label
  document.querySelectorAll('[data-lang-option], [data-lang]').forEach(el => {
    const elLang = el.getAttribute('data-lang-option') || el.getAttribute('data-lang');
    el.classList.toggle('active', elLang === lang);
  });
  const currentLangEl = document.getElementById('currentLang');
  if (currentLangEl) currentLangEl.textContent = lang.toUpperCase();
}

/**
 * Initialize language switcher dropdowns/buttons.
 */
function initLangSwitcher() {
  // Support both ID conventions used across pages
  const toggleBtn = document.getElementById('langBtn') || document.getElementById('lang-toggle');
  const dropdown  = document.getElementById('langDropdown') || document.getElementById('lang-dropdown');
  const switcher  = toggleBtn && toggleBtn.closest('.lang-switcher');

  if (toggleBtn && dropdown && switcher) {
    // Toggle on button click
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = switcher.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Close when clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (!switcher.contains(e.target)) {
        switcher.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        switcher.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Language option links — support both data-lang-option and data-lang attributes
  document.querySelectorAll('[data-lang-option], [data-lang]').forEach(el => {
    const lang = el.getAttribute('data-lang-option') || el.getAttribute('data-lang');
    if (!lang) return;

    // If the link has a path-based href (set by build-i18n.js), update it
    // to ensure it points to the right place even if JS adds it dynamically.
    const href = el.getAttribute('href');
    const isQueryBased = href && href.startsWith('?lang=');

    if (isQueryBased) {
      // Update href to use path-based URL for progressive enhancement
      el.setAttribute('href', _buildLangUrl(lang));
    }

    el.addEventListener('click', (e) => {
      // Save language preference on click
      localStorage.setItem('preferredLang', lang);
      // If the link already has a proper path-based href, let the browser
      // handle navigation natively (no need for e.preventDefault)
      const currentHref = el.getAttribute('href');
      if (currentHref && !currentHref.startsWith('?')) {
        // Let the browser navigate naturally via the <a> href
        if (switcher) {
          switcher.classList.remove('open');
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        }
        return; // Don't prevent default — let <a> navigate
      }
      // Fallback: use JS navigation
      e.preventDefault();
      switchLang(lang);
      if (switcher) {
        switcher.classList.remove('open');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Mark current language as active
    if (lang === _currentLang) el.classList.add('active');
  });

  // Update displayed language code in button
  const currentLangEl = document.getElementById('currentLang');
  if (currentLangEl) currentLangEl.textContent = _currentLang.toUpperCase();
}

// Expose i18nReady promise so tool pages can await it
window.i18nReady = (async () => {
  _currentLang = detectLang();
  _translations = await loadTranslations(_currentLang);
  applyTranslations();
  initLangSwitcher();
})();

// Expose globals
window.t = t;
window.applyTranslations = applyTranslations;
window.switchLang = switchLang;


// ─────────────────────────────────────────────
// 2. Navigation
// ─────────────────────────────────────────────

function initNavigation() {
  // Mobile hamburger menu
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu') || document.getElementById('nav-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      // Prevent body scroll when menu is open
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  // Active link highlighting based on current path
  const currentPath = window.location.pathname;
  document.querySelectorAll('nav a[href], .mobile-menu a[href]').forEach(link => {
    const linkPath = new URL(link.href, window.location.origin).pathname;
    if (linkPath === currentPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

document.addEventListener('DOMContentLoaded', initNavigation);


// ─────────────────────────────────────────────
// 3. Upload Zone
// ─────────────────────────────────────────────

/**
 * Set up a drag-and-drop + click-to-browse upload zone.
 *
 * @param {string} zoneId     - ID of the drop zone element
 * @param {string} inputId    - ID of the hidden <input type="file">
 * @param {Function} callback - Called with FileList whenever files are selected
 * @param {Object} options    - { multiple: bool, accept: string }
 */
function setupUploadZone(zoneId, inputId, callback, options = {}) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) {
    console.warn(`[uploadZone] Elements not found: #${zoneId}, #${inputId}`);
    return;
  }

  const { multiple = false, accept = '' } = options;
  input.multiple = multiple;
  if (accept) input.accept = accept;

  // Click anywhere in the zone to open file picker
  zone.addEventListener('click', () => input.click());

  // Keyboard accessibility
  zone.setAttribute('tabindex', '0');
  zone.setAttribute('role', 'button');
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });

  // Drag events
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', (e) => {
    // Only remove if leaving the zone entirely
    if (!zone.contains(e.relatedTarget)) {
      zone.classList.remove('drag-over');
    }
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (!files.length) return;
    if (_validateFiles(files, accept, zone)) callback(files);
  });

  // Input change
  input.addEventListener('change', () => {
    if (input.files.length && _validateFiles(input.files, accept, zone)) {
      callback(input.files);
    }
    // Reset so same file can be re-selected
    input.value = '';
  });
}

/**
 * Validate files against accepted MIME types / extensions.
 * Shows an inline error in the zone if invalid.
 */
function _validateFiles(files, accept, zone) {
  if (!accept) return true;

  const acceptList = accept.split(',').map(s => s.trim().toLowerCase());
  for (const file of files) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const mime = file.type.toLowerCase();
    const ok = acceptList.some(a => {
      if (a.startsWith('.')) return a === ext;
      if (a.endsWith('/*')) return mime.startsWith(a.slice(0, -1));
      return a === mime;
    });
    if (!ok) {
      _showZoneError(zone, `File type not supported: ${file.name}`);
      return false;
    }
  }
  _clearZoneError(zone);
  return true;
}

function _showZoneError(zone, msg) {
  let err = zone.querySelector('.upload-zone-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'upload-zone-error';
    zone.appendChild(err);
  }
  err.textContent = msg;
  zone.classList.add('has-error');
}

function _clearZoneError(zone) {
  const err = zone.querySelector('.upload-zone-error');
  if (err) err.remove();
  zone.classList.remove('has-error');
}

window.setupUploadZone = setupUploadZone;


// ─────────────────────────────────────────────
// 4. File List Management
// ─────────────────────────────────────────────

/**
 * Render a list of File objects into a container with drag-to-reorder support.
 *
 * @param {File[]} files       - Array of File objects
 * @param {string} containerId - ID of the list container element
 * @param {Object} options     - { onReorder: fn(newFiles), onRemove: fn(index) }
 */
function renderFileList(files, containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (!files.length) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';

  const ul = document.createElement('ul');
  ul.className = 'file-list';
  ul.setAttribute('aria-label', 'Selected files');

  files.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    li.draggable = true;
    li.dataset.index = index;

    li.innerHTML = `
      <span class="file-list-drag-handle" title="Drag to reorder" aria-hidden="true">⠿</span>
      <span class="file-list-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <span class="file-list-size">${formatFileSize(file.size)}</span>
      <button class="file-list-remove" data-index="${index}" title="Remove" aria-label="Remove ${escapeHtml(file.name)}">×</button>
    `;

    ul.appendChild(li);
  });

  container.appendChild(ul);

  // Drag-to-reorder
  let dragSrcIndex = null;
  ul.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-index]');
    if (!li) return;
    dragSrcIndex = parseInt(li.dataset.index, 10);
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  ul.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const li = e.target.closest('li[data-index]');
    if (li) {
      ul.querySelectorAll('li').forEach(el => el.classList.remove('drag-target'));
      li.classList.add('drag-target');
    }
  });
  ul.addEventListener('dragleave', () => {
    ul.querySelectorAll('li').forEach(el => el.classList.remove('drag-target'));
  });
  ul.addEventListener('drop', (e) => {
    e.preventDefault();
    ul.querySelectorAll('li').forEach(el => {
      el.classList.remove('dragging', 'drag-target');
    });
    const li = e.target.closest('li[data-index]');
    if (!li || dragSrcIndex === null) return;
    const dropIndex = parseInt(li.dataset.index, 10);
    if (dragSrcIndex === dropIndex) return;

    // Reorder the files array
    const reordered = [...files];
    const [moved] = reordered.splice(dragSrcIndex, 1);
    reordered.splice(dropIndex, 0, moved);

    if (options.onReorder) options.onReorder(reordered);
    dragSrcIndex = null;
  });

  // Remove buttons
  ul.addEventListener('click', (e) => {
    const btn = e.target.closest('.file-list-remove');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    if (options.onRemove) options.onRemove(idx);
  });
}

window.renderFileList = renderFileList;


// ─────────────────────────────────────────────
// 5. Progress Bar
// ─────────────────────────────────────────────

/**
 * Show or update a progress bar inside containerId.
 *
 * @param {string} containerId
 * @param {number} percent  0–100
 * @param {string} message  Optional status message
 */
function showProgress(containerId, percent, message = '') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Always make the container visible
  container.style.display = '';
  container.hidden = false;

  // If the page has a static progress bar (id="progressBar"), drive it directly
  const staticBar  = container.querySelector('#progressBar, .progress-bar-fill');
  const staticPct  = container.querySelector('#progressPercent');
  const staticMsg  = container.querySelector('#progressLabel, .progress-message, [data-i18n="progress.converting"], [data-i18n="progress.merging"]');
  const clamped = Math.max(0, Math.min(100, percent));

  if (staticBar) {
    staticBar.style.width = `${clamped}%`;
    staticBar.setAttribute('aria-valuenow', clamped);
    if (staticPct) staticPct.textContent = `${clamped}%`;
    if (message && staticMsg) staticMsg.textContent = message;
    return;
  }

  // Fallback: inject a dynamic progress widget
  let wrapper = container.querySelector('.progress-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'progress-wrapper';
    wrapper.innerHTML = `
      <div class="progress-bar-track" role="progressbar" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar-fill"></div>
      </div>
      <p class="progress-message"></p>
    `;
    container.appendChild(wrapper);
  }
  const fill  = wrapper.querySelector('.progress-bar-fill');
  const track = wrapper.querySelector('.progress-bar-track');
  const msg   = wrapper.querySelector('.progress-message');
  fill.style.width = `${clamped}%`;
  track.setAttribute('aria-valuenow', clamped);
  if (message) msg.textContent = message;
  wrapper.style.display = '';
}

/**
 * Hide and remove the progress bar from containerId.
 */
function hideProgress(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.style.display = 'none';
  container.hidden = true;
  const wrapper = container.querySelector('.progress-wrapper');
  if (wrapper) wrapper.remove();
}

window.showProgress = showProgress;
window.hideProgress = hideProgress;


// ─────────────────────────────────────────────
// 6. Result Section
// ─────────────────────────────────────────────

/**
 * Show a download result section inside containerId.
 *
 * @param {string} containerId
 * @param {Object} options
 *   - filename   {string}  Suggested download filename
 *   - size       {number}  File size in bytes (shown formatted)
 *   - downloadUrl{string}  Blob object URL or data URL
 *   - extraInfo  {string}  Optional extra text (e.g., page count)
 */
function showResult(containerId, { filename, size, downloadUrl, extraInfo } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Make container visible
  container.style.display = '';
  container.hidden = false;

  hideResult(containerId); // Clear any previously injected result

  const section = document.createElement('div');
  section.className = 'result-section';

  const sizeText = size != null ? formatFileSize(size) : '';
  const extra = extraInfo ? `<p class="result-extra-info">${escapeHtml(extraInfo)}</p>` : '';

  section.innerHTML = `
    <div class="result-icon" aria-hidden="true">✓</div>
    <h3 class="result-title">${t('result.ready') || 'Your file is ready!'}</h3>
    ${extra}
    ${sizeText ? `<p class="result-size">${t('result.size') || 'Size'}: <strong>${sizeText}</strong></p>` : ''}
    <a class="btn btn-primary result-download" href="${escapeHtml(downloadUrl)}" download="${escapeHtml(filename || 'download')}">
      ${t('result.download') || 'Download'} ${filename ? escapeHtml(filename) : ''}
    </a>
    <button class="btn btn-secondary result-close" type="button">${t('result.close') || 'Process Another File'}</button>
  `;

  container.appendChild(section);
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Auto-revoke blob URL when user downloads
  const link = section.querySelector('.result-download');
  link.addEventListener('click', () => {
    setTimeout(() => {
      if (downloadUrl && downloadUrl.startsWith('blob:')) {
        URL.revokeObjectURL(downloadUrl);
      }
    }, 10000); // Revoke after 10s to allow download to start
  });

  // Close button
  section.querySelector('.result-close').addEventListener('click', () => {
    if (downloadUrl && downloadUrl.startsWith('blob:')) URL.revokeObjectURL(downloadUrl);
    hideResult(containerId);
  });
}

/**
 * Remove the result section from containerId.
 */
function hideResult(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.result-section').forEach(el => el.remove());
}

window.showResult = showResult;
window.hideResult = hideResult;

/**
 * Show a PDF preview iframe inside a container.
 * @param {string} containerId - The ID of the container element
 * @param {string} blobUrl     - The blob URL of the PDF to preview
 * @param {string} title       - Optional preview title
 */
function showPreview(containerId, blobUrl, title) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Remove any existing preview
  hidePreview(containerId);

  const section = document.createElement('div');
  section.className = 'preview-section';
  section.innerHTML = `
    <div class="preview-header">
      <span class="preview-title">${escapeHtml(title || t('preview.title') || 'Preview')}</span>
    </div>
    <iframe class="preview-frame" src="${escapeHtml(blobUrl)}#toolbar=1&navpanes=0" title="PDF Preview"></iframe>
  `;
  container.appendChild(section);
}

/**
 * Remove a preview section from containerId.
 */
function hidePreview(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.preview-section').forEach(el => el.remove());
}

window.showPreview = showPreview;
window.hidePreview = hidePreview;


// ─────────────────────────────────────────────
// 7. Format Helpers
// ─────────────────────────────────────────────

/**
 * Format a byte count to a human-readable string.
 * e.g. formatFileSize(1234567) → "1.2 MB"
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes == null || isNaN(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format a page count to a human-readable string.
 * e.g. formatPageCount(5) → "5 pages"
 */
function formatPageCount(n) {
  if (n == null || isNaN(n)) return '';
  return n === 1
    ? `1 ${t('common.page') || 'page'}`
    : `${n} ${t('common.pages') || 'pages'}`;
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.formatFileSize = formatFileSize;
window.formatPageCount = formatPageCount;
window.escapeHtml = escapeHtml;


// ─────────────────────────────────────────────
// 8. FAQ Accordion
// ─────────────────────────────────────────────

function initFaqAccordion() {
  const faqs = document.querySelectorAll('.faq-item');
  if (!faqs.length) return;

  faqs.forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    if (!question || !answer) return;

    // Set ARIA attributes
    const id = `faq-answer-${Math.random().toString(36).slice(2, 9)}`;
    answer.id = id;
    question.setAttribute('aria-controls', id);
    question.setAttribute('aria-expanded', 'false');
    question.setAttribute('role', 'button');
    question.setAttribute('tabindex', '0');
    answer.hidden = true;

    const toggle = () => {
      const isOpen = item.classList.toggle('open');
      question.setAttribute('aria-expanded', isOpen);
      answer.hidden = !isOpen;
    };

    question.addEventListener('click', toggle);
    question.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

document.addEventListener('DOMContentLoaded', initFaqAccordion);


// ─────────────────────────────────────────────
// 9. Stagger Animation for Tool Cards
// ─────────────────────────────────────────────

function initCardAnimations() {
  const cards = document.querySelectorAll('.tool-card, .feature-card');
  if (!cards.length) return;

  // Use IntersectionObserver for performance
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger delay based on card position
        const delay = (entry.target.dataset.cardIndex || 0) * 80;
        setTimeout(() => {
          entry.target.classList.add('animated');
        }, delay);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  cards.forEach((card, i) => {
    card.dataset.cardIndex = i;
    card.classList.add('animate-ready');
    observer.observe(card);
  });
}

document.addEventListener('DOMContentLoaded', initCardAnimations);


// ─────────────────────────────────────────────
// 10. Schema.org WebApplication Injection
// ─────────────────────────────────────────────

/**
 * Inject a Schema.org WebApplication JSON-LD block into <head>.
 *
 * @param {Object} opts
 *   - name        {string}  App/tool name
 *   - description {string}  Short description
 *   - url         {string}  Canonical URL (defaults to current page)
 *   - category    {string}  applicationCategory (default: "UtilityApplication")
 *   - operatingSystem {string} (default: "Any")
 *   - offers      {Object}  { price: "0", priceCurrency: "USD" }
 */
function injectWebAppSchema({ name, description, url, category, operatingSystem, offers } = {}) {
  // Remove existing schema if present
  const existing = document.getElementById('schema-webapplication');
  if (existing) existing.remove();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: name || document.title,
    description: description || '',
    url: url || window.location.href,
    applicationCategory: category || 'UtilityApplication',
    operatingSystem: operatingSystem || 'Any',
    offers: offers || { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    browserRequirements: 'Requires a modern web browser with JavaScript enabled.',
  };

  const script = document.createElement('script');
  script.id = 'schema-webapplication';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schema, null, 2);
  document.head.appendChild(script);
}

window.injectWebAppSchema = injectWebAppSchema;


// ─────────────────────────────────────────────
// Utility: Read File as ArrayBuffer
// ─────────────────────────────────────────────

/**
 * Read a File object as an ArrayBuffer (promise-based).
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read a File object as a data URL (promise-based).
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

window.readFileAsArrayBuffer = readFileAsArrayBuffer;
window.readFileAsDataURL = readFileAsDataURL;

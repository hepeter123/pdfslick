/**
 * build-i18n.js — Static i18n page generator for PDFSlick
 *
 * Generates language-specific HTML pages from the English templates.
 * English pages stay at root; other languages get /{lang}/ subdirectories.
 *
 * Usage:  node build-i18n.js
 *
 * No npm dependencies — uses only Node.js built-in modules.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const SITE_URL = 'https://pdf-slick.com';
const LANGS = ['en', 'zh', 'ja', 'ko', 'es', 'pt', 'fr', 'de'];
const ROOT = path.resolve(__dirname);

// All pages to process (relative to ROOT)
const PAGES = [
  'index.html',
  'privacy.html',
  'merge-pdf/index.html',
  'compress-pdf/index.html',
  'pdf-to-jpg/index.html',
  'jpg-to-pdf/index.html',
  'split-pdf/index.html',
  'rotate-pdf/index.html',
  'pdf-to-png/index.html',
  'add-watermark/index.html',
  'unlock-pdf/index.html',
  'protect-pdf/index.html',
  'pdf-to-word/index.html',
  'word-to-pdf/index.html',
];

// Map page paths to i18n key prefixes for title/description translation
const PAGE_I18N_MAP = {
  'index.html':               { titleKey: 'hero.title', descKey: 'hero.description' },
  'privacy.html':             { titleKey: 'footer.privacy', descKey: null },
  'merge-pdf/index.html':     { titleKey: 'tools.mergePdf.name', descKey: 'tools.mergePdf.description' },
  'compress-pdf/index.html':  { titleKey: 'tools.compressPdf.name', descKey: 'tools.compressPdf.description' },
  'pdf-to-jpg/index.html':    { titleKey: 'tools.pdfToJpg.name', descKey: 'tools.pdfToJpg.description' },
  'jpg-to-pdf/index.html':    { titleKey: 'tools.jpgToPdf.name', descKey: 'tools.jpgToPdf.description' },
  'split-pdf/index.html':     { titleKey: 'tools.splitPdf.name', descKey: 'tools.splitPdf.description' },
  'rotate-pdf/index.html':    { titleKey: 'tools.rotatePdf.name', descKey: 'tools.rotatePdf.description' },
  'pdf-to-png/index.html':    { titleKey: 'tools.pdfToPng.name', descKey: 'tools.pdfToPng.description' },
  'add-watermark/index.html': { titleKey: 'tools.addWatermark.name', descKey: 'tools.addWatermark.description' },
  'unlock-pdf/index.html':    { titleKey: 'tools.unlockPdf.name', descKey: 'tools.unlockPdf.description' },
  'protect-pdf/index.html':   { titleKey: 'tools.protectPdf.name', descKey: 'tools.protectPdf.description' },
  'pdf-to-word/index.html':   { titleKey: 'tools.pdfToWord.name', descKey: 'tools.pdfToWord.description' },
  'word-to-pdf/index.html':   { titleKey: 'tools.wordToPdf.name', descKey: 'tools.wordToPdf.description' },
};

// ─────────────────────────────────────────────
// Translation helpers
// ─────────────────────────────────────────────

const _translationCache = {};

function loadTranslations(lang) {
  if (_translationCache[lang]) return _translationCache[lang];
  const file = path.join(ROOT, 'i18n', `${lang}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`  ! Translation file not found: ${file}`);
    return {};
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  _translationCache[lang] = data;
  return data;
}

/**
 * Resolve a dot-separated key from a nested object.
 * Returns undefined if not found.
 */
function getNestedValue(obj, key) {
  const parts = key.split('.');
  let node = obj;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return (node != null && typeof node !== 'object') ? String(node) : undefined;
}

// ─────────────────────────────────────────────
// URL / path helpers
// ─────────────────────────────────────────────

/**
 * Convert a file path like 'merge-pdf/index.html' to a URL path like 'merge-pdf/'.
 * 'index.html' → '', 'privacy.html' → 'privacy.html'
 */
function toUrlPath(pagePath) {
  return pagePath.replace(/index\.html$/, '');
}

/**
 * Build the full URL for a given page and language.
 */
function buildUrl(pagePath, lang) {
  const urlPath = toUrlPath(pagePath);
  if (lang === 'en') {
    return `${SITE_URL}/${urlPath}`;
  }
  return `${SITE_URL}/${lang}/${urlPath}`;
}

// ─────────────────────────────────────────────
// hreflang tags
// ─────────────────────────────────────────────

function generateHreflangTags(pagePath) {
  const tags = LANGS.map(lang => {
    const href = buildUrl(pagePath, lang);
    return `  <link rel="alternate" hreflang="${lang}" href="${href}">`;
  });
  // x-default points to English
  tags.push(`  <link rel="alternate" hreflang="x-default" href="${buildUrl(pagePath, 'en')}">`);
  return tags.join('\n');
}

// ─────────────────────────────────────────────
// Language switcher update
// ─────────────────────────────────────────────

/**
 * Update language switcher links to use correct path-based URLs.
 * Handles both the original format (href="?lang=xx") and previously
 * converted path-based URLs (for idempotent re-runs).
 *
 * Strategy: find all <a> elements with class="lang-option" and data-lang="xx",
 * and replace their href with the correct path regardless of current href value.
 */
function updateLangSwitcher(html, pagePath) {
  const urlPath = toUrlPath(pagePath);

  for (const lang of LANGS) {
    const targetPath = lang === 'en' ? `/${urlPath}` : `/${lang}/${urlPath}`;
    // Match: href="<anything>" followed by class="lang-option" data-lang="xx"
    html = html.replace(
      new RegExp(`href="[^"]*"(\\s+class="lang-option"\\s+data-lang="${lang}")`, 'g'),
      `href="${targetPath}"$1`
    );
  }

  return html;
}

// ─────────────────────────────────────────────
// data-i18n pre-rendering
// ─────────────────────────────────────────────

/**
 * Replace text content of elements with data-i18n="key" using translations.
 * Matches patterns like: data-i18n="some.key">English text<
 * Preserves the data-i18n attribute so client-side JS can still update dynamically.
 */
function replaceDataI18n(html, translations) {
  // Pattern: data-i18n="key" followed by possible other attributes, then >text<
  // We need to handle both:
  //   <span data-i18n="key">text</span>
  //   <h1 data-i18n="key">text</h1>
  //   <button ... data-i18n="key">text</button>
  // But NOT self-closing tags or tags where data-i18n is followed by more attributes before >

  return html.replace(
    /data-i18n="([^"]+)"([^>]*)>([^<]*)</g,
    (match, key, afterAttrs, originalText) => {
      const translated = getNestedValue(translations, key);
      if (translated) {
        return `data-i18n="${key}"${afterAttrs}>${translated}<`;
      }
      return match;
    }
  );
}

/**
 * Same for data-i18n-placeholder="key"
 */
function replaceDataI18nPlaceholder(html, translations) {
  return html.replace(
    /data-i18n-placeholder="([^"]+)"([^>]*?)placeholder="([^"]*)"/g,
    (match, key, middle, originalPlaceholder) => {
      const translated = getNestedValue(translations, key);
      if (translated) {
        return `data-i18n-placeholder="${key}"${middle}placeholder="${translated}"`;
      }
      return match;
    }
  );
}

// ─────────────────────────────────────────────
// Internal link rewriting
// ─────────────────────────────────────────────

/**
 * Add language prefix to internal links.
 * Rules:
 *   href="/"             → href="/{lang}/"
 *   href="/merge-pdf/"   → href="/{lang}/merge-pdf/"
 *   href="/privacy.html" → href="/{lang}/privacy.html"
 *   href="#..."           → unchanged (anchor)
 *   href="/css/..."       → unchanged (assets)
 *   href="/js/..."        → unchanged (assets)
 *   href="/i18n/..."      → unchanged (data)
 *   href="https://..."    → unchanged (external)
 *   href="?..."           → unchanged (query-only, handled by lang switcher)
 */
function updateInternalLinks(html, lang) {
  if (lang === 'en') return html;

  return html.replace(
    /href="(\/(?!css\/|js\/|i18n\/|assets\/)[^"]*?)"/g,
    (match, hrefPath) => {
      return `href="/${lang}${hrefPath}"`;
    }
  );
}

// ─────────────────────────────────────────────
// Meta tag updates
// ─────────────────────────────────────────────

/**
 * Update <html lang="en"> to <html lang="{lang}">
 */
function updateHtmlLang(html, lang) {
  return html.replace(/<html\s+lang="en"/, `<html lang="${lang}"`);
}

/**
 * Update <title>...</title> with translated content.
 * Keeps " | PDFSlick" or " — PDFSlick" suffix.
 */
function updateTitle(html, pagePath, translations) {
  const mapping = PAGE_I18N_MAP[pagePath];
  if (!mapping || !mapping.titleKey) return html;

  const translated = getNestedValue(translations, mapping.titleKey);
  if (!translated) return html;

  return html.replace(
    /<title>([^<]*)<\/title>/,
    (match, originalTitle) => {
      // Detect suffix pattern: " | PDFSlick" or " — PDFSlick" or " - PDFSlick"
      const suffixMatch = originalTitle.match(/(\s*[|—-]\s*PDFSlick)$/);
      const suffix = suffixMatch ? suffixMatch[1] : ' | PDFSlick';
      return `<title>${translated}${suffix}</title>`;
    }
  );
}

/**
 * Update <meta name="description" content="...">
 */
function updateMetaDescription(html, pagePath, translations) {
  const mapping = PAGE_I18N_MAP[pagePath];
  if (!mapping || !mapping.descKey) return html;

  const translated = getNestedValue(translations, mapping.descKey);
  if (!translated) return html;

  return html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${escapeAttr(translated)}$2`
  );
}

/**
 * Update canonical URL
 */
function updateCanonical(html, pagePath, lang) {
  const newUrl = buildUrl(pagePath, lang);
  return html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    `$1${newUrl}$2`
  );
}

/**
 * Update OG meta tags
 */
function updateOgTags(html, pagePath, lang, translations) {
  const newUrl = buildUrl(pagePath, lang);

  // og:url
  html = html.replace(
    /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
    `$1${newUrl}$2`
  );

  // og:title — translate if possible
  const mapping = PAGE_I18N_MAP[pagePath];
  if (mapping && mapping.titleKey) {
    const translated = getNestedValue(translations, mapping.titleKey);
    if (translated) {
      html = html.replace(
        /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
        (match, prefix, suffix) => {
          return `${prefix}${escapeAttr(translated)} | PDFSlick${suffix}`;
        }
      );
      // twitter:title too
      html = html.replace(
        /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
        (match, prefix, suffix) => {
          return `${prefix}${escapeAttr(translated)} | PDFSlick${suffix}`;
        }
      );
    }
  }

  // og:description — translate if possible
  if (mapping && mapping.descKey) {
    const translated = getNestedValue(translations, mapping.descKey);
    if (translated) {
      html = html.replace(
        /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
        `$1${escapeAttr(translated)}$2`
      );
      html = html.replace(
        /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
        `$1${escapeAttr(translated)}$2`
      );
    }
  }

  return html;
}

/**
 * Update Schema.org JSON-LD URLs to include language prefix.
 */
function updateSchemaOrg(html, pagePath, lang) {
  if (lang === 'en') return html;

  // Find all JSON-LD script blocks and update pdf-slick.com URLs
  return html.replace(
    /(<script\s+type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g,
    (match, openTag, jsonContent, closeTag) => {
      try {
        const data = JSON.parse(jsonContent);
        updateJsonUrls(data, pagePath, lang);
        const newJson = JSON.stringify(data, null, 4);
        return `${openTag}\n  ${newJson}\n  ${closeTag}`;
      } catch (e) {
        // If JSON parsing fails, just do string replacement on URLs
        const urlPath = toUrlPath(pagePath);
        const enUrl = `${SITE_URL}/${urlPath}`;
        const langUrl = `${SITE_URL}/${lang}/${urlPath}`;
        const updatedContent = jsonContent.replace(
          new RegExp(escapeRegex(enUrl), 'g'),
          langUrl
        );
        return `${openTag}${updatedContent}${closeTag}`;
      }
    }
  );
}

/**
 * Recursively update URL values in a JSON-LD object.
 */
function updateJsonUrls(obj, pagePath, lang) {
  if (typeof obj !== 'object' || obj === null) return;

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string' && obj[key].startsWith(SITE_URL)) {
      // Replace the site URL portion to include language prefix
      const urlPath = toUrlPath(pagePath);
      const enUrl = `${SITE_URL}/${urlPath}`;
      const langUrl = `${SITE_URL}/${lang}/${urlPath}`;
      if (obj[key] === enUrl || obj[key] === enUrl.replace(/\/$/, '')) {
        obj[key] = langUrl;
      }
      // Also handle the base site URL (for WebSite schema on index.html)
      if (obj[key] === SITE_URL || obj[key] === `${SITE_URL}/`) {
        obj[key] = `${SITE_URL}/${lang}/`;
      }
    } else if (typeof obj[key] === 'object') {
      updateJsonUrls(obj[key], pagePath, lang);
    }
  }
}

// ─────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────
// Clean up previously generated language dirs
// ─────────────────────────────────────────────

function cleanLangDirs() {
  for (const lang of LANGS) {
    if (lang === 'en') continue;
    const langDir = path.join(ROOT, lang);
    if (fs.existsSync(langDir)) {
      fs.rmSync(langDir, { recursive: true, force: true });
    }
  }
}

// ─────────────────────────────────────────────
// Main page processor
// ─────────────────────────────────────────────

function processPage(pagePath) {
  const fullPath = path.join(ROOT, pagePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`  ! Skipping ${pagePath} — file not found`);
    return;
  }

  const originalHtml = fs.readFileSync(fullPath, 'utf8');
  const hreflangTags = generateHreflangTags(pagePath);

  // ── 1. Update English (root) page ──
  let enHtml = originalHtml;

  // Remove any previously inserted hreflang tags (for idempotent re-runs)
  enHtml = enHtml.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n?/g, '');

  // Add hreflang tags before </head>
  enHtml = enHtml.replace('</head>', `\n${hreflangTags}\n</head>`);

  // Update language switcher to use path-based URLs
  enHtml = updateLangSwitcher(enHtml, pagePath);

  fs.writeFileSync(fullPath, enHtml, 'utf8');
  console.log(`  [en] ${pagePath}`);

  // ── 2. Generate non-English pages ──
  for (const lang of LANGS) {
    if (lang === 'en') continue;

    const translations = loadTranslations(lang);
    // Start from the ORIGINAL HTML (before English modifications),
    // so we don't double-apply hreflang or switcher changes
    let html = originalHtml;

    // Remove any previously inserted hreflang tags (idempotent)
    html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n?/g, '');

    // a. Update <html lang>
    html = updateHtmlLang(html, lang);

    // b. Update <title>
    html = updateTitle(html, pagePath, translations);

    // c. Update <meta name="description">
    html = updateMetaDescription(html, pagePath, translations);

    // d. Update canonical URL
    html = updateCanonical(html, pagePath, lang);

    // e. Update OG/Twitter meta tags
    html = updateOgTags(html, pagePath, lang, translations);

    // f. Add hreflang tags
    html = html.replace('</head>', `\n${hreflangTags}\n</head>`);

    // g. Pre-render data-i18n translations
    html = replaceDataI18n(html, translations);
    html = replaceDataI18nPlaceholder(html, translations);

    // h. Update internal links FIRST (add language prefix).
    //    This must happen before updateLangSwitcher because the switcher
    //    links still use ?lang= format which won't match the href="/" regex.
    html = updateInternalLinks(html, lang);

    // i. Update language switcher (replaces ?lang=xx with path-based URLs)
    html = updateLangSwitcher(html, pagePath);

    // j. Update Schema.org JSON-LD URLs
    html = updateSchemaOrg(html, pagePath, lang);

    // Write to /{lang}/pagePath
    const outPath = path.join(ROOT, lang, pagePath);
    const outDir = path.dirname(outPath);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, html, 'utf8');
  }

  console.log(`  [${LANGS.filter(l => l !== 'en').join(',')}] ${pagePath}`);
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

function main() {
  console.log('');
  console.log('=== PDFSlick i18n Build ===');
  console.log(`Site URL:  ${SITE_URL}`);
  console.log(`Languages: ${LANGS.join(', ')}`);
  console.log(`Pages:     ${PAGES.length}`);
  console.log('');

  // Clean previous builds
  console.log('Cleaning previous language directories...');
  cleanLangDirs();
  console.log('');

  // Process each page
  console.log('Processing pages:');
  let processed = 0;
  let skipped = 0;

  for (const page of PAGES) {
    const fullPath = path.join(ROOT, page);
    if (fs.existsSync(fullPath)) {
      processPage(page);
      processed++;
    } else {
      console.log(`  ! ${page} — not found, skipping`);
      skipped++;
    }
  }

  // Summary
  const generatedCount = processed * (LANGS.length - 1);
  console.log('');
  console.log('=== Build Complete ===');
  console.log(`  English pages updated:     ${processed}`);
  console.log(`  Translated pages created:  ${generatedCount}`);
  if (skipped > 0) {
    console.log(`  Pages skipped (not found): ${skipped}`);
  }
  console.log(`  Output directories:        ${LANGS.filter(l => l !== 'en').join(', ')}`);
  console.log('');
}

main();

/**
 * split.js — PDF Splitter
 * Splits a PDF by page range or into one PDF per page (zipped).
 * Depends on: app.js (i18nReady, t, setupUploadZone, formatFileSize, readFileAsArrayBuffer)
 *             window.PDFLib, window.JSZip
 */

'use strict';

(function () {

  // ── State ──────────────────────────────────────────────────────────────────
  let pdfBytes         = null;
  let totalPages       = 0;
  let currentObjectURL = null;

  // ── DOM references ─────────────────────────────────────────────────────────
  const uploadZone    = document.getElementById('uploadZone');
  const fileInput     = document.getElementById('fileInput');
  const fileInfo      = document.getElementById('fileInfo');
  const fileNameEl    = document.getElementById('fileName');
  const pageCountEl   = document.getElementById('pageCount');
  const optionsPanel  = document.getElementById('optionsPanel');
  const modeRange     = document.getElementById('modeRange');
  const modeAll       = document.getElementById('modeAll');
  const rangeGroup    = document.getElementById('rangeGroup');
  const rangeInput    = document.getElementById('rangeInput');
  const splitBtn      = document.getElementById('splitBtn');
  const progressWrap  = document.getElementById('progressWrap');
  const progressBar   = progressWrap ? progressWrap.querySelector('.progress-bar-fill') : null;
  const progressLabel = progressWrap ? progressWrap.querySelector('p') : null;
  const resultSection = document.getElementById('resultSection');
  const resultInfo    = document.getElementById('resultInfo');
  const downloadBtn   = document.getElementById('downloadBtn');

  // ── Initialise ─────────────────────────────────────────────────────────────
  function init() {
    // Upload zone
    if (typeof setupUploadZone === 'function') {
      setupUploadZone('uploadZone', 'fileInput', function (file) {
        handleFile(Array.isArray(file) || file instanceof FileList ? file[0] : file);
      });
    } else if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      });
    }

    // Mode radio toggles
    if (modeRange) modeRange.addEventListener('change', onModeChange);
    if (modeAll)   modeAll.addEventListener('change',   onModeChange);

    // Split button
    if (splitBtn) splitBtn.addEventListener('click', onSplit);

    // Clear file button
    var clearFileBtn = document.getElementById('clearFileBtn');
    if (clearFileBtn) {
      clearFileBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearFile();
      });
    }

    // Reset button (in result section)
    var resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        clearFile();
      });
    }

    // Set initial UI state
    onModeChange();
  }

  // ── Clear file / reset ────────────────────────────────────────────────────
  function clearFile() {
    pdfBytes = null;
    totalPages = 0;
    revokeCurrentURL();
    if (uploadZone)    uploadZone.style.display = '';
    if (fileInfo)      fileInfo.hidden          = true;
    if (optionsPanel)  optionsPanel.hidden      = true;
    if (resultSection) resultSection.hidden     = true;
    if (progressWrap)  progressWrap.hidden      = true;
    if (splitBtn)      splitBtn.disabled        = true;
    if (fileInput)     fileInput.value          = '';
    if (typeof hidePreview === 'function') hidePreview('resultSection');
  }

  // ── File handler ───────────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert(typeof t === 'function' ? t('common.pdfOnly') : 'Please select a valid PDF file.');
      return;
    }

    // Reset previous state
    pdfBytes = null;
    totalPages = 0;
    if (splitBtn) splitBtn.disabled = true;
    if (resultSection) resultSection.hidden = true;
    if (progressWrap)  progressWrap.hidden  = true;
    revokeCurrentURL();

    try {
      const buffer = await readFileAsArrayBuffer(file);
      pdfBytes = new Uint8Array(buffer);

      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      totalPages = pdfDoc.getPageCount();

      // Show file info
      if (fileNameEl)  fileNameEl.textContent  = file.name;
      if (pageCountEl) pageCountEl.textContent = totalPages + (totalPages === 1 ? ' page' : ' pages');
      if (fileInfo)    fileInfo.hidden          = false;
      if (uploadZone)  uploadZone.style.display = 'none';

      // Show options
      if (optionsPanel) optionsPanel.hidden = false;

      // Update range input placeholder
      if (rangeInput) {
        rangeInput.placeholder = totalPages > 1
          ? '1-' + Math.min(3, totalPages) + ', ' + Math.min(5, totalPages)
          : '1';
      }

      if (splitBtn) splitBtn.disabled = false;

    } catch (err) {
      console.error('[split] Failed to load PDF:', err);
      alert(
        (typeof t === 'function' ? t('common.error') : 'Error') +
        ': ' + err.message
      );
    }
  }

  // ── Mode toggle ────────────────────────────────────────────────────────────
  function onModeChange() {
    const isRange = modeRange && modeRange.checked;
    if (rangeGroup) rangeGroup.hidden = !isRange;
  }

  // ── Range parser ───────────────────────────────────────────────────────────
  /**
   * parseRanges("1-3, 5, 7-9", total) → sorted, unique, 0-based index array.
   * Throws a descriptive Error on bad input.
   */
  function parseRanges(raw, total) {
    // Normalize Chinese/fullwidth punctuation to ASCII equivalents
    raw = raw.replace(/\uff0c/g, ',')   // ， → ,
             .replace(/\u3001/g, ',')   // 、 → ,
             .replace(/\uff0d/g, '-')   // － → -
             .replace(/\u2014/g, '-')   // — → -
             .replace(/\u2013/g, '-');  // – → -
    const parts = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) throw new Error('No page ranges provided.');

    const indices = new Set();

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];

      if (/^\d+$/.test(part)) {
        var n = parseInt(part, 10);
        if (n < 1 || n > total) {
          throw new Error('Page ' + n + ' is out of range (1\u2013' + total + ').');
        }
        indices.add(n - 1);
      } else if (/^\d+-\d+$/.test(part)) {
        var sides = part.split('-');
        var a = parseInt(sides[0], 10);
        var b = parseInt(sides[1], 10);
        if (a < 1 || b > total) {
          throw new Error('Range ' + part + ' is out of bounds (1\u2013' + total + ').');
        }
        if (a > b) {
          throw new Error('Invalid range ' + part + ': start must be \u2264 end.');
        }
        for (var p = a; p <= b; p++) indices.add(p - 1);
      } else {
        throw new Error('Invalid range token: "' + part + '".');
      }
    }

    return Array.from(indices).sort(function (x, y) { return x - y; });
  }

  // ── Progress helpers ───────────────────────────────────────────────────────
  function setProgress(pct, label) {
    if (progressWrap)  progressWrap.hidden = false;
    if (progressBar)   progressBar.style.width = Math.min(100, pct) + '%';
    if (progressLabel) progressLabel.textContent = label;
  }

  // ── Object URL management ──────────────────────────────────────────────────
  function revokeCurrentURL() {
    if (currentObjectURL) {
      URL.revokeObjectURL(currentObjectURL);
      currentObjectURL = null;
    }
  }

  function makeObjectURL(blob) {
    revokeCurrentURL();
    currentObjectURL = URL.createObjectURL(blob);
    return currentObjectURL;
  }

  // ── Split handler ──────────────────────────────────────────────────────────
  async function onSplit() {
    if (!pdfBytes || !totalPages) return;

    if (!window.PDFLib) {
      alert(typeof t === 'function' ? t('common.libraryNotLoaded') : 'PDF library not loaded. Please refresh the page.');
      return;
    }

    splitBtn.disabled = true;
    if (resultSection) resultSection.hidden = true;
    setProgress(0, typeof t === 'function' ? t('split.preparing') : 'Preparing\u2026');

    try {
      if (modeRange && modeRange.checked) {
        await splitByRange();
      } else {
        await splitEveryPage();
      }
    } catch (err) {
      console.error('[split] Error:', err);
      if (progressWrap) progressWrap.hidden = true;
      alert(
        (typeof t === 'function' ? t('common.error') : 'Error') +
        ': ' + err.message
      );
    } finally {
      splitBtn.disabled = false;
    }
  }

  // ── Split by range ─────────────────────────────────────────────────────────
  async function splitByRange() {
    var raw = rangeInput ? rangeInput.value.trim() : '';
    if (!raw) {
      alert(typeof t === 'function' ? t('split.enterRange') : 'Please enter a page range (e.g. 1-3, 5, 7-9).');
      if (progressWrap) progressWrap.hidden = true;
      return;
    }

    var indices;
    try {
      indices = parseRanges(raw, totalPages);
    } catch (parseErr) {
      alert((typeof t === 'function' ? t('split.rangeError') : 'Invalid page range') + ': ' + parseErr.message);
      if (progressWrap) progressWrap.hidden = true;
      return;
    }

    if (!indices.length) {
      alert(typeof t === 'function' ? t('split.emptyRange') : 'No valid pages found in that range.');
      if (progressWrap) progressWrap.hidden = true;
      return;
    }

    setProgress(10, typeof t === 'function' ? t('split.loading') : 'Loading PDF\u2026');
    var srcDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    setProgress(35, typeof t === 'function' ? t('split.extracting') : 'Extracting pages\u2026');
    var newDoc = await PDFLib.PDFDocument.create();
    var copied = await newDoc.copyPages(srcDoc, indices);
    copied.forEach(function (p) { newDoc.addPage(p); });

    setProgress(80, typeof t === 'function' ? t('split.saving') : 'Saving\u2026');
    var outBytes = await newDoc.save();
    var blob = new Blob([outBytes], { type: 'application/pdf' });
    var url  = makeObjectURL(blob);

    var baseName  = (fileNameEl && fileNameEl.textContent ? fileNameEl.textContent : 'split').replace(/\.pdf$/i, '');
    var rangeTag  = raw.replace(/\s+/g, '').replace(/,/g, '_');
    var filename  = baseName + '_pages_' + rangeTag + '.pdf';

    setProgress(100, typeof t === 'function' ? t('split.done') : 'Done!');

    if (downloadBtn) {
      downloadBtn.href     = url;
      downloadBtn.download = filename;
    }
    if (resultInfo) {
      resultInfo.textContent = typeof t === 'function'
        ? t('split.resultRange', { pages: indices.length })
        : 'Created PDF with ' + indices.length + ' page(s). (' +
          (typeof formatFileSize === 'function' ? formatFileSize(blob.size) : blob.size + ' B') + ')';
    }
    if (resultSection) resultSection.hidden = false;

    // Show PDF preview
    if (typeof showPreview === 'function') showPreview('resultSection', url, filename);
  }

  // ── Split every page ───────────────────────────────────────────────────────
  async function splitEveryPage() {
    if (typeof JSZip === 'undefined') {
      alert(typeof t === 'function' ? t('common.jsZipNotLoaded') : 'JSZip is not loaded. Please refresh the page.');
      if (progressWrap) progressWrap.hidden = true;
      return;
    }

    setProgress(5, typeof t === 'function' ? t('split.loading') : 'Loading PDF\u2026');
    var srcDoc   = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    var baseName = (fileNameEl && fileNameEl.textContent ? fileNameEl.textContent : 'split').replace(/\.pdf$/i, '');
    var padLen   = String(totalPages).length;
    var zip      = new JSZip();
    var folder   = zip.folder(baseName);

    for (var i = 0; i < totalPages; i++) {
      var pct   = 10 + Math.round((i / totalPages) * 78);
      var label = typeof t === 'function'
        ? t('split.processingPage', { current: i + 1, total: totalPages })
        : 'Processing page ' + (i + 1) + ' of ' + totalPages + '\u2026';
      setProgress(pct, label);

      var pageDoc = await PDFLib.PDFDocument.create();
      var copiedPage = await pageDoc.copyPages(srcDoc, [i]);
      pageDoc.addPage(copiedPage[0]);
      var pageBytes = await pageDoc.save();
      var pageNum   = String(i + 1).padStart(padLen, '0');
      folder.file(baseName + '_page' + pageNum + '.pdf', pageBytes);
    }

    setProgress(90, typeof t === 'function' ? t('split.zipping') : 'Creating ZIP\u2026');

    var zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } },
      function (meta) {
        setProgress(90 + Math.round(meta.percent * 0.09),
          (typeof t === 'function' ? t('split.zipping') : 'Zipping') + ' ' + meta.percent.toFixed(0) + '%');
      }
    );

    var url      = makeObjectURL(zipBlob);
    var filename = baseName + '_all_pages.zip';

    setProgress(100, typeof t === 'function' ? t('split.done') : 'Done!');

    if (downloadBtn) {
      downloadBtn.href     = url;
      downloadBtn.download = filename;
    }
    if (resultInfo) {
      resultInfo.textContent = typeof t === 'function'
        ? t('split.resultAll', { total: totalPages })
        : 'Created ZIP with ' + totalPages + ' PDF file(s). (' +
          (typeof formatFileSize === 'function' ? formatFileSize(zipBlob.size) : zipBlob.size + ' B') + ')';
    }
    if (resultSection) resultSection.hidden = false;
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var ready = (typeof i18nReady !== 'undefined') ? i18nReady : Promise.resolve();
      Promise.resolve(ready).then(init).catch(init);
    });
  } else {
    var ready = (typeof i18nReady !== 'undefined') ? i18nReady : Promise.resolve();
    Promise.resolve(ready).then(init).catch(init);
  }

})();

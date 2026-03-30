/**
 * rotate.js — PDF Rotation
 * Rotates all or selected pages in a PDF using pdf-lib.
 * Depends on: app.js (i18nReady, t, setupUploadZone, formatFileSize, readFileAsArrayBuffer)
 *             window.PDFLib
 */

'use strict';

(function () {

  // ── State ──────────────────────────────────────────────────────────────────
  let pdfBytes         = null;
  let totalPages       = 0;
  let currentObjectURL = null;

  // ── DOM references ─────────────────────────────────────────────────────────
  const uploadZone       = document.getElementById('uploadZone');
  const fileInput        = document.getElementById('fileInput');
  const fileInfo         = document.getElementById('fileInfo');
  const fileNameEl       = document.getElementById('fileName');
  const pageCountEl      = document.getElementById('pageCount');
  const optionsPanel     = document.getElementById('optionsPanel');
  const angleGroup       = document.getElementById('angleGroup');
  const allPagesToggle   = document.getElementById('allPagesToggle');
  const pagePickerWrap   = document.getElementById('pagePickerWrap');
  const pageCheckboxGrid = document.getElementById('pageCheckboxGrid');
  const selectAllBtn     = document.getElementById('selectAllPages');
  const deselectAllBtn   = document.getElementById('deselectAllPages');
  const rotateBtn        = document.getElementById('rotateBtn');
  const progressWrap     = document.getElementById('progressWrap');
  const progressBar      = progressWrap ? progressWrap.querySelector('.progress-bar-fill') : null;
  const progressLabel    = progressWrap ? progressWrap.querySelector('p') : null;
  const resultSection    = document.getElementById('resultSection');
  const resultInfo       = document.getElementById('resultInfo');
  const downloadBtn      = document.getElementById('downloadBtn');

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

    // Angle pill buttons
    if (angleGroup) {
      angleGroup.addEventListener('click', function (e) {
        var pill = e.target.closest('.pill-btn');
        if (!pill) return;
        angleGroup.querySelectorAll('.pill-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        pill.classList.add('active');
      });

      // Activate first pill by default if none is active
      var firstPill = angleGroup.querySelector('.pill-btn');
      if (firstPill && !angleGroup.querySelector('.pill-btn.active')) {
        firstPill.classList.add('active');
      }
    }

    // All-pages toggle
    if (allPagesToggle) {
      allPagesToggle.addEventListener('change', onToggleAllPages);
      onToggleAllPages(); // set initial state
    }

    // Select all / deselect all
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', function () {
        if (!pageCheckboxGrid) return;
        pageCheckboxGrid.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
          cb.checked = true;
        });
      });
    }

    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', function () {
        if (!pageCheckboxGrid) return;
        pageCheckboxGrid.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
          cb.checked = false;
        });
      });
    }

    // Rotate button
    if (rotateBtn) rotateBtn.addEventListener('click', onRotate);

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
  }

  // ── Clear file / reset ────────────────────────────────────────────────────
  function clearFile() {
    pdfBytes   = null;
    totalPages = 0;
    revokeCurrentURL();
    if (uploadZone)       uploadZone.style.display  = '';
    if (fileInfo)         fileInfo.hidden            = true;
    if (optionsPanel)     optionsPanel.hidden        = true;
    if (resultSection)    resultSection.hidden       = true;
    if (progressWrap)     progressWrap.hidden        = true;
    if (rotateBtn)        rotateBtn.disabled         = true;
    if (pageCheckboxGrid) pageCheckboxGrid.innerHTML = '';
    if (fileInput)        fileInput.value            = '';
    if (typeof hidePreview === 'function') hidePreview('resultSection');
  }

  // ── Toggle all-pages mode ──────────────────────────────────────────────────
  function onToggleAllPages() {
    var allChecked = allPagesToggle ? allPagesToggle.checked : true;
    if (pagePickerWrap) pagePickerWrap.hidden = allChecked;
  }

  // ── File handler ───────────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert(typeof t === 'function' ? t('common.pdfOnly') : 'Please select a valid PDF file.');
      return;
    }

    // Reset
    pdfBytes   = null;
    totalPages = 0;
    if (rotateBtn)        rotateBtn.disabled      = true;
    if (resultSection)    resultSection.hidden     = true;
    if (progressWrap)     progressWrap.hidden      = true;
    if (pageCheckboxGrid) pageCheckboxGrid.innerHTML = '';
    revokeCurrentURL();

    try {
      var buffer = await readFileAsArrayBuffer(file);
      pdfBytes = new Uint8Array(buffer);

      var pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      totalPages = pdfDoc.getPageCount();

      // Show file info
      if (fileNameEl)  fileNameEl.textContent  = file.name;
      if (pageCountEl) pageCountEl.textContent = totalPages + (totalPages === 1 ? ' page' : ' pages');
      if (fileInfo)    fileInfo.hidden          = false;
      if (uploadZone)  uploadZone.style.display = 'none';

      // Show options panel
      if (optionsPanel) optionsPanel.hidden = false;

      // Populate page checkboxes
      buildPageCheckboxes();

      if (rotateBtn) rotateBtn.disabled = false;

    } catch (err) {
      console.error('[rotate] Failed to load PDF:', err);
      alert(
        (typeof t === 'function' ? t('common.error') : 'Error') +
        ': ' + err.message
      );
    }
  }

  // ── Build page checkbox grid ───────────────────────────────────────────────
  function buildPageCheckboxes() {
    if (!pageCheckboxGrid) return;
    pageCheckboxGrid.innerHTML = '';

    for (var i = 1; i <= totalPages; i++) {
      var label = document.createElement('label');
      label.className = 'page-checkbox-label';

      var cb = document.createElement('input');
      cb.type    = 'checkbox';
      cb.value   = i;
      cb.id      = 'pageCheck_' + i;
      cb.checked = false;

      var span = document.createElement('span');
      span.textContent = (typeof t === 'function' ? t('common.page') : 'Page') + ' ' + i;

      label.appendChild(cb);
      label.appendChild(span);
      pageCheckboxGrid.appendChild(label);
    }
  }

  // ── Get selected angle ─────────────────────────────────────────────────────
  function getSelectedAngle() {
    if (!angleGroup) return 90;
    var activePill = angleGroup.querySelector('.pill-btn.active');
    if (!activePill) {
      // Fall back to first pill
      var firstPill = angleGroup.querySelector('.pill-btn');
      return firstPill ? parseInt(firstPill.dataset.angle, 10) || 90 : 90;
    }
    return parseInt(activePill.dataset.angle, 10) || 90;
  }

  // ── Get pages to rotate (0-based indices) ─────────────────────────────────
  function getPagesToRotate() {
    var allPages = !allPagesToggle || allPagesToggle.checked;

    if (allPages) {
      return Array.from({ length: totalPages }, function (_, i) { return i; });
    }

    // Collect checked page checkboxes
    var checked = [];
    if (pageCheckboxGrid) {
      pageCheckboxGrid.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) {
        var val = parseInt(cb.value, 10);
        if (!isNaN(val) && val >= 1 && val <= totalPages) {
          checked.push(val - 1); // convert to 0-based
        }
      });
    }
    return checked.sort(function (a, b) { return a - b; });
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

  // ── Rotate handler ─────────────────────────────────────────────────────────
  async function onRotate() {
    if (!pdfBytes || !totalPages) return;

    if (!window.PDFLib) {
      alert(typeof t === 'function' ? t('common.libraryNotLoaded') : 'PDF library not loaded. Please refresh the page.');
      return;
    }

    var angle      = getSelectedAngle();
    var pagesList  = getPagesToRotate();

    if (!pagesList.length) {
      alert(typeof t === 'function' ? t('rotate.noPages') : 'Please select at least one page to rotate.');
      return;
    }

    rotateBtn.disabled = true;
    if (resultSection) resultSection.hidden = true;
    setProgress(0, typeof t === 'function' ? t('rotate.preparing') : 'Preparing\u2026');

    try {
      setProgress(10, typeof t === 'function' ? t('rotate.loading') : 'Loading PDF\u2026');
      var pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      var pages  = pdfDoc.getPages();

      setProgress(30, typeof t === 'function' ? t('rotate.rotating') : 'Rotating pages\u2026');

      for (var i = 0; i < pagesList.length; i++) {
        var pageIndex = pagesList[i];
        if (pageIndex < 0 || pageIndex >= pages.length) continue;

        var page            = pages[pageIndex];
        var currentRotation = page.getRotation().angle;
        var newAngle        = (currentRotation + angle + 360) % 360;
        page.setRotation(PDFLib.degrees(newAngle));

        var pct = 30 + Math.round(((i + 1) / pagesList.length) * 50);
        setProgress(pct,
          typeof t === 'function'
            ? t('rotate.rotatingPage', { current: i + 1, total: pagesList.length })
            : 'Rotating page ' + (i + 1) + ' of ' + pagesList.length + '\u2026'
        );
      }

      setProgress(85, typeof t === 'function' ? t('rotate.saving') : 'Saving\u2026');
      var outBytes = await pdfDoc.save();
      var blob     = new Blob([outBytes], { type: 'application/pdf' });
      var url      = makeObjectURL(blob);

      var baseName = (fileNameEl && fileNameEl.textContent ? fileNameEl.textContent : 'rotated').replace(/\.pdf$/i, '');
      var filename = baseName + '_rotated' + angle + '.pdf';

      setProgress(100, typeof t === 'function' ? t('rotate.done') : 'Done!');

      if (downloadBtn) {
        downloadBtn.href     = url;
        downloadBtn.download = filename;
      }

      var allPages    = !allPagesToggle || allPagesToggle.checked;
      var pagesLabel  = allPages
        ? (typeof t === 'function' ? t('rotate.allPages') : 'All pages')
        : pagesList.length + (typeof t === 'function' ? ' ' + t('rotate.pagesSelected') : ' page(s)');
      var angleLabel  = _angleName(angle);
      var sizeLabel   = typeof formatFileSize === 'function' ? formatFileSize(blob.size) : blob.size + ' B';

      if (resultInfo) {
        resultInfo.textContent = angleLabel + ' \u2014 ' + pagesLabel + '. (' + sizeLabel + ')';
      }
      if (resultSection) resultSection.hidden = false;

      // Show PDF preview
      if (typeof showPreview === 'function') showPreview('resultSection', url, filename);

    } catch (err) {
      console.error('[rotate] Error:', err);
      if (progressWrap) progressWrap.hidden = true;
      alert(
        (typeof t === 'function' ? t('common.error') : 'Error') +
        ': ' + err.message
      );
    } finally {
      rotateBtn.disabled = false;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _angleName(deg) {
    switch (deg) {
      case 90:  return typeof t === 'function' ? t('rotate.angle90cw')  : '90\u00b0 Clockwise';
      case 180: return typeof t === 'function' ? t('rotate.angle180')   : '180\u00b0';
      case 270: return typeof t === 'function' ? t('rotate.angle90ccw') : '90\u00b0 Counter-Clockwise';
      default:  return deg + '\u00b0';
    }
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

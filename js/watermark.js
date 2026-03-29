/**
 * watermark.js — Add Text Watermark to PDF
 * Draws a text watermark on every page of a PDF using pdf-lib.
 * Depends on: app.js (i18nReady, t, setupUploadZone, formatFileSize, readFileAsArrayBuffer)
 *             window.PDFLib
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js to initialize i18n
  await window.i18nReady;

  // ── State ──────────────────────────────────────────────
  let currentFile = null;
  let totalPages  = 0;

  // ── DOM references ─────────────────────────────────────
  const selectedFileInfo  = document.getElementById('selectedFileInfo');
  const selectedFileName  = document.getElementById('selectedFileName');
  const selectedFileSize  = document.getElementById('selectedFileSize');
  const selectedFilePages = document.getElementById('selectedFilePages');
  const removeFileBtn     = document.getElementById('removeFileBtn');
  const actionArea        = document.getElementById('actionArea');
  const toolOptions       = document.getElementById('toolOptions');
  const watermarkText     = document.getElementById('watermarkText');
  const fontSizeSlider    = document.getElementById('fontSizeSlider');
  const fontSizeValue     = document.getElementById('fontSizeValue');
  const opacitySlider     = document.getElementById('opacitySlider');
  const opacityValue      = document.getElementById('opacityValue');
  const colorPicker       = document.getElementById('colorPicker');
  const colorHex          = document.getElementById('colorHex');
  const positionGroup     = document.getElementById('positionGroup');
  const watermarkBtn      = document.getElementById('watermarkBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar       = document.getElementById('progressBar');
  const progressPercent   = document.getElementById('progressPercent');
  const resultSection     = document.getElementById('resultSection');
  const resultInfo        = document.getElementById('resultInfo');
  const downloadBtn       = document.getElementById('downloadBtn');
  const resetBtn          = document.getElementById('resetBtn');

  // ── Upload zone setup ──────────────────────────────────
  setupUploadZone('uploadZone', 'fileInput', onFile, {
    multiple: false,
    accept: '.pdf,application/pdf',
  });

  // Handle the upload-trigger button inside the zone
  const uploadZone = document.getElementById('uploadZone');
  if (uploadZone) {
    const triggerBtn = uploadZone.querySelector('.upload-trigger');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('fileInput').click();
      });
    }
  }

  // ── Slider value displays ──────────────────────────────
  if (fontSizeSlider && fontSizeValue) {
    fontSizeSlider.addEventListener('input', () => {
      fontSizeValue.textContent = fontSizeSlider.value + 'px';
    });
  }

  if (opacitySlider && opacityValue) {
    opacitySlider.addEventListener('input', () => {
      opacityValue.textContent = opacitySlider.value + '%';
    });
  }

  if (colorPicker && colorHex) {
    colorPicker.addEventListener('input', () => {
      colorHex.textContent = colorPicker.value.toUpperCase();
    });
  }

  // ── Position pill toggle ───────────────────────────────
  if (positionGroup) {
    positionGroup.addEventListener('click', (e) => {
      const pill = e.target.closest('.option-pill');
      if (!pill) return;
      positionGroup.querySelectorAll('.option-pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
      const radio = pill.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  }

  // ── Remove file button ─────────────────────────────────
  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', clearFile);
  }

  // ── Reset button ───────────────────────────────────────
  if (resetBtn) {
    resetBtn.addEventListener('click', clearFile);
  }

  // ── Watermark button ───────────────────────────────────
  if (watermarkBtn) {
    watermarkBtn.addEventListener('click', addWatermark);
  }

  // ── File selection handler ─────────────────────────────
  async function onFile(fileList) {
    const file = Array.from(fileList)[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert(t('common.pdfOnly') || 'Please select a PDF file.');
      return;
    }
    currentFile = file;

    // Read page count
    try {
      const buffer = await readFileAsArrayBuffer(file);
      const pdfDoc = await PDFLib.PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });
      totalPages = pdfDoc.getPageCount();
    } catch (err) {
      console.error('[watermark] Failed to read PDF:', err);
      totalPages = 0;
    }

    showFileInfo();
  }

  // ── Show file info ─────────────────────────────────────
  function showFileInfo() {
    if (!currentFile) return;
    if (selectedFileName) selectedFileName.textContent = currentFile.name;
    if (selectedFileSize) selectedFileSize.textContent = formatFileSize(currentFile.size);
    if (selectedFilePages && totalPages > 0) {
      selectedFilePages.textContent = totalPages + ' ' + (totalPages === 1 ? 'page' : 'pages');
    }
    if (uploadZone)       uploadZone.style.display        = 'none';
    if (selectedFileInfo) selectedFileInfo.style.display = '';
    if (actionArea)       actionArea.style.display       = '';
    if (toolOptions)      toolOptions.style.display      = '';
    hideResultUI();
    hideProgressUI();
  }

  // ── Clear file ─────────────────────────────────────────
  function clearFile() {
    currentFile = null;
    totalPages  = 0;
    if (uploadZone)       uploadZone.style.display        = '';
    if (selectedFileInfo) selectedFileInfo.style.display = 'none';
    if (actionArea)       actionArea.style.display       = 'none';
    if (toolOptions)      toolOptions.style.display      = 'none';
    hideResultUI();
    hideProgressUI();

    // Reset file input so the same file can be re-selected
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
  }

  // ── Progress helpers ───────────────────────────────────
  function setProgress(percent) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (progressContainer) progressContainer.style.display = '';
    if (progressBar)       progressBar.style.width         = clamped + '%';
    if (progressPercent)   progressPercent.textContent      = clamped + '%';
  }

  function hideProgressUI() {
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar)       progressBar.style.width         = '0%';
    if (progressPercent)   progressPercent.textContent      = '0%';
  }

  // ── Hide result ────────────────────────────────────────
  function hideResultUI() {
    if (resultSection) resultSection.style.display = 'none';
    if (downloadBtn)   { downloadBtn.href = '#'; downloadBtn.download = 'watermarked.pdf'; }
    if (resultInfo)    resultInfo.textContent = '';
  }

  // ── Hex color to RGB (0-1 range) ───────────────────────
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return { r, g, b };
  }

  // ── Get current position setting ───────────────────────
  function getPosition() {
    const checked = document.querySelector('[name="watermarkPosition"]:checked');
    return checked ? checked.value : 'diagonal';
  }

  // ── Add watermark ──────────────────────────────────────
  async function addWatermark() {
    if (!currentFile) return;
    if (!window.PDFLib) {
      alert(t('common.libraryNotLoaded') || 'PDF library not loaded. Please refresh the page.');
      return;
    }

    const text     = (watermarkText ? watermarkText.value.trim() : '') || 'CONFIDENTIAL';
    const fontSize = fontSizeSlider ? parseInt(fontSizeSlider.value, 10) : 60;
    const opacity  = opacitySlider ? parseInt(opacitySlider.value, 10) / 100 : 0.3;
    const color    = colorPicker ? colorPicker.value : '#999999';
    const position = getPosition();

    const { r, g, b } = hexToRgb(color);

    watermarkBtn.disabled = true;
    hideResultUI();
    setProgress(0);

    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;

      setProgress(10);
      let arrayBuffer;
      try {
        arrayBuffer = await readFileAsArrayBuffer(currentFile);
      } catch (err) {
        throw new Error('Could not read file: ' + err.message);
      }

      const bytes = new Uint8Array(arrayBuffer);

      setProgress(20);
      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch (err) {
        throw new Error((t('watermark.loadError') || 'Could not open PDF') + ': ' + err.message);
      }

      setProgress(30);

      // Embed font
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pages = pdfDoc.getPages();
      const pageCount = pages.length;

      // Process each page
      for (let i = 0; i < pageCount; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();

        // Measure text width for centering
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = fontSize;

        // Common draw options
        const drawOptions = {
          size: fontSize,
          font: font,
          color: rgb(r, g, b),
          opacity: opacity,
        };

        switch (position) {
          case 'diagonal': {
            // Place text at center of page, rotated -45 degrees
            const centerX = width / 2;
            const centerY = height / 2;
            // Offset so text is visually centered at the rotation point
            const offsetX = -textWidth / 2;
            const offsetY = -textHeight / 2;
            // Rotate around center: translate to center, apply offset
            const cos45 = Math.cos(Math.PI / 4);
            const sin45 = Math.sin(Math.PI / 4);
            const x = centerX + offsetX * cos45 - offsetY * sin45;
            const y = centerY + offsetX * sin45 + offsetY * cos45;
            page.drawText(text, {
              ...drawOptions,
              x: x,
              y: y,
              rotate: degrees(-45),
            });
            break;
          }

          case 'center': {
            // Centered horizontally and vertically, no rotation
            const x = (width - textWidth) / 2;
            const y = (height - textHeight) / 2;
            page.drawText(text, {
              ...drawOptions,
              x: x,
              y: y,
            });
            break;
          }

          case 'top': {
            // Centered horizontally, near top of page
            const x = (width - textWidth) / 2;
            const y = height - fontSize - 30;
            page.drawText(text, {
              ...drawOptions,
              x: x,
              y: y,
            });
            break;
          }

          case 'bottom': {
            // Centered horizontally, near bottom of page
            const x = (width - textWidth) / 2;
            const y = 30;
            page.drawText(text, {
              ...drawOptions,
              x: x,
              y: y,
            });
            break;
          }
        }

        // Update progress (30% to 85% range for page processing)
        const pct = 30 + Math.round(((i + 1) / pageCount) * 55);
        setProgress(pct);
      }

      setProgress(90);

      // Save the document
      const watermarkedBytes = await pdfDoc.save();

      setProgress(95);

      // Create blob and download URL
      const blob = new Blob([watermarkedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const outName = _watermarkedFilename(currentFile.name);

      setProgress(100);
      await _sleep(400);
      hideProgressUI();

      // Populate result info
      const positionLabel = position.charAt(0).toUpperCase() + position.slice(1);
      if (resultInfo) {
        resultInfo.textContent =
          '"' + text + '" watermark added to ' + pageCount +
          (pageCount === 1 ? ' page' : ' pages') +
          ' (' + positionLabel + ', ' + fontSize + 'px, ' +
          Math.round(opacity * 100) + '% opacity). ' +
          'File size: ' + formatFileSize(blob.size);
      }

      // Set download button
      if (downloadBtn) {
        downloadBtn.href = url;
        downloadBtn.download = outName;
        downloadBtn.addEventListener('click', () => {
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }, { once: true });
      }

      // Show result section
      if (resultSection) resultSection.style.display = '';

      // Show PDF preview
      showPreview('resultSection', url, outName);

      // Also call app.js showResult for consistency
      showResult('resultSection', {
        filename: outName,
        size: blob.size,
        downloadUrl: url,
        extraInfo: '"' + text + '" watermark applied to all ' + pageCount + ' pages.',
      });

    } catch (err) {
      console.error('[watermark] Error:', err);
      hideProgressUI();
      alert((t('common.error') || 'Error') + ': ' + err.message);
    } finally {
      watermarkBtn.disabled = false;
    }
  }

  // ── Helpers ────────────────────────────────────────────

  /** Insert "_watermarked" before the .pdf extension. */
  function _watermarkedFilename(name) {
    const dot = name.lastIndexOf('.');
    if (dot === -1) return name + '_watermarked.pdf';
    return name.slice(0, dot) + '_watermarked' + name.slice(dot);
  }

  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

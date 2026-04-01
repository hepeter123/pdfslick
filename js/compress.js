/**
 * compress.js — PDF Compression functionality
 * Re-saves PDFs with pdf-lib to reduce file size by removing redundancy.
 * Depends on: app.js, pdf-lib (CDN)
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js to initialize i18n
  await window.i18nReady;

  // ── State ──────────────────────────────────────────────
  let currentFile = null;

  // ── DOM references ─────────────────────────────────────
  const selectedFileInfo  = document.getElementById('selectedFileInfo');
  const selectedFileName  = document.getElementById('selectedFileName');
  const selectedFileSize  = document.getElementById('selectedFileSize');
  const removeFileBtn     = document.getElementById('removeFileBtn');
  const actionArea        = document.getElementById('actionArea');
  const toolOptions       = document.getElementById('toolOptions');
  const compressBtn       = document.getElementById('compressBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar       = document.getElementById('progressBar');
  const progressPercent   = document.getElementById('progressPercent');
  const resultSection     = document.getElementById('resultSection');
  const downloadBtn       = document.getElementById('downloadBtn');
  const resetBtn          = document.getElementById('resetBtn');
  const statOriginal      = document.getElementById('statOriginal');
  const statCompressed    = document.getElementById('statCompressed');
  const statSaved         = document.getElementById('statSaved');

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

  // ── Remove file button ─────────────────────────────────
  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', clearFile);
  }

  // ── Reset button ───────────────────────────────────────
  if (resetBtn) {
    resetBtn.addEventListener('click', clearFile);
  }

  // ── Compress button ────────────────────────────────────
  if (compressBtn) {
    compressBtn.addEventListener('click', compressPDF);
  }

  // ── File selection handler ─────────────────────────────
  function onFile(fileList) {
    const file = Array.from(fileList)[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert(t('common.pdfOnly') || 'Please select a PDF file.');
      return;
    }
    currentFile = file;
    showFileInfo();
  }

  // ── Show file info ─────────────────────────────────────
  function showFileInfo() {
    if (!currentFile) return;
    if (selectedFileName) selectedFileName.textContent = currentFile.name;
    if (selectedFileSize) selectedFileSize.textContent = formatFileSize(currentFile.size);
    if (uploadZone)       uploadZone.style.display     = 'none';
    if (selectedFileInfo) selectedFileInfo.style.display = '';
    if (actionArea)       actionArea.style.display       = '';
    if (toolOptions)      toolOptions.style.display      = '';
    hideResultUI();
    hideProgressUI();
  }

  // ── Clear file ─────────────────────────────────────────
  function clearFile() {
    currentFile = null;
    if (uploadZone)       uploadZone.style.display     = '';
    if (selectedFileInfo) selectedFileInfo.style.display = 'none';
    if (actionArea)       actionArea.style.display       = 'none';
    if (toolOptions)      toolOptions.style.display      = 'none';
    hideResultUI();
    hideProgressUI();
  }

  // ── Progress helpers ───────────────────────────────────
  function setProgress(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    if (progressContainer) progressContainer.style.display = '';
    if (progressBar)        progressBar.style.width         = `${clamped}%`;
    if (progressPercent)    progressPercent.textContent     = `${clamped}%`;
  }

  function hideProgressUI() {
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar)        progressBar.style.width         = '0%';
    if (progressPercent)    progressPercent.textContent     = '0%';
  }

  // ── Hide result ────────────────────────────────────────
  function hideResultUI() {
    if (resultSection) resultSection.style.display = 'none';
    if (downloadBtn)   { downloadBtn.href = '#'; downloadBtn.download = 'compressed.pdf'; }
    if (statOriginal)   statOriginal.textContent   = '—';
    if (statCompressed) statCompressed.textContent = '—';
    if (statSaved)      statSaved.textContent      = '—';
  }

  // ── Read compression level ─────────────────────────────
  function getCompressionLevel() {
    const checked = document.querySelector('[name="compressionLevel"]:checked');
    return checked ? checked.value : 'medium'; // default medium
  }

  // ── Compress PDF ───────────────────────────────────────
  async function compressPDF() {
    if (!currentFile) return;
    if (!window.PDFLib) {
      alert(t('common.libraryNotLoaded') || 'PDF library not loaded. Please refresh the page.');
      return;
    }

    const level = getCompressionLevel();
    compressBtn.disabled = true;
    hideResultUI();
    setProgress(0);

    try {
      const { PDFDocument } = PDFLib;

      setProgress(10);
      let arrayBuffer;
      try {
        arrayBuffer = await readFileAsArrayBuffer(currentFile);
      } catch (err) {
        throw new Error(`Could not read file: ${err.message}`);
      }

      const bytes = new Uint8Array(arrayBuffer);
      const originalSize = bytes.length;

      setProgress(30);

      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(bytes, {
          ignoreEncryption: true,
          updateMetadata: false,
        });
      } catch (err) {
        throw new Error(`${t('compress.loadError') || 'Could not open PDF'}: ${err.message}`);
      }

      setProgress(55);

      // pdf-lib's useObjectStreams packs cross-reference tables into compressed
      // object streams (PDF 1.5+), giving the primary size reduction.
      // The compression level setting controls objectsPerTick throughput.
      const objectsPerTick = level === 'high' ? 20 : level === 'low' ? 100 : 50;

      const compressedBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick,
      });

      const compressedSize = compressedBytes.length;
      const savedBytes = originalSize - compressedSize;
      const ratio = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;

      setProgress(90);
      await _sleep(300);
      setProgress(100);
      await _sleep(400);
      hideProgressUI();

      // Build the blob and URL
      const blob = new Blob([compressedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const outName = _compressedFilename(currentFile.name);

      // Build extra info string
      let extraInfo;
      if (ratio < 1) {
        extraInfo = t('compress.alreadyOptimized') ||
          'This PDF appears to be already optimized. No significant size reduction was possible.';
      } else {
        extraInfo = `Before: ${formatFileSize(originalSize)} → ` +
          `After: ${formatFileSize(compressedSize)} ` +
          `(saved ${formatFileSize(Math.max(0, savedBytes))}, ` +
          `${ratio.toFixed(1)}% reduction)`;
      }

      // Populate result stat cards
      if (statOriginal)   statOriginal.textContent   = formatFileSize(originalSize);
      if (statCompressed) statCompressed.textContent = formatFileSize(compressedSize);
      if (statSaved) {
        statSaved.textContent = ratio < 1
          ? '< 1%'
          : `${ratio.toFixed(1)}%`;
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

      // Also call app.js showResult for the extraInfo display if the container
      // uses the injected pattern (no-op if resultSection has static HTML).
      showResult('resultSection', {
        filename: outName,
        size: compressedSize,
        downloadUrl: url,
        extraInfo,
      });

    } catch (err) {
      console.error('[compress] Error:', err);
      hideProgressUI();
      alert(`${t('common.error') || 'Error'}: ${err.message}`);
    } finally {
      compressBtn.disabled = false;
    }
  }

  // ── Helpers ────────────────────────────────────────────

  /** Insert "_compressed" before the .pdf extension. */
  function _compressedFilename(name) {
    const dot = name.lastIndexOf('.');
    if (dot === -1) return name + '_compressed.pdf';
    return name.slice(0, dot) + '_compressed' + name.slice(dot);
  }

  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

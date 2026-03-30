/**
 * pdf-to-jpg.js — PDF to JPG conversion
 * Renders each PDF page to a canvas via PDF.js, exports as JPEG.
 * Provides individual page downloads and "Download All as ZIP" via JSZip.
 * Depends on: app.js, PDF.js (CDN), JSZip (CDN)
 *
 * CDN URLs expected in HTML:
 *   https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
 *   https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js
 *   https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js to initialize i18n
  await window.i18nReady;

  // ── PDF.js worker setup ──────────────────────────────────
  if (typeof pdfjsLib === 'undefined') {
    console.error('[pdf-to-jpg] PDF.js not loaded.');
  } else {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // ── Constants ────────────────────────────────────────────
  const RENDER_SCALE = 2; // 2× for crisp output

  // ── State ────────────────────────────────────────────────
  let currentFile  = null;
  let pageBlobs    = []; // Array<{ blob: Blob, filename: string }>
  let isConverting = false;

  // ── DOM references ───────────────────────────────────────
  const uploadZone        = document.getElementById('uploadZone');
  const fileInput         = document.getElementById('fileInput');
  const selectedFileInfo  = document.getElementById('selectedFileInfo');
  const selectedFileName  = document.getElementById('selectedFileName');
  const selectedFileSize  = document.getElementById('selectedFileSize');
  const selectedPageCount = document.getElementById('selectedPageCount');
  const actionArea        = document.getElementById('actionArea');
  const convertBtn        = document.getElementById('convertBtn');
  const qualitySlider     = document.getElementById('qualitySlider');
  const qualityValue      = document.getElementById('qualityValue');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar       = document.getElementById('progressBar');
  const progressPercent   = document.getElementById('progressPercent');
  const progressLabel     = document.getElementById('progressLabel');
  const resultSection     = document.getElementById('resultSection');
  const resultMeta        = document.getElementById('resultMeta');
  const thumbnailGrid     = document.getElementById('thumbnailGrid');
  const downloadAllBtn    = document.getElementById('downloadAllBtn');
  const downloadAllBtnBottom = document.getElementById('downloadAllBtnBottom');
  const removeFileBtn     = document.getElementById('removeFileBtn');
  const resetBtn          = document.getElementById('resetBtn');
  const toolOptions       = document.getElementById('toolOptions');

  // ── Upload zone setup ────────────────────────────────────
  window.setupUploadZone('uploadZone', 'fileInput', onFileSelected, {
    multiple: false,
    accept: '.pdf,application/pdf',
  });

  // ── Quality slider display ───────────────────────────────
  if (qualitySlider && qualityValue) {
    qualitySlider.addEventListener('input', () => {
      qualityValue.textContent = qualitySlider.value + '%';
      qualitySlider.setAttribute('aria-valuenow', qualitySlider.value);
    });
  }

  // ── Buttons ──────────────────────────────────────────────
  if (convertBtn) convertBtn.addEventListener('click', convertPDF);
  if (downloadAllBtn) downloadAllBtn.addEventListener('click', downloadAllAsZip);
  if (downloadAllBtnBottom) downloadAllBtnBottom.addEventListener('click', downloadAllAsZip);
  if (removeFileBtn) removeFileBtn.addEventListener('click', resetTool);
  if (resetBtn) resetBtn.addEventListener('click', resetTool);

  // ── File selection ───────────────────────────────────────
  function onFileSelected(fileList) {
    const file = fileList[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert(window.t('common.pdfOnly') || 'Please select a PDF file.');
      return;
    }
    currentFile = file;
    pageBlobs = [];
    resetResult();
    loadFileInfo();
  }

  async function loadFileInfo() {
    if (!currentFile) return;

    // Show file info card
    if (selectedFileName) selectedFileName.textContent = currentFile.name;
    if (selectedFileSize) {
      // Will add page count after loading
      selectedFileSize.innerHTML = window.formatFileSize(currentFile.size) +
        ' &middot; <span id="selectedPageCount">—</span> pages';
    }
    if (selectedFileInfo) selectedFileInfo.style.display = '';
    if (uploadZone)       uploadZone.style.display       = 'none';

    // Show quality options and action area
    if (toolOptions) toolOptions.style.display = '';
    if (actionArea) actionArea.style.display = '';
    if (convertBtn) convertBtn.disabled = false;

    // Get page count via PDF.js
    try {
      const arrayBuffer = await window.readFileAsArrayBuffer(currentFile);
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const count = pdf.numPages;
      pdf.destroy();

      // Update the page count span (may have been re-rendered above)
      const countEl = document.getElementById('selectedPageCount');
      if (countEl) countEl.textContent = count;
      if (selectedPageCount) selectedPageCount.textContent = count;
    } catch (err) {
      console.warn('[pdf-to-jpg] Could not read page count:', err);
    }
  }

  // ── Convert PDF to JPG ───────────────────────────────────
  async function convertPDF() {
    if (!currentFile || isConverting) return;
    if (typeof pdfjsLib === 'undefined') {
      alert(window.t('common.libraryNotLoaded') || 'PDF.js not loaded. Please refresh the page.');
      return;
    }

    isConverting = true;
    if (convertBtn) convertBtn.disabled = true;
    pageBlobs = [];
    resetResult();

    // Determine JPEG quality from slider (default 0.92 if no slider)
    const quality = qualitySlider
      ? parseInt(qualitySlider.value, 10) / 100
      : 0.92;

    showProgress(5, 'Loading PDF\u2026');

    try {
      const arrayBuffer = await window.readFileAsArrayBuffer(currentFile);
      const pdfData = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const numPages = pdf.numPages;
      const baseName = currentFile.name.replace(/\.pdf$/i, '');

      for (let i = 1; i <= numPages; i++) {
        const pct = Math.round(5 + ((i - 1) / numPages) * 90);
        showProgress(pct, `Converting page ${i} of ${numPages}`);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: RENDER_SCALE });

        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        // White background — JPEG has no transparency
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();

        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        const filename = `${baseName}_page${String(i).padStart(3, '0')}.jpg`;
        pageBlobs.push({ blob, filename });
      }

      await pdf.destroy();

      showProgress(100, 'Conversion complete!');
      await sleep(500);
      hideProgress();

      showConversionResult(numPages, baseName);

    } catch (err) {
      console.error('[pdf-to-jpg] Error:', err);
      hideProgress();
      alert('Error: ' + err.message);
    } finally {
      isConverting = false;
      if (convertBtn) convertBtn.disabled = false;
    }
  }

  // ── Show result with thumbnail grid ─────────────────────
  function showConversionResult(numPages, baseName) {
    if (!resultSection) return;

    // Set summary text
    if (resultMeta) {
      resultMeta.textContent = `${numPages} page${numPages === 1 ? '' : 's'} converted successfully`;
    }

    // Build thumbnail grid HTML
    if (thumbnailGrid) {
      thumbnailGrid.innerHTML = '';
      pageBlobs.forEach(({ blob, filename }, idx) => {
        const pageNum = idx + 1;
        const url = URL.createObjectURL(blob);
        const card = document.createElement('div');
        card.className = 'thumbnail-card';
        card.innerHTML = `
          <div class="thumbnail-img-wrap">
            <img src="${window.escapeHtml(url)}" alt="Page ${pageNum}" loading="lazy">
          </div>
          <p class="thumbnail-label">Page ${pageNum}</p>
          <a class="btn btn-secondary thumbnail-download"
             href="${window.escapeHtml(url)}"
             download="${window.escapeHtml(filename)}">
            &#8595; JPG
          </a>
        `;
        // Revoke object URL after download click
        card.querySelector('.thumbnail-download').addEventListener('click', () => {
          setTimeout(() => URL.revokeObjectURL(url), 15000);
        });
        thumbnailGrid.appendChild(card);
      });
    }

    // Show/hide "Download All" buttons based on page count
    const showZip = numPages > 1;
    if (downloadAllBtn) downloadAllBtn.style.display = showZip ? '' : 'none';
    if (downloadAllBtnBottom) downloadAllBtnBottom.style.display = showZip ? '' : 'none';

    // Show result section
    resultSection.style.display = '';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Download All as ZIP ──────────────────────────────────
  async function downloadAllAsZip() {
    if (!pageBlobs.length) return;
    if (typeof JSZip === 'undefined') {
      alert(window.t('common.jsZipNotLoaded') || 'JSZip not loaded. Please refresh the page.');
      return;
    }

    if (downloadAllBtn) downloadAllBtn.disabled = true;
    if (downloadAllBtnBottom) downloadAllBtnBottom.disabled = true;
    showProgress(10, 'Creating ZIP\u2026');

    try {
      const zip = new JSZip();
      const folderName = currentFile.name.replace(/\.pdf$/i, '');
      const folder = zip.folder(folderName);

      pageBlobs.forEach(({ blob, filename }) => {
        folder.file(filename, blob);
      });

      showProgress(50, 'Compressing\u2026');

      const zipBlob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (meta) => {
          showProgress(
            50 + Math.round(meta.percent / 2),
            `Compressing ${meta.percent.toFixed(0)}%`
          );
        }
      );

      showProgress(100, 'ZIP ready!');
      await sleep(400);
      hideProgress();

      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = folderName + '_pages.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 15000);

    } catch (err) {
      console.error('[pdf-to-jpg] ZIP error:', err);
      hideProgress();
      alert('Error: ' + err.message);
    } finally {
      if (downloadAllBtn) downloadAllBtn.disabled = false;
      if (downloadAllBtnBottom) downloadAllBtnBottom.disabled = false;
    }
  }

  // ── Reset tool to initial state ──────────────────────────
  function resetTool() {
    currentFile = null;
    pageBlobs = [];
    if (selectedFileInfo) selectedFileInfo.style.display = 'none';
    if (uploadZone)       uploadZone.style.display       = '';
    if (toolOptions) toolOptions.style.display = 'none';
    if (actionArea) actionArea.style.display = 'none';
    if (convertBtn) convertBtn.disabled = true;
    hideProgress();
    resetResult();
    // Reset file input so same file can be re-selected
    if (fileInput) fileInput.value = '';
  }

  function resetResult() {
    if (resultSection) resultSection.style.display = 'none';
    if (thumbnailGrid) thumbnailGrid.innerHTML = '';
    if (resultMeta) resultMeta.textContent = '';
  }

  // ── Progress helpers ─────────────────────────────────────
  function showProgress(percent, label) {
    if (!progressContainer) return;
    progressContainer.style.display = '';
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressPercent) progressPercent.textContent = percent + '%';
    if (progressLabel) progressLabel.textContent = label || '';
    if (progressBar) {
      progressBar.setAttribute('aria-valuenow', percent);
    }
  }

  function hideProgress() {
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    if (progressPercent) progressPercent.textContent = '0%';
  }

  // ── Utility ──────────────────────────────────────────────
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob() returned null'));
      }, type, quality);
    });
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

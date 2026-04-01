/**
 * jpg-to-pdf.js — Image to PDF conversion
 * Embeds JPG/PNG/GIF/WebP images into a PDF using pdf-lib.
 * Supports sortable image grid with drag-to-reorder and remove.
 * Depends on: app.js, pdf-lib (CDN)
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js to initialize i18n
  await window.i18nReady;

  // ── State ────────────────────────────────────────────────
  let imageFiles = []; // Ordered array of File objects

  // ── DOM references ───────────────────────────────────────
  const uploadZone    = document.getElementById('uploadZone');
  const fileInput     = document.getElementById('fileInput');
  const imageGrid     = document.getElementById('imageGrid');
  const controlsRow   = document.getElementById('controlsRow');
  const addMoreBtn    = document.getElementById('addMoreBtn');
  const addMoreInput  = document.getElementById('addMoreInput');
  const convertBtn    = document.getElementById('convertBtn');
  const progressWrap  = document.getElementById('progressWrap');
  const progressBar   = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const resultSection = document.getElementById('resultSection');
  const resultInfo    = document.getElementById('resultInfo');
  const downloadBtn   = document.getElementById('downloadBtn');
  const resetBtn      = document.getElementById('resetBtn');

  // ── Upload zone ──────────────────────────────────────────
  const ACCEPTED = 'image/*';
  window.setupUploadZone('uploadZone', 'fileInput', onFilesSelected, {
    multiple: true,
    accept: ACCEPTED,
  });

  // ── Add More button ──────────────────────────────────────
  if (addMoreBtn && addMoreInput) {
    addMoreBtn.addEventListener('click', () => addMoreInput.click());
    addMoreInput.multiple = true;
    addMoreInput.accept = ACCEPTED;
    addMoreInput.addEventListener('change', () => {
      if (addMoreInput.files.length) {
        onFilesSelected(addMoreInput.files);
        addMoreInput.value = '';
      }
    });
  }

  // ── Convert button ───────────────────────────────────────
  if (convertBtn) convertBtn.addEventListener('click', convertToPDF);

  // ── Reset button ─────────────────────────────────────────
  if (resetBtn) resetBtn.addEventListener('click', resetTool);

  // ── File selection handler ───────────────────────────────
  function onFilesSelected(fileList) {
    const imgs = Array.from(fileList).filter(isImage);
    if (!imgs.length) {
      alert('Please select image files (JPG, PNG, GIF, WebP).');
      return;
    }
    imageFiles = imageFiles.concat(imgs);
    hideResult();
    renderGrid();
  }

  // ── Render sortable thumbnail grid ───────────────────────
  function renderGrid() {
    if (!imageGrid) return;

    // Revoke any existing object URLs before clearing
    imageGrid.querySelectorAll('img[data-obj-url]').forEach(img => {
      URL.revokeObjectURL(img.dataset.objUrl);
    });
    imageGrid.innerHTML = '';

    if (!imageFiles.length) {
      imageGrid.hidden = true;
      if (controlsRow) controlsRow.hidden = true;
      if (convertBtn) convertBtn.disabled = true;
      return;
    }

    imageGrid.hidden = false;
    if (controlsRow) controlsRow.hidden = false;
    if (convertBtn) convertBtn.disabled = false;

    imageFiles.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      const card = document.createElement('div');
      card.className = 'image-preview-card';
      card.draggable = true;
      card.dataset.index = index;

      card.innerHTML = `
        <button class="img-remove-btn" type="button" data-index="${index}"
          title="Remove" aria-label="Remove ${window.escapeHtml(file.name)}">&#215;</button>
        <div class="img-preview-wrap">
          <img src="${window.escapeHtml(url)}" alt="${window.escapeHtml(file.name)}"
               data-obj-url="${window.escapeHtml(url)}" draggable="false" loading="lazy">
        </div>
        <p class="img-preview-name" title="${window.escapeHtml(file.name)}">
          ${window.escapeHtml(shortenName(file.name, 22))}
        </p>
        <p class="img-preview-size">${window.formatFileSize(file.size)}</p>
        <span class="img-order-badge">${index + 1}</span>
      `;

      imageGrid.appendChild(card);
    });

    setupDragReorder();
    setupRemoveButtons();
  }

  // ── Remove buttons ───────────────────────────────────────
  function setupRemoveButtons() {
    if (!imageGrid) return;
    imageGrid.querySelectorAll('.img-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        // Revoke the object URL for this card's image
        const card = imageGrid.querySelector(`.image-preview-card[data-index="${idx}"]`);
        if (card) {
          const img = card.querySelector('img[data-obj-url]');
          if (img) URL.revokeObjectURL(img.dataset.objUrl);
        }
        imageFiles.splice(idx, 1);
        hideResult();
        renderGrid();
      });
    });
  }

  // ── Drag-to-reorder ──────────────────────────────────────
  function setupDragReorder() {
    if (!imageGrid) return;
    let dragSrcIndex = null;

    imageGrid.querySelectorAll('.image-preview-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        dragSrcIndex = parseInt(card.dataset.index, 10);
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        imageGrid.querySelectorAll('.image-preview-card')
          .forEach(c => c.classList.remove('drag-over-card'));
        dragSrcIndex = null;
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageGrid.querySelectorAll('.image-preview-card')
          .forEach(c => c.classList.remove('drag-over-card'));
        card.classList.add('drag-over-card');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-card');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over-card');
        if (dragSrcIndex === null) return;
        const dropIndex = parseInt(card.dataset.index, 10);
        if (dragSrcIndex === dropIndex) return;
        const reordered = [...imageFiles];
        const [moved] = reordered.splice(dragSrcIndex, 1);
        reordered.splice(dropIndex, 0, moved);
        imageFiles = reordered;
        hideResult();
        renderGrid();
      });
    });
  }

  // ── Convert images to PDF ────────────────────────────────
  async function convertToPDF() {
    if (!imageFiles.length) return;
    if (!window.PDFLib) {
      alert('PDF library not loaded. Please refresh the page.');
      return;
    }

    if (convertBtn) convertBtn.disabled = true;
    hideResult();
    showProgress(0, 'Starting\u2026');

    try {
      const { PDFDocument } = window.PDFLib;
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const pct = Math.round((i / imageFiles.length) * 90);
        showProgress(pct, `Embedding image ${i + 1} of ${imageFiles.length}: ${file.name}`);

        const arrayBuffer = await window.readFileAsArrayBuffer(file);
        const bytes = new Uint8Array(arrayBuffer);
        const mime = file.type.toLowerCase();
        const ext  = file.name.split('.').pop().toLowerCase();

        let image;
        try {
          if (mime === 'image/png' || ext === 'png') {
            image = await pdfDoc.embedPng(bytes);
          } else if (
            mime === 'image/jpeg' || mime === 'image/jpg' ||
            ext === 'jpg' || ext === 'jpeg'
          ) {
            image = await pdfDoc.embedJpg(bytes);
          } else {
            // GIF, WebP, BMP, or anything else — convert via canvas to PNG first
            image = await embedViaCanvas(pdfDoc, file, 'image/png');
          }
        } catch (embedErr) {
          console.warn(`[jpg-to-pdf] Direct embed failed for ${file.name}, trying canvas fallback:`, embedErr);
          try {
            image = await embedViaCanvas(pdfDoc, file, 'image/png');
          } catch (fallbackErr) {
            console.error(`[jpg-to-pdf] Skipping ${file.name}:`, fallbackErr);
            continue;
          }
        }

        // Add a page sized to the image (1 px = 1 pt)
        const { width, height } = image;
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });
      }

      showProgress(95, 'Saving PDF\u2026');
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);

      showProgress(100, 'Done!');
      await sleep(400);
      hideProgress();

      // Show result
      const pageCount = pdfDoc.getPageCount();
      if (resultInfo) {
        resultInfo.textContent =
          `${pageCount} page${pageCount === 1 ? '' : 's'} \u2014 ${window.formatFileSize(blob.size)}`;
      }
      if (downloadBtn) {
        downloadBtn.href = url;
        downloadBtn.download = 'converted.pdf';
        // Revoke after download
        downloadBtn.addEventListener('click', () => {
          setTimeout(() => URL.revokeObjectURL(url), 15000);
        }, { once: true });
      }
      if (resultSection) {
        resultSection.hidden = false;
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Show PDF preview
      if (typeof showPreview === 'function') showPreview('resultSection', url, 'converted.pdf');

    } catch (err) {
      console.error('[jpg-to-pdf] Error:', err);
      hideProgress();
      alert('Error: ' + err.message);
    } finally {
      if (convertBtn) convertBtn.disabled = false;
    }
  }

  // ── Image embedding via canvas ───────────────────────────
  function embedViaCanvas(pdfDoc, file, outMime) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width  = img.naturalWidth  || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');

          if (outMime !== 'image/png') {
            // Fill white for non-transparent formats
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(async (blob) => {
            if (!blob) {
              URL.revokeObjectURL(url);
              reject(new Error('canvas.toBlob() returned null'));
              return;
            }
            const buf   = await blob.arrayBuffer();
            const bytes = new Uint8Array(buf);
            URL.revokeObjectURL(url);
            try {
              const embedded = outMime === 'image/png'
                ? await pdfDoc.embedPng(bytes)
                : await pdfDoc.embedJpg(bytes);
              resolve(embedded);
            } catch (e) {
              reject(e);
            }
          }, outMime, 0.95);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load image: ${file.name}`));
      };

      img.src = url;
    });
  }

  // ── Reset tool ───────────────────────────────────────────
  function resetTool() {
    imageFiles = [];
    hideResult();
    renderGrid();
    if (fileInput) fileInput.value = '';
  }

  // ── Progress helpers ─────────────────────────────────────
  function showProgress(percent, label) {
    if (progressWrap) progressWrap.hidden = false;
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressLabel) progressLabel.textContent = label || '';
  }

  function hideProgress() {
    if (progressWrap) progressWrap.hidden = true;
    if (progressBar) progressBar.style.width = '0%';
  }

  function hideResult() {
    if (resultSection) resultSection.hidden = true;
    if (downloadBtn && downloadBtn.href && downloadBtn.href.startsWith('blob:')) {
      URL.revokeObjectURL(downloadBtn.href);
      downloadBtn.removeAttribute('href');
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  function isImage(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    const exts    = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const ext = file.name.split('.').pop().toLowerCase();
    return (
      allowed.includes(file.type.toLowerCase()) ||
      file.type.toLowerCase().startsWith('image/') ||
      exts.includes(ext)
    );
  }

  function shortenName(name, maxLen) {
    if (name.length <= maxLen) return name;
    const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
    return name.slice(0, maxLen - ext.length - 1) + '\u2026' + ext;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

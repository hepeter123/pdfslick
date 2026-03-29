/**
 * merge.js — PDF Merge functionality
 * Merges multiple PDF files into a single PDF using pdf-lib.
 * Depends on: app.js, pdf-lib (CDN)
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js to initialize i18n
  await window.i18nReady;

  // ── State ──────────────────────────────────────────────
  let files = []; // Array of File objects (ordered)

  // ── DOM references ─────────────────────────────────────
  const fileListContainer = document.getElementById('fileListContainer');
  const fileList          = document.getElementById('fileList');
  const fileCount         = document.getElementById('fileCount');
  const actionArea        = document.getElementById('actionArea');
  const mergeBtn          = document.getElementById('mergeBtn');
  const addMoreBtn        = document.getElementById('addMoreBtn');
  const addMoreInput      = document.getElementById('addMoreInput');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar       = document.getElementById('progressBar');
  const progressPercent   = document.getElementById('progressPercent');
  const resultSection     = document.getElementById('resultSection');
  const downloadBtn       = document.getElementById('downloadBtn');
  const resultMeta        = document.getElementById('resultMeta');
  const resetBtn          = document.getElementById('resetBtn');

  // ── Upload zone setup ──────────────────────────────────
  setupUploadZone('uploadZone', 'fileInput', addFiles, {
    multiple: true,
    accept: '.pdf,application/pdf',
  });

  // Handle the upload-trigger button inside the zone (stop propagation so the
  // zone's own click handler doesn't also fire and open a second dialog)
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

  // ── Add More Files ─────────────────────────────────────
  if (addMoreBtn && addMoreInput) {
    addMoreBtn.addEventListener('click', () => addMoreInput.click());
    addMoreInput.addEventListener('change', () => {
      if (addMoreInput.files.length) {
        addFiles(addMoreInput.files);
        addMoreInput.value = '';
      }
    });
  }

  // ── Merge button ───────────────────────────────────────
  if (mergeBtn) {
    mergeBtn.addEventListener('click', mergePDFs);
  }

  // ── Reset button ───────────────────────────────────────
  if (resetBtn) {
    resetBtn.addEventListener('click', resetUI);
  }

  // ── Add files handler ──────────────────────────────────
  function addFiles(fileList) {
    const pdfs = Array.from(fileList).filter(
      f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (!pdfs.length) {
      alert(t('merge.noPdfError') || 'Please select PDF files.');
      return;
    }
    files = files.concat(pdfs);
    updateUI();
  }

  // ── Update UI ──────────────────────────────────────────
  function updateUI() {
    const hasFiles = files.length > 0;

    // Show/hide file list container and action area
    if (fileListContainer) fileListContainer.style.display = hasFiles ? '' : 'none';
    if (actionArea)        actionArea.style.display        = hasFiles ? '' : 'none';

    // Update file count badge
    if (fileCount) fileCount.textContent = files.length;

    // Enable merge button only with 2+ files
    if (mergeBtn) {
      mergeBtn.disabled = files.length < 2;
      mergeBtn.title = files.length < 2
        ? (t('merge.needTwoFiles') || 'Add at least 2 PDF files to merge')
        : '';
    }

    // Render file list items directly into <ul id="fileList">
    renderFileListItems();
  }

  // ── Render <li> items into #fileList ───────────────────
  function renderFileListItems() {
    if (!fileList) return;
    fileList.innerHTML = '';

    files.forEach((file, index) => {
      const li = document.createElement('li');
      li.className = 'file-list-item';
      li.draggable = true;
      li.dataset.index = index;
      li.innerHTML = `
        <span class="file-list-drag-handle" title="Drag to reorder" aria-hidden="true">&#8943;</span>
        <span class="file-list-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <span class="file-list-size">${formatFileSize(file.size)}</span>
        <button class="file-list-remove" data-index="${index}" type="button"
          title="Remove" aria-label="Remove ${escapeHtml(file.name)}">&#215;</button>
      `;
      fileList.appendChild(li);
    });

    // Drag-to-reorder
    let dragSrcIndex = null;

    fileList.addEventListener('dragstart', (e) => {
      const li = e.target.closest('li[data-index]');
      if (!li) return;
      dragSrcIndex = parseInt(li.dataset.index, 10);
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }, { once: false });

    fileList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const li = e.target.closest('li[data-index]');
      if (li) {
        fileList.querySelectorAll('li').forEach(el => el.classList.remove('drag-target'));
        li.classList.add('drag-target');
      }
    });

    fileList.addEventListener('dragleave', () => {
      fileList.querySelectorAll('li').forEach(el => el.classList.remove('drag-target'));
    });

    fileList.addEventListener('drop', (e) => {
      e.preventDefault();
      fileList.querySelectorAll('li').forEach(el => {
        el.classList.remove('dragging', 'drag-target');
      });
      const li = e.target.closest('li[data-index]');
      if (!li || dragSrcIndex === null) return;
      const dropIndex = parseInt(li.dataset.index, 10);
      if (dragSrcIndex === dropIndex) return;

      const reordered = [...files];
      const [moved] = reordered.splice(dragSrcIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      files = reordered;
      dragSrcIndex = null;
      updateUI();
    });

    // Remove buttons
    fileList.addEventListener('click', (e) => {
      const btn = e.target.closest('.file-list-remove');
      if (!btn) return;
      const idx = parseInt(btn.dataset.index, 10);
      files.splice(idx, 1);
      updateUI();
    });
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

  // ── Merge PDFs ─────────────────────────────────────────
  async function mergePDFs() {
    if (files.length < 2) return;
    if (!window.PDFLib) {
      alert(t('common.libraryNotLoaded') || 'PDF library not loaded. Please refresh the page.');
      return;
    }

    mergeBtn.disabled = true;
    hideResultUI();
    setProgress(0);

    try {
      const { PDFDocument } = PDFLib;
      const mergedPdf = await PDFDocument.create();
      let totalPages = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const percent = Math.round((i / files.length) * 85);
        setProgress(percent);

        let arrayBuffer;
        try {
          arrayBuffer = await readFileAsArrayBuffer(file);
        } catch (err) {
          throw new Error(`Could not read file "${file.name}": ${err.message}`);
        }

        const bytes = new Uint8Array(arrayBuffer);

        let srcDoc;
        try {
          srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch (err) {
          console.error(`[merge] Failed to load ${file.name}:`, err);
          alert(`${t('merge.loadError') || 'Could not read file'}: ${file.name}\n${err.message}`);
          continue;
        }

        const pageCount = srcDoc.getPageCount();
        const indices = Array.from({ length: pageCount }, (_, k) => k);
        const copiedPages = await mergedPdf.copyPages(srcDoc, indices);
        copiedPages.forEach(page => mergedPdf.addPage(page));
        totalPages += pageCount;
      }

      setProgress(92);

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      setProgress(100);
      await _sleep(400);
      hideProgressUI();

      // Populate result section directly
      if (downloadBtn) {
        downloadBtn.href = url;
        downloadBtn.download = 'merged.pdf';
        // Revoke blob URL after download
        downloadBtn.addEventListener('click', () => {
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }, { once: true });
      }
      if (resultMeta) {
        const pageWord = totalPages === 1
          ? (t('common.page') || 'page')
          : (t('common.pages') || 'pages');
        const fileWord = t('common.files') || 'files';
        const fromWord = t('merge.fromFiles') || 'from';
        resultMeta.textContent = `${totalPages} ${pageWord} ${fromWord} ${files.length} ${fileWord}`;
      }
      if (resultSection) resultSection.style.display = '';

      // Show PDF preview
      showPreview('resultSection', url, 'merged.pdf');

    } catch (err) {
      console.error('[merge] Error:', err);
      hideProgressUI();
      alert(`${t('common.error') || 'Error'}: ${err.message}`);
    } finally {
      mergeBtn.disabled = files.length < 2;
    }
  }

  // ── Hide result ────────────────────────────────────────
  function hideResultUI() {
    if (resultSection) resultSection.style.display = 'none';
    if (downloadBtn)   { downloadBtn.href = '#'; downloadBtn.download = 'merged.pdf'; }
    if (resultMeta)    resultMeta.textContent = '';
  }

  // ── Reset ──────────────────────────────────────────────
  function resetUI() {
    files = [];
    hideResultUI();
    hideProgressUI();
    updateUI();
  }

  // ── Helper ─────────────────────────────────────────────
  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

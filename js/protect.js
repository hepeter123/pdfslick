/**
 * protect.js — PDF Password Protection
 * Adds password encryption to PDF files by rendering pages with PDF.js
 * and re-creating an encrypted PDF with jsPDF.
 * Depends on: app.js (i18nReady, t, setupUploadZone, formatFileSize,
 *             readFileAsArrayBuffer, escapeHtml)
 *             PDF.js (CDN), jsPDF (CDN)
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js to initialize i18n
  await window.i18nReady;

  // ── PDF.js worker setup ────────────────────────────────
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // ── State ──────────────────────────────────────────────
  let currentFile    = null;
  let currentBlobURL = null;

  // ── DOM references ─────────────────────────────────────
  const selectedFileInfo    = document.getElementById('selectedFileInfo');
  const selectedFileName    = document.getElementById('selectedFileName');
  const selectedFileSize    = document.getElementById('selectedFileSize');
  const selectedPageCount   = document.getElementById('selectedPageCount');
  const removeFileBtn       = document.getElementById('removeFileBtn');
  const passwordSection     = document.getElementById('passwordSection');
  const passwordInput       = document.getElementById('passwordInput');
  const confirmPasswordInput = document.getElementById('confirmPasswordInput');
  const passwordMatch       = document.getElementById('passwordMatch');
  const togglePassword1     = document.getElementById('togglePassword1');
  const togglePassword2     = document.getElementById('togglePassword2');
  const actionArea          = document.getElementById('actionArea');
  const protectBtn          = document.getElementById('protectBtn');
  const progressContainer   = document.getElementById('progressContainer');
  const progressBar         = document.getElementById('progressBar');
  const progressPercent     = document.getElementById('progressPercent');
  const progressText        = document.getElementById('progressText');
  const resultSection       = document.getElementById('resultSection');
  const downloadBtn         = document.getElementById('downloadBtn');
  const resultMeta          = document.getElementById('resultMeta');
  const resetBtn            = document.getElementById('resetBtn');

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

  // ── Protect button ─────────────────────────────────────
  if (protectBtn) {
    protectBtn.addEventListener('click', protectPDF);
  }

  // ── Password visibility toggles ────────────────────────
  if (togglePassword1 && passwordInput) {
    togglePassword1.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePassword1.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      togglePassword1.title = isPassword ? 'Hide password' : 'Show password';
    });
  }

  if (togglePassword2 && confirmPasswordInput) {
    togglePassword2.addEventListener('click', () => {
      const isPassword = confirmPasswordInput.type === 'password';
      confirmPasswordInput.type = isPassword ? 'text' : 'password';
      togglePassword2.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      togglePassword2.title = isPassword ? 'Hide password' : 'Show password';
    });
  }

  // ── Password validation ────────────────────────────────
  if (passwordInput) {
    passwordInput.addEventListener('input', validatePasswords);
  }
  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener('input', validatePasswords);
  }

  function validatePasswords() {
    const pw   = passwordInput ? passwordInput.value : '';
    const cpw  = confirmPasswordInput ? confirmPasswordInput.value : '';
    const hasFile = currentFile !== null;

    // Update match indicator
    if (passwordMatch) {
      if (!pw || !cpw) {
        passwordMatch.textContent = '';
        passwordMatch.className = 'password-match-indicator';
      } else if (pw === cpw) {
        passwordMatch.textContent = 'Passwords match';
        passwordMatch.className = 'password-match-indicator match-success';
      } else {
        passwordMatch.textContent = 'Passwords do not match';
        passwordMatch.className = 'password-match-indicator match-error';
      }
    }

    // Enable/disable protect button
    const canProtect = hasFile && pw.length > 0 && pw === cpw;
    if (protectBtn) {
      protectBtn.disabled = !canProtect;
    }
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
    await showFileInfo();
  }

  // ── Show file info ─────────────────────────────────────
  async function showFileInfo() {
    if (!currentFile) return;

    if (selectedFileName) selectedFileName.textContent = currentFile.name;
    if (selectedFileSize) selectedFileSize.textContent = formatFileSize(currentFile.size);
    if (selectedFileInfo) selectedFileInfo.style.display = '';
    if (uploadZone)       uploadZone.style.display = 'none';

    // Get page count using PDF.js
    if (selectedPageCount && typeof pdfjsLib !== 'undefined') {
      try {
        const arrayBuffer = await readFileAsArrayBuffer(currentFile);
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const pageWord = pdf.numPages === 1 ? 'page' : 'pages';
        selectedPageCount.textContent = `\u00B7 ${pdf.numPages} ${pageWord}`;
        pdf.destroy();
      } catch (err) {
        console.warn('[protect] Could not read page count:', err.message);
        selectedPageCount.textContent = '';
      }
    }

    // Show password section and action area
    if (passwordSection) passwordSection.style.display = '';
    if (actionArea)      actionArea.style.display = '';

    // Clear password fields
    if (passwordInput)       passwordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
    if (passwordMatch)       { passwordMatch.textContent = ''; passwordMatch.className = 'password-match-indicator'; }
    if (protectBtn)          protectBtn.disabled = true;

    // Focus password input
    if (passwordInput) {
      setTimeout(() => passwordInput.focus(), 100);
    }
  }

  // ── Clear file / reset UI ──────────────────────────────
  function clearFile() {
    currentFile = null;
    revokeCurrentURL();

    if (selectedFileInfo) selectedFileInfo.style.display = 'none';
    if (passwordSection)  passwordSection.style.display = 'none';
    if (actionArea)       actionArea.style.display = 'none';
    if (uploadZone)       uploadZone.style.display = '';

    // Clear password fields
    if (passwordInput)       passwordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
    if (passwordMatch)       { passwordMatch.textContent = ''; passwordMatch.className = 'password-match-indicator'; }

    // Reset file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';

    hideProgressUI();
    hideResultUI();
  }

  // ── Progress helpers ───────────────────────────────────
  function setProgress(percent, label) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (progressContainer) progressContainer.style.display = '';
    if (progressBar)       progressBar.style.width = `${clamped}%`;
    if (progressPercent)   progressPercent.textContent = `${clamped}%`;
    if (progressText && label) progressText.textContent = label;
  }

  function hideProgressUI() {
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar)       progressBar.style.width = '0%';
    if (progressPercent)   progressPercent.textContent = '0%';
  }

  function hideResultUI() {
    if (resultSection) resultSection.style.display = 'none';
    if (downloadBtn)   { downloadBtn.href = '#'; downloadBtn.download = 'protected.pdf'; }
    if (resultMeta)    resultMeta.textContent = '';
  }

  // ── URL management ─────────────────────────────────────
  function revokeCurrentURL() {
    if (currentBlobURL) {
      URL.revokeObjectURL(currentBlobURL);
      currentBlobURL = null;
    }
  }

  // ── Protect PDF ────────────────────────────────────────
  async function protectPDF() {
    if (!currentFile) return;

    const password = passwordInput ? passwordInput.value : '';
    if (!password) {
      alert('Please enter a password.');
      return;
    }
    if (confirmPasswordInput && password !== confirmPasswordInput.value) {
      alert('Passwords do not match.');
      return;
    }

    // Check that required libraries are loaded
    if (typeof pdfjsLib === 'undefined') {
      alert('PDF.js library not loaded. Please refresh the page.');
      return;
    }
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      alert('jsPDF library not loaded. Please refresh the page.');
      return;
    }

    protectBtn.disabled = true;
    hideResultUI();
    setProgress(0, 'Loading PDF...');

    try {
      // ── Step 1: Load the PDF with PDF.js ──
      const arrayBuffer = await readFileAsArrayBuffer(currentFile);
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const numPages = pdf.numPages;

      setProgress(5, `Preparing ${numPages} page${numPages > 1 ? 's' : ''}...`);

      // ── Step 2: Process each page ──
      const { jsPDF } = window.jspdf;
      let doc = null;

      for (let i = 1; i <= numPages; i++) {
        const progressPct = 5 + Math.round((i / numPages) * 80);
        setProgress(progressPct, `Rendering page ${i} of ${numPages}...`);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });

        // Create canvas and render page
        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Get image data from canvas
        const imgData = canvas.toDataURL('image/jpeg', 0.92);

        // Page dimensions in points (72 dpi) — scale back from 2x
        const pageWidthPt  = viewport.width / 2;
        const pageHeightPt = viewport.height / 2;
        const orientation  = pageWidthPt > pageHeightPt ? 'landscape' : 'portrait';

        if (i === 1) {
          // Create jsPDF document with encryption on first page
          doc = new jsPDF({
            orientation: orientation,
            unit: 'pt',
            format: [pageWidthPt, pageHeightPt],
            encryption: {
              userPassword: password,
              ownerPassword: password,
              userPermissions: ['print']
            }
          });
        } else {
          // Add subsequent pages
          doc.addPage([pageWidthPt, pageHeightPt], orientation);
        }

        // Add the rendered image to fill the page
        doc.addImage(imgData, 'JPEG', 0, 0, pageWidthPt, pageHeightPt);

        // Clean up page resources
        page.cleanup();
      }

      // Clean up PDF.js document
      pdf.destroy();

      if (!doc) {
        throw new Error('No pages were processed.');
      }

      // ── Step 3: Save the protected PDF ──
      setProgress(90, 'Encrypting and saving...');

      const blob = doc.output('blob');
      revokeCurrentURL();
      currentBlobURL = URL.createObjectURL(blob);

      // Build output filename
      const baseName = currentFile.name.replace(/\.pdf$/i, '');
      const outputName = `${baseName}_protected.pdf`;

      setProgress(100, 'Done!');

      // Brief pause for the progress bar to reach 100% visually
      await _sleep(400);
      hideProgressUI();

      // ── Step 4: Show result ──
      if (downloadBtn) {
        downloadBtn.href     = currentBlobURL;
        downloadBtn.download = outputName;
        // Revoke blob URL after download to free memory
        downloadBtn.addEventListener('click', () => {
          setTimeout(() => {
            if (currentBlobURL) {
              URL.revokeObjectURL(currentBlobURL);
              currentBlobURL = null;
            }
          }, 15000);
        }, { once: true });
      }

      if (resultMeta) {
        const originalSize  = formatFileSize(currentFile.size);
        const protectedSize = formatFileSize(blob.size);
        resultMeta.textContent = `${numPages} page${numPages > 1 ? 's' : ''} \u2022 ${originalSize} \u2192 ${protectedSize} (encrypted)`;
      }

      if (resultSection) resultSection.style.display = '';

      // Show PDF preview
      showPreview('resultSection', currentBlobURL, outputName);

    } catch (err) {
      console.error('[protect] Error:', err);
      hideProgressUI();
      alert(`Error: ${err.message}`);
    } finally {
      validatePasswords(); // re-evaluate button state
    }
  }

  // ── Helper ─────────────────────────────────────────────
  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

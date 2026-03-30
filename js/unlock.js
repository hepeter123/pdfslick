/**
 * unlock.js — PDF Unlock functionality
 * Removes password protection from PDF files using pdf-lib.
 * Depends on: app.js (i18nReady, t, setupUploadZone, formatFileSize,
 *             readFileAsArrayBuffer, escapeHtml), pdf-lib (CDN)
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js to initialize i18n
  await window.i18nReady;

  // ── State ──────────────────────────────────────────────
  let currentFile   = null;
  let isEncrypted   = false;
  let isProcessing  = false;
  let currentBlobURL = null;

  // ── DOM references ─────────────────────────────────────
  const selectedFileInfo  = document.getElementById('selectedFileInfo');
  const selectedFileName  = document.getElementById('selectedFileName');
  const selectedFileSize  = document.getElementById('selectedFileSize');
  const removeFileBtn     = document.getElementById('removeFileBtn');
  const unlockStatus      = document.getElementById('unlockStatus');
  const unlockStatusInner = document.getElementById('unlockStatusInner');
  const passwordSection   = document.getElementById('passwordSection');
  const passwordInput     = document.getElementById('passwordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const passwordError     = document.getElementById('passwordError');
  const actionArea        = document.getElementById('actionArea');
  const unlockBtn         = document.getElementById('unlockBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar       = document.getElementById('progressBar');
  const progressPercent   = document.getElementById('progressPercent');
  const resultSection     = document.getElementById('resultSection');
  const resultMeta        = document.getElementById('resultMeta');
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

  // ── Remove file button ─────────────────────────────────
  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', clearFile);
  }

  // ── Reset button ───────────────────────────────────────
  if (resetBtn) {
    resetBtn.addEventListener('click', clearFile);
  }

  // ── Unlock button ──────────────────────────────────────
  if (unlockBtn) {
    unlockBtn.addEventListener('click', unlockPDF);
  }

  // ── Toggle password visibility ─────────────────────────
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';

      const iconEye    = togglePasswordBtn.querySelector('.icon-eye');
      const iconEyeOff = togglePasswordBtn.querySelector('.icon-eye-off');
      if (iconEye)    iconEye.style.display    = isPassword ? 'none' : '';
      if (iconEyeOff) iconEyeOff.style.display = isPassword ? '' : 'none';

      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      togglePasswordBtn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
    });
  }

  // ── Enable unlock button when password is entered ──────
  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      if (unlockBtn) {
        unlockBtn.disabled = !passwordInput.value.length;
      }
      // Clear previous error when user types
      hidePasswordError();
    });

    // Allow Enter key to trigger unlock
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && passwordInput.value.length && !isProcessing) {
        unlockPDF();
      }
    });
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
    detectEncryption();
  }

  // ── Show file info ─────────────────────────────────────
  function showFileInfo() {
    if (!currentFile) return;
    if (selectedFileName) selectedFileName.textContent = currentFile.name;
    if (selectedFileSize) selectedFileSize.textContent = formatFileSize(currentFile.size);
    if (uploadZone)       uploadZone.style.display        = 'none';
    if (selectedFileInfo) selectedFileInfo.style.display = '';
    hideResultUI();
    hideProgressUI();
    hidePasswordSection();
    hideStatus();
    hidePasswordError();
  }

  // ── Detect whether the PDF is encrypted ────────────────
  async function detectEncryption() {
    if (!currentFile || !window.PDFLib) return;

    const { PDFDocument } = PDFLib;

    let arrayBuffer;
    try {
      arrayBuffer = await readFileAsArrayBuffer(currentFile);
    } catch (err) {
      showStatus('error', t('unlock.readError') || 'Could not read the file. Please try again.');
      return;
    }

    const bytes = new Uint8Array(arrayBuffer);

    // Try loading without a password
    try {
      await PDFDocument.load(bytes);
      // Success: PDF is NOT encrypted
      isEncrypted = false;
      showStatus('info', t('unlock.notEncrypted') || 'This PDF is not password-protected. You can download it as-is.');

      // Still allow download of the file
      showActionArea(false);
      return;
    } catch (err) {
      // Check if the error is about encryption
      const errMsg = (err.message || '').toLowerCase();
      if (errMsg.includes('encrypted') || errMsg.includes('password')) {
        // PDF IS encrypted — show password input
        isEncrypted = true;
        showStatus('locked', t('unlock.isEncrypted') || 'This PDF is password-protected. Enter the password below to unlock it.');
        showPasswordSection();
        showActionArea(true);
        return;
      }

      // Some other loading error
      showStatus('error', (t('unlock.loadError') || 'Could not load this PDF') + ': ' + err.message);
    }
  }

  // ── Show / hide password section ───────────────────────
  function showPasswordSection() {
    if (passwordSection) passwordSection.style.display = '';
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  function hidePasswordSection() {
    if (passwordSection) passwordSection.style.display = 'none';
    if (passwordInput) passwordInput.value = '';
  }

  // ── Show / hide action area ────────────────────────────
  function showActionArea(requirePassword) {
    if (actionArea) actionArea.style.display = '';
    if (unlockBtn) {
      if (requirePassword) {
        // Disable until password is typed
        unlockBtn.disabled = !(passwordInput && passwordInput.value.length);
      } else {
        // Not encrypted — enable immediately for "re-save" download
        unlockBtn.disabled = false;
      }
    }
  }

  // ── Status messages ────────────────────────────────────
  function showStatus(type, message) {
    if (!unlockStatus || !unlockStatusInner) return;

    let iconSvg = '';
    let className = 'unlock-status-msg';

    switch (type) {
      case 'locked':
        className += ' unlock-status--locked';
        iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8573F" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
        break;
      case 'info':
        className += ' unlock-status--info';
        iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        break;
      case 'error':
        className += ' unlock-status--error';
        iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        break;
    }

    unlockStatusInner.innerHTML = `<div class="${className}">${iconSvg}<span>${escapeHtml(message)}</span></div>`;
    unlockStatus.style.display = '';
  }

  function hideStatus() {
    if (unlockStatus) unlockStatus.style.display = 'none';
    if (unlockStatusInner) unlockStatusInner.innerHTML = '';
  }

  // ── Password error ─────────────────────────────────────
  function showPasswordError(msg) {
    if (passwordError) {
      passwordError.textContent = msg || (t('unlock.wrongPassword') || 'Incorrect password. Please try again.');
      passwordError.style.display = '';
    }
  }

  function hidePasswordError() {
    if (passwordError) passwordError.style.display = 'none';
  }

  // ── Clear file ─────────────────────────────────────────
  function clearFile() {
    currentFile = null;
    isEncrypted = false;
    isProcessing = false;
    revokeBlobURL();

    if (uploadZone)       uploadZone.style.display        = '';
    if (selectedFileInfo) selectedFileInfo.style.display = 'none';
    if (actionArea)       actionArea.style.display       = 'none';

    hidePasswordSection();
    hideStatus();
    hidePasswordError();
    hideResultUI();
    hideProgressUI();

    // Reset password input type
    if (passwordInput) passwordInput.type = 'password';
    const iconEye    = togglePasswordBtn ? togglePasswordBtn.querySelector('.icon-eye') : null;
    const iconEyeOff = togglePasswordBtn ? togglePasswordBtn.querySelector('.icon-eye-off') : null;
    if (iconEye)    iconEye.style.display    = '';
    if (iconEyeOff) iconEyeOff.style.display = 'none';
  }

  // ── Progress helpers ───────────────────────────────────
  function setProgress(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    if (progressContainer) progressContainer.style.display = '';
    if (progressBar)       progressBar.style.width          = `${clamped}%`;
    if (progressPercent)   progressPercent.textContent      = `${clamped}%`;
  }

  function hideProgressUI() {
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar)       progressBar.style.width          = '0%';
    if (progressPercent)   progressPercent.textContent      = '0%';
  }

  // ── Hide result ────────────────────────────────────────
  function hideResultUI() {
    if (resultSection) resultSection.style.display = 'none';
    if (downloadBtn)   { downloadBtn.href = '#'; downloadBtn.download = 'unlocked.pdf'; }
    if (resultMeta)    resultMeta.textContent = '';
  }

  // ── Blob URL management ────────────────────────────────
  function revokeBlobURL() {
    if (currentBlobURL) {
      URL.revokeObjectURL(currentBlobURL);
      currentBlobURL = null;
    }
  }

  // ── Unlock PDF ─────────────────────────────────────────
  async function unlockPDF() {
    if (!currentFile || isProcessing) return;
    if (!window.PDFLib) {
      alert(t('common.libraryNotLoaded') || 'PDF library not loaded. Please refresh the page.');
      return;
    }

    isProcessing = true;
    if (unlockBtn) unlockBtn.disabled = true;
    hideResultUI();
    hidePasswordError();
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
      setProgress(25);

      let pdfDoc;

      if (isEncrypted) {
        // Try loading with the user-provided password
        const password = passwordInput ? passwordInput.value : '';
        if (!password) {
          showPasswordError(t('unlock.enterPasswordFirst') || 'Please enter the PDF password.');
          hideProgressUI();
          isProcessing = false;
          if (unlockBtn) unlockBtn.disabled = false;
          return;
        }

        try {
          pdfDoc = await PDFDocument.load(bytes, { password: password });
        } catch (err) {
          const errMsg = (err.message || '').toLowerCase();
          if (errMsg.includes('password') || errMsg.includes('encrypted') || errMsg.includes('decrypt')) {
            showPasswordError(t('unlock.wrongPassword') || 'Incorrect password. Please try again.');
            hideProgressUI();
            isProcessing = false;
            if (unlockBtn) unlockBtn.disabled = !(passwordInput && passwordInput.value.length);
            return;
          }
          throw err;
        }
      } else {
        // Not encrypted — just load normally for re-save
        try {
          pdfDoc = await PDFDocument.load(bytes);
        } catch (err) {
          throw new Error(`${t('unlock.loadError') || 'Could not load PDF'}: ${err.message}`);
        }
      }

      setProgress(55);

      // Save without encryption
      const unlockedBytes = await pdfDoc.save();
      setProgress(85);

      // Create blob and URL
      revokeBlobURL();
      const blob = new Blob([unlockedBytes], { type: 'application/pdf' });
      currentBlobURL = URL.createObjectURL(blob);

      const outName = _unlockedFilename(currentFile.name);
      const pageCount = pdfDoc.getPageCount();

      setProgress(100);
      await _sleep(400);
      hideProgressUI();

      // Populate result section
      if (downloadBtn) {
        downloadBtn.href = currentBlobURL;
        downloadBtn.download = outName;
        downloadBtn.addEventListener('click', () => {
          setTimeout(() => {
            revokeBlobURL();
          }, 15000);
        }, { once: true });
      }

      if (resultMeta) {
        const pageWord = pageCount === 1
          ? (t('common.page') || 'page')
          : (t('common.pages') || 'pages');
        const sizeStr = formatFileSize(blob.size);
        resultMeta.textContent = `${pageCount} ${pageWord} \u2014 ${sizeStr}`;
      }

      // Hide password section and status on success
      hidePasswordSection();
      hideStatus();
      if (actionArea) actionArea.style.display = 'none';

      // Show result
      if (resultSection) resultSection.style.display = '';

      // Show PDF preview
      showPreview('resultSection', currentBlobURL, outName);

    } catch (err) {
      console.error('[unlock] Error:', err);
      hideProgressUI();
      alert(`${t('common.error') || 'Error'}: ${err.message}`);
    } finally {
      isProcessing = false;
      if (unlockBtn) {
        unlockBtn.disabled = isEncrypted
          ? !(passwordInput && passwordInput.value.length)
          : false;
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────

  /** Insert "_unlocked" before the .pdf extension. */
  function _unlockedFilename(name) {
    const dot = name.lastIndexOf('.');
    if (dot === -1) return name + '_unlocked.pdf';
    return name.slice(0, dot) + '_unlocked' + name.slice(dot);
  }

  function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

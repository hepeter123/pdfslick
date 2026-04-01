/**
 * word-to-pdf.js — Word to PDF (server-side conversion)
 *
 * Uploads the Word file to a Cloudflare Worker which proxies the conversion
 * via ConvertAPI and returns the resulting PDF.
 *
 * Features:
 *   - XHR upload with real-time progress bar
 *   - Daily free limit (3/day, localStorage-based)
 *   - 10 MB file size cap
 *   - Supports both .doc and .docx
 *
 * Depends on: app.js (loaded first)
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  await window.i18nReady;

  // ══════════════════════════════════════════════════════
  // Configuration — update WORKER_URL after deploying
  // See DEPLOY-WORKER.md for instructions
  // ══════════════════════════════════════════════════════
  const WORKER_URL   = 'https://pdfslick-word-to-pdf.YOUR-SUBDOMAIN.workers.dev';
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  const DAILY_LIMIT   = 3;

  // ── State ──────────────────────────────────────────────
  let currentFile = null;
  let blobUrl     = null;

  // ── DOM references ─────────────────────────────────────
  const uploadZone        = document.getElementById('uploadZone');
  const selectedFileInfo  = document.getElementById('selectedFileInfo');
  const selectedFileName  = document.getElementById('selectedFileName');
  const selectedFileSize  = document.getElementById('selectedFileSize');
  const removeFileBtn     = document.getElementById('removeFileBtn');
  const formatWarning     = document.getElementById('formatWarning');
  const usageInfo         = document.getElementById('usageInfo');
  const usageText         = document.getElementById('usageText');
  const limitReached      = document.getElementById('limitReached');
  const actionArea        = document.getElementById('actionArea');
  const convertBtn        = document.getElementById('convertBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar       = document.getElementById('progressBar');
  const progressPercent   = document.getElementById('progressPercent');
  const progressMessage   = document.getElementById('progressMessage');
  const resultSection     = document.getElementById('resultSection');
  const downloadBtn       = document.getElementById('downloadBtn');
  const resultMeta        = document.getElementById('resultMeta');
  const resetBtn          = document.getElementById('resetBtn');

  // ── Upload zone setup ──────────────────────────────────
  setupUploadZone('uploadZone', 'fileInput', onFile, {
    multiple: false,
    accept: '.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword',
  });

  if (uploadZone) {
    const triggerBtn = uploadZone.querySelector('.upload-trigger');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('fileInput').click();
      });
    }
  }

  if (removeFileBtn) removeFileBtn.addEventListener('click', clearFile);
  if (resetBtn)      resetBtn.addEventListener('click', clearFile);
  if (convertBtn)    convertBtn.addEventListener('click', convert);

  // Show initial usage count
  updateUsageUI();

  // ═══════════════════════════════════════════════════════
  // Daily limit helpers
  // ═══════════════════════════════════════════════════════

  function getUsageToday() {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem('w2p_date') !== today) {
        localStorage.setItem('w2p_date', today);
        localStorage.setItem('w2p_count', '0');
      }
      return parseInt(localStorage.getItem('w2p_count') || '0', 10);
    } catch {
      return 0; // localStorage unavailable (private browsing, etc.)
    }
  }

  function incrementUsage() {
    try {
      getUsageToday(); // ensure date is current
      const n = parseInt(localStorage.getItem('w2p_count') || '0', 10) + 1;
      localStorage.setItem('w2p_count', String(n));
    } catch { /* ignore */ }
    updateUsageUI();
  }

  function updateUsageUI() {
    const used = getUsageToday();
    const atLimit = used >= DAILY_LIMIT;

    if (usageText) {
      usageText.textContent = used + ' of ' + DAILY_LIMIT + ' free conversions used today';
    }
    if (usageInfo) usageInfo.style.display = '';
    if (limitReached) limitReached.style.display = atLimit ? '' : 'none';

    // Disable convert button if at limit (but not if it's disabled for other reasons)
    if (convertBtn && atLimit) convertBtn.disabled = true;
  }

  // ═══════════════════════════════════════════════════════
  // File handling
  // ═══════════════════════════════════════════════════════

  function onFile(fileList) {
    const file = Array.from(fileList)[0];
    if (!file) return;

    const validExt = /\.(docx|doc)$/i;
    if (!validExt.test(file.name)) {
      alert(t('wordToPdf.invalidFile') || 'Please select a Word document (.doc or .docx).');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert('File is too large. Maximum size is 10 MB.');
      return;
    }

    currentFile = file;

    // Show softer warning for .doc (still supported server-side)
    const isOldDoc = file.name.toLowerCase().endsWith('.doc') &&
                     !file.name.toLowerCase().endsWith('.docx');
    if (formatWarning) formatWarning.style.display = isOldDoc ? '' : 'none';

    showFileInfo();
  }

  function showFileInfo() {
    if (!currentFile) return;
    if (selectedFileName) selectedFileName.textContent = currentFile.name;
    if (selectedFileSize) selectedFileSize.textContent = formatFileSize(currentFile.size);
    if (uploadZone)       uploadZone.style.display     = 'none';
    if (selectedFileInfo) selectedFileInfo.style.display = '';
    if (actionArea)       actionArea.style.display       = '';
    hideResultUI();
    hideProgressUI();
    updateUsageUI();
  }

  function clearFile() {
    currentFile = null;
    revokeBlobUrl();
    if (uploadZone)       uploadZone.style.display       = '';
    if (selectedFileInfo) selectedFileInfo.style.display  = 'none';
    if (actionArea)       actionArea.style.display        = 'none';
    if (formatWarning)    formatWarning.style.display     = 'none';
    if (convertBtn)       convertBtn.disabled             = false;
    // Restore download button text
    var span = downloadBtn && downloadBtn.querySelector('span');
    if (span) span.textContent = t('result.download') || 'Download PDF';
    hideResultUI();
    hideProgressUI();
    updateUsageUI();
  }

  // ═══════════════════════════════════════════════════════
  // Progress / result UI
  // ═══════════════════════════════════════════════════════

  function setProgress(percent, message) {
    var p = Math.max(0, Math.min(100, percent));
    if (progressContainer) progressContainer.style.display = '';
    if (progressBar)       progressBar.style.width         = p + '%';
    if (progressPercent)   progressPercent.textContent      = p + '%';
    if (message && progressMessage) progressMessage.textContent = message;
  }

  function hideProgressUI() {
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar)       progressBar.style.width         = '0%';
    if (progressPercent)   progressPercent.textContent      = '0%';
  }

  function hideResultUI() {
    if (resultSection) resultSection.style.display = 'none';
    if (downloadBtn)   { downloadBtn.href = '#'; downloadBtn.download = 'document.pdf'; }
    if (resultMeta)    resultMeta.textContent = '';
  }

  function revokeBlobUrl() {
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  }

  // ═══════════════════════════════════════════════════════
  // Main conversion flow
  // ═══════════════════════════════════════════════════════

  async function convert() {
    if (!currentFile) return;

    // Check daily limit
    if (getUsageToday() >= DAILY_LIMIT) {
      alert('Daily free limit reached. Please try again tomorrow or upgrade for unlimited conversions.');
      return;
    }

    convertBtn.disabled = true;
    hideResultUI();
    revokeBlobUrl();
    setProgress(2, t('wordToPdf.uploading') || 'Preparing upload...');

    try {
      var pdfBlob = await uploadAndConvert(currentFile);

      setProgress(95, t('wordToPdf.finishing') || 'Finishing up...');
      incrementUsage();

      await sleep(300);
      setProgress(100, t('common.done') || 'Done!');
      await sleep(300);
      hideProgressUI();

      // ── Show result ─────────────────────────────────────
      var outName = currentFile.name.replace(/\.(docx?)$/i, '.pdf');
      blobUrl = URL.createObjectURL(pdfBlob);

      if (downloadBtn) {
        downloadBtn.href     = blobUrl;
        downloadBtn.download = outName;
      }
      if (resultMeta) {
        resultMeta.textContent = outName + ' (' + formatFileSize(pdfBlob.size) + ')';
      }
      if (resultSection) resultSection.style.display = '';

      showPreview('resultSection', blobUrl, outName);

    } catch (err) {
      console.error('[word-to-pdf] Error:', err);
      hideProgressUI();
      alert((t('common.error') || 'Error') + ': ' + err.message);
    } finally {
      convertBtn.disabled = false;
      updateUsageUI();
    }
  }

  // ═══════════════════════════════════════════════════════
  // XHR upload with progress
  // ═══════════════════════════════════════════════════════

  function uploadAndConvert(file) {
    return new Promise(function (resolve, reject) {
      var xhr  = new XMLHttpRequest();
      var form = new FormData();
      form.append('file', file, file.name);

      // ── Upload progress (2% → 60%) ────────────────────
      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 100);
          setProgress(2 + pct * 0.58, (t('wordToPdf.uploading') || 'Uploading') + '... ' + pct + '%');
        }
      });

      // ── Upload complete, waiting for server ────────────
      xhr.upload.addEventListener('load', function () {
        setProgress(65, t('wordToPdf.converting') || 'Converting document...');
      });

      // ── Server response ────────────────────────────────
      xhr.addEventListener('load', function () {
        if (xhr.status === 200 && xhr.response && xhr.response.size > 0) {
          setProgress(90, t('wordToPdf.downloading') || 'Preparing download...');
          resolve(xhr.response);
          return;
        }

        // Error path — response is a blob even on error (because responseType='blob')
        var blob = xhr.response;
        if (blob && blob.size > 0) {
          blob.text().then(function (text) {
            try {
              var err = JSON.parse(text);
              reject(new Error(err.error || 'Conversion failed'));
            } catch (_) {
              reject(new Error('Conversion failed (status ' + xhr.status + ')'));
            }
          }).catch(function () {
            reject(new Error('Conversion failed (status ' + xhr.status + ')'));
          });
        } else {
          reject(new Error('Conversion failed (status ' + xhr.status + ')'));
        }
      });

      xhr.addEventListener('error', function () {
        reject(new Error('Network error. Please check your connection and try again.'));
      });

      xhr.addEventListener('timeout', function () {
        reject(new Error('Request timed out. The file may be too large or the server is busy.'));
      });

      xhr.responseType = 'blob';
      xhr.timeout = 120000; // 2 minutes
      xhr.open('POST', WORKER_URL);
      xhr.send(form);
    });
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }
});

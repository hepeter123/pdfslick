/* ============================================================
   AI Paper Reader — ai-paper.js
   Split-screen PDF reader with chat-style AI panel
   ============================================================ */

(function () {
  'use strict';

  // ─── Configuration ───────────────────────────────────────
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const FREE_PAPERS_PER_DAY = 999; // TODO: 上线前改回 1
  const FREE_EXPLAINS_PER_PAPER = 5;
  const FREE_TRANSLATES_PER_PAPER = 5;
  const FREE_REWRITES_PER_PAPER = 5;
  const FREE_QUESTIONS_PER_PAPER = 5;
  const WORKER_URL = '';

  const USE_MOCK = !WORKER_URL;

  const LANG_NAMES = {
    zh: '中文', ja: '日本語', ko: '한국어',
    es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch'
  };

  // ─── PDF.js Setup (loaded via ES module in HTML) ─────────

  // ─── State ───────────────────────────────────────────────
  let pdfDoc = null;
  let paperText = '';
  let currentScale = 1.0; // multiplier on fit-width (1.0 = exactly fit container)
  let chatHistory = [];
  let allCards = []; // { id, type, text?, action?, result }
  let usageCounts = { explain: 0, translate: 0, rewrite: 0, questions: 0 };

  // ─── DOM ─────────────────────────────────────────────────
  const uploadScreen = document.getElementById('aipUploadScreen');
  const readerScreen = document.getElementById('aipReader');
  const uploadZone   = document.getElementById('uploadZone');
  const fileInput    = document.getElementById('fileInput');

  const pdfPanel     = document.getElementById('aipPdfPanel');
  const pdfViewer    = document.getElementById('aipPdfViewer');
  const pdfLoading   = document.getElementById('aipPdfLoading');
  const pdfFilename  = document.getElementById('aipPdfFilename');
  const zoomLabel    = document.getElementById('aipZoomLabel');
  const pageInfo     = document.getElementById('aipPageInfo');
  const backBtn      = document.getElementById('aipBackBtn');
  const zoomInBtn    = document.getElementById('aipZoomIn');
  const zoomOutBtn   = document.getElementById('aipZoomOut');
  const fitWidthBtn  = document.getElementById('aipFitWidth');

  const aiPanel      = document.getElementById('aipAiPanel');
  const panelFlow    = document.getElementById('aipPanelFlow');
  const welcome      = document.getElementById('aipWelcome');
  const targetLangSel= document.getElementById('aipTargetLang');
  const summaryBtn   = document.getElementById('aipSummaryBtn');
  const termsBtn     = document.getElementById('aipTermsBtn');
  const exportBtn    = document.getElementById('aipExportNotesBtn');

  const chatInput    = document.getElementById('aipChatInput');
  const chatSend     = document.getElementById('aipChatSend');
  const questionsLeft= document.getElementById('aipQuestionsLeft');

  const floatToolbar = document.getElementById('aipFloatToolbar');
  const resizer      = document.getElementById('aipResizer');
  const limitBanner  = document.getElementById('aipLimitBanner');

  const mobileFab    = document.getElementById('aipMobileFab');
  const mobilePanel  = document.getElementById('aipMobilePanel');
  const mobilePanelClose = document.getElementById('aipMobilePanelClose');
  const mobilePanelBody  = document.getElementById('aipMobilePanelBody');

  // ─── Helpers ─────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function scrollFlowToBottom() {
    if (panelFlow) {
      requestAnimationFrame(() => {
        panelFlow.scrollTop = panelFlow.scrollHeight;
      });
    }
  }

  function hideWelcome() {
    if (welcome) welcome.style.display = 'none';
  }

  // ─── Usage Limits ────────────────────────────────────────
  function getTodayKey() { return 'aipr_' + new Date().toISOString().slice(0, 10); }
  function getPapersUsedToday() { return parseInt(localStorage.getItem(getTodayKey()) || '0', 10); }
  function incrementPapersUsed() { localStorage.setItem(getTodayKey(), String(getPapersUsedToday() + 1)); }
  function canProcessPaper() { return getPapersUsedToday() < FREE_PAPERS_PER_DAY; }

  function canUseAction(action) {
    const limits = { explain: FREE_EXPLAINS_PER_PAPER, translate: FREE_TRANSLATES_PER_PAPER, rewrite: FREE_REWRITES_PER_PAPER, questions: FREE_QUESTIONS_PER_PAPER };
    return usageCounts[action] < (limits[action] || 5);
  }

  function showLimitBanner() {
    if (limitBanner) limitBanner.style.display = 'flex';
    setTimeout(() => { if (limitBanner) limitBanner.style.display = 'none'; }, 8000);
  }

  // ─── Upload ──────────────────────────────────────────────
  if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
    const triggerBtn = uploadZone.querySelector('.upload-trigger');
    if (triggerBtn) triggerBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  }

  function handleFile(file) {
    if (!file.type.includes('pdf')) { alert('Please upload a PDF file.'); return; }
    if (file.size > MAX_FILE_SIZE) { alert('File size exceeds 20 MB limit.'); return; }
    if (!canProcessPaper()) { showLimitBanner(); return; }
    const siteLang = document.documentElement.lang || 'en';
    if (siteLang !== 'en' && targetLangSel && targetLangSel.querySelector('option[value="' + siteLang + '"]')) {
      targetLangSel.value = siteLang;
    }
    enterReaderMode(file);
  }

  // ─── Reader Mode ─────────────────────────────────────────
  function enterReaderMode(file) {
    uploadScreen.style.display = 'none';
    readerScreen.style.display = 'flex';
    pdfFilename.textContent = file.name;
    document.querySelector('.footer').style.display = 'none';
    var pricing = document.getElementById('aipPricing');
    if (pricing) pricing.style.display = 'none';
    loadPDF(file);
  }

  function exitReaderMode() {
    readerScreen.style.display = 'none';
    uploadScreen.style.display = '';
    document.querySelector('.footer').style.display = '';
    var pricing = document.getElementById('aipPricing');
    if (pricing) pricing.style.display = '';
    pdfDoc = null; paperText = ''; chatHistory = []; allCards = [];
    usageCounts = { explain: 0, translate: 0, rewrite: 0, questions: 0 };
    pdfViewer.innerHTML = '';
    // Reset panel flow — keep only welcome
    while (panelFlow.firstChild) panelFlow.removeChild(panelFlow.firstChild);
    panelFlow.appendChild(welcome);
    welcome.style.display = '';
    fileInput.value = '';
    if (questionsLeft) questionsLeft.textContent = String(FREE_QUESTIONS_PER_PAPER);
  }

  if (backBtn) backBtn.addEventListener('click', exitReaderMode);

  // ─── PDF Rendering ───────────────────────────────────────
  const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69';

  async function loadPDF(file) {
    pdfLoading.style.display = 'flex';
    pdfViewer.innerHTML = '';
    pdfViewer.appendChild(pdfLoading);
    try {
      var buf = await file.arrayBuffer();
      pdfDoc = await pdfjsLib.getDocument({
        data: buf,
        cMapUrl: PDFJS_CDN + '/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: PDFJS_CDN + '/standard_fonts/',
        enableXfa: true           // support XFA forms
      }).promise;
      pageInfo.textContent = 'Page 1 / ' + pdfDoc.numPages;
      paperText = await extractAllText(pdfDoc);
      pdfLoading.style.display = 'none';
      await fitWidthAndRender();
      pdfViewer.scrollTop = 0;
      incrementPapersUsed();
    } catch (err) {
      console.error('[AI Paper] PDF load error:', err);
      var msg = 'Failed to load PDF.';
      if (err && err.message) {
        if (err.message.includes('password')) msg = 'This PDF is password-protected. Please use Unlock PDF first.';
        else if (err.message.includes('worker')) msg = 'PDF.js worker failed to load. Please refresh the page.';
      }
      pdfLoading.innerHTML = '<p style="color:#E53E3E;">' + msg + '</p>';
    }
  }

  async function extractAllText(pdf) {
    var t = '';
    for (var i = 1; i <= pdf.numPages; i++) {
      try {
        var page = await pdf.getPage(i);
        var c = await page.getTextContent();
        t += c.items.map(function(x) { return x.str; }).join(' ') + '\n\n';
      } catch (e) {
        console.warn('[AI Paper] Text extract failed on page ' + i, e);
      }
    }
    return t;
  }

  var _renderVersion = 0; // incremented on each render; stale renders abort

  async function renderAllPages() {
    var myVersion = ++_renderVersion;
    // Hide selection UI before clearing
    if (typeof hideSelectionUI === 'function') hideSelectionUI();
    pdfViewer.innerHTML = '';
    for (var i = 1; i <= pdfDoc.numPages; i++) {
      if (_renderVersion !== myVersion) return; // a newer render started — abort this one
      try {
        await renderPage(i);
      } catch (err) {
        console.error('[AI Paper] renderPage ' + i + ' failed:', err);
        var placeholder = document.createElement('div');
        placeholder.className = 'page';
        placeholder.style.cssText = 'width:100%;height:200px;display:flex;align-items:center;justify-content:center;color:#E53E3E;background:#fff';
        placeholder.textContent = 'Page ' + i + ' failed to render';
        pdfViewer.appendChild(placeholder);
      }
    }
  }

  // ─── PDF Scale & Rendering (complete rewrite) ────────────
  var _baseScale = 1;     // scale that makes page exactly fit container width
  var _zoomTimer = null;
  var _resizeTimer = null;

  // Measure container and compute fit-width scale from page 1
  async function calcBaseScale() {
    if (!pdfDoc) return 1;
    var page = await pdfDoc.getPage(1);
    var vp = page.getViewport({ scale: 1 });
    var available = pdfViewer.clientWidth - 40; // 20px padding each side
    if (available <= 0) available = 500;
    _baseScale = available / vp.width;
    return _baseScale;
  }

  // Fit-width: set scale = base and re-render
  async function fitWidthAndRender() {
    await calcBaseScale();
    currentScale = _baseScale;
    updateZoomLabel();
    await renderAllPages();
  }

  function updateZoomLabel() {
    var pct = Math.round((currentScale / _baseScale) * 100);
    if (zoomLabel) zoomLabel.textContent = pct + '%';
  }

  // ─── Render All Pages ─────────────────────────────────────
  async function renderPage(num) {
    var page = await pdfDoc.getPage(num);
    var viewport = page.getViewport({ scale: currentScale });
    var w = Math.round(viewport.width);
    var h = Math.round(viewport.height);

    // Page wrapper
    var pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    pageDiv.dataset.pageNumber = num;

    // Canvas — determines page size (display: block, not absolute)
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    pageDiv.appendChild(canvas);

    // Text layer — overlays canvas
    var textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
    pageDiv.appendChild(textLayerDiv);

    pdfViewer.appendChild(pageDiv);

    // ── Canvas render ──
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    try {
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    } catch (err) {
      console.error('[AI Paper] Render error page ' + num + ':', err);
    }

    // ── Text layer render ──
    try {
      var tc = await page.getTextContent();
      if (typeof pdfjsLib.TextLayer === 'function') {
        await new pdfjsLib.TextLayer({ textContentSource: tc, container: textLayerDiv, viewport: viewport }).render();
      } else if (typeof pdfjsLib.renderTextLayer === 'function') {
        var task = pdfjsLib.renderTextLayer({ textContentSource: tc, container: textLayerDiv, viewport: viewport, textDivs: [] });
        if (task && task.promise) await task.promise;
      }
    } catch (err) {
      console.warn('[AI Paper] TextLayer error page ' + num + ':', err);
    }

    console.log('[AI Paper] Page ' + num + ': ' + w + 'x' + h + ', scale=' + currentScale.toFixed(3));
  }

  // ─── Zoom ────────────────────────────────────────────────
  function zoomTo(newScale, immediate) {
    currentScale = Math.max(0.2, Math.min(5, newScale));
    updateZoomLabel();
    if (!pdfDoc) return;
    if (immediate) { renderAllPages(); return; }
    clearTimeout(_zoomTimer);
    _zoomTimer = setTimeout(function() { renderAllPages(); }, 200);
  }

  if (zoomInBtn) zoomInBtn.addEventListener('click', function() { zoomTo(currentScale * 1.25, true); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', function() { zoomTo(currentScale * 0.8, true); });
  if (fitWidthBtn) fitWidthBtn.addEventListener('click', function() { fitWidthAndRender(); });

  // Ctrl + Wheel zoom
  if (pdfViewer) {
    pdfViewer.addEventListener('wheel', function(e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        var factor = e.deltaY > 0 ? 0.9 : 1.1;
        zoomTo(currentScale * factor);
      }
    }, { passive: false });
  }

  // ─── ResizeObserver — re-fit on container resize ─────────
  if (pdfViewer && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function() {
      if (!pdfDoc) return;
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(function() {
        var oldBase = _baseScale;
        calcBaseScale().then(function() {
          // Maintain zoom percentage after resize
          currentScale = currentScale * (_baseScale / oldBase);
          updateZoomLabel();
          renderAllPages();
        });
      }, 300);
    }).observe(pdfViewer);
  }

  if (pdfViewer) pdfViewer.addEventListener('scroll', () => {
    if (!pdfDoc) return;
    const pages = pdfViewer.querySelectorAll('.page');
    const top = pdfViewer.scrollTop + 50;
    let cur = 1;
    for (const p of pages) { if (p.offsetTop <= top) cur = parseInt(p.dataset.pageNumber); }
    pageInfo.textContent = 'Page ' + cur + ' / ' + pdfDoc.numPages;
  });

  // ─── Resizer ─────────────────────────────────────────────
  if (resizer && pdfPanel && aiPanel) {
    let resizing = false;
    resizer.addEventListener('mousedown', e => { resizing = true; resizer.classList.add('active'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; e.preventDefault(); });
    document.addEventListener('mousemove', e => {
      if (!resizing) return;
      const r = readerScreen.getBoundingClientRect();
      const pct = ((e.clientX - r.left) / r.width) * 100;
      if (pct >= 30 && pct <= 75) { pdfPanel.style.flex = 'none'; pdfPanel.style.width = pct + '%'; aiPanel.style.flex = 'none'; aiPanel.style.width = (100 - pct) + '%'; }
    });
    document.addEventListener('mouseup', () => { if (resizing) { resizing = false; resizer.classList.remove('active'); document.body.style.cursor = ''; document.body.style.userSelect = ''; } });
  }

  // ─── Selection Handles (SciSpace-style) ──────────────────
  const handleStart = document.createElement('div');
  handleStart.className = 'aip-sel-handle aip-sel-handle--start';
  document.body.appendChild(handleStart);
  const handleEnd = document.createElement('div');
  handleEnd.className = 'aip-sel-handle aip-sel-handle--end';
  document.body.appendChild(handleEnd);

  let activeHandle = null;   // 'start' | 'end' | null
  let savedRange = null;     // cloned Range while dragging

  function isNodeInPdf(node) {
    while (node) {
      if (node === pdfViewer) return true;
      node = node.parentNode;
    }
    return false;
  }

  function getCaretRange(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (pos) { var r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); r.collapse(true); return r; }
    }
    return null;
  }

  function positionHandles(range) {
    var rects = range.getClientRects();
    if (!rects.length) { hideSelectionUI(); return; }
    var first = rects[0], last = rects[rects.length - 1];
    // Start handle — bottom-left of first rect
    handleStart.style.left = (first.left - 5) + 'px';
    handleStart.style.top = (first.bottom - 3) + 'px';
    handleStart.style.display = 'block';
    // End handle — bottom-right of last rect
    handleEnd.style.left = (last.right - 5) + 'px';
    handleEnd.style.top = (last.bottom - 3) + 'px';
    handleEnd.style.display = 'block';
  }

  function showSelectionUI() {
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (text.length > 3 && text.length < 2000 && sel.anchorNode && isNodeInPdf(sel.anchorNode) && sel.rangeCount > 0) {
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      // Position floating toolbar above selection
      var tw = 300, th = 44, gap = 8;
      var left = rect.left + rect.width / 2 - tw / 2;
      left = Math.max(gap, Math.min(left, window.innerWidth - tw - gap));
      var top = rect.top - th - gap;
      if (top < gap) top = rect.bottom + gap;
      floatToolbar.style.left = left + 'px';
      floatToolbar.style.top = top + 'px';
      floatToolbar.style.display = 'flex';
      floatToolbar._selectedText = text;
      // Show drag handles
      positionHandles(range);
      savedRange = range.cloneRange();
      return true;
    }
    return false;
  }

  function hideSelectionUI() {
    floatToolbar.style.display = 'none';
    handleStart.style.display = 'none';
    handleEnd.style.display = 'none';
    savedRange = null;
  }

  // ─── Handle Drag ────────────────────────────────────────
  function onHandleDragStart(which, e) {
    e.preventDefault();
    e.stopPropagation();
    activeHandle = which;
    (which === 'start' ? handleStart : handleEnd).classList.add('dragging');
  }

  handleStart.addEventListener('mousedown', function(e) { onHandleDragStart('start', e); });
  handleStart.addEventListener('touchstart', function(e) { onHandleDragStart('start', e); }, { passive: false });
  handleEnd.addEventListener('mousedown', function(e) { onHandleDragStart('end', e); });
  handleEnd.addEventListener('touchstart', function(e) { onHandleDragStart('end', e); }, { passive: false });

  function onHandleDragMove(x, y) {
    if (!activeHandle || !savedRange) return;
    var caretR = getCaretRange(x, y);
    if (!caretR || !isNodeInPdf(caretR.startContainer)) return;
    try {
      var newRange = document.createRange();
      if (activeHandle === 'start') {
        newRange.setStart(caretR.startContainer, caretR.startOffset);
        newRange.setEnd(savedRange.endContainer, savedRange.endOffset);
      } else {
        newRange.setStart(savedRange.startContainer, savedRange.startOffset);
        newRange.setEnd(caretR.startContainer, caretR.startOffset);
      }
      // Only apply if range is valid (start before end)
      if (!newRange.collapsed || activeHandle === 'end') {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);
        positionHandles(newRange);
        // Update toolbar position
        var rect = newRange.getBoundingClientRect();
        var tw = 300, th = 44, gap = 8;
        var left = rect.left + rect.width / 2 - tw / 2;
        left = Math.max(gap, Math.min(left, window.innerWidth - tw - gap));
        var top = rect.top - th - gap;
        if (top < gap) top = rect.bottom + gap;
        floatToolbar.style.left = left + 'px';
        floatToolbar.style.top = top + 'px';
      }
    } catch (_) { /* range boundary error — ignore */ }
  }

  document.addEventListener('mousemove', function(e) {
    if (activeHandle) { e.preventDefault(); onHandleDragMove(e.clientX, e.clientY); }
  });
  document.addEventListener('touchmove', function(e) {
    if (activeHandle && e.touches.length) { e.preventDefault(); onHandleDragMove(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });

  function onHandleDragEnd() {
    if (!activeHandle) return;
    handleStart.classList.remove('dragging');
    handleEnd.classList.remove('dragging');
    activeHandle = null;
    // Update savedRange and toolbar text
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      savedRange = sel.getRangeAt(0).cloneRange();
      floatToolbar._selectedText = sel.toString().trim();
    }
  }
  document.addEventListener('mouseup', onHandleDragEnd);
  document.addEventListener('touchend', onHandleDragEnd);

  // ─── Text Selection → Floating Toolbar ───────────────────
  document.addEventListener('mouseup', function(e) {
    if (activeHandle) return; // handle drag end handled above
    setTimeout(function() {
      if (!showSelectionUI()) {
        // No valid selection — hide everything (unless clicking toolbar or handle)
        if (!floatToolbar.contains(e.target) &&
            e.target !== handleStart && e.target !== handleEnd) {
          hideSelectionUI();
        }
      }
    }, 50);
  });

  // Touch: show toolbar on selection change (long-press select on mobile)
  document.addEventListener('selectionchange', function() {
    if (activeHandle) return;
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (text.length > 3 && sel.anchorNode && isNodeInPdf(sel.anchorNode)) {
      setTimeout(function() { showSelectionUI(); }, 80);
    }
  });

  if (floatToolbar) {
    floatToolbar.querySelectorAll('.aip-float-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = btn.dataset.action;
        var text = floatToolbar._selectedText;
        if (text && action) handleUnderstandAction(action, text);
        hideSelectionUI();
        window.getSelection().removeAllRanges();
      });
    });
  }

  document.addEventListener('mousedown', function(e) {
    // Don't hide if clicking handles or toolbar
    if (e.target === handleStart || e.target === handleEnd) return;
    if (floatToolbar && !floatToolbar.contains(e.target)) {
      hideSelectionUI();
    }
  });

  // ─── Understanding Actions ───────────────────────────────
  async function handleUnderstandAction(action, selectedText) {
    if (!canUseAction(action)) { showLimitBanner(); return; }
    usageCounts[action]++;
    hideWelcome();
    const lang = targetLangSel ? targetLangSel.value : 'zh';
    const cardId = 'uc_' + Date.now();
    const card = buildCard(cardId, action, selectedText);
    panelFlow.appendChild(card);
    allCards.push({ id: cardId, type: action, text: selectedText, result: '' });
    scrollFlowToBottom();

    const bodyEl = card.querySelector('.aip-understand-section-body');
    try {
      const result = await callAI(action, selectedText, lang, bodyEl, { paperContext: paperText.substring(0, 15000) });
      if (USE_MOCK && result) bodyEl.innerHTML = result;
      const stored = allCards.find(c => c.id === cardId);
      if (stored) stored.result = bodyEl.textContent;
    } catch {
      bodyEl.innerHTML = '<p style="color:#E53E3E;">Failed. Please try again.</p>';
    }
    scrollFlowToBottom();
  }

  function buildCard(id, action, selectedText) {
    const labels = { translate: { icon: '📖', label: 'Academic Translation' }, explain: { icon: '💡', label: 'Plain Explanation' }, rewrite: { icon: '🔄', label: 'Rewrite Suggestion' } };
    const info = labels[action] || labels.explain;
    const card = document.createElement('div');
    card.className = 'aip-understand-card';
    card.id = id;
    card.innerHTML =
      '<div class="aip-understand-card-header"><div class="aip-understand-selected">"' + escapeHTML(selectedText.substring(0, 300)) + (selectedText.length > 300 ? '...' : '') + '"</div></div>' +
      '<div class="aip-understand-section"><div class="aip-understand-section-label"><span>' + info.icon + '</span> ' + info.label + '</div><div class="aip-understand-section-body"><div class="aip-placeholder">Generating...</div></div></div>' +
      '<div class="aip-card-followup"><div class="aip-card-followup-input"><input type="text" placeholder="Still confused? Ask more..." /><button class="aip-card-followup-send" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div><div class="aip-card-followup-messages"></div></div>';

    const fInput = card.querySelector('.aip-card-followup-input input');
    const fSend = card.querySelector('.aip-card-followup-send');
    const fMsgs = card.querySelector('.aip-card-followup-messages');
    const doSend = async () => {
      const q = fInput.value.trim();
      if (!q) return;
      if (!canUseAction('questions')) { showLimitBanner(); return; }
      usageCounts.questions++;
      if (questionsLeft) questionsLeft.textContent = String(FREE_QUESTIONS_PER_PAPER - usageCounts.questions);
      fInput.value = '';
      appendBubble(fMsgs, q, true);
      const lang = targetLangSel ? targetLangSel.value : 'zh';
      const ans = await callAI('chat', paperText, lang, null, { question: q, chatHistory: [] });
      appendBubble(fMsgs, typeof ans === 'string' ? ans : 'No response.', false);
      scrollFlowToBottom();
    };
    fSend.addEventListener('click', doSend);
    fInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } });
    return card;
  }

  // ─── Summary / Terms (manual trigger) ────────────────────
  if (summaryBtn) summaryBtn.addEventListener('click', generateSummaryCard);
  if (termsBtn) termsBtn.addEventListener('click', generateTermsCard);

  async function generateSummaryCard() {
    if (!paperText) return;
    hideWelcome();
    const lang = targetLangSel ? targetLangSel.value : 'zh';
    const card = document.createElement('div');
    card.className = 'aip-understand-card';
    card.innerHTML =
      '<div class="aip-understand-section"><div class="aip-understand-section-label"><span>📋</span> Paper Summary</div><div class="aip-understand-section-body" id="aipSummaryOut"><div class="aip-placeholder">Generating summary...</div></div></div>';
    panelFlow.appendChild(card);
    allCards.push({ id: 'summary_' + Date.now(), type: 'summary', result: '' });
    scrollFlowToBottom();

    const bodyEl = card.querySelector('#aipSummaryOut');
    try {
      const result = await callAI('summary', paperText, lang, bodyEl);
      if (USE_MOCK && result) bodyEl.innerHTML = result;
      allCards[allCards.length - 1].result = bodyEl.textContent;
    } catch {
      bodyEl.innerHTML = '<p style="color:#E53E3E;">Failed to generate summary.</p>';
    }
    scrollFlowToBottom();
  }

  async function generateTermsCard() {
    if (!paperText) return;
    hideWelcome();
    const lang = targetLangSel ? targetLangSel.value : 'zh';
    const card = document.createElement('div');
    card.className = 'aip-understand-card';
    card.innerHTML =
      '<div class="aip-understand-section"><div class="aip-understand-section-label"><span>📚</span> Key Terms</div><div class="aip-understand-section-body" id="aipTermsOut"><div class="aip-placeholder">Extracting terms...</div></div></div>';
    panelFlow.appendChild(card);
    allCards.push({ id: 'terms_' + Date.now(), type: 'terms', result: '' });
    scrollFlowToBottom();

    const bodyEl = card.querySelector('#aipTermsOut');
    try {
      const result = await callAI('terms', paperText, lang);
      renderTermsInto(bodyEl, result);
      allCards[allCards.length - 1].result = bodyEl.textContent;
    } catch {
      bodyEl.innerHTML = '<p style="color:#E53E3E;">Failed to extract terms.</p>';
    }
    scrollFlowToBottom();
  }

  function renderTermsInto(el, result) {
    try {
      const terms = typeof result === 'string' ? JSON.parse(result) : result;
      if (!Array.isArray(terms) || !terms.length) { el.innerHTML = '<p>No key terms found.</p>'; return; }
      let html = '';
      for (const t of terms) {
        html += '<div class="aip-term-item"><div class="aip-term-header"><span class="aip-term-name">' + escapeHTML(t.term) + '</span><span class="aip-term-expand">&#9660;</span></div><div class="aip-term-detail"><p><strong>Academic:</strong> ' + escapeHTML(t.academic || '') + '</p><p><strong>Plain:</strong> ' + escapeHTML(t.plain || '') + '</p>' + (t.example ? '<p><strong>Example:</strong> ' + escapeHTML(t.example) + '</p>' : '') + '</div></div>';
      }
      el.innerHTML = html;
      el.querySelectorAll('.aip-term-item').forEach(item => item.addEventListener('click', () => item.classList.toggle('open')));
    } catch { el.innerHTML = '<p>Failed to parse terms.</p>'; }
  }

  // ─── General Chat (bottom input) ─────────────────────────
  if (chatSend) chatSend.addEventListener('click', handleChat);
  if (chatInput) {
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); } });
    chatInput.addEventListener('input', () => { chatInput.style.height = 'auto'; chatInput.style.height = Math.min(chatInput.scrollHeight, 80) + 'px'; });
  }

  async function handleChat() {
    const q = chatInput.value.trim();
    if (!q || !paperText) return;
    if (!canUseAction('questions')) { showLimitBanner(); return; }
    usageCounts.questions++;
    if (questionsLeft) questionsLeft.textContent = String(FREE_QUESTIONS_PER_PAPER - usageCounts.questions);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    hideWelcome();

    // Insert a Q&A card into the flow
    const card = document.createElement('div');
    card.className = 'aip-understand-card';
    card.innerHTML =
      '<div class="aip-understand-card-header"><div class="aip-understand-selected" style="border-left-color:var(--color-primary);">' + escapeHTML(q) + '</div></div>' +
      '<div class="aip-understand-section"><div class="aip-understand-section-label"><span>💬</span> Answer</div><div class="aip-understand-section-body"><div class="aip-placeholder">Thinking...</div></div></div>';
    panelFlow.appendChild(card);
    allCards.push({ id: 'chat_' + Date.now(), type: 'chat', text: q, result: '' });
    scrollFlowToBottom();

    chatHistory.push({ role: 'user', content: q });
    const lang = targetLangSel ? targetLangSel.value : 'zh';
    const bodyEl = card.querySelector('.aip-understand-section-body');
    try {
      const ans = await callAI('chat', paperText, lang, null, { question: q, chatHistory });
      const ansText = typeof ans === 'string' ? ans : 'No response.';
      chatHistory.push({ role: 'assistant', content: ansText });
      bodyEl.innerHTML = '<p>' + escapeHTML(ansText) + '</p>';
      allCards[allCards.length - 1].result = ansText;
    } catch {
      bodyEl.innerHTML = '<p style="color:#E53E3E;">Failed to get answer.</p>';
    }
    scrollFlowToBottom();
  }

  function appendBubble(container, text, isUser) {
    const msg = document.createElement('div');
    msg.className = 'aip-chat-msg ' + (isUser ? 'aip-chat-msg--user' : 'aip-chat-msg--ai');
    msg.innerHTML = '<div class="aip-chat-msg-avatar">' + (isUser ? 'U' : 'AI') + '</div><div class="aip-chat-msg-bubble">' + escapeHTML(text) + '</div>';
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  // ─── Mobile Panel ────────────────────────────────────────
  if (mobileFab) mobileFab.addEventListener('click', () => {
    if (mobilePanel) { mobilePanelBody.innerHTML = panelFlow.innerHTML; mobilePanel.style.display = 'flex'; mobilePanel.classList.add('open'); }
  });
  if (mobilePanelClose) mobilePanelClose.addEventListener('click', () => { mobilePanel.classList.remove('open'); mobilePanel.style.display = 'none'; });

  // ─── Export Notes ────────────────────────────────────────
  if (exportBtn) exportBtn.addEventListener('click', exportNotes);

  function exportNotes() {
    let content = '<h1>Paper Reading Notes</h1><hr>';
    for (const c of allCards) {
      content += '<div style="margin-bottom:1.5em;padding:1em;border:1px solid #ddd;border-radius:8px;">';
      if (c.text) content += '<p style="font-style:italic;color:#666;border-left:2px solid #6C5CE7;padding-left:8px;">"' + escapeHTML(c.text.substring(0, 300)) + '"</p>';
      content += '<p><strong>' + (c.type || 'note').charAt(0).toUpperCase() + (c.type || 'note').slice(1) + ':</strong></p>';
      content += '<p>' + escapeHTML(c.result) + '</p></div>';
    }
    if (chatHistory.length) {
      content += '<h2>Q&A</h2>';
      for (const m of chatHistory) content += '<p>' + (m.role === 'user' ? '<strong>Q:</strong> ' : '<strong>A:</strong> ') + escapeHTML(m.content) + '</p>';
    }
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow popups.'); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Paper Notes</title><style>body{font-family:sans-serif;max-width:700px;margin:40px auto;line-height:1.8;color:#333;padding:0 20px}h1{font-size:1.5em}h2{font-size:1.2em;color:#6C5CE7}hr{border:none;border-top:1px solid #eee;margin:1.5em 0}p{margin:.5em 0}</style></head><body>' + content + '<p style="text-align:center;color:#999;margin-top:3em;font-size:.9em;">Generated by PDFSlick AI Paper Reader</p></body></html>');
    w.document.close();
    w.print();
  }

  // ─── AI API ──────────────────────────────────────────────
  async function callAI(task, text, lang, streamEl, extra) {
    if (USE_MOCK) return mockAI(task, text, lang, extra);
    const body = { task, text: text.substring(0, 30000), targetLang: lang, ...(extra || {}) };
    if (streamEl) return callWorkerStream(body, streamEl);
    return callWorker(body);
  }

  async function callWorker(body) {
    body.stream = false;
    const res = await fetch(WORKER_URL + '/api/ai-paper', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('API ' + res.status);
    return (await res.json()).result;
  }

  async function callWorkerStream(body, el) {
    el.innerHTML = ''; el.classList.add('aip-typing-cursor');
    body.stream = true;
    const res = await fetch(WORKER_URL + '/api/ai-paper', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('API ' + res.status);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let full = '', buf = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const ln of lines) {
        if (!ln.startsWith('data: ')) continue; const d = ln.slice(6); if (d === '[DONE]') continue;
        try { const evt = JSON.parse(d); if (evt.type === 'content_block_delta' && evt.delta?.text) { full += evt.delta.text; el.innerHTML = full.replace(/\n/g, '<br>'); } } catch {}
      }
    }
    el.classList.remove('aip-typing-cursor');
    return full;
  }

  // ─── Mock Data ───────────────────────────────────────────
  async function mockAI(task, text, targetLang, extra) {
    if (task === 'metadata') { await sleep(600); const l = text.trim().split('\n').filter(x=>x.trim()); return { title: l[0] ? l[0].trim().substring(0,120) : 'Untitled', authors: 'Vaswani, Shazeer, Parmar et al.', year: '2017', journal: 'NeurIPS' }; }
    if (task === 'summary') { await sleep(1200); return '<h3>研究问题</h3><p>传统循环神经网络（RNN）处理语言时速度慢，必须逐词处理，无法并行。有没有更快更好的方法？</p><h3>研究方法</h3><p>研究者提出了 Transformer 架构，核心是"注意力机制"——让模型理解一个词时能同时看到句子中所有其他词，判断哪些更重要。</p><h3>主要发现</h3><p>Transformer 在机器翻译上大幅超越之前所有模型，英德翻译 BLEU 分数达 28.4，训练速度快数倍。</p><h3>为什么重要</h3><p>这个架构成为了 GPT、BERT、ChatGPT 等现代 AI 模型的基础，奠定了当今 AI 革命的技术基石。</p>'; }
    if (task === 'terms') { await sleep(800); return [{ term:'self-attention', academic:'计算序列中每个元素与其他所有元素相关性的机制', plain:'让每个词都能看到句子里其他所有词', example:'像在人群中自动注意到和你话题最相关的人' },{ term:'transformer', academic:'完全基于注意力机制的序列转换模型架构', plain:'一种不需要按顺序处理词语的 AI 方式', example:'从排队结账变成自助同时处理' },{ term:'multi-head attention', academic:'并行运行多次注意力以捕获不同子空间信息', plain:'同时从多个角度理解文字', example:'像一组评委从不同标准打分' },{ term:'BLEU score', academic:'评估机器翻译质量的自动化指标', plain:'衡量翻译好不好的分数，越高越好', example:'类似考试分数' },{ term:'positional encoding', academic:'向模型注入序列中元素位置信息的技术', plain:'告诉 AI 每个词排第几', example:'像排队发号码牌' }]; }
    if (task === 'translate') { await sleep(1000); return '<p>该研究通过引入多头注意力机制（multi-head attention），使模型能够在不同的表征子空间中同时关注来自不同位置的信息。实验结果表明，自注意力层在建模长距离依赖关系方面显著优于循环层，同时计算效率更高。</p>'; }
    if (task === 'explain') { await sleep(1000); return '<p>这段话的意思是：研究者发明了"多头注意力"技巧。你可以想象成让好几组学生同时读同一篇文章，每组关注不同重点——有的关注人物，有的关注时间线。最后汇总起来比一个人读要全面。</p><p>实验证明这种方式在理解长句子中远距离词语关系时特别厉害，而且比以前的方法快得多。</p>'; }
    if (task === 'rewrite') { await sleep(1000); return '<p><strong>学术版：</strong>Vaswani et al. (2017) 提出的多头注意力机制使模型能够并行地在多个表征子空间中捕获依赖关系，实验证实其优于传统循环架构。</p><p><strong>半正式版：</strong>Transformer 的核心创新是多头注意力，允许模型同时从多个角度分析词语关系，比 RNN 更快更准 (Vaswani et al., 2017)。</p><p><strong>通俗版：</strong>Transformer 不是一个词一个词处理，而是同时关注整个句子，又快又准 (Vaswani et al., 2017)。</p>'; }
    if (task === 'chat') { await sleep(800); const q = extra?.question || ''; if (q.includes('main') || q.includes('贡献')) return '核心贡献是提出 Transformer 架构，完全放弃 RNN/CNN，仅用注意力机制处理序列数据，实现高度并行化和更优的长距离依赖建模。'; if (q.includes('method') || q.includes('方法')) return '方法核心是自注意力机制。每个词转换成 Query、Key、Value 三个向量，通过点积计算注意力权重，得到综合全局信息的表示。'; return '根据论文内容，关于"' + q + '"——论文主要讨论 Transformer 如何通过注意力机制替代传统 RNN。选中具体段落可获得更详细解释。'; }
    return '';
  }

  // ─── Debug ───────────────────────────────────────────────
  window.resetQuota = function () {
    localStorage.removeItem(getTodayKey());
    usageCounts = { explain: 0, translate: 0, rewrite: 0, questions: 0 };
    if (questionsLeft) questionsLeft.textContent = String(FREE_QUESTIONS_PER_PAPER);
    if (limitBanner) limitBanner.style.display = 'none';
    console.log('[AI Paper Reader] 额度已重置');
  };

})();

/* ============================================================
   AI Paper Reader — ai-paper.js
   Split-screen PDF reader with chat-style AI panel
   ============================================================ */

(function () {
  'use strict';

  // ─── Configuration ───────────────────────────────────────
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const FREE_PAPERS_PER_DAY = 30;
  const FREE_EXPLAINS_PER_PAPER = 999;
  const FREE_TRANSLATES_PER_PAPER = 999;
  const FREE_REWRITES_PER_PAPER = 999;
  const FREE_QUESTIONS_PER_PAPER = 999;
  const WORKER_URL = 'https://pdfslick-ai-paper.hepeter139.workers.dev';

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
  let messages = []; // { id, role:'user'|'assistant', content, timestamp, type }
  let usageCounts = { explain: 0, translate: 0, rewrite: 0, questions: 0 };

  // ─── Helpers: time formatting ────────────────────────────
  function formatTime(date) {
    var h = date.getHours(), m = date.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  // ─── Simple Markdown → HTML renderer ─────────────────────
  function renderMarkdown(text) {
    if (!text) return '';
    // Always escape first to prevent XSS, then apply markdown formatting
    var s = escapeHTML(text);
    // Bold: **text** or __text__
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    // Inline code: `text`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headers: ### text
    s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    // Unordered list: - item or * item
    s = s.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    s = s.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    // Numbered list: 1. item
    s = s.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // Paragraphs: double newline
    s = s.replace(/\n\n/g, '</p><p>');
    s = s.replace(/\n/g, '<br>');
    if (!s.startsWith('<')) s = '<p>' + s + '</p>';
    return s;
  }

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

  /** Get i18n string — delegates to app.js global t() function */
  function i18n(key, fallback) {
    if (typeof t === 'function') {
      var val = t(key);
      return (val !== key) ? val : fallback;
    }
    return fallback;
  }

  // ─── Smart Auto-Scroll ───────────────────────────────
  let _userScrolledAway = false;
  const newMsgIndicator = document.getElementById('aipNewMsgIndicator');

  function isNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }

  function scrollFlowToBottom(force) {
    if (!panelFlow) return;
    if (!force && _userScrolledAway) {
      // User is reading history — show indicator instead
      if (newMsgIndicator) newMsgIndicator.classList.add('visible');
      return;
    }
    requestAnimationFrame(() => {
      panelFlow.scrollTo({ top: panelFlow.scrollHeight, behavior: 'smooth' });
    });
    if (newMsgIndicator) newMsgIndicator.classList.remove('visible');
  }

  // Track user scroll to decide auto-scroll behavior
  if (panelFlow) {
    let _scrollThrottle = null;
    panelFlow.addEventListener('scroll', () => {
      if (_scrollThrottle) return;
      _scrollThrottle = requestAnimationFrame(() => {
        _userScrolledAway = !isNearBottom(panelFlow);
        // Hide indicator when user scrolls back to bottom
        if (!_userScrolledAway && newMsgIndicator) {
          newMsgIndicator.classList.remove('visible');
        }
        _scrollThrottle = null;
      });
    });
  }

  // Click indicator to jump to bottom
  if (newMsgIndicator) {
    newMsgIndicator.addEventListener('click', () => {
      _userScrolledAway = false;
      newMsgIndicator.classList.remove('visible');
      scrollFlowToBottom(true);
    });
  }

  // MutationObserver: auto-scroll on new content (especially streaming)
  var _flowObserver = null;
  if (panelFlow) {
    _flowObserver = new MutationObserver(() => {
      if (!_userScrolledAway) {
        requestAnimationFrame(() => {
          panelFlow.scrollTo({ top: panelFlow.scrollHeight, behavior: 'smooth' });
        });
      } else if (newMsgIndicator) {
        newMsgIndicator.classList.add('visible');
      }
    });
    _flowObserver.observe(panelFlow, { childList: true, subtree: true, characterData: true });
  }

  function hideWelcome() {
    if (welcome) welcome.style.display = 'none';
  }

  /** Create a chat message bubble and append to panelFlow.
   *  Returns the bubble content element for streaming/updating. */
  function addChatBubble(role, content, type) {
    hideWelcome();
    var now = new Date();
    var msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    var msg = { id: msgId, role: role, content: content, timestamp: now, type: type || 'question' };
    messages.push(msg);

    var wrapper = document.createElement('div');
    wrapper.className = 'aip-chat-msg ' + (role === 'user' ? 'aip-chat-msg--user' : 'aip-chat-msg--ai');
    wrapper.id = msgId;

    var avatar = document.createElement('div');
    avatar.className = 'aip-chat-msg-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';

    var contentDiv = document.createElement('div');
    contentDiv.className = 'aip-chat-msg-content';

    var bubble = document.createElement('div');
    bubble.className = 'aip-chat-msg-bubble';
    if (role === 'user') {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = content; // AI content may contain HTML/Markdown
    }

    var timeEl = document.createElement('span');
    timeEl.className = 'aip-chat-msg-time';
    timeEl.textContent = formatTime(now);

    contentDiv.appendChild(bubble);

    // Copy button for AI messages
    if (role === 'assistant') {
      var copyRow = document.createElement('div');
      copyRow.className = 'aip-chat-msg-actions';
      var copyBtn = document.createElement('button');
      copyBtn.className = 'aip-copy-btn';
      copyBtn.type = 'button';
      copyBtn.title = 'Copy';
      copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
      copyBtn.addEventListener('click', function() {
        var text = bubble.textContent || bubble.innerText || '';
        navigator.clipboard.writeText(text).then(function() {
          copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
          showToast('Copied!', 'success');
          setTimeout(function() {
            copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
          }, 1500);
        });
      });
      copyRow.appendChild(copyBtn);
      copyRow.appendChild(timeEl);
      contentDiv.appendChild(copyRow);
    } else {
      contentDiv.appendChild(timeEl);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(contentDiv);

    // Insert before the new-msg indicator if it exists
    if (newMsgIndicator && newMsgIndicator.parentNode === panelFlow) {
      panelFlow.insertBefore(wrapper, newMsgIndicator);
    } else {
      panelFlow.appendChild(wrapper);
    }

    return bubble; // return bubble element for streaming/updating
  }

  /** Add a "thinking" bubble with loading dots, returns { wrapper, bubble } */
  function addThinkingBubble() {
    var bubble = addChatBubble('assistant', '<div class="aip-loading-dots"><span></span><span></span><span></span></div>', 'thinking');
    var wrapper = bubble.closest('.aip-chat-msg');
    return { wrapper: wrapper, bubble: bubble };
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
    if (!file.type.includes('pdf')) { showToast(i18n('aiPaper.errors.notPdf', 'Please upload a PDF file.')); return; }
    if (file.size > MAX_FILE_SIZE) { showToast(i18n('aiPaper.errors.tooLarge', 'File size exceeds 20 MB limit.')); return; }
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
    // Set welcome message timestamp
    var welcomeTime = document.getElementById('aipWelcomeTime');
    if (welcomeTime) welcomeTime.textContent = formatTime(new Date());

    // First-time user guide
    if (!localStorage.getItem('pdfslick_visited_ai')) {
      localStorage.setItem('pdfslick_visited_ai', 'true');
      // Replace default welcome with first-time guide (after a short delay)
      setTimeout(function() {
        if (welcome) welcome.style.display = 'none';
        addChatBubble('assistant',
          "<strong>Welcome!</strong> Here's how to use me:<br><br>" +
          "1. <strong>Select any text</strong> in the paper on the left<br>" +
          "2. Click <strong>Explain</strong> to get a plain language explanation<br>" +
          "3. Or <strong>type any question</strong> about the paper below<br><br>" +
          "Let's start reading!",
          'welcome'
        );
      }, 800);
    }

    loadPDF(file);
  }

  function exitReaderMode() {
    readerScreen.style.display = 'none';
    uploadScreen.style.display = '';
    document.querySelector('.footer').style.display = '';
    var pricing = document.getElementById('aipPricing');
    if (pricing) pricing.style.display = '';
    pdfDoc = null; paperText = ''; chatHistory = []; messages = [];
    usageCounts = { explain: 0, translate: 0, rewrite: 0, questions: 0 };
    _cachedPages = [];
    // #7/#8/#9: Disconnect all observers on exit
    if (_flowObserver) _flowObserver.disconnect();
    if (_canvasObserver) { _canvasObserver.disconnect(); _canvasObserver = null; }
    if (_textLayerObserver) { _textLayerObserver.disconnect(); _textLayerObserver = null; }
    if (_resizeObs) _resizeObs.disconnect();
    pdfViewer.replaceChildren();
    // Reset panel flow — keep only welcome and indicator
    while (panelFlow.firstChild) panelFlow.removeChild(panelFlow.firstChild);
    panelFlow.appendChild(welcome);
    welcome.style.display = '';
    if (newMsgIndicator) panelFlow.appendChild(newMsgIndicator);
    fileInput.value = '';
    if (questionsLeft) questionsLeft.textContent = String(FREE_QUESTIONS_PER_PAPER);
    updateSendBtnState();
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
      pageInfo.textContent = i18n('aiPaper.page', 'Page') + ' 1 / ' + pdfDoc.numPages;
      paperText = await extractAllText(pdfDoc);
      pdfLoading.style.display = 'none';
      await fitWidthAndRender();
      pdfViewer.scrollTop = 0;
      incrementPapersUsed();
    } catch (err) {
      console.error('[AI Paper] PDF load error:', err);
      var msg = i18n('aiPaper.errors.loadFailed', 'Failed to load PDF.');
      if (err && err.message) {
        if (err.message.includes('password')) msg = i18n('aiPaper.errors.passwordProtected', 'This PDF is password-protected. Please use Unlock PDF first.');
        else if (err.message.includes('worker')) msg = i18n('aiPaper.errors.workerFailed', 'PDF.js failed to load. Please refresh the page.');
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
  var _canvasObserver = null; // IntersectionObserver for lazy canvas rendering

  async function renderAllPages() {
    var myVersion = ++_renderVersion;
    if (typeof hideSelectionUI === 'function') hideSelectionUI();
    pdfViewer.replaceChildren(); // #20: avoid innerHTML forced reflow
    setupCanvasObserver();
    setupTextLayerObserver();
    // Create lightweight placeholders for all pages (no canvas yet)
    for (var i = 1; i <= pdfDoc.numPages; i++) {
      if (_renderVersion !== myVersion) return;
      await createPagePlaceholder(i);
    }
  }

  /** Create an empty page div with correct dimensions but NO canvas rendering */
  async function createPagePlaceholder(num) {
    var page = await pdfDoc.getPage(num);
    var viewport = page.getViewport({ scale: currentScale });
    var w = Math.round(viewport.width);
    var h = Math.round(viewport.height);
    var pageDiv = document.createElement('div');
    pageDiv.className = 'page';
    pageDiv.dataset.pageNumber = num;
    pageDiv.style.width = w + 'px';
    pageDiv.style.height = h + 'px';
    pageDiv.style.background = '#fff';
    // Text layer container (rendered lazily by _textLayerObserver)
    var textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
    pageDiv.appendChild(textLayerDiv);
    pdfViewer.appendChild(pageDiv);
    _cachedPages.push(pageDiv); // update page cache
    // Observe for lazy canvas + textLayer rendering
    if (_canvasObserver) _canvasObserver.observe(pageDiv);
    if (_textLayerObserver) _textLayerObserver.observe(pageDiv);
  }

  /** Setup IntersectionObserver for lazy canvas rendering (2 pages margin) */
  function setupCanvasObserver() {
    if (_canvasObserver) _canvasObserver.disconnect();
    if (typeof IntersectionObserver === 'undefined') return;
    _canvasObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        var pageDiv = entry.target;
        if (entry.isIntersecting && !pageDiv._canvasRendered) {
          pageDiv._canvasRendered = true;
          renderCanvasForPage(pageDiv);
        } else if (!entry.isIntersecting && pageDiv._canvasRendered) {
          // Unload canvas to free memory when page leaves viewport
          unloadCanvas(pageDiv);
        }
      });
    }, { root: pdfViewer, rootMargin: '800px 0px' }); // preload ~2 pages ahead
  }

  /** Render canvas for a single page */
  async function renderCanvasForPage(pageDiv) {
    var num = parseInt(pageDiv.dataset.pageNumber);
    if (!pdfDoc || pageDiv.querySelector('canvas')) return;
    try {
      var page = await pdfDoc.getPage(num);
      var viewport = page.getViewport({ scale: currentScale });
      var w = Math.round(viewport.width);
      var h = Math.round(viewport.height);
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      pageDiv.insertBefore(canvas, pageDiv.firstChild);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    } catch (err) {
      // silently fail — placeholder div still shows correct dimensions
    }
  }

  /** Remove canvas from a page to free GPU/memory */
  function unloadCanvas(pageDiv) {
    var canvas = pageDiv.querySelector('canvas');
    if (canvas) {
      canvas.width = 0; canvas.height = 0; // release GPU memory
      canvas.remove();
    }
    pageDiv._canvasRendered = false;
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

  // Lazy textLayer: only render text spans when page is near viewport
  var _textLayerObserver = null;

  function setupTextLayerObserver() {
    if (_textLayerObserver) _textLayerObserver.disconnect();
    if (typeof IntersectionObserver === 'undefined') return;
    _textLayerObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !entry.target._textLayerRendered) {
          entry.target._textLayerRendered = true;
          renderTextLayerForPage(entry.target);
        }
      });
    }, { root: pdfViewer, rootMargin: '200px 0px' }); // preload 200px ahead
  }

  async function renderTextLayerForPage(pageDiv) {
    var num = parseInt(pageDiv.dataset.pageNumber);
    var textLayerDiv = pageDiv.querySelector('.textLayer');
    if (!textLayerDiv || !pdfDoc) return;
    try {
      var page = await pdfDoc.getPage(num);
      var viewport = page.getViewport({ scale: currentScale });
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
  }

  // renderPage is now split into createPagePlaceholder + renderCanvasForPage (lazy)

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
  var _resizeObs = null;
  if (pdfViewer && typeof ResizeObserver !== 'undefined') {
    _resizeObs = new ResizeObserver(function() {
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
    });
    _resizeObs.observe(pdfViewer);
  }

  // #4: Cache page elements array, update only when pages change
  var _cachedPages = [];
  function refreshPageCache() { _cachedPages = Array.from(pdfViewer.querySelectorAll('.page')); }

  if (pdfViewer) {
    var _scrollRAF = null;
    pdfViewer.addEventListener('scroll', () => {
      if (!pdfDoc || _scrollRAF) return;
      _scrollRAF = requestAnimationFrame(() => {
        _scrollRAF = null;
        if (!_cachedPages.length) refreshPageCache();
        var top = pdfViewer.scrollTop + 50;
        var cur = 1;
        for (var i = 0; i < _cachedPages.length; i++) {
          if (_cachedPages[i].offsetTop <= top) cur = parseInt(_cachedPages[i].dataset.pageNumber);
        }
        pageInfo.textContent = i18n('aiPaper.page', 'Page') + ' ' + cur + ' / ' + pdfDoc.numPages;
      });
    });
  }

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

  /** Position the floating toolbar near a bounding rect, avoiding screen edges */
  function positionToolbar(rect) {
    if (!floatToolbar || !rect) return;
    // Measure toolbar actual size (briefly show off-screen to measure)
    floatToolbar.style.left = '-9999px';
    floatToolbar.style.top = '-9999px';
    floatToolbar.style.display = 'flex';
    var tw = floatToolbar.offsetWidth || 300;
    var th = floatToolbar.offsetHeight || 44;
    var gap = 8;
    // Horizontal: centered on selection, clamped to viewport
    var left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(gap, Math.min(left, window.innerWidth - tw - gap));
    // Vertical: prefer above; if no room, show below
    var top = rect.top - th - gap;
    if (top < gap) top = rect.bottom + gap;
    // Also clamp bottom so toolbar doesn't go off-screen
    if (top + th > window.innerHeight - gap) top = window.innerHeight - th - gap;
    floatToolbar.style.left = left + 'px';
    floatToolbar.style.top = top + 'px';
  }

  function showSelectionUI() {
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    // Support cross-page selection: check either anchor or focus node is in PDF
    var inPdf = (sel.anchorNode && isNodeInPdf(sel.anchorNode)) || (sel.focusNode && isNodeInPdf(sel.focusNode));
    if (text.length > 3 && text.length < 5000 && inPdf && sel.rangeCount > 0) {
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      positionToolbar(rect);
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
        positionToolbar(newRange.getBoundingClientRect());
      }
    } catch (_) { /* range boundary error — ignore */ }
  }

  // #5: Throttle drag move with requestAnimationFrame
  var _dragRAF = null;
  document.addEventListener('mousemove', function(e) {
    if (!activeHandle) return;
    e.preventDefault();
    if (_dragRAF) return;
    _dragRAF = requestAnimationFrame(function() { _dragRAF = null; onHandleDragMove(e.clientX, e.clientY); });
  });
  document.addEventListener('touchmove', function(e) {
    if (!activeHandle || !e.touches.length) return;
    e.preventDefault();
    if (_dragRAF) return;
    var tx = e.touches[0].clientX, ty = e.touches[0].clientY;
    _dragRAF = requestAnimationFrame(function() { _dragRAF = null; onHandleDragMove(tx, ty); });
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

  // ─── Understanding Actions (chat bubble style) ───────────
  const ACTION_ICONS = { translate: '📖', explain: '💡', rewrite: '🔄' };
  const ACTION_LABELS = { translate: 'Translate', explain: 'Explain', rewrite: 'Rewrite' };

  async function handleUnderstandAction(action, selectedText) {
    if (!canUseAction(action)) { showLimitBanner(); return; }
    usageCounts[action]++;
    _userScrolledAway = false;

    // 1. Add user bubble showing the action + selected text snippet
    var icon = ACTION_ICONS[action] || '🔍';
    var snippet = selectedText.length > 200 ? selectedText.substring(0, 200) + '...' : selectedText;
    addChatBubble('user', icon + ' ' + (ACTION_LABELS[action] || action) + ': "' + snippet + '"', action);
    scrollFlowToBottom(true);

    // 2. Add AI "thinking" bubble
    var thinking = addThinkingBubble();
    scrollFlowToBottom(true);

    // 3. Call AI
    const lang = targetLangSel ? targetLangSel.value : 'zh';
    try {
      const result = await callAI(action, selectedText, lang, thinking.bubble, { paperContext: paperText.substring(0, 15000) });
      if (USE_MOCK && result) thinking.bubble.innerHTML = renderMarkdown(typeof result === 'string' ? result : '');
      // Update stored message content
      var stored = messages.find(m => m.id === thinking.wrapper.id);
      if (stored) { stored.content = thinking.bubble.textContent; stored.type = action; }
      chatHistory.push({ role: 'user', content: selectedText });
      chatHistory.push({ role: 'assistant', content: thinking.bubble.textContent });
    } catch (err) {
      thinking.bubble.innerHTML = '<p style="color:#E53E3E;">' + escapeHTML(err.message || 'Failed. Please try again.') + '</p>';
    }
    scrollFlowToBottom();
  }

  // ─── Summary / Terms (chat bubble style) ──────────────────
  if (summaryBtn) summaryBtn.addEventListener('click', generateSummary);
  if (termsBtn) termsBtn.addEventListener('click', generateTerms);

  async function generateSummary() {
    if (!paperText) return;
    _userScrolledAway = false;
    addChatBubble('user', '📋 Generate paper summary', 'summary');
    scrollFlowToBottom(true);
    var thinking = addThinkingBubble();
    scrollFlowToBottom(true);

    const lang = targetLangSel ? targetLangSel.value : 'zh';
    try {
      const result = await callAI('summary', paperText, lang, thinking.bubble);
      if (USE_MOCK && result) thinking.bubble.innerHTML = renderMarkdown(typeof result === 'string' ? result : '');
      var stored = messages.find(m => m.id === thinking.wrapper.id);
      if (stored) { stored.content = thinking.bubble.textContent; stored.type = 'summary'; }
    } catch (err) {
      thinking.bubble.innerHTML = '<p style="color:#E53E3E;">' + escapeHTML(err.message || 'Failed to generate summary.') + '</p>';
    }
    scrollFlowToBottom();
  }

  async function generateTerms() {
    if (!paperText) return;
    _userScrolledAway = false;
    addChatBubble('user', '📚 Extract key terms', 'terms');
    scrollFlowToBottom(true);
    var thinking = addThinkingBubble();
    scrollFlowToBottom(true);

    const lang = targetLangSel ? targetLangSel.value : 'zh';
    try {
      const result = await callAI('terms', paperText, lang);
      renderTermsIntoBubble(thinking.bubble, result);
      var stored = messages.find(m => m.id === thinking.wrapper.id);
      if (stored) { stored.content = thinking.bubble.textContent; stored.type = 'terms'; }
    } catch (err) {
      thinking.bubble.innerHTML = '<p style="color:#E53E3E;">' + escapeHTML(err.message || 'Failed to extract terms.') + '</p>';
    }
    scrollFlowToBottom();
  }

  function renderTermsIntoBubble(el, result) {
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
    // Shift+Enter = newline, Enter = send
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); }
    });
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 80) + 'px';
      updateSendBtnState();
    });
  }

  function updateSendBtnState() {
    if (chatSend) {
      chatSend.disabled = !(chatInput && chatInput.value.trim());
    }
  }
  updateSendBtnState(); // initial state

  async function handleChat() {
    const q = chatInput.value.trim();
    if (!q || !paperText) return;
    if (!canUseAction('questions')) { showLimitBanner(); return; }
    usageCounts.questions++;
    if (questionsLeft) questionsLeft.textContent = String(FREE_QUESTIONS_PER_PAPER - usageCounts.questions);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    updateSendBtnState();
    _userScrolledAway = false;

    // 1. User bubble
    addChatBubble('user', q, 'question');
    scrollFlowToBottom(true);

    // 2. AI thinking bubble
    var thinking = addThinkingBubble();
    scrollFlowToBottom(true);

    // 3. Call AI
    chatHistory.push({ role: 'user', content: q });
    const lang = targetLangSel ? targetLangSel.value : 'zh';
    try {
      const ans = await callAI('chat', paperText, lang, null, { question: q, chatHistory });
      const ansText = typeof ans === 'string' ? ans : 'No response.';
      chatHistory.push({ role: 'assistant', content: ansText });
      thinking.bubble.innerHTML = renderMarkdown(ansText);
      var stored = messages.find(m => m.id === thinking.wrapper.id);
      if (stored) { stored.content = ansText; stored.type = 'question'; }
    } catch (err) {
      thinking.bubble.innerHTML = '<p style="color:#E53E3E;">' + escapeHTML(err.message || 'Failed to get answer.') + '</p>';
    }
    scrollFlowToBottom();
  }

  // ─── Mobile Panel (move DOM, not copy) ───────────────────
  const bottomInput = document.querySelector('.aip-bottom-input');
  let _mobileOpen = false;

  function openMobilePanel() {
    if (!mobilePanel || !mobilePanelBody || _mobileOpen) return;
    _mobileOpen = true;
    // Move real DOM elements into mobile panel (keeps all event listeners alive)
    if (panelFlow) mobilePanelBody.appendChild(panelFlow);
    if (bottomInput) mobilePanelBody.appendChild(bottomInput);
    mobilePanel.style.display = 'flex';
    mobilePanel.classList.add('open');
    // Scroll to bottom of moved panel
    if (panelFlow) panelFlow.scrollTop = panelFlow.scrollHeight;
  }

  function closeMobilePanel() {
    if (!mobilePanel || !_mobileOpen) return;
    _mobileOpen = false;
    mobilePanel.classList.remove('open');
    mobilePanel.style.display = 'none';
    // Move DOM elements back to desktop AI panel
    if (panelFlow && aiPanel) aiPanel.insertBefore(panelFlow, aiPanel.querySelector('.aip-bottom-input') || null);
    if (bottomInput && aiPanel) aiPanel.appendChild(bottomInput);
  }

  if (mobileFab) mobileFab.addEventListener('click', openMobilePanel);
  if (mobilePanelClose) mobilePanelClose.addEventListener('click', closeMobilePanel);

  // ─── Export Notes ────────────────────────────────────────
  if (exportBtn) exportBtn.addEventListener('click', exportNotes);

  function exportNotes() {
    let content = '<h1>Paper Reading Notes</h1><hr>';
    for (const m of messages) {
      if (m.type === 'thinking') continue; // skip thinking placeholders
      var label = m.role === 'user' ? 'You' : 'AI';
      var color = m.role === 'user' ? '#6C5CE7' : '#333';
      var time = m.timestamp ? formatTime(m.timestamp) : '';
      content += '<div style="margin-bottom:1em;">';
      content += '<p style="font-weight:700;color:' + color + ';margin-bottom:2px;">' + label + ' <span style="font-weight:400;color:#999;font-size:0.85em;">' + time + '</span></p>';
      content += '<div style="padding:8px 12px;border-radius:8px;background:' + (m.role === 'user' ? '#F5F3FF' : '#F8F9FA') + ';">' + escapeHTML(m.content) + '</div>';
      content += '</div>';
    }
    const w = window.open('', '_blank');
    if (!w) { showToast(i18n('aiPaper.errors.allowPopups', 'Please allow popups to export notes.')); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Paper Notes</title><style>body{font-family:sans-serif;max-width:700px;margin:40px auto;line-height:1.8;color:#333;padding:0 20px}h1{font-size:1.5em}hr{border:none;border-top:1px solid #eee;margin:1.5em 0}</style></head><body>' + content + '<p style="text-align:center;color:#999;margin-top:3em;font-size:.9em;">Generated by PDFSlick AI Paper Reader</p></body></html>');
    w.document.close();
    w.print();
  }

  // ─── AI API ──────────────────────────────────────────────

  /** Build optimized paperContext: for explain/translate/rewrite, only send
   *  the selected text + nearby context (~3000 chars), not the full paper. */
  function buildPaperContext(selectedText) {
    if (!paperText || !selectedText) return '';
    var idx = paperText.indexOf(selectedText.substring(0, 80));
    if (idx < 0) return paperText.substring(0, 3000); // fallback
    var start = Math.max(0, idx - 500);
    var end = Math.min(paperText.length, idx + selectedText.length + 500);
    return paperText.substring(start, end);
  }

  /** Clean text for API: remove null bytes and control characters that break JSON */
  function cleanTextForAPI(str) {
    if (!str) return '';
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
  }

  async function callAI(task, text, lang, streamEl, extra) {
    if (USE_MOCK) return mockAI(task, text, lang, extra);

    // Optimize: send only relevant context, not full paper, for selection tasks
    var sendText = cleanTextForAPI(text);
    var sendExtra = Object.assign({}, extra || {});
    if (task === 'explain' || task === 'translate' || task === 'rewrite') {
      sendText = sendText.substring(0, 5000); // the selected text
      sendExtra.paperContext = cleanTextForAPI(buildPaperContext(text));
    } else if (task === 'summary' || task === 'terms' || task === 'chat') {
      sendText = sendText.substring(0, 15000); // paper text (truncated)
    }

    var body = { task: task, text: sendText, targetLang: lang };
    if (sendExtra.paperContext) body.paperContext = sendExtra.paperContext;
    if (sendExtra.question) body.question = cleanTextForAPI(sendExtra.question);
    if (sendExtra.chatHistory) body.chatHistory = sendExtra.chatHistory;

    if (streamEl) {
      try {
        return await callWorkerStream(body, streamEl);
      } catch (streamErr) {
        // Fallback to non-streaming if streaming fails (e.g. network issues)
        try {
          streamEl.innerHTML = '';
          var fallbackResult = await callWorker(body);
          if (fallbackResult) streamEl.innerHTML = renderMarkdown(typeof fallbackResult === 'string' ? fallbackResult : '');
          return fallbackResult;
        } catch (fallbackErr) {
          throw fallbackErr;
        }
      }
    }
    return callWorker(body);
  }

  /** Parse API error response for user-friendly message */
  function parseAPIError(status, data) {
    if (data && data.error) return data.error;
    if (status === 402) return 'API quota exhausted. Please try again later.';
    if (status === 429) return 'Too many requests. Please wait a moment and retry.';
    if (status === 401) return 'API key invalid.';
    if (status >= 500) return 'Server error. Please try again.';
    return 'Request failed (HTTP ' + status + ')';
  }

  async function callWorker(body) {
    body.stream = false;
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 30000);
    try {
      var res = await fetch(WORKER_URL + '/api/ai-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        var errData = {};
        try { errData = await res.json(); } catch {}
        throw new Error(parseAPIError(res.status, errData));
      }
      return (await res.json()).result;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('Request timed out (30s). Please try again.');
      throw err;
    }
  }

  async function callWorkerStream(body, el) {
    el.innerHTML = ''; el.classList.add('aip-typing-cursor');
    body.stream = true;
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 60000);
    try {
      var res = await fetch(WORKER_URL + '/api/ai-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        var errData = {};
        try { errData = await res.json(); } catch {}
        throw new Error(parseAPIError(res.status, errData));
      }
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var full = '', buf = '';
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          if (!ln.startsWith('data: ')) continue;
          var d = ln.slice(6).trim();
          if (d === '[DONE]') continue;
          try {
            var evt = JSON.parse(d);
            // OpenAI-compatible SSE format (DeepSeek)
            var delta = evt.choices && evt.choices[0] && evt.choices[0].delta;
            if (delta && delta.content) {
              full += delta.content;
              el.innerHTML = renderMarkdown(full);
            }
          } catch (e) { /* ignore malformed SSE line */ }
        }
      }
      el.classList.remove('aip-typing-cursor');
      return full;
    } catch (err) {
      el.classList.remove('aip-typing-cursor');
      if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.');
      if (err.message && err.message.includes('Failed to fetch')) throw new Error('Network error. Please check your connection and try again.');
      throw err;
    }
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

  // ─── Image & Table Detection (Overlays) ──────────────────

  const overlayMenu = document.getElementById('aipOverlayMenu');
  let _activeOverlayData = null; // { type, pageDiv, rect, imageData? }

  /** Detect images in a rendered PDF page using operator list */
  async function detectImagesOnPage(pageNum, pageDiv) {
    if (!pdfDoc) return;
    try {
      var page = await pdfDoc.getPage(pageNum);
      var ops = await page.getOperatorList();
      var viewport = page.getViewport({ scale: currentScale });
      var fnArray = ops.fnArray;
      var argsArray = ops.argsArray;

      // Track transform matrix through operator list
      var matrixStack = [];
      var currentMatrix = [1, 0, 0, 1, 0, 0];

      for (var i = 0; i < fnArray.length; i++) {
        var fn = fnArray[i];
        if (fn === pdfjsLib.OPS.save) {
          matrixStack.push(currentMatrix.slice());
        } else if (fn === pdfjsLib.OPS.restore) {
          if (matrixStack.length) currentMatrix = matrixStack.pop();
        } else if (fn === pdfjsLib.OPS.transform) {
          var m = argsArray[i];
          currentMatrix = multiplyMatrix(currentMatrix, m);
        } else if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) {
          var imgName = argsArray[i][0];
          // Calculate image bounding box in page coordinates
          var w = currentMatrix[0];
          var h = currentMatrix[3];
          var x = currentMatrix[4];
          var y = currentMatrix[5];

          // Transform to viewport coordinates
          var tx = viewport.convertToViewportPoint(x, y);
          var tx2 = viewport.convertToViewportPoint(x + w, y + h);
          var left = Math.min(tx[0], tx2[0]);
          var top = Math.min(tx[1], tx2[1]);
          var width = Math.abs(tx2[0] - tx[0]);
          var height = Math.abs(tx2[1] - tx[1]);

          // Skip very small images (icons, decorations)
          if (width < 50 || height < 50) continue;

          createOverlay(pageDiv, {
            type: 'image',
            left: left, top: top, width: width, height: height,
            imgName: imgName, pageNum: pageNum
          });
        }
      }
    } catch (err) {
      console.warn('[AI Paper] Image detection failed page ' + pageNum + ':', err);
    }
  }

  function multiplyMatrix(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5]
    ];
  }

  /** Detect tables by analyzing text item grid alignment */
  async function detectTablesOnPage(pageNum, pageDiv) {
    if (!pdfDoc) return;
    try {
      var page = await pdfDoc.getPage(pageNum);
      var viewport = page.getViewport({ scale: currentScale });
      var tc = await page.getTextContent();
      var items = tc.items.filter(function(it) { return it.str && it.str.trim(); });
      if (items.length < 6) return;

      // Convert items to viewport coordinates
      var positioned = items.map(function(it) {
        var tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
        return { x: tx[4], y: tx[5], str: it.str, w: it.width * currentScale, h: it.height * currentScale || 12 };
      });

      // Group by Y coordinate (rows) — tolerance 5px
      var rows = [];
      var used = new Set();
      for (var i = 0; i < positioned.length; i++) {
        if (used.has(i)) continue;
        var row = [positioned[i]];
        used.add(i);
        for (var j = i + 1; j < positioned.length; j++) {
          if (used.has(j)) continue;
          if (Math.abs(positioned[j].y - positioned[i].y) < 5) {
            row.push(positioned[j]);
            used.add(j);
          }
        }
        if (row.length >= 2) rows.push(row);
      }

      if (rows.length < 3) return; // Need at least 3 rows

      // Check column alignment: extract X positions, see if columns align
      var allX = [];
      rows.forEach(function(row) {
        row.forEach(function(item) { allX.push(Math.round(item.x / 10) * 10); });
      });
      var xCounts = {};
      allX.forEach(function(x) { xCounts[x] = (xCounts[x] || 0) + 1; });
      var columns = Object.keys(xCounts).filter(function(x) { return xCounts[x] >= 3; });

      if (columns.length < 2) return; // Need at least 2 columns

      // Calculate bounding box of the table region
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rows.forEach(function(row) {
        row.forEach(function(item) {
          minX = Math.min(minX, item.x);
          minY = Math.min(minY, item.y - (item.h || 12));
          maxX = Math.max(maxX, item.x + (item.w || 40));
          maxY = Math.max(maxY, item.y + 4);
        });
      });

      var padding = 8;
      createOverlay(pageDiv, {
        type: 'table',
        left: minX - padding, top: minY - padding,
        width: maxX - minX + padding * 2, height: maxY - minY + padding * 2,
        rows: rows, pageNum: pageNum
      });
    } catch (err) {
      console.warn('[AI Paper] Table detection failed page ' + pageNum + ':', err);
    }
  }

  /** Create a clickable overlay on a page */
  function createOverlay(pageDiv, data) {
    var el = document.createElement('div');
    el.className = 'aip-overlay aip-overlay--' + data.type;
    el.style.left = data.left + 'px';
    el.style.top = data.top + 'px';
    el.style.width = data.width + 'px';
    el.style.height = data.height + 'px';
    el.dataset.label = data.type === 'image' ? 'Image' : 'Table';
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      showOverlayMenu(el, data);
    });
    pageDiv.appendChild(el);
  }

  /** Show the action menu near an overlay */
  function showOverlayMenu(overlayEl, data) {
    if (!overlayMenu) return;
    _activeOverlayData = data;

    // Build menu items based on type
    var items = '';
    if (data.type === 'image') {
      items =
        '<button class="aip-overlay-menu-item" data-action="view-image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>View Full Size</button>' +
        '<button class="aip-overlay-menu-item" data-action="explain-image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Explain this Image</button>' +
        '<button class="aip-overlay-menu-item" data-action="download-image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download as PNG</button>';
    } else {
      items =
        '<button class="aip-overlay-menu-item" data-action="extract-table"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>Extract Table Data</button>' +
        '<button class="aip-overlay-menu-item" data-action="explain-table"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Explain this Table</button>' +
        '<button class="aip-overlay-menu-item" data-action="copy-markdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy as Markdown</button>';
    }
    overlayMenu.innerHTML = items;

    // Position menu below the overlay
    var rect = overlayEl.getBoundingClientRect();
    var menuLeft = rect.left;
    var menuTop = rect.bottom + 4;
    if (menuLeft + 180 > window.innerWidth) menuLeft = window.innerWidth - 190;
    if (menuTop + 150 > window.innerHeight) menuTop = rect.top - 150;
    overlayMenu.style.left = menuLeft + 'px';
    overlayMenu.style.top = menuTop + 'px';
    overlayMenu.classList.add('visible');

    // Bind actions
    overlayMenu.querySelectorAll('.aip-overlay-menu-item').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleOverlayAction(btn.dataset.action, data);
        hideOverlayMenu();
      });
    });
  }

  function hideOverlayMenu() {
    if (overlayMenu) overlayMenu.classList.remove('visible');
    _activeOverlayData = null;
  }

  // Close menu when clicking elsewhere
  document.addEventListener('click', function(e) {
    if (overlayMenu && !overlayMenu.contains(e.target)) hideOverlayMenu();
  });

  /** Handle overlay menu actions */
  async function handleOverlayAction(action, data) {
    if (action === 'view-image') {
      // Extract image from canvas and show in modal
      var canvas = extractImageCanvas(data);
      if (canvas) {
        var modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;cursor:pointer;';
        var img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        modal.appendChild(img);
        modal.addEventListener('click', function() { modal.remove(); });
        document.body.appendChild(modal);
      }
    } else if (action === 'download-image') {
      var canvas = extractImageCanvas(data);
      if (canvas) {
        var a = document.createElement('a');
        a.download = 'image-page' + data.pageNum + '.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      }
    } else if (action === 'explain-image' || action === 'explain-table') {
      hideWelcome();
      _userScrolledAway = false;
      var desc = action === 'explain-image'
        ? '[Image on page ' + data.pageNum + ']'
        : '[Table on page ' + data.pageNum + ']';
      var text = desc;
      if (data.rows) {
        text += '\n' + data.rows.map(function(row) {
          return row.map(function(it) { return it.str; }).join(' | ');
        }).join('\n');
      }
      handleUnderstandAction('explain', text);
    } else if (action === 'extract-table') {
      if (data.rows) {
        var text = data.rows.map(function(row) {
          return row.map(function(it) { return it.str; }).join('\t');
        }).join('\n');
        navigator.clipboard.writeText(text).then(function() {
          showToast('Table data copied to clipboard!');
        }).catch(function() {
          prompt('Copy table data:', text);
        });
      }
    } else if (action === 'copy-markdown') {
      if (data.rows) {
        var lines = data.rows.map(function(row) {
          return '| ' + row.map(function(it) { return it.str; }).join(' | ') + ' |';
        });
        // Add header separator after first row
        if (lines.length > 1) {
          var cols = data.rows[0].length;
          var sep = '| ' + Array(cols).fill('---').join(' | ') + ' |';
          lines.splice(1, 0, sep);
        }
        var md = lines.join('\n');
        navigator.clipboard.writeText(md).then(function() {
          showToast('Markdown table copied!');
        }).catch(function() {
          prompt('Copy Markdown:', md);
        });
      }
    }
  }

  /** Extract image region from page canvas */
  function extractImageCanvas(data) {
    var pageDiv = pdfViewer.querySelector('.page[data-page-number="' + data.pageNum + '"]');
    if (!pageDiv) return null;
    var srcCanvas = pageDiv.querySelector('canvas');
    if (!srcCanvas) return null;
    var dstCanvas = document.createElement('canvas');
    dstCanvas.width = Math.round(data.width);
    dstCanvas.height = Math.round(data.height);
    var ctx = dstCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, data.left, data.top, data.width, data.height, 0, 0, data.width, data.height);
    return dstCanvas;
  }

  /** Simple toast notification */
  function showToast(msg, type) {
    // Remove existing toast
    var old = document.querySelector('.aip-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'aip-toast';
    var bg = type === 'success' ? '#10B981' : type === 'error' ? '#E53E3E' : '#333';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;background:' + bg + ';color:#fff;border-radius:10px;font-size:13px;font-weight:500;font-family:var(--font-family);z-index:2000;animation:aipPopIn 0.25s ease;box-shadow:0 4px 16px rgba(0,0,0,0.15);max-width:90vw;text-align:center;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 3000);
  }

  // ─── Hook into renderCanvasForPage: detect images & tables after canvas renders ──
  var _origRenderCanvas = renderCanvasForPage;
  renderCanvasForPage = async function(pageDiv) {
    await _origRenderCanvas(pageDiv);
    var num = parseInt(pageDiv.dataset.pageNumber);
    if (num) {
      detectImagesOnPage(num, pageDiv);
      detectTablesOnPage(num, pageDiv);
    }
  };

  // ─── Waitlist Modal ──────────────────────────────────────
  var waitlistModal = document.getElementById('aipWaitlistModal');
  var waitlistClose = document.getElementById('aipWaitlistClose');
  var waitlistEmail = document.getElementById('aipWaitlistEmail');
  var waitlistSubmit = document.getElementById('aipWaitlistSubmit');

  document.querySelectorAll('.aip-waitlist-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (waitlistModal) waitlistModal.style.display = 'flex';
    });
  });

  if (waitlistClose) waitlistClose.addEventListener('click', function() {
    waitlistModal.style.display = 'none';
  });

  if (waitlistModal) {
    waitlistModal.querySelector('.aip-waitlist-modal-backdrop').addEventListener('click', function() {
      waitlistModal.style.display = 'none';
    });
  }

  if (waitlistSubmit) waitlistSubmit.addEventListener('click', function() {
    var email = waitlistEmail ? waitlistEmail.value.trim() : '';
    if (!email || !email.includes('@')) {
      showToast(i18n('aiPaper.errors.notPdf', 'Please enter a valid email.'));
      return;
    }
    // Store in localStorage
    var stored = [];
    try { stored = JSON.parse(localStorage.getItem('waitlist_emails') || '[]'); } catch (e) {}
    if (!stored.includes(email)) {
      stored.push(email);
      localStorage.setItem('waitlist_emails', JSON.stringify(stored));
    }
    waitlistModal.style.display = 'none';
    waitlistEmail.value = '';
    showToast("Thanks! We'll notify you when Pro launches.", 'success');
  });

  // ─── Debug ───────────────────────────────────────────────
  window.resetQuota = function () {
    localStorage.removeItem(getTodayKey());
    usageCounts = { explain: 0, translate: 0, rewrite: 0, questions: 0 };
    if (questionsLeft) questionsLeft.textContent = String(FREE_QUESTIONS_PER_PAPER);
    if (limitBanner) limitBanner.style.display = 'none';
    // quota reset complete
  };

})();

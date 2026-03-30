/**
 * pdf-to-word.js — PDF to Word (.docx) conversion
 * Extracts text from each PDF page via PDF.js, then builds a Word document
 * using the docx library. The .docx is generated entirely in the browser.
 *
 * Depends on: app.js, PDF.js (CDN), docx (CDN)
 *
 * CDN URLs expected in HTML:
 *   https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
 *   https://unpkg.com/docx@8.5.0/build/index.umd.js
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for app.js to initialize i18n
  await window.i18nReady;

  // ── PDF.js worker setup ──────────────────────────────────
  if (typeof pdfjsLib === 'undefined') {
    console.error('[pdf-to-word] PDF.js not loaded.');
  } else {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // ── State ────────────────────────────────────────────────
  let currentFile  = null;
  let docxBlobUrl  = null;
  let isConverting = false;

  // ── DOM references ───────────────────────────────────────
  const uploadZone        = document.getElementById('uploadZone');
  const fileInput         = document.getElementById('fileInput');
  const selectedFileInfo  = document.getElementById('selectedFileInfo');
  const selectedFileName  = document.getElementById('selectedFileName');
  const selectedFileSize  = document.getElementById('selectedFileSize');
  const selectedPageCount = document.getElementById('selectedPageCount');
  const conversionNote    = document.getElementById('conversionNote');
  const actionArea        = document.getElementById('actionArea');
  const convertBtn        = document.getElementById('convertBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar       = document.getElementById('progressBar');
  const progressPercent   = document.getElementById('progressPercent');
  const progressLabel     = document.getElementById('progressLabel');
  const progressDetail    = document.getElementById('progressDetail');
  const resultSection     = document.getElementById('resultSection');
  const resultMeta        = document.getElementById('resultMeta');
  const downloadBtn       = document.getElementById('downloadBtn');
  const removeFileBtn     = document.getElementById('removeFileBtn');
  const resetBtn          = document.getElementById('resetBtn');

  // ── Upload zone setup ────────────────────────────────────
  window.setupUploadZone('uploadZone', 'fileInput', onFileSelected, {
    multiple: false,
    accept: '.pdf,application/pdf',
  });

  // ── Buttons ──────────────────────────────────────────────
  if (convertBtn) convertBtn.addEventListener('click', convertToWord);
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
    revokeOldBlob();
    resetResult();
    loadFileInfo();
  }

  async function loadFileInfo() {
    if (!currentFile) return;

    // Show file info card
    if (selectedFileName) selectedFileName.textContent = currentFile.name;
    if (selectedFileSize) {
      selectedFileSize.innerHTML = window.formatFileSize(currentFile.size) +
        ' &middot; <span id="selectedPageCount">&mdash;</span> pages';
    }
    if (selectedFileInfo) selectedFileInfo.style.display = '';
    if (uploadZone)       uploadZone.style.display       = 'none';

    // Show conversion note and action area
    if (conversionNote) conversionNote.style.display = '';
    if (actionArea) actionArea.style.display = '';
    if (convertBtn) convertBtn.disabled = false;

    // Get page count via PDF.js
    try {
      const arrayBuffer = await window.readFileAsArrayBuffer(currentFile);
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const count = pdf.numPages;
      pdf.destroy();

      // Update the page count span
      const countEl = document.getElementById('selectedPageCount');
      if (countEl) countEl.textContent = count;
    } catch (err) {
      console.warn('[pdf-to-word] Could not read page count:', err);
    }
  }

  // ── Convert PDF to Word ──────────────────────────────────
  async function convertToWord() {
    if (!currentFile || isConverting) return;

    if (typeof pdfjsLib === 'undefined') {
      alert(window.t('common.libraryNotLoaded') || 'PDF.js not loaded. Please refresh the page.');
      return;
    }
    if (typeof docx === 'undefined') {
      alert('docx library not loaded. Please refresh the page.');
      return;
    }

    isConverting = true;
    if (convertBtn) convertBtn.disabled = true;
    revokeOldBlob();
    resetResult();

    showProgress(3, 'Loading PDF\u2026');

    try {
      const arrayBuffer = await window.readFileAsArrayBuffer(currentFile);
      const pdfData = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const numPages = pdf.numPages;

      showProgress(8, 'Extracting text\u2026');

      // Collect all paragraphs for the Word document
      const allChildren = [];
      let totalTextLength = 0;

      // First pass: collect all font sizes to determine body text size
      const fontSizeCounts = {};
      const allPageData = [];

      for (let i = 1; i <= numPages; i++) {
        const pct = Math.round(8 + ((i - 1) / numPages) * 40);
        showProgress(pct, `Extracting page ${i} of ${numPages}\u2026`);

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const items = textContent.items;

        if (items.length > 0) {
          const lines = groupTextIntoLines(items);
          const paragraphs = linesToParagraphs(lines);

          // Count font sizes (weighted by text length)
          paragraphs.forEach(p => {
            const rounded = Math.round(p.fontSize);
            fontSizeCounts[rounded] = (fontSizeCounts[rounded] || 0) + p.text.length;
          });

          allPageData.push({ paragraphs, pageIndex: i });
        } else {
          allPageData.push({ paragraphs: [], pageIndex: i });
        }

        page.cleanup();
      }

      // Determine the body font size (most common by text length)
      let bodyFontSize = 12;
      let maxCount = 0;
      for (const [size, count] of Object.entries(fontSizeCounts)) {
        if (count > maxCount) {
          maxCount = count;
          bodyFontSize = parseFloat(size);
        }
      }

      // Second pass: create docx paragraphs with heading detection
      for (let pi = 0; pi < allPageData.length; pi++) {
        const { paragraphs, pageIndex } = allPageData[pi];
        const pct = Math.round(50 + (pi / allPageData.length) * 33);
        showProgress(pct, `Building document\u2026`);

        if (paragraphs.length > 0) {
          paragraphs.forEach(para => {
            totalTextLength += para.text.length;
            const headingLevel = detectHeadingLevel(para.fontSize, bodyFontSize);

            if (headingLevel > 0) {
              // Heading paragraph
              allChildren.push(
                new docx.Paragraph({
                  heading: headingLevel === 1 ? docx.HeadingLevel.HEADING_1
                         : headingLevel === 2 ? docx.HeadingLevel.HEADING_2
                         : docx.HeadingLevel.HEADING_3,
                  children: [
                    new docx.TextRun({
                      text: para.text,
                      bold: true,
                      font: 'Calibri',
                    })
                  ],
                  spacing: { before: 240, after: 120 },
                })
              );
            } else {
              // Normal body paragraph
              allChildren.push(
                new docx.Paragraph({
                  children: [
                    new docx.TextRun({
                      text: para.text,
                      size: 24, // 12pt in half-points
                      font: 'Calibri',
                    })
                  ],
                  spacing: { after: 120 },
                })
              );
            }
          });
        } else {
          // Empty page — add a blank paragraph
          allChildren.push(new docx.Paragraph({ children: [] }));
        }

        // Add page break between pages (except after the last page)
        if (pageIndex < numPages) {
          allChildren.push(
            new docx.Paragraph({
              children: [new docx.PageBreak()],
            })
          );
        }
      }

      await pdf.destroy();

      // If no text was extracted at all, warn the user
      if (totalTextLength === 0) {
        hideProgress();
        isConverting = false;
        if (convertBtn) convertBtn.disabled = false;
        alert(
          window.t('pdfToWord.noTextWarning') ||
          'No text could be extracted from this PDF. It may be a scanned document (image-only PDF). This tool requires PDFs with selectable text.'
        );
        return;
      }

      showProgress(85, 'Creating Word document\u2026');

      // Build the docx Document
      const doc = new docx.Document({
        creator: 'PDFSlick',
        title: currentFile.name.replace(/\.pdf$/i, ''),
        description: 'Converted from PDF by PDFSlick',
        sections: [{
          properties: {
            page: {
              margin: {
                top: 1440,    // 1 inch in twips
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: allChildren,
        }],
      });

      showProgress(92, 'Generating DOCX file\u2026');

      // Pack to Blob
      const blob = await docx.Packer.toBlob(doc);

      showProgress(100, 'Done!');
      await sleep(400);
      hideProgress();

      // Create download URL
      docxBlobUrl = URL.createObjectURL(blob);

      // Set download attributes
      const outputName = currentFile.name.replace(/\.pdf$/i, '') + '.docx';
      if (downloadBtn) {
        downloadBtn.href = docxBlobUrl;
        downloadBtn.download = outputName;
      }

      // Show result
      if (resultMeta) {
        resultMeta.textContent =
          `${numPages} page${numPages === 1 ? '' : 's'} converted \u00B7 ${window.formatFileSize(blob.size)}`;
      }
      if (resultSection) {
        resultSection.style.display = '';

        // Build text preview from extracted paragraphs
        _showTextPreview(resultSection, allPageData, bodyFontSize, outputName);

        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

    } catch (err) {
      console.error('[pdf-to-word] Error:', err);
      hideProgress();
      alert('Error converting PDF: ' + err.message);
    } finally {
      isConverting = false;
      if (convertBtn) convertBtn.disabled = false;
    }
  }

  // ── Text extraction helpers ──────────────────────────────

  /**
   * Group PDF text items into lines based on Y coordinate.
   * PDF coordinates have origin at bottom-left, so we sort Y descending.
   * Items on the same line (within tolerance) are joined left-to-right.
   *
   * Returns an array of { y: number, text: string, fontSize: number }
   */
  function groupTextIntoLines(items) {
    if (!items.length) return [];

    // Sort by Y descending (top of page first), then X ascending
    const sorted = [...items].sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 2) return dy;
      return a.transform[4] - b.transform[4];
    });

    const lines = [];
    let currentLine = {
      y: sorted[0].transform[5],
      parts: [],
      fontSize: Math.abs(sorted[0].transform[0]) || 12,
    };

    sorted.forEach(item => {
      if (!item.str || !item.str.trim()) return;

      const itemY = item.transform[5];
      const itemFontSize = Math.abs(item.transform[0]) || 12;

      // Tolerance for "same line" based on font size
      const tolerance = Math.max(3, itemFontSize * 0.4);

      if (Math.abs(itemY - currentLine.y) > tolerance) {
        // Finish previous line
        if (currentLine.parts.length > 0) {
          lines.push({
            y: currentLine.y,
            text: joinLineParts(currentLine.parts),
            fontSize: currentLine.fontSize,
          });
        }
        currentLine = {
          y: itemY,
          parts: [],
          fontSize: itemFontSize,
        };
      }

      currentLine.parts.push({
        str: item.str,
        x: item.transform[4],
        width: item.width || 0,
      });
    });

    // Push the last line
    if (currentLine.parts.length > 0) {
      lines.push({
        y: currentLine.y,
        text: joinLineParts(currentLine.parts),
        fontSize: currentLine.fontSize,
      });
    }

    return lines;
  }

  /**
   * Join text parts within a single line. Inserts spaces between items
   * when there's a significant horizontal gap.
   */
  function joinLineParts(parts) {
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].str;

    // Sort by X position
    parts.sort((a, b) => a.x - b.x);

    let result = parts[0].str;
    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1];
      const curr = parts[i];
      const gap = curr.x - (prev.x + prev.width);

      // If there's a noticeable gap, add a space
      if (gap > 2) {
        result += ' ' + curr.str;
      } else {
        result += curr.str;
      }
    }

    return result;
  }

  /**
   * Merge extracted lines into paragraphs.
   * Lines that are closely spaced (within ~1.4x the font size) are considered
   * part of the same paragraph. Larger gaps create new paragraphs.
   *
   * Returns an array of { text: string, fontSize: number }
   */
  function linesToParagraphs(lines) {
    if (lines.length === 0) return [];

    const paragraphs = [];
    let currentPara = lines[0].text;
    let currentFontSize = lines[0].fontSize;

    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currLine = lines[i];

      // Gap between lines (Y decreases going down in PDF coords)
      const gap = prevLine.y - currLine.y;
      const avgFontSize = (prevLine.fontSize + currLine.fontSize) / 2;

      // Paragraph break threshold: ~1.6x line height
      const threshold = avgFontSize * 1.6;

      if (gap > threshold) {
        // New paragraph
        const trimmed = currentPara.trim();
        if (trimmed) paragraphs.push({ text: trimmed, fontSize: currentFontSize });
        currentPara = currLine.text;
        currentFontSize = currLine.fontSize;
      } else {
        // Same paragraph — append with space
        const trimmedCurrText = currLine.text.trim();
        if (trimmedCurrText) {
          // If prev line ends with a hyphen, join without space (dehyphenation)
          if (currentPara.endsWith('-')) {
            currentPara = currentPara.slice(0, -1) + trimmedCurrText;
          } else {
            currentPara += ' ' + trimmedCurrText;
          }
        }
      }
    }

    // Push last paragraph
    const trimmed = currentPara.trim();
    if (trimmed) paragraphs.push({ text: trimmed, fontSize: currentFontSize });

    return paragraphs;
  }

  /**
   * Detect heading level based on font size relative to body text.
   * Returns 0 for body text, 1-3 for heading levels.
   */
  function detectHeadingLevel(fontSize, bodyFontSize) {
    const ratio = fontSize / bodyFontSize;
    if (ratio >= 1.8) return 1; // H1: 80%+ larger than body
    if (ratio >= 1.4) return 2; // H2: 40-80% larger
    if (ratio >= 1.15) return 3; // H3: 15-40% larger
    return 0; // Body text
  }

  // ── Reset tool to initial state ──────────────────────────
  function resetTool() {
    currentFile = null;
    revokeOldBlob();
    if (selectedFileInfo) selectedFileInfo.style.display = 'none';
    if (uploadZone)       uploadZone.style.display       = '';
    if (conversionNote) conversionNote.style.display = 'none';
    if (actionArea) actionArea.style.display = 'none';
    if (convertBtn) convertBtn.disabled = true;
    hideProgress();
    resetResult();
    // Reset file input so same file can be re-selected
    if (fileInput) fileInput.value = '';
  }

  function resetResult() {
    if (resultSection) resultSection.style.display = 'none';
    if (resultMeta) resultMeta.textContent = '';
    if (downloadBtn) {
      downloadBtn.href = '#';
      downloadBtn.download = 'converted.docx';
    }
  }

  function revokeOldBlob() {
    if (docxBlobUrl) {
      URL.revokeObjectURL(docxBlobUrl);
      docxBlobUrl = null;
    }
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
    if (progressDetail) progressDetail.textContent = '';
  }

  // ── Text preview for DOCX output ─────────────────────────
  function _showTextPreview(container, allPageData, bodyFontSize, title) {
    // Remove any existing preview
    var existing = container.querySelector('.preview-section');
    if (existing) existing.remove();

    var section = document.createElement('div');
    section.className = 'preview-section';

    var headerHtml = '<div class="preview-header">' +
      '<span class="preview-title">' + window.escapeHtml(title || 'Preview') + '</span>' +
      '</div>';

    // Build preview content from extracted paragraphs
    var previewHtml = '<div style="padding:20px;max-height:500px;overflow-y:auto;' +
      'font-family:Calibri,sans-serif;font-size:14px;line-height:1.6;background:#fff;color:#333;">';

    allPageData.forEach(function (pageData, idx) {
      if (idx > 0) {
        previewHtml += '<hr style="border:none;border-top:1px dashed #ccc;margin:16px 0;">';
      }
      pageData.paragraphs.forEach(function (para) {
        var headingLevel = detectHeadingLevel(para.fontSize, bodyFontSize);
        var text = window.escapeHtml(para.text);
        if (headingLevel === 1) {
          previewHtml += '<h2 style="font-size:20px;font-weight:700;margin:12px 0 6px;">' + text + '</h2>';
        } else if (headingLevel === 2) {
          previewHtml += '<h3 style="font-size:17px;font-weight:700;margin:10px 0 5px;">' + text + '</h3>';
        } else if (headingLevel === 3) {
          previewHtml += '<h4 style="font-size:15px;font-weight:600;margin:8px 0 4px;">' + text + '</h4>';
        } else {
          previewHtml += '<p style="margin:4px 0;">' + text + '</p>';
        }
      });
    });
    previewHtml += '</div>';

    section.innerHTML = headerHtml + previewHtml;
    container.appendChild(section);
  }

  // ── Utility ──────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
});

/**
 * text-mapping.js - Google Lens-like interactive text selection & intelligent auto-mapping
 * 
 * Features:
 * 1. Overlays interactive bounding boxes on scanned book images (Google Lens style).
 * 2. Allows users to tap/select single or multi-word tokens and assign them to any of the 27 fields.
 * 3. AI Heuristic Parsing: Auto-detects Title, Authors, ISBN, Publisher, Edition, Year, Price, etc.
 */

import { EXCEL_COLUMNS_27, COLUMN_KEY_MAP } from './supabase.js';

export class GoogleLensMapper {
  constructor(containerElement, imageElement, overlayElement, popoverElement) {
    this.container = containerElement;
    this.image = imageElement;
    this.overlay = overlayElement;
    this.popover = popoverElement;
    this.currentWords = [];
    this.selectedWords = [];
    this.onFieldAssignedCallback = null;

    this.initPopover();
  }

  initPopover() {
    if (!this.popover) return;

    // Close popover when clicking outside
    document.addEventListener('click', (e) => {
      if (this.popover && !this.popover.contains(e.target) && !e.target.classList.contains('lens-word-token')) {
        this.hidePopover();
      }
    });
  }

  /**
   * Render Google Lens bounding box tokens over the rendered image
   */
  renderTokens(ocrResult, originalImageWidth, originalImageHeight) {
    if (!this.overlay || !this.image) return;

    this.overlay.innerHTML = '';
    this.currentWords = ocrResult.words || [];
    this.selectedWords = [];
    this.hidePopover();

    if (!this.currentWords.length) return;

    // Compute display scaling
    const rect = this.image.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    const scaleX = displayWidth / (originalImageWidth || displayWidth);
    const scaleY = displayHeight / (originalImageHeight || displayHeight);

    this.currentWords.forEach((wordObj, idx) => {
      const token = document.createElement('div');
      token.className = 'lens-word-token';
      token.dataset.index = idx;
      token.dataset.text = wordObj.text;
      token.title = wordObj.text;

      // Position token over word coordinates
      const left = (wordObj.bbox.x0 * scaleX);
      const top = (wordObj.bbox.y0 * scaleY);
      const width = (wordObj.bbox.width * scaleX);
      const height = (wordObj.bbox.height * scaleY);

      token.style.left = `${left}px`;
      token.style.top = `${top}px`;
      token.style.width = `${Math.max(width, 16)}px`;
      token.style.height = `${Math.max(height, 14)}px`;

      token.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleTokenClick(token, wordObj, e);
      });

      this.overlay.appendChild(token);
    });
  }

  handleTokenClick(tokenElement, wordObj, event) {
    const isMultiSelect = event.shiftKey || event.metaKey || event.ctrlKey;

    if (!isMultiSelect) {
      // Clear previous selections unless multi-selecting
      this.overlay.querySelectorAll('.lens-word-token.selected').forEach(t => t.classList.remove('selected'));
      this.selectedWords = [wordObj.text];
      tokenElement.classList.add('selected');
    } else {
      tokenElement.classList.toggle('selected');
      const text = wordObj.text;
      if (tokenElement.classList.contains('selected')) {
        this.selectedWords.push(text);
      } else {
        this.selectedWords = this.selectedWords.filter(w => w !== text);
      }
    }

    const selectedPhrase = this.selectedWords.join(' ');
    this.showPopover(selectedPhrase, tokenElement);
  }

  showPopover(text, anchorElement) {
    if (!this.popover || !anchorElement) return;

    const popoverTextEl = this.popover.querySelector('.lens-popover-text');
    if (popoverTextEl) {
      popoverTextEl.textContent = `"${text}"`;
    }

    const anchorRect = anchorElement.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    let top = anchorRect.bottom - containerRect.top + 8;
    let left = anchorRect.left - containerRect.left;

    // Bounds checking
    if (left + 230 > containerRect.width) {
      left = Math.max(8, containerRect.width - 240);
    }
    if (top + 160 > containerRect.height) {
      top = Math.max(8, anchorRect.top - containerRect.top - 170);
    }

    this.popover.style.top = `${top}px`;
    this.popover.style.left = `${left}px`;
    this.popover.classList.add('active');
  }

  hidePopover() {
    if (this.popover) {
      this.popover.classList.remove('active');
    }
  }

  assignSelectedTextToField(columnName) {
    const text = this.selectedWords.join(' ').trim();
    if (!text) return;

    if (this.onFieldAssignedCallback) {
      this.onFieldAssignedCallback(columnName, text);
    }

    this.hidePopover();
    this.overlay.querySelectorAll('.lens-word-token.selected').forEach(t => t.classList.remove('selected'));
    this.selectedWords = [];
  }

  /**
   * Smart AI/Heuristic mapping engine:
   * Parses raw extracted OCR text into the 27 standard columns automatically!
   */
  static autoMapText(rawText) {
    const result = {};
    if (!rawText) return result;

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const fullText = rawText.replace(/\r?\n/g, ' ');

    // 1. ISBN Detection (ISBN-10 or ISBN-13 with optional dashes or prefixes)
    const isbnRegex = /(?:ISBN(?:-1[03])?:?\s*)?(?=[0-9X]{10}|(?=(?:[0-9]+[-\s]){3,4})[0-9-\sX]{13,17})(?:97[89][-\s]?)?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9X]/i;
    const isbnMatch = fullText.match(isbnRegex);
    if (isbnMatch) {
      const cleanIsbn = isbnMatch[0].replace(/[^0-9X]/gi, '');
      if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
        result['ISBN'] = cleanIsbn;
      }
    }

    // 2. Publication Year Detection (4 digit years between 1800 and 2099, especially around copyright or published)
    const yearRegex = /(?:(?:copyright|©|\(c\)|published|year|edition|printed)\s*(?:in|:)?)?\s*\b(19\d{2}|20\d{2})\b/i;
    const yearMatch = fullText.match(yearRegex);
    if (yearMatch && yearMatch[1]) {
      result['Year'] = yearMatch[1];
    } else {
      // General 4 digit year fallback
      const generalYearMatch = fullText.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
      if (generalYearMatch) {
        result['Year'] = generalYearMatch[1];
      }
    }

    // 3. Edition Detection
    const editionRegex = /\b(1st|2nd|3rd|[4-9]th|first|second|third|fourth|fifth|revised|international|global|student|special)\s+edition\b/i;
    const editionMatch = fullText.match(editionRegex);
    if (editionMatch) {
      result['Edition'] = editionMatch[0].replace(/\b\w/g, c => c.toUpperCase());
    }

    // 4. Price Detection
    const priceRegex = /(?:[$€£₹]|Rs\.?|INR|USD)\s*([0-9]+(?:\.[0-9]{2})?)/i;
    const priceMatch = fullText.match(priceRegex);
    if (priceMatch) {
      result['Price'] = priceMatch[1];
    }

    // 5. Publisher Detection (heuristic matching well-known publishers or "Press", "Publishing", "Books")
    const publisherKeywords = [
      'Academic Press', 'Pearson', 'McGraw-Hill', 'McGraw Hill', 'O\'Reilly', 
      'Wiley', 'John Wiley & Sons', 'Springer', 'Cambridge University Press', 
      'Oxford University Press', 'MIT Press', 'Elsevier', 'Routledge', 
      'Prentice Hall', 'Cengage', 'Tech Books', 'CRC Press', 'Addison-Wesley',
      'Bloomsbury', 'Penguin', 'HarperCollins', 'Scholastic'
    ];
    for (const pub of publisherKeywords) {
      if (new RegExp(pub, 'i').test(fullText)) {
        result['Publisher'] = pub;
        break;
      }
    }
    if (!result['Publisher']) {
      const pubLineMatch = fullText.match(/(?:Publisher|Published by|Imprint):\s*([^,.\n]+)/i);
      if (pubLineMatch && pubLineMatch[1]) {
        result['Publisher'] = pubLineMatch[1].trim();
      }
    }

    // 6. Author Detection
    const authorPattern = /(?:by|author[s]?:\s*|written by\s*)([A-Z][a-zA-Z\s.,&]+?)(?=\n|publisher|edition|isbn|$)/i;
    const authorMatch = fullText.match(authorPattern);
    if (authorMatch && authorMatch[1]) {
      const authors = authorMatch[1].split(/,| and | & /).map(a => a.trim()).filter(a => a.length > 2 && a.length < 50);
      if (authors[0]) result['Author 1'] = authors[0];
      if (authors[1]) result['Auth 2'] = authors[1];
      if (authors[2]) result['Auth 3'] = authors[2];
    }

    // 7. Title Heuristics
    // Often the first or second prominent non-trivial line in book front matter
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i];
      // Skip if line looks like an author, ISBN, or generic header
      if (/isbn|copyright|edition|all rights|volume|printed/i.test(line)) continue;
      if (line.length > 4 && line.length < 120 && !result['Title']) {
        // Strip leading "Title:" if present
        result['Title'] = line.replace(/^Title:\s*/i, '').trim();
        break;
      }
    }

    // 8. Call No / DC Detection (Dewey Decimal or LC format like 005.133 or QA76.73)
    const callNoMatch = fullText.match(/\b(\d{3}(?:\.\d+)?\s+[A-Z]{2,4})\b/);
    if (callNoMatch) {
      result['Call No/DC'] = callNoMatch[1];
    }

    // 9. Default Metadata filling
    result['Date of Entry'] = new Date().toISOString().split('T')[0];
    result['Transfer Status (Internal/External)'] = 'Internal';

    return result;
  }
}

window.GoogleLensMapper = GoogleLensMapper;

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
    this.currentLines = [];
    this.selectedWords = [];
    this.onFieldAssignedCallback = null;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.currentMarquee = null;

    this.initPopover();
    this.initDragToSelect();
  }

  initDragToSelect() {
    if (!this.overlay) return;

    const startDrag = (clientX, clientY) => {
      const rect = this.overlay.getBoundingClientRect();
      this.isDragging = true;
      this.dragStart = {
        x: clientX - rect.left,
        y: clientY - rect.top
      };

      if (!this.currentMarquee) {
        this.currentMarquee = document.createElement('div');
        this.currentMarquee.className = 'lens-drag-marquee';
        this.overlay.appendChild(this.currentMarquee);
      }
      this.currentMarquee.style.left = `${this.dragStart.x}px`;
      this.currentMarquee.style.top = `${this.dragStart.y}px`;
      this.currentMarquee.style.width = '0px';
      this.currentMarquee.style.height = '0px';
      this.currentMarquee.style.display = 'block';
    };

    const moveDrag = (clientX, clientY) => {
      if (!this.isDragging || !this.currentMarquee) return;
      const rect = this.overlay.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const currentY = Math.max(0, Math.min(rect.height, clientY - rect.top));

      const left = Math.min(this.dragStart.x, currentX);
      const top = Math.min(this.dragStart.y, currentY);
      const width = Math.abs(currentX - this.dragStart.x);
      const height = Math.abs(currentY - this.dragStart.y);

      this.currentMarquee.style.left = `${left}px`;
      this.currentMarquee.style.top = `${top}px`;
      this.currentMarquee.style.width = `${width}px`;
      this.currentMarquee.style.height = `${height}px`;
    };

    const endDrag = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      if (!this.currentMarquee) return;

      const mRect = {
        left: parseFloat(this.currentMarquee.style.left) || 0,
        top: parseFloat(this.currentMarquee.style.top) || 0,
        width: parseFloat(this.currentMarquee.style.width) || 0,
        height: parseFloat(this.currentMarquee.style.height) || 0
      };

      this.currentMarquee.style.display = 'none';

      // Minimum selection threshold
      if (mRect.width > 24 && mRect.height > 14) {
        const selectedTokens = [];
        const tokenElements = this.overlay.querySelectorAll('.lens-word-token');
        tokenElements.forEach(el => {
          const tLeft = parseFloat(el.style.left) || 0;
          const tTop = parseFloat(el.style.top) || 0;
          const tWidth = parseFloat(el.style.width) || 0;
          const tHeight = parseFloat(el.style.height) || 0;

          // Check intersection
          if (
            tLeft < mRect.left + mRect.width &&
            tLeft + tWidth > mRect.left &&
            tTop < mRect.top + mRect.height &&
            tTop + tHeight > mRect.top
          ) {
            selectedTokens.push({
              text: el.dataset.text || '',
              top: tTop,
              left: tLeft
            });
          }
        });

        if (selectedTokens.length > 0) {
          // Sort top-to-bottom, left-to-right
          selectedTokens.sort((a, b) => {
            if (Math.abs(a.top - b.top) > 10) return a.top - b.top;
            return a.left - b.left;
          });
          const combinedText = selectedTokens.map(t => t.text).join(' ');
          this.highlightRegion(mRect.left, mRect.top, mRect.width, mRect.height);
          this.openImportModal(combinedText);
        }
      }
    };

    // Mouse events
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('lens-line-box') || e.target.classList.contains('lens-word-token')) return;
      startDrag(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) moveDrag(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', endDrag);

    // Touch events for mobile devices
    this.overlay.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (e.target.classList.contains('lens-line-box') || e.target.classList.contains('lens-word-token')) return;
      startDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    this.overlay.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const touch = e.touches[0];
      moveDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    this.overlay.addEventListener('touchend', endDrag);
  }

  highlightRegion(left, top, width, height) {
    this.clearSelectionHighlights();
    const box = document.createElement('div');
    box.className = 'lens-line-box active';
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    // Attach blue circular handles
    this.attachHandlesToElement(box);
    this.overlay.appendChild(box);
  }

  attachHandlesToElement(boxElement) {
    boxElement.querySelectorAll('.lens-handle').forEach(h => h.remove());

    const handleTL = document.createElement('div');
    handleTL.className = 'lens-handle top-left';
    const handleTR = document.createElement('div');
    handleTR.className = 'lens-handle top-right';
    const handleBL = document.createElement('div');
    handleBL.className = 'lens-handle bottom-left';
    const handleBR = document.createElement('div');
    handleBR.className = 'lens-handle bottom-right';

    boxElement.appendChild(handleTL);
    boxElement.appendChild(handleTR);
    boxElement.appendChild(handleBL);
    boxElement.appendChild(handleBR);
  }

  clearSelectionHighlights() {
    if (!this.overlay) return;
    this.overlay.querySelectorAll('.lens-line-box.active').forEach(b => {
      b.classList.remove('active');
      b.querySelectorAll('.lens-handle').forEach(h => h.remove());
    });
    this.overlay.querySelectorAll('.lens-word-token.selected').forEach(t => t.classList.remove('selected'));
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
   * Render Google Lens bounding box tokens & line boxes over the rendered image
   */
  renderTokens(ocrResult, originalImageWidth, originalImageHeight) {
    if (!this.overlay || !this.image) return;

    this.overlay.innerHTML = '';
    this.currentWords = ocrResult.words || [];
    this.currentLines = ocrResult.lines || [];
    this.selectedWords = [];
    this.hidePopover();

    if (!this.currentWords.length && !this.currentLines.length) return;

    // Compute display scaling
    const rect = this.image.getBoundingClientRect();
    const displayWidth = rect.width || this.image.clientWidth;
    const displayHeight = rect.height || this.image.clientHeight;

    const scaleX = displayWidth / (originalImageWidth || displayWidth);
    const scaleY = displayHeight / (originalImageHeight || displayHeight);

    // 1. Render Line-level Bounding Boxes (for full phrases like Title, Publisher, Author)
    if (this.currentLines && this.currentLines.length > 0) {
      this.currentLines.forEach((lineObj, idx) => {
        if (!lineObj.text || !lineObj.bbox) return;

        const lineBox = document.createElement('div');
        lineBox.className = 'lens-line-box';
        lineBox.dataset.lineIndex = idx;
        lineBox.dataset.text = lineObj.text;
        lineBox.title = `Click to select & import: "${lineObj.text}"`;

        const b = lineObj.bbox;
        const left = Math.max(0, b.x0 * scaleX);
        const top = Math.max(0, b.y0 * scaleY);
        const width = Math.max(20, (b.x1 - b.x0) * scaleX);
        const height = Math.max(16, (b.y1 - b.y0) * scaleY);

        lineBox.style.left = `${left}px`;
        lineBox.style.top = `${top}px`;
        lineBox.style.width = `${width}px`;
        lineBox.style.height = `${height}px`;

        lineBox.addEventListener('click', (e) => {
          e.stopPropagation();
          this.clearSelectionHighlights();
          lineBox.classList.add('active');
          this.attachHandlesToElement(lineBox);
          this.selectedWords = [lineObj.text];
          this.openImportModal(lineObj.text);
        });

        this.overlay.appendChild(lineBox);
      });
    }

    // 2. Render Word tokens
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
      this.clearSelectionHighlights();
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
    this.openImportModal(selectedPhrase);
    this.showPopover(selectedPhrase, tokenElement);
  }

  /**
   * Open the dedicated "Select Field & Import" Modal
   */
  openImportModal(text, suggestedField = null) {
    if (!text || !text.trim()) return;
    const cleanText = text.trim();

    const modal = document.getElementById('textImportModal');
    const textarea = document.getElementById('importModalSelectedText');
    const fieldSelect = document.getElementById('importModalTargetField');

    if (!modal || !textarea || !fieldSelect) {
      // Fallback to quick assignment prompt
      return;
    }

    textarea.value = cleanText;

    const targetField = suggestedField || this.guessFieldForText(cleanText);
    if (targetField) {
      fieldSelect.value = targetField;
    }

    modal.classList.add('active');

    // Wire confirm import button
    const confirmBtn = document.getElementById('confirmTextImportBtn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const finalText = textarea.value.trim();
        const chosenField = fieldSelect.value;
        if (finalText && chosenField) {
          if (this.onFieldAssignedCallback) {
            this.onFieldAssignedCallback(chosenField, finalText);
          }
          modal.classList.remove('active');
          window.app.showToast(`Imported to "${chosenField}"!`, 'success');
        }
      };
    }
  }

  /**
   * Intelligent heuristic guessing of target column for a text snippet
   */
  guessFieldForText(text) {
    if (!text) return 'Title';
    const clean = text.trim();

    // ISBN (10 or 13 digits with dashes or numbers)
    if (/(?:97[89][-\s]?)?[0-9]{1,5}[-\s]?[0-9]+[-\s]?[0-9]+[-\s]?[0-9X]/i.test(clean) && clean.replace(/[^0-9X]/gi, '').length >= 10) {
      return 'ISBN';
    }

    // Publication Year (4 digits 1900-2099)
    if (/^\b(19\d{2}|20\d{2})\b$/.test(clean)) {
      return 'Year';
    }

    // Edition
    if (/\b(?:1st|2nd|3rd|[4-9]th|first|second|third|revised|special|edition|ed\.)\b/i.test(clean)) {
      return 'Edition';
    }

    // Publisher (Publications, Press, Books, Imprint, or specific known publishers)
    if (/\b(?:publication|publisher|press|books|publishing|pearson|mcgraw|wiley|springer|r\.\s*publications)\b/i.test(clean)) {
      return 'Publisher';
    }

    // Publisher Place (Indian / International Cities)
    if (/\b(?:chennai|delhi|new delhi|mumbai|bengaluru|kolkata|london|new york|cambridge|boston)\b/i.test(clean)) {
      return 'Publisher Place';
    }

    // Department (Engineering branches, Academic departments)
    if (/\b(?:ece|cse|it|eee|mech|civil|branch|department|engineering|computer science|electronics)\b/i.test(clean)) {
      return 'Department';
    }

    // Author (starts with Dr., Prof., M., or contains author keywords)
    if (/\b(?:by|author|dr\.|prof\.|m\.\s*auxilia|john smith|boylestad)\b/i.test(clean) || (clean.split(/\s+/).length <= 4 && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(clean))) {
      return 'Author 1';
    }

    // Price
    if (/(?:[$€£₹]|rs\.?|inr|usd)\s*[0-9]+/i.test(clean)) {
      return 'Price';
    }

    // Call No / DC
    if (/\b(?:\d{3}(?:\.\d+)?\s+[A-Z]{2,4})\b/.test(clean)) {
      return 'Call No/DC';
    }

    // Default to Title
    return 'Title';
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
      'R. Publications', 'R.Publications', 'Charulatha Publications', 'Anuradha Publications',
      'Lakshmi Publications', 'Tata McGraw-Hill', 'McGraw Hill', 'S. Chand', 'Dhanpat Rai',
      'Khanna Publishers', 'Academic Press', 'Pearson', 'O\'Reilly', 'Wiley', 'John Wiley & Sons',
      'Springer', 'Cambridge University Press', 'Oxford University Press', 'MIT Press', 'Elsevier',
      'Routledge', 'Prentice Hall', 'Cengage', 'Tech Books', 'CRC Press', 'Addison-Wesley',
      'Bloomsbury', 'Penguin', 'HarperCollins', 'Scholastic'
    ];
    for (const pub of publisherKeywords) {
      if (new RegExp(pub.replace('.', '\\.'), 'i').test(fullText)) {
        result['Publisher'] = pub;
        break;
      }
    }
    if (!result['Publisher']) {
      const pubLineMatch = fullText.match(/(?:Publisher|Published by|Imprint):\s*([^,.\n]+)/i);
      if (pubLineMatch && pubLineMatch[1]) {
        result['Publisher'] = pubLineMatch[1].trim();
      } else {
        // Fallback: check for any line ending with Publications / Press / Books
        for (const line of lines) {
          if (/\b(?:Publications|Publishing|Press|Books)\b/i.test(line) && line.length < 50) {
            result['Publisher'] = line.replace(/\b(?:chennai|delhi|mumbai)\b/gi, '').trim();
            break;
          }
        }
      }
    }

    // 5.1 Publisher Place
    const cities = ['Chennai', 'New Delhi', 'Delhi', 'Mumbai', 'Bengaluru', 'Bangalore', 'Kolkata', 'Hyderabad', 'London', 'New York', 'Cambridge', 'Boston'];
    for (const city of cities) {
      if (new RegExp('\\b' + city + '\\b', 'i').test(fullText)) {
        result['Publisher Place'] = city;
        break;
      }
    }

    // 6. Department Detection (e.g., ECE, CSE, IT, EEE, Mechanical, Civil)
    if (/\b(?:ECE|Electronics\s*(?:and|&)\s*Communication)\b/i.test(fullText)) {
      result['Department'] = 'Electronics & Communication Engineering';
      result['Department Code'] = 'ECE';
    } else if (/\b(?:CSE|Computer Science)\b/i.test(fullText)) {
      result['Department'] = 'Computer Science & Engineering';
      result['Department Code'] = 'CSE';
    } else if (/\b(?:IT|Information Technology)\b/i.test(fullText)) {
      result['Department'] = 'Information Technology';
      result['Department Code'] = 'IT';
    } else if (/\b(?:EEE|Electrical\s*(?:and|&)\s*Electronics)\b/i.test(fullText)) {
      result['Department'] = 'Electrical & Electronics Engineering';
      result['Department Code'] = 'EEE';
    } else if (/\b(?:Mech|Mechanical)\b/i.test(fullText)) {
      result['Department'] = 'Mechanical Engineering';
      result['Department Code'] = 'MECH';
    } else if (/\b(?:Civil)\b/i.test(fullText)) {
      result['Department'] = 'Civil Engineering';
      result['Department Code'] = 'CIVIL';
    }

    // 7. Author Detection
    const authorPattern = /(?:by|author[s]?:\s*|written by\s*)([A-Z][a-zA-Z\s.,&]+?)(?=\n|publisher|edition|isbn|$)/i;
    const authorMatch = fullText.match(authorPattern);
    if (authorMatch && authorMatch[1]) {
      const authors = authorMatch[1].split(/,| and | & /).map(a => a.trim()).filter(a => a.length > 2 && a.length < 50);
      if (authors[0]) result['Author 1'] = authors[0];
      if (authors[1]) result['Auth 2'] = authors[1];
      if (authors[2]) result['Auth 3'] = authors[2];
    }
    // Specific author check for textbook covers like "M. AUXILIA"
    if (!result['Author 1']) {
      for (const line of lines) {
        // Skip publisher lines, cities, and boilerplate
        if (/isbn|copyright|edition|publications|publishing|publisher|press|books|chennai|delhi|mumbai|syllabus|anna university|semester/i.test(line)) continue;
        if (result['Publisher'] && line.toLowerCase().includes(result['Publisher'].toLowerCase())) continue;
        
        if (/^(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+[A-Za-z.\s]+$/i.test(line) && line.length < 40) {
          result['Author 1'] = line.trim();
          break;
        } else if (/^[A-Z]\.\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?$/i.test(line) && line.length < 35) {
          result['Author 1'] = line.trim();
          break;
        }
      }
    }

    // 8. Title Heuristics
    // Look for prominent subject / title line (all caps or prominent title casing)
    for (let i = 0; i < Math.min(lines.length, 6); i++) {
      const line = lines[i];
      // Skip boilerplate lines (syllabus, Anna Univ, author, publisher, semester)
      if (/isbn|copyright|edition|all rights|volume|printed|semester|branch|syllabus|anna university|question paper|solved/i.test(line)) continue;
      if (line.length >= 5 && line.length < 120 && !result['Title']) {
        result['Title'] = line.replace(/^Title:\s*/i, '').trim();
        break;
      }
    }

    // 9. Notes CD / Supplementary Book / Syllabus notes
    const syllabusMatch = fullText.match(/(?:Anna University|With Solved|Question Papers|Includes CD|CD-ROM)[^.\n]*/i);
    if (syllabusMatch) {
      result['Notes CD/Supplementary Book'] = syllabusMatch[0].trim();
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

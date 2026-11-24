/**
 * excel-import.js - SheetJS-powered Excel Import with Column Heading Detection
 * Compatible with "Donated book list 2026 Nov(1).xlsx" and all .xlsx / .xls formats.
 * Validates, handles duplicates, and provides an interactive import preview.
 */

import { EXCEL_COLUMNS_27, COLUMN_KEY_MAP, db } from './supabase.js';

export class ExcelImporter {
  constructor() {
    this.parsedRows = [];
    this.detectedHeaders = [];
    this.mappedRows = [];
  }

  /**
   * Normalize header string for resilient matching
   */
  static normalizeHeader(str) {
    if (!str) return '';
    return str.toString().trim().toLowerCase().replace(/[\s\-_/()]+/g, '');
  }

  /**
   * Parse an uploaded file (.xlsx / .xls)
   * @param {File} file 
   * @returns {Promise<{headers: Array, totalRows: number, previewRows: Array, mappedRows: Array, missingHeaders: Array}>}
   */
  async parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          if (!window.XLSX) {
            throw new Error('SheetJS (XLSX) library is not loaded.');
          }

          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });

          // Read Sheet1 or the first sheet
          const sheetName = workbook.SheetNames.includes('Sheet1') ? 'Sheet1' : workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          // Convert to JSON with raw header row
          const rawJson = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          if (!rawJson || rawJson.length < 2) {
            throw new Error('The uploaded Excel sheet contains no data rows or valid header.');
          }

          const fileHeaders = rawJson[0].map(h => (h !== undefined && h !== null) ? h.toString().trim() : '');
          const dataRows = rawJson.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));

          // Match each file header to our standard 27 columns
          const headerMapping = {}; // fileIndex -> standardColumnName
          const matchedStandardCols = new Set();

          fileHeaders.forEach((fh, idx) => {
            const normFh = ExcelImporter.normalizeHeader(fh);
            for (const stdCol of EXCEL_COLUMNS_27) {
              const normStd = ExcelImporter.normalizeHeader(stdCol);
              if (normFh === normStd || normFh.includes(normStd) || normStd.includes(normFh)) {
                headerMapping[idx] = stdCol;
                matchedStandardCols.add(stdCol);
                break;
              }
            }
          });

          const missingHeaders = EXCEL_COLUMNS_27.filter(col => !matchedStandardCols.has(col));

          // Fetch existing books to detect duplicates
          const existingBooks = await db.getAllBooks();
          const existingIsbns = new Set(existingBooks.map(b => b.isbn).filter(Boolean));
          const existingAccessNos = new Set(existingBooks.map(b => b.access_no).filter(Boolean));

          // Map rows to standard schema
          this.mappedRows = dataRows.map((row, rowIdx) => {
            const bookObj = {
              source: 'imported',
              verification_status: 'verified'
            };

            // Set default empty for all 27 columns
            EXCEL_COLUMNS_27.forEach(col => {
              const propKey = COLUMN_KEY_MAP[col];
              bookObj[propKey] = '';
            });

            // Map values from matching row indices
            row.forEach((cellVal, colIdx) => {
              const matchedCol = headerMapping[colIdx];
              if (matchedCol) {
                const propKey = COLUMN_KEY_MAP[matchedCol];
                let val = cellVal;

                // Handle Excel dates or timestamps
                if (val instanceof Date) {
                  val = val.toISOString().split('T')[0];
                } else if (typeof val === 'number' && (propKey === 'year' || propKey === 'price')) {
                  // Keep as number
                } else {
                  val = (val !== undefined && val !== null) ? val.toString().trim() : '';
                }

                bookObj[propKey] = val;
              }
            });

            // Default Title fallback if missing
            if (!bookObj.title) {
              bookObj.title = `Untitled Book (Row ${rowIdx + 2})`;
            }

            // Detect duplicates
            bookObj._isDuplicate = (
              (bookObj.isbn && existingIsbns.has(bookObj.isbn)) ||
              (bookObj.access_no && existingAccessNos.has(bookObj.access_no))
            );

            return bookObj;
          });

          this.detectedHeaders = fileHeaders;
          this.parsedRows = dataRows;

          resolve({
            headers: fileHeaders,
            totalRows: this.mappedRows.length,
            previewRows: this.mappedRows.slice(0, 10),
            mappedRows: this.mappedRows,
            missingHeaders: missingHeaders,
            duplicateCount: this.mappedRows.filter(r => r._isDuplicate).length
          });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read the selected file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Commit imported records to Supabase / Local storage
   * @param {boolean} skipDuplicates 
   * @param {Function} onProgress 
   */
  async commitImport(skipDuplicates = true, onProgress = () => {}) {
    let rowsToSave = this.mappedRows;

    if (skipDuplicates) {
      rowsToSave = rowsToSave.filter(r => !r._isDuplicate);
    }

    if (rowsToSave.length === 0) {
      return { count: 0, message: 'No new records to import.' };
    }

    // Clean internal helper flags
    const cleanedRows = rowsToSave.map(r => {
      const copy = { ...r };
      delete copy._isDuplicate;
      return copy;
    });

    onProgress(50, `Saving ${cleanedRows.length} records to database...`);
    await db.saveBatchBooks(cleanedRows);
    onProgress(100, 'Import completed successfully');

    return {
      count: cleanedRows.length,
      skipped: this.mappedRows.length - cleanedRows.length
    };
  }
}

export const excelImporter = new ExcelImporter();
window.excelImporter = excelImporter;

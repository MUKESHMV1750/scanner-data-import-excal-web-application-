/**
 * excel-export.js - Export book records to exact 27-column Excel (.xlsx) file
 * Matches "Donated book list 2026 Nov(1).xlsx" column structure and styling.
 * Supports: Export All, Export Selected, Export Filtered, and Template Download.
 */

import { EXCEL_COLUMNS_27, COLUMN_KEY_MAP, db } from './supabase.js';

export class ExcelExporter {
  /**
   * Convert an array of book objects to the exact 27-column row structure
   */
  static formatBooksForExcel(booksList) {
    return booksList.map((book, index) => {
      const row = {};

      EXCEL_COLUMNS_27.forEach(colName => {
        const propKey = COLUMN_KEY_MAP[colName];
        let val = book[propKey];

        // Format dates or empty defaults
        if (colName === 'Date of Entry' && !val) {
          val = book.created_at ? book.created_at.split('T')[0] : '';
        } else if (colName === 'Serial No' && !val) {
          val = `SN-${String(index + 1).padStart(4, '0')}`;
        }

        row[colName] = (val !== null && val !== undefined) ? val : '';
      });

      return row;
    });
  }

  /**
   * Generate and trigger browser download of .xlsx workbook
   * @param {Array} booksList 
   * @param {string} filename 
   */
  static exportToXlsx(booksList, filename = 'Donated_book_list_export.xlsx') {
    if (!window.XLSX) {
      throw new Error('SheetJS library is required for Excel export.');
    }

    const formattedData = ExcelExporter.formatBooksForExcel(booksList);

    // Create worksheet with ordered header columns
    const worksheet = window.XLSX.utils.json_to_sheet(formattedData, {
      header: EXCEL_COLUMNS_27
    });

    // Set column widths for polished presentation
    const colWidths = EXCEL_COLUMNS_27.map(col => {
      if (['Title', 'Notes CD/Supplementary Book', 'Keyword (650 -e relator term)'].includes(col)) {
        return { wch: 32 };
      }
      if (['Author 1', 'Publisher', 'Department', 'Subject-Code'].includes(col)) {
        return { wch: 22 };
      }
      return { wch: 16 };
    });
    worksheet['!cols'] = colWidths;

    // Create workbook with "Sheet1" exactly as in the template
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // Trigger download
    window.XLSX.writeFile(workbook, filename);
  }

  /**
   * Export all books currently in the database
   */
  static async exportAll() {
    const allBooks = await db.getAllBooks();
    const dateStr = new Date().toISOString().split('T')[0];
    ExcelExporter.exportToXlsx(allBooks, `Donated_book_list_${dateStr}.xlsx`);
    return allBooks.length;
  }

  /**
   * Export a subset of selected books
   */
  static exportSelected(selectedBooks) {
    if (!selectedBooks || selectedBooks.length === 0) {
      throw new Error('No books selected for export.');
    }
    const dateStr = new Date().toISOString().split('T')[0];
    ExcelExporter.exportToXlsx(selectedBooks, `Donated_books_selected_${dateStr}.xlsx`);
    return selectedBooks.length;
  }

  /**
   * Download a blank / sample template matching the exact 27 columns
   * with pre-filled sample rows so users can test import immediately!
   */
  static downloadSampleTemplate() {
    const sampleRows = [
      {
        "Fund Code": "FC-DON-2026",
        "Dept Transfer No": "TR-1001",
        "Access No": "ACC-9001",
        "Call No/DC": "005.133 JAV",
        "Title": "Core Java: Fundamentals Volume I",
        "Author 1": "Cay S. Horstmann",
        "Auth 2": "Gary Cornell",
        "Auth 3": "",
        "Auth Type ACEIT": "Faculty",
        "Notes CD/Supplementary Book": "Sample code CD-ROM included",
        "Collation": "xxiv, 928 p. : ill. ; 24 cm",
        "Price": 950.00,
        "Year": 2024,
        "Edition": "12th Edition",
        "Department": "Computer Science & Engineering",
        "Department Code": "CSE",
        "Section": "Reference Section",
        "Section Code": "REF",
        "Date of Entry": "2026-11-20",
        "ISBN": "9780137871070",
        "Publisher": "Prentice Hall",
        "Publisher Place": "Hoboken, NJ",
        "Transfer Status (Internal/External)": "Internal",
        "Subject-Code": "CSE-PROG-01",
        "Serial No": "SN-001",
        "Keyword (650 -e relator term)": "Java programming, OOP, Algorithms",
        "Location": "Shelf A-12, Tier 1"
      },
      {
        "Fund Code": "FC-LIB-2026",
        "Dept Transfer No": "TR-1002",
        "Access No": "ACC-9002",
        "Call No/DC": "621.3 MEA",
        "Title": "Electronic Instrumentation and Measurements",
        "Author 1": "David A. Bell",
        "Auth 2": "",
        "Auth 3": "",
        "Auth Type ACEIT": "Standard",
        "Notes CD/Supplementary Book": "Lab Experiments Manual attached",
        "Collation": "xvi, 451 p. ; 25 cm",
        "Price": 625.00,
        "Year": 2023,
        "Edition": "3rd Edition",
        "Department": "Electrical Engineering",
        "Department Code": "EE",
        "Section": "Circulation Section",
        "Section Code": "CIR",
        "Date of Entry": "2026-11-21",
        "ISBN": "9780195696141",
        "Publisher": "Oxford University Press",
        "Publisher Place": "New Delhi",
        "Transfer Status (Internal/External)": "Internal",
        "Subject-Code": "EE-INST-03",
        "Serial No": "SN-002",
        "Keyword (650 -e relator term)": "Instrumentation, Transducers, Signal conditioning",
        "Location": "Shelf D-04, Tier 3"
      }
    ];

    ExcelExporter.exportToXlsx(sampleRows, 'Donated book list 2026 Nov(1).xlsx');
  }
}

window.ExcelExporter = ExcelExporter;

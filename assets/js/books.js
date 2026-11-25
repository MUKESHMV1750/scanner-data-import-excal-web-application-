/**
 * books.js - Book Records Management (CRUD, Search, Filter, Pagination, Modal View/Edit)
 * Manages the records table displaying books with all 27 attributes.
 */

import { EXCEL_COLUMNS_27, COLUMN_KEY_MAP, db } from './supabase.js';
import { ExcelExporter } from './excel-export.js';

export class BooksManager {
  constructor(tableBodySelector, paginationSelector, searchInputSelector) {
    this.tableBody = document.querySelector(tableBodySelector);
    this.paginationContainer = document.querySelector(paginationSelector);
    this.searchInput = document.querySelector(searchInputSelector);

    this.allBooks = [];
    this.filteredBooks = [];
    this.selectedBookIds = new Set();

    this.currentPage = 1;
    this.pageSize = 10;
    this.activeFilter = {
      department: '',
      status: '',
      source: ''
    };

    this.initEvents();
  }

  initEvents() {
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.filterBooks(e.target.value);
      });
    }

    // Filter controls (Department, Status, Source)
    const filterDept = document.getElementById('filterDepartment');
    if (filterDept) {
      filterDept.addEventListener('change', (e) => {
        this.activeFilter.department = e.target.value;
        this.filterBooks(this.searchInput ? this.searchInput.value : '');
      });
    }

    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) {
      filterStatus.addEventListener('change', (e) => {
        this.activeFilter.status = e.target.value;
        this.filterBooks(this.searchInput ? this.searchInput.value : '');
      });
    }

    const filterSource = document.getElementById('filterSource');
    if (filterSource) {
      filterSource.addEventListener('change', (e) => {
        this.activeFilter.source = e.target.value;
        this.filterBooks(this.searchInput ? this.searchInput.value : '');
      });
    }

    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        if (this.searchInput) this.searchInput.value = '';
        if (filterDept) filterDept.value = '';
        if (filterStatus) filterStatus.value = '';
        if (filterSource) filterSource.value = '';
        this.activeFilter = { department: '', status: '', source: '' };
        this.filterBooks('');
        window.app.showToast('Filters reset to show all records', 'info');
      });
    }

    // Select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllBooks');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        this.selectedBookIds.clear();
        if (isChecked) {
          this.filteredBooks.forEach(b => this.selectedBookIds.add(b.id));
        }
        this.renderTable();
        this.updateSelectionToolbar();
      });
    }
  }

  async loadBooks() {
    this.allBooks = await db.getAllBooks();
    this.populateDepartmentFilter();
    this.filterBooks(this.searchInput ? this.searchInput.value : '');
  }

  populateDepartmentFilter() {
    const deptSelect = document.getElementById('filterDepartment');
    if (!deptSelect) return;

    const currentVal = deptSelect.value;
    const depts = Array.from(new Set(
      this.allBooks
        .map(b => (b.department || '').trim())
        .filter(Boolean)
    )).sort();

    deptSelect.innerHTML = '<option value="">🏛️ All Departments</option>' +
      depts.map(d => `<option value="${this.escapeHtml(d)}" ${d === currentVal ? 'selected' : ''}>${this.escapeHtml(d)}</option>`).join('');
  }

  filterBooks(searchTerm = '') {
    const term = searchTerm.toLowerCase().trim();

    this.filteredBooks = this.allBooks.filter(book => {
      // Search query across Title, Author, ISBN, Publisher, Call No, Access No
      const matchesSearch = !term || (
        (book.title && book.title.toLowerCase().includes(term)) ||
        (book.author_1 && book.author_1.toLowerCase().includes(term)) ||
        (book.isbn && book.isbn.toLowerCase().includes(term)) ||
        (book.publisher && book.publisher.toLowerCase().includes(term)) ||
        (book.access_no && book.access_no.toLowerCase().includes(term)) ||
        (book.call_no_dc && book.call_no_dc.toLowerCase().includes(term))
      );

      const matchesDept = !this.activeFilter.department || book.department === this.activeFilter.department;
      const matchesStatus = !this.activeFilter.status || book.verification_status === this.activeFilter.status;
      const matchesSource = !this.activeFilter.source || book.source === this.activeFilter.source;

      return matchesSearch && matchesDept && matchesStatus && matchesSource;
    });

    const filterCountEl = document.getElementById('filterStatsCount');
    if (filterCountEl) {
      if (this.filteredBooks.length !== this.allBooks.length) {
        filterCountEl.textContent = `Showing ${this.filteredBooks.length} of ${this.allBooks.length}`;
      } else {
        filterCountEl.textContent = `All ${this.allBooks.length} records`;
      }
    }

    this.currentPage = 1;
    this.renderTable();
    this.renderPagination();
    this.updateSelectionToolbar();
  }

  renderTable() {
    if (!this.tableBody) return;

    if (this.filteredBooks.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
            <div style="font-size: 32px; margin-bottom: 8px;">📚</div>
            <p style="font-weight: 600; font-size: 16px;">No books found</p>
            <p style="font-size: 13px;">Scan a new book or import your Excel file to populate records.</p>
          </td>
        </tr>
      `;
      return;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageBooks = this.filteredBooks.slice(startIndex, startIndex + this.pageSize);

    this.tableBody.innerHTML = pageBooks.map(book => {
      const isSelected = this.selectedBookIds.has(book.id);
      const statusBadge = book.verification_status === 'pending'
        ? '<span class="badge-tag tag-amber">Pending</span>'
        : '<span class="badge-tag tag-emerald">Verified</span>';

      return `
        <tr data-book-id="${book.id}">
          <td style="width: 40px;">
            <input type="checkbox" class="book-row-check" data-id="${book.id}" ${isSelected ? 'checked' : ''}>
          </td>
          <td style="font-weight: 600; font-family: monospace; font-size: 13px; color: var(--accent-teal);">
            ${book.access_no || '—'}
          </td>
          <td>
            <div class="book-title-cell">
              <div class="book-cover-thumb">
                ${book.scanned_image_url ? `<img src="${book.scanned_image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">` : '📖'}
              </div>
              <div>
                <div class="book-meta-primary">${this.escapeHtml(book.title)}</div>
                <div class="book-meta-sub">
                  ${book.author_1 ? `By ${this.escapeHtml(book.author_1)}` : 'Author unlisted'} 
                  ${book.edition ? `• ${this.escapeHtml(book.edition)}` : ''}
                </div>
              </div>
            </div>
          </td>
          <td style="font-family: monospace; font-size: 13px;">${book.isbn || '—'}</td>
          <td>${this.escapeHtml(book.publisher || '—')}</td>
          <td>${book.year || '—'}</td>
          <td>${this.escapeHtml(book.department || '—')}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="table-actions">
              <button class="action-icon-btn btn-view" title="View All 27 Fields" onclick="window.booksManager.openViewModal('${book.id}')">
                👁️
              </button>
              <button class="action-icon-btn btn-edit" title="Edit Book" onclick="window.booksManager.openEditModal('${book.id}')">
                ✏️
              </button>
              <button class="action-icon-btn btn-delete" title="Delete Book" onclick="window.booksManager.confirmDelete('${book.id}')">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row checkbox listeners
    this.tableBody.querySelectorAll('.book-row-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          this.selectedBookIds.add(id);
        } else {
          this.selectedBookIds.delete(id);
        }
        this.updateSelectionToolbar();
      });
    });
  }

  renderPagination() {
    if (!this.paginationContainer) return;

    const totalPages = Math.ceil(this.filteredBooks.length / this.pageSize) || 1;
    let buttons = '';

    buttons += `
      <button class="btn btn-secondary btn-sm" ${this.currentPage === 1 ? 'disabled' : ''} onclick="window.booksManager.goToPage(${this.currentPage - 1})">
        Previous
      </button>
    `;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= this.currentPage - 1 && p <= this.currentPage + 1)) {
        buttons += `
          <button class="btn btn-sm ${p === this.currentPage ? 'btn-primary' : 'btn-secondary'}" onclick="window.booksManager.goToPage(${p})">
            ${p}
          </button>
        `;
      } else if (p === this.currentPage - 2 || p === this.currentPage + 2) {
        buttons += `<span style="padding: 4px 8px; color: var(--text-muted);">...</span>`;
      }
    }

    buttons += `
      <button class="btn btn-secondary btn-sm" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="window.booksManager.goToPage(${this.currentPage + 1})">
        Next
      </button>
    `;

    this.paginationContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 10px;">
        <span style="font-size: 13px; color: var(--text-muted);">
          Showing ${Math.min((this.currentPage - 1) * this.pageSize + 1, this.filteredBooks.length)} to ${Math.min(this.currentPage * this.pageSize, this.filteredBooks.length)} of ${this.filteredBooks.length} records
        </span>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${buttons}
        </div>
      </div>
    `;
  }

  goToPage(pageNum) {
    const totalPages = Math.ceil(this.filteredBooks.length / this.pageSize) || 1;
    if (pageNum < 1 || pageNum > totalPages) return;
    this.currentPage = pageNum;
    this.renderTable();
    this.renderPagination();
    this.updateSelectionToolbar();
  }

  syncSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('selectAllBooks');
    if (!selectAllCheckbox) return;

    const visibleTotal = this.filteredBooks.length;
    const selectedCount = this.selectedBookIds.size;

    if (visibleTotal === 0 || selectedCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (selectedCount >= visibleTotal) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  updateSelectionToolbar() {
    const count = this.selectedBookIds.size;
    const toolbar = document.getElementById('selectedItemsToolbar');
    const countBadge = document.getElementById('selectedCountBadge');

    if (toolbar && countBadge) {
      if (count > 0) {
        toolbar.style.display = 'flex';
        countBadge.textContent = `${count} selected (out of ${this.filteredBooks.length} records)`;
      } else {
        toolbar.style.display = 'none';
      }
    }
    this.syncSelectAllCheckboxState();
  }

  deselectAll() {
    this.selectedBookIds.clear();
    this.renderTable();
    this.updateSelectionToolbar();
    window.app.showToast('Cleared all selections', 'info');
  }

  selectAllFiltered() {
    this.filteredBooks.forEach(b => this.selectedBookIds.add(b.id));
    this.renderTable();
    this.updateSelectionToolbar();
    window.app.showToast(`Selected all ${this.filteredBooks.length} records`, 'info');
  }

  async deleteSelectedBooks() {
    const count = this.selectedBookIds.size;
    if (count === 0) return;
    if (confirm(`Are you sure you want to delete ${count} selected book record(s)? This cannot be undone.`)) {
      for (const id of Array.from(this.selectedBookIds)) {
        await db.deleteBook(id);
      }
      this.selectedBookIds.clear();
      await this.loadBooks();
      window.app.refreshDashboard();
      window.app.showToast(`Deleted ${count} book record(s) successfully`, 'success');
    }
  }

  async markSelectedAsVerified() {
    const count = this.selectedBookIds.size;
    if (count === 0) return;
    for (const id of Array.from(this.selectedBookIds)) {
      const book = await db.getBookById(id);
      if (book) {
        book.verification_status = 'verified';
        await db.saveBook(book);
      }
    }
    this.selectedBookIds.clear();
    await this.loadBooks();
    window.app.refreshDashboard();
    window.app.showToast(`Marked ${count} selected book(s) as Verified`, 'success');
  }

  exportSelectedBooks() {
    const selected = this.allBooks.filter(b => this.selectedBookIds.has(b.id));
    if (selected.length === 0) {
      window.app.showToast('Please select books to export', 'warning');
      return;
    }
    ExcelExporter.exportSelected(selected);
    window.app.showToast(`Exported ${selected.length} books to Excel`, 'success');
  }

  exportFilteredBooks() {
    if (this.filteredBooks.length === 0) {
      window.app.showToast('No books in current view to export', 'warning');
      return;
    }
    ExcelExporter.exportSelected(this.filteredBooks);
    window.app.showToast(`Exported ${this.filteredBooks.length} records to Excel`, 'success');
  }

  async openViewModal(bookId) {
    const book = await db.getBookById(bookId);
    if (!book) return;

    const modal = document.getElementById('bookDetailsModal');
    const content = document.getElementById('bookDetailsModalContent');
    if (!modal || !content) return;

    // Render all 27 attributes in an organized grid
    const fieldCards = EXCEL_COLUMNS_27.map(col => {
      const propKey = COLUMN_KEY_MAP[col];
      const val = book[propKey] || '<span style="color: var(--text-muted); font-style: italic;">Not specified</span>';
      return `
        <div style="background: var(--bg-subtle); padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 4px;">
            ${col}
          </div>
          <div style="font-size: 14px; font-weight: 500; color: var(--text-main); word-break: break-word;">
            ${val}
          </div>
        </div>
      `;
    }).join('');

    content.innerHTML = `
      <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap;">
        ${book.scanned_image_url ? `
          <div style="width: 140px; height: 180px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); flex-shrink: 0;">
            <img src="${book.scanned_image_url}" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
        ` : ''}
        <div style="flex: 1; min-width: 240px;">
          <h2 style="font-size: 20px; color: var(--primary-navy); margin-bottom: 6px;">${this.escapeHtml(book.title)}</h2>
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 12px;">
            ${book.author_1 ? `by <strong>${this.escapeHtml(book.author_1)}</strong>` : ''}
            ${book.publisher ? `• ${this.escapeHtml(book.publisher)}` : ''}
            ${book.year ? `(${book.year})` : ''}
          </p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="badge-tag tag-teal">Source: ${book.source || 'Scanned'}</span>
            <span class="badge-tag ${book.verification_status === 'verified' ? 'tag-emerald' : 'tag-amber'}">
              Status: ${book.verification_status || 'Verified'}
            </span>
          </div>
        </div>
      </div>
      <h4 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--primary-navy); margin-bottom: 12px; font-weight: 700;">
        All 27 Excel Catalog Fields
      </h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px;">
        ${fieldCards}
      </div>
    `;

    modal.classList.add('active');
  }

  async openEditModal(bookId) {
    const book = await db.getBookById(bookId);
    if (!book) return;

    // Route to scanner/form view and prefill
    window.app.navigate('scanner');
    window.scannerApp.loadBookIntoForm(book);
    window.app.showToast('Book loaded into editor form', 'info');
  }

  async confirmDelete(bookId) {
    if (confirm('Are you sure you want to delete this book record? This action cannot be undone.')) {
      await db.deleteBook(bookId);
      this.selectedBookIds.delete(bookId);
      await this.loadBooks();
      window.app.refreshDashboard();
      window.app.showToast('Book record deleted successfully', 'success');
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

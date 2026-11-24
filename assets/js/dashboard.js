/**
 * dashboard.js - Summary metrics, recent books feed, and quick actions
 */

import { db } from './supabase.js';

export class DashboardController {
  constructor() {
    this.statTotalBooks = document.getElementById('statTotalBooks');
    this.statScanned = document.getElementById('statScanned');
    this.statPending = document.getElementById('statPending');
    this.statDepartments = document.getElementById('statDepartments');
    this.recentBooksTableBody = document.getElementById('recentBooksTableBody');
  }

  async loadDashboard() {
    const books = await db.getAllBooks();

    // 1. Calculate statistics
    const totalCount = books.length;
    const scannedCount = books.filter(b => b.source === 'scanned').length;
    const pendingCount = books.filter(b => b.verification_status === 'pending').length;

    const uniqueDepts = new Set(books.map(b => b.department).filter(Boolean));
    const deptsCount = uniqueDepts.size;

    // 2. Update stat cards
    if (this.statTotalBooks) this.statTotalBooks.textContent = totalCount;
    if (this.statScanned) this.statScanned.textContent = scannedCount;
    if (this.statPending) this.statPending.textContent = pendingCount;
    if (this.statDepartments) this.statDepartments.textContent = deptsCount;

    // 3. Render recent 5 scanned/entered books
    this.renderRecentBooks(books.slice(0, 5));
  }

  renderRecentBooks(recentBooks) {
    if (!this.recentBooksTableBody) return;

    if (recentBooks.length === 0) {
      this.recentBooksTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 28px; color: var(--text-muted);">
            No scanned books in records yet. Click "Start Scanning" to begin!
          </td>
        </tr>
      `;
      return;
    }

    this.recentBooksTableBody.innerHTML = recentBooks.map(book => {
      const statusBadge = book.verification_status === 'pending'
        ? '<span class="badge-tag tag-amber">Pending</span>'
        : '<span class="badge-tag tag-emerald">Verified</span>';

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 600; color: var(--accent-teal);">
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
                </div>
              </div>
            </div>
          </td>
          <td style="font-family: monospace; font-size: 13px;">${book.isbn || '—'}</td>
          <td>${this.escapeHtml(book.publisher || '—')}</td>
          <td>${book.year || '—'}</td>
          <td>${statusBadge}</td>
          <td>
            <div class="table-actions">
              <button class="action-icon-btn" title="View Full Details" onclick="window.booksManager.openViewModal('${book.id}')">
                👁️
              </button>
              <button class="action-icon-btn" title="Edit" onclick="window.booksManager.openEditModal('${book.id}')">
                ✏️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
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

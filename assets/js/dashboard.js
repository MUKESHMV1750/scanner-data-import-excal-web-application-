/**
 * dashboard.js - Summary metrics, recent books feed, and quick actions
 */

import { db } from './supabase.js';

export class DashboardController {
  constructor() {
    this.statHeroTotal = document.getElementById('statHeroTotal');
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
    if (this.statHeroTotal) this.statHeroTotal.textContent = totalCount;
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
          <td colspan="5" style="text-align: center; padding: 28px; color: var(--text-muted);">
            No books in records yet. Click "Scan Book" or "Import Excel" to begin!
          </td>
        </tr>
      `;
      return;
    }

    const avatarColors = ['#FEB47B', '#DDB9E8', '#6EE7B7', '#FDE047', '#93C5FD'];

    this.recentBooksTableBody.innerHTML = recentBooks.map((book, idx) => {
      const color = avatarColors[idx % avatarColors.length];
      const memberName = book.author_1 || 'Patron Reader';
      const initial = memberName.trim().charAt(0).toUpperCase() || '📖';
      const dateStr = book.date_of_entry || (book.created_at ? new Date(book.created_at).toLocaleDateString() : 'Active');

      return `
        <tr>
          <td>
            <div class="member-cell">
              <div class="member-avatar" style="background: ${color}; font-weight: 700; color: #111827;">${initial}</div>
              <span class="member-name">${this.escapeHtml(memberName)}</span>
            </div>
          </td>
          <td style="font-family: monospace; font-weight: 600;">
            ${this.escapeHtml(book.access_no || String(book.id).substring(0, 6))}
          </td>
          <td>
            <div class="book-title-text" title="${this.escapeHtml(book.title || 'Untitled')}">
              ${this.escapeHtml(book.title || 'Untitled')}
            </div>
          </td>
          <td class="book-return-date">
            ${this.escapeHtml(dateStr)}
          </td>
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

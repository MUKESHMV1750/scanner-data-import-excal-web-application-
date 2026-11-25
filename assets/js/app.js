/**
 * app.js - Main Application Orchestrator
 * Controls navigation routes, mobile bottom menu, toast notifications,
 * camera audio synthesis, Excel import/export triggers, and settings management.
 */

import { db, EXCEL_COLUMNS_27 } from './supabase.js';
import { DashboardController } from './dashboard.js';
import { ScannerController } from './scanner.js';
import { BooksManager } from './books.js';
import { excelImporter } from './excel-import.js';
import { ExcelExporter } from './excel-export.js';

class App {
  constructor() {
    this.currentRoute = 'dashboard';
    this.dashboardCtrl = null;
    this.scannerCtrl = null;
    this.booksMgr = null;
    this.audioCtx = null;
  }

  async init() {
    // 1. Initialize Sub-controllers
    this.dashboardCtrl = new DashboardController();
    this.scannerCtrl = new ScannerController();
    window.scannerApp = this.scannerCtrl;

    this.booksMgr = new BooksManager(
      '#booksTableBody',
      '#booksPagination',
      '#bookSearchInput'
    );
    window.booksManager = this.booksMgr;

    // 2. Initialize Navigation and Events
    this.initNavigation();
    this.initImportView();
    this.initSettingsView();
    this.initModals();
    this.updateStorageIndicator();

    // 3. Purge any demo sample books so ONLY user-entered data is shown
    await db.purgeSampleBooks();

    // 4. Load initial dashboard data
    await this.refreshDashboard();

    // Handle deep-link or hash route
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    this.navigate(hash);
  }

  initNavigation() {
    // Desktop Nav Items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const route = item.dataset.route;
        if (route) {
          e.preventDefault();
          this.navigate(route);
          // Close mobile sidebar if open
          document.getElementById('appSidebar').classList.remove('show');
        }
      });
    });

    // Mobile Bottom Nav Items
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const route = item.dataset.route;
        if (route) {
          e.preventDefault();
          this.navigate(route);
        }
      });
    });

    // Mobile Sidebar Toggle (Safe single handler)
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    if (mobileMenuBtn) {
      mobileMenuBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.toggleSidebar === 'function') {
          window.toggleSidebar();
        } else {
          const sidebar = document.getElementById('appSidebar');
          if (sidebar) sidebar.classList.toggle('show');
          if (sidebarBackdrop) sidebarBackdrop.classList.toggle('show');
        }
      };
    }

    if (sidebarBackdrop) {
      sidebarBackdrop.onclick = (e) => {
        e.preventDefault();
        if (typeof window.toggleSidebar === 'function') {
          window.toggleSidebar(false);
        } else {
          const sidebar = document.getElementById('appSidebar');
          if (sidebar) sidebar.classList.remove('show');
          sidebarBackdrop.classList.remove('show');
        }
      };
    }

    // Direct Quick-action buttons
    document.querySelectorAll('[data-action="navigate"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const route = btn.dataset.target;
        if (route) {
          e.preventDefault();
          this.navigate(route);
        }
      });
    });

    // Excel Export Triggers
    const exportAllBtn = document.getElementById('exportAllBooksBtn');
    if (exportAllBtn) {
      exportAllBtn.addEventListener('click', async () => {
        try {
          const count = await ExcelExporter.exportAll();
          this.showToast(`Exported ${count} books to .xlsx file!`, 'success');
        } catch (e) {
          this.showToast('Export failed: ' + e.message, 'error');
        }
      });
    }

    const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
    if (downloadTemplateBtn) {
      downloadTemplateBtn.addEventListener('click', () => {
        ExcelExporter.downloadSampleTemplate();
        this.showToast('Downloaded sample Excel template matching 27 columns', 'info');
      });
    }
  }

  navigate(route) {
    this.currentRoute = route;
    window.location.hash = route;

    // Update active nav links
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === route);
    });

    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === route);
    });

    // Toggle view sections
    document.querySelectorAll('.view-section').forEach(view => {
      view.classList.toggle('active', view.id === `view-${route}`);
    });

    // Close mobile drawer if open
    const sidebar = document.getElementById('appSidebar');
    if (sidebar) sidebar.classList.remove('show');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.classList.remove('show');

    // Route-specific lifecycle actions
    if (route === 'dashboard') {
      this.refreshDashboard();
      this.setPageTitle('Dashboard', 'Library Overview & Scanner Analytics');
      this.scannerCtrl.stopCamera();
    } else if (route === 'scanner') {
      this.setPageTitle('Mobile Book Scanner', 'Scan printed pages with camera and map to 27 Excel fields');
      this.scannerCtrl.startCamera();
      if (window.innerWidth <= 768 && typeof window.switchScannerMobileMode === 'function') {
        window.switchScannerMobileMode('camera');
      }
    } else if (route === 'books') {
      this.setPageTitle('Book Records', 'Manage, search, edit and verify stored book records');
      this.booksMgr.loadBooks();
      this.scannerCtrl.stopCamera();
    } else if (route === 'import') {
      this.setPageTitle('Import Excel', 'Upload Donated book list 2026 Nov(1).xlsx template');
      this.scannerCtrl.stopCamera();
    } else if (route === 'settings') {
      this.setPageTitle('Settings', 'Configure Supabase Database, Storage & Backup');
      this.scannerCtrl.stopCamera();
    }
  }

  setPageTitle(title, subtitle) {
    const titleEl = document.getElementById('topbarPageTitle');
    const subtitleEl = document.getElementById('topbarPageSubtitle');
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
  }

  async refreshDashboard() {
    await this.dashboardCtrl.loadDashboard();
  }

  initImportView() {
    const dropZone = document.getElementById('excelDropZone');
    const fileInput = document.getElementById('excelFileInput');
    const importPreviewSection = document.getElementById('importPreviewSection');
    const commitImportBtn = document.getElementById('commitImportBtn');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent-teal)';
      dropZone.style.backgroundColor = 'var(--accent-teal-soft)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
      dropZone.style.backgroundColor = '';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.backgroundColor = '';
      if (e.dataTransfer.files.length) {
        this.processExcelFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        this.processExcelFile(e.target.files[0]);
      }
    });

    if (commitImportBtn) {
      commitImportBtn.addEventListener('click', async () => {
        const skipDuplicates = document.getElementById('skipDuplicatesCheck')?.checked ?? true;
        try {
          commitImportBtn.disabled = true;
          commitImportBtn.textContent = 'Importing...';

          const result = await excelImporter.commitImport(skipDuplicates);
          this.showToast(`Successfully imported ${result.count} books! (${result.skipped} duplicates skipped)`, 'success');
          
          importPreviewSection.style.display = 'none';
          fileInput.value = '';
          await this.refreshDashboard();
          this.navigate('books');
        } catch (err) {
          this.showToast('Import failed: ' + err.message, 'error');
        } finally {
          commitImportBtn.disabled = false;
          commitImportBtn.textContent = 'Confirm & Import Records';
        }
      });
    }
  }

  async processExcelFile(file) {
    try {
      this.showToast('Reading Excel file...', 'info');
      const result = await excelImporter.parseExcelFile(file);

      const previewSection = document.getElementById('importPreviewSection');
      const totalCountSpan = document.getElementById('importTotalCount');
      const dupCountSpan = document.getElementById('importDupCount');
      const previewTableBody = document.getElementById('importPreviewTableBody');

      if (totalCountSpan) totalCountSpan.textContent = result.totalRows;
      if (dupCountSpan) dupCountSpan.textContent = result.duplicateCount;

      if (previewTableBody) {
        previewTableBody.innerHTML = result.previewRows.map(row => `
          <tr style="${row._isDuplicate ? 'background-color: #fffbeb;' : ''}">
            <td style="font-family: monospace; font-size: 13px;">${row.access_no || '—'}</td>
            <td style="font-weight: 600;">${row.title}</td>
            <td>${row.author_1 || '—'}</td>
            <td style="font-family: monospace;">${row.isbn || '—'}</td>
            <td>${row.publisher || '—'}</td>
            <td>${row.year || '—'}</td>
            <td>${row._isDuplicate ? '<span class="badge-tag tag-amber">Duplicate</span>' : '<span class="badge-tag tag-emerald">New</span>'}</td>
          </tr>
        `).join('');
      }

      previewSection.style.display = 'block';
      this.showToast(`Detected ${result.headers.length} columns and ${result.totalRows} book rows`, 'success');
    } catch (err) {
      this.showToast('Failed to process Excel file: ' + err.message, 'error');
    }
  }

  initSettingsView() {
    const saveBtn = document.getElementById('saveSupabaseSettingsBtn');
    const testBtn = document.getElementById('testSupabaseConnectionBtn');
    const urlInput = document.getElementById('supabaseUrlInput');
    const keyInput = document.getElementById('supabaseKeyInput');
    const feedbackBox = document.getElementById('supabaseStatusFeedback');
    const copySchemaBtn = document.getElementById('copySchemaSqlBtn');
    const clearDataBtn = document.getElementById('clearLocalDataBtn');
    const resetSampleDataBtn = document.getElementById('resetSampleDataBtn');

    const creds = db.getCredentials();
    if (urlInput) urlInput.value = creds.url;
    if (keyInput) keyInput.value = creds.key;

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        db.setCredentials(urlInput.value, keyInput.value);
        this.updateStorageIndicator();
        this.showToast('Supabase project settings saved!', 'success');
      });
    }

    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        try {
          testBtn.disabled = true;
          testBtn.textContent = 'Testing...';
          if (feedbackBox) feedbackBox.style.display = 'none';

          const result = await db.testConnection(urlInput.value, keyInput.value);
          if (result.tableReady) {
            this.showToast(result.message, 'success');
            if (feedbackBox) {
              feedbackBox.style.display = 'block';
              feedbackBox.style.background = '#ecfdf5';
              feedbackBox.style.color = '#065f46';
              feedbackBox.style.border = '1px solid #a7f3d0';
              feedbackBox.innerHTML = `<strong>✅ Connected Successfully!</strong> ${result.message}`;
            }
          } else {
            this.showToast(result.message, 'warning');
            if (feedbackBox) {
              feedbackBox.style.display = 'block';
              feedbackBox.style.background = '#fffbeb';
              feedbackBox.style.color = '#92400e';
              feedbackBox.style.border = '1px solid #fde68a';
              feedbackBox.innerHTML = `<strong>⚠️ Project Connected, Table Pending:</strong> ${result.message}`;
            }
          }
          this.updateStorageIndicator();
        } catch (e) {
          this.showToast('Connection failed: ' + e.message, 'error');
          if (feedbackBox) {
            feedbackBox.style.display = 'block';
            feedbackBox.style.background = '#fef2f2';
            feedbackBox.style.color = '#991b1b';
            feedbackBox.style.border = '1px solid #fecaca';
            feedbackBox.innerHTML = `<strong>❌ Connection Failed:</strong> ${e.message}`;
          }
        } finally {
          testBtn.disabled = false;
          testBtn.textContent = 'Test Connection';
        }
      });
    }

    if (copySchemaBtn) {
      copySchemaBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('supabase/database-schema.sql');
          if (!res.ok) throw new Error('Schema file not found');
          const sql = await res.text();
          await navigator.clipboard.writeText(sql);
          this.showToast('Database schema SQL copied to clipboard! Paste it into Supabase SQL Editor.', 'success');
        } catch (err) {
          this.showToast('Please open supabase/database-schema.sql to copy the SQL script.', 'info');
        }
      });
    }

    const removeSampleDataBtn = document.getElementById('removeSampleDataBtn');
    const copyRemoveSqlBtn = document.getElementById('copyRemoveSqlBtn');

    if (removeSampleDataBtn) {
      removeSampleDataBtn.addEventListener('click', async () => {
        try {
          removeSampleDataBtn.disabled = true;
          removeSampleDataBtn.textContent = '⏳ Removing sample data...';
          await db.purgeSampleBooks();
          await this.refreshDashboard();
          await this.booksMgr.loadBooks();
          this.showToast('All sample demo books removed! Only entered data is shown.', 'success');
        } catch (err) {
          console.error(err);
          this.showToast('Error removing sample data: ' + (err.message || 'Check connection'), 'error');
        } finally {
          removeSampleDataBtn.disabled = false;
          removeSampleDataBtn.textContent = '🗑️ Remove Sample Data';
        }
      });
    }

    if (copyRemoveSqlBtn) {
      copyRemoveSqlBtn.addEventListener('click', async () => {
        const removeSql = `-- ==============================================================================
-- Smart Book Scanner - Remove All Sample / Demo Data Script
-- ==============================================================================
DELETE FROM public.books 
WHERE access_no IN (
    'ACC-10492',
    'ACC-10493',
    'ACC-10494',
    'ACC-10495',
    'ACC-10496'
)
OR LOWER(title) IN (
    LOWER('Introduction to Data Science & Python Analytics'),
    LOWER('Modern Web Technology & Cloud Architecture'),
    LOWER('Principles of Digital Electronics and Embedded Systems'),
    LOWER('Digital Signal Processing: Fundamentals and Applications'),
    LOWER('Advanced Computer Aided Engineering and Simulation')
);
SELECT count(*) AS total_real_books FROM public.books;`;
        try {
          await navigator.clipboard.writeText(removeSql);
          this.showToast('Remove Sample SQL copied to clipboard! Paste and Run in Supabase SQL Editor.', 'success');
        } catch(e) {
          this.showToast('Please open supabase/remove-sample-books.sql to copy the SQL script.', 'info');
        }
      });
    }

    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all locally cached books?')) {
          db.saveLocalBooks([]);
          await this.refreshDashboard();
          await this.booksMgr.loadBooks();
          this.showToast('Local database cleared.', 'info');
        }
      });
    }

    if (resetSampleDataBtn) {
      resetSampleDataBtn.addEventListener('click', async () => {
        await db.purgeSampleBooks();
        await this.refreshDashboard();
        await this.booksMgr.loadBooks();
        this.showToast('Sample records cleared! Only real entered books are active.', 'info');
      });
    }
  }

  initModals() {
    // Close modal when clicking outside or on close buttons
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-close-btn') || e.target.closest('.modal-close-btn')) {
          modal.classList.remove('active');
        }
      });
    });
  }

  updateStorageIndicator() {
    const dot = document.getElementById('storageStatusDot');
    const text = document.getElementById('storageStatusText');
    if (dot && text) {
      if (db.isConfigured) {
        dot.className = 'status-dot';
        text.textContent = 'Supabase Cloud Connected';
      } else {
        dot.className = 'status-dot local';
        text.textContent = 'Local Database Mode';
      }
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  playShutterSound() {
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      // Synthesize realistic mechanical shutter click: high click + low body click
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }
}

// Instantiate and expose globally
window.app = new App();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});

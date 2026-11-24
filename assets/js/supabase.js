/**
 * supabase.js - Database & Storage abstraction layer
 * Supports Supabase PostgreSQL and Supabase Storage for book scans.
 * Includes a seamless LocalStorage / IndexedDB fallback engine so the app works
 * flawlessly offline or before Supabase credentials are configured.
 */

const STORAGE_KEYS = {
  SUPABASE_URL: 'book_scanner_supabase_url',
  SUPABASE_KEY: 'book_scanner_supabase_key',
  LOCAL_BOOKS: 'book_scanner_local_books_v1',
  LOCAL_SETTINGS: 'book_scanner_settings'
};

// 27 Standard Excel Columns matching the original template exactly
export const EXCEL_COLUMNS_27 = [
  "Fund Code",
  "Dept Transfer No",
  "Access No",
  "Call No/DC",
  "Title",
  "Author 1",
  "Auth 2",
  "Auth 3",
  "Auth Type ACEIT",
  "Notes CD/Supplementary Book",
  "Collation",
  "Price",
  "Year",
  "Edition",
  "Department",
  "Department Code",
  "Section",
  "Section Code",
  "Date of Entry",
  "ISBN",
  "Publisher",
  "Publisher Place",
  "Transfer Status (Internal/External)",
  "Subject-Code",
  "Serial No",
  "Keyword (650 -e relator term)",
  "Location"
];

// Mapping between 27 Excel column headers and database object property keys
export const COLUMN_KEY_MAP = {
  "Fund Code": "fund_code",
  "Dept Transfer No": "dept_transfer_no",
  "Access No": "access_no",
  "Call No/DC": "call_no_dc",
  "Title": "title",
  "Author 1": "author_1",
  "Auth 2": "auth_2",
  "Auth 3": "auth_3",
  "Auth Type ACEIT": "auth_type_aceit",
  "Notes CD/Supplementary Book": "notes_cd_supplementary_book",
  "Collation": "collation",
  "Price": "price",
  "Year": "year",
  "Edition": "edition",
  "Department": "department",
  "Department Code": "department_code",
  "Section": "section",
  "Section Code": "section_code",
  "Date of Entry": "date_of_entry",
  "ISBN": "isbn",
  "Publisher": "publisher",
  "Publisher Place": "publisher_place",
  "Transfer Status (Internal/External)": "transfer_status",
  "Subject-Code": "subject_code",
  "Serial No": "serial_no",
  "Keyword (650 -e relator term)": "keyword",
  "Location": "location"
};

class SupabaseService {
  constructor() {
    this.client = null;
    this.isConfigured = false;
    this.init();
  }

  init() {
    const url = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL);
    const key = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY);

    if (url && key && window.supabase) {
      try {
        this.client = window.supabase.createClient(url, key);
        this.isConfigured = true;
      } catch (err) {
        console.warn('Supabase initialization failed, running in Local Storage mode:', err);
        this.isConfigured = false;
      }
    } else {
      this.isConfigured = false;
    }

    // Initialize initial sample books if local storage is empty
    this.seedInitialLocalDataIfNeeded();
  }

  setCredentials(url, key) {
    if (url && key) {
      localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, url.trim());
      localStorage.setItem(STORAGE_KEYS.SUPABASE_KEY, key.trim());
      if (window.supabase) {
        this.client = window.supabase.createClient(url.trim(), key.trim());
        this.isConfigured = true;
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.SUPABASE_URL);
      localStorage.removeItem(STORAGE_KEYS.SUPABASE_KEY);
      this.client = null;
      this.isConfigured = false;
    }
  }

  getCredentials() {
    return {
      url: localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '',
      key: localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY) || ''
    };
  }

  async testConnection(url, key) {
    if (!window.supabase) {
      throw new Error('Supabase client SDK is not loaded.');
    }
    const testClient = window.supabase.createClient(url.trim(), key.trim());
    const { data, error } = await testClient.from('books').select('id').limit(1);
    if (error) {
      throw error;
    }
    return true;
  }

  // --- CRUD Operations for Books ---

  async getAllBooks() {
    if (this.isConfigured && this.client) {
      try {
        const { data, error } = await this.client
          .from('books')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.warn('Failed to fetch from Supabase, falling back to local books:', err);
      }
    }

    // Local Storage Mode
    return this.getLocalBooks();
  }

  async getBookById(id) {
    if (this.isConfigured && this.client) {
      try {
        const { data, error } = await this.client
          .from('books')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        return data;
      } catch (err) {
        console.warn('Error fetching book from Supabase:', err);
      }
    }

    const books = this.getLocalBooks();
    return books.find(b => b.id === id) || null;
  }

  async saveBook(bookData) {
    const record = {
      ...bookData,
      id: bookData.id || this.generateUUID(),
      created_at: bookData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      price: bookData.price ? Number(bookData.price) : null,
      year: bookData.year ? parseInt(bookData.year, 10) : null
    };

    if (this.isConfigured && this.client) {
      try {
        const { data, error } = await this.client
          .from('books')
          .upsert(record)
          .select()
          .single();
        if (error) throw error;
        return data;
      } catch (err) {
        console.warn('Supabase upsert failed, saving to local storage:', err);
      }
    }

    // Local Storage save
    const books = this.getLocalBooks();
    const existingIndex = books.findIndex(b => b.id === record.id);
    if (existingIndex >= 0) {
      books[existingIndex] = record;
    } else {
      books.unshift(record);
    }
    this.saveLocalBooks(books);
    return record;
  }

  async saveBatchBooks(booksList) {
    const formatted = booksList.map(b => ({
      ...b,
      id: b.id || this.generateUUID(),
      created_at: b.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      price: b.price ? Number(b.price) : null,
      year: b.year ? parseInt(b.year, 10) : null
    }));

    if (this.isConfigured && this.client) {
      try {
        const { data, error } = await this.client
          .from('books')
          .upsert(formatted);
        if (error) throw error;
        return formatted;
      } catch (err) {
        console.warn('Supabase batch save failed, storing locally:', err);
      }
    }

    const currentBooks = this.getLocalBooks();
    // Prepend new books
    const combined = [...formatted, ...currentBooks];
    this.saveLocalBooks(combined);
    return formatted;
  }

  async deleteBook(id) {
    if (this.isConfigured && this.client) {
      try {
        const { error } = await this.client
          .from('books')
          .delete()
          .eq('id', id);
        if (error) throw error;
        return true;
      } catch (err) {
        console.warn('Supabase delete failed, deleting locally:', err);
      }
    }

    const books = this.getLocalBooks().filter(b => b.id !== id);
    this.saveLocalBooks(books);
    return true;
  }

  async uploadScanImage(fileBlob, filename) {
    if (this.isConfigured && this.client) {
      try {
        const safeName = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = `scans/${new Date().getFullYear()}/${safeName}`;

        const { data, error } = await this.client.storage
          .from('book-scans')
          .upload(filePath, fileBlob, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (error) throw error;

        const { data: publicUrlData } = this.client.storage
          .from('book-scans')
          .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
      } catch (err) {
        console.warn('Supabase image upload failed, returning base64/blob URL:', err);
      }
    }

    // In local mode, return a data URL or blob URL
    return URL.createObjectURL(fileBlob);
  }

  // --- Local Storage Helpers ---

  getLocalBooks() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LOCAL_BOOKS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse local books:', e);
      return [];
    }
  }

  saveLocalBooks(books) {
    try {
      localStorage.setItem(STORAGE_KEYS.LOCAL_BOOKS, JSON.stringify(books));
    } catch (e) {
      console.error('Failed to write to local storage:', e);
    }
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  seedInitialLocalDataIfNeeded() {
    const existing = this.getLocalBooks();
    if (!existing || existing.length === 0) {
      const sampleBooks = [
        {
          id: this.generateUUID(),
          fund_code: "FC-LIB-2024",
          dept_transfer_no: "TR-0891",
          access_no: "ACC-10492",
          call_no_dc: "005.133 PY",
          title: "Introduction to Data Science & Python Analytics",
          author_1: "John Smith",
          auth_2: "Elena Vance",
          auth_3: "",
          auth_type_aceit: "Faculty",
          notes_cd_supplementary_book: "Includes Companion CD-ROM with datasets",
          collation: "xvi, 524 p. : ill. ; 24 cm",
          price: 850.00,
          year: 2024,
          edition: "3rd Edition",
          department: "Computer Science & Engineering",
          department_code: "CSE",
          section: "Reference Section",
          section_code: "REF",
          date_of_entry: "2026-11-20",
          isbn: "9781234567890",
          publisher: "Academic Press",
          publisher_place: "Cambridge, MA",
          transfer_status: "Internal",
          subject_code: "CS-DS-01",
          serial_no: "SN-2026-001",
          keyword: "Data science, Python programming, Machine Learning",
          location: "Shelf A-14, Tier 2",
          source: "scanned",
          verification_status: "verified",
          created_at: new Date(Date.now() - 3600000 * 24).toISOString()
        },
        {
          id: this.generateUUID(),
          fund_code: "FC-DON-2026",
          dept_transfer_no: "TR-0892",
          access_no: "ACC-10493",
          call_no_dc: "004.678 WEB",
          title: "Modern Web Technology & Cloud Architecture",
          author_1: "David K. Henderson",
          auth_2: "Sarah Miller",
          auth_3: "Rajesh Sharma",
          auth_type_aceit: "Donor",
          notes_cd_supplementary_book: "Online code repository access code enclosed",
          collation: "xx, 640 p. : col. ill. ; 26 cm",
          price: 1250.00,
          year: 2023,
          edition: "2nd Revised Edition",
          department: "Information Technology",
          department_code: "IT",
          section: "Circulation Section",
          section_code: "CIR",
          date_of_entry: "2026-11-21",
          isbn: "9781234567891",
          publisher: "Tech Books International",
          publisher_place: "London & New York",
          transfer_status: "Internal",
          subject_code: "IT-WEB-04",
          serial_no: "SN-2026-002",
          keyword: "Web development, Cloud computing, Microservices",
          location: "Shelf B-07, Tier 1",
          source: "imported",
          verification_status: "verified",
          created_at: new Date(Date.now() - 3600000 * 12).toISOString()
        },
        {
          id: this.generateUUID(),
          fund_code: "FC-LIB-2025",
          dept_transfer_no: "TR-0893",
          access_no: "ACC-10494",
          call_no_dc: "621.381 ELE",
          title: "Principles of Digital Electronics and Embedded Systems",
          author_1: "Robert L. Boylestad",
          auth_2: "Louis Nashelsky",
          auth_3: "",
          auth_type_aceit: "Standard",
          notes_cd_supplementary_book: "Lab manual booklet included",
          collation: "xv, 412 p. ; 24 cm",
          price: 799.00,
          year: 2022,
          edition: "11th Edition",
          department: "Electronics & Communication",
          department_code: "ECE",
          section: "Stack Section",
          section_code: "STK",
          date_of_entry: "2026-11-22",
          isbn: "9780132626927",
          publisher: "Pearson Education",
          publisher_place: "New Delhi",
          transfer_status: "Internal",
          subject_code: "ECE-DIG-02",
          serial_no: "SN-2026-003",
          keyword: "Electronics, Microcontrollers, VLSI, Digital logic",
          location: "Shelf C-03, Tier 3",
          source: "scanned",
          verification_status: "pending",
          created_at: new Date(Date.now() - 3600000 * 4).toISOString()
        }
      ];
      this.saveLocalBooks(sampleBooks);
    }
  }
}

export const db = new SupabaseService();
window.dbService = db;

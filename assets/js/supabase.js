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

// Known sample demo access numbers to exclude so only entered data is shown in database and dashboard
export const SAMPLE_ACCESS_NOS = ['ACC-10492', 'ACC-10493', 'ACC-10494', 'ACC-10495', 'ACC-10496'];

// Known sample demo titles to exclude
export const SAMPLE_TITLES = [
  'Introduction to Data Science & Python Analytics',
  'Modern Web Technology & Cloud Architecture',
  'Principles of Digital Electronics and Embedded Systems',
  'Digital Signal Processing: Fundamentals and Applications',
  'Advanced Computer Aided Engineering and Simulation'
];

/**
 * Check if a book record is one of the initial sample/demo books
 */
export function isSampleBook(book) {
  if (!book) return false;
  if (book.access_no && SAMPLE_ACCESS_NOS.includes(String(book.access_no).trim())) return true;
  if (book.title && SAMPLE_TITLES.some(t => t.toLowerCase() === String(book.title).trim().toLowerCase())) return true;
  return false;
}

export const DEFAULT_SUPABASE_CONFIG = {
  URL: 'https://bjmdxtrcbyttiokmjklo.supabase.co',
  KEY: 'sb_publishable_5puyuv7p3f5X6x1HbDwbyA_fE7v9Ivn'
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
    const creds = this.getCredentials();
    const url = creds.url;
    const key = creds.key;

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
    const storedUrl = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL);
    const storedKey = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY);
    return {
      url: storedUrl !== null ? storedUrl : DEFAULT_SUPABASE_CONFIG.URL,
      key: storedKey !== null ? storedKey : DEFAULT_SUPABASE_CONFIG.KEY
    };
  }

  async testConnection(url, key) {
    if (!window.supabase) {
      throw new Error('Supabase client SDK is not loaded.');
    }
    const cleanUrl = (url || '').trim();
    const cleanKey = (key || '').trim();
    if (!cleanUrl || !cleanKey) {
      throw new Error('Please provide both Supabase Project URL and Anon Key.');
    }

    const testClient = window.supabase.createClient(cleanUrl, cleanKey);
    try {
      const { data, error } = await testClient.from('books').select('id').limit(1);
      if (error) {
        // Table doesn't exist yet (PGRST205)
        if (error.code === 'PGRST205' || (error.message && error.message.includes('schema cache'))) {
          return {
            connected: true,
            tableReady: false,
            message: "Project connected! Table 'books' not found in schema. Please run supabase/database-schema.sql in your Supabase SQL Editor."
          };
        }
        throw error;
      }
      return {
        connected: true,
        tableReady: true,
        message: "Supabase connection successful! Table 'books' is active."
      };
    } catch (err) {
      if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        throw new Error('Could not connect to Supabase. Check your Project URL and network connection.');
      }
      throw err;
    }
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

        // Filter out sample demo records so ONLY real entered user data is shown
        const realData = (data || []).filter(b => !isSampleBook(b));
        return realData;
      } catch (err) {
        console.warn('Failed to fetch from Supabase, falling back to local books:', err);
      }
    }

    // Local Storage Mode (Filter out sample demo records)
    const localBooks = this.getLocalBooks();
    return localBooks.filter(b => !isSampleBook(b));
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
      const list = data ? JSON.parse(data) : [];
      return Array.isArray(list) ? list.filter(b => !isSampleBook(b)) : [];
    } catch (e) {
      console.error('Failed to parse local books:', e);
      return [];
    }
  }

  saveLocalBooks(books) {
    try {
      const cleanBooks = Array.isArray(books) ? books.filter(b => !isSampleBook(b)) : [];
      localStorage.setItem(STORAGE_KEYS.LOCAL_BOOKS, JSON.stringify(cleanBooks));
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

  getSampleBooks() {
    return [
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
      },
      {
        id: this.generateUUID(),
        fund_code: "FC-DON-2026",
        dept_transfer_no: "TR-0894",
        access_no: "ACC-10495",
        call_no_dc: "005.133 JAV",
        title: "Java: The Complete Reference",
        author_1: "Herbert Schildt",
        auth_2: "",
        auth_3: "",
        auth_type_aceit: "Faculty",
        notes_cd_supplementary_book: "Companion website access code included",
        collation: "xxiv, 1248 p. : ill. ; 24 cm",
        price: 950.00,
        year: 2023,
        edition: "12th Edition",
        department: "Computer Science & Engineering",
        department_code: "CSE",
        section: "Circulation Section",
        section_code: "CIR",
        date_of_entry: "2026-11-23",
        isbn: "9781260440232",
        publisher: "McGraw-Hill Education",
        publisher_place: "New York",
        transfer_status: "Internal",
        subject_code: "CS-JAVA-01",
        serial_no: "SN-2026-004",
        keyword: "Java, OOP, Programming, Streams, Multithreading",
        location: "Shelf A-10, Tier 1",
        source: "imported",
        verification_status: "verified",
        created_at: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        id: this.generateUUID(),
        fund_code: "FC-LIB-2024",
        dept_transfer_no: "TR-0895",
        access_no: "ACC-10496",
        call_no_dc: "620.004 CAD",
        title: "Machine Drawing and Computer Aided Design (CAD)",
        author_1: "K. L. Narayana",
        auth_2: "P. Kannaiah",
        auth_3: "K. Venkata Reddy",
        auth_type_aceit: "Standard",
        notes_cd_supplementary_book: "Blueprint drafting charts supplement",
        collation: "xii, 350 p. : ill. ; 28 cm",
        price: 650.00,
        year: 2021,
        edition: "5th Edition",
        department: "Mechanical Engineering",
        department_code: "ME",
        section: "Stack Section",
        section_code: "STK",
        date_of_entry: "2026-11-24",
        isbn: "9788122419177",
        publisher: "New Age International",
        publisher_place: "New Delhi",
        transfer_status: "Internal",
        subject_code: "ME-CAD-03",
        serial_no: "SN-2026-005",
        keyword: "CAD, Machine Drawing, Drafting, Solid Modeling",
        location: "Shelf D-05, Tier 2",
        source: "scanned",
        verification_status: "verified",
        created_at: new Date().toISOString()
      }
    ];
  }

  seedInitialLocalDataIfNeeded() {
    // Only real entered data should be stored; clean up any existing sample demo books
    try {
      const rawData = localStorage.getItem(STORAGE_KEYS.LOCAL_BOOKS);
      if (rawData) {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          const realBooks = parsed.filter(b => !isSampleBook(b));
          if (realBooks.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEYS.LOCAL_BOOKS, JSON.stringify(realBooks));
          }
        }
      }
    } catch (e) {}
  }

  async purgeSampleBooks() {
    // 1. Purge from local storage
    try {
      const rawData = localStorage.getItem(STORAGE_KEYS.LOCAL_BOOKS);
      if (rawData) {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          const realBooks = parsed.filter(b => !isSampleBook(b));
          localStorage.setItem(STORAGE_KEYS.LOCAL_BOOKS, JSON.stringify(realBooks));
        }
      }
    } catch (e) {}

    // 2. Purge from Supabase if connected
    if (this.isConfigured && this.client) {
      try {
        const { error } = await this.client
          .from('books')
          .delete()
          .in('access_no', SAMPLE_ACCESS_NOS);
        if (error) {
          console.warn('Supabase sample delete warning:', error);
        }
        for (const title of SAMPLE_TITLES) {
          await this.client
            .from('books')
            .delete()
            .eq('title', title);
        }
        console.log('Sample books successfully purged from Supabase.');
      } catch (err) {
        console.warn('Error purging sample books from Supabase:', err);
      }
    }
  }

  async seedSupabaseSampleData() {
    if (!this.client) {
      throw new Error('Supabase client is not connected. Please save credentials first.');
    }
    const sampleBooks = this.getSampleBooks();
    const cleanRows = sampleBooks.map(b => ({
      fund_code: b.fund_code || '',
      dept_transfer_no: b.dept_transfer_no || '',
      access_no: b.access_no || '',
      call_no_dc: b.call_no_dc || '',
      title: b.title,
      author_1: b.author_1 || '',
      auth_2: b.auth_2 || '',
      auth_3: b.auth_3 || '',
      auth_type_aceit: b.auth_type_aceit || '',
      notes_cd_supplementary_book: b.notes_cd_supplementary_book || '',
      collation: b.collation || '',
      price: b.price ? Number(b.price) : null,
      year: b.year ? parseInt(b.year, 10) : null,
      edition: b.edition || '',
      department: b.department || '',
      department_code: b.department_code || '',
      section: b.section || '',
      section_code: b.section_code || '',
      date_of_entry: b.date_of_entry || new Date().toISOString().split('T')[0],
      isbn: b.isbn || '',
      publisher: b.publisher || '',
      publisher_place: b.publisher_place || '',
      transfer_status: b.transfer_status || 'Internal',
      subject_code: b.subject_code || '',
      serial_no: b.serial_no || '',
      keyword: b.keyword || '',
      location: b.location || '',
      source: b.source || 'scanned',
      verification_status: b.verification_status || 'verified'
    }));

    const { data, error } = await this.client
      .from('books')
      .upsert(cleanRows, { onConflict: 'access_no' })
      .select();

    if (error) {
      console.error('Supabase seed error:', error);
      throw error;
    }

    return data;
  }
}

export const db = new SupabaseService();
window.dbService = db;

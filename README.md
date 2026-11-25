# Smart Book Content Scanner & Excel Data Management System

A mobile-friendly, modern academic web application designed to scan book content using a smartphone or web camera, extract text with Optical Character Recognition (OCR), select and map book details with a **Google Lens-like** interactive interface, and store data into a **27-column Excel catalog format** synced with **Supabase PostgreSQL & Storage**.

---

## 🌟 Key Features

1. **Mobile Book Scanner**:
   - Accesses device camera (`navigator.mediaDevices.getUserMedia`) with rear/front camera switching and torch toggle.
   - Built-in alignment framing box tailored for physical book title pages and copyright pages.
   - Realistic mechanical shutter sound effect synthesized via Web Audio API.
   - Image upload fallback for existing photos and document scans.

2. **Optical Character Recognition (OCR)**:
   - High-performance on-device text extraction via `Tesseract.js`.
   - Automatic canvas pre-processing (contrast stretch and greyscale) for crisp text detection on book paper.
   - Real-time recognition progress bar and status feed.

3. **Google Lens-Like Interactive Text Selection**:
   - Renders word-level bounding box tokens over the scanned book image.
   - Tap/click any word or drag across phrases to select.
   - Contextual popover allows 1-tap assignment to any of the 27 catalog fields (`Title`, `Author 1`, `ISBN`, `Publisher`, `Year`, `Edition`, `Call No`, `Price`, etc.).
   - Smart AI heuristic engine automatically extracts ISBN-10/13, publication year, author lines, and publisher keywords without manual typing.

4. **Exact 27-Column Excel Structure (Matching `Donated book list 2026 Nov(1).xlsx`)**:
   - All 27 standard columns supported across scanning, importing, editing, and exporting:
     1. `Fund Code`
     2. `Dept Transfer No`
     3. `Access No`
     4. `Call No/DC`
     5. `Title`
     6. `Author 1`
     7. `Auth 2`
     8. `Auth 3`
     9. `Auth Type ACEIT`
     10. `Notes CD/Supplementary Book`
     11. `Collation`
     12. `Price`
     13. `Year`
     14. `Edition`
     15. `Department`
     16. `Department Code`
     17. `Section`
     18. `Section Code`
     19. `Date of Entry`
     20. `ISBN`
     21. `Publisher`
     22. `Publisher Place`
     23. `Transfer Status (Internal/External)`
     24. `Subject-Code`
     25. `Serial No`
     26. `Keyword (650 -e relator term)`
     27. `Location`

5. **Existing Excel Import (SheetJS)**:
   - Direct drag-and-drop or file upload of `.xlsx` / `.xls` spreadsheets.
   - Automatic header detection matching the 27 columns.
   - Duplicate detection against existing database records (by ISBN and Access No).
   - Interactive preview table with row-by-row validation before committing.

6. **Excel Export**:
   - 1-click export of All Books, Selected Books, or Filtered Books to `.xlsx` formatted with the exact 27 column headers in standard order.
   - "Sample Template" download button to generate a clean, ready-to-use template.

7. **Supabase Cloud + Seamless Offline Fallback**:
   - Fully integrated with Supabase PostgreSQL and Supabase Storage (`book-scans` bucket).
   - Built-in Local Storage fallback: Works immediately out of the box with zero setup.
   - Includes production-ready SQL migration script (`supabase/database-schema.sql`) with Row-Level Security (RLS) policies.

---

## 📁 Project Structure

```
book-content-scanner/
├── index.html                      # Primary responsive SPA application
├── pages/
│   ├── dashboard.html              # Dashboard route wrapper
│   ├── scanner.html                # Scanner & Google Lens route wrapper
│   ├── book-details.html           # Catalog details wrapper
│   ├── books.html                  # Book records table wrapper
│   ├── import-excel.html           # Excel import wrapper
│   └── settings.html               # Supabase configuration wrapper
├── assets/
│   ├── css/
│   │   ├── style.css               # Core library design system & themes
│   │   ├── dashboard.css           # Metrics, hero banner & analytics
│   │   ├── scanner.css             # Camera viewfinder, OCR & Google Lens overlay
│   │   └── responsive.css          # Mobile bottom nav & responsive media queries
│   └── js/
│       ├── app.js                  # App orchestrator, router & toast system
│       ├── dashboard.js            # Dashboard metrics & recent scans
│       ├── scanner.js              # Camera stream, shutter, and form sync
│       ├── ocr.js                  # Tesseract OCR engine & image preprocessing
│       ├── text-mapping.js         # Google Lens interactive tokens & heuristics
│       ├── books.js                # Records management, search, filters & modals
│       ├── excel-import.js         # SheetJS Excel parsing & duplicate detection
│       ├── excel-export.js         # SheetJS 27-column Excel generator
│       └── supabase.js             # Supabase client + LocalStorage fallback
├── supabase/
│   └── database-schema.sql         # PostgreSQL schema, indexes & RLS policies
└── README.md                       # Documentation & deployment guide
```

---

## 🚀 How to Run the Application

### Option 1: Direct Browser Launch
1. Simply double-click `index.html` to open it in Google Chrome, Microsoft Edge, Firefox, or Safari.
2. Note: For mobile camera access via `getUserMedia()`, browsers require either `localhost` or an `HTTPS` connection.

### Option 2: Local HTTP Server (Recommended for Camera testing)
Run with any lightweight local static server:
```bash
# Using Python
python -m http.server 8080

# Using Node.js (npx)
npx serve -l 8080
```
Open your browser at `http://localhost:8080`.

### Option 3: Deploy to Netlify / Vercel
1. Drag and drop the project folder onto [Netlify Drop](https://app.netlify.com/drop) or push to GitHub and connect to Vercel.
2. You will instantly get a secure `https://your-app.netlify.app` URL with full mobile camera access enabled!

---

## 🗄️ Setting Up Supabase (Optional for Cloud Sync)

The application works completely offline using browser storage. If you want multi-device cloud synchronization:

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Open `supabase/database-schema.sql` from this project and click **Run**.
4. In the web app, go to **Supabase Settings** (in the sidebar or menu).
5. Enter your **Supabase URL** and **Anon Public Key**.
6. Click **Test Connection** followed by **Save Credentials**.

---

## 📖 Scanning Workflow

1. Navigate to **Scan Book (Lens)**.
2. Point your phone camera at a printed book title page or copyright page.
3. Tap the **Shutter button** (or upload an image).
4. The OCR engine will recognize all words and draw **Google Lens-like interactive boxes** over the image.
5. Tap **✨ Auto-Map Fields** to automatically populate Title, Author, ISBN, Publisher, Year, and Edition.
6. Tap any individual word box to manually assign or correct any field.
7. Click **💾 Save to Database** or **⏩ Save & Scan Next** to continue scanning!

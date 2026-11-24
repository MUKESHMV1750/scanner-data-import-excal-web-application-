-- ==============================================================================
-- Smart Book Content Scanner & Excel Data Management System
-- Supabase PostgreSQL Database Schema
-- Table: books (Contains all 27 standard Excel catalog columns)
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create books table
CREATE TABLE IF NOT EXISTS public.books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fund_code TEXT,
    dept_transfer_no TEXT,
    access_no TEXT UNIQUE,
    call_no_dc TEXT,
    title TEXT NOT NULL,
    author_1 TEXT,
    auth_2 TEXT,
    auth_3 TEXT,
    auth_type_aceit TEXT,
    notes_cd_supplementary_book TEXT,
    collation TEXT,
    price NUMERIC(10, 2),
    year INTEGER,
    edition TEXT,
    department TEXT,
    department_code TEXT,
    section TEXT,
    section_code TEXT,
    date_of_entry DATE DEFAULT CURRENT_DATE,
    isbn TEXT,
    publisher TEXT,
    publisher_place TEXT,
    transfer_status TEXT DEFAULT 'Internal',
    subject_code TEXT,
    serial_no TEXT,
    keyword TEXT,
    location TEXT,
    scanned_image_url TEXT,
    ocr_raw_text TEXT,
    source TEXT DEFAULT 'scanned', -- 'scanned', 'imported', 'manual'
    verification_status TEXT DEFAULT 'verified', -- 'pending', 'verified'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create helpful indexes for fast search and querying
CREATE INDEX IF NOT EXISTS idx_books_title ON public.books USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_books_isbn ON public.books(isbn);
CREATE INDEX IF NOT EXISTS idx_books_access_no ON public.books(access_no);
CREATE INDEX IF NOT EXISTS idx_books_author ON public.books(author_1);
CREATE INDEX IF NOT EXISTS idx_books_year ON public.books(year);
CREATE INDEX IF NOT EXISTS idx_books_dept ON public.books(department);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON public.books(created_at DESC);

-- Trigger for auto-updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_books_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_books_modtime ON public.books;
CREATE TRIGGER trigger_update_books_modtime
    BEFORE UPDATE ON public.books
    FOR EACH ROW
    EXECUTE FUNCTION update_books_modtime();

-- ==============================================================================
-- Row Level Security (RLS) Policies
-- ==============================================================================
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for anon client)
CREATE POLICY "Allow public read access" 
ON public.books FOR SELECT 
USING (true);

-- Allow public insert access
CREATE POLICY "Allow public insert access" 
ON public.books FOR INSERT 
WITH CHECK (true);

-- Allow public update access
CREATE POLICY "Allow public update access" 
ON public.books FOR UPDATE 
USING (true);

-- Allow public delete access
CREATE POLICY "Allow public delete access" 
ON public.books FOR DELETE 
USING (true);

-- ==============================================================================
-- Supabase Storage Bucket Setup (Run in SQL editor or create via dashboard)
-- Bucket Name: book-scans
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('book-scans', 'book-scans', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow public uploads to book-scans bucket
CREATE POLICY "Allow public uploads to book-scans" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'book-scans');

-- Policy to allow public view from book-scans bucket
CREATE POLICY "Allow public view from book-scans" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'book-scans');

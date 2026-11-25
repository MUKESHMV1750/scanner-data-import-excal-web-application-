-- ==============================================================================
-- Smart Book Scanner - Remove All Sample / Demo Data Script
-- Run this in your Supabase SQL Editor to remove sample records from public.books
-- Only your real entered / scanned data will remain!
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

-- Check remaining records (Only entered real records remain)
SELECT count(*) AS total_real_books FROM public.books;

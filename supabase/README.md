# Supabase Schema Notes

This folder holds the initial database schema for the IELTS app.

## What is included

- `profiles` for app-level user data mapped to Supabase Auth users
- `practice_sessions` for session history and answers
- `passages`, `questions`, and `scholarships` for public content
- `shortlists` and `cv_profiles` for user-owned scholarship data
- `user_section_accuracy` as a safe read-only view for progress tracking

## Why `profiles` instead of a custom `users` table

Supabase Auth already owns identity. The app profile table keeps RLS simple and lets us attach consent, device metadata, and app-specific flags without duplicating auth logic.

## Next step

Apply the SQL migration through the Supabase CLI or SQL editor, then connect the client to the tables one by one.

-- CRITICAL SECURITY FIX: Add missing RLS policies for practice_sessions and shortlists
-- Execute these commands in your Supabase SQL Editor immediately

-- Add missing DELETE policies for practice_sessions
DROP POLICY IF EXISTS "Users can only delete their own sessions" ON public.practice_sessions;
CREATE POLICY "Users can only delete their own sessions"
  ON public.practice_sessions
  FOR DELETE
  USING (auth.uid() = profile_id);

-- Add missing UPDATE policies for practice_sessions
DROP POLICY IF EXISTS "Users can only update their own sessions" ON public.practice_sessions;
CREATE POLICY "Users can only update their own sessions"
  ON public.practice_sessions
  FOR UPDATE
  USING (auth.uid() = profile_id);

-- Add missing DELETE policies for shortlists
DROP POLICY IF EXISTS "Users can only delete their own shortlists" ON public.shortlists;
CREATE POLICY "Users can only delete their own shortlists"
  ON public.shortlists
  FOR DELETE
  USING (auth.uid() = profile_id);

-- Add missing UPDATE policies for shortlists
DROP POLICY IF EXISTS "Users can only update their own shortlists" ON public.shortlists;
CREATE POLICY "Users can only update their own shortlists"
  ON public.shortlists
  FOR UPDATE
  USING (auth.uid() = profile_id);

-- Verification: Check that policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('practice_sessions', 'shortlists')
ORDER BY tablename, policyname;
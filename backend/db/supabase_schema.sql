-- Use and follow this schema exactly as provided by the user.

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  github_username     TEXT,
  github_token        TEXT,
  scanner_method      TEXT CHECK (scanner_method IN ('github', 'pdf', 'manual', 'combined')),
  scanner_completed   BOOLEAN DEFAULT FALSE,
  role                TEXT,
  level               TEXT CHECK (level IN ('Beginner', 'Intermediate', 'Advanced')),
  skill_scores        JSONB DEFAULT '{}',
  pace_factor         TEXT CHECK (pace_factor IN ('slow', 'normal', 'fast')),
  active_project_id   TEXT,
  xp_score            INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: users can only read/write their own profile
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, github_username)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'user_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function for the Nirmaan Studio automated logic
CREATE OR REPLACE FUNCTION increment_xp(user_id uuid, amount integer)
RETURNS void AS $$
  UPDATE public.user_profiles
  SET xp_score = xp_score + amount, updated_at = NOW()
  WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- STEP 1: Add jobs_cache table
CREATE TABLE IF NOT EXISTS public.jobs_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role        TEXT NOT NULL,
  results     JSONB NOT NULL DEFAULT '[]',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one cache row per role — upsert on role
CREATE UNIQUE INDEX IF NOT EXISTS jobs_cache_role_idx ON public.jobs_cache (role);

-- Service role can read/write (no RLS needed — backend only accesses this)
ALTER TABLE public.jobs_cache ENABLE ROW LEVEL SECURITY;

import { createBrowserClient } from '@supabase/ssr'

// Use this in any Client Component to interact with Supabase
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

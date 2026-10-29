import { createClient } from '@supabase/supabase-js';

// The project URL and publishable key are public by design (access is enforced
// by Supabase Auth and row-level security), so they are safe to bundle.
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set. See .env.example.');
}

export const supabase = createClient(url, publishableKey);

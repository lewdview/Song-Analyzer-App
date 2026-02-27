import { createClient } from '@jsr/supabase__supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_PROJECT_ID } from '@/config/api';

const SHARED_SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;

export const sharedSupabase = createClient(SHARED_SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type SharedProfile = {
  id: string;
  display_name: string | null;
  lab_access: boolean;
};

export async function fetchOwnSharedProfile(userId: string): Promise<SharedProfile | null> {
  const { data, error } = await sharedSupabase
    .from('profiles')
    .select('id, display_name, lab_access')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    id: String(data.id),
    display_name: typeof data.display_name === 'string' ? data.display_name : null,
    lab_access: Boolean(data.lab_access),
  };
}

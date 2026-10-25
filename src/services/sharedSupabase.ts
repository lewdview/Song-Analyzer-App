import { createClient } from '@jsr/supabase__supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_PROJECT_ID } from '@/config/api';
import { sharedAuthStorage } from './sharedAuthStorage';
import { setAccessToken } from './authToken';

const SHARED_SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;

// One session for every *.th3scr1b3.art site: the same storage key and shared
// cookie storage as the main site, PIM, the LRC layer and the user hub.
export const sharedSupabase = createClient(SHARED_SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'th3scr1b3-auth-token',
    storage: sharedAuthStorage(),
  },
});

// Keep the request helpers' token in step with the session.
void sharedSupabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
sharedSupabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));

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

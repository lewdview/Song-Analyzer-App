import { createClient } from '@jsr/supabase__supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_PROJECT_ID } from '@/config/api';

const SHARED_SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;

// Cross-subdomain cookie config so sessions persist across *.th3scr1b3.art
const getAuthOptions = () => {
  if (typeof window === 'undefined') return { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true };

  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  return {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'th3scr1b3-auth-token',
    cookieOptions: isLocalhost ? undefined : {
      domain: '.th3scr1b3.art',
      path: '/',
      sameSite: 'lax' as const,
      secure: true,
    }
  };
};

export const sharedSupabase = createClient(SHARED_SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: getAuthOptions()
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

import { useEffect, useState } from 'react';
import { sharedSupabase } from '@/services/sharedSupabase';

export const IDENTITY_HUB = 'https://user.th3scr1b3.art';

/** The hub signs people in and sends them back here; the shared cookie does the rest. */
export const signInUrl = () => `${IDENTITY_HUB}/?redirect_uri=${encodeURIComponent(window.location.href)}`;

export interface Account {
  status: 'loading' | 'ready';
  signedIn: boolean;
  /** May save analyses (public.is_admin()). */
  isAdmin: boolean;
  displayName: string;
}

type SessionUser = {
  is_anonymous?: boolean;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function nameFor(user: SessionUser | null): string {
  if (!user) return '';
  const m = user.user_metadata ?? {};
  const name = m.user_name || m.preferred_username || m.full_name || m.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return user.email ? user.email.split('@')[0] : 'Signed in';
}

/** The shared th3scr1b3.art login; a PIM guest (anonymous) session counts as signed out. */
export function useAccount(): Account {
  const [account, setAccount] = useState<Account>({ status: 'loading', signedIn: false, isAdmin: false, displayName: '' });

  useEffect(() => {
    let cancelled = false;
    const apply = (user: SessionUser | null) => {
      const signedIn = !!user && !user.is_anonymous;
      setAccount({ status: 'ready', signedIn, isAdmin: false, displayName: signedIn ? nameFor(user) : '' });
      if (!signedIn) return;
      void sharedSupabase.rpc('is_admin').then(({ data, error }: { data: unknown; error: unknown }) => {
        if (!cancelled) setAccount((a) => ({ ...a, isAdmin: !error && data === true }));
      });
    };
    void sharedSupabase.auth.getSession().then(({ data }) => apply((data.session?.user as SessionUser) ?? null));
    const { data: sub } = sharedSupabase.auth.onAuthStateChange((_e, session) => apply((session?.user as SessionUser) ?? null));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return account;
}

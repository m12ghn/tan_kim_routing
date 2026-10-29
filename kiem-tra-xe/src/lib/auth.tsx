import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, usernameToEmail, friendlyError } from './supabase';
import type { Profile } from './types';

// Bắt đăng nhập lại sau N ngày kể từ lần đăng nhập gần nhất.
const SESSION_MAX_DAYS = 3;

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  error: string;
  isManager: boolean;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async (s: Session | null) => {
    setSession(s);
    setError('');
    if (!s) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const last = s.user.last_sign_in_at ? new Date(s.user.last_sign_in_at).getTime() : 0;
    if (last && Date.now() - last > SESSION_MAX_DAYS * 86_400_000) {
      await supabase.auth.signOut();
      setError(`Phiên đăng nhập đã quá ${SESSION_MAX_DAYS} ngày. Hãy đăng nhập lại.`);
      setLoading(false);
      return;
    }
    const { data, error: e } = await supabase.from('kx_members').select('*').eq('id', s.user.id).maybeSingle();
    if (e) setError(friendlyError(e));
    else if (!data) setError('Tài khoản này chưa được cấp quyền dùng app Kiểm tra xe. Báo quản lý thêm vào danh sách.');
    else if (!data.active) {
      await supabase.auth.signOut();
      setError('Tài khoản đã bị khóa. Liên hệ quản lý.');
      setProfile(null);
      setLoading(false);
      return;
    }
    setProfile((data as Profile) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => loadProfile(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') loadProfile(s);
      else setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (username: string, password: string) => {
    const { error: e } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    return e ? friendlyError(e) : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const isManager = profile?.role === 'manager' || profile?.role === 'dev';

  return (
    <AuthContext.Provider value={{ loading, session, profile, error, isManager, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}

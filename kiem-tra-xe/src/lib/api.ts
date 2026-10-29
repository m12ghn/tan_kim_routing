import { supabase } from './supabase';

/** Gọi api/*.js trên Vercel, kèm token đăng nhập. Trả về JSON hoặc ném lỗi tiếng Việt. */
export async function callApi<T = unknown>(path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Máy chủ không phản hồi. Hãy thử lại.');
  return j as T;
}

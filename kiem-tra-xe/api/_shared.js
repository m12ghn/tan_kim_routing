// File bắt đầu bằng "_" KHÔNG phải endpoint. Chỉ chạy trên server Vercel.
import { createClient } from '@supabase/supabase-js';

export const EMAIL_DOMAIN = 'app.local';
export const usernameToEmail = (u) => `${String(u).trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error('Server chưa cấu hình SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (thêm trên Vercel rồi Redeploy).');
    err.status = 500;
    throw err;
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Xác định người gọi từ header Authorization: Bearer <access_token>, trả về profile.
export async function getCaller(req, admin) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw httpError(401, 'Bạn cần đăng nhập lại.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw httpError(401, 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.');
  const { data: profile } = await admin.from('kx_members').select('*').eq('id', data.user.id).single();
  if (!profile?.active) throw httpError(403, 'Tài khoản chưa được cấp quyền hoặc đã bị khóa trong app Kiểm tra xe.');
  return profile;
}

export async function requireManager(req, admin) {
  const p = await getCaller(req, admin);
  if (!['manager', 'dev'].includes(p.role)) throw httpError(403, 'Chỉ quản lý được làm thao tác này.');
  return p;
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function sendError(res, e) {
  res.status(e.status || 500).json({ error: e.message || 'Có lỗi trên máy chủ. Hãy thử lại.' });
}

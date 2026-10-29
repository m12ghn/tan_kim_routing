import { createClient } from '@supabase/supabase-js';

export const supabaseConfigured = Boolean(__SUPABASE_URL__ && __SUPABASE_ANON_KEY__);

// Khi chưa cấu hình, tạo client với URL giả để app vẫn chạy và hiện hướng dẫn thay vì trắng trang.
export const supabase = createClient(
  __SUPABASE_URL__ || 'https://chua-cau-hinh.supabase.co',
  __SUPABASE_ANON_KEY__ || 'chua-cau-hinh',
);

export const PHOTO_BUCKET = 'photos';
export const EMAIL_DOMAIN = 'app.local';
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

// Đổi lỗi kỹ thuật thành câu tiếng Việt nói rõ cần làm gì.
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e ?? '');
  if (/Invalid login credentials/i.test(msg)) return 'Sai tên đăng nhập hoặc mật khẩu.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Mất kết nối mạng. Kiểm tra mạng rồi thử lại.';
  if (/JWT|session|refresh token/i.test(msg)) return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.';
  if (/row-level security/i.test(msg)) return 'Bạn không có quyền làm thao tác này.';
  if (/does not exist|schema cache/i.test(msg)) return 'Cơ sở dữ liệu chưa được cài đặt đủ. Báo quản trị chạy file SQL.';
  if (/[À-ỹ]/.test(msg)) return msg; // lỗi đã viết tiếng Việt từ DB/API
  return 'Có lỗi xảy ra. Hãy thử lại, nếu vẫn lỗi thì chụp màn hình gửi quản trị.';
}

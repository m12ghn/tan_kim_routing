import { supabase, PHOTO_BUCKET } from './supabase';

/** Tải 1 ảnh lên bucket, thử lại `retries` lần. Trả về đường dẫn. */
export async function uploadPhoto(userId: string, folder: string, blob: Blob, retries = 3): Promise<string> {
  const path = `${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    // "already exists" nghĩa là lần thử trước đã lên được rồi.
    if (!error || /exists|Duplicate/i.test(error.message)) return path;
    lastErr = error;
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  throw lastErr;
}

export async function removePhotoFile(path: string | null | undefined) {
  if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(() => undefined);
}

/** Tạo signed URL (hạn 7 ngày) cho nhiều ảnh. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 7 * 86_400);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

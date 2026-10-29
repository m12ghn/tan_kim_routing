import { supabase, PHOTO_BUCKET } from './supabase';

export interface UploadJob {
  key: string;
  blob: Blob;
}

/** Tải ảnh song song tối đa `concurrency` ảnh, mỗi ảnh thử lại `retries` lần. Trả về key -> đường dẫn. */
export async function uploadPhotos(
  userId: string,
  folder: string,
  jobs: UploadJob[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 3,
  retries = 3,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let done = 0;
  let next = 0;

  async function one(job: UploadJob) {
    const path = `${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}.jpg`;
    let lastErr: unknown;
    for (let i = 0; i < retries; i++) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, job.blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      // "already exists" nghĩa là lần thử trước đã lên được rồi.
      if (!error || /exists|Duplicate/i.test(error.message)) {
        out[job.key] = path;
        onProgress?.(++done, jobs.length);
        return;
      }
      lastErr = error;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
    throw lastErr;
  }

  async function worker() {
    while (next < jobs.length) await one(jobs[next++]);
  }

  onProgress?.(0, jobs.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return out;
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

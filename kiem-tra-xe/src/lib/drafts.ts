// Lưu nháp phiếu kiểm tra vào IndexedDB để không mất khi mất mạng hoặc tải lại trang.
import type { InspectionResult } from './types';

export interface Draft {
  id: string; // id phiếu, tạo ở máy khách
  userId: string;
  vehicleId: string | null;
  result: InspectionResult;
  odo: string;
  note: string;
  photos: Record<string, Blob>; // slot -> ảnh đã nén
  uploaded: Record<string, string>; // slot -> đường dẫn đã tải lên
  updatedAt: number;
}

const DB = 'kiem-tra-xe';
const STORE = 'drafts';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'userId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Mỗi người dùng một nháp đang làm.
export const loadDraft = (userId: string) => tx<Draft | undefined>('readonly', (s) => s.get(userId)).catch(() => undefined);
export const saveDraft = (d: Draft) => tx('readwrite', (s) => s.put({ ...d, updatedAt: Date.now() })).catch(() => undefined);
export const clearDraft = (userId: string) => tx('readwrite', (s) => s.delete(userId)).catch(() => undefined);

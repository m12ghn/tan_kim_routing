// Lưu nháp phiếu đang kiểm tra vào IndexedDB: không mất khi mất mạng hoặc tải lại trang.
import type { Checklist } from './checklist';

export interface Draft {
  userId: string;
  inspectionId: string;
  vehicleId: string;
  step: 'photos' | 'checklist';
  checklist: Checklist;
  otherNote: string;
  abnormal: boolean;
  abnormalNote: string;
  pending: Record<string, Blob>; // ảnh đã chụp nhưng chưa tải lên được
  updatedAt: number;
}

const DB = 'kiem-tra-xe';
const STORE = 'drafts-v2';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'userId' });
    };
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

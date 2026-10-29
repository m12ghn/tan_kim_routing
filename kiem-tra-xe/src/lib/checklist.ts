import type { ChecklistEntry, Level } from './types';

// 8 mục checklist. Khóa (key) phải khớp danh sách trong kx_complete_inspection.
export const CHECK_ITEMS = [
  { key: 'body', label: 'Thân vỏ' },
  { key: 'spare', label: 'Sơ cua' },
  { key: 'fuel', label: 'Bình dầu' },
  { key: 'battery', label: 'Acquy' },
  { key: 'parts', label: 'Phụ tùng xe' },
  { key: 'tire', label: 'Lốp' },
  { key: 'lights', label: 'Hệ thống chiếu sáng' },
  { key: 'door_seal', label: 'Seal cửa' },
] as const;

export const checkLabel = (key: string) => CHECK_ITEMS.find((c) => c.key === key)?.label ?? key;

export type Checklist = Record<string, ChecklistEntry>;

export const defaultChecklist = (): Checklist =>
  Object.fromEntries(CHECK_ITEMS.map((c) => [c.key, { ok: true, note: '' }]));

/** Rule mức hiện tại: Bất thường > có ✗ thì Xem xét > còn lại Bình thường. Server tính lại y hệt. */
export function computeLevel(checklist: Checklist, abnormal: boolean): Level {
  if (abnormal) return 'abnormal';
  return CHECK_ITEMS.some((c) => checklist[c.key]?.ok === false) ? 'review' : 'normal';
}

export const failedItems = (checklist: Checklist) => CHECK_ITEMS.filter((c) => checklist[c.key]?.ok === false);

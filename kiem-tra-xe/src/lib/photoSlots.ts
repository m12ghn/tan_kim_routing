// Vị trí ảnh của một lần kiểm tra. Khóa (key) phải khớp danh sách trong kx_set_photo / kx_complete_inspection.
export interface PhotoSlot {
  key: string;
  label: string;
  required: boolean;
}

export const REQUIRED_SLOTS: PhotoSlot[] = [
  { key: 'front', label: 'Trước', required: true },
  { key: 'left', label: 'Trái (tài xế)', required: true },
  { key: 'back', label: 'Sau', required: true },
  { key: 'tire', label: 'Lốp', required: true },
  { key: 'right', label: 'Phải', required: true },
  { key: 'odo', label: 'ODO', required: true },
  { key: 'cabin', label: 'Cabin', required: true },
];

export const EXTRA_SLOTS: PhotoSlot[] = [
  { key: 'extra1', label: 'Ảnh thêm 1', required: false },
  { key: 'extra2', label: 'Ảnh thêm 2', required: false },
  { key: 'extra3', label: 'Ảnh thêm 3', required: false },
];

export const ALL_SLOTS = [...REQUIRED_SLOTS, ...EXTRA_SLOTS];

export const slotLabel = (key: string) => ALL_SLOTS.find((s) => s.key === key)?.label ?? key;
export const slotOrder = (key: string) => {
  const i = ALL_SLOTS.findIndex((s) => s.key === key);
  return i < 0 ? 99 : i;
};

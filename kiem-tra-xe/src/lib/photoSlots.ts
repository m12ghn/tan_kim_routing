// Các góc chụp của một lần kiểm tra. Sửa danh sách này khi chốt quy trình thật.
export interface PhotoSlot {
  key: string;
  label: string;
  required: boolean;
}

export const PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'front', label: 'Đầu xe', required: true },
  { key: 'back', label: 'Đuôi xe', required: true },
  { key: 'left', label: 'Bên trái', required: true },
  { key: 'right', label: 'Bên phải', required: true },
  { key: 'odo', label: 'Đồng hồ ODO', required: true },
  { key: 'cabin', label: 'Cabin / nội thất', required: false },
  { key: 'extra', label: 'Ảnh thêm (hư hỏng…)', required: false },
];

export const slotLabel = (key: string) => PHOTO_SLOTS.find((s) => s.key === key)?.label ?? key;

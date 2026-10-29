export type Role = 'inspector' | 'manager' | 'dev';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  active: boolean;
}

export interface Vehicle {
  id: string;
  plate: string;
  vehicle_type: string;
  note: string;
  active: boolean;
}

export type InspectionStatus = 'submitted' | 'approved' | 'rejected';
export type InspectionResult = 'ok' | 'issue';

export interface Inspection {
  id: string;
  vehicle_id: string;
  inspector_id: string;
  status: InspectionStatus;
  result: InspectionResult;
  odo: number | null;
  note: string;
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
}

export interface InspectionPhoto {
  id: string;
  inspection_id: string;
  slot: string;
  path: string;
}

export const STATUS_LABEL: Record<InspectionStatus, string> = {
  submitted: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Trả lại',
};

export const RESULT_LABEL: Record<InspectionResult, string> = {
  ok: '✓ Đạt',
  issue: '⚠ Có vấn đề',
};

export const ROLE_LABEL: Record<Role, string> = {
  inspector: 'Nhân viên kiểm tra',
  manager: 'Quản lý',
  dev: 'Dev',
};

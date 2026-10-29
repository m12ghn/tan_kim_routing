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
  fleet: string;
  brand: string;
  model: string;
  payload_kg: number | null;
  year: number | null;
  sheet_status: string;
  odo: number | null;
  odo_at: string | null;
  active: boolean;
  synced_at: string | null;
}

export type InspectionStatus = 'in_progress' | 'completed' | 'cancelled';
export type Level = 'normal' | 'review' | 'abnormal';

export interface ChecklistEntry {
  ok: boolean;
  note: string;
}

export interface Inspection {
  id: string;
  vehicle_id: string;
  inspector_id: string;
  status: InspectionStatus;
  level: Level | null;
  odo: number | null;
  checklist: Record<string, ChecklistEntry>;
  other_note: string;
  abnormal_note: string;
  started_at: string;
  completed_at: string | null;
}

export interface InspectionPhoto {
  id: string;
  inspection_id: string;
  slot: string;
  path: string;
}

/** Một dòng của kx_vehicle_summary(). */
export interface VehicleSummary {
  vehicle_id: string;
  last_inspection_id: string | null;
  last_completed_at: string | null;
  last_level: Level | null;
  last_inspector: string | null;
  completed_count: number;
  open_inspection_id: string | null;
  open_inspector_id: string | null;
  open_inspector: string | null;
  open_started_at: string | null;
}

export const LEVEL_LABEL: Record<Level, string> = {
  normal: 'Bình thường',
  review: 'Xem xét',
  abnormal: 'Bất thường',
};

export const STATUS_LABEL: Record<InspectionStatus, string> = {
  in_progress: 'Đang kiểm tra',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
};

export const ROLE_LABEL: Record<Role, string> = {
  inspector: 'Nhân viên kiểm tra',
  manager: 'Quản lý',
  dev: 'Dev',
};

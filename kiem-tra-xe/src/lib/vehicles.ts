import { supabase } from './supabase';
import { normalize } from './format';
import type { Vehicle, VehicleSummary } from './types';

export async function loadVehicles(): Promise<{ vehicles: Vehicle[]; summary: Record<string, VehicleSummary> }> {
  const [v, s] = await Promise.all([
    supabase.from('kx_vehicles').select('*').eq('active', true).order('plate'),
    supabase.rpc('kx_vehicle_summary'),
  ]);
  if (v.error) throw v.error;
  if (s.error) throw s.error;
  const summary: Record<string, VehicleSummary> = {};
  for (const r of (s.data as VehicleSummary[]) ?? []) summary[r.vehicle_id] = r;
  return { vehicles: (v.data as Vehicle[]) ?? [], summary };
}

export const plateKey = (s: string) => normalize(s).replace(/[^a-z0-9]/g, '');

/** Tìm biển số không cần dấu: "50h214" khớp "50H00214" (khớp đầu tỉnh+seri và đuôi số). */
export function matchPlate(plate: string, query: string): number {
  const k = plateKey(plate);
  const q = plateKey(query);
  if (!q) return 1;
  if (k === q) return 4;
  if (k.startsWith(q)) return 3;
  if (k.includes(q)) return 2;
  const m = q.match(/^(\d{2}[a-z]+)(\d+)$/);
  if (m && k.startsWith(m[1]) && k.endsWith(m[2])) return 1;
  return 0;
}

import type { ReactNode } from 'react';
import { fmtDate, fmtDateTime, fmtNum, EMPTY } from '../lib/format';
import type { Vehicle, VehicleSummary } from '../lib/types';
import { LevelBadge } from './StatusBadge';

// Thẻ thông tin xe hiện khi chọn biển số.
export default function VehicleCard({ vehicle, summary }: { vehicle: Vehicle; summary?: VehicleSummary }) {
  const rows: [string, ReactNode][] = [
    ['Đội xe', vehicle.fleet || EMPTY],
    ['Hãng xe', [vehicle.brand, vehicle.model].filter(Boolean).join(' · ') || EMPTY],
    ['Tải trọng', vehicle.payload_kg == null ? EMPTY : `${fmtNum(vehicle.payload_kg)} kg`],
    [
      'ODO gần nhất',
      vehicle.odo == null ? (
        EMPTY
      ) : (
        <>
          {fmtNum(vehicle.odo)} km{vehicle.odo_at && <span className="muted small"> · {fmtDate(vehicle.odo_at)}</span>}
        </>
      ),
    ],
    ['Năm SX', vehicle.year ?? EMPTY],
    ['Kiểm tra gần nhất', summary?.last_completed_at ? fmtDateTime(summary.last_completed_at) : 'Chưa có'],
  ];
  return (
    <div className="vcard">
      <div className="vcard-head">
        <div>
          <div className="plate plate-lg">{vehicle.plate}</div>
          {vehicle.sheet_status && <div className="muted small">{vehicle.sheet_status}</div>}
        </div>
        <div className="vcard-level">
          <span className="muted small">Mức hiện tại</span>
          <LevelBadge level={summary?.last_level} big />
        </div>
      </div>
      <dl className="vcard-facts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

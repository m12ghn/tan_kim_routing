import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { signedUrls } from '../lib/upload';
import { slotLabel, slotOrder } from '../lib/photoSlots';
import { CHECK_ITEMS } from '../lib/checklist';
import { EMPTY, fmtDateTime, fmtNum } from '../lib/format';
import type { Inspection, InspectionPhoto, Profile, Vehicle } from '../lib/types';
import { LevelBadge, StatusBadge } from '../components/StatusBadge';
import { SkeletonRows } from '../components/Skeleton';

function duration(from: string, to: string | null) {
  if (!to) return EMPTY;
  const min = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
  return min < 60 ? `${min} phút` : `${Math.floor(min / 60)} giờ ${min % 60} phút`;
}

// Báo cáo một lần kiểm tra: thông tin xe, mức, checklist, ảnh, giờ bắt đầu/hoàn tất.
export default function InspectionReport() {
  const { id = '' } = useParams();
  const { isManager, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insp, setInsp] = useState<Inspection | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [inspector, setInspector] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<(InspectionPhoto & { url?: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await supabase.from('kx_inspections').select('*').eq('id', id).maybeSingle();
      if (e) throw e;
      if (!data) {
        setInsp(null);
        return;
      }
      const i = data as Inspection;
      setInsp(i);
      const [v, p, ph] = await Promise.all([
        supabase.from('kx_vehicles').select('*').eq('id', i.vehicle_id).maybeSingle(),
        supabase.from('kx_members').select('id, username, full_name, role, active').eq('id', i.inspector_id).maybeSingle(),
        supabase.from('kx_inspection_photos').select('*').eq('inspection_id', id),
      ]);
      setVehicle((v.data as Vehicle) ?? null);
      setInspector((p.data as Profile) ?? null);
      const list = ((ph.data as InspectionPhoto[]) ?? []).sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot));
      const urls = await signedUrls(list.map((x) => x.path));
      setPhotos(list.map((x) => ({ ...x, url: urls[x.path] })));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancelOpen() {
    if (busy || !window.confirm('Hủy phiếu đang kiểm tra này?')) return;
    setBusy(true);
    const { error: e } = await supabase.rpc('kx_cancel_inspection', { p_id: id });
    setBusy(false);
    if (e) setError(friendlyError(e));
    else load();
  }

  if (loading) return <SkeletonRows n={8} />;
  if (!insp)
    return (
      <div className="card stack">
        <p className="empty">{error || 'Không tìm thấy phiếu này, hoặc bạn không có quyền xem.'}</p>
        <Link to="/">← Về trang chính</Link>
      </div>
    );

  const canCancel = insp.status === 'in_progress' && (isManager || insp.inspector_id === profile?.id);

  return (
    <div className="stack-lg report">
      <div className="page-head">
        <h1>Kiểm tra xe {vehicle?.plate ?? ''}</h1>
        <div className="row no-print">
          <button className="btn btn-ghost" onClick={() => history.back()}>
            ← Quay lại
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            In / lưu PDF
          </button>
        </div>
      </div>

      {error && <div className="alert alert-bad">{error}</div>}

      <div className="card stack">
        <div className="report-level">
          {insp.status === 'completed' ? <LevelBadge level={insp.level} big /> : <StatusBadge status={insp.status} />}
          {canCancel && (
            <button className="btn btn-sm btn-danger no-print" disabled={busy} onClick={cancelOpen}>
              Hủy phiếu
            </button>
          )}
        </div>
        <dl className="facts">
          <dt>Biển số</dt>
          <dd className="strong">{vehicle?.plate ?? EMPTY}</dd>
          <dt>Đội xe</dt>
          <dd>{vehicle?.fleet || EMPTY}</dd>
          <dt>Hãng xe</dt>
          <dd>{[vehicle?.brand, vehicle?.model].filter(Boolean).join(' · ') || EMPTY}</dd>
          <dt>Tải trọng</dt>
          <dd>{vehicle?.payload_kg == null ? EMPTY : `${fmtNum(vehicle.payload_kg)} kg`}</dd>
          <dt>ODO lúc kiểm tra</dt>
          <dd>{insp.odo == null ? EMPTY : `${fmtNum(insp.odo)} km`}</dd>
          <dt>Người kiểm tra</dt>
          <dd>{inspector ? `${inspector.username} · ${inspector.full_name}` : EMPTY}</dd>
          <dt>Bắt đầu</dt>
          <dd>{fmtDateTime(insp.started_at)}</dd>
          <dt>Hoàn tất</dt>
          <dd>{fmtDateTime(insp.completed_at)}</dd>
          <dt>Thời gian</dt>
          <dd>{duration(insp.started_at, insp.completed_at)}</dd>
        </dl>
      </div>

      {insp.abnormal_note && (
        <div className="abnormal-box">
          <div>
            <strong>✕ Bất thường — Cần sửa chữa</strong>
            <p>{insp.abnormal_note}</p>
          </div>
        </div>
      )}

      {insp.status === 'completed' && (
        <div className="card stack">
          <h2>Checklist</h2>
          <ul className="checklist checklist-view">
            {CHECK_ITEMS.map((c) => {
              const e = insp.checklist?.[c.key];
              const ok = e?.ok !== false;
              return (
                <li key={c.key} className={ok ? '' : 'failed'}>
                  <div className="check-row">
                    <span className="check-label">{c.label}</span>
                    <span className={ok ? 'ok-text strong' : 'danger-text strong'}>{ok ? '✓ Đạt' : '✗ Không đạt'}</span>
                  </div>
                  {!ok && e?.note && <p className="check-note">{e.note}</p>}
                </li>
              );
            })}
            <li>
              <div className="check-row">
                <span className="check-label">Khác</span>
              </div>
              <p className="check-note">{insp.other_note || EMPTY}</p>
            </li>
          </ul>
        </div>
      )}

      <div className="card stack">
        <h2>Ảnh ({fmtNum(photos.length)})</h2>
        {!photos.length ? (
          <p className="empty">Phiếu này chưa có ảnh.</p>
        ) : (
          <div className="photo-grid">
            {photos.map((p) => (
              <figure key={p.id}>
                {p.url ? (
                  <button onClick={() => setZoom(p.url!)}>
                    <img src={p.url} alt={slotLabel(p.slot)} loading="lazy" />
                  </button>
                ) : (
                  <div className="photo-missing">Không tải được ảnh</div>
                )}
                <figcaption>{slotLabel(p.slot)}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="Ảnh phóng to">
          <img src={zoom} alt="" />
        </div>
      )}
    </div>
  );
}

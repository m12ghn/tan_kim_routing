import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { signedUrls } from '../lib/upload';
import { PHOTO_SLOTS, slotLabel } from '../lib/photoSlots';
import { EMPTY, fmtDateTime, fmtNum } from '../lib/format';
import type { Inspection, InspectionPhoto, Profile, Vehicle } from '../lib/types';
import { ResultBadge, StatusBadge } from '../components/StatusBadge';
import { SkeletonRows } from '../components/Skeleton';

const slotOrder = (k: string) => {
  const i = PHOTO_SLOTS.findIndex((s) => s.key === k);
  return i < 0 ? 99 : i;
};

// Báo cáo một phiếu kiểm tra: thông tin, ảnh, duyệt/trả lại (quản lý).
export default function InspectionReport() {
  const { id = '' } = useParams();
  const { isManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insp, setInsp] = useState<Inspection | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [inspector, setInspector] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<(InspectionPhoto & { url?: string })[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await supabase.from('inspections').select('*').eq('id', id).maybeSingle();
      if (e) throw e;
      if (!data) {
        setInsp(null);
        return;
      }
      const i = data as Inspection;
      setInsp(i);
      setReviewNote(i.review_note);
      const [v, p, ph] = await Promise.all([
        supabase.from('vehicles').select('*').eq('id', i.vehicle_id).maybeSingle(),
        supabase.from('profiles').select('id, username, full_name, role, active').eq('id', i.inspector_id).maybeSingle(),
        supabase.from('inspection_photos').select('*').eq('inspection_id', id),
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

  async function review(status: 'approved' | 'rejected') {
    if (busy) return;
    if (status === 'rejected' && !reviewNote.trim()) return setError('Trả lại phiếu thì ghi rõ lý do.');
    setBusy(true);
    setError('');
    const { error: e } = await supabase.rpc('review_inspection', { p_id: id, p_status: status, p_note: reviewNote.trim() });
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

  return (
    <div className="stack-lg report">
      <div className="page-head">
        <h1>Phiếu kiểm tra {vehicle?.plate ?? ''}</h1>
        <button className="btn btn-ghost no-print" onClick={() => window.print()}>
          In / lưu PDF
        </button>
      </div>

      {error && <div className="alert alert-bad">{error}</div>}

      <div className="card">
        <dl className="facts">
          <dt>Biển số</dt>
          <dd>{vehicle?.plate ?? EMPTY}</dd>
          <dt>Loại xe</dt>
          <dd>{vehicle?.vehicle_type || EMPTY}</dd>
          <dt>Kết quả</dt>
          <dd>
            <ResultBadge result={insp.result} />
          </dd>
          <dt>Trạng thái</dt>
          <dd>
            <StatusBadge status={insp.status} />
          </dd>
          <dt>ODO</dt>
          <dd>{insp.odo == null ? EMPTY : `${fmtNum(insp.odo)} km`}</dd>
          <dt>Người kiểm tra</dt>
          <dd>{inspector ? `${inspector.username} · ${inspector.full_name}` : EMPTY}</dd>
          <dt>Giờ gửi</dt>
          <dd>{fmtDateTime(insp.created_at)}</dd>
          <dt>Ghi chú</dt>
          <dd>{insp.note || EMPTY}</dd>
          {insp.reviewed_at && (
            <>
              <dt>Duyệt lúc</dt>
              <dd>{fmtDateTime(insp.reviewed_at)}</dd>
              <dt>Ý kiến quản lý</dt>
              <dd>{insp.review_note || EMPTY}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="card stack">
        <h2>Ảnh ({fmtNum(photos.length)})</h2>
        {!photos.length ? (
          <p className="empty">Phiếu này không có ảnh.</p>
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

      {isManager && (
        <div className="card stack no-print">
          <h2>Duyệt phiếu</h2>
          <label className="field">
            <span>Ý kiến (bắt buộc khi trả lại)</span>
            <textarea className="input" rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn btn-primary" disabled={busy} onClick={() => review('approved')}>
              ✓ Duyệt
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={() => review('rejected')}>
              Trả lại
            </button>
          </div>
        </div>
      )}

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="Ảnh phóng to">
          <img src={zoom} alt="" />
        </div>
      )}
    </div>
  );
}

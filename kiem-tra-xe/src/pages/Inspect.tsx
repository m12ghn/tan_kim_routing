import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../lib/drafts';
import { uploadPhotos } from '../lib/upload';
import { PHOTO_SLOTS } from '../lib/photoSlots';
import { fmtDateTime, fmtNum, normalize } from '../lib/format';
import type { Inspection, Vehicle } from '../lib/types';
import CameraCapture from '../components/CameraCapture';
import { ResultBadge, StatusBadge } from '../components/StatusBadge';
import { SkeletonRows } from '../components/Skeleton';

const newDraft = (userId: string): Draft => ({
  id: crypto.randomUUID(),
  userId,
  vehicleId: null,
  result: 'ok',
  odo: '',
  note: '',
  photos: {},
  uploaded: {},
  updatedAt: Date.now(),
});

export default function Inspect() {
  const { profile } = useAuth();
  const userId = profile!.id;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [history, setHistory] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [plateQuery, setPlateQuery] = useState('');
  const [camera, setCamera] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState('');
  const [sentId, setSentId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [v, h] = await Promise.all([
      supabase.from('kx_vehicles').select('*').eq('active', true).order('plate'),
      supabase.from('kx_inspections').select('*').eq('inspector_id', userId).order('created_at', { ascending: false }).limit(20),
    ]);
    if (v.error || h.error) setLoadError(friendlyError(v.error || h.error));
    setVehicles((v.data as Vehicle[]) ?? []);
    setHistory((h.data as Inspection[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
    loadDraft(userId).then((d) => setDraft(d ?? newDraft(userId)));
  }, [load, userId]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });
    setErrors({});
  };

  const thumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, b] of Object.entries(draft?.photos ?? {})) out[k] = URL.createObjectURL(b);
    return out;
  }, [draft?.photos]);
  useEffect(() => () => Object.values(thumbs).forEach(URL.revokeObjectURL), [thumbs]);

  const vehicle = vehicles.find((v) => v.id === draft?.vehicleId) ?? null;
  const vehicleMatches = useMemo(() => {
    const q = normalize(plateQuery).replace(/[^a-z0-9]/g, '');
    return vehicles.filter((v) => !q || normalize(v.plate).replace(/[^a-z0-9]/g, '').includes(q)).slice(0, 30);
  }, [plateQuery, vehicles]);

  const sentToday = history.filter((h) => new Date(h.created_at).toDateString() === new Date().toDateString()).length;

  function validate(d: Draft): Record<string, string> {
    const e: Record<string, string> = {};
    if (!d.vehicleId) e.vehicle = 'Chọn xe cần kiểm tra.';
    const missing = PHOTO_SLOTS.filter((s) => s.required && !d.photos[s.key]).map((s) => s.label);
    if (missing.length) e.photos = `Còn thiếu ảnh: ${missing.join(', ')}.`;
    if (d.odo !== '') {
      const n = Number(d.odo);
      if (!Number.isInteger(n) || n < 0) e.odo = 'ODO phải là số nguyên không âm.';
    }
    if (d.result === 'issue' && !d.note.trim()) e.note = 'Có vấn đề thì ghi rõ vấn đề gì.';
    return e;
  }

  async function submit() {
    if (!draft || sending) return;
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length) return;

    try {
      // Chỉ tải những ảnh chưa tải lên ở lần thử trước.
      const jobs = Object.entries(draft.photos)
        .filter(([k]) => !draft.uploaded[k])
        .map(([key, blob]) => ({ key, blob }));
      let uploaded = { ...draft.uploaded };
      if (jobs.length) {
        const got = await uploadPhotos(userId, draft.id, jobs, (done, total) => setSending(`Đang tải ảnh ${done}/${total}…`));
        uploaded = { ...uploaded, ...got };
        update({ uploaded });
      }
      setSending('Đang gửi phiếu…');
      const { error } = await supabase.rpc('kx_submit_inspection', {
        p_id: draft.id,
        p_vehicle_id: draft.vehicleId,
        p_result: draft.result,
        p_odo: draft.odo === '' ? null : Number(draft.odo),
        p_note: draft.note.trim(),
        p_photos: Object.entries(uploaded).map(([slot, path]) => ({ slot, path })),
      });
      if (error) throw error;
      await clearDraft(userId);
      setSentId(draft.id);
      setDraft(newDraft(userId));
      setPlateQuery('');
      load();
    } catch (err) {
      setErrors({ submit: `${friendlyError(err)} Phiếu vẫn được lưu nháp trên máy, bấm Gửi để thử lại.` });
    } finally {
      setSending('');
    }
  }

  if (!draft || loading) return <SkeletonRows n={8} />;

  const slotDone = PHOTO_SLOTS.filter((s) => draft.photos[s.key]).length;

  return (
    <div className="stack-lg">
      {loadError && <div className="alert alert-bad">{loadError}</div>}

      {sentId && (
        <div className="alert alert-good">
          ✓ Đã gửi phiếu kiểm tra. <Link to={`/phieu/${sentId}`}>Xem báo cáo</Link>
        </div>
      )}

      <section className="card stack">
        <h2>1. Chọn xe</h2>
        {vehicle ? (
          <div className="picked">
            <div>
              <div className="plate">{vehicle.plate}</div>
              <div className="muted small">{vehicle.vehicle_type || 'Chưa ghi loại xe'}</div>
            </div>
            <button className="btn btn-ghost" disabled={!!sending} onClick={() => update({ vehicleId: null })}>
              Đổi xe
            </button>
          </div>
        ) : (
          <>
            <input
              className="input"
              placeholder="Gõ biển số, ví dụ 51K888"
              value={plateQuery}
              onChange={(e) => setPlateQuery(e.target.value)}
            />
            {!vehicles.length ? (
              <p className="empty">Chưa có xe nào trong danh mục. Báo quản lý thêm xe.</p>
            ) : !vehicleMatches.length ? (
              <p className="empty">Không tìm thấy biển số này. Kiểm tra lại hoặc báo quản lý thêm xe.</p>
            ) : (
              <div className="plate-list">
                {vehicleMatches.map((v) => (
                  <button
                    key={v.id}
                    className="plate-btn"
                    onClick={() => {
                      setSentId('');
                      update({ vehicleId: v.id });
                    }}
                  >
                    {v.plate}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {errors.vehicle && <p className="error-text">{errors.vehicle}</p>}
      </section>

      <section className={'card stack' + (vehicle ? '' : ' locked')}>
        <h2>
          2. Chụp ảnh{' '}
          <span className="muted small">
            ({slotDone}/{PHOTO_SLOTS.length})
          </span>
        </h2>
        {!vehicle && <p className="muted small">Chọn xe trước để chụp ảnh.</p>}
        <div className="slots">
          {PHOTO_SLOTS.map((s) => (
            <button key={s.key} className="slot" disabled={!vehicle || !!sending} onClick={() => setCamera(s.key)}>
              {thumbs[s.key] ? <img src={thumbs[s.key]} alt={s.label} /> : <span className="slot-icon">📷</span>}
              <span className="slot-label">
                {s.label}
                {s.required && !thumbs[s.key] && <span className="req"> *</span>}
                {thumbs[s.key] && ' ✓'}
              </span>
            </button>
          ))}
        </div>
        {errors.photos && <p className="error-text">{errors.photos}</p>}
      </section>

      <section className={'card stack' + (vehicle ? '' : ' locked')}>
        <h2>3. Kết quả</h2>
        <label className="field">
          <span>ODO (km)</span>
          <input
            className="input"
            inputMode="numeric"
            placeholder="Không bắt buộc"
            value={draft.odo}
            disabled={!vehicle}
            onChange={(e) => update({ odo: e.target.value.replace(/[^\d]/g, '') })}
          />
          {draft.odo && <span className="muted small">{fmtNum(Number(draft.odo))} km</span>}
        </label>
        {errors.odo && <p className="error-text">{errors.odo}</p>}
        <div className="segmented">
          <button className={draft.result === 'ok' ? 'on good' : ''} disabled={!vehicle} onClick={() => update({ result: 'ok' })}>
            ✓ Đạt
          </button>
          <button className={draft.result === 'issue' ? 'on bad' : ''} disabled={!vehicle} onClick={() => update({ result: 'issue' })}>
            ⚠ Có vấn đề
          </button>
        </div>
        <label className="field">
          <span>Ghi chú{draft.result === 'issue' && <span className="req"> *</span>}</span>
          <textarea
            className="input"
            rows={3}
            disabled={!vehicle}
            placeholder={draft.result === 'issue' ? 'Mô tả vấn đề: vị trí, mức độ…' : 'Không bắt buộc'}
            value={draft.note}
            onChange={(e) => update({ note: e.target.value })}
          />
        </label>
        {errors.note && <p className="error-text">{errors.note}</p>}
      </section>

      {errors.submit && <div className="alert alert-bad">{errors.submit}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={!vehicle || !!sending} onClick={submit}>
        {sending || 'Gửi phiếu kiểm tra'}
      </button>
      <p className="muted small center">Phiếu tự lưu nháp trên máy, mất mạng hay tải lại trang không mất.</p>

      <section className="card stack">
        <h2>
          Phiếu đã gửi <span className="muted small">(hôm nay {fmtNum(sentToday)})</span>
        </h2>
        {!history.length ? (
          <p className="empty">Bạn chưa gửi phiếu nào.</p>
        ) : (
          <ul className="history">
            {history.map((h) => (
              <li key={h.id}>
                <Link to={`/phieu/${h.id}`}>
                  <span className="plate">{vehicles.find((v) => v.id === h.vehicle_id)?.plate ?? 'Xe đã ngừng theo dõi'}</span>
                  <span className="muted small">{fmtDateTime(h.created_at)}</span>
                  <span className="history-badges">
                    <ResultBadge result={h.result} /> <StatusBadge status={h.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {camera && (
        <CameraCapture
          title={PHOTO_SLOTS.find((s) => s.key === camera)?.label ?? 'Chụp ảnh'}
          onClose={() => setCamera(null)}
          onDone={(blob) => {
            const uploaded = { ...draft.uploaded };
            delete uploaded[camera]; // chụp lại thì phải tải lại
            update({ photos: { ...draft.photos, [camera]: blob }, uploaded });
            setCamera(null);
          }}
        />
      )}
    </div>
  );
}

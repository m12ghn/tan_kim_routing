import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../lib/drafts';
import { removePhotoFile, signedUrls, uploadPhoto } from '../lib/upload';
import { REQUIRED_SLOTS } from '../lib/photoSlots';
import { CHECK_ITEMS, computeLevel, defaultChecklist } from '../lib/checklist';
import { loadVehicles, matchPlate } from '../lib/vehicles';
import { fmtDateTime } from '../lib/format';
import type { Inspection, InspectionPhoto, Level, Vehicle, VehicleSummary } from '../lib/types';
import VehicleCard from '../components/VehicleCard';
import PhotoStep, { type PhotoState } from '../components/inspect/PhotoStep';
import ChecklistStep from '../components/inspect/ChecklistStep';
import { LevelBadge } from '../components/StatusBadge';
import { SkeletonRows } from '../components/Skeleton';

type Phase = 'pick' | 'photos' | 'checklist' | 'done';
const STEPS: { key: Phase; label: string }[] = [
  { key: 'pick', label: 'Chọn xe' },
  { key: 'photos', label: 'Chụp hình' },
  { key: 'checklist', label: 'Checklist' },
];

export default function Inspect() {
  const { profile } = useAuth();
  const userId = profile!.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [summary, setSummary] = useState<Record<string, VehicleSummary>>({});
  const [openOwn, setOpenOwn] = useState<Inspection | null>(null);

  const [phase, setPhase] = useState<Phase>('pick');
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [photos, setPhotos] = useState<Record<string, PhotoState>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState<{ id: string; level: Level; plate: string; at: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [{ vehicles: v, summary: s }, open] = await Promise.all([
        loadVehicles(),
        supabase
          .from('kx_inspections')
          .select('*')
          .eq('inspector_id', userId)
          .eq('status', 'in_progress')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setVehicles(v);
      setSummary(s);
      setOpenOwn((open.data as Inspection) ?? null);
      setLoadError('');
    } catch (e) {
      setLoadError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateDraft = useCallback((patch: Partial<Draft>) => {
    const cur = draftRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch };
    draftRef.current = next;
    setDraftState(next);
    saveDraft(next);
  }, []);

  const setPhoto = (slot: string, p: PhotoState | null) =>
    setPhotos((cur) => {
      const next = { ...cur };
      if (p) next[slot] = p;
      else delete next[slot];
      return next;
    });

  // Tải ảnh lên rồi gắn vào phiếu. Lỗi thì giữ ảnh trong nháp để thử lại.
  const uploadAndAttach = useCallback(
    async (inspectionId: string, slot: string, blob: Blob, preview: string) => {
      setPhoto(slot, { url: preview, state: 'uploading' });
      try {
        const path = await uploadPhoto(userId, inspectionId, blob);
        const { data: oldPath, error: e } = await supabase.rpc('kx_set_photo', {
          p_inspection_id: inspectionId,
          p_slot: slot,
          p_path: path,
        });
        if (e) throw e;
        removePhotoFile(oldPath as string | null);
        const d = draftRef.current;
        if (d && d.inspectionId === inspectionId && d.pending[slot] === blob) {
          const pending = { ...d.pending };
          delete pending[slot];
          updateDraft({ pending });
        }
        setPhoto(slot, { url: preview, state: 'done' });
      } catch {
        setPhoto(slot, { url: preview, state: 'error' });
      }
    },
    [userId, updateDraft],
  );

  // Mở lại một phiếu đang kiểm tra: lấy ảnh đã lên + nháp trên máy.
  const resume = useCallback(
    async (insp: { id: string; vehicle_id: string }) => {
      setBusy('Đang mở phiếu…');
      setError('');
      try {
        const local = await loadDraft(userId);
        const d: Draft =
          local && local.inspectionId === insp.id
            ? local
            : {
                userId,
                inspectionId: insp.id,
                vehicleId: insp.vehicle_id,
                step: 'photos',
                checklist: defaultChecklist(),
                otherNote: '',
                abnormal: false,
                abnormalNote: '',
                pending: {},
                updatedAt: Date.now(),
              };
        draftRef.current = d;
        setDraftState(d);
        saveDraft(d);

        const { data, error: e } = await supabase.from('kx_inspection_photos').select('*').eq('inspection_id', insp.id);
        if (e) throw e;
        const list = (data as InspectionPhoto[]) ?? [];
        const urls = await signedUrls(list.map((p) => p.path));
        const next: Record<string, PhotoState> = {};
        for (const p of list) next[p.slot] = { url: urls[p.path] ?? '', state: 'done' };
        setPhotos(next);
        for (const [slot, blob] of Object.entries(d.pending)) uploadAndAttach(insp.id, slot, blob, URL.createObjectURL(blob));

        setPickedId(insp.vehicle_id);
        setShowErrors(false);
        setPhase(d.step);
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setBusy('');
      }
    },
    [userId, uploadAndAttach],
  );

  async function start() {
    if (!pickedId || busy) return;
    setBusy('Đang bắt đầu…');
    setError('');
    const { data, error: e } = await supabase.rpc('kx_start_inspection', { p_id: crypto.randomUUID(), p_vehicle_id: pickedId });
    setBusy('');
    if (e) return setError(friendlyError(e));
    await resume({ id: data as string, vehicle_id: pickedId });
  }

  function onPhoto(slot: string, blob: Blob) {
    const d = draftRef.current;
    if (!d) return;
    const old = photos[slot]?.url;
    if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
    updateDraft({ pending: { ...d.pending, [slot]: blob } });
    uploadAndAttach(d.inspectionId, slot, blob, URL.createObjectURL(blob));
  }

  function onRetry(slot: string) {
    const d = draftRef.current;
    const blob = d?.pending[slot];
    if (d && blob) uploadAndAttach(d.inspectionId, slot, blob, photos[slot]?.url ?? URL.createObjectURL(blob));
  }

  async function onRemove(slot: string) {
    const d = draftRef.current;
    if (!d) return;
    const pending = { ...d.pending };
    delete pending[slot];
    updateDraft({ pending });
    setPhoto(slot, null);
    const { data } = await supabase.rpc('kx_remove_photo', { p_inspection_id: d.inspectionId, p_slot: slot });
    removePhotoFile(data as string | null);
  }

  async function cancel() {
    const d = draftRef.current;
    if (!d || busy) return;
    if (!window.confirm('Hủy phiếu kiểm tra này? Ảnh và checklist đã làm sẽ bỏ đi.')) return;
    setBusy('Đang hủy…');
    const { error: e } = await supabase.rpc('kx_cancel_inspection', { p_id: d.inspectionId });
    setBusy('');
    if (e) return setError(friendlyError(e));
    await clearDraft(userId);
    backToPick();
  }

  function backToPick() {
    draftRef.current = null;
    setDraftState(null);
    setPhotos({});
    setPhase('pick');
    setPickedId(null);
    setQuery('');
    setError('');
    refresh();
  }

  async function complete() {
    const d = draftRef.current;
    if (!d || busy) return;
    setShowErrors(true);
    const missingNote = CHECK_ITEMS.find((c) => d.checklist[c.key]?.ok === false && !d.checklist[c.key].note.trim());
    if (missingNote) return setError(`Mục "${missingNote.label}" đánh dấu ✗ cần có chú thích.`);
    setBusy('Đang lưu…');
    setError('');
    const { data, error: e } = await supabase.rpc('kx_complete_inspection', {
      p_id: d.inspectionId,
      p_checklist: d.checklist,
      p_other_note: d.otherNote,
      p_abnormal: d.abnormal,
      p_abnormal_note: d.abnormalNote,
    });
    setBusy('');
    if (e) return setError(friendlyError(e));
    await clearDraft(userId);
    setDone({
      id: d.inspectionId,
      level: data as Level,
      plate: vehicles.find((v) => v.id === d.vehicleId)?.plate ?? '',
      at: new Date().toISOString(),
    });
    draftRef.current = null;
    setDraftState(null);
    setPhase('done');
    refresh();
  }

  const goStep = (step: 'photos' | 'checklist') => {
    updateDraft({ step });
    setPhase(step);
    setError('');
    window.scrollTo({ top: 0 });
  };

  const results = useMemo(
    () =>
      vehicles
        .map((v) => ({ v, score: matchPlate(v.plate, query) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.v.plate.localeCompare(b.v.plate))
        .slice(0, 40)
        .map((x) => x.v),
    [vehicles, query],
  );

  if (loading) return <SkeletonRows n={8} />;

  const vehicle = vehicles.find((v) => v.id === (draft?.vehicleId ?? pickedId)) ?? null;
  const vsum = vehicle ? summary[vehicle.id] : undefined;
  const requiredDone = REQUIRED_SLOTS.filter((s) => photos[s.key]?.state === 'done').length;
  const missingRequired = REQUIRED_SLOTS.filter((s) => !photos[s.key]);
  const uploading = Object.values(photos).some((p) => p.state !== 'done');
  const liveLevel = draft ? computeLevel(draft.checklist, draft.abnormal) : null;
  const stepIndex = STEPS.findIndex((s) => s.key === phase);

  // ---------- Hoàn tất ----------
  if (phase === 'done' && done)
    return (
      <div className="stack-lg">
        <div className="card done-card stack">
          <div className="done-icon">✓</div>
          <h2>Đã hoàn tất kiểm tra xe</h2>
          <div className="plate plate-lg">{done.plate}</div>
          <LevelBadge level={done.level} big />
          <p className="muted small">Hoàn tất lúc {fmtDateTime(done.at)}</p>
          <Link className="btn btn-ghost btn-block" to={`/phieu/${done.id}`}>
            Xem báo cáo
          </Link>
        </div>
        <div className="actionbar">
          <button className="btn btn-primary btn-lg btn-block" onClick={backToPick}>
            Kiểm tra xe khác
          </button>
        </div>
      </div>
    );

  return (
    <div className="stack-lg">
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i < stepIndex ? 'past' : i === stepIndex ? 'current' : ''}>
            <span className="stepper-n">{i < stepIndex ? '✓' : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {loadError && (
        <div className="alert alert-bad">
          {loadError}{' '}
          <button className="btn btn-sm btn-ghost" onClick={refresh}>
            Thử lại
          </button>
        </div>
      )}

      {/* ---------- ① Chọn xe ---------- */}
      {phase === 'pick' && (
        <>
          {openOwn && (
            <div className="alert alert-warn stack">
              <span>
                Bạn đang kiểm tra dở xe <strong>{vehicles.find((v) => v.id === openOwn.vehicle_id)?.plate ?? '—'}</strong> từ{' '}
                {fmtDateTime(openOwn.started_at)}.
              </span>
              <button className="btn btn-primary" disabled={!!busy} onClick={() => resume(openOwn)}>
                Tiếp tục kiểm tra
              </button>
            </div>
          )}

          {vehicle ? (
            <>
              <VehicleCard vehicle={vehicle} summary={vsum} />
              {vsum?.open_inspector_id && vsum.open_inspector_id !== userId && (
                <div className="alert alert-warn">
                  Xe đang được {vsum.open_inspector} kiểm tra từ {fmtDateTime(vsum.open_started_at)}.
                </div>
              )}
              <button className="btn btn-ghost" onClick={() => setPickedId(null)}>
                ← Chọn xe khác
              </button>
            </>
          ) : (
            <div className="card stack">
              <label className="field">
                <span>Biển số xe</span>
                <input
                  className="input input-plate"
                  autoFocus
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="Ví dụ 50H214"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {!vehicles.length ? (
                <p className="empty">Chưa có dữ liệu xe. Báo quản lý bấm "Đồng bộ xe từ Sheet" ở tab Tổng quan.</p>
              ) : !results.length ? (
                <p className="empty">Không tìm thấy biển số này. Kiểm tra lại số đã gõ.</p>
              ) : (
                <ul className="vlist">
                  {results.map((v) => (
                    <li key={v.id}>
                      <button onClick={() => setPickedId(v.id)}>
                        <span className="plate">{v.plate}</span>
                        <span className="muted small">{[v.fleet, v.brand].filter(Boolean).join(' · ')}</span>
                        <LevelBadge level={summary[v.id]?.last_level} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <div className="alert alert-bad">{error}</div>}
          {vehicle && (
            <div className="actionbar">
              <button className="btn btn-primary btn-lg btn-block" disabled={!!busy} onClick={start}>
                {busy || 'Tiến hành kiểm tra xe'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ---------- ② Chụp hình ---------- */}
      {phase === 'photos' && draft && (
        <>
          <div className="strip">
            <span className="plate">{vehicle?.plate}</span>
            <span className={'muted small' + (requiredDone === REQUIRED_SLOTS.length ? ' ok-text' : '')}>
              {requiredDone}/{REQUIRED_SLOTS.length} ảnh bắt buộc
            </span>
          </div>
          <PhotoStep photos={photos} onPhoto={onPhoto} onRetry={onRetry} onRemove={onRemove} />
          {error && <div className="alert alert-bad">{error}</div>}
          <button className="btn btn-ghost btn-block danger-text" disabled={!!busy} onClick={cancel}>
            Hủy phiếu kiểm tra
          </button>
          <div className="actionbar">
            {missingRequired.length > 0 ? (
              <p className="actionbar-hint">Còn thiếu: {missingRequired.map((s) => s.label).join(', ')}</p>
            ) : uploading ? (
              <p className="actionbar-hint">Đang tải ảnh lên, đợi chút…</p>
            ) : null}
            <button
              className="btn btn-primary btn-lg btn-block"
              disabled={missingRequired.length > 0 || uploading}
              onClick={() => goStep('checklist')}
            >
              Tiếp: Checklist →
            </button>
          </div>
        </>
      )}

      {/* ---------- ③ Checklist ---------- */}
      {phase === 'checklist' && draft && liveLevel && (
        <>
          <div className="strip">
            <span className="plate">{vehicle?.plate}</span>
            <span className="strip-level">
              <span className="muted small">Mức hiện tại</span> <LevelBadge level={liveLevel} />
            </span>
          </div>
          <ChecklistStep
            checklist={draft.checklist}
            otherNote={draft.otherNote}
            abnormal={draft.abnormal}
            abnormalNote={draft.abnormalNote}
            showErrors={showErrors}
            onChange={(p) => updateDraft(p)}
          />
          {error && <div className="alert alert-bad">{error}</div>}
          <button className="btn btn-ghost btn-block" onClick={() => goStep('photos')}>
            ← Quay lại ảnh
          </button>
          <div className="actionbar">
            <button className="btn btn-primary btn-lg btn-block" disabled={!!busy} onClick={complete}>
              {busy || 'Hoàn tất kiểm tra xe'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

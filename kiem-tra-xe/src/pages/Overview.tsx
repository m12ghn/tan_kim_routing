import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { callApi } from '../lib/api';
import { loadVehicles } from '../lib/vehicles';
import { failedItems, type Checklist } from '../lib/checklist';
import { downloadXlsx } from '../lib/excel';
import { EMPTY, fmtDate, fmtDateTime, fmtNum, fmtPct, todayVN } from '../lib/format';
import { LEVEL_LABEL, type Level, type Vehicle, type VehicleSummary } from '../lib/types';
import KpiCard, { type Tone } from '../components/KpiCard';
import Insights from '../components/Insights';
import MultiSelect, { type Option } from '../components/MultiSelect';
import Pager, { PAGE_SIZE } from '../components/Pager';
import { SkeletonCards, SkeletonRows } from '../components/Skeleton';
import { LevelBadge } from '../components/StatusBadge';

type Row = { v: Vehicle; s: VehicleSummary | undefined; level: Level | 'none'; state: 'done' | 'none' | 'open' };

const LEVEL_OPTIONS: Option[] = [
  ...(Object.entries(LEVEL_LABEL) as [Level, string][]).map(([value, label]) => ({ value, label })),
  { value: 'none', label: 'Chưa kiểm tra' },
];
const STATE_OPTIONS: Option[] = [
  { value: 'done', label: 'Đã kiểm tra' },
  { value: 'none', label: 'Chưa kiểm tra' },
  { value: 'open', label: 'Đang kiểm tra' },
];
const OPEN_TOO_LONG_MS = 2 * 3_600_000;

const uniq = (xs: string[]): Option[] =>
  [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')).map((x) => ({ value: x, label: x }));

export default function Overview() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [summary, setSummary] = useState<Record<string, VehicleSummary>>({});
  const [details, setDetails] = useState<Record<string, { checklist: Checklist; abnormal_note: string }>>({});
  const [sync, setSync] = useState<{ busy: boolean; msg: string; bad: boolean }>({ busy: false, msg: '', bad: false });
  const [exporting, setExporting] = useState(false);

  const [fPlate, setFPlate] = useState<string[]>([]);
  const [fFleet, setFFleet] = useState<string[]>([]);
  const [fLevel, setFLevel] = useState<string[]>([]);
  const [fState, setFState] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fBrand, setFBrand] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { vehicles: v, summary: s } = await loadVehicles();
      setVehicles(v);
      setSummary(s);
      // Chi tiết checklist của lần kiểm tra gần nhất có vấn đề, để viết "Điểm cần lưu ý".
      const ids = Object.values(s)
        .filter((x) => x.last_inspection_id && x.last_level && x.last_level !== 'normal')
        .map((x) => x.last_inspection_id!);
      if (ids.length) {
        const { data, error: e } = await supabase.from('kx_inspections').select('id, checklist, abnormal_note').in('id', ids);
        if (e) throw e;
        setDetails(Object.fromEntries((data ?? []).map((d) => [d.id, d])));
      } else setDetails({});
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncNow() {
    if (sync.busy) return;
    setSync({ busy: true, msg: 'Đang đọc Google Sheet…', bad: false });
    try {
      const r = await callApi<{ total: number; deactivated: number }>('/api/sync-vehicles');
      setSync({
        busy: false,
        bad: false,
        msg: `Đã đồng bộ ${fmtNum(r.total)} xe${r.deactivated ? `, ${fmtNum(r.deactivated)} xe không còn trong sheet đã ẩn` : ''}.`,
      });
      load();
    } catch (e) {
      setSync({ busy: false, bad: true, msg: friendlyError(e) });
    }
  }

  const rows: Row[] = useMemo(
    () =>
      vehicles.map((v) => {
        const s = summary[v.id];
        return {
          v,
          s,
          level: s?.last_level ?? 'none',
          state: s?.open_inspection_id ? 'open' : s?.last_completed_at ? 'done' : 'none',
        };
      }),
    [vehicles, summary],
  );

  const stats = useMemo(() => {
    const total = rows.length;
    const inspected = rows.filter((r) => r.s?.last_completed_at);
    const by = (l: Level) => rows.filter((r) => r.level === l);
    return {
      total,
      inspected: inspected.length,
      pct: total ? (inspected.length / total) * 100 : null,
      open: rows.filter((r) => r.s?.open_inspection_id),
      normal: by('normal'),
      review: by('review'),
      abnormal: by('abnormal'),
      none: rows.filter((r) => !r.s?.last_completed_at),
    };
  }, [rows]);

  // ---------- Điểm sáng / cần lưu ý (tự sinh) ----------
  const good: string[] = [];
  const bad: string[] = [];
  if (stats.total && stats.inspected === stats.total) good.push(`Đã kiểm tra đủ ${fmtNum(stats.total)}/${fmtNum(stats.total)} xe.`);
  else if (stats.inspected) good.push(`Đã kiểm tra ${fmtNum(stats.inspected)}/${fmtNum(stats.total)} xe (${fmtPct(stats.pct)}).`);
  if (stats.normal.length) good.push(`${fmtNum(stats.normal.length)} xe Bình thường ở lần kiểm tra gần nhất.`);
  for (const r of stats.abnormal.slice(0, 5)) {
    const note = details[r.s!.last_inspection_id!]?.abnormal_note;
    bad.push(`${r.v.plate} Bất thường — cần sửa chữa${note ? `: ${note}` : ''}.`);
  }
  if (stats.abnormal.length > 5) bad.push(`Còn ${fmtNum(stats.abnormal.length - 5)} xe Bất thường khác, lọc Mức = Bất thường để xem.`);
  if (stats.review.length) {
    const sample = stats.review
      .slice(0, 4)
      .map((r) => {
        const items = failedItems(details[r.s!.last_inspection_id!]?.checklist ?? {}).map((c) => c.label);
        return items.length ? `${r.v.plate} (${items.join(', ')})` : r.v.plate;
      })
      .join('; ');
    bad.push(`${fmtNum(stats.review.length)} xe cần Xem xét: ${sample}${stats.review.length > 4 ? '…' : ''}`);
  }
  const stale = stats.open.filter((r) => Date.now() - new Date(r.s!.open_started_at!).getTime() > OPEN_TOO_LONG_MS);
  if (stale.length)
    bad.push(`${fmtNum(stale.length)} phiếu kiểm tra dở quá 2 giờ: ${stale.slice(0, 5).map((r) => `${r.v.plate} (${r.s!.open_inspector})`).join(', ')}.`);
  if (stats.none.length && stats.total) bad.push(`${fmtNum(stats.none.length)} xe chưa kiểm tra lần nào.`);

  const pctTone: Tone = stats.pct == null ? 'neutral' : stats.pct >= 100 ? 'good' : stats.pct >= 70 ? 'warn' : 'bad';

  // ---------- Lọc ----------
  const plateOptions = useMemo(() => vehicles.map((v) => ({ value: v.id, label: v.plate })), [vehicles]);
  const fleetOptions = useMemo(() => uniq(vehicles.map((v) => v.fleet)), [vehicles]);
  const statusOptions = useMemo(() => uniq(vehicles.map((v) => v.sheet_status)), [vehicles]);
  const brandOptions = useMemo(() => uniq(vehicles.map((v) => v.brand)), [vehicles]);

  const filtered = rows.filter(
    (r) =>
      (!fPlate.length || fPlate.includes(r.v.id)) &&
      (!fFleet.length || fFleet.includes(r.v.fleet)) &&
      (!fLevel.length || fLevel.includes(r.level)) &&
      (!fState.length || fState.includes(r.state)) &&
      (!fStatus.length || fStatus.includes(r.v.sheet_status)) &&
      (!fBrand.length || fBrand.includes(r.v.brand)),
  );
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [fPlate, fFleet, fLevel, fState, fStatus, fBrand]);

  const labelsOf = (vals: string[], opts: Option[]) => vals.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(', ');
  const viewing =
    [
      fPlate.length && `${fPlate.length} xe`,
      fFleet.length && `Đội ${fFleet.join(', ')}`,
      fLevel.length && labelsOf(fLevel, LEVEL_OPTIONS),
      fState.length && labelsOf(fState, STATE_OPTIONS),
      fStatus.length && fStatus.join(', '),
      fBrand.length && fBrand.join(', '),
    ]
      .filter(Boolean)
      .join(' · ') || 'tất cả xe';

  const reset = () => {
    setFPlate([]);
    setFFleet([]);
    setFLevel([]);
    setFState([]);
    setFStatus([]);
    setFBrand([]);
  };

  const levelText = (r: Row) => (r.level === 'none' ? 'Chưa kiểm tra' : LEVEL_LABEL[r.level]);

  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadXlsx(
        `kiem-tra-xe-${todayVN()}.xlsx`,
        ['Biển số', 'Đội xe', 'Hãng xe', 'Model', 'Tải trọng (kg)', 'Năm SX', 'Tình trạng', 'ODO (km)', 'Ngày ODO', 'Mức hiện tại', 'Kiểm tra gần nhất', 'Người kiểm tra', 'Số lần kiểm tra', 'Đang kiểm tra'],
        filtered.map((r) => [
          r.v.plate,
          r.v.fleet,
          r.v.brand,
          r.v.model,
          r.v.payload_kg,
          r.v.year,
          r.v.sheet_status,
          r.v.odo,
          r.v.odo_at ? fmtDate(r.v.odo_at) : null,
          levelText(r),
          r.s?.last_completed_at ? fmtDateTime(r.s.last_completed_at) : null,
          r.s?.last_inspector ?? null,
          r.s?.completed_count ?? 0,
          r.s?.open_inspector ? `${r.s.open_inspector} từ ${fmtDateTime(r.s.open_started_at)}` : null,
        ]),
      );
    } catch {
      setError('Không tạo được file Excel. Hãy thử lại.');
    } finally {
      setExporting(false);
    }
  }

  const lastSync = vehicles.reduce<string | null>((m, v) => (v.synced_at && (!m || v.synced_at > m) ? v.synced_at : m), null);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Tiến độ kiểm tra xe</h1>
          <p className="muted small">
            Dữ liệu xe từ Google Sheet "Data xe" · cập nhật {lastSync ? fmtDateTime(lastSync) : 'chưa đồng bộ'}
          </p>
        </div>
        {isManager && (
          <button className="btn btn-ghost" disabled={sync.busy} onClick={syncNow}>
            {sync.busy ? 'Đang đồng bộ…' : '⟳ Đồng bộ xe từ Sheet'}
          </button>
        )}
      </div>
      {sync.msg && <div className={`alert ${sync.bad ? 'alert-bad' : 'alert-good'}`}>{sync.msg}</div>}

      {error && (
        <div className="alert alert-bad">
          {error}{' '}
          <button className="btn btn-sm btn-ghost" onClick={load}>
            Thử lại
          </button>
        </div>
      )}

      {loading ? (
        <>
          <SkeletonCards n={6} />
          <SkeletonRows />
        </>
      ) : (
        <>
          <Insights good={good} bad={bad} />

          <div className="kpi-grid">
            <KpiCard label="Tổng xe" value={fmtNum(stats.total)} unit="xe" hint="Toàn bộ xe trong sheet Data xe" />
            <KpiCard label="Tiến độ" value={fmtPct(stats.pct)} tone={pctTone} hint="Số xe đã kiểm tra ít nhất 1 lần / tổng xe" />
            <KpiCard label="Đã kiểm tra" value={fmtNum(stats.inspected)} unit="xe" />
            <KpiCard label="Đang kiểm tra" value={fmtNum(stats.open.length)} unit="xe" tone={stale.length ? 'warn' : 'neutral'} />
            <KpiCard label="✓ Bình thường" value={fmtNum(stats.normal.length)} unit="xe" tone="good" hint="Mức ở lần kiểm tra gần nhất" />
            <KpiCard label="⚠ Xem xét" value={fmtNum(stats.review.length)} unit="xe" tone={stats.review.length ? 'warn' : 'neutral'} hint="Có ít nhất 1 mục checklist ✗" />
            <KpiCard label="✕ Bất thường" value={fmtNum(stats.abnormal.length)} unit="xe" tone={stats.abnormal.length ? 'bad' : 'neutral'} hint="Đánh dấu Bất thường — Cần sửa chữa" />
          </div>

          <div className="card stack">
            <div className="filters">
              <MultiSelect label="Biển số" options={plateOptions} value={fPlate} onChange={setFPlate} />
              <MultiSelect label="Đội xe" options={fleetOptions} value={fFleet} onChange={setFFleet} />
              <MultiSelect label="Mức hiện tại" options={LEVEL_OPTIONS} value={fLevel} onChange={setFLevel} />
              <MultiSelect label="Kiểm tra" options={STATE_OPTIONS} value={fState} onChange={setFState} />
              <MultiSelect label="Tình trạng xe" options={statusOptions} value={fStatus} onChange={setFStatus} />
              <MultiSelect label="Hãng xe" options={brandOptions} value={fBrand} onChange={setFBrand} />
            </div>
            <div className="toolbar">
              <p className="muted small">
                Đang xem: {viewing} · {fmtNum(filtered.length)} xe
              </p>
              <div className="row">
                <button className="btn btn-ghost btn-sm" onClick={reset}>
                  ↺ Đặt lại bộ lọc
                </button>
                <button className="btn btn-ghost btn-sm" disabled={exporting || !filtered.length} onClick={exportExcel}>
                  {exporting ? 'Đang tạo file…' : '⬇ Tải Excel (.xlsx)'}
                </button>
              </div>
            </div>

            {!vehicles.length ? (
              <p className="empty">
                Chưa có dữ liệu xe.{' '}
                {isManager ? 'Bấm "⟳ Đồng bộ xe từ Sheet" ở trên để lấy danh sách xe.' : 'Báo quản lý đồng bộ dữ liệu xe.'}
              </p>
            ) : !filtered.length ? (
              <p className="empty">Không có xe nào khớp bộ lọc. Hãy đổi bộ lọc hoặc bấm ↺ Đặt lại.</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Biển số</th>
                        <th>Đội xe</th>
                        <th>Hãng xe</th>
                        <th className="num">Tải trọng (kg)</th>
                        <th>Tình trạng</th>
                        <th className="num">ODO (km)</th>
                        <th>Mức hiện tại</th>
                        <th>Kiểm tra gần nhất</th>
                        <th>Người kiểm tra</th>
                        <th className="num">Số lần</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => (
                        <tr
                          key={r.v.id}
                          className={r.s?.last_inspection_id ? 'clickable' : ''}
                          onClick={() => r.s?.last_inspection_id && navigate(`/phieu/${r.s.last_inspection_id}`)}
                        >
                          <td className="strong">{r.v.plate}</td>
                          <td>{r.v.fleet || EMPTY}</td>
                          <td>{r.v.brand || EMPTY}</td>
                          <td className="num">{fmtNum(r.v.payload_kg)}</td>
                          <td>{r.v.sheet_status || EMPTY}</td>
                          <td className="num">{fmtNum(r.v.odo)}</td>
                          <td>
                            <LevelBadge level={r.s?.last_level} />
                            {r.s?.open_inspection_id && <span className="badge badge-warn"> ⟳ Đang kiểm tra</span>}
                          </td>
                          <td>{fmtDateTime(r.s?.last_completed_at)}</td>
                          <td>{r.s?.last_inspector || EMPTY}</td>
                          <td className="num">{r.s?.completed_count ? fmtNum(r.s.completed_count) : EMPTY}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={page} total={filtered.length} onPage={setPage} />
              </>
            )}
            <p className="muted small">Bấm vào một dòng để xem báo cáo lần kiểm tra gần nhất của xe.</p>
          </div>
        </>
      )}
    </div>
  );
}

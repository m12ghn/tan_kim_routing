import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, friendlyError } from '../lib/supabase';
import { dayRangeVN, EMPTY, fmtDate, fmtDateTime, fmtNum, fmtPct, todayVN } from '../lib/format';
import { STATUS_LABEL, RESULT_LABEL, type Inspection, type Profile, type Vehicle } from '../lib/types';
import KpiCard, { type Tone } from '../components/KpiCard';
import Insights from '../components/Insights';
import MultiSelect from '../components/MultiSelect';
import Pager, { PAGE_SIZE } from '../components/Pager';
import { SkeletonCards, SkeletonRows } from '../components/Skeleton';
import { ResultBadge, StatusBadge } from '../components/StatusBadge';

type Row = {
  vehicle: Vehicle;
  insp: (Inspection & { photo_count: number }) | null;
  inspector: string;
  state: string; // 'pending' | trạng thái phiếu
};

const STATE_OPTIONS = [
  { value: 'pending', label: 'Chưa kiểm tra' },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
];
const RESULT_OPTIONS = Object.entries(RESULT_LABEL).map(([value, label]) => ({ value, label }));

export default function Overview() {
  const [day, setDay] = useState(todayVN);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [inspections, setInspections] = useState<(Inspection & { photo_count: number })[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});

  const [fPlate, setFPlate] = useState<string[]>([]);
  const [fState, setFState] = useState<string[]>([]);
  const [fResult, setFResult] = useState<string[]>([]);
  const [fPerson, setFPerson] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [from, to] = dayRangeVN(day);
      const [v, i, p] = await Promise.all([
        supabase.from('kx_vehicles').select('*').eq('active', true).order('plate'),
        supabase
          .from('kx_inspections')
          .select('*, kx_inspection_photos(count)')
          .gte('created_at', from)
          .lt('created_at', to)
          .order('created_at', { ascending: false }),
        supabase.from('kx_members').select('id, username, full_name, role, active'),
      ]);
      if (v.error) throw v.error;
      if (i.error) throw i.error;
      if (p.error) throw p.error;
      setVehicles(v.data as Vehicle[]);
      setInspections(
        (i.data ?? []).map((r: Inspection & { kx_inspection_photos?: { count: number }[] }) => ({
          ...r,
          photo_count: r.kx_inspection_photos?.[0]?.count ?? 0,
        })),
      );
      setPeople(Object.fromEntries((p.data as Profile[]).map((x) => [x.id, x])));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  // Mỗi xe lấy phiếu mới nhất trong ngày.
  const rows: Row[] = useMemo(() => {
    const latest = new Map<string, Inspection & { photo_count: number }>();
    for (const i of inspections) if (!latest.has(i.vehicle_id)) latest.set(i.vehicle_id, i);
    return vehicles.map((vehicle) => {
      const insp = latest.get(vehicle.id) ?? null;
      const p = insp ? people[insp.inspector_id] : undefined;
      return {
        vehicle,
        insp,
        inspector: p ? `${p.username} · ${p.full_name}` : insp ? EMPTY : '',
        state: insp ? insp.status : 'pending',
      };
    });
  }, [vehicles, inspections, people]);

  const stats = useMemo(() => {
    const total = rows.length;
    const done = rows.filter((r) => r.insp).length;
    const issue = rows.filter((r) => r.insp?.result === 'issue');
    const waiting = rows.filter((r) => r.state === 'submitted').length;
    const rejected = rows.filter((r) => r.state === 'rejected');
    const pct = total ? (done / total) * 100 : null;
    return { total, done, pending: total - done, issue, waiting, rejected, pct };
  }, [rows]);

  const good: string[] = [];
  const bad: string[] = [];
  if (stats.total && stats.pending === 0) good.push(`Đã kiểm tra đủ ${fmtNum(stats.total)}/${fmtNum(stats.total)} xe trong ngày.`);
  if (stats.done && stats.issue.length === 0) good.push(`${fmtNum(stats.done)} xe đã kiểm tra đều đạt, không có vấn đề.`);
  if (stats.pending > 0 && stats.total)
    bad.push(
      `${fmtNum(stats.pending)} xe chưa kiểm tra: ${rows
        .filter((r) => !r.insp)
        .slice(0, 5)
        .map((r) => r.vehicle.plate)
        .join(', ')}${stats.pending > 5 ? '…' : ''}`,
    );
  if (stats.issue.length) bad.push(`${fmtNum(stats.issue.length)} xe có vấn đề: ${stats.issue.slice(0, 5).map((r) => r.vehicle.plate).join(', ')}`);
  if (stats.rejected.length) bad.push(`${fmtNum(stats.rejected.length)} phiếu bị trả lại cần kiểm tra lại: ${stats.rejected.slice(0, 5).map((r) => r.vehicle.plate).join(', ')}`);
  if (stats.waiting) bad.push(`${fmtNum(stats.waiting)} phiếu đang chờ duyệt.`);

  const pctTone: Tone = stats.pct == null ? 'neutral' : stats.pct >= 100 ? 'good' : stats.pct >= 70 ? 'warn' : 'bad';

  const plateOptions = useMemo(() => vehicles.map((v) => ({ value: v.id, label: v.plate })), [vehicles]);
  const personOptions = useMemo(
    () => Object.values(people).map((p) => ({ value: p.id, label: `${p.username} · ${p.full_name}` })),
    [people],
  );

  const filtered = rows.filter(
    (r) =>
      (!fPlate.length || fPlate.includes(r.vehicle.id)) &&
      (!fState.length || fState.includes(r.state)) &&
      (!fResult.length || (r.insp && fResult.includes(r.insp.result))) &&
      (!fPerson.length || (r.insp && fPerson.includes(r.insp.inspector_id))),
  );
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [fPlate, fState, fResult, fPerson, day]);

  const viewing = [
    `ngày ${fmtDate(day)}`,
    fPlate.length && `${fPlate.length} xe`,
    fState.length && fState.map((s) => STATE_OPTIONS.find((o) => o.value === s)?.label).join(', '),
    fResult.length && fResult.map((s) => RESULT_LABEL[s as 'ok' | 'issue']).join(', '),
    fPerson.length && `${fPerson.length} người kiểm tra`,
  ]
    .filter(Boolean)
    .join(' · ');

  const reset = () => {
    setFPlate([]);
    setFState([]);
    setFResult([]);
    setFPerson([]);
    setDay(todayVN());
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Tiến độ kiểm tra xe</h1>
        <label className="field field-inline">
          <span>Ngày</span>
          <input type="date" value={day} max={todayVN()} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
      </div>

      {error && (
        <div className="alert alert-bad">
          {error}{' '}
          <button className="btn btn-ghost" onClick={load}>
            Thử lại
          </button>
        </div>
      )}

      {loading ? (
        <>
          <SkeletonCards n={5} />
          <SkeletonRows />
        </>
      ) : (
        <>
          <Insights good={good} bad={bad} />

          <div className="kpi-grid">
            <KpiCard label="Xe theo dõi" value={fmtNum(stats.total)} unit="xe" hint="Số xe đang hoạt động cần kiểm tra mỗi ngày" />
            <KpiCard label="Tiến độ" value={fmtPct(stats.pct)} tone={pctTone} hint="Số xe đã có phiếu trong ngày / tổng số xe" />
            <KpiCard label="Chưa kiểm tra" value={fmtNum(stats.pending)} unit="xe" tone={stats.pending ? 'warn' : 'good'} />
            <KpiCard label="Có vấn đề" value={fmtNum(stats.issue.length)} unit="xe" tone={stats.issue.length ? 'bad' : 'good'} hint="Phiếu được đánh dấu ⚠ Có vấn đề" />
            <KpiCard label="Chờ duyệt" value={fmtNum(stats.waiting)} unit="phiếu" tone={stats.waiting ? 'warn' : 'neutral'} />
          </div>

          <div className="card stack">
            <div className="filters">
              <MultiSelect label="Biển số" options={plateOptions} value={fPlate} onChange={setFPlate} />
              <MultiSelect label="Trạng thái" options={STATE_OPTIONS} value={fState} onChange={setFState} />
              <MultiSelect label="Kết quả" options={RESULT_OPTIONS} value={fResult} onChange={setFResult} />
              <MultiSelect label="Người kiểm tra" options={personOptions} value={fPerson} onChange={setFPerson} />
              <button className="btn btn-ghost filters-reset" onClick={reset}>
                ↺ Đặt lại bộ lọc
              </button>
            </div>
            <p className="muted small">Đang xem: {viewing}</p>

            {!vehicles.length ? (
              <p className="empty">Chưa có xe nào trong danh mục. Quản lý thêm xe vào bảng vehicles để bắt đầu theo dõi.</p>
            ) : !filtered.length ? (
              <p className="empty">Không có xe nào khớp bộ lọc. Hãy đổi bộ lọc hoặc bấm ↺ Đặt lại.</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Biển số</th>
                        <th>Loại xe</th>
                        <th>Trạng thái</th>
                        <th>Kết quả</th>
                        <th className="num">ODO (km)</th>
                        <th className="num">Số ảnh</th>
                        <th>Người kiểm tra</th>
                        <th>Giờ gửi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => (
                        <tr key={r.vehicle.id}>
                          <td>
                            {r.insp ? <Link to={`/phieu/${r.insp.id}`}>{r.vehicle.plate}</Link> : r.vehicle.plate}
                          </td>
                          <td>{r.vehicle.vehicle_type || EMPTY}</td>
                          <td>{r.insp ? <StatusBadge status={r.insp.status} /> : <span className="badge">Chưa kiểm tra</span>}</td>
                          <td>{r.insp ? <ResultBadge result={r.insp.result} /> : EMPTY}</td>
                          <td className="num">{fmtNum(r.insp?.odo)}</td>
                          <td className="num">{r.insp ? fmtNum(r.insp.photo_count) : EMPTY}</td>
                          <td>{r.inspector || EMPTY}</td>
                          <td>{fmtDateTime(r.insp?.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={page} total={filtered.length} onPage={setPage} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

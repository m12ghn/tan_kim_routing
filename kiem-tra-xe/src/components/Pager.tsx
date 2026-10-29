import { fmtNum } from '../lib/format';

export const PAGE_SIZE = 25;

export default function Pager(props: { page: number; total: number; onPage: (p: number) => void; size?: number }) {
  const { page, total, onPage, size = PAGE_SIZE } = props;
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return <div className="pager muted">Tổng {fmtNum(total)}</div>;
  return (
    <div className="pager">
      <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Trước
      </button>
      <span className="muted">
        Trang {page} / {pages} · tổng {fmtNum(total)}
      </span>
      <button className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Sau →
      </button>
    </div>
  );
}

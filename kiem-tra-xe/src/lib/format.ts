const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const TZ = 'Asia/Ho_Chi_Minh';

export const EMPTY = '—';

export function fmtNum(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? EMPTY : nf.format(n);
}

export function fmtPct(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? EMPTY : `${nf.format(n)}%`;
}

function parts(d: Date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { dd: g('day'), mm: g('month'), yyyy: g('year'), hh: g('hour'), mi: g('minute') };
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return EMPTY;
  const { dd, mm, yyyy } = parts(new Date(v));
  return `${dd}/${mm}/${yyyy}`;
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return EMPTY;
  const { dd, mm, yyyy, hh, mi } = parts(new Date(v));
  return `${hh}:${mi} ${dd}/${mm}/${yyyy}`;
}

/** Ngày hôm nay theo giờ Việt Nam, dạng yyyy-mm-dd (cho ô chọn ngày). */
export function todayVN(): string {
  const { dd, mm, yyyy } = parts(new Date());
  return `${yyyy}-${mm}-${dd}`;
}

/** Khoảng [00:00, 24:00) của một ngày yyyy-mm-dd theo giờ Việt Nam, dạng ISO. */
export function dayRangeVN(day: string): [string, string] {
  const start = new Date(`${day}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return [start.toISOString(), end.toISOString()];
}

/** Bỏ dấu tiếng Việt để tìm kiếm không cần dấu. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

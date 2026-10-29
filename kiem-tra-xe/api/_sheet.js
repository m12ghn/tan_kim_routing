// Đọc sheet "Data xe" bằng Google service account (chỉ quyền xem). Không dùng thư viện googleapis cho nhẹ.
import { createSign } from 'node:crypto';
import { httpError } from './_shared.js';

export const DEFAULT_SHEET_ID = '1E_fYmNK3TIEMt3xz7JTwG5kmttz_lKbr8xtWRYTDQOY';
export const SHEET_TAB = 'Data xe';

async function accessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw httpError(500, `Google từ chối tài khoản dịch vụ (${j.error_description || j.error || r.status}). Kiểm tra lại GOOGLE_PRIVATE_KEY.`);
  return j.access_token;
}

export async function readSheetValues() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const sheetId = process.env.VEHICLE_SHEET_ID || DEFAULT_SHEET_ID;
  if (!email || !key) throw httpError(500, 'Server chưa cấu hình GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY (thêm trên Vercel rồi Redeploy).');
  const token = await accessToken(email, key);
  const range = encodeURIComponent(`'${SHEET_TAB}'!A1:AR`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403 || r.status === 404)
    throw httpError(500, `Không đọc được sheet. Hãy share sheet cho ${email} (quyền Xem) và kiểm tra tab "${SHEET_TAB}" còn tồn tại.`);
  if (!r.ok) throw httpError(500, `Lỗi đọc Google Sheet: ${j.error?.message || r.status}`);
  return j.values || [];
}

// ---------- Chuyển dữ liệu sheet thành danh sách xe ----------

const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

function toInt(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const s = clean(v).replace(/[^\d]/g, '');
  return s ? Number(s) : null;
}

// Ngày trong sheet lẫn lộn: số serial (46474) hoặc chuỗi dd/mm/yyyy. Trả về yyyy-mm-dd hoặc null.
export function toDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const m = clean(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  let [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let day = a, month = b;
  if (b > 12 && a <= 12) [day, month] = [b, a]; // dạng mm/dd/yyyy
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizePlate(v) {
  return clean(v).toUpperCase().replace(/\s+/g, '');
}

export function parseVehicles(values) {
  const hi = values.findIndex((row) => row.some((c) => clean(c) === 'Biển số'));
  if (hi < 0) throw httpError(500, 'Không tìm thấy dòng tiêu đề có cột "Biển số" trong tab Data xe.');
  const header = values[hi].map(clean);
  const col = (name, fallback) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const C = {
    status: col('Tình trạng', 0),
    plate: col('Biển số', 1),
    payload: col('Tải trọng', 2),
    brand: col('Hãng xe', 3),
    model: col('Model', 4),
    year: col('Năm SX', 5),
    odo: col('Số ODO', 36),
    odoAt: col('Thời gian up ODO', 37),
    // Có 2 cột "Đội xe" (AD và AQ). Người dùng chốt lấy cột AQ = cột "Đội xe" cuối cùng.
    fleet: header.lastIndexOf('Đội xe') >= 0 ? header.lastIndexOf('Đội xe') : 42,
  };
  const out = [];
  for (const row of values.slice(hi + 1)) {
    const plate = normalizePlate(row[C.plate]);
    if (!plate || !/[0-9]/.test(plate)) continue;
    out.push({
      plate,
      fleet: clean(row[C.fleet]),
      brand: clean(row[C.brand]),
      model: clean(row[C.model]),
      payload_kg: toInt(row[C.payload]),
      year: toInt(row[C.year]),
      sheet_status: clean(row[C.status]),
      odo: toInt(row[C.odo]),
      odo_at: toDate(row[C.odoAt]),
    });
  }
  return out;
}

// Vercel Serverless Function — đọc/ghi bộ tuyến cấu hình chung trong Supabase.
//   GET  /api/config                     -> { ok, data, version, updated_at }
//   PUT  /api/config  {data, baseVersion} -> { ok, version }  | 409 { ok:false, conflict:true, data, version }
// Dùng SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (biến môi trường Vercel, KHÔNG đưa vào code/HTML).
// Ghi có kiểm tra version (optimistic lock): nếu người khác lưu trước thì trả 409 kèm bản mới nhất.

const TABLE = 'tk_config', ROW_ID = 'main', MONTHS = ['T10', 'T11', 'T12'];
const MAX_BYTES = 500 * 1024;

function cfg() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  return { url, key };
}

async function sb(method, path, body, extraHeaders) {
  const { url, key } = cfg();
  const r = await fetch(url + '/rest/v1/' + path, {
    method,
    headers: Object.assign({
      apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
    }, extraHeaders || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* giữ text */ }
  if (!r.ok) { const err = new Error('Supabase ' + r.status + ': ' + text.slice(0, 300)); err.status = r.status; throw err; }
  return json;
}

function validate(data) {
  if (!data || typeof data !== 'object' || !data.months || typeof data.months !== 'object') return 'data.months thiếu';
  for (const m of Object.keys(data.months)) {
    if (MONTHS.indexOf(m) === -1) return 'tháng không hợp lệ: ' + m;
    const md = data.months[m];
    if (!md || !Array.isArray(md.custom) || !Array.isArray(md.excluded)) return 'months.' + m + ' phải có custom[] và excluded[]';
  }
  if (JSON.stringify(data).length > MAX_BYTES) return 'dữ liệu quá lớn';
  return null;
}

async function readRow() {
  const rows = await sb('GET', TABLE + '?id=eq.' + ROW_ID + '&select=data,version,updated_at');
  return rows && rows[0] ? rows[0] : null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { url, key } = cfg();
  if (!url || !key) {
    res.status(500).json({ ok: false, error: 'Chưa cấu hình SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trên Vercel' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const row = await readRow();
      if (!row) { res.status(200).json({ ok: true, data: {}, version: 0, updated_at: null }); return; }
      res.status(200).json({ ok: true, data: row.data, version: row.version, updated_at: row.updated_at });
      return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
      const err = body && validate(body.data);
      if (!body || err) { res.status(400).json({ ok: false, error: err || 'Body không hợp lệ' }); return; }
      const base = parseInt(body.baseVersion, 10) || 0;
      const next = base + 1;
      // Chỉ cập nhật nếu version trong DB đúng bằng baseVersion người dùng đang giữ
      let updated = await sb('PATCH', TABLE + '?id=eq.' + ROW_ID + '&version=eq.' + base,
        { data: body.data, version: next, updated_at: new Date().toISOString() },
        { Prefer: 'return=representation' });
      if (!updated || !updated.length) {
        const cur = await readRow();
        if (cur) { res.status(409).json({ ok: false, conflict: true, data: cur.data, version: cur.version }); return; }
        // chưa có dòng nào (chưa chạy seed) -> tạo mới
        updated = await sb('POST', TABLE, { id: ROW_ID, data: body.data, version: next }, { Prefer: 'return=representation' });
      }
      // lưu lịch sử; lỗi ghi lịch sử không làm hỏng việc lưu chính
      try { await sb('POST', TABLE + '_history', { version: next, data: body.data }); } catch (e) { /* bỏ qua */ }
      res.status(200).json({ ok: true, version: next });
      return;
    }
    res.status(405).json({ ok: false, error: 'Chỉ nhận GET/PUT' });
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
};

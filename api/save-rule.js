// Vercel Serverless Function — ghi luật config mới thẳng vào tab Config_Rules
// trên Google Sheet, dùng Google Service Account (server-to-server, không cần
// người dùng đăng nhập Google).
//
// CHƯA HOẠT ĐỘNG cho tới khi bạn:
//   1. Tạo 1 Service Account trên Google Cloud Console, bật Google Sheets API,
//      tải file JSON key.
//   2. Share Google Sheet "[TK] Config network" cho email của service account
//      (client_email trong file JSON) với quyền Editor.
//   3. Trong Vercel > Project Settings > Environment Variables, thêm:
//        GOOGLE_SERVICE_ACCOUNT_EMAIL = <client_email trong JSON key>
//        GOOGLE_PRIVATE_KEY           = <private_key trong JSON key, giữ nguyên \n>
//        SHEET_ID                     = 1tU1ehl5y79Y0s_nXPbnYmruaPBh9s0PJrYRoLviFutw
//   4. Deploy project này qua `vercel` CLI hoặc kết nối GitHub — deploy kiểu kéo
//      thả file .zip (Vercel Drop) KHÔNG chạy được serverless function, chỉ host
//      file tĩnh. Đây là thay đổi hạ tầng thật sự so với cách deploy hiện tại.
//   5. Sau khi deploy, sửa nút "Xuất luật mới" trong index.html thành gọi
//      fetch('/api/save-rule', {method:'POST', body: JSON.stringify({rows})})
//      thay vì chỉ hiện textarea để copy tay.
//
// npm install googleapis   (thêm vào package.json của project)

const { google } = require('googleapis');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Chỉ nhận POST' });
    return;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const sheetId = process.env.SHEET_ID;
  if (!email || !key || !sheetId) {
    res.status(500).json({
      ok: false,
      error: 'Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / SHEET_ID trên Vercel — xem hướng dẫn đầu file api/save-rule.js',
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const rows = body && body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ ok: false, error: 'Thiếu rows (mảng luật cần ghi)' });
    return;
  }

  // Mỗi row nên đúng thứ tự cột của tab Config_Rules:
  // hiệu_lực_từ, chiều, cấp_độ, tỉnh, quận, warehouse_id, tên, hàng, đích, ghi_chú
  const EXPECTED_COLS = 10;
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== EXPECTED_COLS) {
      res.status(400).json({ ok: false, error: `Mỗi row phải có đúng ${EXPECTED_COLS} cột theo thứ tự Config_Rules` });
      return;
    }
  }

  try {
    const auth = new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Config_Rules!A:J',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
    res.status(200).json({ ok: true, written: rows.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};

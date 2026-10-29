// Đồng bộ danh sách xe từ Google Sheet "Data xe" vào bảng kx_vehicles.
// - POST (nút "Đồng bộ ngay"): chỉ quản lý.
// - GET từ Vercel Cron (mỗi sáng): kèm header Authorization: Bearer <CRON_SECRET>.
import { adminClient, requireManager, httpError, sendError } from './_shared.js';
import { readSheetValues, parseVehicles } from './_sheet.js';

export default async function handler(req, res) {
  try {
    const admin = adminClient();
    if (req.method === 'GET') {
      const secret = process.env.CRON_SECRET;
      if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw httpError(401, 'Không có quyền.');
    } else if (req.method === 'POST') {
      await requireManager(req, admin);
    } else {
      throw httpError(405, 'Chỉ hỗ trợ GET (cron) hoặc POST.');
    }

    const vehicles = parseVehicles(await readSheetValues());
    if (vehicles.length < 10) throw httpError(500, `Sheet chỉ có ${vehicles.length} xe, nghi đọc sai tab. Không đồng bộ để tránh mất dữ liệu.`);
    const { data, error } = await admin.rpc('kx_sync_vehicles', { p_rows: vehicles });
    if (error) throw httpError(500, error.message);
    res.status(200).json({ total: vehicles.length, ...data });
  } catch (e) {
    sendError(res, e);
  }
}

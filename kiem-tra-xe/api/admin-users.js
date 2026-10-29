// Quản lý tài khoản (chỉ quản lý). Dùng service_role nên chỉ chạy trên server.
// POST { action: 'create', username, password, full_name, role }
// POST { action: 'set_password', user_id, password }
// POST { action: 'set_active', user_id, active }
import { adminClient, requireManager, usernameToEmail, httpError, sendError } from './_shared.js';

const ROLES = ['inspector', 'manager', 'dev'];

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw httpError(405, 'Chỉ hỗ trợ POST.');
    const admin = adminClient();
    const caller = await requireManager(req, admin);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    if (body.action === 'create') {
      const username = String(body.username || '').trim();
      if (!/^[a-z0-9._-]{3,32}$/i.test(username)) throw httpError(400, 'Tên đăng nhập 3–32 ký tự, chỉ chữ, số, . _ -');
      if (String(body.password || '').length < 8) throw httpError(400, 'Mật khẩu tối thiểu 8 ký tự.');
      const role = ROLES.includes(body.role) ? body.role : 'inspector';
      if (role === 'dev' && caller.role !== 'dev') throw httpError(403, 'Chỉ dev được tạo tài khoản dev.');
      const { data, error } = await admin.auth.admin.createUser({
        email: usernameToEmail(username),
        password: body.password,
        email_confirm: true,
        user_metadata: { username, full_name: body.full_name || '', role },
      });
      if (error) throw httpError(400, error.message.includes('already') ? 'Tên đăng nhập đã tồn tại.' : error.message);
      return res.status(200).json({ id: data.user.id });
    }

    if (body.action === 'set_password') {
      if (String(body.password || '').length < 8) throw httpError(400, 'Mật khẩu tối thiểu 8 ký tự.');
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) throw httpError(400, error.message);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'set_active') {
      const active = !!body.active;
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { ban_duration: active ? 'none' : '876000h' });
      if (error) throw httpError(400, error.message);
      const { error: e2 } = await admin.from('profiles').update({ active }).eq('id', body.user_id);
      if (e2) throw httpError(400, e2.message);
      return res.status(200).json({ ok: true });
    }

    throw httpError(400, 'Thao tác không hợp lệ.');
  } catch (e) {
    sendError(res, e);
  }
}

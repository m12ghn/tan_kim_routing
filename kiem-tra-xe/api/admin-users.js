// Quản lý tài khoản (chỉ quản lý). Dùng service_role nên chỉ chạy trên server.
// Auth dùng chung project với app khác, nên quyền vào app này nằm ở bảng kx_members.
// POST { action: 'create', username, password, full_name, role }  — tài khoản đã có trong Auth thì chỉ cấp quyền
// POST { action: 'set_password', user_id, password }              — đổi mật khẩu đăng nhập (áp dụng cho mọi app dùng chung)
// POST { action: 'set_active', user_id, active }                  — khóa/mở trong app này, không ảnh hưởng app khác
import { adminClient, requireManager, usernameToEmail, httpError, sendError } from './_shared.js';

const ROLES = ['inspector', 'manager', 'dev'];

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw httpError(400, error.message);
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw httpError(405, 'Chỉ hỗ trợ POST.');
    const admin = adminClient();
    const caller = await requireManager(req, admin);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

    if (body.action === 'create') {
      const username = String(body.username || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw httpError(400, 'Tên đăng nhập 3–32 ký tự, chỉ chữ, số, . _ -');
      const role = ROLES.includes(body.role) ? body.role : 'inspector';
      if (role === 'dev' && caller.role !== 'dev') throw httpError(403, 'Chỉ dev được tạo tài khoản dev.');
      const email = usernameToEmail(username);

      let user = await findUserByEmail(admin, email);
      if (!user) {
        if (String(body.password || '').length < 8) throw httpError(400, 'Mật khẩu tối thiểu 8 ký tự.');
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: { username, full_name: body.full_name || '' },
        });
        if (error) throw httpError(400, error.message);
        user = data.user;
      }
      const { error: e2 } = await admin
        .from('kx_members')
        .upsert({ id: user.id, username, full_name: body.full_name || '', role, active: true });
      if (e2) throw httpError(400, e2.message);
      return res.status(200).json({ id: user.id });
    }

    if (body.action === 'set_password') {
      if (String(body.password || '').length < 8) throw httpError(400, 'Mật khẩu tối thiểu 8 ký tự.');
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) throw httpError(400, error.message);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'set_active') {
      const { error } = await admin.from('kx_members').update({ active: !!body.active }).eq('id', body.user_id);
      if (error) throw httpError(400, error.message);
      return res.status(200).json({ ok: true });
    }

    throw httpError(400, 'Thao tác không hợp lệ.');
  } catch (e) {
    sendError(res, e);
  }
}

-- test-users.sql: cấp quyền dùng app Kiểm tra xe cho tài khoản ĐÃ CÓ trong Authentication (dùng chung với app khác).
-- Đổi tên đăng nhập trong ngoặc cho đúng người thật. Tên đăng nhập = phần trước @ của email (10001 ↔ 10001@app.local).
-- Tài khoản chưa có: tạo ở Authentication → Users → Add user (email <tên>@app.local, tick Auto Confirm User) rồi chạy lại.

insert into public.kx_members (id, username, full_name, role)
select u.id, split_part(u.email, '@', 1), x.full_name, x.role
from (values
  ('10001', 'Quản trị',           'dev'),
  ('10002', 'Quản lý đội xe',     'manager'),
  ('10003', 'Nhân viên kiểm tra', 'inspector')
) as x(username, full_name, role)
join auth.users u on lower(u.email) = x.username || '@app.local'
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, active = true;

-- Danh sách xe không nhập tay: quản lý bấm "⟳ Đồng bộ xe từ Sheet" ở tab Tổng quan (đọc sheet Data xe).

select username, full_name, role, active from public.kx_members order by username;

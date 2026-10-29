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

insert into public.kx_vehicles (plate, vehicle_type) values
  ('51K-888.99', 'Tải 1,5T'),
  ('51D-123.45', 'Van'),
  ('60C-456.78', 'Tải 2,5T')
on conflict (plate) do nothing;

select username, full_name, role, active from public.kx_members order by username;

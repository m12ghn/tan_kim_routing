-- test-users.sql: dữ liệu thử. ĐỔI hoặc XÓA mật khẩu mặc định trước khi dùng thật.
-- Cách tạo tài khoản đúng chuẩn: Supabase → Authentication → Users → Add user
--   Email: 10001@app.local, mật khẩu tùy chọn, tick "Auto Confirm User".
--   (Tên đăng nhập trên app = phần trước @, ví dụ 10001.)
-- Sau đó chạy đoạn dưới để đặt vai trò + thêm vài xe mẫu.

update public.profiles set role = 'dev',       full_name = 'Quản trị'         where username = '10001';
update public.profiles set role = 'manager',   full_name = 'Quản lý đội xe'   where username = '10002';
update public.profiles set role = 'inspector', full_name = 'Nhân viên kiểm tra' where username = '10003';

insert into public.vehicles (plate, vehicle_type) values
  ('51K-888.99', 'Tải 1,5T'),
  ('51D-123.45', 'Van'),
  ('60C-456.78', 'Tải 2,5T')
on conflict (plate) do nothing;

# Bật lưu chung cho trang Tân Kim (Supabase)

Sau khi làm xong, mọi thay đổi tuyến trên trang tự lưu vào Supabase; ai mở link cũng thấy cùng một bộ tuyến (tự cập nhật sau tối đa 30 giây). Nếu chưa cấu hình, trang vẫn chạy bình thường và chỉ lưu tạm trên trình duyệt (`localStorage`).

## 1. Tạo bảng (1 lần)
Supabase → **SQL Editor** → dán toàn bộ `supabase/schema.sql` → Run.
Sẽ tạo 2 bảng `tk_config` (bản hiện tại, 1 dòng `id='main'`) và `tk_config_history` (mỗi lần lưu 1 dòng, để xem lại/khôi phục). RLS được bật và không có policy nào, nên key public (anon) không đọc/ghi được, chỉ server dùng service_role key.

## 2. Thêm biến môi trường trên Vercel
Project `tankimrouting` → Settings → Environment Variables (Production), thêm:
- `SUPABASE_URL` = Project URL (Supabase → Project Settings → API), dạng `https://xxxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = key `service_role` (Project Settings → API Keys). **Tuyệt đối không dán vào code/HTML/chat**; key này ghi được toàn bộ database.

Rồi **Redeploy** để biến có hiệu lực.

## 3. Kiểm tra
- Mở `https://<domain>/api/config` → phải ra `{"ok":true,"data":...,"version":...}`.
- Mở trang: dòng trạng thái dưới thanh tháng ghi "☁ Đã kết nối/tải bản chung (Supabase)".
- Thêm 1 tuyến → thấy "☁ Đã lưu vào bản chung … phiên bản N". Mở trang bằng trình duyệt khác thấy đúng tuyến đó.

## Cách hoạt động
- Sửa → lưu tạm `localStorage` ngay + gửi lên `/api/config` sau ~0,7 giây.
- Mỗi lần lưu tăng `version`. Nếu 2 người sửa cùng lúc, người lưu sau nhận cảnh báo, trang tự tải bản mới nhất; người đó cần làm lại thay đổi vừa rồi.
- Khôi phục bản cũ: xem `tk_config_history` trong Supabase Table Editor, copy cột `data` của bản muốn quay lại, cập nhật vào `tk_config` (nhớ tăng `version`).
- Nút "Về scope mặc định" giờ ảnh hưởng tất cả mọi người nên có hỏi xác nhận.

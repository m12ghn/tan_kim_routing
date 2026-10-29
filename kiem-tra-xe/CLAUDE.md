# Quy ước cho Claude khi sửa app Kiểm tra xe

- DB dùng chung project Supabase với app khác: mọi bảng/hàm/trigger/policy mới PHẢI có tiền tố `kx_` (bucket `kx-photos`). Không tạo/sửa đối tượng không có tiền tố, không gắn trigger vào `auth.users`, không ban user ở Auth (khóa qua `kx_members.active`).
- Ngôn ngữ giao diện: tiếng Việt có dấu, ngắn, nói thẳng.
- Thay đổi DB: thêm `supabase/migration-NNN-*.sql` (chạy lại được) và cập nhật `schema.sql` + `setup-all.sql`. Dán nội dung SQL vào chat cho người dùng copy vào SQL Editor.
- Mỗi lần sửa app: thêm dòng vào `src/changelog.json` (loại new / change / fix / system, phiên bản mới nằm đầu) rồi chạy `npm run changelog`.
- Không bao giờ đưa khóa bí mật vào mã hoặc vào trình duyệt. Mọi tác vụ cần service_role đi qua `api/*.js`. Chỉ `SUPABASE_URL` và `SUPABASE_ANON_KEY` được nhúng vào giao diện (qua `define` trong `vite.config.ts`).
- Tuân thủ quy tắc UI/UX (mục 13 tài liệu hướng dẫn), không tự nghĩ phong cách khác. Màu chỉ dùng biến CSS trong `src/styles.css`.
- Thao tác nhiều bước trên DB đóng gói vào hàm `security definer` (RPC). Policy viết dạng `(select auth.uid())`.
- Sau khi sửa: chạy `npx tsc --noEmit` và `npm run build` trước khi đẩy.

## Bản đồ mã
- `src/pages/Overview.tsx` — trang Tổng quan tiến độ (quản lý).
- `src/pages/Inspect.tsx` — trang Kiểm tra xe cho nhân viên hiện trường (chọn xe → chụp ảnh → kết quả → gửi; lưu nháp IndexedDB).
- `src/pages/InspectionReport.tsx` — báo cáo một phiếu (ảnh, thông tin, duyệt/trả lại, in PDF).
- `src/lib/photoSlots.ts` — danh sách góc chụp bắt buộc/không bắt buộc.
- `src/components/CameraCapture.tsx` — chụp ảnh trong trang, nén 1280px / 0,8.
- `api/admin-users.js` — tạo tài khoản, đổi mật khẩu, khóa/mở (chỉ quản lý).

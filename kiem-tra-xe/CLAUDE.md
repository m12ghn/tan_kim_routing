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
- `src/pages/Overview.tsx` — tab Tổng quan (mọi người): tiến độ, mức, lọc, Excel, nút đồng bộ (quản lý).
- `src/pages/Inspect.tsx` — tab Kiểm tra xe: 3 bước Chọn xe → Chụp hình → Checklist, nháp IndexedDB, mở lại phiếu dở.
- `src/components/inspect/PhotoStep.tsx`, `ChecklistStep.tsx` — UI từng bước.
- `src/lib/checklist.ts` — 8 mục + rule mức; `src/lib/photoSlots.ts` — vị trí ảnh. Đổi khóa ở đây thì đổi cả trong SQL (`kx_set_photo`, `kx_complete_inspection`).
- `src/pages/InspectionReport.tsx` — báo cáo một lần kiểm tra.
- `api/sync-vehicles.js` + `api/_sheet.js` — đọc sheet "Data xe" (Đội xe = cột AQ, ODO = AK) → `kx_sync_vehicles`.
- `api/admin-users.js` — cấp quyền / đổi mật khẩu / khóa trong app.
- Không có bước duyệt phiếu (người dùng chốt).

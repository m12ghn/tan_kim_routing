# Kiểm tra xe

App chụp hình kiểm tra xe. Vite + React + TypeScript, Supabase (DB, Auth, Storage), deploy Vercel.

## Màn hình
| Trang | Ai thấy | Làm gì |
|---|---|---|
| **Tổng quan** (`/tong-quan`) | Quản lý, dev | Tiến độ kiểm tra trong ngày: điểm sáng / cần lưu ý, thẻ chỉ số, bộ lọc, bảng từng xe. |
| **Kiểm tra xe** (`/kiem-tra`) | Mọi người | Chọn xe → chụp ảnh từng góc → ODO, kết quả, ghi chú → gửi. Tự lưu nháp. Xem phiếu đã gửi. |
| **Báo cáo phiếu** (`/phieu/:id`) | Người gửi, quản lý | Thông tin + ảnh của phiếu, quản lý duyệt / trả lại, in hoặc lưu PDF. |

Vai trò (`profiles.role`): `inspector` (nhân viên kiểm tra), `manager` (quản lý), `dev`.

## Cài đặt lần đầu
1. **Supabase**: tạo project (region Singapore) → SQL Editor → chạy `supabase/setup-all.sql`.
2. Tạo tài khoản ở Authentication → Users → Add user: email `10001@app.local` (tên đăng nhập trên app = `10001`), tick *Auto Confirm User*. Rồi chạy `supabase/test-users.sql` để đặt vai trò và thêm xe mẫu.
3. **Vercel**: Import repo, **Root Directory = `kiem-tra-xe`**, Framework Vite, Build `npm run build`, Output `dist`.
4. Environment Variables (cả 3 môi trường): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (bí mật, chỉ server). Thêm/đổi biến xong phải **Redeploy**.
5. Supabase → Authentication → URL Configuration: Site URL = địa chỉ Vercel.

## Chạy trên máy
```bash
cp .env.example .env   # điền URL + anon key
npm install
npm run dev
```

## Cấu trúc
```
src/pages        Overview, Inspect, InspectionReport, Login
src/components   Layout, CameraCapture, KpiCard, Insights, MultiSelect, Pager, Skeleton
src/lib          supabase, auth, theme, image (nén), drafts (IndexedDB), upload, format
api/             admin-users.js (service_role), _shared.js
supabase/        migration-001-init.sql, schema.sql, setup-all.sql, test-users.sql
```

## Dữ liệu
- `vehicles` — danh mục xe (biển số, loại).
- `inspections` — phiếu kiểm tra (id tạo ở máy khách để gửi lại không trùng), kết quả, ODO, trạng thái duyệt.
- `inspection_photos` — đường dẫn ảnh theo góc chụp; ảnh nằm ở bucket `photos` (Private, 5MB), đường dẫn `<user_id>/<id phiếu>/<thời gian>-<uuid>.jpg`.
- `audit_log` — nhật ký thay đổi (chỉ dev xem, không ai sửa/xóa).
- Gửi phiếu qua RPC `submit_inspection` (kiểm tra ODO không nhỏ hơn lần trước), duyệt qua `review_inspection`.

## Chưa làm (bước sau)
- Xuất Excel trên trang Tổng quan, trang quản lý xe và tài khoản.
- Checklist hạng mục kiểm tra (đèn, lốp…) nếu cần, thông báo Telegram.

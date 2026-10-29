# Kiểm tra xe

App chụp hình kiểm tra tình trạng xe, ưu tiên dùng trên điện thoại. Vite + React + TypeScript, Supabase (DB, Auth, Storage), deploy Vercel.

## Màn hình
| Trang | Làm gì |
|---|---|
| **Tổng quan** (`/tong-quan`) | Tiến độ = xe đã kiểm tra / tổng xe. Điểm sáng / cần lưu ý, thẻ theo mức (Bình thường / Xem xét / Bất thường), bộ lọc, bảng từng xe, tải Excel. Quản lý có nút **Đồng bộ xe từ Sheet**. |
| **Kiểm tra xe** (`/kiem-tra`) | ① Chọn xe: gõ biển số → thẻ thông tin (Đội xe, Hãng, Tải trọng, ODO gần nhất, Năm SX, Kiểm tra gần nhất, Mức hiện tại) → **Tiến hành kiểm tra xe** (log bắt đầu). ② Chụp hình: 7 ảnh bắt buộc (Trước, Trái (tài xế), Sau, Lốp, Phải, ODO, Cabin) + tối đa 3 ảnh thêm, chụp trong trang hoặc tải lên. ③ Checklist 8 mục ✓/✗ (✗ bắt buộc chú thích), Khác, nút **Bất thường — Cần sửa chữa** (popup note) → **Hoàn tất kiểm tra xe** (log hoàn tất). |
| **Báo cáo** (`/phieu/:id`) | Thông tin xe, mức, checklist, ảnh, giờ bắt đầu / hoàn tất, in PDF. |

**Rule mức hiện tại:** bấm Bất thường → *Bất thường*; có ít nhất 1 mục ✗ → *Xem xét*; tất cả ✓ → *Bình thường*. Server tính lại trong `kx_complete_inspection`.

Vai trò (`kx_members.role`): `inspector`, `manager` (thêm nút đồng bộ, hủy phiếu người khác), `dev`.

## Cài đặt
1. **Supabase** (dùng chung project có sẵn, mọi thứ có tiền tố `kx_`, bucket `kx-photos`): SQL Editor → chạy các `supabase/migration-NNN-*.sql` theo thứ tự (cài mới: `setup-all.sql`).
2. Cấp quyền người dùng: sửa và chạy `supabase/test-users.sql`.
3. **Google Sheet**: tạo service account (Google Cloud → bật Google Sheets API → tạo key JSON), share sheet "M12 Data bot btbd 1" cho `client_email` với quyền **Xem**.
4. **Vercel**: Root Directory = `kiem-tra-xe`, Framework Vite. Biến môi trường: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `CRON_SECRET` (xem `.env.example`). Thêm/đổi biến xong phải **Redeploy**.
5. Mở tab Tổng quan bằng tài khoản quản lý → **⟳ Đồng bộ xe từ Sheet**. Sau đó Vercel Cron tự đồng bộ lúc 5:00 sáng mỗi ngày.

## Dữ liệu xe từ sheet "Data xe"
| App | Cột sheet |
|---|---|
| Biển số | B |
| Đội xe | AQ (cột "Đội xe" thứ hai) |
| Hãng xe / Model | D / E |
| Tải trọng | C |
| Năm SX | F |
| Tình trạng | A |
| ODO gần nhất / ngày | AK / AL |

Xe không còn trong sheet thì ẩn khỏi app (lịch sử kiểm tra vẫn giữ).

## Chạy trên máy
```bash
cp .env.example .env
npm install
npm run dev
```

## Cấu trúc
```
src/pages        Overview, Inspect (3 bước), InspectionReport, Login
src/components   inspect/PhotoStep, inspect/ChecklistStep, VehicleCard, CameraCapture, KpiCard, Insights, MultiSelect, Pager
src/lib          checklist (8 mục + rule mức), photoSlots, vehicles, drafts (IndexedDB), upload, excel, supabase, auth
api/             sync-vehicles.js (Sheet → kx_vehicles), _sheet.js, admin-users.js, _shared.js
supabase/        migration-001-init, migration-002-checklist-flow, schema.sql, setup-all.sql, test-users.sql
```

## Bảng
- `kx_members` — ai được dùng app + vai trò.
- `kx_vehicles` — xe đồng bộ từ sheet.
- `kx_inspections` — mỗi lần kiểm tra: `in_progress` → `completed` / `cancelled`, `started_at`, `completed_at`, `level`, `checklist` (jsonb), `other_note`, `abnormal_note`, `odo` (ODO trong sheet lúc bắt đầu).
- `kx_inspection_photos` — 1 ảnh mỗi vị trí, file ở bucket `kx-photos`.
- `kx_audit_log` — nhật ký thay đổi.
- Hàm: `kx_start_inspection`, `kx_set_photo`, `kx_remove_photo`, `kx_complete_inspection`, `kx_cancel_inspection`, `kx_vehicle_summary`, `kx_sync_vehicles` (chỉ server).

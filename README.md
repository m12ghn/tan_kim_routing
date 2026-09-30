# Tân Kim — công cụ cấu hình & mô phỏng tuyến (M12 / GHN)

Đây là toàn bộ source + data + script để build lại/tiếp tục phát triển công cụ **cấu hình tuyến Tân Kim** — dùng cho việc chuyển dần khối lượng lấy/giao từ 2 kho HCM01 (id 1626) và HCM20 (id 2388) sang kho mới Tân Kim.

Nếu bạn (Claude Code) đang đọc file này lần đầu: đọc hết README này trước khi sửa gì, vì có vài quyết định/bối cảnh quan trọng người dùng đã chốt mà không nên tự ý đổi lại.

## Trạng thái hiện tại

`index.html` là bản **đã build sẵn, deploy được ngay** — 1 file HTML/CSS/JS duy nhất (~5MB, vì nhúng luôn data), không cần server, không cần build step. Đây chính là bản đang chạy tại **https://tankimrouting.vercel.app/** (deploy bằng cách kéo thả file vào Vercel Drop — xem phần Deploy bên dưới).

Công cụ có 2 tab trong cùng 1 trang, dùng chung 1 bộ luật cấu hình (đổi 1 chỗ, cả 2 tab nhảy theo ngay):
1. **Cấu hình & mô phỏng** — thêm/xoá luật theo quận/huyện hoặc theo bưu cục (BC)/kho, riêng cho từng chiều lấy/giao, riêng cho từng loại hàng Normal/Bulky/Cả hai. Bưu cục luôn thắng quận khi trùng. KPI (% khối lượng nhường cho Tân Kim của từng kho) tính lại live theo luật hiện tại.
2. **Bản đồ mạng lưới (live)** — bản đồ Leaflet vẽ các tuyến lấy/giao hiện tại, đọc từ CÙNG bộ luật ở tab 1 (không phải 2 hệ thống tách rời như bản cũ).

Mặc định mỗi tháng (T10/T11/T12) hiện đúng scope theo `config_v3` (tab Google Sheet "[TK] Config network") — khớp chính xác số AOP chính thức. Thêm/bớt luật sẽ chuyển sang chế độ ước tính "what-if".

**Hai phiên bản A / B (tab Cấu hình & mô phỏng):**
- **Version A** = đúng `config_v3` (khớp AOP trên Sheet), **khoá chỉ xem**, không lưu gì.
- **Version B** = `config_v3` + quy tắc gần kho + chỉnh tay, lưu chung (Supabase/localStorage). Lần đầu mở B tự áp quy tắc cho T10 (BC huyện Nhà Bè/Cần Giờ/Nhơn Trạch/Cần Đước luôn về Tân Kim; BC gần kho HCM01/HCM20/Sóng Thần/Đồng Nai hơn Tân Kim thì loại khỏi Tân Kim, chỉ chiều lấy). T11/T12 ở B chưa áp; bấm "📍 Áp quy tắc gần kho cho <tháng>" để áp theo yêu cầu.
- Số của B là **ước tính theo tỷ lệ** (không phải AOP tính lại từ forecast từng BC), có ô so sánh với A. Không ghi gì vào Sheet.

**Lưu chung (Supabase):** khi đã cấu hình theo `supabase/SETUP.md`, mọi thay đổi tự lưu vào bảng `tk_config` qua `api/config.js` (có version để phát hiện sửa cùng lúc, có bảng lịch sử). Chưa cấu hình thì trang tự rơi về chế độ chỉ lưu tạm trên trình duyệt.

**Autosave (localStorage):** mọi luật thêm/xoá được tự lưu vào `localStorage` của trình duyệt đang mở — F5 lại trang không mất. Đây CHỈ là lưu tạm trên máy/trình duyệt đó, không phải lưu chung nhiều người. Muốn lưu chính thức thì bấm nút "Xuất luật mới để lưu Sheet" (hiện xuất ra text để copy tay dán vào Google Sheet — phần tự động ghi thẳng vào Sheet đã chuẩn bị code sẵn nhưng CHƯA kích hoạt, xem mục "Việc còn dang dở" bên dưới).

## Quyết định quan trọng của người dùng (KHÔNG tự ý đổi)

- **Không cần chặn quyền truy cập** — nguyên văn người dùng: *"Không cần chặn — ai mở link cũng sửa được"*. Trang KHÔNG có đăng nhập/phân quyền, ai có link cũng bấm sửa/lưu được. Ranh giới bảo mật DUY NHẤT là giữ kín Google service-account private key (biến môi trường phía server), không đưa vào code hay commit public.
- **Vercel là công cụ chính**, Google Sheet chỉ là nơi lưu/xem log — nguyên văn: *"vercel sẽ là công cụ chính. các khác để view thôi"*.
- Baseline khối lượng dùng để tính % là **T6** (`vol_from.xlsx`/`vol_to.csv`), vì T10/11/12 là tương lai (chỉ có số AOP forecast).
- `vol_ca_1` trong data gốc tính từ 7h hôm nay đến 7h hôm sau.
- File `vol_from.xlsx`/`vol_to.csv` chỉ chứa volume T6 của HCM01+HCM20; khi Tân Kim đi vào hoạt động, 2 kho này sẽ mất bớt 1 phần khối lượng chuyển qua Tân Kim theo đúng luật cấu hình.

## Cấu trúc thư mục

```
index.html            <- FILE DEPLOY: đã build sẵn, kéo thả thẳng lên Vercel
unified_template.html <- SOURCE THẬT SỰ: sửa file này, không sửa index.html trực tiếp
unified_blob.json     <- data đã build (nhúng vào index.html khi build_app.py chạy)
build_blob.py         <- build unified_blob.json từ data thô trong data/
build_app.py          <- ghép unified_template.html + unified_blob.json -> index.html
data/                 <- data nguồn (xem "Nguồn data" bên dưới)
vendor/               <- leaflet.js/css + polylineDecorator, vendor sẵn để test offline
api/                  <- serverless function ghi Google Sheet (chưa kích hoạt — xem bên dưới)
verify.py             <- test Playwright: số liệu mặc định khớp AOP, thêm luật quận/BC, export
verify_autosave.py    <- test Playwright: thêm luật -> reload trang -> luật còn nguyên (autosave)
```

## Quy trình sửa code

1. Sửa `unified_template.html` (HTML/CSS/JS, có placeholder `__BLOB__` chỗ nhúng data).
2. Nếu có đổi data nguồn trong `data/`: chạy `python3 build_blob.py` để build lại `unified_blob.json` (cần `pip install pandas openpyxl`).
3. Chạy `python3 build_app.py --localtest` để ra `index.html` (bản deploy) + `index.localtest.html` (bản dùng leaflet vendor local, để test không cần mạng — KHÔNG deploy file localtest này).
4. Test bằng Playwright: `pip install playwright && playwright install chromium`, rồi `python3 verify.py` và `python3 verify_autosave.py`. Cả 2 phải chạy sạch (không JS error, số liệu T10/T11 mặc định khớp % AOP chính thức — script có in số kỳ vọng để so sánh).
5. Deploy: kéo thả `index.html` vào https://vercel.com/new (Vercel Drop) — ghi đè lên deployment hiện tại của `tankimrouting.vercel.app`.

## Nguồn data (thư mục `data/`)

- `dim_warehouse.csv` — danh mục gốc bưu cục/kho (BC): id, tên, tỉnh/quận + GHN province_id/district_id, toạ độ. Đây là nguồn tham chiếu "tỉnh-quận-ID-bưu cục" chính thức, dùng để resolve mọi thứ theo BC-level thay vì áng chừng theo quận.
- `vol_from.xlsx`, `vol_to.csv` — khối lượng T6 baseline theo BC (pick/deliver_warehouse_id), theo owner (1626=HCM01 / 2388=HCM20), theo loại hàng (Normal/Bulky). **Lưu ý quan trọng**: 1 BC hầu như luôn có volume dưới CẢ 2 owner cùng lúc (~98-99.5% các BC) — không phải quan hệ 1 BC : 1 kho sở hữu.
- `config_v3.csv` — luật cấu hình hiện tại theo tháng (T10/T11/T12), cumulative, cấp bưu cục, kéo từ tab `config_v3` trên Google Sheet "[TK] Config network" (ID `1tU1ehl5y79Y0s_nXPbnYmruaPBh9s0PJrYRoLviFutw`). BC 1327 (Key Account) luôn bị loại khỏi scope lấy ở mọi tháng.
- `wh_geo_override.json` — toạ độ/thông tin ghi đè thủ công cho vài BC thiếu toạ độ trong `dim_warehouse.csv`.
- `old_map_blob.json`, `simdata.json` — lấy từ 2 bản build cũ (map + simulator, trước khi gộp thành 1 app):
  - `old_map_blob.json` chỉ dùng lấy geojson tỉnh/quận (`prov`, `adm2`) + vị trí Tân Kim (`tk`) để vẽ nền bản đồ — không dùng phần data BC của nó nữa (đã thay bằng `dim_warehouse.csv` + `vol_from`/`vol_to` chính xác hơn).
  - `simdata.json` chỉ dùng lấy `official` — số AOP forecast before/after theo tháng cho từng kho (`vol`, `w_nhap`, `w_4t`). Đây là nguồn top-down riêng, KHÔNG tính ra được từ `vol_from`/`vol_to` — nếu AOP đổi thì phải cập nhật tay file này (lấy từ Google Sheet AOP gốc).

## Việc còn dang dở: tự động ghi vào Google Sheet

Nút "Xuất luật mới để lưu Sheet" hiện chỉ xuất text để copy tay dán vào Sheet. Code cho việc tự động ghi thẳng vào Sheet đã viết sẵn ở `api/save-rule.js` (Vercel serverless function, dùng Google service account) nhưng CHƯA hoạt động — cần người dùng làm xong các bước setup trong `api/SETUP_GHI_SHEET.md` (tạo service account trên Google Cloud, share quyền Editor cho Sheet, đổi cách deploy từ Vercel Drop sang `vercel` CLI để chạy được serverless function, thêm biến môi trường). Sau khi người dùng xong các bước đó, việc còn lại là sửa nút "Xuất luật mới" trong `unified_template.html` để gọi `fetch('/api/save-rule', ...)` thay vì chỉ hiện textarea.

## Bối cảnh dự án lớn hơn

Đây là 1 phần trong dự án Tân Kim của M12 (HRBP Cụm M12, GHN) — dự án lớn hơn còn có: demo Excel `Config_Rules` schema (mixed quận/BC granularity, độc lập lấy/giao và Normal/Bulky/Cả hai, BC luôn thắng quận), và phân tích gap giữa `vol_from`/`vol_to` hiện tại với nhu cầu cấu hình mới. Nếu cần dựng lại các phần đó, tham khảo lịch sử chat trước — không có trong zip này vì không còn liên quan trực tiếp tới việc vận hành app.

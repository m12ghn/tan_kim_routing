# Bật tính năng "Lưu → tự ghi vào Sheet" cho trang Tân Kim

Hiện tại trang mới (`index.html`) đã cho thêm luật cấp quận/BC/hàng/lấy-giao và số + bản đồ nhảy live ngay trên trình duyệt. Nút "Xuất luật mới" chỉ xuất ra danh sách để copy tay dán vào Sheet. Làm theo các bước dưới để nút đó ghi thẳng vào Sheet, không cần copy tay nữa.

## Vì sao cần các bước này
Cách deploy hiện tại (kéo thả file/zip vào vercel.com) chỉ tạo ra site TĨNH — không chạy được code phía server. Để ghi vào Google Sheet cần 1 "serverless function" (file `api/save-rule.js` đã có sẵn), và loại function này chỉ chạy được khi deploy qua Vercel CLI hoặc kết nối GitHub — không chạy được qua kiểu kéo thả zip.

## Các bước

1. **Tạo Service Account (1 lần):**
   - Vào https://console.cloud.google.com/ → chọn hoặc tạo 1 project.
   - Bật "Google Sheets API" (APIs & Services → Enable APIs).
   - Vào IAM & Admin → Service Accounts → Create Service Account (đặt tên gì cũng được, vd `tankim-config-writer`).
   - Vào service account vừa tạo → tab Keys → Add Key → Create new key → chọn JSON → tải file JSON về.

2. **Cho phép service account ghi vào Sheet:**
   - Mở file JSON vừa tải, tìm dòng `"client_email"` — copy giá trị đó (dạng `...@...iam.gserviceaccount.com`).
   - Mở Google Sheet "[TK] Config network" → nút Share → dán email đó vào, chọn quyền **Editor**.
   - Tạo 1 tab mới tên đúng `Config_Rules` trong sheet đó với hàng tiêu đề:
     `hiệu_lực_từ | chiều | cấp_độ | tỉnh | quận | warehouse_id | tên | hàng | đích | ghi_chú`

3. **Đổi cách deploy sang Vercel CLI (1 lần):**
   - Cài Vercel CLI trên máy: `npm install -g vercel`
   - Trong thư mục project (chứa `index.html` và folder `api/`), chạy: `vercel login` rồi `vercel --prod`
   - Từ giờ mỗi lần muốn cập nhật, chạy lại `vercel --prod` trong thư mục đó thay vì kéo thả zip lên web.

4. **Thêm biến môi trường trên Vercel:**
   - Vào Vercel Dashboard → chọn project → Settings → Environment Variables, thêm 3 biến:
     - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = client_email trong file JSON
     - `GOOGLE_PRIVATE_KEY` = private_key trong file JSON (giữ nguyên các `\n`)
     - `SHEET_ID` = `1tU1ehl5y79Y0s_nXPbnYmruaPBh9s0PJrYRoLviFutw`
   - Deploy lại (`vercel --prod`) để áp dụng biến môi trường mới.

5. **Nối nút "Xuất luật mới" sang gọi API thật** (mình sẽ sửa giúp khi anh xong bước 1-4): thay vì chỉ hiện textarea, nút sẽ gọi:
   ```js
   fetch('/api/save-rule', {method:'POST', headers:{'Content-Type':'application/json'},
     body: JSON.stringify({rows: [...]})})
   ```
   rồi báo "Đã lưu vào Sheet" khi thành công.

## Lưu ý bảo mật
File JSON key ở bước 1 là "chìa khoá" ghi được vào Sheet — không đưa vào code, không commit lên GitHub public, chỉ dán 2 giá trị (`client_email`, `private_key`) vào ô Environment Variables riêng của Vercel (không ai xem lại được sau khi lưu).

Vì anh chọn không chặn quyền sửa trên trang (ai mở link cũng bấm Lưu được), bước bảo mật DUY NHẤT còn lại là giữ kín file JSON key này — ai cầm được file JSON đó thì ghi được vào Sheet, còn ai chỉ mở trang web thì chỉ bấm nút Lưu được, không thấy được key.

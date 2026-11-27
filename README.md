# Vietlink Hair App Studio

Tạo ảnh đăng bài Vietlink Hair ngay trên trình duyệt: tải ảnh của bạn lên, chọn mẫu, chỉnh rồi tải về.
Ảnh được xử lý trên máy bạn, không gửi đi đâu. Nhập số WhatsApp của bạn ở đầu trang, máy sẽ nhớ.

Có hai phần: **Tạo ảnh** (`index.html`) và **Tạo video** (`video/index.html`, đưa clip lên, app tự nhận loại, dựng 1–6 bản theo mẫu, chỉnh rồi xuất MP4).
Toàn bộ app nằm trong hai file đó, chạy bằng GitHub Pages. Mã nguồn và cách build: repo nội bộ `vietlink-photo-app`.

## Mã nguồn

Thư mục `source/` là mã nguồn (bản sao của repo nội bộ `vietlink-photo-app`): `python source/build.py` dựng lại `index.html` và `video/index.html`. Cần thêm hai repo nội bộ `vietlink-app-script` và `vietlink-wf-photo-variants` (logo, font, màu) đặt cạnh nhau.

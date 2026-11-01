# Chương trình đọc miễn phí

## Triển khai Apps Script trước

Không thay URL Web App hoặc webhook SePay. Giữ nguyên các file Apps Script hiện có (bao gồm SetupFree.gs đã tạo Heyzine_config_free). Cấu hình khách mua ở Heyzine_Config và các hàm thanh toán/email cũ không đổi.

1. Sao lưu Mã.gs hiện đang chạy. Thêm file **Script** mới tên `FreeCampaign`, dán toàn bộ `FreeCampaign.gs` trong thư mục này. Không dán vào file HTML và không tạo thêm doGet/doPost.
2. Trong Mã.gs hiện tại, thêm nhánh sau **ngay sau `try {` trong doGet(e)**:

```javascript
if (e && e.parameter && e.parameter.action === 'free_campaign') {
  return ContentService.createTextOutput(JSON.stringify(getFreeCampaign()))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Trong doPost(e), thêm nhánh sau **ngay sau `var data = JSON.parse(e.postData.contents);`**, trước mọi nhánh ghi Leads:

```javascript
if (data.action === 'register_free_campaign') {
  return ContentService.createTextOutput(JSON.stringify(registerFreeCampaign(data)))
    .setMimeType(ContentService.MimeType.JSON);
}
```

`Ma.gs` trong repository đã có hai nhánh trên để đối chiếu. Không thay toàn bộ Mã.gs đang chạy nếu có thay đổi riêng chưa lưu vào GitHub.

4. Lưu, chọn hàm **setupFreeCampaign** rồi bấm Chạy một lần. Hàm tạo hai tab nếu chưa tồn tại, không ghi đè tab đã có; không gửi email thử.
5. Kiểm tra tab **Heyzine_config_free** có đúng ba dòng: Tập 1 Heyzine — 119.000đ, Tập 2 Heyzine — 179.000đ, Tập 3 Heyzine — 219.000đ. Cột A/B/C lần lượt là tên gói/link Heyzine/mật khẩu. Chương trình không đọc tab cấu hình sách trả phí. Không chép mật khẩu thực tế vào repository hoặc mã frontend.
6. Triển khai → Quản lý bản triển khai → sửa **deployment hiện tại** → Phiên bản mới → Triển khai, giữ nguyên quyền thực thi và truy cập đang hoạt động.
7. Mở URL Web App /exec với `?action=free_campaign`: JSON phải có `version: 1`. JSON chỉ có trạng thái, tên và ngày, không có link sách hoặc mật khẩu. Backend chưa cập nhật trả reviews/promos sẽ khiến frontend ẩn chương trình và không gửi POST.
8. Đưa các thay đổi index.html và assets/free-campaign.{css,js} lên nhánh main để GitHub Pages triển khai. Lưu lên nhánh tính năng không tự thay website thật.

## Điều khiển chương trình trong Sheet

Tab **Chương trình miễn phí** có hai cột Cài đặt/Giá trị. Chỉ sửa các ô giá trị cột B:

| Cài đặt | Giá trị |
| --- | --- |
| Trạng thái | BẬT hoặc TẮT (mặc định TẮT) |
| Ngày bắt đầu | YYYY-MM-DD hoặc DD/MM/YYYY, có thể để trống |
| Ngày kết thúc | YYYY-MM-DD hoặc DD/MM/YYYY, có thể để trống |
| Tên chương trình | Tên hiển thị trên website và email |

- BẬT + hai ngày trống: mở ngay, không ấn định thời điểm kết thúc.
- BẬT + ngày bắt đầu: mở từ 00:00 giờ Việt Nam vào ngày đó.
- BẬT + ngày kết thúc: nhận đăng ký đến hết 23:59:59 ngày đó, giờ Việt Nam. Mốc này áp dụng chung cho mọi người.
- Chỉ điền một ngày: chỉ áp dụng mốc đã điền.
- TẮT, ngày sai hoặc ngày kết thúc trước bắt đầu: không nhận đăng ký.
- Cập nhật ô không cần triển khai lại code. Website kiểm tra mỗi phút, khi quay lại tab và trước khi gửi form; backend luôn kiểm tra lại trước khi nhận. Trang khách có thể chậm hiển thị thay đổi khoảng một phút.

**Tắt hoặc hết hạn chỉ ngừng nhận/gửi lại link. Nó không tự thu hồi link đã gửi. Chủ website phải đổi mã hoặc đóng ba bản miễn phí trên Heyzine nếu muốn ngừng đọc thực sự. Không đổi mã bản trả phí.**

## Đăng ký và email

Khách điền họ tên, email, tùy chọn điện thoại và đồng ý lưu thông tin để cấp quyền đọc. Tab **Đăng ký miễn phí** lưu chương trình, thời gian, họ tên, email, điện thoại, nguồn, trạng thái email và lần gửi gần nhất. Không thêm Leads, không đánh dấu đã thanh toán, không tính doanh thu.

Email dùng riêng cả ba link/mã trong Heyzine_config_free, ghi thời hạn chung nếu có. Một email được lưu một dòng cho mỗi cặp mốc bắt đầu/kết thúc; gửi lại cập nhật dòng cũ, chờ 10 phút giữa các lần gửi. Đổi khoảng ngày tạo một đợt đăng ký mới. Đổi tên chương trình không tạo đợt mới. Tắt rồi bật lại với cùng ngày vẫn là cùng đợt. Hai ngày trống dùng một đợt không giới hạn.

Nếu MailApp lỗi, dòng ghi Gửi lỗi; khách có thể thử lại sau 10 phút. Đã gửi nghĩa là MailApp đã chấp nhận gửi, không đảm bảo thư vào Inbox. Frontend chỉ báo thành công khi đọc được JSON xác nhận; lỗi mạng/CORS yêu cầu kiểm tra cả Spam trước khi thử lại và không tự động POST lần nữa.

Apps Script có hạn mức email/ngày và thực thi. Có kiểm tra quota, khóa chống ghi đồng thời, honeypot và thời gian chờ theo email; đây không phải cơ chế chống spam mạnh đối với người cố tình dùng nhiều địa chỉ. Không lưu IP hoặc định danh người dùng trong phần này.

## Kiểm tra và nghiệm thu

- Backend mô phỏng và regression bộ đếm: `node --test tests/free-campaign.cjs tests/page-views.cjs`.
- Cú pháp: `node --check assets/free-campaign.js` và `node --check < apps-script/FreeCampaign.gs`.
- Trình duyệt: cài playwright-core ở thư mục ngoài checkout, chạy server Python tại repository cổng 8000, rồi `NODE_PATH=/tmp/ccai-browser/node_modules node scripts/check-free-campaign-browser.cjs`. Harness cần Chromium tại /usr/bin/chromium và chặn mọi request ra ngoài, chỉ giả lập Apps Script; không gửi lead/email hay analytics thật. Ảnh kiểm tra lưu trong thư mục tạm.
- Chưa xác minh trực tiếp Apps Script/Sheet/Heyzine thật. Sau triển khai, chủ website cần đăng ký bằng email của mình và kiểm tra: đúng ba link miễn phí; đúng mật khẩu; một dòng ở Đăng ký miễn phí; không thêm đơn vào Leads; gửi lại bị chờ; TẮT không cho đăng ký; link khách mua vẫn hoạt động.

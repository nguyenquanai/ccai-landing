# Bộ đếm lượt xem CCAI-Leads

Ma.gs được tạo từ nguyên bản v12 do chủ website cung cấp. Chỉ thêm nhánh GET action=tracking_config, nhánh POST action=page_view và hàm recordPageView; bổ sung taoBieuDoTruyCap để tạo biểu đồ cột. Các hàm thanh toán/email được giữ nguyên. Không sửa hoặc xóa các file .gs khác trong dự án Apps Script.

## Triển khai

1. Sao lưu Mã.gs hiện đang chạy. Nếu đã sửa mã kể từ bản gửi cho Codex, đối chiếu trước khi thay thế.
2. Từ file CCAI-Leads mở Tiện ích mở rộng → Apps Script. Thay nội dung Mã.gs bằng Ma.gs trong thư mục này, rồi lưu. Không chạy TEST_sendAccessEmail.
3. Chọn Triển khai → Quản lý bản triển khai → chọn Web App có URL đang dùng → Chỉnh sửa → Phiên bản mới → Triển khai. Giữ nguyên cấu hình thực thi và quyền truy cập công khai đang hoạt động. Không tạo deployment/URL mới; không đổi webhook SePay.
4. Kiểm tra URL /exec hiện tại với ?action=tracking_config trả {"pageViewTracking":1}.
5. Triển khai hai trang HTML và assets/page-views.js lên GitHub Pages.
6. Mở trang chủ website thật: tab Thống kê truy cập tự tạo, cột Trang chủ và Tổng lượt xem tăng 1. Tải lại tăng thêm 1; mở trang Giới thiệu tăng cột Giới thiệu. Kiểm tra không có lead trống mới.

## Ý nghĩa

Mỗi lần tài liệu được tải là một lượt xem; trang chủ và /index.html được gộp. Không đếm thao tác cuộn, nhấn menu cùng trang hoặc khôi phục trang từ bộ nhớ back/forward. Ngày lấy theo Asia/Ho_Chi_Minh. Không lưu IP, email, query string hay mã khách. Không suy ra khách duy nhất.

Bộ đếm bắt đầu từ lúc triển khai, không hồi tố. Đây là thống kê best effort phía trình duyệt: chặn script, lỗi mạng, quota Apps Script hoặc bot có thể làm khác GA4. Endpoint công khai không chống gian lận đếm. Mỗi lượt dùng một GET kiểm tra khả năng backend và một POST ghi số; không retry tự động. POST no-cors không xác nhận được ghi thành công, nên phải kiểm tra ô trong Sheet khi nghiệm thu.

## Kiểm tra local

Tại /workspace/ccai-landing chạy node --test tests/page-views.cjs. Sáu bài kiểm tra dùng Google Apps Script mocks, không truy cập hoặc thay đổi Google Sheet thật. Cần nghiệm thu thực tế sau triển khai như trên.

## Biểu đồ lượt xem theo ngày

Hàm `taoBieuDoTruyCap` nằm cuối `Ma.gs`. Sau khi bảng có dữ liệu, lưu mã, chọn hàm này trong Apps Script editor và bấm Chạy một lần. Không chạy hàm test email. Biểu đồ cột màu cam rộng **450 px**, cao 420 px, đặt tại F2; trục ngang là ngày giờ Việt Nam, trục dọc là tổng lượt xem. Lấy dữ liệu từ toàn cột A và D để nhận các ngày mới. Chạy lại cập nhật biểu đồ cùng tên, không tạo trùng. Chỉ chỉnh biểu đồ và chạy trong editor thì không cần triển khai lại Web App.

## Trạng thái xác minh

Chủ website đã xác nhận cập nhật Apps Script và kiểm tra biểu đồ rộng 450 px hoạt động. Codex đã kiểm tra cú pháp và 6 bài kiểm tra mô phỏng bộ đếm; chưa trực tiếp đọc Sheet thật do hạn chế truy cập mạng. File này lưu lại mã được cung cấp trong phiên làm việc, không phải bản xuất trực tiếp từ deployment Google hiện tại. Git push không tự triển khai Apps Script; lần sửa backend tiếp theo vẫn phải cập nhật deployment hiện có thủ công.

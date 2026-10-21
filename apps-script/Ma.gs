// ============================================================
// APPS SCRIPT v13 — CCAI-Leads
// v13: Bộ đếm lượt xem theo ngày và biểu đồ cột rộng 450 px.
// v12: Thêm hệ thống TẶNG MIỄN PHÍ cho người quen (không thu tiền).
//      - Sheet "Tặng miễn phí" (tự tạo): Email + Gói được tặng + Trạng thái
//      - doGet có action=check_gift → kiểm tra nhanh (không ghi gì)
//      - doPost có action=claim_gift → xác nhận lại phía server + ghi Leads
//        (Đã thanh toán=Có, Số tiền=0) + gửi email cấp quyền đọc ngay
//      - TÁCH BIỆT HOÀN TOÀN khỏi handleSepayWebhook — không ảnh hưởng
//        luồng thanh toán thật của khách trả tiền bình thường.
// APPS SCRIPT v11 — CCAI-Leads
// v11: Thêm hệ thống KHUYẾN MÃI theo đợt (flash sale).
//      - Đọc sheet "Khuyến mãi" (tự tạo mẫu nếu chưa có)
//      - doGet trả thêm object "promos" cho các gói đang giảm còn hiệu lực
//      - Sếp chỉ điền Sheet (giá KM + BẬT/TẮT + ngày) → landing page tự đổi giá
//      - Hết ngày kết thúc tự về giá gốc (không cần tắt tay)
// APPS SCRIPT v10 — CCAI-Leads
// v7: Sửa logic Combo 3 tập = gửi 3 link (Tập1+2+3 riêng).
//     Bản đầy đủ = 1 link riêng (file ghép sẵn).
// v8: Ghi cột "Thời gian" và "Ngày thanh toán" bằng Date object
//     thật (không phải chuỗi text) — để Dashboard dùng MONTH()/YEAR()
//     tính "Lead tháng này" không bị lỗi #VALUE!.
// v9: Tối ưu email chống vào Spam:
//     - Subject bỏ emoji, ngắn gọn kiểu giao dịch thông thường
//     - Đổi "mật khẩu" → "mã truy cập" (giảm từ khóa nhạy cảm)
//     - Thêm replyTo + plain-text body kèm HTML (tăng độ tin cậy)
//     - Bớt icon/emoji trong nội dung
// v10: Đổi tên gói hiển thị trong email thành tên đầy đủ, thân thiện:
//      "Tập 1: Nền tảng - bộ sách: Claude Cowork AI Thực Chiến"
//      (tên kỹ thuật "Tập 1 Heyzine — 119.000đ" vẫn dùng để match Config/Leads,
//      chỉ đổi PHẦN HIỂN THỊ cho khách trong email)
// ============================================================

// --- HÀM TEST NHANH — chạy thử gửi email không cần chuyển khoản thật ---
// Cách dùng: chọn hàm này ở dropdown trên cùng Apps Script editor → bấm Run
function TEST_sendAccessEmail() {
  // Sửa 3 dòng dưới để test với gói/email bất kỳ
  var testName = 'Khách Test';
  var testEmail = 'nguyenquan140882@gmail.com'; // đổi thành email sếp muốn nhận thử
  var testPackage = 'Combo 3 tập Heyzine — 399.000đ'; // đổi để test gói khác

  var result = sendAccessEmail(testName, testEmail, testPackage);
  Logger.log('Kết quả test: ' + result);
}

// ============================================================
// ✨ v8: Chuyển chuỗi thời gian (nếu client vẫn gửi string kiểu cũ)
// thành Date object thật — để MONTH()/YEAR() trong Sheets đọc được.
// Nếu không parse được, trả về new Date() (thời điểm server nhận request).
// ============================================================
function parseClientTime(value) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return new Date();

  // Thử format "dd/mm/yyyy, hh:mm:ss" hoặc "hh:mm:ss dd/mm/yyyy" (vi-VN locale)
  var dmyMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  var hmsMatch = value.match(/(\d{1,2}):(\d{2}):(\d{2})/);

  if (dmyMatch) {
    var day = Number(dmyMatch[1]);
    var month = Number(dmyMatch[2]) - 1;
    var year = Number(dmyMatch[3]);
    var hour = hmsMatch ? Number(hmsMatch[1]) : 0;
    var min = hmsMatch ? Number(hmsMatch[2]) : 0;
    var sec = hmsMatch ? Number(hmsMatch[3]) : 0;
    var parsed = new Date(year, month, day, hour, min, sec);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Fallback: thử Date.parse trực tiếp (ISO string, v.v.)
  var fallback = new Date(value);
  if (!isNaN(fallback.getTime())) return fallback;

  // Không parse được → dùng thời điểm hiện tại của server
  return new Date();
}


// --- GET: Trả danh sách reviews (giữ nguyên từ v5) ---
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'tracking_config') {
      return ContentService.createTextOutput(JSON.stringify({ pageViewTracking: 1 }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ✨ v12: Kiểm tra "Tặng miễn phí" — request riêng, không ảnh hưởng logic reviews/promos bên dưới
    if (e && e.parameter && e.parameter.action === 'check_gift') {
      var isGift = checkFreeGift(e.parameter.email, e.parameter.package);
      return ContentService
        .createTextOutput(JSON.stringify({ isGift: isGift }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ===== REVIEWS =====
    var reviews = [];
    var totalStars = 0;
    var reviewSheet = ss.getSheetByName('Reviews');
    if (reviewSheet) {
      var data = reviewSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var status = String(data[i][6] || '').trim();
        if (status === 'Hiện') {
          var stars = Number(data[i][2]) || 5;
          reviews.push({
            name: data[i][1] || 'Ẩn danh',
            stars: stars,
            content: data[i][3] || '',
            package: data[i][4] || '',
            date: data[i][5] || ''
          });
          totalStars += stars;
        }
      }
    }
    var avg = reviews.length > 0 ? (totalStars / reviews.length).toFixed(1) : 0;

    // ===== KHUYẾN MÃI (v11) =====
    var promos = getActivePromos();

    return ContentService
      .createTextOutput(JSON.stringify({
        reviews: reviews,
        avg: Number(avg),
        total: reviews.length,
        promos: promos
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ reviews: [], avg: 0, total: 0, promos: {}, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// ✨ v11: ĐỌC SHEET "Khuyến mãi" → trả các gói đang giảm giá còn hiệu lực
// Sheet Khuyến mãi (7 cột):
//   A: Gói (tên kỹ thuật, VD "Combo 3 tập Heyzine — 399.000đ")
//   B: Giá KM (số, VD 299000)
//   C: Bật/Tắt ("BẬT" hoặc "TẮT")
//   D: Ngày bắt đầu (Date)
//   E: Ngày kết thúc (Date)
//   F: Nhãn đợt (VD "Ưu đãi tháng 7")
// Trả về object: { "Combo 3 tập Heyzine — 399.000đ": {salePrice, endDate, label, percent}, ... }
// Chỉ trả gói đang BẬT và thời điểm hiện tại nằm trong [bắt đầu, kết thúc].
// ============================================================
function getActivePromos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Khuyến mãi');

  // Tự tạo sheet mẫu nếu chưa có
  if (!sheet) {
    sheet = ss.insertSheet('Khuyến mãi');
    sheet.appendRow(['Gói', 'Giá KM', 'Bật/Tắt', 'Ngày bắt đầu', 'Ngày kết thúc', 'Nhãn đợt']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    // 5 dòng mẫu — mặc định TẮT, sếp điền giá + đổi BẬT khi cần
    sheet.appendRow(['Tập 1 Heyzine — 119.000đ', '', 'TẮT', '', '', '']);
    sheet.appendRow(['Tập 2 Heyzine — 179.000đ', '', 'TẮT', '', '', '']);
    sheet.appendRow(['Tập 3 Heyzine — 219.000đ', '', 'TẮT', '', '', '']);
    sheet.appendRow(['Combo 3 tập Heyzine — 399.000đ', '', 'TẮT', '', '', '']);
    sheet.appendRow(['Bản đầy đủ Heyzine — 519.000đ', '', 'TẮT', '', '', '']);
    return {};
  }

  var giaGoc = {
    'Tập 1 Heyzine — 119.000đ': 119000,
    'Tập 2 Heyzine — 179.000đ': 179000,
    'Tập 3 Heyzine — 219.000đ': 219000,
    'Combo 3 tập Heyzine — 399.000đ': 399000,
    'Bản đầy đủ Heyzine — 519.000đ': 519000
  };

  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var result = {};

  for (var i = 1; i < data.length; i++) {
    var pkg = String(data[i][0] || '').trim();
    var salePrice = Number(data[i][1]) || 0;
    var onOff = String(data[i][2] || '').trim().toUpperCase();
    var startDate = data[i][3];
    var endDate = data[i][4];
    var label = String(data[i][5] || '').trim();

    if (onOff !== 'BẬT') continue;
    if (!salePrice || salePrice <= 0) continue;
    if (!pkg || !giaGoc[pkg]) continue;

    // Kiểm tra khoảng ngày hiệu lực
    var start = (startDate instanceof Date) ? startDate : (startDate ? new Date(startDate) : null);
    var end = (endDate instanceof Date) ? endDate : (endDate ? new Date(endDate) : null);
    if (start && now < start) continue;          // chưa tới ngày bắt đầu
    if (end) {
      // Tính đến hết ngày kết thúc (23:59:59)
      var endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
      if (now > endOfDay) continue;              // đã qua ngày kết thúc
    }

    var original = giaGoc[pkg];
    var percent = Math.round((1 - salePrice / original) * 100);

    result[pkg] = {
      salePrice: salePrice,
      originalPrice: original,
      endDate: end ? Utilities.formatDate(end, 'GMT+7', "yyyy-MM-dd'T'23:59:59") : '',
      label: label,
      percent: percent
    };
  }

  return result;
}

// --- POST: Phân biệt loại request ---
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Nhánh riêng: không cho lượt xem rơi vào luồng ghi Leads.
    if (data.action === 'page_view') {
      return ContentService.createTextOutput(JSON.stringify(recordPageView(data)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.gateway || data.transferType) {
      var result = handleSepayWebhook(data);
      return ContentService
        .createTextOutput(JSON.stringify({ result: 'success', detail: result }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'verify_email') {
      var result = verifyBuyerEmail(data.email);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'submit_review') {
      var result = submitReview(data);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ✨ v12: Đơn tặng miễn phí — nhánh riêng, KHÔNG đụng vào luồng ghi Leads/thanh toán mặc định bên dưới
    if (data.action === 'claim_gift') {
      var result = claimFreeGift(data);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Form đặt mua
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads')
             || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var lastRow = sheet.getLastRow();

    sheet.appendRow([
      lastRow, data.fullname || '', data.email || '', data.phone || '',
      data.package || '', data.time ? parseClientTime(data.time) : new Date(),
      data.source || 'Landing page', '', '', 'Mới', '', '', '', '', '', '', '',
      data.note || '', ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// ✨ MỚI v7: GỬI EMAIL CẤP QUYỀN ĐỌC SAU KHI THANH TOÁN
// Combo 3 tập = gửi 3 link (Tập 1+2+3). Các gói khác = 1 link riêng.
// ============================================================
function sendAccessEmail(buyerName, buyerEmail, packageName) {
  try {
    // Tên hiển thị đẹp cho từng gói trong email (khác với tên kỹ thuật dùng để match Config)
    var displayMap = {
      'Tập 1 Heyzine — 119.000đ': 'Tập 1: Nền tảng - bộ sách: Claude Cowork AI Thực Chiến',
      'Tập 2 Heyzine — 179.000đ': 'Tập 2: Kết nối & Tự động hóa - bộ sách: Claude Cowork AI Thực Chiến',
      'Tập 3 Heyzine — 219.000đ': 'Tập 3: Thực chiến theo nghề - bộ sách: Claude Cowork AI Thực Chiến',
      'Combo 3 tập Heyzine — 399.000đ': 'Combo 3 tập - bộ sách: Claude Cowork AI Thực Chiến',
      'Bản đầy đủ Heyzine — 519.000đ': 'Bản đầy đủ - bộ sách: Claude Cowork AI Thực Chiến'
    };
    var displayName = displayMap[packageName] || packageName.split('—')[0].trim();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = ss.getSheetByName('Heyzine_Config');

    // Tự tạo sheet config với placeholder nếu chưa có
    if (!configSheet) {
      configSheet = ss.insertSheet('Heyzine_Config');
      configSheet.appendRow(['Gói', 'Link Heyzine', 'Mật khẩu hiện tại', 'Ngày đặt lại gần nhất']);
      configSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      // Chỉ 3 dòng GỐC: Tập 1, Tập 2, Tập 3, Bản đầy đủ — Combo KHÔNG có dòng riêng,
      // mà tự ghép từ 3 dòng Tập 1+2+3 khi gửi email.
      configSheet.appendRow(['Tập 1 Heyzine — 119.000đ', 'PLACEHOLDER_LINK_TAP1', 'PLACEHOLDER_PASS_TAP1', '']);
      configSheet.appendRow(['Tập 2 Heyzine — 179.000đ', 'PLACEHOLDER_LINK_TAP2', 'PLACEHOLDER_PASS_TAP2', '']);
      configSheet.appendRow(['Tập 3 Heyzine — 219.000đ', 'PLACEHOLDER_LINK_TAP3', 'PLACEHOLDER_PASS_TAP3', '']);
      configSheet.appendRow(['Bản đầy đủ Heyzine — 519.000đ', 'PLACEHOLDER_LINK_FULL', 'PLACEHOLDER_PASS_FULL', '']);
    }

    var configData = configSheet.getDataRange().getValues();
    function findConfig(pkgName) {
      for (var i = 1; i < configData.length; i++) {
        if (String(configData[i][0]).trim() === String(pkgName).trim()) {
          return { link: configData[i][1], pass: configData[i][2] };
        }
      }
      return null;
    }

    // Danh sách các phần cần gửi: mỗi phần có {label, link, pass}
    var parts = [];
    var isCombo = packageName.indexOf('Combo 3 tập') !== -1;

    if (isCombo) {
      // Combo = 3 link Tập 1 + Tập 2 + Tập 3
      var tap1 = findConfig('Tập 1 Heyzine — 119.000đ');
      var tap2 = findConfig('Tập 2 Heyzine — 179.000đ');
      var tap3 = findConfig('Tập 3 Heyzine — 219.000đ');
      if (tap1) parts.push({ label: 'Tập 1 — Nền tảng', link: tap1.link, pass: tap1.pass });
      if (tap2) parts.push({ label: 'Tập 2 — Kết nối & Tự động hóa', link: tap2.link, pass: tap2.pass });
      if (tap3) parts.push({ label: 'Tập 3 — Thực chiến theo nghề', link: tap3.link, pass: tap3.pass });
    } else {
      // Tập 1 / Tập 2 / Tập 3 / Bản đầy đủ — đều 1 link riêng
      var cfg = findConfig(packageName);
      if (cfg) parts.push({ label: displayName, link: cfg.link, pass: cfg.pass });
    }

    // Kiểm tra còn placeholder không — nếu có bất kỳ phần nào chưa cấu hình thì KHÔNG gửi
    var hasPlaceholder = parts.length === 0;
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i].link || String(parts[i].link).indexOf('PLACEHOLDER') !== -1) {
        hasPlaceholder = true;
        break;
      }
    }

    if (hasPlaceholder) {
      Logger.log('Chưa cấu hình đủ link Heyzine cho gói: ' + packageName + ' — bỏ qua gửi email.');
      return 'skipped_no_config';
    }

    // Dựng phần HTML cho từng link (1 phần với gói lẻ, 3 phần với Combo)
    var partsHtml = '';
    var partsPlain = '';
    parts.forEach(function(p) {
      partsHtml +=
        '<div style="background:#FFFFFF;border:1px solid #E8E4DC;border-radius:8px;padding:18px 20px;margin:0 0 14px;">' +
        '<p style="margin:0 0 8px;font-weight:600;color:#E85D26;font-size:14px;">' + p.label + '</p>' +
        '<p style="margin:0 0 8px;">Link đọc: <a href="' + p.link + '" style="color:#E85D26;word-break:break-all;">' + p.link + '</a></p>' +
        '<p style="margin:0;">Mã truy cập: <code style="background:#FDEDE4;padding:3px 8px;border-radius:4px;font-size:15px;">' + p.pass + '</code></p>' +
        '</div>';
      partsPlain += '\n' + p.label + '\nLink doc: ' + p.link + '\nMa truy cap: ' + p.pass + '\n';
    });

    // Subject: bỏ emoji, ngắn gọn, giống email giao dịch thông thường
    var subject = 'Xác nhận đơn hàng ' + displayName;

    var htmlBody =
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A2E;">' +
      '<div style="background:#FFF9F0;padding:32px 28px;border-radius:12px;border:1px solid #E8E4DC;">' +
      '<h2 style="color:#1A1A2E;margin-top:0;">Chào ' + buyerName + ',</h2>' +
      '<p style="font-size:15px;line-height:1.6;">Cảm ơn bạn đã đặt mua <strong>' + displayName + '</strong>. ' +
      'Đơn hàng của bạn đã được xác nhận.</p>' +
      (isCombo ? '<p style="font-size:14px;color:#5A5A68;">Combo gồm 3 tập, mỗi tập có link đọc và mã truy cập riêng bên dưới:</p>' : '') +
      partsHtml +
      '<p style="font-size:13px;color:#5A5A68;line-height:1.6;">' +
      'Mã truy cập được cập nhật định kỳ để bảo vệ quyền lợi tác giả. Vui lòng không chia sẻ link và mã truy cập cho người khác. ' +
      'Nếu mã truy cập không còn hiệu lực khi bạn quay lại đọc, vui lòng liên hệ để được hỗ trợ cấp lại.</p>' +
      '<p style="font-size:14px;margin-top:24px;">Cần hỗ trợ, liên hệ:<br>' +
      'Zalo: 0904667411<br>' +
      'Email: nguyenquan140882@gmail.com</p>' +
      '<p style="font-size:14px;margin-top:20px;">Chúc bạn học tốt.<br>Tác giả: Nguyễn Quân</p>' +
      '<p style="font-size:11px;color:#8A8A95;margin-top:24px;border-top:1px solid #E8E4DC;padding-top:12px;">' +
      'Email này được gửi vì bạn đã đặt mua ebook trên trang Claude Cowork AI Thực Chiến.</p>' +
      '</div></div>';

    var plainBody =
      'Chao ' + buyerName + ',\n\n' +
      'Cam on ban da dat mua ' + displayName + '. Don hang cua ban da duoc xac nhan.\n' +
      partsPlain +
      '\nMa truy cap duoc cap nhat dinh ky de bao ve quyen loi tac gia. Vui long khong chia se cho nguoi khac.\n\n' +
      'Can ho tro, lien he:\nZalo: 0904667411\nEmail: nguyenquan140882@gmail.com\n\n' +
      'Chuc ban hoc tot.\nTac gia: Nguyen Quan';

    MailApp.sendEmail({
      to: buyerEmail,
      subject: subject,
      htmlBody: htmlBody,
      body: plainBody,
      replyTo: 'nguyenquan140882@gmail.com',
      name: 'Nguyễn Quân - Claude Cowork AI Thực Chiến'
    });

    return 'sent (' + parts.length + ' link)';
  } catch (err) {
    Logger.log('Lỗi gửi email: ' + err.toString());
    return 'error: ' + err.toString();
  }
}

// ============================================================
// VERIFY EMAIL — check email đã mua chưa (giữ nguyên v5)
// ============================================================
function verifyBuyerEmail(email) {
  if (!email) return { verified: false, message: 'Vui lòng nhập email.' };

  email = email.trim().toLowerCase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var leadsSheet = ss.getSheetByName('Leads') || ss.getSheets()[0];
  var data = leadsSheet.getDataRange().getValues();
  var headers = data[0];
  var colEmail = headers.indexOf('Email');
  var colTrangThai = headers.indexOf('Trạng thái');
  var colGoi = headers.indexOf('Gói đã chốt');
  var colNhuCau = headers.indexOf('Nhu cầu quan tâm');

  var buyerPackage = '';
  var found = false;

  for (var i = 1; i < data.length; i++) {
    var rowEmail = String(data[i][colEmail] || '').trim().toLowerCase();
    var rowStatus = String(data[i][colTrangThai] || '').trim();

    if (rowEmail === email && rowStatus === 'Đã thanh toán') {
      found = true;
      buyerPackage = data[i][colGoi] || data[i][colNhuCau] || '';
      break;
    }
  }

  if (!found) {
    return { verified: false, message: 'Email này chưa có đơn đã thanh toán. Vui lòng dùng email bạn đã đăng ký mua ebook.' };
  }

  var reviewSheet = ss.getSheetByName('Reviews');
  var existingReview = null;

  if (reviewSheet) {
    var reviewData = reviewSheet.getDataRange().getValues();
    for (var i = 1; i < reviewData.length; i++) {
      var revEmail = String(reviewData[i][0] || '').trim().toLowerCase();
      if (revEmail === email) {
        existingReview = {
          name: reviewData[i][1],
          stars: reviewData[i][2],
          content: reviewData[i][3],
          package: reviewData[i][4]
        };
        break;
      }
    }
  }

  return {
    verified: true,
    package: buyerPackage,
    existingReview: existingReview
  };
}

// ============================================================
// SUBMIT REVIEW — thêm mới hoặc cập nhật review (giữ nguyên v5)
// ============================================================
function submitReview(data) {
  var email = (data.email || '').trim().toLowerCase();
  var name = (data.name || '').trim();
  var stars = Math.min(5, Math.max(1, Number(data.stars) || 5));
  var content = (data.content || '').trim().substring(0, 500);
  var pkg = data.package || '';

  if (!email || !name || !content) {
    return { result: 'error', message: 'Vui lòng điền đầy đủ thông tin.' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reviewSheet = ss.getSheetByName('Reviews');

  if (!reviewSheet) {
    reviewSheet = ss.insertSheet('Reviews');
    reviewSheet.appendRow(['Email', 'Tên hiển thị', 'Số sao', 'Nội dung', 'Gói đã mua', 'Ngày đánh giá', 'Trạng thái']);
    reviewSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  var dateNow = new Date();
  var reviewData = reviewSheet.getDataRange().getValues();
  var existingRow = -1;
  for (var i = 1; i < reviewData.length; i++) {
    if (String(reviewData[i][0] || '').trim().toLowerCase() === email) {
      existingRow = i + 1;
      break;
    }
  }

  if (existingRow > 0) {
    reviewSheet.getRange(existingRow, 2).setValue(name);
    reviewSheet.getRange(existingRow, 3).setValue(stars);
    reviewSheet.getRange(existingRow, 4).setValue(content);
    reviewSheet.getRange(existingRow, 5).setValue(pkg);
    reviewSheet.getRange(existingRow, 6).setValue(dateNow);
    return { result: 'success', message: 'Đã cập nhật đánh giá của bạn!', updated: true };
  } else {
    reviewSheet.appendRow([email, name, stars, content, pkg, dateNow, 'Hiện']);
    return { result: 'success', message: 'Cảm ơn bạn đã đánh giá!', updated: false };
  }
}

// ============================================================
// SEPAY WEBHOOK — xử lý thanh toán tự động + GỬI EMAIL (v6)
// ============================================================
// ============================================================
// ✨ v12: TẶNG MIỄN PHÍ CHO NGƯỜI QUEN
// Sheet "Tặng miễn phí" (tự tạo nếu chưa có), 6 cột:
//   A: Email | B: Tên (tham khảo) | C: Gói được tặng (tên kỹ thuật đầy đủ)
//   D: Trạng thái (Chưa dùng / Đã dùng) | E: Ngày tặng | F: Ghi chú
// Cơ chế TÁCH BIỆT HOÀN TOÀN khỏi handleSepayWebhook — không đụng
// tới luồng thanh toán thật của khách trả tiền bình thường.
// ============================================================
function getGiftSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Tặng miễn phí');
  if (!sheet) {
    sheet = ss.insertSheet('Tặng miễn phí');
    sheet.appendRow(['Email', 'Tên (tham khảo)', 'Gói được tặng', 'Trạng thái', 'Ngày tặng', 'Ghi chú']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  return sheet;
}

// Kiểm tra nhanh (dùng cho doGet) — TRẢ VỀ true/false, không ghi gì cả
function checkFreeGift(email, pkg) {
  var sheet = getGiftSheet();
  var data = sheet.getDataRange().getValues();
  var emailNorm = String(email || '').trim().toLowerCase();
  var pkgNorm = String(pkg || '').trim();
  if (!emailNorm || !pkgNorm) return false;

  for (var i = 1; i < data.length; i++) {
    var rowEmail = String(data[i][0] || '').trim().toLowerCase();
    var rowPkg = String(data[i][2] || '').trim();
    var status = String(data[i][3] || '').trim();
    if (rowEmail === emailNorm && rowPkg === pkgNorm && status !== 'Đã dùng') {
      return true;
    }
  }
  return false;
}

// Xác nhận + ghi đơn tặng (dùng cho doPost) — kiểm tra lại 1 lần nữa phía server
// (không tin tưởng hoàn toàn dữ liệu client gửi lên) trước khi ghi Leads + gửi email.
function claimFreeGift(data) {
  var giftSheet = getGiftSheet();
  var gdata = giftSheet.getDataRange().getValues();
  var emailNorm = String(data.email || '').trim().toLowerCase();
  var pkgNorm = String(data.package || '').trim();

  var giftRowIndex = -1;
  for (var i = 1; i < gdata.length; i++) {
    var rowEmail = String(gdata[i][0] || '').trim().toLowerCase();
    var rowPkg = String(gdata[i][2] || '').trim();
    var status = String(gdata[i][3] || '').trim();
    if (rowEmail === emailNorm && rowPkg === pkgNorm && status !== 'Đã dùng') {
      giftRowIndex = i + 1; break;
    }
  }
  if (giftRowIndex === -1) {
    return { result: 'not_eligible' };
  }

  // Ghi vào Leads — tra cột theo TÊN TIÊU ĐỀ (giống hệt cách handleSepayWebhook làm, an toàn tuyệt đối)
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads')
           || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = {}; // tên cột -> vị trí (0-based)
  headers.forEach(function (h, idx) { col[h] = idx; });

  var newRow = new Array(headers.length).fill('');
  function setCol(name, value) {
    if (col.hasOwnProperty(name) && col[name] !== -1) newRow[col[name]] = value;
  }
  setCol('Họ và tên', data.fullname || '');
  setCol('Email', data.email || '');
  setCol('SĐT/Zalo', data.phone || '');
  setCol('Nhu cầu quan tâm', data.package || '');
  setCol('Gói đã chốt', data.package || '');
  setCol('Trạng thái', 'Đã thanh toán');
  setCol('Số tiền (VND)', 0);
  setCol('Đã thanh toán?', 'Có');
  setCol('Ngày thanh toán', new Date());
  setCol('Thời gian đăng ký', data.time ? parseClientTime(data.time) : new Date());
  setCol('Nguồn', 'Tặng miễn phí - Người quen');
  setCol('Ghi chú', 'GIFT: Tặng miễn phí — không thu tiền');

  sheet.appendRow(newRow);
  var newRowIndex = sheet.getLastRow();

  // Gửi email cấp quyền đọc ngay lập tức
  var emailResult = 'no_email';
  if (data.email) {
    emailResult = sendAccessEmail(data.fullname || '', data.email, data.package || '');
  }
  if (col.hasOwnProperty('Ghi chú') && col['Ghi chú'] !== -1) {
    var noteCell = sheet.getRange(newRowIndex, col['Ghi chú'] + 1);
    noteCell.setValue(noteCell.getValue() + ' | EMAIL:' + emailResult);
  }

  // Đánh dấu whitelist đã dùng — tránh dùng lại nhiều lần
  giftSheet.getRange(giftRowIndex, 4).setValue('Đã dùng');
  giftSheet.getRange(giftRowIndex, 5).setValue(new Date());

  return { result: 'success', email: emailResult };
}

function handleSepayWebhook(payload) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leads')
           || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

  var content = (payload.content || '').toUpperCase().trim();
  var amount = payload.transferAmount || 0;
  var transDate = payload.transactionDate ? parseClientTime(payload.transactionDate) : new Date();
  var referenceCode = payload.referenceCode || payload.id || '';

  if ((payload.transferType || '') !== 'in') return 'Skipped: not incoming';
  if (content.indexOf('CCAI') === -1) return 'Skipped: no CCAI prefix';

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colHoTen = headers.indexOf('Họ và tên');
  var colEmail = headers.indexOf('Email');
  var colSĐT = headers.indexOf('SĐT/Zalo');
  var colTrangThai = headers.indexOf('Trạng thái');
  var colNhuCau = headers.indexOf('Nhu cầu quan tâm');
  var colGoiChot = headers.indexOf('Gói đã chốt');
  var colSoTien = headers.indexOf('Số tiền (VND)');
  var colDaTT = headers.indexOf('Đã thanh toán?');
  var colNgayTT = headers.indexOf('Ngày thanh toán');
  var colGhiChu = headers.indexOf('Ghi chú');

  // Chống duplicate
  if (referenceCode) {
    for (var i = 1; i < data.length; i++) {
      var note = String(data[i][colGhiChu] || '');
      if (note.indexOf(referenceCode) !== -1) {
        return 'Duplicate skipped: ' + referenceCode;
      }
    }
  }

  var afterCCAI = content.substring(content.indexOf('CCAI'));
  var cleanPart = afterCCAI.split('.CT')[0];
  var allPhones = cleanPart.match(/\d{9,11}/g) || [];
  var phoneFromCK = allPhones.length > 0 ? allPhones[allPhones.length - 1] : '';

  var packageMap = {
    'TAP1': 'Tập 1 Heyzine — 119.000đ',
    'TAP2': 'Tập 2 Heyzine — 179.000đ',
    'TAP3': 'Tập 3 Heyzine — 219.000đ',
    'COMBO3': 'Combo 3 tập Heyzine — 399.000đ',
    'FULL': 'Bản đầy đủ Heyzine — 519.000đ'
  };
  var detectedPkg = '';
  for (var code in packageMap) {
    if (afterCCAI.indexOf(code) !== -1) { detectedPkg = packageMap[code]; break; }
  }

  var matchedRow = -1;
  for (var i = data.length - 1; i >= 1; i--) {
    var rowPhone = String(data[i][colSĐT]).replace(/[^0-9]/g, '');
    var rowStatus = String(data[i][colTrangThai]).trim();
    if (phoneFromCK && rowPhone === phoneFromCK && rowStatus === 'Mới') {
      matchedRow = i + 1; break;
    }
  }

  if (matchedRow === -1) {
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][colTrangThai]).trim() === 'Mới') {
        matchedRow = i + 1; break;
      }
    }
  }

  if (matchedRow === -1) {
    return 'No pending order found, skipped. Phone:' + phoneFromCK;
  }

  var finalPkg = detectedPkg || sheet.getRange(matchedRow, colNhuCau + 1).getValue();

  var noteContent = 'AUTO:' + afterCCAI + (referenceCode ? ' REF:' + referenceCode : '');
  sheet.getRange(matchedRow, colTrangThai + 1).setValue('Đã thanh toán');
  sheet.getRange(matchedRow, colGoiChot + 1).setValue(finalPkg);
  sheet.getRange(matchedRow, colSoTien + 1).setValue(amount);
  sheet.getRange(matchedRow, colDaTT + 1).setValue('Có');
  sheet.getRange(matchedRow, colNgayTT + 1).setValue(transDate);
  var oldNote = sheet.getRange(matchedRow, colGhiChu + 1).getValue();
  sheet.getRange(matchedRow, colGhiChu + 1).setValue((oldNote ? oldNote + ' | ' : '') + noteContent);

  // ✨ MỚI v6: Tự động gửi email cấp quyền đọc
  var buyerName = sheet.getRange(matchedRow, colHoTen + 1).getValue();
  var buyerEmail = sheet.getRange(matchedRow, colEmail + 1).getValue();
  var emailResult = 'no_email';
  if (buyerEmail) {
    emailResult = sendAccessEmail(buyerName, buyerEmail, finalPkg);
  }
  // Ghi log kết quả gửi mail vào ghi chú
  var noteAfterEmail = sheet.getRange(matchedRow, colGhiChu + 1).getValue();
  sheet.getRange(matchedRow, colGhiChu + 1).setValue(noteAfterEmail + ' | EMAIL:' + emailResult);

  return 'Updated row ' + matchedRow + ' phone:' + phoneFromCK + ' email:' + emailResult;
}
// v13: Lượt xem trang (không phải số khách duy nhất), ngày theo giờ Việt Nam.
// Không lưu email, IP, query string hay định danh khách.
function recordPageView(data) {
  var page = data.page;
  if (page !== '/' && page !== '/gioi-thieu.html') {
    return { result: 'error', message: 'Invalid page' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Thống kê truy cập');
    var headers = ['Ngày (giờ Việt Nam)', 'Trang chủ', 'Giới thiệu', 'Tổng lượt xem'];
    if (!sheet) {
      sheet = ss.insertSheet('Thống kê truy cập');
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    var rows = sheet.getDataRange().getValues();
    if (headers.some(function(h, i) { return rows[0][i] !== h; })) {
      throw new Error('Unexpected tracking sheet headers; no data changed');
    }
    var day = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var row = -1;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === day) { row = i + 1; break; }
    }
    if (row === -1) {
      var next = sheet.getLastRow() + 1;
      sheet.getRange(next, 1).setNumberFormat('@');
      sheet.getRange(next, 1, 1, 4).setValues([[day, page === '/' ? 1 : 0, page === '/gioi-thieu.html' ? 1 : 0, 1]]);
    } else {
      var home = Number(rows[row - 1][1]) || 0;
      var about = Number(rows[row - 1][2]) || 0;
      if (page === '/') home++; else about++;
      sheet.getRange(row, 2, 1, 3).setValues([[home, about, home + about]]);
    }
    SpreadsheetApp.flush();
    return { result: 'success' };
  } finally {
    lock.releaseLock();
  }
}

// Chạy hàm này một lần trong Apps Script editor.
function taoBieuDoTruyCap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Thống kê truy cập');
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error('Chưa có dữ liệu truy cập. Hãy mở website rồi chạy lại.');
  }

  var headers = sheet.getRange(1, 1, 1, 4).getValues()[0];
  if (headers[0] !== 'Ngày (giờ Việt Nam)' ||
      headers[3] !== 'Tổng lượt xem') {
    throw new Error('Tiêu đề cột không đúng. Chưa thay đổi biểu đồ.');
  }

  var title = 'Lượt xem website theo ngày';
  var charts = sheet.getCharts();
  var existing = charts.filter(function(chart) {
    return chart.getOptions().get('title') === title;
  });

  // Dùng cả cột để biểu đồ nhận các ngày mới được ghi vào bảng.
  var builder = existing.length
    ? existing[0].modify().clearRanges()
    : sheet.newChart().setPosition(2, 6, 0, 0);

  var chart = builder
    .asColumnChart()
    .addRange(sheet.getRange('A1:A'))
    .addRange(sheet.getRange('D1:D'))
    .setMergeStrategy(Charts.ChartMergeStrategy.MERGE_COLUMNS)
    .setNumHeaders(1)
    .setOption('title', title)
    .setOption('legend', { position: 'none' })
    .setOption('hAxis', {
      title: 'Ngày (giờ Việt Nam)',
      slantedText: true,
      slantedTextAngle: 45
    })
    .setOption('vAxis', {
      title: 'Lượt xem',
      minValue: 0,
      format: '0'
    })
    .setOption('colors', ['#E85D26'])
    .setOption('width', 450)
    .setOption('height', 420)
    .build();

  if (existing.length) {
    sheet.updateChart(chart);
  } else {
    sheet.insertChart(chart);
  }
}

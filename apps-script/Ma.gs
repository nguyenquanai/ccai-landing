// ============================================================
// APPS SCRIPT — CCAI-Leads
// v13: Thêm bộ đếm lượt xem theo ngày, giờ Việt Nam.
// Giữ nguyên các hàm của bản v12 do chủ website cung cấp.
// ============================================================

// HÀM TEST EMAIL — không cần chạy khi cập nhật bộ đếm.
function TEST_sendAccessEmail() {
  var testName = 'Khách Test';
  var testEmail = 'nguyenquan140882@gmail.com';
  var testPackage = 'Combo 3 tập Heyzine — 399.000đ';

  var result = sendAccessEmail(testName, testEmail, testPackage);
  Logger.log('Kết quả test: ' + result);
}

// Chuyển thời gian client thành Date object.
function parseClientTime(value) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return new Date();

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

  var fallback = new Date(value);
  if (!isNaN(fallback.getTime())) return fallback;

  return new Date();
}

// ============================================================
// GET: Kiểm tra bộ đếm, quà tặng, trả reviews và khuyến mãi.
// ============================================================
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'free_campaign') {
      return ContentService.createTextOutput(JSON.stringify(getFreeCampaign()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Website chỉ gửi lượt xem khi backend xác nhận hỗ trợ.
    if (e && e.parameter &&
        e.parameter.action === 'tracking_config') {
      return ContentService
        .createTextOutput(JSON.stringify({ pageViewTracking: 1 }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter &&
        e.parameter.action === 'check_gift') {
      var isGift = checkFreeGift(
        e.parameter.email,
        e.parameter.package
      );

      return ContentService
        .createTextOutput(JSON.stringify({ isGift: isGift }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

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

    var avg = reviews.length > 0
      ? (totalStars / reviews.length).toFixed(1)
      : 0;

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
      .createTextOutput(JSON.stringify({
        reviews: [],
        avg: 0,
        total: 0,
        promos: {},
        error: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// KHUYẾN MÃI
// ============================================================
function getActivePromos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Khuyến mãi');

  if (!sheet) {
    sheet = ss.insertSheet('Khuyến mãi');

    sheet.appendRow([
      'Gói',
      'Giá KM',
      'Bật/Tắt',
      'Ngày bắt đầu',
      'Ngày kết thúc',
      'Nhãn đợt'
    ]);

    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');

    sheet.appendRow([
      'Tập 1 Heyzine — 119.000đ', '', 'TẮT', '', '', ''
    ]);
    sheet.appendRow([
      'Tập 2 Heyzine — 179.000đ', '', 'TẮT', '', '', ''
    ]);
    sheet.appendRow([
      'Tập 3 Heyzine — 219.000đ', '', 'TẮT', '', '', ''
    ]);
    sheet.appendRow([
      'Combo 3 tập Heyzine — 399.000đ', '', 'TẮT', '', '', ''
    ]);
    sheet.appendRow([
      'Bản đầy đủ Heyzine — 519.000đ', '', 'TẮT', '', '', ''
    ]);

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

    var start = (startDate instanceof Date)
      ? startDate
      : (startDate ? new Date(startDate) : null);

    var end = (endDate instanceof Date)
      ? endDate
      : (endDate ? new Date(endDate) : null);

    if (start && now < start) continue;

    if (end) {
      var endOfDay = new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate(),
        23, 59, 59
      );

      if (now > endOfDay) continue;
    }

    var original = giaGoc[pkg];
    var percent = Math.round((1 - salePrice / original) * 100);

    result[pkg] = {
      salePrice: salePrice,
      originalPrice: original,
      endDate: end
        ? Utilities.formatDate(
            end,
            'GMT+7',
            "yyyy-MM-dd'T'23:59:59"
          )
        : '',
      label: label,
      percent: percent
    };
  }

  return result;
}

// ============================================================
// POST: Phân biệt loại request.
// ============================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.action === 'register_free_campaign') {
      return ContentService.createTextOutput(JSON.stringify(registerFreeCampaign(data)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Bộ đếm có nhánh riêng, không ghi vào Leads.
    if (data.action === 'page_view') {
      return ContentService
        .createTextOutput(JSON.stringify(recordPageView(data)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.gateway || data.transferType) {
      var result = handleSepayWebhook(data);

      return ContentService
        .createTextOutput(JSON.stringify({
          result: 'success',
          detail: result
        }))
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

    if (data.action === 'claim_gift') {
      var result = claimFreeGift(data);

      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Form đặt mua — giữ nguyên cấu trúc bản gốc.
    var sheet = SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName('Leads')
      || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    var lastRow = sheet.getLastRow();

    sheet.appendRow([
      lastRow,
      data.fullname || '',
      data.email || '',
      data.phone || '',
      data.package || '',
      data.time ? parseClientTime(data.time) : new Date(),
      data.source || 'Landing page',
      '', '',
      'Mới',
      '', '', '', '', '', '', '',
      data.note || '',
      ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        result: 'error',
        message: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// GỬI EMAIL CẤP QUYỀN ĐỌC
// ============================================================
function sendAccessEmail(buyerName, buyerEmail, packageName) {
  try {
    var displayMap = {
      'Tập 1 Heyzine — 119.000đ':
        'Tập 1: Nền tảng - bộ sách: Claude Cowork AI Thực Chiến',
      'Tập 2 Heyzine — 179.000đ':
        'Tập 2: Kết nối & Tự động hóa - bộ sách: Claude Cowork AI Thực Chiến',
      'Tập 3 Heyzine — 219.000đ':
        'Tập 3: Thực chiến theo nghề - bộ sách: Claude Cowork AI Thực Chiến',
      'Combo 3 tập Heyzine — 399.000đ':
        'Combo 3 tập - bộ sách: Claude Cowork AI Thực Chiến',
      'Bản đầy đủ Heyzine — 519.000đ':
        'Bản đầy đủ - bộ sách: Claude Cowork AI Thực Chiến'
    };

    var displayName = displayMap[packageName]
      || packageName.split('—')[0].trim();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = ss.getSheetByName('Heyzine_Config');

    if (!configSheet) {
      configSheet = ss.insertSheet('Heyzine_Config');

      configSheet.appendRow([
        'Gói',
        'Link Heyzine',
        'Mật khẩu hiện tại',
        'Ngày đặt lại gần nhất'
      ]);

      configSheet.getRange(1, 1, 1, 4).setFontWeight('bold');

      configSheet.appendRow([
        'Tập 1 Heyzine — 119.000đ',
        'PLACEHOLDER_LINK_TAP1',
        'PLACEHOLDER_PASS_TAP1',
        ''
      ]);

      configSheet.appendRow([
        'Tập 2 Heyzine — 179.000đ',
        'PLACEHOLDER_LINK_TAP2',
        'PLACEHOLDER_PASS_TAP2',
        ''
      ]);

      configSheet.appendRow([
        'Tập 3 Heyzine — 219.000đ',
        'PLACEHOLDER_LINK_TAP3',
        'PLACEHOLDER_PASS_TAP3',
        ''
      ]);

      configSheet.appendRow([
        'Bản đầy đủ Heyzine — 519.000đ',
        'PLACEHOLDER_LINK_FULL',
        'PLACEHOLDER_PASS_FULL',
        ''
      ]);
    }

    var configData = configSheet.getDataRange().getValues();

    function findConfig(pkgName) {
      for (var i = 1; i < configData.length; i++) {
        if (
          String(configData[i][0]).trim()
          === String(pkgName).trim()
        ) {
          return {
            link: configData[i][1],
            pass: configData[i][2]
          };
        }
      }

      return null;
    }

    var parts = [];
    var isCombo = packageName.indexOf('Combo 3 tập') !== -1;

    if (isCombo) {
      var tap1 = findConfig('Tập 1 Heyzine — 119.000đ');
      var tap2 = findConfig('Tập 2 Heyzine — 179.000đ');
      var tap3 = findConfig('Tập 3 Heyzine — 219.000đ');

      if (tap1) {
        parts.push({
          label: 'Tập 1 — Nền tảng',
          link: tap1.link,
          pass: tap1.pass
        });
      }

      if (tap2) {
        parts.push({
          label: 'Tập 2 — Kết nối & Tự động hóa',
          link: tap2.link,
          pass: tap2.pass
        });
      }

      if (tap3) {
        parts.push({
          label: 'Tập 3 — Thực chiến theo nghề',
          link: tap3.link,
          pass: tap3.pass
        });
      }
    } else {
      var cfg = findConfig(packageName);

      if (cfg) {
        parts.push({
          label: displayName,
          link: cfg.link,
          pass: cfg.pass
        });
      }
    }

    var hasPlaceholder = parts.length === 0;

    for (var i = 0; i < parts.length; i++) {
      if (
        !parts[i].link
        || String(parts[i].link).indexOf('PLACEHOLDER') !== -1
      ) {
        hasPlaceholder = true;
        break;
      }
    }

    if (hasPlaceholder) {
      Logger.log(
        'Chưa cấu hình đủ link Heyzine cho gói: '
        + packageName
        + ' — bỏ qua gửi email.'
      );

      return 'skipped_no_config';
    }

    var partsHtml = '';
    var partsPlain = '';

    parts.forEach(function (p) {
      partsHtml +=
        '<div style="background:#FFFFFF;border:1px solid #E8E4DC;border-radius:8px;padding:18px 20px;margin:0 0 14px;">' +
        '<p style="margin:0 0 8px;font-weight:600;color:#E85D26;font-size:14px;">' + p.label + '</p>' +
        '<p style="margin:0 0 8px;">Link đọc: <a href="' + p.link + '" style="color:#E85D26;word-break:break-all;">' + p.link + '</a></p>' +
        '<p style="margin:0;">Mã truy cập: <code style="background:#FDEDE4;padding:3px 8px;border-radius:4px;font-size:15px;">' + p.pass + '</code></p>' +
        '</div>';

      partsPlain +=
        '\n' + p.label +
        '\nLink doc: ' + p.link +
        '\nMa truy cap: ' + p.pass + '\n';
    });

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
      'Cam on ban da dat mua ' + displayName +
      '. Don hang cua ban da duoc xac nhan.\n' +
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
// VERIFY EMAIL — kiểm tra email đã mua.
// ============================================================
function verifyBuyerEmail(email) {
  if (!email) {
    return {
      verified: false,
      message: 'Vui lòng nhập email.'
    };
  }

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
    var rowEmail = String(data[i][colEmail] || '')
      .trim().toLowerCase();

    var rowStatus = String(data[i][colTrangThai] || '').trim();

    if (rowEmail === email && rowStatus === 'Đã thanh toán') {
      found = true;
      buyerPackage = data[i][colGoi] || data[i][colNhuCau] || '';
      break;
    }
  }

  if (!found) {
    return {
      verified: false,
      message: 'Email này chưa có đơn đã thanh toán. Vui lòng dùng email bạn đã đăng ký mua ebook.'
    };
  }

  var reviewSheet = ss.getSheetByName('Reviews');
  var existingReview = null;

  if (reviewSheet) {
    var reviewData = reviewSheet.getDataRange().getValues();

    for (var i = 1; i < reviewData.length; i++) {
      var revEmail = String(reviewData[i][0] || '')
        .trim().toLowerCase();

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
// SUBMIT REVIEW — thêm mới hoặc cập nhật.
// ============================================================
function submitReview(data) {
  var email = (data.email || '').trim().toLowerCase();
  var name = (data.name || '').trim();
  var stars = Math.min(5, Math.max(1, Number(data.stars) || 5));
  var content = (data.content || '').trim().substring(0, 500);
  var pkg = data.package || '';

  if (!email || !name || !content) {
    return {
      result: 'error',
      message: 'Vui lòng điền đầy đủ thông tin.'
    };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var reviewSheet = ss.getSheetByName('Reviews');

  if (!reviewSheet) {
    reviewSheet = ss.insertSheet('Reviews');

    reviewSheet.appendRow([
      'Email',
      'Tên hiển thị',
      'Số sao',
      'Nội dung',
      'Gói đã mua',
      'Ngày đánh giá',
      'Trạng thái'
    ]);

    reviewSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  var dateNow = new Date();
  var reviewData = reviewSheet.getDataRange().getValues();
  var existingRow = -1;

  for (var i = 1; i < reviewData.length; i++) {
    if (
      String(reviewData[i][0] || '').trim().toLowerCase()
      === email
    ) {
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

    return {
      result: 'success',
      message: 'Đã cập nhật đánh giá của bạn!',
      updated: true
    };
  } else {
    reviewSheet.appendRow([
      email, name, stars, content, pkg, dateNow, 'Hiện'
    ]);

    return {
      result: 'success',
      message: 'Cảm ơn bạn đã đánh giá!',
      updated: false
    };
  }
}

// ============================================================
// TẶNG MIỄN PHÍ
// ============================================================
function getGiftSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Tặng miễn phí');

  if (!sheet) {
    sheet = ss.insertSheet('Tặng miễn phí');

    sheet.appendRow([
      'Email',
      'Tên (tham khảo)',
      'Gói được tặng',
      'Trạng thái',
      'Ngày tặng',
      'Ghi chú'
    ]);

    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  return sheet;
}

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

    if (
      rowEmail === emailNorm
      && rowPkg === pkgNorm
      && status !== 'Đã dùng'
    ) {
      return true;
    }
  }

  return false;
}

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

    if (
      rowEmail === emailNorm
      && rowPkg === pkgNorm
      && status !== 'Đã dùng'
    ) {
      giftRowIndex = i + 1;
      break;
    }
  }

  if (giftRowIndex === -1) {
    return { result: 'not_eligible' };
  }

  var sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('Leads')
    || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

  var headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  var col = {};

  headers.forEach(function (h, idx) {
    col[h] = idx;
  });

  var newRow = new Array(headers.length).fill('');

  function setCol(name, value) {
    if (col.hasOwnProperty(name) && col[name] !== -1) {
      newRow[col[name]] = value;
    }
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
  setCol(
    'Thời gian đăng ký',
    data.time ? parseClientTime(data.time) : new Date()
  );
  setCol('Nguồn', 'Tặng miễn phí - Người quen');
  setCol('Ghi chú', 'GIFT: Tặng miễn phí — không thu tiền');

  sheet.appendRow(newRow);

  var newRowIndex = sheet.getLastRow();
  var emailResult = 'no_email';

  if (data.email) {
    emailResult = sendAccessEmail(
      data.fullname || '',
      data.email,
      data.package || ''
    );
  }

  if (col.hasOwnProperty('Ghi chú') && col['Ghi chú'] !== -1) {
    var noteCell = sheet.getRange(
      newRowIndex,
      col['Ghi chú'] + 1
    );

    noteCell.setValue(
      noteCell.getValue() + ' | EMAIL:' + emailResult
    );
  }

  giftSheet.getRange(giftRowIndex, 4).setValue('Đã dùng');
  giftSheet.getRange(giftRowIndex, 5).setValue(new Date());

  return {
    result: 'success',
    email: emailResult
  };
}

// ============================================================
// SEPAY WEBHOOK — giữ nguyên logic bản gốc.
// ============================================================
function handleSepayWebhook(payload) {
  var sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('Leads')
    || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

  var content = (payload.content || '').toUpperCase().trim();
  var amount = payload.transferAmount || 0;

  var transDate = payload.transactionDate
    ? parseClientTime(payload.transactionDate)
    : new Date();

  var referenceCode = payload.referenceCode || payload.id || '';

  if ((payload.transferType || '') !== 'in') {
    return 'Skipped: not incoming';
  }

  if (content.indexOf('CCAI') === -1) {
    return 'Skipped: no CCAI prefix';
  }

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

  var phoneFromCK = allPhones.length > 0
    ? allPhones[allPhones.length - 1]
    : '';

  var packageMap = {
    'TAP1': 'Tập 1 Heyzine — 119.000đ',
    'TAP2': 'Tập 2 Heyzine — 179.000đ',
    'TAP3': 'Tập 3 Heyzine — 219.000đ',
    'COMBO3': 'Combo 3 tập Heyzine — 399.000đ',
    'FULL': 'Bản đầy đủ Heyzine — 519.000đ'
  };

  var detectedPkg = '';

  for (var code in packageMap) {
    if (afterCCAI.indexOf(code) !== -1) {
      detectedPkg = packageMap[code];
      break;
    }
  }

  var matchedRow = -1;

  for (var i = data.length - 1; i >= 1; i--) {
    var rowPhone = String(data[i][colSĐT])
      .replace(/[^0-9]/g, '');

    var rowStatus = String(data[i][colTrangThai]).trim();

    if (
      phoneFromCK
      && rowPhone === phoneFromCK
      && rowStatus === 'Mới'
    ) {
      matchedRow = i + 1;
      break;
    }
  }

  if (matchedRow === -1) {
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][colTrangThai]).trim() === 'Mới') {
        matchedRow = i + 1;
        break;
      }
    }
  }

  if (matchedRow === -1) {
    return 'No pending order found, skipped. Phone:' + phoneFromCK;
  }

  var finalPkg = detectedPkg
    || sheet.getRange(matchedRow, colNhuCau + 1).getValue();

  var noteContent = 'AUTO:' + afterCCAI
    + (referenceCode ? ' REF:' + referenceCode : '');

  sheet.getRange(matchedRow, colTrangThai + 1)
    .setValue('Đã thanh toán');

  sheet.getRange(matchedRow, colGoiChot + 1)
    .setValue(finalPkg);

  sheet.getRange(matchedRow, colSoTien + 1)
    .setValue(amount);

  sheet.getRange(matchedRow, colDaTT + 1)
    .setValue('Có');

  sheet.getRange(matchedRow, colNgayTT + 1)
    .setValue(transDate);

  var oldNote = sheet
    .getRange(matchedRow, colGhiChu + 1)
    .getValue();

  sheet.getRange(matchedRow, colGhiChu + 1).setValue(
    (oldNote ? oldNote + ' | ' : '') + noteContent
  );

  var buyerName = sheet
    .getRange(matchedRow, colHoTen + 1)
    .getValue();

  var buyerEmail = sheet
    .getRange(matchedRow, colEmail + 1)
    .getValue();

  var emailResult = 'no_email';

  if (buyerEmail) {
    emailResult = sendAccessEmail(
      buyerName,
      buyerEmail,
      finalPkg
    );
  }

  var noteAfterEmail = sheet
    .getRange(matchedRow, colGhiChu + 1)
    .getValue();

  sheet.getRange(matchedRow, colGhiChu + 1).setValue(
    noteAfterEmail + ' | EMAIL:' + emailResult
  );

  return 'Updated row ' + matchedRow
    + ' phone:' + phoneFromCK
    + ' email:' + emailResult;
}

// ============================================================
// v13: BỘ ĐẾM LƯỢT XEM
// Mỗi lần mở/tải lại trang là một lượt, không phải khách duy nhất.
// Không lưu email, IP, query string hoặc định danh khách.
// ============================================================
function recordPageView(data) {
  var page = data.page;

  if (page !== '/' && page !== '/gioi-thieu.html') {
    return {
      result: 'error',
      message: 'Invalid page'
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Thống kê truy cập');

    var headers = [
      'Ngày (giờ Việt Nam)',
      'Trang chủ',
      'Giới thiệu',
      'Tổng lượt xem'
    ];

    if (!sheet) {
      sheet = ss.insertSheet('Thống kê truy cập');
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    var rows = sheet.getDataRange().getValues();

    if (headers.some(function (h, i) {
      return rows[0][i] !== h;
    })) {
      throw new Error(
        'Unexpected tracking sheet headers; no data changed'
      );
    }

    var day = Utilities.formatDate(
      new Date(),
      'Asia/Ho_Chi_Minh',
      'yyyy-MM-dd'
    );

    var row = -1;

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === day) {
        row = i + 1;
        break;
      }
    }

    if (row === -1) {
      var next = sheet.getLastRow() + 1;

      sheet.getRange(next, 1).setNumberFormat('@');

      sheet.getRange(next, 1, 1, 4).setValues([[
        day,
        page === '/' ? 1 : 0,
        page === '/gioi-thieu.html' ? 1 : 0,
        1
      ]]);

    } else {
      var home = Number(rows[row - 1][1]) || 0;
      var about = Number(rows[row - 1][2]) || 0;

      if (page === '/') {
        home++;
      } else {
        about++;
      }

      sheet.getRange(row, 2, 1, 3).setValues([[
        home,
        about,
        home + about
      ]]);
    }

    SpreadsheetApp.flush();

    return { result: 'success' };

  } finally {
    lock.releaseLock();
  }
}
function taoBieuDoTruyCap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Thống kê truy cập');

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(
      'Chưa có dữ liệu truy cập. Hãy mở website rồi chạy lại.'
    );
  }

  var headers = sheet.getRange(1, 1, 1, 4).getValues()[0];

  if (
    headers[0] !== 'Ngày (giờ Việt Nam)' ||
    headers[3] !== 'Tổng lượt xem'
  ) {
    throw new Error(
      'Tiêu đề cột không đúng. Chưa thay đổi biểu đồ.'
    );
  }

  var title = 'Lượt xem website theo ngày';

  var existing = sheet.getCharts().filter(function (chart) {
    return chart.getOptions().get('title') === title;
  });

  // Chạy lại sẽ cập nhật biểu đồ cùng tên, không tạo trùng.
  var builder = existing.length
    ? existing[0].modify().clearRanges()
    : sheet.newChart().setPosition(2, 6, 0, 0);

  var chart = builder
    .asColumnChart()
    // Lấy cả cột để nhận thêm dữ liệu của các ngày tiếp theo.
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
    .setOption('width', 300)
    .setOption('height', 420)
    .build();

  if (existing.length) {
    sheet.updateChart(chart);
  } else {
    sheet.insertChart(chart);
  }
}

// ==================== HẾT FILE MÃ.GS ====================

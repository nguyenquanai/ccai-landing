// Chương trình đọc miễn phí, độc lập với Leads và Heyzine_Config.
// Thêm file này vào cùng dự án Apps Script; xem hướng dẫn FreeCampaign.md.
function setupFreeCampaign() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settings = ss.getSheetByName('Chương trình miễn phí');
  if (!settings) {
    settings = ss.insertSheet('Chương trình miễn phí');
    settings.getRange(1, 1, 5, 2).setNumberFormat('@').setValues([
      ['Cài đặt', 'Giá trị'],
      ['Trạng thái', 'TẮT'],
      ['Ngày bắt đầu', ''],
      ['Ngày kết thúc', ''],
      ['Tên chương trình', 'Đọc miễn phí bộ 3 tập']
    ]);
    settings.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#E85D26').setFontColor('#FFFFFF');
    settings.getRange(3, 2, 2, 1).setNote('Nhập YYYY-MM-DD theo giờ Việt Nam. Trống ngày bắt đầu: chạy ngay khi BẬT. Trống ngày kết thúc: không giới hạn thời gian. Kết thúc đến hết 23:59:59.');
    settings.setFrozenRows(1);
    settings.setColumnWidth(1, 220);
    settings.setColumnWidth(2, 340);
  }
  freeRegistrationSheet_(ss);
}

function freeDateKey_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }
  var text = String(value || '').trim();
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    var vn = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (!vn) return '';
    match = [text, vn[3], vn[2], vn[1]];
  }
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  var key = match[1] + '-' + match[2] + '-' + match[3];
  return date.toISOString().slice(0, 10) === key ? key : '';
}

function freeCampaignState_(now) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Chương trình miễn phí');
  if (!sheet) return { active: false };
  var rows = sheet.getDataRange().getValues();
  var config = {};
  rows.slice(1).forEach(function(row) { config[String(row[0])] = row[1]; });
  var rawStart = config['Ngày bắt đầu'];
  var rawEnd = config['Ngày kết thúc'];
  var hasStart = rawStart !== undefined && String(rawStart).trim() !== '';
  var hasEnd = rawEnd !== undefined && String(rawEnd).trim() !== '';
  var start = hasStart ? freeDateKey_(rawStart) : '';
  var end = hasEnd ? freeDateKey_(rawEnd) : '';
  var startMs = start ? Date.parse(start + 'T00:00:00+07:00') : -Infinity;
  var endMs = end ? Date.parse(end + 'T23:59:59.999+07:00') : Infinity;
  var clock = now === undefined ? Date.now() : now;
  var validDates = (!hasStart || !!start) && (!hasEnd || !!end);
  var active = String(config['Trạng thái'] || '').trim().toUpperCase() === 'BẬT'
    && validDates && startMs <= endMs && clock >= startMs && clock <= endMs;
  return {
    active: active,
    id: (start || 'open') + '_' + (end || 'open'),
    title: String(config['Tên chương trình'] || 'Đọc miễn phí bộ 3 tập').replace(/[\r\n]/g, ' ').slice(0, 120),
    startDate: start,
    endDate: end,
    endsAt: isFinite(endMs) ? endMs : 0,
    serverNow: clock
  };
}

// Công khai thời gian và tên chương trình, không công khai link/mật khẩu.
function getFreeCampaign() {
  try {
    var state = freeCampaignState_();
    return {
      version: 1, active: state.active, title: state.title || '',
      startDate: state.startDate || '', endDate: state.endDate || '',
      endsAt: state.endsAt || 0, serverNow: state.serverNow || Date.now()
    };
  } catch (err) {
    return { version: 1, active: false };
  }
}

function freeRegistrationSheet_(ss) {
  var name = 'Đăng ký miễn phí';
  var headers = ['Chương trình', 'Thời gian đăng ký', 'Họ tên', 'Email', 'Điện thoại', 'Nguồn', 'Trạng thái email', 'Lần gửi gần nhất'];
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E85D26').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  var first = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some(function(h, i) { return first[i] !== h; })) {
    throw new Error('Tiêu đề tab Đăng ký miễn phí không đúng.');
  }
  return sheet;
}

function freeBooks_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Heyzine_config_free');
  if (!sheet) throw new Error('Chưa có cấu hình sách miễn phí.');
  var rows = sheet.getDataRange().getValues();
  var names = ['Tập 1 Heyzine — 119.000đ', 'Tập 2 Heyzine — 179.000đ', 'Tập 3 Heyzine — 219.000đ'];
  return names.map(function(name, index) {
    var matches = rows.slice(1).filter(function(row) { return String(row[0]).trim() === name; });
    if (matches.length !== 1) throw new Error('Thiếu hoặc trùng cấu hình sách miễn phí.');
    var row = matches[0];
    var link = String(row[1] || '').trim();
    var pass = String(row[2] || '').trim();
    if (!/^https:\/\/heyzine\.com\/flip-book\/[a-zA-Z0-9]+\.html$/.test(link) || !pass) {
      throw new Error('Link hoặc mật khẩu sách miễn phí chưa hợp lệ.');
    }
    return { title: 'Tập ' + (index + 1), link: link, password: pass };
  });
}

// Chặn nội dung nhập vào bị Google Sheets diễn giải thành công thức.
function freeCell_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function registerFreeCampaign(data) {
  var email = String(data.email || '').trim().toLowerCase();
  var name = String(data.fullname || '').trim();
  var phone = String(data.phone || '').trim();
  var source = String(data.source || 'Website').trim().slice(0, 100);
  if (data.consent !== true || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254 ||
      !name || name.length > 100 || /[\r\n\x00-\x1f]/.test(name) ||
      phone.length > 30 || (phone && !/^[+\d\s().-]+$/.test(phone))) {
    return { result: 'invalid', message: 'Vui lòng kiểm tra họ tên, email và điện thoại.' };
  }
  if (data.website) return { result: 'invalid', message: 'Không thể gửi đăng ký này.' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { result: 'busy', message: 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.' };
  }
  try {
    // Luôn kiểm tra phía server, kể cả trang khách đang mở đã cũ.
    var campaign = freeCampaignState_();
    if (!campaign.active) return { result: 'closed', message: 'Chương trình hiện không nhận đăng ký miễn phí.' };
    var books = freeBooks_();
    var sheet = freeRegistrationSheet_(SpreadsheetApp.getActiveSpreadsheet());
    var rows = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var now = new Date();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === campaign.id && String(rows[i][3]).toLowerCase() === email) {
        rowIndex = i + 1;
        var last = rows[i][7];
        var sentAt = last instanceof Date ? last.getTime() : 0;
        if (sentAt && now.getTime() - sentAt < 10 * 60 * 1000) {
          return { result: 'cooldown', message: 'Vui lòng kiểm tra hộp thư và Spam. Bạn có thể yêu cầu gửi lại sau 10 phút.' };
        }
        break;
      }
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      return { result: 'busy', message: 'Hệ thống gửi email đang bận. Vui lòng quay lại sau.' };
    }
    if (rowIndex === -1) {
      sheet.appendRow([campaign.id, now, freeCell_(name), freeCell_(email), freeCell_(phone), freeCell_(source), 'Đang gửi', now]);
      rowIndex = sheet.getLastRow();
    } else {
      sheet.getRange(rowIndex, 7, 1, 2).setValues([['Đang gửi', now]]);
    }
    SpreadsheetApp.flush();
    var text = 'Chào ' + name + ',\n\n' + campaign.title + '\n';
    text += campaign.endDate
      ? 'Bạn được đọc miễn phí cả 3 tập đến hết ngày ' + campaign.endDate.split('-').reverse().join('/') + ' (giờ Việt Nam).\n'
      : 'Bạn được đọc miễn phí cả 3 tập. Chương trình hiện chưa ấn định ngày kết thúc.\n';
    books.forEach(function(book) {
      text += '\n' + book.title + '\nLink đọc: ' + book.link + '\nMã truy cập: ' + book.password + '\n';
    });
    text += '\nĐây là quyền đọc theo chương trình miễn phí, không phải đơn mua sách. Vui lòng không chia sẻ mã truy cập.\n';
    text += '\nCần hỗ trợ: nguyenquan140882@gmail.com hoặc Zalo 0904667411.\nTác giả: Nguyễn Quân';
    try {
      MailApp.sendEmail({ to: email, subject: campaign.title + ' — Link đọc 3 tập', body: text,
        replyTo: 'nguyenquan140882@gmail.com', name: 'Nguyễn Quân - AI Thực Chiến' });
    } catch (err) {
      sheet.getRange(rowIndex, 7).setValue('Gửi lỗi');
      SpreadsheetApp.flush();
      return { result: 'email_error', message: 'Chưa gửi được email. Vui lòng thử lại sau 10 phút hoặc liên hệ hỗ trợ.' };
    }
    sheet.getRange(rowIndex, 7).setValue('Đã gửi');
    SpreadsheetApp.flush();
    return { result: 'success', message: 'Email chứa link và mã truy cập 3 tập đã được gửi. Bạn kiểm tra cả mục Spam nhé.' };
  } catch (err) {
    return { result: 'error', message: 'Chưa hoàn tất đăng ký. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.' };
  } finally {
    lock.releaseLock();
  }
}

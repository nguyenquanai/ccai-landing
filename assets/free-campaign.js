(function () {
  'use strict';
  var section = document.getElementById('free-reading');
  if (!section) return;
  var cta = document.getElementById('free-reading-cta');
  var form = document.getElementById('free-reading-form');
  var button = document.getElementById('free-reading-submit');
  var status = document.getElementById('free-reading-status');
  var endpoint = 'https://script.google.com/macros/s/AKfycbwwQm4fftbg0WXXCnrIoG1_qkM_fxKbFu8vsWZa1hnhjrrWeGcqnXZObmH0QEnRHwjT/exec';
  var campaign = null;
  var expires = 0;
  var sending = false;
  function dateLabel(key) { return key.split('-').reverse().join('/'); }
  function message(text, state) { status.textContent = text; status.dataset.state = state; }
  // Custom messages keep validation bilingual regardless of browser language.
  form.noValidate = true;
  var validationError = false;
  var requiredMessages = {
    fullname: 'Vui lòng nhập họ và tên. / Please enter your full name.',
    email: 'Vui lòng nhập email nhận sách. / Please enter your email address.',
    phone: 'Vui lòng nhập số điện thoại. / Please enter your phone number.',
    consent: 'Vui lòng tích đồng ý để nhận link đọc. / Please agree to receive the reading links.'
  };
  ['fullname', 'email', 'phone', 'consent'].forEach(function (name) {
    var input = form.elements[name];
    input.setAttribute('aria-describedby', 'free-reading-status');
    function clearError() {
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
      if (validationError) { message('', ''); validationError = false; }
    }
    input.addEventListener('input', clearError);
    input.addEventListener('change', clearError);
  });
  function validateForm() {
    var firstInvalid = null;
    ['fullname', 'email', 'phone', 'consent'].forEach(function (name) {
      var input = form.elements[name];
      input.setCustomValidity('');
      var error = '';
      var empty = name === 'consent' ? !input.checked : !input.value.trim();
      if (empty) error = requiredMessages[name];
      else if (name === 'email' && (input.validity.typeMismatch ||
          !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.value.trim()))) {
        error = 'Email chưa đúng định dạng. / Please enter a valid email address.';
      } else if (name === 'phone' && !/^[+\d\s().-]+$/.test(input.value.trim())) {
        error = 'Số điện thoại chưa đúng định dạng. / Please enter a valid phone number.';
      } else if (!input.validity.valid) {
        error = 'Vui lòng kiểm tra thông tin đã nhập. / Please check the information entered.';
      }
      input.setCustomValidity(error);
      if (error) {
        input.setAttribute('aria-invalid', 'true');
        if (!firstInvalid) firstInvalid = input;
      } else input.removeAttribute('aria-invalid');
    });
    if (firstInvalid) {
      validationError = true;
      message(firstInvalid.validationMessage, 'error');
      firstInvalid.focus();
      firstInvalid.reportValidity();
      return false;
    }
    validationError = false;
    return true;
  }
  var responseEnglish = {
    success: 'The reading links and access codes have been sent. Please check your inbox and spam folder.',
    cooldown: 'Please check your inbox and spam folder. You can request another email after 10 minutes.',
    closed: 'This program is not accepting free registrations at the moment.',
    busy: 'The email service is busy. Please try again later.',
    invalid: 'Please check your name, email, phone number and consent.',
    email_error: 'The email could not be sent. Please retry after 10 minutes or contact support.',
    error: 'Registration could not be completed. Please try again later or contact support.'
  };
  function hideCampaign() {
    campaign = null;
    cta.hidden = true;
    // Keep an in-progress form visible so its result can still be read.
    if (!sending && !status.textContent) section.hidden = true;
    button.disabled = true;
  }
  function requestJson(url, options) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 20000);
    return fetch(url, Object.assign({ credentials: 'omit' }, options, { signal: controller.signal }))
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP error');
        return response.json();
      })
      .finally(function () { clearTimeout(timeout); });
  }
  function refreshCampaign() {
    return requestJson(endpoint + '?action=free_campaign', { cache: 'no-store' })
      .then(function (data) {
        // Legacy backends return reviews/promos: do not send an unrecognized POST.
        if (!data || data.version !== 1 || data.active !== true ||
            (data.startDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) ||
            (data.endDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) ||
            !(data.endsAt === 0 || data.endsAt > data.serverNow)) {
          hideCampaign();
          return false;
        }
        campaign = data;
        expires = data.endsAt ? Date.now() + data.endsAt - data.serverNow : Infinity;
        document.getElementById('free-reading-title').textContent = data.title || 'Đọc miễn phí bộ 3 tập';
        var dates = data.startDate ? 'Từ ' + dateLabel(data.startDate) + '. ' : '';
        dates += data.endDate ? 'Đọc miễn phí đến hết ' + dateLabel(data.endDate) + ' (giờ Việt Nam).' : 'Chương trình đang mở, chưa ấn định ngày kết thúc.';
        document.getElementById('free-reading-dates').textContent = dates;
        section.hidden = false;
        cta.hidden = false;
        button.disabled = sending;
        return true;
      })
      .catch(function () { hideCampaign(); return false; });
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending || !validateForm()) return;
    sending = true;
    button.disabled = true;
    button.textContent = 'Đang gửi…';
    message('Đang kiểm tra và gửi email nhận sách… / Checking your registration and sending the email…', 'pending');
    // Recheck campaign before POST; backend also checks the dates independently.
    refreshCampaign().then(function (active) {
      if (!active) {
        message('Chương trình hiện không nhận đăng ký hoặc chưa kết nối được. Vui lòng thử lại sau. / The program is unavailable or could not be reached. Please try again later.', 'error');
        return;
      }
      var payload = {
        action: 'register_free_campaign',
        consent: form.elements.consent.checked,
        fullname: form.elements.fullname.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        website: form.elements.website.value,
        source: typeof window.getTrackedSource === 'function' ? window.getTrackedSource() : 'Website'
      };
      return requestJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
      }).then(function (result) {
        if (result && result.result === 'success') {
          message((result.message || 'Email nhận sách đã được gửi.') + ' / ' + responseEnglish.success, 'success');
          form.reset();
        } else {
          message((result && result.message || 'Chưa xác nhận được đăng ký. Vui lòng thử lại sau.') + ' / ' +
            (result && responseEnglish[result.result] || responseEnglish.error), 'error');
          if (result && result.result === 'closed') hideCampaign();
        }
      }).catch(function () {
        // A failed response may follow a successful send. Do not retry automatically.
        message('Chưa xác nhận được kết quả. Bạn kiểm tra hộp thư và Spam trước khi gửi lại sau 10 phút. / The result could not be confirmed. Check your inbox and spam folder before retrying after 10 minutes.', 'error');
      });
    }).finally(function () {
      sending = false;
      button.textContent = 'Nhận link đọc miễn phí 3 tập';
      button.disabled = !campaign || Date.now() >= expires;
    });
  });
  setInterval(function () {
    if (campaign && Date.now() >= expires) {
      hideCampaign();
      if (!section.hidden && !sending) message('Chương trình đã hết thời gian đăng ký miễn phí. / Free registration has ended.', 'error');
    }
  }, 1000);
  setInterval(function () { if (!document.hidden && !sending) refreshCampaign(); }, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !sending) refreshCampaign();
  });
  refreshCampaign();
})();

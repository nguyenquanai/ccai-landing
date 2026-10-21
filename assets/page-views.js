/* Page views: one event per document load, including reloads; not unique visitors. */
(function () {
  'use strict';
  if (location.hostname !== 'nguyenquanai.vn' && location.hostname !== 'www.nguyenquanai.vn') return;
  var page = location.pathname === '/index.html' ? '/' : location.pathname;
  if (page !== '/' && page !== '/gioi-thieu.html') return;
  var endpoint = 'https://script.google.com/macros/s/AKfycbwwQm4fftbg0WXXCnrIoG1_qkM_fxKbFu8vsWZa1hnhjrrWeGcqnXZObmH0QEnRHwjT/exec';
  // Old backend treats unknown POSTs as leads: require explicit capability first.
  fetch(endpoint + '?action=tracking_config', { credentials: 'omit', cache: 'no-store' })
    .then(function (response) { return response.json(); })
    .then(function (config) {
      if (!config || config.pageViewTracking !== 1) return;
      return fetch(endpoint, {
        method: 'POST', mode: 'no-cors', credentials: 'omit', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ action: 'page_view', page: page })
      });
    })
    .catch(function () { /* Analytics failure must not interrupt ordering. No automatic retries. */ });
})();

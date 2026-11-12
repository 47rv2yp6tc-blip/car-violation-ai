(function () {
  'use strict';
  var countElement = document.getElementById('visitorCount');
  if (!countElement) return;

  fetch('/api/visitors', { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('Visitor counter unavailable');
      return response.json();
    })
    .then(function (payload) {
      if (!payload || !Number.isSafeInteger(payload.count) || payload.count < 0) {
        throw new Error('Invalid visitor count');
      }
      countElement.textContent = payload.count.toLocaleString('zh-TW');
    })
    .catch(function () {
      countElement.textContent = '暫時無法取得';
    });
})();

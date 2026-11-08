(function () {
  'use strict';

  function addVisitCounter() {
    if (document.getElementById('roadlensVisitCounter')) return;
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const card = document.createElement('section');
    card.id = 'roadlensVisitCounter';
    card.className = 'metric-card';
    card.setAttribute('aria-label', '網站累計瀏覽次數');
    card.innerHTML = '<h2 class="metric-title">網站累計瀏覽次數</h2>' +
      '<div class="metric-grid"><div class="metric"><strong id="roadlensVisitTotal" aria-live="polite">載入中…</strong>' +
      '<span>全站累計</span></div></div>';

    const cta = hero.querySelector('.cta-row');
    hero.insertBefore(card, cta || null);

    fetch('/api/visit-count', { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Visit count unavailable');
        return response.json();
      })
      .then(function (payload) {
        const total = Number(payload && payload.total);
        document.getElementById('roadlensVisitTotal').textContent =
          Number.isSafeInteger(total) && total >= 0 ? total.toLocaleString('zh-TW') : '暫不提供';
      })
      .catch(function () {
        const count = document.getElementById('roadlensVisitTotal');
        if (count) count.textContent = '暫不提供';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addVisitCounter, { once: true });
  } else {
    addVisitCounter();
  }
})();

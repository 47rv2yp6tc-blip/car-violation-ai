(function () {
  'use strict';

  function setCounterText(value) {
    const count = document.getElementById('roadlensVisitTotal');
    if (!count) return;
    count.textContent = value;
  }

  function addVisitCounter() {
    if (document.getElementById('roadlensVisitCounter')) return;
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const card = document.createElement('section');
    card.id = 'roadlensVisitCounter';
    card.className = 'metric-card';
    card.setAttribute('aria-label', '網站累計瀏覽次數');
    card.innerHTML = [
      '<h2 class="metric-title">網站累計瀏覽次數</h2>',
      '<div class="metric-grid">',
      '<div class="metric"><strong id="roadlensVisitTotal" aria-live="polite">載入中…</strong><span>全站累計</span></div>',
      '</div>'
    ].join('');

    const cta = hero.querySelector('.cta-row');
    hero.insertBefore(card, cta || null);

    fetch('/api/visit-count', { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error('Visit count unavailable');
        return response.json();
      })
      .then((payload) => {
        const rawTotal = Number(payload && payload.total);
        setCounterText(Number.isSafeInteger(rawTotal) && rawTotal >= 0 ? rawTotal.toLocaleString('zh-TW') : '暫不提供');
      })
      .catch(() => {
        setCounterText('暫不提供');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addVisitCounter, { once: true });
  } else {
    addVisitCounter();
  }
})();

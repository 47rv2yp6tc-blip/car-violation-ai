/* Upload compatibility, request-size protection, and interactive human review. */
(function () {
  'use strict';
  var input = document.getElementById('photoInput');
  var choose = document.getElementById('choose');
  var start = document.getElementById('start');
  var OriginalFileReader = window.FileReader;
  var OriginalFetch = window.fetch;
  var MAX_EDGE = 1800;
  var JPEG_QUALITY = 0.82;
  var MAX_TOTAL_BYTES = 10 * 1024 * 1024;
  var REVIEW_KEY = 'roadlens-human-review-v1';
  var latestAnalysis = null;
  var reviewState = {};

  function openPicker(event) { if (event) { event.preventDefault(); event.stopPropagation(); } if (input) { input.removeAttribute('capture'); input.click(); } }
  if (choose) choose.addEventListener('click', openPicker, false);
  if (start) start.addEventListener('click', openPicker, false);
  if (input) input.addEventListener('click', function (event) { event.stopPropagation(); }, false);

  function compress(file) { return new Promise(function (resolve) { if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file); var url = URL.createObjectURL(file), image = new Image(); image.onload = function () { var width = image.naturalWidth || image.width, height = image.naturalHeight || image.height, scale = Math.min(1, MAX_EDGE / Math.max(width, height)), canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); canvas.toBlob(function (blob) { if (!blob) return resolve(file); resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() })); }, 'image/jpeg', JPEG_QUALITY); }; image.onerror = function () { URL.revokeObjectURL(url); resolve(file); }; image.src = url; }); }
  window.FileReader = function () { var reader = new OriginalFileReader(), originalRead = reader.readAsDataURL.bind(reader); reader.readAsDataURL = function (file) { compress(file).then(function (smaller) { originalRead(smaller); }); }; return reader; };
  window.FileReader.prototype = OriginalFileReader.prototype;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]; }); }
  function readReview() { try { var value = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; } }
  function saveReview() { try { localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewState)); } catch (_) {} }
  function reviewItems(violation, index) {
    var source = Array.isArray(violation && violation.missing_evidence) ? violation.missing_evidence.filter(Boolean) : [];
    if (!source.length) source = ['照片證據是否足以支持此項判斷'];
    return source.slice(0, 8).map(function (text, itemIndex) { return { id: String(index) + '-' + String(itemIndex), label: String(text) }; });
  }
  function displayStatus(value) { return value === 'confirmed' ? '已確認' : value === 'not-applicable' ? '不符合' : value === 'unknown' ? '無法判斷' : '尚未確認'; }
  function renderReview() {
    var results = document.getElementById('results');
    if (!results || !latestAnalysis || !Array.isArray(latestAnalysis.violations)) return;
    var violations = latestAnalysis.violations;
    var old = document.getElementById('humanReviewPanel');
    if (old) old.remove();
    var panel = document.createElement('section');
    panel.id = 'humanReviewPanel';
    panel.className = 'human-review-panel';
    panel.setAttribute('aria-labelledby', 'humanReviewTitle');
    var items = [];
    violations.forEach(function (violation, index) { reviewItems(violation, index).forEach(function (item) { items.push({ item: item, violation: violation, index: index }); }); });
    if (!items.length) return;
    var completed = items.filter(function (entry) { return reviewState[entry.item.id]; }).length;
    panel.innerHTML = '<div class="human-review-heading"><div><h3 id="humanReviewTitle">需要人工確認</h3><p class="sub">AI 判斷與人工確認分開保存；人工確認不會改變 AI 原始信心。</p></div><strong id="humanReviewProgress">尚有 ' + (items.length - completed) + ' 項需要確認</strong></div>' + items.map(function (entry) { var selected = reviewState[entry.item.id] || ''; return '<div class="human-review-item" data-review-item="' + esc(entry.item.id) + '"><div class="human-review-label"><span>' + esc(entry.item.label) + '</span><small>AI 判斷：' + esc(entry.violation.violation_type || entry.violation.type || '疑似違規') + ' · AI 信心：' + esc(entry.violation.confidence == null ? '未提供' : entry.violation.confidence + '%') + '</small></div><div class="human-review-options" role="group" aria-label="' + esc(entry.item.label) + '"><button type="button" class="review-choice ' + (selected === 'confirmed' ? 'selected' : '') + '" data-review-value="confirmed">確認</button><button type="button" class="review-choice ' + (selected === 'not-applicable' ? 'selected' : '') + '" data-review-value="not-applicable">不符合</button><button type="button" class="review-choice ' + (selected === 'unknown' ? 'selected' : '') + '" data-review-value="unknown">無法判斷</button></div><span class="human-review-status" aria-live="polite">' + esc(displayStatus(selected)) + '</span></div>'; }).join('') + '<div class="human-review-actions"><button type="button" class="btn primary" id="completeHumanReview">完成人工確認</button><button type="button" class="btn secondary" id="resetHumanReview">重設人工確認</button><span id="humanReviewMessage" role="status"></span></div>';
    results.appendChild(panel);
    panel.querySelectorAll('[data-review-value]').forEach(function (button) { button.addEventListener('click', function () { var item = button.closest('[data-review-item]'); reviewState[item.getAttribute('data-review-item')] = button.getAttribute('data-review-value'); saveReview(); item.querySelectorAll('.review-choice').forEach(function (candidate) { candidate.classList.toggle('selected', candidate === button); candidate.setAttribute('aria-pressed', candidate === button ? 'true' : 'false'); }); item.querySelector('.human-review-status').textContent = displayStatus(button.getAttribute('data-review-value')); updateProgress(panel, items); }); });
    panel.querySelectorAll('.human-review-item').forEach(function (item) { item.querySelectorAll('.review-choice').forEach(function (button) { button.setAttribute('aria-pressed', button.classList.contains('selected') ? 'true' : 'false'); }); });
    document.getElementById('completeHumanReview').addEventListener('click', function () { var missing = items.filter(function (entry) { return !reviewState[entry.item.id]; }).length; var message = document.getElementById('humanReviewMessage'); if (missing) { message.textContent = '尚有 ' + missing + ' 項需要確認'; message.className = 'review-warning'; return; } reviewState.completed = true; saveReview(); message.textContent = '人工確認完成'; message.className = 'review-success'; updateResultAfterReview(items); });
    document.getElementById('resetHumanReview').addEventListener('click', function () { reviewState = {}; saveReview(); renderReview(); });
  }
  function updateProgress(panel, items) { var remaining = items.filter(function (entry) { return !reviewState[entry.item.id]; }).length; var progress = panel.querySelector('#humanReviewProgress'); if (progress) progress.textContent = remaining ? '尚有 ' + remaining + ' 項需要確認' : '人工確認完成'; }
  function updateResultAfterReview(items) {
    var excluded = items.filter(function (entry) { return reviewState[entry.item.id] === 'not-applicable'; }).map(function (entry) { return entry.index; });
    var active = (latestAnalysis.violations || []).filter(function (_, index) { return excluded.indexOf(index) === -1; });
    var totalMin = active.reduce(function (sum, violation) { return sum + (Number(violation.fine_min) || 0); }, 0), totalMax = active.reduce(function (sum, violation) { return sum + (Number(violation.fine_max) || 0); }, 0);
    var total = document.querySelector('#results .total strong');
    if (total) total.textContent = totalMin || totalMax ? 'NT$ ' + totalMin.toLocaleString() + '～' + totalMax.toLocaleString() : '需查證';
    var summary = document.querySelector('#results .summary');
    if (summary) { var note = document.getElementById('humanReviewSummary'); if (!note) { note = document.createElement('div'); note.id = 'humanReviewSummary'; note.className = 'facts'; summary.parentNode.insertBefore(note, summary.nextSibling); } note.innerHTML = '<b>人工確認結果：</b>已完成；' + excluded.length + ' 項標記為不符合並已排除於目前疑似違規與罰款估算。<br><small>AI 原始信心未被修改。</small>'; }
    var panel = document.getElementById('humanReviewPanel'); if (panel) { var message = document.getElementById('humanReviewMessage'); if (message) { message.textContent = '人工確認完成'; message.className = 'review-success'; } updateProgress(panel, items); }
    document.dispatchEvent(new CustomEvent('roadlens:human-review-updated', { detail: { confirmations: reviewState, excludedViolationIndexes: excluded, totalFineMin: totalMin, totalFineMax: totalMax } }));
  }
  function captureAnalysis(response) { try { var copy = response.clone(); copy.json().then(function (data) { if (data && Array.isArray(data.violations)) { latestAnalysis = data; reviewState = readReview(); renderReview(); } }).catch(function () {}); } catch (_) {} }
  window.fetch = function (url, options) { if (String(url).indexOf('/api/analyze') !== -1 && options && typeof options.body === 'string') { try { var payload = JSON.parse(options.body); if (Array.isArray(payload.images) && payload.images.length) { delete payload.image; delete payload.mimeType; delete payload.mimeTypes; var total = payload.images.reduce(function (sum, value) { return sum + String(value).length; }, 0); if (total > MAX_TOTAL_BYTES * 1.4) return Promise.reject(new Error('圖片總大小超過上限，請減少照片或重新拍攝。')); options = Object.assign({}, options, { body: JSON.stringify(payload) }); } } catch (_) {} } var request = OriginalFetch.call(this, url, options); if (String(url).indexOf('/api/analyze') !== -1) request.then(captureAnalysis).catch(function () {}); return request; };
  var style = document.createElement('style'); style.textContent = '.human-review-panel{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.human-review-heading{display:flex;justify-content:space-between;gap:12px;align-items:start}.human-review-heading h3{margin:0 0 5px}.human-review-item{padding:13px 0;border-top:1px solid var(--line)}.human-review-label{display:grid;gap:4px;margin-bottom:9px}.human-review-label small{color:var(--muted);line-height:1.5}.human-review-options{display:flex;gap:8px;flex-wrap:wrap}.review-choice{min-width:88px;min-height:42px;padding:9px 13px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font-weight:700}.review-choice.selected{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 0 0 3px #1769e033}.human-review-status{display:inline-block;margin-top:7px;font-size:13px;color:var(--muted)}.human-review-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:14px}.human-review-actions .btn{min-height:44px}.review-success{color:#147d67;font-weight:700}.review-warning{color:#a66300;font-weight:700}@media(max-width:600px){.human-review-heading{display:block}.human-review-options{display:grid;grid-template-columns:repeat(3,1fr)}.review-choice{min-width:0;width:100%;padding:10px 5px}}'; document.head.appendChild(style);
})();

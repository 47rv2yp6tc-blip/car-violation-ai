/* Print-friendly export of one saved analysis record as a standalone HTML report. */
(function () {
  'use strict';

  var HISTORY_KEY = 'roadlens-analysis-history-v1';
  var historyList = document.getElementById('historyList');
  if (!historyList) return;

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function loadRecords() {
    try {
      var parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function detectionTypes(violations) {
    if (!Array.isArray(violations) || !violations.length) return ['未確認／未偵測到可確認違規'];
    return Array.from(new Set(violations.map(function (item) {
      return String(item && (item.violation || item.type || item.violation_type) || '未分類').trim();
    }).filter(Boolean)));
  }

  function fineText(item) {
    if (!item || item.fine_min == null || item.fine_max == null || item.fine_status !== 'calculated') {
      return '官方資料不足，需查證；請勿視為正式裁罰金額。';
    }
    return 'NT$ ' + Number(item.fine_min).toLocaleString('zh-TW') + ' – NT$ ' + Number(item.fine_max).toLocaleString('zh-TW') + '（估算，需人工確認）';
  }

  function buildReport(record) {
    var result = record.result || {};
    var violations = Array.isArray(result.violations) ? result.violations : [];
    var quality = result.quality || {};
    var observed = Array.isArray(result.observed_facts) ? result.observed_facts : [];
    var issues = Array.isArray(quality.issues) ? quality.issues : [];
    var types = detectionTypes(violations);
    var created = new Date(record.createdAt);
    var dateText = Number.isNaN(created.getTime()) ? '時間不詳' : created.toLocaleString('zh-TW');
    var items = violations.length ? violations.map(function (item, index) {
      var type = item && (item.violation || item.type || item.violation_type) || '未分類';
      return '<section class="card"><h2>' + (index + 1) + '. ' + escapeHTML(type) + '</h2>' +
        '<p><strong>偵測類型：</strong>' + escapeHTML(type) + '</p>' +
        '<p><strong>AI 信心度：</strong>' + escapeHTML(item.confidence == null ? '未提供' : item.confidence + '%') + '</p>' +
        '<p><strong>人工確認：</strong>' + (item.needs_human_review || item.uncertain ? '待人工確認' : '仍建議人工檢視；AI 結果不是法律判定') + '</p>' +
        '<p><strong>證據：</strong>' + escapeHTML(item.evidence || '未提供') + '</p>' +
        '<p><strong>證據位置：</strong>' + escapeHTML(item.evidence_location || '未提供') + '</p>' +
        '<p><strong>理由：</strong>' + escapeHTML(item.reason || '未提供') + '</p>' +
        '<p><strong>罰款區間：</strong>' + escapeHTML(fineText(item)) + '</p>' +
        '<p><strong>法規：</strong>' + escapeHTML(item.rule && (item.rule.name || item.rule.law) || '資料不足，需查證') + '</p></section>';
    }).join('') : '<section class="card"><h2>違規項目</h2><p>未回報可確認的違規項目；如證據不足，請人工查證或補拍。</p></section>';

    var observedList = observed.length ? '<h2>影像觀察</h2><ul>' + observed.map(function (item) { return '<li>' + escapeHTML(item) + '</li>'; }).join('') + '</ul>' : '';
    var issueList = issues.length ? '<ul>' + issues.map(function (item) { return '<li>' + escapeHTML(item) + '</li>'; }).join('') + '</ul>' : '';
    var image = typeof record.image === 'string' && /^data:image\/(jpeg|png|webp);base64,/i.test(record.image)
      ? '<h2>上傳照片</h2><img class="evidence" src="' + record.image + '" alt="分析照片">'
      : '<p>照片資料無法匯出。</p>';

    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RoadLens AI 分析報告</title>' +
      '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#172337;line-height:1.65}h1{margin-bottom:4px}h2{font-size:1.1rem}.muted{color:#59677a}.card{border:1px solid #d5deea;border-radius:12px;padding:14px 18px;margin:14px 0;break-inside:avoid}.evidence{max-width:100%;max-height:520px;object-fit:contain;border:1px solid #ccd5e2;border-radius:10px}.warning{background:#fff7e6;border-left:4px solid #d99824;padding:12px}.actions{position:sticky;top:0;background:#fff;padding:12px 0}@media print{body{margin:0 auto}.actions{display:none}.card{break-inside:avoid}}</style></head><body>' +
      '<div class="actions"><button type="button" onclick="window.print()">列印 / 另存為 PDF</button></div>' +
      '<h1>RoadLens AI 分析報告</h1><p class="muted">分析時間：' + escapeHTML(dateText) + '</p>' +
      '<section class="card"><h2>分析摘要</h2><p>' + escapeHTML(result.summary || record.summary || '未提供摘要') + '</p>' +
      '<p><strong>偵測類型：</strong>' + types.map(escapeHTML).join('、') + '</p>' +
      '<p><strong>照片品質：</strong>' + (quality.usable ? '可供檢視' : '品質不足或無法確認，請人工檢視') + '</p>' + escapeHTML(quality.explanation || '') + issueList + '</section>' +
      observedList + items + image +
      '<section class="card"><h2>估算總額（僅供參考）</h2><p>' + (result.estimated_fine_min == null || result.estimated_fine_max == null ? '官方資料不足，需查證；不代表正式罰鍰。' : 'NT$ ' + Number(result.estimated_fine_min).toLocaleString('zh-TW') + ' – NT$ ' + Number(result.estimated_fine_max).toLocaleString('zh-TW') + '；需人工確認。') + '</p></section>' +
      '<p class="warning"><strong>重要提醒：</strong>本文件為 AI 分析摘要，僅供參考，不是正式裁罰或法律判定。請人工核對照片證據、所在地法規及官方資訊。</p>' +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})<\/script></body></html>';
  }

  function downloadReport(id) {
    var record = loadRecords().find(function (item) { return item.id === id; });
    if (!record) {
      window.alert('找不到這筆分析紀錄，請重新整理後再試。');
      return;
    }
    var blob = new Blob([buildReport(record)], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var date = new Date(record.createdAt);
    var stamp = Number.isNaN(date.getTime()) ? 'analysis' : date.toISOString().slice(0, 10);
    link.href = url;
    link.download = 'roadlens-analysis-' + stamp + '.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function addExportButtons() {
    historyList.querySelectorAll('.history-item').forEach(function (item) {
      if (item.parentElement && item.parentElement.classList.contains('history-row')) return;
      var id = item.getAttribute('data-history-id');
      if (!id) return;
      var row = document.createElement('div');
      row.className = 'history-row';
      row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:stretch';
      item.parentNode.insertBefore(row, item);
      row.appendChild(item);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-btn secondary small';
      button.textContent = '匯出報告';
      button.setAttribute('aria-label', '匯出這筆分析紀錄報告');
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        downloadReport(id);
      });
      row.appendChild(button);
    });
  }

  new MutationObserver(addExportButtons).observe(historyList, { childList: true, subtree: true });
  addExportButtons();
})();

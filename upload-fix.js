/* RoadLens AI frontend guard: quality preflight, progress, single-request state, history, demo and result actions. */
(function () {
  'use strict';

  var input = document.getElementById('photoInput');
  var cameraInput = document.getElementById('cameraInput');
  var choose = document.getElementById('choose');
  var start = document.getElementById('start');
  var analyze = document.getElementById('analyze');
  var results = document.getElementById('results');
  var previews = document.getElementById('previews');
  var drop = document.getElementById('drop');
  var files = [];
  var controller = null;
  var requestState = 'idle';
  var report = null;
  var confirmations = {};
  var HISTORY_KEY = 'roadlens-history';
  var FLOW_KEY = 'roadlens-analysis-flow-v2';
  var MAX_EDGE = 1800;
  var MAX_TOTAL_BYTES = 10 * 1024 * 1024;

  if (!input || !analyze || !results) return;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function setMessage(text, error) {
    results.innerHTML = '<div class="' + (error ? 'error' : 'summary') + '" role="status">' + esc(text) + '</div>';
  }

  function setProgress(step, message) {
    var labels = ['讀取圖片', '檢查圖片品質', 'AI 分析', '整理違規資訊', '計算預估罰款', '完成'];
    results.innerHTML = '<div class="empty flow-progress" role="status" aria-live="polite"><strong>' + esc(message || labels[step]) + '</strong><ol>' + labels.map(function (label, index) {
      return '<li class="' + (index < step ? 'done' : index === step ? 'active' : '') + '">' + esc(label) + '</li>';
    }).join('') + '</ol></div>';
  }

  function setBusy(busy) {
    requestState = busy ? 'running' : 'idle';
    analyze.disabled = busy || !files.length;
    analyze.setAttribute('aria-busy', busy ? 'true' : 'false');
    analyze.textContent = busy ? '分析中…' : '開始 AI 分析';
    if (choose) choose.disabled = busy;
    if (start) start.disabled = busy;
  }

  function openPicker(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (!requestState || requestState === 'idle') input.click();
  }

  if (choose) choose.onclick = openPicker;
  if (start) start.onclick = openPicker;

  function imageLoad(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('圖片無法讀取')); };
      image.src = url;
    });
  }

  function qualityCheck(file, image) {
    var issues = [];
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) issues.push('格式必須是 JPG、PNG 或 WEBP');
    if (file.size > 10 * 1024 * 1024) issues.push('單張圖片不可超過 10 MB');
    if (image.width < 640 || image.height < 480) issues.push('解析度過低，建議至少 640×480');

    var canvas = document.createElement('canvas');
    var width = Math.min(320, image.width);
    var height = Math.max(1, Math.round(image.height * width / image.width));
    canvas.width = width; canvas.height = height;
    var context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    var data = context.getImageData(0, 0, width, height).data;
    var total = 0; var variance = 0; var previous = null;
    for (var i = 0; i < data.length; i += 4) {
      var gray = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      total += gray;
      if (previous !== null) variance += Math.abs(gray - previous);
      previous = gray;
    }
    var pixels = data.length / 4;
    var brightness = total / pixels;
    var detail = variance / Math.max(1, pixels - 1);
    if (brightness < 22) issues.push('圖片過暗，無法可靠辨識道路細節');
    if (detail < 1.8) issues.push('圖片可能過度模糊或缺少可辨識細節');
    return { issues: issues, width: image.width, height: image.height, brightness: Math.round(brightness), detail: Math.round(detail * 10) / 10 };
  }

  function compress(file, image) {
    return new Promise(function (resolve) {
      var scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
      }, 'image/jpeg', 0.82);
    });
  }

  function read(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function select(list) {
    if (requestState === 'running') return;
    var candidates = Array.prototype.slice.call(list || []).filter(function (file) {
      return /^image\/(jpeg|png|webp)$/.test(file.type);
    }).slice(0, 6);
    if (!candidates.length) { setMessage('請選擇 JPG、PNG 或 WEBP 圖片。', true); return; }
    var checked = [];
    var rejected = [];
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var image = await imageLoad(candidates[i]);
        var check = qualityCheck(candidates[i], image);
        if (check.issues.length) rejected.push(candidates[i].name + '：' + check.issues.join('、'));
        else checked.push({ file: candidates[i], image: image, quality: check });
      } catch (_) { rejected.push(candidates[i].name + '：圖片無法讀取'); }
    }
    files = checked;
    renderPreviews();
    if (rejected.length) setMessage('部分圖片未通過品質預檢：' + rejected.join('；'), true);
    else setMessage('圖片已通過品質預檢，可以開始分析。', false);
  }

  function renderPreviews() {
    if (!previews) return;
    previews.classList.toggle('hidden', !files.length);
    previews.innerHTML = files.map(function (item, index) {
      return '<div class="preview-item"><img class="preview" src="' + URL.createObjectURL(item.file) + '" alt="待分析圖片 ' + (index + 1) + '" loading="lazy"><small>' + esc(item.file.name) + '</small></div>';
    }).join('');
    analyze.disabled = !files.length;
  }

  input.onchange = function (event) { select(event.target.files); };
  if (cameraInput) cameraInput.onchange = function (event) { select(event.target.files); };
  if (drop) {
    ['dragenter', 'dragover'].forEach(function (name) { drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (name) { drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.remove('drag'); }); });
    drop.addEventListener('drop', function (event) { select(event.dataTransfer.files); });
  }

  function history() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
  }
  function saveHistory(result, demo) {
    var items = history();
    var violations = Array.isArray(result.violations) ? result.violations : [];
    items.unshift({
      id: Date.now().toString(36), date: new Date().toISOString(), demo: Boolean(demo),
      summary: String(result.summary || ''), violations: violations.map(function (v, index) { return { type: v.type || v.violation_type, confidence: v.confidence, confirmation: confirmations[index] || null, fine_min: v.fine_min, fine_max: v.fine_max }; }),
      total_fine_min: result.total_fine_min, total_fine_max: result.total_fine_max,
      thumbnail: files[0] ? URL.createObjectURL(files[0].file) : null
    });
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30).map(function (item) { var copy = Object.assign({}, item); delete copy.thumbnail; return copy; }))); } catch (_) {}
  }

  function finalStatus(v, index) {
    if (v && (v.needs_human_review || (v.missing_evidence && v.missing_evidence.length))) return confirmations[index] || 'pending';
    if (!v || Number(v.confidence || 0) < 50 || String(v.type || v.violation_type || '').includes('無法')) return 'uncertain';
    return confirmations[index] || 'ai';
  }

  function fineText(v) {
    if (v && v.fine_min != null && v.fine_max != null) return 'NT$ ' + Number(v.fine_min).toLocaleString() + ' ~ NT$ ' + Number(v.fine_max).toLocaleString();
    return '需查證官方資料';
  }

  function renderResult(result, demo) {
    report = result;
    var violations = Array.isArray(result.violations) ? result.violations : [];
    var cards = violations.length ? violations.map(function (v, index) {
      var status = finalStatus(v, index);
      var label = { ai: 'AI 判斷結果', confirmed: '使用者確認：違規', excluded: '使用者確認：不是違規', unknown: '使用者確認：無法判斷', uncertain: '無法完全確認', pending: '等待使用者確認' }[status];
      var review = status === 'pending' || status === 'ai' || status === 'uncertain' ? '<div class="flow-review-options" data-review="' + index + '"><button type="button" data-confirm="confirmed">確認違規</button><button type="button" data-confirm="excluded">不是違規</button><button type="button" data-confirm="unknown">無法判斷</button></div>' : '';
      return '<article class="violation flow-result-card"><div class="result-head"><strong>' + esc(v.type || v.violation_type || '無法完全確認') + '</strong><span class="pill">' + label + '</span></div><p><b>AI 判斷：</b>' + esc(v.reason || v.evidence || '未提供') + '</p><p><b>判斷依據：</b>' + esc(v.evidence || '未提供') + '</p><p><b>信心程度：</b>' + esc(v.confidence == null ? '不確定' : v.confidence + '%') + '</p><p><b>不確定原因／待確認資訊：</b>' + esc((v.missing_evidence || []).join('、') || (status === 'uncertain' ? '影像證據不足，請人工確認。' : '無')) + '</p><p><b>預估罰款：</b>' + fineText(v) + '</p>' + review + '</article>';
    }).join('') : '<div class="empty">沒有可確認的違規項目。</div>';
    var demoLabel = demo ? '<p class="notice"><b>Demo 結果：</b>不是真實 AI 分析，不會呼叫 Gemini API。</p>' : '';
    results.innerHTML = '<div class="flow-page">' + demoLabel + '<div class="result-head"><h2>AI 分析結果</h2><div class="toolbar"><button type="button" id="copyResult">複製結果</button><button type="button" id="printResult">列印結果</button><button type="button" id="shareResult">分享結果</button></div></div><div class="summary"><b>分析摘要：</b>' + esc(result.summary || '未提供') + '<br><b>分析依據：</b>' + esc((result.observed_facts || []).join('、') || '模型未提供額外事實') + '</div><div class="flow-results">' + cards + '</div><div class="total"><span>預估總額</span><strong>' + (result.total_fine_min == null ? '需查證官方資料' : 'NT$ ' + Number(result.total_fine_min).toLocaleString() + ' ~ NT$ ' + Number(result.total_fine_max || result.total_fine_min).toLocaleString()) + '</strong></div><div class="flow-actions"><button type="button" id="completeConfirmation" class="primary">完成使用者確認</button><button type="button" id="demoButton">使用範例照片</button></div></div>';
    bindResultActions(demo);
  }

  function resultText() {
    return (report ? report.summary || '' : '') + '\n' + ((report && report.violations) || []).map(function (v, i) { return (i + 1) + '. ' + (v.type || v.violation_type) + '；信心：' + (v.confidence == null ? '不確定' : v.confidence + '%') + '；確認：' + (confirmations[i] || '未確認') + '；罰款：' + fineText(v); }).join('\n');
  }

  function bindResultActions(demo) {
    document.querySelectorAll('[data-confirm]').forEach(function (button) { button.onclick = function () { var parent = button.closest('[data-review]'); confirmations[Number(parent.getAttribute('data-review'))] = button.getAttribute('data-confirm'); renderResult(report, demo); }; });
    var complete = document.getElementById('completeConfirmation');
    if (complete) complete.onclick = function () { saveHistory(report, demo); complete.textContent = '確認結果已保存'; complete.disabled = true; };
    var copy = document.getElementById('copyResult'); if (copy) copy.onclick = function () { navigator.clipboard?.writeText(resultText()); };
    var print = document.getElementById('printResult'); if (print) print.onclick = function () { window.print(); };
    var share = document.getElementById('shareResult'); if (share) share.onclick = function () { if (navigator.share) navigator.share({ title: 'RoadLens AI 分析結果', text: resultText() }).catch(function () {}); else navigator.clipboard?.writeText(resultText()); };
    var demoButton = document.getElementById('demoButton'); if (demoButton) demoButton.onclick = function () { renderDemo(); };
  }

  function renderDemo() {
    confirmations = {};
    renderResult({ summary: '範例資料：展示分析、證據與人工確認流程。', observed_facts: ['範例車輛', '範例道路標線', '範例車輛位置'], total_fine_min: 0, total_fine_max: 0, violations: [{ type: '範例疑似違規', confidence: 62, evidence: '範例證據文字，不代表實際影像判斷。', reason: 'Demo 只用於檢視介面流程。', fine_min: 0, fine_max: 0, missing_evidence: ['需要實際照片'], needs_human_review: true }] }, true);
  }

  async function analyzeRequest() {
    if (requestState === 'running' || !files.length) return;
    setBusy(true); confirmations = {}; controller = new AbortController();
    try {
      setProgress(0, '正在讀取圖片');
      var prepared = [];
      var totalBytes = 0;
      for (var i = 0; i < files.length; i += 1) { setProgress(1, '正在檢查圖片品質'); var compressed = await compress(files[i].file, files[i].image); totalBytes += compressed.size; prepared.push({ file: compressed, data: await read(compressed) }); }
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('圖片總大小過大，請減少圖片或重新壓縮。');
      setProgress(2, '正在進行 AI 分析');
      var response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: prepared.map(function (x) { return x.data; }), mimeTypes: prepared.map(function (x) { return x.file.type; }) }), signal: controller.signal });
      var body = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(body.error || '分析服務暫時無法處理。');
      setProgress(3, '正在整理違規資訊'); await new Promise(function (resolve) { setTimeout(resolve, 80); });
      setProgress(4, '正在計算預估罰款'); await new Promise(function (resolve) { setTimeout(resolve, 80); });
      setProgress(5, '分析完成'); renderResult(body, false);
      try { sessionStorage.setItem(FLOW_KEY, JSON.stringify({ report: body, at: Date.now() })); } catch (_) {}
    } catch (error) {
      if (error.name === 'AbortError') setMessage('分析已取消。', false); else setMessage(error.message || '分析失敗，請稍後再試。', true);
    } finally { controller = null; setBusy(false); }
  }

  analyze.onclick = analyzeRequest;
  var clear = document.getElementById('clear');
  if (clear) clear.onclick = function () { files = []; input.value = ''; if (cameraInput) cameraInput.value = ''; if (previews) previews.innerHTML = ''; analyze.disabled = true; setMessage('已清除圖片。', false); };

  var cancel = document.getElementById('cancelAnalysis');
  if (!cancel) { cancel = document.createElement('button'); cancel.type = 'button'; cancel.id = 'cancelAnalysis'; cancel.textContent = '取消分析'; cancel.className = 'btn secondary'; analyze.parentNode && analyze.parentNode.appendChild(cancel); }
  cancel.onclick = function () { if (controller) controller.abort(); };

  var demo = document.createElement('button'); demo.type = 'button'; demo.id = 'demoAnalysis'; demo.className = 'btn secondary'; demo.textContent = '使用範例結果（不呼叫 AI）'; demo.onclick = renderDemo;
  if (analyze.parentNode) analyze.parentNode.appendChild(demo);

  try {
    var saved = JSON.parse(sessionStorage.getItem(FLOW_KEY) || 'null');
    if (saved && saved.report && Date.now() - Number(saved.at) < 30 * 60 * 1000) renderResult(saved.report, false);
  } catch (_) {}
})();

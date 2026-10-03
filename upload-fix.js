/* Upload compatibility helper and final-result UX improvements. Loaded by the page only when explicitly referenced. */
(function () {
  'use strict';
  var input = document.getElementById('photoInput');
  var choose = document.getElementById('choose');
  var start = document.getElementById('start');
  if (!input) return;
  function openPicker(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    input.removeAttribute('capture');
    input.click();
  }
  if (choose) choose.addEventListener('click', openPicker, false);
  if (start) start.addEventListener('click', openPicker, false);
  input.addEventListener('click', function (event) { event.stopPropagation(); }, false);

  /* --- Final result UX enhancements --- */
  var FINAL_STYLE_ID = 'roadlens-final-ux-style';
  function ensureFinalStyles() {
    if (document.getElementById(FINAL_STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = FINAL_STYLE_ID;
    s.textContent = '\n      /* Final result: card and modal styles */\n      .final-preview-image{border:1px solid var(--line);border-radius:10px;display:block;width:100%;height:auto;object-fit:contain;cursor:zoom-in;transition:box-shadow .18s ease} \n      .final-preview-image:hover{box-shadow:0 12px 30px rgba(16,35,63,.08)}\n      .roadlens-modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(12,15,20,0.6);z-index:9999;padding:20px} \n      .roadlens-modal .content{position:relative;max-width:1100px;width:100%;max-height:90vh;background:transparent;border-radius:10px;overflow:auto} \n      .roadlens-modal img{display:block;max-width:100%;height:auto;border-radius:8px} \n      .roadlens-modal .close{position:absolute;right:8px;top:8px;background:#fff;border-radius:8px;padding:6px 8px;border:0;cursor:pointer;box-shadow:0 5px 14px rgba(16,35,63,.12)}\n      .roadlens-overlay-canvas{position:absolute;left:0;top:0;pointer-events:none} \n      .final-result-left .final-preview-image{max-height:520px} \n      .pill{font-size:12px;padding:6px 10px;border-radius:999px;font-weight:800} \n      .pill-ai{background:#eaf2ff;color:var(--blue)}\n      .pill-user{background:#e8fff3;color:#147d67} \n      @media (max-width:760px){ .final-result-layout{display:block} .final-result-left{width:100%!important} }\n    ';
    document.head.appendChild(s);
  }

  function openImageModal(dataUrl, boxes) {
    ensureFinalStyles();
    var modal = document.createElement('div'); modal.className = 'roadlens-modal'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
    var content = document.createElement('div'); content.className = 'content';
    var img = document.createElement('img'); img.src = dataUrl; img.alt = '放大檢視影像';
    content.appendChild(img);

    // when boxes provided and image loads, draw overlay on a canvas scaled to image
    if (Array.isArray(boxes) && boxes.length) {
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var canvas = document.createElement('canvas'); canvas.className = 'roadlens-overlay-canvas';
          canvas.width = img.width; canvas.height = img.height;
          canvas.style.width = img.width + 'px'; canvas.style.height = img.height + 'px';
          canvas.style.left = img.offsetLeft + 'px'; canvas.style.top = img.offsetTop + 'px';
          canvas.style.position = 'absolute';
          content.style.position = 'relative';
          content.appendChild(canvas);
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0,0,canvas.width,canvas.height);
          ctx.lineWidth = Math.max(2, Math.round(Math.max(canvas.width, canvas.height) * 0.004));
          ctx.strokeStyle = 'rgba(231,84,80,0.95)';
          ctx.fillStyle = 'rgba(231,84,80,0.08)';
          boxes.forEach(function(box){
            // box expected format: normalized { x,y,w,h } with x,y top-left normalized 0..1
            var bx = (box.x||0) * canvas.width; var by = (box.y||0) * canvas.height; var bw = (box.w||0) * canvas.width; var bh = (box.h||0) * canvas.height;
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeRect(bx, by, bw, bh);
          });
        } catch (e) { /* ignore drawing errors */ }
      };
    }

    var close = document.createElement('button'); close.className = 'close'; close.innerHTML = '關閉'; close.addEventListener('click', function(){ document.body.removeChild(modal); });
    content.appendChild(close);
    modal.appendChild(content);
    modal.addEventListener('click', function (e) { if (e.target === modal) document.body.removeChild(modal); });
    document.body.appendChild(modal);
  }

  // attach modal handler to final images after rendered
  function enhanceFinalResults() {
    var images = document.querySelectorAll('.final-preview-image');
    if (!images || !images.length) return;
    // get analysis object to find boxes if present
    var analysis = null;
    try { analysis = JSON.parse(localStorage.getItem('roadlens-latest-analysis-v1') || 'null'); } catch (_) { analysis = null; }
    images.forEach(function(img, idx){
      if (img.__roadlensEnhanced) return; img.__roadlensEnhanced = true;
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function(){
        var dataUrl = img.src;
        var boxes = [];
        // try map boxes: if analysis.violations[idx] has bounding_boxes or boxes
        try {
          if (analysis && Array.isArray(analysis.violations)) {
            // if multiple images, mapping between image index and violations is not strict; try gather all boxes across violations
            analysis.violations.forEach(function(v){
              if (Array.isArray(v.bounding_boxes) && v.bounding_boxes.length) {
                boxes = boxes.concat(v.bounding_boxes.map(function(b){ return normalizedBoxFrom(b); }));
              } else if (v.image_index === idx && Array.isArray(v.boxes) && v.boxes.length) {
                boxes = boxes.concat(v.boxes.map(function(b){ return normalizedBoxFrom(b); }));
              }
            });
          }
        } catch(e){}
        openImageModal(dataUrl, boxes);
      }, false);
    });
  }

  function normalizedBoxFrom(b) {
    // Accept a few common box formats and normalize to {x,y,w,h} in 0..1 range
    if (!b) return null;
    // If already normalized
    if (typeof b.x === 'number' && typeof b.y === 'number' && typeof b.w === 'number' && typeof b.h === 'number') return {x:b.x, y:b.y, w:b.w, h:b.h};
    // absolute coords {x,y,width,height} relative to image pixel dims: if image_w/h present
    if (typeof b.x === 'number' && typeof b.y === 'number' && typeof b.width === 'number' && typeof b.height === 'number' && b.image_width && b.image_height) {
      return { x: b.x / b.image_width, y: b.y / b.image_height, w: b.width / b.image_width, h: b.height / b.image_height };
    }
    // try {left,top,right,bottom} with image dims
    if (typeof b.left === 'number' && typeof b.top === 'number' && typeof b.right === 'number' && typeof b.bottom === 'number' && b.image_width && b.image_height) {
      return { x: b.left / b.image_width, y: b.top / b.image_height, w: (b.right - b.left) / b.image_width, h: (b.bottom - b.top) / b.image_height };
    }
    return null;
  }

  // Observe DOM for final-result-panel and enhance when appears
  var observer = new MutationObserver(function(mutations){
    for (var i=0;i<mutations.length;i++){
      var m = mutations[i];
      if (m.addedNodes && m.addedNodes.length) {
        for (var j=0;j<m.addedNodes.length;j++){
          var node = m.addedNodes[j];
          if (node.nodeType === 1 && node.querySelector && node.querySelector('.final-preview-image')) {
            try { enhanceFinalResults(); } catch (_) {}
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also try to enhance on load
  window.addEventListener('load', function () { setTimeout(enhanceFinalResults, 500); });

})();

/* Upload compatibility and request-size protection. */
(function () {
  'use strict';
  var input = document.getElementById('photoInput');
  var choose = document.getElementById('choose');
  var start = document.getElementById('start');
  var OriginalFileReader = window.FileReader;
  var OriginalFetch = window.fetch;
  var MAX_EDGE = 1800;
  var JPEG_QUALITY = 0.82;

  function openPicker(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (input) { input.removeAttribute('capture'); input.click(); }
  }
  if (choose) choose.addEventListener('click', openPicker, false);
  if (start) start.addEventListener('click', openPicker, false);
  if (input) input.addEventListener('click', function (event) { event.stopPropagation(); }, false);

  function compress(file) {
    return new Promise(function (resolve) {
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);
      var url = URL.createObjectURL(file), image = new Image();
      image.onload = function () {
        var scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          resolve(blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }) : file);
        }, 'image/jpeg', JPEG_QUALITY);
      };
      image.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      image.src = url;
    });
  }

  // The existing page reads selected files with FileReader. Compress those
  // files transparently before they become Base64 request data.
  window.FileReader = function () {
    var reader = new OriginalFileReader();
    var originalRead = reader.readAsDataURL.bind(reader);
    reader.readAsDataURL = function (file) {
      compress(file).then(function (smaller) { originalRead(smaller); });
    };
    return reader;
  };
  window.FileReader.prototype = OriginalFileReader.prototype;

  // Remove the duplicate single-image payload. The backend accepts images and
  // mimeTypes; sending image/mimeType again unnecessarily increases body size.
  window.fetch = function (url, options) {
    if (String(url).indexOf('/api/analyze') !== -1 && options && typeof options.body === 'string') {
      try {
        var payload = JSON.parse(options.body);
        if (Array.isArray(payload.images) && payload.images.length) {
          delete payload.image;
          delete payload.mimeType;
          options = Object.assign({}, options, { body: JSON.stringify(payload) });
        }
      } catch (_) { /* Let the original fetch report malformed payloads. */ }
    }
    return OriginalFetch.call(this, url, options);
  };
})();

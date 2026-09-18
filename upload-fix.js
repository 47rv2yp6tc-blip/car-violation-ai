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
        var width = image.naturalWidth || image.width;
        var height = image.naturalHeight || image.height;
        var scale = Math.min(1, MAX_EDGE / Math.max(width, height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', JPEG_QUALITY);
      };
      image.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      image.src = url;
    });
  }

  // The existing page reads selected files with FileReader. Compress them
  // transparently before they become Base64 request data.
  window.FileReader = function () {
    var reader = new OriginalFileReader();
    var originalRead = reader.readAsDataURL.bind(reader);
    reader.readAsDataURL = function (file) {
      compress(file).then(function (smaller) { originalRead(smaller); });
    };
    return reader;
  };
  window.FileReader.prototype = OriginalFileReader.prototype;

  // The page sends legacy image/mimeType fields as well. Remove those fields,
  // and remove mimeTypes too because compression can change PNG/WEBP to JPEG.
  // The API accepts images and infers each MIME type from its data URL.
  window.fetch = function (url, options) {
    if (String(url).indexOf('/api/analyze') !== -1 && options && typeof options.body === 'string') {
      try {
        var payload = JSON.parse(options.body);
        if (Array.isArray(payload.images) && payload.images.length) {
          delete payload.image;
          delete payload.mimeType;
          delete payload.mimeTypes;
          options = Object.assign({}, options, { body: JSON.stringify(payload) });
        }
      } catch (_) { /* Let the original fetch report malformed payloads. */ }
    }
    return OriginalFetch.call(this, url, options);
  };
})();

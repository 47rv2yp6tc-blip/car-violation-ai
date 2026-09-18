/* Upload compatibility helper. Loaded by the page only when explicitly referenced. */
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
})();

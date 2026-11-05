// Shared by every road page (stops and tools): escaping, toasts and the Copy buttons.
// A [data-copy] button puts its text on the clipboard; that is how the message templates leave the
// site (the copy guard allows it, and selecting text inside [data-copy-ok] is allowed too).
window.UGLRoadCommon = window.UGLRoadCommon || (function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var own, ownTimer;
  function toast(msg, ms) {
    // On the live site the lesson loader's guard owns the toast; the offline preview has none.
    if (window.uglGuard && window.uglGuard.toast) return window.uglGuard.toast(msg, ms);
    if (!own) { own = document.createElement('div'); own.className = 'rt-toast'; own.setAttribute('role', 'status'); document.body.appendChild(own); }
    own.textContent = msg; own.classList.add('is-on');
    clearTimeout(ownTimer); ownTimer = setTimeout(function () { own.classList.remove('is-on'); }, ms || 2600);
  }
  function copy(text, done) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      toast(ok ? (done || 'Copied.') : 'Could not copy. Select the text and press Ctrl+C.');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(done || 'Copied.'); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    copy(b.getAttribute('data-copy'), 'Copied. Paste it in Gmail or Telegram and fill in the dots.');
    b.classList.add('is-copied');
    setTimeout(function () { b.classList.remove('is-copied'); }, 1400);
    document.dispatchEvent(new CustomEvent('ugl-copied', { detail: { button: b } }));
  });
  return { $: $, esc: esc, toast: toast, copy: copy };
})();

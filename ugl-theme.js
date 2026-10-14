// Light/dark theme for the whole site. The choice is stored per browser ('ugl-theme') and
// applied to the portal, every content page, the PDF viewer and the narrated decks.
(function () {
  var KEY = 'ugl-theme';
  var SUN = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>';

  function get() { try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; } }
  function set(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }

  // Site pages: theme lives on <html data-theme>; buttons show what you switch to.
  function apply(doc, t) {
    doc = doc || document; t = t || get();
    doc.documentElement.setAttribute('data-theme', t);
    doc.querySelectorAll('.theme-btn').forEach(function (b) {
      var label = t === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
      b.innerHTML = t === 'light' ? MOON : SUN;
      b.setAttribute('aria-label', label); b.title = label;
    });
  }

  function wire(doc) {
    doc = doc || document;
    doc.querySelectorAll('.theme-btn:not([data-wired])').forEach(function (b) {
      b.setAttribute('data-wired', '');
      b.addEventListener('click', function () { var t = get() === 'light' ? 'dark' : 'light'; set(t); apply(doc, t); });
    });
    apply(doc);
  }

  // Content pages from the bucket have a top bar but no switch: add one next to the back link.
  function addButton(doc) {
    var right = doc.querySelector('.topbar__right');
    if (right && !right.querySelector('.theme-btn')) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'theme-btn';
      right.insertBefore(b, right.firstChild);
    }
    wire(doc);
  }

  // Decks ship their own switch (#themeBtn, or #themebtn in the reference guide). Open them in the
  // site's theme by pressing it once if needed, and remember any change made there.
  function syncDeck(doc) {
    var guide = doc.getElementById('themebtn'), btn = doc.getElementById('themeBtn') || guide;
    if (!btn) return;
    function deckTheme() {
      if (guide) return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      return doc.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    if (deckTheme() !== get()) btn.click();
    btn.addEventListener('click', function () { setTimeout(function () { set(deckTheme()); }, 0); });
  }

  window.uglTheme = { get: get, set: set, apply: apply, wire: wire, addButton: addButton, syncDeck: syncDeck };
  apply(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { wire(document); });
  else wire(document);
})();

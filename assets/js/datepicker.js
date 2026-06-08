// Calendar popover wiring. The Liquid include `_includes/date_picker.html`
// can be dropped onto any page (header / home screener / daily nav strip);
// every instance is marked with `data-qt-cal-root`. We bind each one
// independently and share a single document-level listener pair for
// outside-click and Esc.
(function () {
  var roots = document.querySelectorAll('[data-qt-cal-root]');
  if (!roots.length) return;

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var instances = [];

  function bind(root) {
    var btn = root.querySelector('[data-qt-cal-btn]');
    var pop = root.querySelector('[data-qt-cal-pop]');
    var label = root.querySelector('[data-qt-cal-month-label]');
    var prevBtn = root.querySelector('[data-qt-cal-prev]');
    var nextBtn = root.querySelector('[data-qt-cal-next]');
    if (!btn || !pop || !label || !prevBtn || !nextBtn) return null;

    var monthEls = Array.prototype.slice.call(
      pop.querySelectorAll('.qt-cal-month'));
    if (!monthEls.length) return null;

    var months = monthEls.map(function (m) { return m.dataset.ym; });
    months.sort();

    var pageDate = root.dataset.pageDate || '';
    var initialYm = pageDate ? pageDate.slice(0, 7) : '';
    var idx = months.indexOf(initialYm);
    if (idx < 0) idx = months.length - 1;

    function show(i) {
      if (i < 0 || i >= months.length) return;
      idx = i;
      monthEls.forEach(function (m) {
        m.hidden = (m.dataset.ym !== months[i]);
      });
      var parts = months[i].split('-');
      label.textContent = MONTHS[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
      prevBtn.disabled = (i === 0);
      nextBtn.disabled = (i === months.length - 1);
    }

    function open() {
      // Close any other open instance first — only one popover at a time
      // keeps the page from looking like a casino.
      instances.forEach(function (inst) { if (inst.root !== root) inst.close(); });
      pop.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      show(idx);
    }
    function close() {
      pop.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
    function isOpen() { return !pop.classList.contains('hidden'); }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen()) close(); else open();
    });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });

    prevBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      show(idx - 1);
    });
    nextBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      show(idx + 1);
    });

    // Initial label render so the trigger button never looks empty.
    show(idx);

    return { root: root, btn: btn, close: close, isOpen: isOpen };
  }

  Array.prototype.forEach.call(roots, function (root) {
    var inst = bind(root);
    if (inst) instances.push(inst);
  });

  document.addEventListener('click', function (e) {
    instances.forEach(function (inst) {
      if (inst.isOpen() && !inst.root.contains(e.target)) inst.close();
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    instances.forEach(function (inst) {
      if (inst.isOpen()) {
        inst.close();
        inst.btn.focus();
      }
    });
  });
})();

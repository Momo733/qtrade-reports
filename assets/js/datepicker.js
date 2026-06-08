// Calendar popover for the global header date jumper.
// Lazy-show one month at a time. Server pre-renders every month grid (one
// `.qt-cal-month` per YYYY-MM) so the only JS work is to reveal the right
// pane and wire the prev/next buttons + outside-click / Escape to close.
(function () {
  var root = document.getElementById('qt-hdr-cal');
  if (!root) return;

  var btn = document.getElementById('qt-hdr-cal-btn');
  var pop = document.getElementById('qt-hdr-cal-pop');
  var label = document.getElementById('qt-cal-month-label');
  var prevBtn = document.getElementById('qt-cal-prev');
  var nextBtn = document.getElementById('qt-cal-next');
  if (!btn || !pop || !label || !prevBtn || !nextBtn) return;

  var monthEls = Array.prototype.slice.call(pop.querySelectorAll('.qt-cal-month'));
  if (monthEls.length === 0) return;

  var months = monthEls.map(function (m) { return m.dataset.ym; });
  months.sort();
  var byYm = {};
  monthEls.forEach(function (m) { byYm[m.dataset.ym] = m; });

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Default to the current page's month if it has one (daily page), else
  // the most recent month with data.
  var pageDate = root.dataset.pageDate || '';
  var initialYm = pageDate ? pageDate.slice(0, 7) : '';
  var idx = months.indexOf(initialYm);
  if (idx < 0) idx = months.length - 1;

  function show(i) {
    if (i < 0 || i >= months.length) return;
    idx = i;
    monthEls.forEach(function (m) { m.hidden = (m.dataset.ym !== months[i]); });
    var parts = months[i].split('-');
    label.textContent = MONTHS[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
    prevBtn.disabled = (i === 0);
    nextBtn.disabled = (i === months.length - 1);
  }

  function open() {
    pop.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    show(idx);
  }
  function close() {
    pop.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (pop.classList.contains('hidden')) open(); else close();
  });
  pop.addEventListener('click', function (e) { e.stopPropagation(); });

  document.addEventListener('click', function (e) {
    if (!root.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !pop.classList.contains('hidden')) {
      close();
      btn.focus();
    }
  });

  prevBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    show(idx - 1);
  });
  nextBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    show(idx + 1);
  });

  // Initial label render so the button isn't blank if the user never opens
  // it (matters mostly when DevTools snapshots the DOM).
  show(idx);
})();

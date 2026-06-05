// Heatmap colorization. Buckets PnL by magnitude and assigns CSS classes.
// The actual colors are defined in assets/css/tweaks.css and respect dark mode.
(function () {
  // Bucket thresholds (USD).
  var BUCKETS = [
    { max: -800, cls: 'qt-hm-loss-3' },
    { max: -300, cls: 'qt-hm-loss-2' },
    { max:  -1, cls: 'qt-hm-loss-1' },
    { max:    1, cls: 'qt-hm-flat'   },
    { max:  300, cls: 'qt-hm-win-1'  },
    { max:  800, cls: 'qt-hm-win-2'  },
    { max:  Infinity, cls: 'qt-hm-win-3' },
  ];

  function classify(pnl) {
    for (var i = 0; i < BUCKETS.length; i++) {
      if (pnl < BUCKETS[i].max) return BUCKETS[i].cls;
    }
    return 'qt-hm-flat';
  }

  function paint() {
    document.querySelectorAll('.qt-hm-cell[data-pnl]').forEach(function (el) {
      var pnl = parseFloat(el.getAttribute('data-pnl'));
      // Remove previous bucket classes.
      el.classList.remove('qt-hm-loss-3', 'qt-hm-loss-2', 'qt-hm-loss-1',
                           'qt-hm-flat', 'qt-hm-win-1', 'qt-hm-win-2', 'qt-hm-win-3');
      el.classList.add(isNaN(pnl) ? 'qt-hm-flat' : classify(pnl));
    });
  }

  document.addEventListener('DOMContentLoaded', paint);
  window.addEventListener('qt-theme-change', paint);
})();

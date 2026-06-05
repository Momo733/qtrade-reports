// Tiny table sort. Marks <th data-sortable="1"> as clickable.
// Tries numeric sort first, falls back to lexical. Toggles asc/desc per column.
(function () {
  function parseCell(td) {
    var s = (td.textContent || '').trim();
    // Strip thousands separators, leading +/-, %, USD, etc.
    var stripped = s.replace(/[,\s$%]/g, '');
    var n = parseFloat(stripped);
    if (!isNaN(n) && stripped.match(/^-?\+?\d/)) return { num: n, raw: s };
    return { num: NaN, raw: s };
  }

  function sortTable(table, colIdx, dir) {
    var tbody = table.querySelector('tbody') || table;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    rows.sort(function (a, b) {
      var ca = parseCell(a.children[colIdx]);
      var cb = parseCell(b.children[colIdx]);
      var av = isNaN(ca.num) ? ca.raw : ca.num;
      var bv = isNaN(cb.num) ? cb.raw : cb.num;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ?  1 : -1;
      return 0;
    });
    rows.forEach(function (r) { tbody.appendChild(r); });
  }

  function wire(table) {
    var heads = table.querySelectorAll('thead th[data-sortable]');
    heads.forEach(function (th, i) {
      th.addEventListener('click', function () {
        var dir = th.getAttribute('data-sort-dir') === 'asc' ? 'desc' : 'asc';
        // Reset siblings
        heads.forEach(function (s) { s.removeAttribute('data-sort-dir'); });
        th.setAttribute('data-sort-dir', dir);
        sortTable(table, i, dir);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('table.qt-trade-table').forEach(wire);
  });
})();

(function () {
  var btn = document.getElementById('navbtn');
  var panel = document.getElementById('navpanel');
  if (!btn || !panel) return;

  function closeMenu() {
    btn.setAttribute('aria-expanded', 'false');
    panel.classList.remove('open');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    panel.classList.toggle('open', !open);
  });

  document.addEventListener('click', function (e) {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });
})();

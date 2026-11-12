// Comportamiento común: menú lateral, tema claro/oscuro y filtro de herramientas.
(function () {
  const root = document.documentElement;
  const movil = () => window.matchMedia('(max-width: 900px)').matches;

  // ---------- Menú lateral ----------
  const toggle = document.querySelector('.sb-toggle');
  const overlay = document.querySelector('.sb-overlay');
  function syncAria() {
    const abierto = movil() ? root.classList.contains('sb-open') : !root.classList.contains('sb-collapsed');
    if (toggle) toggle.setAttribute('aria-expanded', abierto);
    if (overlay) overlay.hidden = !(movil() && root.classList.contains('sb-open'));
  }
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (movil()) root.classList.toggle('sb-open');
      else root.classList.toggle('sb-collapsed');
      syncAria();
    });
  }
  if (overlay) overlay.addEventListener('click', () => { root.classList.remove('sb-open'); syncAria(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('sb-open')) { root.classList.remove('sb-open'); syncAria(); } });
  window.addEventListener('resize', syncAria);
  syncAria();

  // ---------- Tema ----------
  const tema = document.querySelector('.theme-toggle');
  const esOscuro = () => root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (tema) {
    tema.addEventListener('click', () => {
      const nuevo = esOscuro() ? 'light' : 'dark';
      root.dataset.theme = nuevo;
      try { localStorage.setItem('tema', nuevo); } catch (e) { /* almacenamiento no disponible */ }
    });
  }

  // ---------- Filtro de herramientas por proyecto ----------
  const filter = document.querySelector('.filter');
  if (filter) {
    const area = document.querySelector('.tool-area');
    const status = document.querySelector('.filter-status');
    filter.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      filter.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === btn));
      const project = btn.dataset.project;
      let count = 0;
      area.querySelectorAll('.tool').forEach((t) => {
        const match = project !== 'todas' && t.dataset.projects.split(' ').includes(project);
        t.classList.toggle('match', match);
        if (match) count++;
      });
      area.classList.toggle('filtering', project !== 'todas');
      status.textContent = project === 'todas' ? '' : `${count} herramientas usadas en ${btn.textContent}`;
    });
  }
})();

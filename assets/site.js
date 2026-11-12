// Menú en móvil
const toggle = document.querySelector('.menu-toggle');
if (toggle) {
  toggle.addEventListener('click', () => {
    const open = toggle.closest('.sidebar').classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    toggle.textContent = open ? 'Cerrar' : 'Menú';
  });
}

// Filtro de herramientas por proyecto
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

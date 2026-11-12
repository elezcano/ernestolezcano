// Panel "Sector portuario": todos los importes salen de datos/tarifas-g5.csv a través del motor G5.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const F = $('dashF');
  if (!F) return;
  const base = document.querySelector('link[rel=stylesheet]').href.replace(/assets\/style\.css.*$/, '');
  const hoy = new Date().toISOString().slice(0, 10);
  const eur = (n, d = 2) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
  const pu = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const SITUACIONES = [
    ['punta', 'En punta'], ['costado', 'De costado'], ['fondeo_con_muerto', 'Fondeo a muerto'],
    ['fondeo_sin_muerto', 'Fondeo con medios propios'], ['abarloada', 'Abarloado'],
    ['banqueta', 'A banqueta o escollera'], ['seco', 'En seco'], ['fluvial', 'Muelle fluvial'],
  ];
  const SEMESTRE = 184;
  let rows = null;

  // ---------- utilidades DOM (texto siempre con textContent) ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const tip = $('tip');
  function showTip(target, lines) {
    tip.replaceChildren(...lines.flatMap(([v, l], i) => { const p = el('p', i ? 'tip-row' : 'tip-head'); p.append(el('strong', null, v), document.createTextNode(' ' + l)); return [p, document.createTextNode('\n')]; }));
    tip.hidden = false;
    const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 10;
    if (y < 8) y = r.bottom + 10;
    x = Math.max(8, Math.min(x, window.innerWidth - t.width - 8));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  window.addEventListener('scroll', hideTip, { passive: true });

  function table(head, body) {
    const t = el('table', 'spec-table');
    const tr = el('tr'); head.forEach((h) => tr.append(el('th', null, h), document.createTextNode(' ')));
    const th = el('thead'); th.append(tr); t.append(th);
    const tb = el('tbody');
    body.forEach((r) => { const row = el('tr'); r.forEach((c) => row.append(el('td', null, c), document.createTextNode(' '))); tb.append(row, document.createTextNode('\n')); });
    t.append(tb);
    const w = el('div', 'tbl-wrap'); w.append(t); return w;
  }

  // Barras horizontales: una serie, valor en la punta, tooltip por barra
  function hbars(container, data, fmt) {
    const max = Math.max(...data.map((d) => d.value));
    container.replaceChildren(...data.flatMap((d) => {
      const row = el('div', 'hb' + (d.hl ? ' hl' : ''));
      row.setAttribute('role', 'listitem'); row.tabIndex = 0;
      row.setAttribute('aria-label', `${d.label}: ${fmt(d.value)}`);
      const lab = el('span', 'hb-label', d.label);
      const track = el('span', 'hb-track');
      const bar = el('span', 'hb-bar'); bar.style.width = (d.value / max * 100).toFixed(2) + '%';
      track.append(bar);
      const val = el('span', 'hb-val', fmt(d.value));
      row.append(lab, document.createTextNode(' '), track, document.createTextNode(' '), val);
      const on = () => showTip(bar, d.tip);
      row.addEventListener('pointerenter', on); row.addEventListener('focus', on);
      row.addEventListener('pointerleave', hideTip); row.addEventListener('blur', hideTip);
      return [row, document.createTextNode('\n')];
    }));
  }

  function read() {
    const [e, m] = F.barco.value.split('x').map(Number);
    return { escala: F.escala.value, eslora: e, manga: m, m2: Math.ceil(e * m - 1e-9),
      svc: [...F.querySelectorAll('input[name=svc]:checked')].map((c) => c.value) };
  }
  const v = (clave, escala) => { const r = G5.lookup(rows, clave, escala, hoy); return r ? r.valor : null; };

  function render() {
    if (!rows) return;
    const s = read();
    const A = v('aguas', s.escala);
    const C = s.svc.reduce((acc, k) => acc + (v(k, s.escala) || 0), 0);
    const svcTxt = s.svc.length ? s.svc.map((k) => ({ agua: 'agua', electricidad: 'luz', basura: 'basura', vigilancia: 'vigilancia' })[k]).join(', ') : 'sin servicios';

    // KPIs
    const punta = v('punta', s.escala);
    const dia = (A + punta + C) * s.m2;
    $('kDia').textContent = eur(dia) + ' /día';
    $('kDiaSub').textContent = `${String(s.eslora).replace('.', ',')} × ${String(s.manga).replace('.', ',')} m · ${s.m2} m² · ${svcTxt}`;
    $('kSem').textContent = eur(dia * SEMESTRE, 0);
    const conc = A * s.m2 * SEMESTRE * (1 - v('bonif_concesion_base', 'todas'));
    $('kCon').textContent = eur(conc, 0);

    // Gráfico 1: coste diario por situación de atraque
    const d1 = SITUACIONES.map(([k, n]) => {
      const b = v(k, s.escala);
      if (b == null) return null;
      const tot = (A + b + C) * s.m2;
      return { label: n, value: tot, hl: k === 'punta', tip: [[eur(tot) + ' al día', n], [eur(A * s.m2), 'tramo A, aguas'], [eur(b * s.m2), 'tramo B, atraque'], [eur(C * s.m2), 'tramo C, servicios']] };
    }).filter(Boolean).sort((a, b) => b.value - a.value);
    hbars($('c1'), d1, (n) => eur(n));
    $('c1s').textContent = `Barco de ${s.m2} m², gestión directa, ${svcTxt}. En punta, resaltado.`;
    $('c1tab').replaceChildren(table(['Situación', '€ al día', '€ por semestre'], d1.map((d) => [d.label, eur(d.value), eur(d.value * SEMESTRE)])));

    // Gráfico 2: barra segmentada A / B / C
    const parts = [['A', 'Aguas (tramo A)', A, 's1'], ['B', 'Atraque en punta (tramo B)', punta, 's2'], ['C', 'Servicios (tramo C)', C, 's3']].filter((p) => p[2] > 0);
    const tot = parts.reduce((a, p) => a + p[2], 0);
    const seg = $('c2');
    seg.setAttribute('aria-label', parts.map((p) => `${p[1]}: ${Math.round(p[2] / tot * 100)} %`).join('; '));
    seg.replaceChildren(...parts.map((p) => {
      const pct = p[2] / tot * 100;
      const b = el('span', 'sgm ' + p[3]); b.style.flexGrow = (p[2] / tot * 1000).toFixed(0); b.style.flexBasis = "0";
      b.tabIndex = 0;
      if (pct >= 12) b.textContent = Math.round(pct) + ' %';
      const on = () => showTip(b, [[Math.round(pct) + ' %', p[1]], [pu(p[2]), '€ por m² y día']]);
      b.addEventListener('pointerenter', on); b.addEventListener('focus', on);
      b.addEventListener('pointerleave', hideTip); b.addEventListener('blur', hideTip);
      return b;
    }));
    $('c2leg').replaceChildren(...parts.flatMap((p) => { const li = el('li'); li.append(el('span', 'sw ' + p[3]), document.createTextNode(' ' + p[1])); return [li, document.createTextNode('\n')]; }));
    $('c2note').textContent = `${pu(tot)} € por m² y día. El atraque pesa más que el uso de las aguas.`;

    // Gráfico 3: semestre según quién gestiona
    const red = v('aguas_reducida', 'todas');
    const dom = v('bonif_domiciliacion', 'todas');
    const bc = v('bonif_concesion_base', 'todas');
    const d3 = [
      { label: 'Gestión directa', value: dia * SEMESTRE, hl: true, tip: [[eur(dia * SEMESTRE), 'Gestión directa'], ['A + B + C', 'paga el titular']] },
      { label: 'Gestión directa, domiciliada', value: dia * SEMESTRE * (1 - dom), tip: [[eur(dia * SEMESTRE * (1 - dom)), 'Domiciliada'], [`−${Math.round(dom * 100)} %`, 'art. 37']] },
      { label: 'Zona en concesión', value: conc, tip: [[eur(conc), 'Zona en concesión'], ['Solo tramo A, −20 %', 'paga el concesionario']] },
      { label: 'Construido por el concesionario', value: red * s.m2 * SEMESTRE * (1 - bc), tip: [[eur(red * s.m2 * SEMESTRE * (1 - bc)), 'Puerto del concesionario'], ['Tramo A reducido, −20 %', 'art. 34.Tres']] },
    ];
    hbars($('c3'), d3, (n) => eur(n, 0));
    $('c3s').textContent = `Barco de ${s.m2} m², ${SEMESTRE} días, amarre en punta.`;
    $('c3tab').replaceChildren(table(['Instalación', '€ por semestre'], d3.map((d) => [d.label, eur(d.value)])));
  }

  // ---------- Explorador de tarifas ----------
  const TAR = JSON.parse($('tarData').textContent);
  const cards = [...document.querySelectorAll('.tx-card')];
  const procs = [...document.querySelectorAll('.px')];
  function selectTarifa(code) {
    cards.forEach((c) => c.setAttribute('aria-pressed', c.dataset.code === code));
    const t = TAR[code];
    procs.forEach((p) => p.classList.toggle('on', !!t && t.procesos.includes(p.dataset.proc)));
    const d = $('txd');
    if (!t) { d.replaceChildren(el('p', 'tx-empty', 'Elige una tarifa.')); return; }
    const head = el('p', 'tx-d-code ' + t.tipo, t.code);
    const name = el('h3', null, t.name);
    const meta = el('p', 'tx-d-meta', `${t.tipo === 'general' ? 'General: se devenga al realizar la actividad' : 'Específica: se devenga al solicitar el servicio'} · ${t.cap} de la Ley 1/1999`);
    const grava = el('p', 'tx-d-text', t.grava);
    const kids = [head, name, meta, grava];
    if (t.link) { const a = el('a', 'btn btn-primary', 'Abrir la calculadora'); a.href = base + t.link; kids.push(a); }
    d.replaceChildren(...kids.flatMap((k) => [k, document.createTextNode('\n')]));
  }
  cards.forEach((c) => c.addEventListener('click', () => selectTarifa(c.dataset.code)));
  document.querySelectorAll('.tx-tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tx-tabs button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    cards.forEach((c) => { c.parentElement.hidden = b.dataset.f !== 'todas' && !c.classList.contains(b.dataset.f); });
  }));
  selectTarifa('G-5');

  // ---------- Vocabulario con búsqueda ----------
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  $('gq').addEventListener('input', (e) => {
    const q = norm(e.target.value.trim());
    let n = 0;
    $('gl').querySelectorAll('div').forEach((d) => { const ok = !q || norm(d.textContent).includes(q); d.hidden = !ok; if (ok) n++; });
    $('glEmpty').hidden = n > 0;
  });

  F.addEventListener('input', render);
  F.addEventListener('change', render);
  fetch(base + 'datos/tarifas-g5.csv').then((r) => { if (!r.ok) throw new Error(); return r.text(); })
    .then((t) => { rows = G5.parseCSV(t); render(); })
    .catch(() => { $('c1').textContent = 'No se han podido cargar los precios.'; });
})();

// Interfaz de la calculadora de escala portuaria. Los valores se leen de datos/tasas-escala-algeciras.csv.
(function () {
  const form = document.getElementById('escala');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const F = form.elements;
  const base = document.querySelector('link[rel=stylesheet]').href.replace(/assets\/style\.css.*$/, '');
  const eur = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €';
  const num = (v) => { const s = String(v || '').trim().replace(/\s/g, ''); if (!s) return 0; return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}(\D|$))/g, '')); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let rows = null;

  const VACIO = { paxCrucero: 'inicio', pax: '', schengen: false, moto: '', turismo5: '', turismoMas5: '', autocar: '', concPasaje: 'no', lineasPasaje: '0',
    p1e: 'u15', p1n: '', p1o: 'ES', p2e: 'u10', p2n: '', p2o: 'TBa', p3e: 'u15', p3n: '', p3o: 'TR', terminal: 'NC', tmcdMercancia: false,
    nPracticaje: 2, cuadroPracticaje: 't0', nRemolque: 0, remolque: '6_gen', nAmarre: 2, amarre: 'general', pasajeBuque: false, personas: '', desechosZonaII: false,
    zona: 'I', atraque: 'atr_nc_costado', crucero: 'crucero_general', combAlt: false, a201: false, nEscala: 1, escalasPrevias: 0 };
  const PRESETS = {
    contenedores: { gt: 100000, horas: 20, atraque: 'atr_csa_costado', tipo: 'general', tmcd: false, regular: false, escalasPrevias: 0,
      p1e: 'u15', p1n: 800, p1o: 'ES', p2e: 'u10', p2n: 400, p2o: 'TBa', terminal: 'CA', nRemolque: 2 },
    ferri: { gt: 30000, horas: 3, tipo: 'rodada', tmcd: true, regular: true, escalasPrevias: 5, pax: 1000, turismo5: 200, lineasPasaje: '1',
      p1e: 'u15', p1n: 60, p1o: 'ES', tmcdMercancia: true, amarre: 'ferri', pasajeBuque: true, personas: 650 },
    ferri201: { gt: 30000, horas: 3, tipo: 'rodada', tmcd: true, regular: true, escalasPrevias: 5, pax: 1000, turismo5: 200, lineasPasaje: '1',
      p1e: 'u15', p1n: 60, p1o: 'ES', tmcdMercancia: true, amarre: 'ferri', pasajeBuque: true, personas: 650, a201: true, nEscala: 400 },
    crucero: { gt: 90000, horas: 10, tipo: 'crucero', tmcd: false, regular: false, crucero: 'crucero_base', escalasPrevias: 1, pax: 2400, paxCrucero: 'inicio',
      lineasPasaje: '0', nRemolque: 2, pasajeBuque: true, personas: 3300 },
  };
  function set(name, val) {
    const f = F[name]; if (!f) return;
    if (f.type === 'checkbox') f.checked = !!val;
    else if (f instanceof RadioNodeList) f.value = String(val);
    else f.value = val;
  }
  function applyPreset(k) {
    const p = { ...VACIO, ...PRESETS[k] };
    Object.entries(p).forEach(([n, v]) => set(n, v));
    document.querySelectorAll('.presets button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.p === k));
    render();
  }
  document.querySelectorAll('.presets button').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.p)));

  function ui() {
    const tipo = F.tipo.value, zona = F.zona.value;
    form.querySelectorAll('[data-tipo]').forEach((e) => { e.hidden = !e.dataset.tipo.split(' ').includes(tipo); });
    $('atrWrap').hidden = zona === 'F';
    $('nEscWrap').hidden = !F.a201.checked;
    $('persWrap').hidden = !F.pasajeBuque.checked;
    $('horasHint').textContent = zona === 'F' ? 'En fondeo se cuentan días completos.' : 'Mínimo 3 h; máximo 15 h por cada 24 h.';
  }

  function read() {
    const partidas = [1, 2, 3].map((i) => ({ elemento: F[`p${i}e`].value, unidades: num(F[`p${i}n`].value), operacion: F[`p${i}o`].value }));
    return {
      gt: num(F.gt.value), horas: num(F.horas.value), zona: F.zona.value, atraque: F.atraque.value, tipo: F.tipo.value,
      tmcd: F.tmcd.checked, regular: F.regular.checked, crucero: F.crucero.value, combAlt: F.combAlt.checked,
      a201: F.a201.checked, nEscala: num(F.nEscala.value), escalasPrevias: num(F.escalasPrevias.value),
      pax: num(F.pax.value), paxCrucero: F.paxCrucero.value, schengen: F.schengen.checked, moto: num(F.moto.value), turismo5: num(F.turismo5.value),
      turismoMas5: num(F.turismoMas5.value), autocar: num(F.autocar.value), concPasaje: F.concPasaje.value, lineasPasaje: F.lineasPasaje.value,
      partidas, terminal: F.terminal.value, tmcdMercancia: F.tmcdMercancia.checked,
      nPracticaje: num(F.nPracticaje.value), cuadroPracticaje: F.cuadroPracticaje.value, nRemolque: num(F.nRemolque.value), remolque: F.remolque.value,
      nAmarre: num(F.nAmarre.value), amarre: F.amarre.value, pasajeBuque: F.pasajeBuque.checked, personas: num(F.personas.value), desechosZonaII: F.desechosZonaII.checked,
    };
  }

  let ultimo = null;
  function render() {
    ui();
    if (!rows) return;
    const r = ESCALA.calcular(read(), rows);
    ultimo = r;
    if (r.errores.length) {
      $('total').textContent = '—'; $('meta').textContent = ''; $('reparto').hidden = true; $('detalle').replaceChildren(); $('notas').replaceChildren();
      $('errores').replaceChildren(...r.errores.map((e) => el('p', 'res-error', e)));
      return;
    }
    $('errores').replaceChildren();
    $('total').textContent = eur(r.total);
    $('meta').textContent = `${eur(r.totalAP)} de tasas y ${eur(r.totalSV)} de servicios`;

    // Reparto autoridad portuaria / prestadores
    const parts = [['Tasas de la autoridad portuaria', r.totalAP, 's1'], ['Servicios de los prestadores', r.totalSV, 's2']].filter((p) => p[1] > 0);
    const tot = parts.reduce((a, p) => a + p[1], 0);
    const bar = $('repBar');
    bar.setAttribute('aria-label', parts.map((p) => `${p[0]}: ${Math.round(p[1] / tot * 100)} %`).join('; '));
    bar.replaceChildren(...parts.map((p) => {
      const pct = p[1] / tot * 100;
      const s = el('span', 'sgm ' + p[2]); s.style.flexGrow = Math.round(pct * 10); s.style.flexBasis = '0';
      if (pct >= 14) s.textContent = Math.round(pct) + ' %';
      s.title = `${p[0]}: ${eur(p[1])}`;
      return s;
    }));
    $('repLeg').replaceChildren(...parts.flatMap((p) => { const li = el('li'); li.append(el('span', 'sw ' + p[2]), document.createTextNode(' ' + p[0])); return [li, document.createTextNode('\n')]; }));
    $('reparto').hidden = !tot;

    const t = el('table', 'res-table'); const tb = el('tbody'); t.append(tb);
    const fila = (a, f, b, cls) => {
      const tr = el('tr', cls || ''); const td = el('td');
      td.append(el('span', null, a)); if (f) td.append(el('small', 'res-f', f));
      tr.append(td, document.createTextNode(' '), el('td', null, b)); tb.append(tr, document.createTextNode('\n'));
    };
    const grupo = (txt) => { const tr = el('tr', 'grp'); const td = el('td', null, txt); td.colSpan = 2; tr.append(td); tb.append(tr, document.createTextNode('\n')); };
    grupo('Autoridad portuaria');
    r.ap.forEach((x) => fila(x.concepto, x.formula, eur(x.importe)));
    fila('Subtotal tasas', '', eur(r.totalAP), 'sub');
    if (r.sv.length) {
      grupo('Prestadores (tarifas máximas)');
      r.sv.forEach((x) => fila(x.concepto, x.formula, eur(x.importe)));
      fila('Subtotal servicios', '', eur(r.totalSV), 'sub');
    }
    fila('Total orientativo', '', eur(r.total), 'tot');
    $('detalle').replaceChildren(t);

    const notas = [...r.notas, 'Sin las bonificaciones del art. 245.3 (Anexo XII de la Ley 31/2022) ni la manipulación de mercancías, que es un precio privado de la terminal.'];
    const ul = el('ul', 'res-notes'); notas.forEach((n) => ul.append(el('li', null, n), document.createTextNode('\n')));
    $('notas').replaceChildren(ul);
  }

  $('copiar').addEventListener('click', () => {
    if (!ultimo || ultimo.errores.length) return;
    const r = ultimo;
    const txt = [
      'Autoridad portuaria', ...r.ap.map((x) => `  ${x.concepto}: ${eur(x.importe)}  [${x.formula}]`), `  Subtotal: ${eur(r.totalAP)}`,
      ...(r.sv.length ? ['Prestadores (tarifas máximas)', ...r.sv.map((x) => `  ${x.concepto}: ${eur(x.importe)}  [${x.formula}]`), `  Subtotal: ${eur(r.totalSV)}`] : []),
      `Total orientativo: ${eur(r.total)}`,
    ].join('\n');
    const btn = $('copiar');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => { btn.textContent = 'Desglose copiado'; setTimeout(() => { btn.textContent = 'Copiar desglose'; }, 1600); }).catch(() => {});
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  ui();
  fetch(base + 'datos/tasas-escala-algeciras.csv').then((res) => { if (!res.ok) throw new Error(); return res.text(); })
    .then((t) => { rows = ESCALA.parseCSV(t); applyPreset('ferri'); })
    .catch(() => { $('errores').replaceChildren(el('p', 'res-error', 'No se han podido cargar las tarifas. Recarga la página.')); });
})();

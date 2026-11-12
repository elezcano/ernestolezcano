// Interfaz de la calculadora de tasas del dominio público portuario. Los tipos se leen de datos/tasas-dominio-publico.csv.
(function () {
  const form = document.getElementById('dp');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const F = form.elements;
  const base = document.querySelector('link[rel=stylesheet]').href.replace(/assets\/style\.css.*$/, '');
  const eur = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €';
  const n4 = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: 'always' });
  const num = (v) => { const s = String(v || '').trim().replace(/\s/g, ''); if (!s) return NaN; return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); };
  const fecha = (s) => s.split('-').reverse().join('/');
  let rows = null;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  const PRESETS = {
    quiosco: { tipo: 'general', naturaleza: 'urbanizado', m2: 100, actividad: 'b', cerramiento: false },
    cerrado: { tipo: 'general', naturaleza: 'urbanizado', m2: 100, actividad: 'b', cerramiento: true },
    kiosco: { tipo: 'general', naturaleza: 'edificio', m2: 100, actividad: 'b' },
    s250: { tipo: 'general', naturaleza: 'edificio', m2: 250, actividad: 'b' },
    nave: { tipo: 'general', naturaleza: 'tinglado', m2: 1000, actividad: 'a' },
    gasolinera: { tipo: 'general', naturaleza: 'urbanizado', m2: 50, actividad: 'combustible', ingresos: 1000000 },
    conduccion: { tipo: 'general', naturaleza: 'urbanizado', m2: 500, actividad: 'ninguna', subsuelo: true },
    lonja: { tipo: 'pesca', ventas: 2000000 },
    marina: { tipo: 'nautica', valorTerrenos: 2000000, valorObras: 3000000, gestion: 'directa' },
  };
  function applyPreset(k) {
    const p = PRESETS[k];
    form.reset();
    F.tipo.value = p.tipo;
    if (p.naturaleza) F.naturaleza.value = p.naturaleza;
    if (p.m2) F.m2.value = p.m2;
    F.actividad.value = p.actividad || 'ninguna';
    F.cerramiento.checked = !!p.cerramiento; F.subsuelo.checked = !!p.subsuelo;
    F.sActividad.value = ''; F.ingresos.value = p.ingresos || '';
    F.ventas.value = p.ventas || ''; F.valorTerrenos.value = p.valorTerrenos || ''; F.valorObras.value = p.valorObras || '';
    if (p.gestion) F.gestion.value = p.gestion;
    render();
  }
  document.querySelectorAll('.presets button').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.p)));

  function ui() {
    const tipo = F.tipo.value, act = F.actividad.value, nat = F.naturaleza.value;
    form.querySelectorAll('[data-tipo]').forEach((e) => { e.hidden = !e.dataset.tipo.split(' ').includes(tipo); });
    form.querySelectorAll('[data-act]').forEach((e) => { e.hidden = !e.dataset.act.split(' ').includes(act); });
    $('cerrWrap').hidden = !(act === 'b' && (nat === 'relleno' || nat === 'urbanizado'));
    $('sHelp').textContent = F.m2.value ? `Por defecto, los ${F.m2.value} m² ocupados.` : '';
  }

  function read() {
    return {
      tipo: F.tipo.value, naturaleza: F.naturaleza.value, m2: num(F.m2.value), subsuelo: F.subsuelo.checked,
      actividad: F.actividad.value, cerramiento: F.cerramiento.checked, sActividad: num(F.sActividad.value), ingresos: num(F.ingresos.value),
      ventas: num(F.ventas.value), valorTerrenos: num(F.valorTerrenos.value) || 0, valorObras: num(F.valorObras.value) || 0, gestion: F.gestion.value,
      ayuntamiento: F.ayuntamiento.checked, planEstrategico: F.planEstrategico.checked, exencion: F.exencion.value, sinTitulo: F.sinTitulo.checked,
      desde: F.desde.value || null, hasta: F.hasta.value || null,
      ciManual: num(F.ciManual.value), factorManual: num(F.factorManual.value), umbralManual: num(F.umbralManual.value),
      ipcManual: num(F.ipcManual.value), aplicarReduccion: F.aplicarReduccion.checked,
    };
  }

  let ultimo = null;
  function render() {
    ui();
    if (!rows) return;
    const input = read();
    const r = DP.calcular(input, rows);
    ultimo = { input, r };
    const err = $('errores'), det = $('detalle');
    if (r.errores.length) {
      $('total').textContent = '—'; $('meta').textContent = ''; $('chain').replaceChildren(); det.replaceChildren(); $('notas').replaceChildren();
      err.replaceChildren(...r.errores.map((e) => el('p', 'res-error', e))); return;
    }
    err.replaceChildren();
    $('total').textContent = eur(r.anual);
    $('meta').textContent = r.periodo
      ? `Periodo ${fecha(r.periodo.desde)} – ${fecha(r.periodo.hasta)}: ${r.periodo.dias} días → ${eur(r.periodo.importe)}`
      : `${eur(r.semestre)} por semestre`;

    // Cadena de la fórmula de la actividad (como en la herramienta original)
    const ch = $('chain'); ch.replaceChildren();
    if (r.actividadDet) {
      const a = r.actividadDet;
      const chip = (k, v, cls) => { const c = el('span', 'chip-f ' + cls); c.append(el('span', null, k + ' '), el('b', null, v)); return c; };
      const op = (t) => el('span', 'op', t);
      ch.append(el('span', 'chain-label', 'Actividad'), document.createTextNode(' '),
        chip('Factor', n4(a.factor).replace(/,?0+$/, ''), 'k'), op(' × '), chip('Ci', n4(a.ci), 'ci'), op(' × '),
        chip('F', n4(a.F), 'f'), op(' × '), chip('S', a.S.toLocaleString('es-ES'), 's'), op(' = '), chip('', eur(r2(a.pu * a.S)), 'tot'));
    }

    const t = el('table', 'res-table'); const tb = el('tbody'); t.append(tb);
    const row = (a, b, cls) => { const tr = el('tr', cls || ''); tr.append(el('td', null, a), document.createTextNode(' '), el('td', null, b)); tb.append(tr, document.createTextNode('\n')); };
    r.lineas.forEach((l) => row(`${l.grupo}: ${l.concepto}`, eur(l.importe)));
    r.ajustes.forEach((a) => row(a.concepto, (a.importe < 0 ? '−' : '+') + eur(Math.abs(a.importe)), a.importe < 0 ? 'bonificacion' : 'recargo'));
    row('Importe anual', eur(r.anual), 'tot');
    if (r.periodo) row(`Prorrata ${r.periodo.dias} días / 365`, eur(r.periodo.importe), 'tot');
    det.replaceChildren(t);

    const notas = [...r.notas];
    if (r.ci != null && r.ipc === 1 && !(input.ciManual > 0)) notas.push('Importes legales sin actualizar por IPC (art. 84): no se ha localizado publicación oficial con importes actualizados.');
    $('notas').replaceChildren(...(notas.length ? [(() => { const ul = el('ul', 'res-notes'); notas.forEach((n) => ul.append(el('li', null, n), document.createTextNode('\n'))); return ul; })()] : []));
  }
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  $('copiar').addEventListener('click', () => {
    if (!ultimo || ultimo.r.errores.length) return;
    const { r } = ultimo;
    const lineas = [...r.lineas.map((l) => `${l.grupo}: ${l.concepto} = ${eur(l.importe)}`), ...r.ajustes.map((a) => `${a.concepto}: ${eur(a.importe)}`), `Importe anual: ${eur(r.anual)}`];
    if (r.periodo) lineas.push(`Periodo ${fecha(r.periodo.desde)} – ${fecha(r.periodo.hasta)} (${r.periodo.dias} días): ${eur(r.periodo.importe)}`);
    const txt = lineas.join('\n');
    const btn = $('copiar');
    const ok = () => { btn.textContent = 'Desglose copiado'; setTimeout(() => { btn.textContent = 'Copiar desglose'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok).catch(() => {});
  });

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  ui();
  fetch(base + 'datos/tasas-dominio-publico.csv').then((res) => { if (!res.ok) throw new Error(); return res.text(); })
    .then((t) => { rows = DP.parseCSV(t); applyPreset('quiosco'); })
    .catch(() => { $('errores').replaceChildren(el('p', 'res-error', 'No se han podido cargar los tipos. Recarga la página.')); });
})();

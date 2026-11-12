// Interfaz de la calculadora G-5. Los precios se leen de datos/tarifas-g5.csv.
(function () {
  const form = document.getElementById('g5');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const F = form.elements;
  const eur = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const pu = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  const fecha = (s) => s.split('-').reverse().join('/');
  const base = document.querySelector('link[rel=stylesheet]').href.replace(/assets\/style\.css.*$/, '');
  let rows = null;

  const TIPO_HINT = {
    directa: 'La administración portuaria gestiona el amarre: paga el titular del barco, con los tramos A, B y C.',
    concesion: 'Club náutico, marina o varadero en concesión: solo tramo A, que paga el concesionario como sustituto, con bonificación en base y en tránsito (art. 34).',
    reducida: 'Zona en concesión de un puerto construido íntegramente por el concesionario actual: solo tramo A, a precio reducido (art. 34.Tres), con las mismas bonificaciones.',
    concesion_total: 'Puerto deportivo en concesión total: la administración no presta allí los servicios de la tarifa.',
  };

  // Valores iniciales: tránsito de tres noches desde hoy
  const hoy = new Date(); const iso = (d) => d.toISOString().slice(0, 10);
  const mas = (n) => { const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n)); return iso(d); };
  F.entrada.value = mas(0) + 'T10:00'; F.salida.value = mas(3) + 'T11:00'; F.anio.value = hoy.getFullYear();

  const PRESETS = {
    gdt: { tipo: 'directa', escala: 'general', eslora: 8, manga: 3, lista: '7', estancia: 'transito', entrada: '2026-11-10T10:00', salida: '2026-11-13T11:00', atraque: 'punta', servicios: ['agua', 'electricidad'], domiciliado: false, sinAutorizacion: false },
    gdb: { tipo: 'directa', escala: 'general', eslora: 8, manga: 3, lista: '7', estancia: 'base', anio: 2026, semestre: '2', alta: '', atraque: 'punta', servicios: ['agua', 'electricidad'], domiciliado: true, sinAutorizacion: false },
    cn: { tipo: 'concesion', escala: 'general', eslora: 8, manga: 3, lista: '7', estancia: 'base', anio: 2026, semestre: '2', alta: '', atraque: 'punta', servicios: [], domiciliado: false, sinAutorizacion: false },
    mo: { tipo: 'reducida', escala: 'general', eslora: 8, manga: 3, lista: '7', estancia: 'transito', entrada: '2026-08-10T10:00', salida: '2026-08-13T11:00', atraque: 'punta', servicios: [], domiciliado: false, sinAutorizacion: false },
  };
  function applyPreset(k) {
    const p = PRESETS[k];
    F.tipo.value = p.tipo; F.estancia.value = p.estancia; F.escala.value = p.escala;
    F.eslora.value = p.eslora; F.manga.value = p.manga; F.lista.value = p.lista; F.atraque.value = p.atraque;
    if (p.entrada) { F.entrada.value = p.entrada; F.salida.value = p.salida; }
    if (p.anio) { F.anio.value = p.anio; F.semestre.value = p.semestre; F.alta.value = p.alta; }
    form.querySelectorAll('input[name=servicios]').forEach((c) => { c.checked = p.servicios.includes(c.value); });
    F.domiciliado.checked = p.domiciliado; F.sinAutorizacion.checked = p.sinAutorizacion;
    render();
  }
  document.querySelectorAll('.presets button').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.p)));

  function setDisabled(el, off) {
    el.classList.toggle('dis', off);
    el.querySelectorAll('input,select').forEach((i) => { i.disabled = off; });
  }

  function ui() {
    const tipo = F.tipo.value, est = F.estancia.value;
    form.querySelectorAll('[data-tipo]').forEach((el) => setDisabled(el, el.dataset.tipo !== tipo));
    form.querySelectorAll('[data-tipo-not]').forEach((el) => { el.hidden = tipo === el.dataset.tipoNot || tipo === 'concesion_total'; });
    form.querySelectorAll('[data-estancia]').forEach((el) => { el.hidden = el.dataset.estancia !== est; });
    setDisabled($('domWrap'), !(tipo === 'directa' && est === 'base'));
    setDisabled($('noautWrap'), est !== 'transito' || tipo === 'concesion_total');
    $('tipoHint').textContent = TIPO_HINT[tipo];
    const e = parseFloat(F.eslora.value), m = parseFloat(F.manga.value);
    $('m2Hint').textContent = e > 0 && m > 0
      ? `${String(e).replace('.', ',')} × ${String(m).replace('.', ',')} = ${(e * m).toLocaleString('es-ES', { maximumFractionDigits: 4 })} m², redondeado al alza: ${Math.ceil(e * m - 1e-9)} m².`
      : 'Indica la eslora y la manga.';
  }

  function read() {
    return {
      tipo: F.tipo.value, escala: F.escala.value, eslora: parseFloat(F.eslora.value), manga: parseFloat(F.manga.value),
      lista6: F.lista.value === '6', estancia: F.estancia.value, entrada: F.entrada.value, salida: F.salida.value,
      anio: F.anio.value, semestre: Number(F.semestre.value), alta: F.alta.value || null, atraque: F.atraque.value,
      servicios: [...form.querySelectorAll('input[name=servicios]:checked')].map((c) => c.value),
      domiciliado: F.domiciliado.checked && !F.domiciliado.disabled,
      sinAutorizacion: F.sinAutorizacion.checked && !F.sinAutorizacion.disabled,
    };
  }

  function render() {
    ui();
    if (!rows) return;
    const r = G5.calcular(read(), rows);
    $('tHint').textContent = r.info || '';
    if (r.excluido) {
      $('total').textContent = '—'; $('meta').textContent = 'Fuera del cálculo';
      $('detalle').innerHTML = '<p class="res-box">En un puerto deportivo en concesión total, los servicios los presta el concesionario y la relación económica se rige por la concesión. Esta calculadora no estima la G-5 en ese caso.</p>';
      $('notas').innerHTML = ''; return;
    }
    if (r.error) {
      $('total').textContent = '—'; $('meta').textContent = '';
      $('detalle').innerHTML = `<p class="res-error">${r.error}</p>`; $('notas').innerHTML = ''; return;
    }
    $('total').textContent = eur(r.total);
    $('meta').textContent = `${r.m2} m² · ${r.dias} ${r.dias === 1 ? 'día' : 'días'} · ${r.pagador}`;
    const varias = r.liquidaciones.length > 1;
    $('detalle').innerHTML = r.liquidaciones.map((l, i) => {
      const pendiente = l.lineas.some((x) => /pendiente/i.test(x.fuente));
      let h = `<div class="liq"><p class="liq-head">${varias ? `Liquidación ${i + 1} · ` : ''}${fecha(l.desde)} – ${fecha(l.hasta)} <span class="liq-tag${pendiente ? ' warn' : ''}">${pendiente ? 'Precios anteriores' : 'Ley 5/2025'}</span></p><table class="res-table"><tbody>`;
      for (const x of l.lineas) h += `\n<tr><td><span class="tr">${x.tramo}</span> ${x.concepto}</td><td>${pu(x.valor)}</td></tr>`;
      h += `\n<tr class="sub"><td>Precio por m² y día</td><td>${pu(l.precioDia)}</td></tr>`;
      for (const p of l.pasos) h += `\n<tr class="${p.tipo || 'sub'}"><td>${p.concepto}</td><td>${p.tipo === 'bonificacion' ? '−' : p.tipo === 'recargo' ? '+' : ''}${eur(Math.abs(p.importe))}</td></tr>`;
      h += `\n<tr class="tot"><td>Importe</td><td>${eur(l.importe)}</td></tr></tbody></table></div>`;
      return h;
    }).join('\n');
    $('notas').innerHTML = r.notas.length ? '<ul class="res-notes">' + r.notas.map((n) => `<li>${n}</li>`).join('\n') + '</ul>' : '';
  }

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', (e) => e.preventDefault());
  ui();
  fetch(base + 'datos/tarifas-g5.csv')
    .then((res) => { if (!res.ok) throw new Error(); return res.text(); })
    .then((t) => { rows = G5.parseCSV(t); render(); })
    .catch(() => { $('detalle').innerHTML = '<p class="res-error">No se han podido cargar los precios. Recarga la página.</p>'; });
})();

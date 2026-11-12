// Interfaz de la calculadora G-5
(function () {
  const form = document.getElementById('g5');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const eur = (n) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const num = (n, d = 6) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: d });
  const csvUrl = new URL('datos/tarifas-g5.csv', document.querySelector('link[rel=stylesheet]').href.replace(/assets\/style\.css.*$/, ''));

  // Fechas por defecto: una estancia de 3 días a partir de mañana
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const plus = (n) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  form.entrada.value = plus(1); form.salida.value = plus(4);
  form.anio.value = today.getUTCFullYear();

  let rows = null;

  function toggle() {
    const inst = form.instalacion.value, est = form.estancia.value;
    form.querySelectorAll('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== inst; });
    form.querySelectorAll('[data-only-estancia]').forEach((el) => { el.hidden = el.dataset.onlyEstancia !== est; });
    const fluvial = form.atraque.querySelector('option[value=fluvial]');
    fluvial.disabled = form.escala.value === 'deportivo';
    if (fluvial.disabled && form.atraque.value === 'fluvial') form.atraque.value = 'punta';
  }

  function read() {
    return {
      eslora: parseFloat(form.eslora.value), manga: parseFloat(form.manga.value),
      lista6: form.lista6.checked, instalacion: form.instalacion.value, escala: form.escala.value,
      estancia: form.estancia.value, entrada: form.entrada.value, salida: form.salida.value,
      salidaTarde: form.salidaTarde.checked, anio: form.anio.value, semestre: Number(form.semestre.value),
      alta: form.alta.value || null, domiciliado: form.domiciliado.checked && form.instalacion.value === 'directa',
      atraque: form.atraque.value,
      servicios: [...form.querySelectorAll('input[name=servicios]:checked')].map((c) => c.value),
    };
  }

  function render() {
    toggle();
    if (!rows) return;
    const input = read();
    $('error').hidden = true;
    try {
      if (!(input.eslora > 0) || !(input.manga > 0)) throw new Error('Indica la eslora y la manga.');
      if (input.estancia === 'transito' && (!input.entrada || !input.salida)) throw new Error('Indica las fechas de entrada y salida.');
      const r = G5.calcular(input, rows);
      $('total').textContent = eur(r.total);
      $('meta').textContent = `${r.m2} m² × ${r.dias} ${r.dias === 1 ? 'día' : 'días'}`;
      let html = '';
      for (const t of r.tramos) {
        if (r.tramos.length > 1) html += `<p class="res-period">Del ${t.desde} al ${t.hasta} (${t.dias} días)</p>`;
        html += '<table class="res-table"><tbody>';
        for (const l of t.lineas) html += `<tr><td><span class="tr">${l.tramo}</span>${l.concepto}</td><td>${num(l.valor, 8)}</td></tr>`;
        html += `<tr class="sub"><td>Precio por m² y día</td><td>${num(t.precioDia, 8)}</td></tr>`;
        html += `<tr class="sub"><td>× ${r.m2} m² × ${t.dias} días</td><td>${eur(t.importe)}</td></tr>`;
        html += '</tbody></table>';
      }
      if (r.ajustes.length) {
        html += '<table class="res-table"><tbody>';
        for (const a of r.ajustes) html += `<tr><td>${a.concepto}</td><td>${a.importe >= 0 ? '+' : '−'}${eur(Math.abs(a.importe))}</td></tr>`;
        html += '</tbody></table>';
      }
      html += r.avisos.map((a) => `<p class="res-note">${a}</p>`).join('');
      html += '<p class="res-note">Sin IVA. Importe orientativo.</p>';
      $('detalle').innerHTML = html;
    } catch (e) {
      $('total').textContent = '—'; $('meta').textContent = ''; $('detalle').innerHTML = '';
      $('error').textContent = e.message; $('error').hidden = false;
    }
  }

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  toggle();
  fetch(csvUrl).then((r) => { if (!r.ok) throw new Error(); return r.text(); })
    .then((t) => { rows = G5.parseCSV(t); render(); })
    .catch(() => { $('error').textContent = 'No se han podido cargar los precios. Recarga la página.'; $('error').hidden = false; });
})();

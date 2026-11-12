// Motor de cálculo de la tarifa G-5 (Ley 1/1999 de Tarifas Portuarias de la Generalitat Valenciana).
// Todos los importes, coeficientes y parámetros salen de datos/tarifas-g5.csv:
// a cada día se le aplica el valor vigente ese día.
(function (root) {
  'use strict';

  function parseCSV(text) {
    const rows = [];
    let header = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const cols = line.split(';');
      if (!header) { header = cols.map((c) => c.trim()); continue; }
      const r = {};
      header.forEach((h, i) => { r[h] = (cols[i] || '').trim(); });
      r.valor = parseFloat(r.valor);
      rows.push(r);
    }
    return rows;
  }

  const addDay = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Valor vigente un día concreto (las fechas AAAA-MM-DD se comparan como texto)
  function lookup(rows, clave, escala, day) {
    return rows.find((x) => x.clave === clave && (x.escala === escala || x.escala === 'todas') &&
      x.desde <= day && (!x.hasta || day <= x.hasta)) || null;
  }

  function coverageStart(rows) {
    return rows.filter((r) => r.clave === 'aguas').map((r) => r.desde).sort()[0];
  }

  // Días cobrables
  function chargeableDays(input, rows) {
    if (input.estancia === 'transito') {
      if (!input.entrada || !input.salida) return { err: 'Indica la entrada y la salida.' };
      if (input.salida < input.entrada) return { err: 'La salida es anterior a la entrada.' };
      const ed = input.entrada.slice(0, 10), sd = input.salida.slice(0, 10), sh = input.salida.slice(11, 16) || '00:00';
      const lim = lookup(rows, 'hora_limite_salida', 'todas', sd);
      const hl = lim ? String(Math.floor(lim.valor)).padStart(2, '0') + ':' + String(Math.round((lim.valor % 1) * 60)).padStart(2, '0') : '12:00';
      const list = [];
      for (let d = ed; d < sd; d = addDay(d, 1)) list.push(d);
      const late = sh > hl;
      if (sd === ed || late) list.push(sd);
      const info = sd === ed ? 'Entra y sale el mismo día: se cobra 1 día.'
        : late ? `Sale después de las ${hl}: se cobra también el día de salida.`
        : `Sale antes de las ${hl}: el día de salida no se cobra.`;
      return { list, info, horaLimite: hl };
    }
    const y = Number(input.anio);
    if (!y) return { err: 'Indica el año.' };
    const ini = input.semestre === 2 ? `${y}-07-01` : `${y}-01-01`;
    const fin = input.semestre === 2 ? `${y}-12-31` : `${y}-06-30`;
    let start = ini, info = 'Semestre completo, liquidado por adelantado.';
    if (input.alta) {
      if (input.alta > fin) return { err: 'La fecha de alta es posterior al semestre.' };
      if (input.alta > ini) { start = input.alta; info = 'Alta a mitad de semestre: desde la fecha de alta hasta el último día del semestre.'; }
    }
    const list = [];
    for (let d = start; d <= fin; d = addDay(d, 1)) list.push(d);
    return { list, info };
  }

  function calcular(input, rows) {
    const out = { m2: 0, dias: 0, total: 0, liquidaciones: [], notas: [], info: '', error: null, pagador: '' };
    const raw = input.eslora * input.manga;
    out.m2 = Math.ceil(raw - 1e-9);
    out.superficie = raw;
    if (!(input.eslora > 0) || !(input.manga > 0)) { out.error = 'Indica la eslora y la manga.'; return out; }
    if (input.tipo === 'concesion_total') { out.excluido = true; return out; }

    const D = chargeableDays(input, rows);
    if (D.err) { out.error = D.err; return out; }
    out.info = D.info;

    const directa = input.tipo === 'directa';
    const escala = directa ? input.escala : 'general';
    const claveA = input.tipo === 'reducida' ? 'aguas_reducida' : 'aguas';
    const claves = [claveA];
    if (directa) claves.push(input.atraque, ...(input.servicios || []));

    const inicio = coverageStart(rows);
    if (D.list[0] < inicio) { out.error = `No hay precios cargados antes del ${inicio.split('-').reverse().join('/')}.`; return out; }

    // Agrupar días por (año, combinación de valores vigentes)
    const grupos = [];
    for (const d of D.list) {
      const lineas = claves.map((k) => lookup(rows, k, escala, d));
      if (lineas.some((l) => !l)) {
        out.error = input.atraque === 'fluvial' && escala === 'deportivo'
          ? 'En los puertos exclusivamente deportivos no hay precio de muelle fluvial.'
          : `Falta algún precio para el ${d}. Revisa el archivo de precios.`;
        return out;
      }
      const firma = d.slice(0, 4) + '|' + lineas.map((l) => l.clave + '@' + l.desde).join('|');
      let g = grupos.find((x) => x.firma === firma);
      if (!g) { g = { firma, anio: d.slice(0, 4), lineas, dias: [] }; grupos.push(g); }
      g.dias.push(d);
    }

    for (const g of grupos) {
      const ref = g.dias[0], n = g.dias.length;
      const precio = g.lineas.reduce((s, l) => s + l.valor, 0);
      let imp = precio * out.m2 * n;
      const pasos = [{ concepto: `× ${out.m2} m² × ${n} ${n === 1 ? 'día' : 'días'}`, importe: imp }];
      if (input.lista6) {
        const c = lookup(rows, 'coef_lista6', 'todas', ref);
        if (c) { pasos.push({ concepto: `Lista 6.ª ×${String(c.valor).replace('.', ',')} (art. 32)`, importe: imp * (c.valor - 1), tipo: 'recargo' }); imp *= c.valor; }
      }
      if (input.estancia === 'transito' && input.sinAutorizacion) {
        const c = lookup(rows, 'coef_sin_autorizacion', 'todas', ref);
        if (c) { pasos.push({ concepto: 'Sin autorización, tarifa doble (art. 35)', importe: imp * (c.valor - 1), tipo: 'recargo' }); imp *= c.valor; }
      }
      let bon = null;
      if (directa && input.estancia === 'base' && input.domiciliado) bon = lookup(rows, 'bonif_domiciliacion', 'todas', ref);
      if (!directa) bon = lookup(rows, input.estancia === 'base' ? 'bonif_concesion_base' : 'bonif_concesion_transito', 'todas', ref);
      if (bon) {
        const pct = Math.round(bon.valor * 100);
        const label = directa ? 'Domiciliación (art. 37)' : 'Bonificación concesión (art. 34)';
        pasos.push({ concepto: `${label} −${pct}\u00a0%`, importe: -imp * bon.valor, tipo: 'bonificacion' });
        imp *= 1 - bon.valor;
      }
      imp = r2(imp);
      out.total += imp;
      out.liquidaciones.push({
        desde: g.dias[0], hasta: g.dias[n - 1], anio: g.anio, dias: n, precioDia: precio, importe: imp, pasos,
        lineas: g.lineas.map((l) => ({ tramo: l.tramo, concepto: l.concepto, valor: l.valor, fuente: l.fuente, desde: l.desde, hasta: l.hasta })),
      });
      out.dias += n;
    }
    out.total = r2(out.total);
    out.pagador = directa ? 'al titular de la embarcación' : 'al concesionario';

    // Notas
    const L = out.liquidaciones;
    if (new Set(L.map((l) => l.anio)).size > 1 && input.estancia === 'transito') out.notas.push('El tránsito cruza de año: se emiten dos liquidaciones, una por año, cada una con su precio.');
    const tablas = new Set(L.map((l) => l.lineas[0].desde));
    if (tablas.size > 1) out.notas.push('El periodo cruza un cambio de precios: cada tramo de días se calcula con la tabla vigente en esas fechas.');
    if (L.some((l) => l.lineas.some((x) => /pendiente/i.test(x.fuente)))) out.notas.push('Parte del periodo usa precios anteriores al 01/06/2025, pendientes de verificar contra el BOE.');
    if (directa && input.estancia === 'base') out.notas.push('Plaza base: semestre natural, desde el inicio del semestre o la fecha de alta hasta su último día.');
    if (directa && input.estancia === 'transito') out.notas.push(`Tránsito: se cuenta el día de entrada; el de salida solo si se sale después de las ${D.horaLimite}.`);
    if (!directa) {
      const ref = D.list[0];
      const rb = lookup(rows, 'repercusion_base', 'todas', ref), rt = lookup(rows, 'repercusion_transito', 'todas', ref);
      if (rb && rt) out.notas.push(`El concesionario puede repercutir al usuario hasta el ${Math.round(rb.valor * 100)}\u00a0% de la cuota de las embarcaciones base y hasta el ${Math.round(rt.valor * 100)}\u00a0% de la de los tránsitos (art. 34.Dos).`);
    }
    return out;
  }

  const api = { parseCSV, calcular, lookup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.G5 = api;
})(this);

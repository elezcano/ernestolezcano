// Motor de cálculo de la tarifa G-5 (Ley 1/1999 de Tarifas Portuarias de la Generalitat Valenciana).
// Lee los precios de datos/tarifas-g5.csv y aplica a cada día el valor vigente ese día.
(function (root) {
  'use strict';

  function parseCSV(text) {
    const rows = [];
    let header = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const cols = line.split(';');
      if (!header) { header = cols; continue; }
      const r = {};
      header.forEach((h, i) => { r[h] = (cols[i] || '').trim(); });
      r.valor = parseFloat(r.valor);
      rows.push(r);
    }
    return rows;
  }

  const DAY = 86400000;
  const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fmt = (t) => new Date(t).toISOString().slice(0, 10);

  function valueOn(rows, clave, escala, t) {
    const r = rows.find((x) => x.clave === clave && (x.escala === escala || x.escala === 'todas') &&
      toDate(x.desde) <= t && (!x.hasta || t <= toDate(x.hasta)));
    return r ? r : null;
  }

  // Días cobrables
  function chargeableDays(input) {
    if (input.estancia === 'transito') {
      const a = toDate(input.entrada), b = toDate(input.salida);
      if (b < a) throw new Error('La salida no puede ser anterior a la entrada.');
      let n = Math.round((b - a) / DAY);         // se cuenta el día de entrada, no el de salida
      if (input.salidaTarde) n += 1;             // salvo que se salga pasada la hora límite
      if (n === 0) n = 1;                        // entrada y salida el mismo día: un día o fracción
      return Array.from({ length: n }, (_, i) => a + i * DAY);
    }
    // Plaza base: semestre natural, desde la fecha de alta si es posterior al inicio
    const y = Number(input.anio);
    const ini = input.semestre === 1 ? Date.UTC(y, 0, 1) : Date.UTC(y, 6, 1);
    const fin = input.semestre === 1 ? Date.UTC(y, 5, 30) : Date.UTC(y, 11, 31);
    let desde = ini;
    if (input.alta) {
      const alta = toDate(input.alta);
      if (alta > fin) throw new Error('La fecha de alta es posterior al semestre.');
      desde = Math.max(ini, alta);
    }
    const n = Math.round((fin - desde) / DAY) + 1;
    return Array.from({ length: n }, (_, i) => desde + i * DAY);
  }

  function calcular(input, rows) {
    const m2 = Math.ceil(Math.round(input.eslora * input.manga * 1e6) / 1e6);
    const dias = chargeableDays(input);
    const escala = input.instalacion === 'directa' ? input.escala : 'general';
    const concesion = input.instalacion !== 'directa';
    const avisos = [];

    // Agrupar días por combinación de valores vigentes
    const grupos = new Map();
    for (const t of dias) {
      const lineas = [];
      const a = valueOn(rows, input.instalacion === 'reducida' ? 'aguas_reducida' : 'aguas', escala, t);
      if (!a) throw new Error(`No hay precios cargados para el ${fmt(t)}. La fuente cubre desde el 01/06/2025.`);
      lineas.push(a);
      if (!concesion) {
        const b = valueOn(rows, input.atraque, escala, t);
        if (!b) throw new Error('Esa situación de atraque no existe en este tipo de puerto.');
        lineas.push(b);
        for (const s of input.servicios || []) {
          const c = valueOn(rows, s, escala, t);
          if (c) lineas.push(c);
        }
      }
      const key = lineas.map((l) => l.clave + '@' + l.valor).join('|');
      if (!grupos.has(key)) grupos.set(key, { lineas, dias: 0, desde: t, hasta: t });
      const g = grupos.get(key); g.dias++; g.hasta = t;
    }

    const ref = dias[0];
    const k = (clave) => { const r = valueOn(rows, clave, 'todas', ref); return r ? r.valor : null; };

    let base = 0;
    const tramos = [];
    for (const g of grupos.values()) {
      const precioDia = g.lineas.reduce((s, l) => s + l.valor, 0);
      const importe = precioDia * m2 * g.dias;
      base += importe;
      tramos.push({ desde: fmt(g.desde), hasta: fmt(g.hasta), dias: g.dias, precioDia, importe,
        lineas: g.lineas.map((l) => ({ tramo: l.tramo, concepto: l.concepto, valor: l.valor, norma: l.norma })) });
    }

    const ajustes = [];
    let total = base;
    if (input.lista6) {
      const c = k('coef_lista6');
      ajustes.push({ concepto: `Lista 6.ª o uso comercial temporal (×${String(c).replace('.', ',')})`, importe: total * (c - 1) });
      total *= c;
    }
    if (concesion) {
      const b = k(input.estancia === 'base' ? 'bonif_concesion_base' : 'bonif_concesion_transito');
      ajustes.push({ concepto: `Estimación simplificada en concesión (−${Math.round(b * 100)} %)`, importe: -total * b });
      total *= 1 - b;
    } else if (input.estancia === 'base' && input.domiciliado) {
      const b = k('bonif_domiciliacion');
      ajustes.push({ concepto: `Domiciliación bancaria (−${Math.round(b * 100)} %)`, importe: -total * b });
      total *= 1 - b;
    }
    if (input.domiciliado && (concesion || input.estancia !== 'base')) {
      avisos.push('La bonificación por domiciliación solo se aplica a embarcaciones base en gestión directa.');
    }

    return { m2, dias: dias.length, base, ajustes, total: Math.round(total * 100) / 100, tramos, avisos };
  }

  const api = { parseCSV, calcular };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.G5 = api;
})(this);

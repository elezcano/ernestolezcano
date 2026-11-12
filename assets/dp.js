// Motor de cálculo de las tasas del dominio público portuario (Ley 2/2014 de Puertos de la Generalitat, título IV).
// Todos los tipos, factores, bonificaciones y parámetros se leen de datos/tasas-dominio-publico.csv.
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

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const r4 = (n) => Math.round((n + Number.EPSILON) * 1e4) / 1e4;
  const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5) + 1;

  function lookup(rows, clave, dia) {
    return rows.find((x) => x.clave === clave && x.desde <= dia && (!x.hasta || dia <= x.hasta)) || null;
  }

  const NATURALEZAS = ['espejo', 'relleno', 'urbanizado', 'tinglado', 'edificio'];

  // Factor de la actividad b) según la naturaleza y el cerramiento (art. 71.1 b)
  function claveFactorB(nat, cerramiento) {
    if (nat === 'espejo') return 'factor_b_espejo';
    if (nat === 'tinglado' || nat === 'edificio') return 'factor_b_cubierto';
    return cerramiento ? 'factor_b_con_cerramiento' : 'factor_b_sin_cerramiento';
  }

  /*
   input = {
     tipo: 'general' | 'pesca' | 'nautica',
     dia: 'AAAA-MM-DD' (fecha de referencia para los tipos; por defecto, inicio del periodo o hoy),
     // general
     naturaleza, m2, subsuelo,
     actividad: 'ninguna' | 'a' | 'b' | 'combustible', cerramiento, sActividad, ingresos,
     ciManual, factorManual, umbralManual, aplicarReduccion (por defecto true),
     // pesca / náutica
     ventas, valorTerrenos, valorObras, gestion: 'directa' | 'resto',
     // ajustes
     ayuntamiento, planEstrategico, exencion: 'no' | 'total' | 'actividad', sinTitulo,
     desde, hasta (prorrata opcional)
   }
  */
  function calcular(input, rows) {
    const hoy = new Date().toISOString().slice(0, 10);
    const dia = input.dia || input.desde || hoy;
    const v = (k) => { const r = lookup(rows, k, dia); return r ? r : null; };
    const out = { lineas: [], ajustes: [], anual: 0, total: 0, periodo: null, notas: [], errores: [], fuentes: new Set() };
    const req = (k) => { const r = v(k); if (!r) { out.errores.push(`No hay valor para «${k}» el ${dia}.`); return null; } out.fuentes.add(r.fuente); return r; };

    let ocupacion = 0, actividad = 0, especifica = 0;

    if (input.tipo === 'pesca') {
      const t = req('tipo_pesca'); if (!t) return out;
      if (!(input.ventas > 0)) { out.errores.push('Indica el valor de la primera venta.'); return out; }
      especifica = r2(input.ventas * t.valor);
      out.lineas.push({ grupo: 'Primera venta de pescado', concepto: `${fmtN(input.ventas, 2)} € × ${fmtPct(t.valor)}`, importe: especifica, fuente: t.fuente });
      out.notas.push('Sustituye a las tasas de ocupación y actividad para las mismas instalaciones (art. 72.2). Se devenga el último día de cada semestre.');
    } else if (input.tipo === 'nautica') {
      const t = req(input.gestion === 'directa' ? 'tipo_nautica_directa' : 'tipo_nautica_resto'); if (!t) return out;
      const valor = (input.valorTerrenos || 0) + (input.valorObras || 0);
      if (!(valor > 0)) { out.errores.push('Indica el valor de los terrenos y aguas y el de las obras.'); return out; }
      especifica = r2(valor * t.valor);
      out.lineas.push({ grupo: 'Instalación náutico-deportiva', concepto: `Valor del bien ${fmtN(valor, 2)} € × ${fmtPct(t.valor)}`, importe: especifica, fuente: t.fuente });
      out.notas.push('Sustituye a las tasas de ocupación y actividad (art. 76.2). Las embarcaciones que amarran pagan además la tarifa G-5 (Ley 1/1999).');
    } else {
      if (!NATURALEZAS.includes(input.naturaleza)) { out.errores.push('Elige la naturaleza de la superficie.'); return out; }
      if (!(input.m2 > 0)) { out.errores.push('Indica los m² ocupados.'); return out; }
      const ciRow = req(input.naturaleza); const ipc = req('coef_ipc'); const umb = req('umbral_reduccion');
      if (!ciRow || !ipc || !umb) return out;
      const ciLegal = ciRow.valor;
      const coefIpc = input.ipcManual > 0 ? input.ipcManual : ipc.valor;
      const ci = input.ciManual > 0 ? input.ciManual : r4(ciLegal * coefIpc);
      out.ci = ci; out.ciLegal = ciLegal; out.ipc = coefIpc;

      // Ocupación (art. 67), con bonificación de subsuelo (art. 82.1)
      let tipoOcup = ci;
      if (input.subsuelo) { const b = req('bonif_subsuelo'); tipoOcup = ci * (1 - b.valor); }
      ocupacion = r2(tipoOcup * input.m2);
      out.lineas.push({ grupo: 'Ocupación', concepto: `${fmtN(input.m2, 2)} m² × ${fmtN(tipoOcup, 4)} €/m²${input.subsuelo ? ' (subsuelo, 50\u00a0%)' : ''}`, importe: ocupacion, fuente: ciRow.fuente,
        detalle: { tipo: tipoOcup, m2: input.m2 } });

      // Actividad (arts. 68-71)
      if (input.actividad === 'combustible') {
        const t = req('tipo_combustible');
        if (!(input.ingresos > 0)) out.errores.push('Indica los ingresos brutos de la instalación.');
        else {
          actividad = r2(input.ingresos * t.valor);
          out.lineas.push({ grupo: 'Actividad', concepto: `Combustible: ${fmtN(input.ingresos, 2)} € × ${fmtPct(t.valor)}`, importe: actividad, fuente: t.fuente });
          out.notas.push('La parte de combustible se devenga el último día de cada semestre (art. 80.1).');
        }
      } else if (input.actividad === 'a' || input.actividad === 'b') {
        const S = input.sActividad > 0 ? input.sActividad : input.m2;
        if (S > input.m2) out.errores.push(`Los m² de la actividad (${fmtN(S, 2)}) superan los m² ocupados (${fmtN(input.m2, 2)}).`);
        const fRow = req(input.actividad === 'a' ? 'factor_a' : claveFactorB(input.naturaleza, input.cerramiento));
        if (fRow) {
          const factor = input.factorManual > 0 ? input.factorManual : fRow.valor;
          const umbral = input.umbralManual > 0 ? input.umbralManual : umb.valor;
          const reduce = input.aplicarReduccion !== false && S > umbral;
          const F = reduce ? Math.sqrt(umbral / S) : 1;
          const pu = r4(factor * ci * F);
          actividad = r2(pu * S);
          out.actividadDet = { factor, ci, F, pu, S, umbral, reduce, concepto: fRow.concepto };
          out.lineas.push({ grupo: 'Actividad', concepto: `${fmtN(factor, factor % 1 ? 1 : 0)} × ${fmtN(ci, 4)}${reduce ? ` × √(${umbral}/${fmtN(S, 0)})` : ''} = ${fmtN(pu, 4)} €/m² × ${fmtN(S, 2)} m²`, importe: actividad, fuente: fRow.fuente });
          if (reduce) out.notas.push(`La superficie de la actividad supera ${umbral} m²: el tipo se reduce por √(${umbral}/S) = ${fmtN(F, 4)}.`);
        }
      }

      // Ayuntamientos (art. 82.2): solo el tipo del art. 67
      if (input.ayuntamiento && actividad > 0) {
        out.ajustes.push({ concepto: 'Ayuntamiento: solo se paga la ocupación (art. 82.2)', importe: -actividad });
        actividad = 0;
      }
    }

    let anual = ocupacion + actividad + especifica;

    // Plan estratégico (art. 82.3): 50 % de ocupación y de actividad
    if (input.planEstrategico && input.tipo === 'general' && anual > 0) {
      const b = req('bonif_plan_estrategico');
      const d = r2((ocupacion + actividad) * b.valor);
      out.ajustes.push({ concepto: `Plan estratégico −${Math.round(b.valor * 100)}\u00a0% (art. 82.3)`, importe: -d });
      anual -= d;
    }
    // Exenciones (art. 83)
    if (input.exencion === 'total') { out.ajustes.push({ concepto: 'Exención total (art. 83)', importe: -anual }); anual = 0; }
    if (input.exencion === 'actividad' && actividad > 0 && input.tipo === 'general') {
      const d = input.planEstrategico ? r2(actividad * 0.5) : actividad;
      out.ajustes.push({ concepto: 'Exención de la tasa de actividad (art. 83)', importe: -d }); anual -= d;
    }
    // Sin título (art. 85 bis)
    if (input.sinTitulo && anual > 0) {
      const k = req('recargo_sin_titulo');
      const d = r2(anual * k.valor);
      out.ajustes.push({ concepto: `Sin título +${Math.round(k.valor * 100)}\u00a0% (art. 85 bis)`, importe: d });
      anual += d;
    }
    out.anual = r2(anual);
    out.total = out.anual;

    // Prorrata por días (hipótesis: la ley mide la base «en años o fracción» sin detallar el cálculo)
    if (input.desde && input.hasta) {
      if (input.hasta < input.desde) out.errores.push('La fecha final es anterior a la inicial.');
      else {
        const n = diasEntre(input.desde, input.hasta);
        out.periodo = { dias: n, importe: r2(out.anual * n / 365), desde: input.desde, hasta: input.hasta };
        out.total = out.periodo.importe;
        out.notas.push('Prorrata por días sobre 365: hipótesis de cálculo, la ley no detalla cómo se mide la fracción de año.');
      }
    }
    out.semestre = r2(out.anual / 2);
    out.fuentes = [...out.fuentes];
    return out;
  }

  function fmtN(n, d) { return Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }); }
  function fmtPct(x) { return x < 0.01 ? fmtN(x * 1000, 0) + '\u00a0‰' : fmtN(x * 100, (x * 100) % 1 ? 1 : 0) + '\u00a0%'; }

  const api = { parseCSV, calcular, lookup, NATURALEZAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DP = api;
})(this);

// Motor de cálculo de las tasas y tarifas de una escala en el Puerto Bahía de Algeciras.
// TRLPEMM (RDL 2/2011) y Ley 31/2022 prorrogada. Todos los valores se leen de datos/tasas-escala-algeciras.csv.
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
  const pos = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  const fmt = (n, d) => n.toLocaleString('es-ES', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 5 : d, useGrouping: 'always' });

  // Horas computables de la T-1: mínimo 3; máximo 15 por cada bloque de 24 h (art. 197)
  function horasComputables(h, min, maxDia) {
    const dias = Math.floor(h / 24);
    const resto = h - 24 * dias;
    return Math.max(min, maxDia * dias + Math.min(resto, maxDia));
  }

  function tramo201(n) {
    if (n <= 12) return 'e201_12';
    if (n <= 26) return 'e201_26';
    if (n <= 52) return 'e201_52';
    if (n <= 104) return 'e201_104';
    if (n <= 156) return 'e201_156';
    if (n <= 312) return 'e201_312';
    if (n <= 365) return 'e201_365';
    return 'e201_mas';
  }

  function kDesechos(gt) {
    if (gt <= 2500) return 1.5;
    if (gt <= 25000) return 6 * 0.0001 * gt;
    if (gt <= 100000) return 1.2 * 0.0001 * gt + 12;
    return 24;
  }

  const ELEMENTOS = { u10: 't3_u10', u15: 't3_u15', u25: 't3_u25', v05: 't3_v05', v2: 't3_v2' };
  const ELEM_NOMBRE = { u10: "contenedor de hasta 20'", u15: 'semirremolque o contenedor de más de 20\'', u25: 'tren de carretera', v05: 'vehículo de hasta 2.500 kg', v2: 'vehículo de más de 2.500 kg' };
  const OP_NOMBRE = { ES: 'entrada o salida', TR: 'tránsito marítimo', TBa: 'trasbordo entre atracados', TBb: 'trasbordo abarloado o fondeado' };

  /*
   input = {
     dia,                                   // fecha de la escala (AAAA-MM-DD); por defecto, hoy
     gt, horas, zona: 'I'|'II'|'DE'|'F', atraque: clave atr_*,
     tipo: 'rodada'|'general'|'crucero', tmcd, regular, crucero: clave crucero_*, combAlt,
     a201, nEscala, escalasPrevias,
     pax, schengen, moto, turismo5, turismoMas5, autocar, concPasaje: 'no'|'ambos'|'estacion', lineasPasaje: 0|1|2,
     partidas: [{ elemento, unidades, operacion }], terminal: 'NC'|'CA'|'CS', tmcdMercancia,
     nPracticaje, cuadroPracticaje: 't-2'|'t-1'|'t0'|'t+1'|'t+2',
     nRemolque, remolque: '6_gen'|'6_abc'|'7_gen'|'7_abc'|'8_gen'|'8_abc',
     nAmarre, amarre: 'general'|'especial'|'ferri',
     pasajeBuque, personas, desechosZonaII
   }
  */
  function calcular(input, rows) {
    const dia = input.dia || new Date().toISOString().slice(0, 10);
    const out = { ap: [], sv: [], totalAP: 0, totalSV: 0, total: 0, notas: [], errores: [], fuentes: new Set() };
    const v = (k) => {
      const r = rows.find((x) => x.clave === k && x.desde <= dia && (!x.hasta || dia <= x.hasta));
      if (!r) { out.errores.push(`No hay valor para «${k}» el ${dia.split('-').reverse().join('/')}.`); return NaN; }
      out.fuentes.add(r.fuente);
      return r.valor;
    };

    const gt = pos(input.gt);
    if (!gt) { out.errores.push('Indica el arqueo bruto (GT) del buque.'); return out; }
    const gtMin = v('gt_minimo');
    const gtc = Math.max(gt, gtMin);
    const tipo = input.tipo;
    const regular = !!input.regular;

    // ---------- T-1 Buque ----------
    let usaS = !!input.tmcd;
    if (tipo === 'crucero' && usaS) { usaS = false; out.notas.push('Los coeficientes de crucero se aplican con la cuantía B: se ignora la corta distancia.'); }
    const base = usaS ? v('S') : v('B');
    const baseTxt = (usaS ? 'S ' : 'B ') + fmt(base, 2);
    const factores = [];
    let coef = 1;
    const mult = (k, txt) => { const f = v(k); coef *= f; factores.push(`${fmt(f, 2)} ${txt}`); };
    let t1, f1;
    if (input.zona === 'F') {
      const dias = Math.max(1, Math.ceil(pos(input.horas) / 24));
      const ff = v('fondeo_ii');
      t1 = gtc / 100 * dias * base * v('cc_t1') * ff;
      f1 = `${fmt(gtc)}/100 × ${dias} d × ${baseTxt} × ${fmt(ff, 2)} fondeo`;
    } else {
      const h = horasComputables(pos(input.horas), v('horas_minimo'), v('horas_max_dia'));
      mult(input.atraque || 'atr_nc_costado', 'atraque');
      if (tipo === 'rodada') {
        if (usaS) mult(regular ? 'rodada_regular' : 'rodada_general', regular ? 'rodada regular' : 'rodada');
        else out.notas.push('El coeficiente de buques de rodada solo se aplica con la cuantía S (corta distancia).');
      }
      if (tipo === 'crucero') mult(input.crucero || 'crucero_general', 'crucero');
      if (input.combAlt) mult('comb_alternativo', 'combustible alternativo');
      t1 = gtc / 100 * h * base * v('cc_t1') * coef;
      f1 = `${fmt(gtc)}/100 × ${h} h × ${baseTxt} × ${factores.join(' × ')}`;
      if (h !== pos(input.horas)) out.notas.push(`Se computan ${h} h de estancia: mínimo 3 h y máximo 15 h por cada 24 h (art. 197).`);
      if (input.zona === 'II') { const z = v('zona_ii'); t1 *= z; f1 += ` × ${fmt(z * 100)} % Zona II`; }
      if (input.zona === 'DE') { const z = v('dique_exento'); t1 *= z; f1 += ` × ${fmt(z * 100)} % dique exento`; }
    }
    if (input.a201) {
      const n = Math.max(1, Math.floor(pos(input.nEscala)) || 1);
      const c = v(tramo201(n)) - (regular ? v('e201_regular') : 0);
      t1 *= c;
      f1 += ` × ${fmt(c, 2)} escalas sucesivas (n.º ${n})`;
    }
    out.ap.push({ id: 't1', concepto: 'T-1 Buque', importe: r2(t1), formula: f1 });

    // ---------- Ayudas a la navegación ----------
    const prev = Math.floor(pos(input.escalasPrevias));
    const limite = v('an_escalas');
    if (prev >= limite) {
      out.ap.push({ id: 'an', concepto: 'Ayudas a la navegación', importe: 0, formula: `No es una de las ${limite} primeras escalas del año` });
    } else {
      const an = gtc * (v('A') + v('C')) * v('an_factor');
      out.ap.push({ id: 'an', concepto: 'Ayudas a la navegación', importe: r2(an), formula: `${fmt(gtc)} × (${fmt(v('A'), 2)} + ${fmt(v('C'), 2)}) × ${fmt(v('an_factor'), 3)}` });
    }

    // ---------- T-2 Pasaje ----------
    const lineasT2 = [
      ['pax', pos(input.pax), tipo === 'crucero' ? (input.paxCrucero === 'transito' ? 't2_crucero_transito' : 't2_crucero_inicio') : (input.schengen ? 't2_pax_schengen' : 't2_pax_no_schengen'), 'pasajeros'],
      ['moto', pos(input.moto), 't2_moto', 'motos'],
      ['turismo5', pos(input.turismo5), 't2_turismo5', 'turismos ≤ 5 m'],
      ['turismoMas5', pos(input.turismoMas5), 't2_turismo_mas5', 'turismos > 5 m'],
      ['autocar', pos(input.autocar), 't2_autocar', 'autocares'],
    ];
    const conc = input.concPasaje === 'ambos' ? v('t2_conc_ambos') : input.concPasaje === 'estacion' ? v('t2_conc_estacion') : 1;
    const reg2 = regular ? v('t2_regular') : 1;
    let t2 = 0;
    const partesT2 = [];
    for (const [, n, k, nombre] of lineasT2) {
      if (!n) continue;
      const c = v(k);
      t2 += n * v('P') * v('cc_t2') * c * conc * reg2;
      partesT2.push(`${fmt(n)} ${nombre} × ${fmt(c, 2)}`);
    }
    if (partesT2.length) {
      let f = `P ${fmt(v('P'), 2)} × (${partesT2.join(' + ')})`;
      if (conc !== 1) f += ` × ${fmt(conc * 100)} % concesión`;
      if (reg2 !== 1) f += ` × ${fmt(reg2 * 100)} % regular`;
      out.ap.push({ id: 't2', concepto: 'T-2 Pasaje', importe: r2(t2), formula: f });
    }

    // ---------- T-3 Mercancía (estimación simplificada) ----------
    let t3 = 0;
    const partesT3 = [];
    for (const p of input.partidas || []) {
      const n = pos(p.unidades);
      if (!n) continue;
      const ce = v(ELEMENTOS[p.elemento]);
      let q = n * ce * v('M') * v('cc_t3');
      const aj = [];
      const op = p.operacion || 'ES';
      if (op === 'TR') { q *= v('t3_op_tr'); aj.push(`${fmt(v('t3_op_tr') * 100)} % tránsito`); }
      if (op === 'TBa') { q *= v('t3_op_tba'); aj.push(`${fmt(v('t3_op_tba') * 100)} % trasbordo`); }
      if (op === 'TBb') { q *= v('t3_op_tbb'); aj.push(`${fmt(v('t3_op_tbb') * 100)} % trasbordo`); }
      if (input.terminal === 'CA') {
        const k = op === 'ES' ? 't3_ca_es' : op === 'TR' ? 't3_ca_tr' : 't3_ca_tb';
        q *= v(k); aj.push(`${fmt(v(k) * 100)} % terminal concesionada`);
      }
      if (input.terminal === 'CS') { q *= v('t3_cs'); aj.push(`${fmt(v('t3_cs') * 100)} % terminal concesionada`); }
      if (input.tmcdMercancia && op === 'ES') {
        const k = tipo === 'rodada' ? 't3_tmcd_rodada' : 't3_tmcd_general';
        q *= v(k); aj.push(`${fmt(v(k), 2)} corta distancia`);
      }
      t3 += q;
      partesT3.push(`${fmt(n)} × ${fmt(ce, 2)} (${ELEM_NOMBRE[p.elemento]}, ${OP_NOMBRE[op]})${aj.length ? ' × ' + aj.join(' × ') : ''}`);
    }
    if (partesT3.length) {
      out.ap.push({ id: 't3', concepto: 'T-3 Mercancía', importe: r2(t3), formula: `M ${fmt(v('M'), 2)} × [${partesT3.join(' + ')}]` });
          }

    // ---------- Tarifa fija de desechos ----------
    const k = kDesechos(gt);
    const r1 = input.pasajeBuque ? v('R1_pasaje') : v('R1');
    let des = r1 * k * v('cc_marpol');
    let fd = `R1 ${fmt(r1)} × k ${fmt(k, 2)}`;
    if (input.desechosZonaII) { des *= v('des_recargo_ii'); fd += ` × ${fmt(v('des_recargo_ii'), 2)} Zona II`; }
    if (input.pasajeBuque) { const per = pos(input.personas); des += v('R2') * per; fd += ` + R2 ${fmt(v('R2'), 2)} × ${fmt(per)} personas`; }
    out.ap.push({ id: 'des', concepto: 'Tarifa fija de desechos', importe: r2(des), formula: fd });

    // ---------- Servicios portuarios (tarifas máximas de los prestadores) ----------
    const nPr = Math.floor(pos(input.nPracticaje));
    if (nPr) {
      const c = input.cuadroPracticaje || 't0';
      const fija = v(`prac_${c}_fija`), vari = v(`prac_${c}_var`);
      out.sv.push({ id: 'prac', concepto: 'Practicaje', importe: r2(nPr * (fija + vari * gt)), formula: `${nPr} × (${fmt(fija, 2)} + ${fmt(vari, 5)} × ${fmt(gt)} GT), cuadro ${c.toUpperCase()}` });
      if (gt <= v('prac_gt_obligatorio')) out.notas.push(`El practicaje es obligatorio para buques de más de ${fmt(v('prac_gt_obligatorio'))} GT, con exenciones.`);
    }
    const nRm = Math.floor(pos(input.nRemolque));
    if (nRm) {
      const c = input.remolque || '6_gen';
      const fija = v(`rem_${c}_fija`), vari = v(`rem_${c}_var`);
      out.sv.push({ id: 'rem', concepto: 'Remolque', importe: r2(nRm * (fija + vari * gt)), formula: `${nRm} × (${fmt(fija)} + ${fmt(vari, 4)} × ${fmt(gt)} GT)` });
    }
    const nAm = Math.floor(pos(input.nAmarre));
    if (nAm) {
      let c = input.amarre || 'general';
      if (c === 'ferri' && gt > v('am_ferri_gt_max')) {
        c = 'general';
        out.notas.push(`Los ferris de más de ${fmt(v('am_ferri_gt_max'))} GT (o de más de 140 m de eslora) pagan el amarre general.`);
      }
      if (c === 'ferri') {
        out.sv.push({ id: 'am', concepto: 'Amarre', importe: r2(nAm * v('am_ferri')), formula: `${nAm} × ${fmt(v('am_ferri'), 2)} (ferri)` });
      } else {
        const fija = v(`am_${c}_fija`), vari = v(`am_${c}_var`);
        out.sv.push({ id: 'am', concepto: 'Amarre', importe: r2(nAm * (fija + vari * gt)), formula: `${nAm} × (${fmt(fija, 2)} + ${fmt(vari, 3)} × ${fmt(gt)} GT)` });
      }
    }
    const lp = Number(input.lineasPasaje) || 0;
    if (lp) {
      const pr = (x) => v(`sp${lp}_${x}`);
      const autos = pos(input.turismo5) + pos(input.turismoMas5);
      const sp = pos(input.pax) * pr('pax') + autos * pr('auto') + pos(input.moto) * pr('moto') + pos(input.autocar) * pr('bus');
      if (sp > 0) {
        out.sv.push({ id: 'sp', concepto: 'Servicio al pasaje', importe: r2(sp), formula: `${fmt(pos(input.pax))} pax × ${fmt(pr('pax'), 2)} + ${fmt(autos)} autos × ${fmt(pr('auto'), 2)}${pos(input.moto) ? ` + ${fmt(pos(input.moto))} motos × ${fmt(pr('moto'), 2)}` : ''}${pos(input.autocar) ? ` + ${fmt(pos(input.autocar))} autocares × ${fmt(pr('bus'), 2)}` : ''}` });
        if (pos(input.pax) < 50 && autos < 20) out.notas.push('El pliego del servicio al pasaje fija una facturación mínima de 50 pasajeros o 20 automóviles por escala.');
      }
    }

    out.totalAP = r2(out.ap.reduce((s, x) => s + x.importe, 0));
    out.totalSV = r2(out.sv.reduce((s, x) => s + x.importe, 0));
    out.total = r2(out.totalAP + out.totalSV);
    return out;
  }

  const api = { parseCSV, calcular, horasComputables, kDesechos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ESCALA = api;
})(typeof window !== 'undefined' ? window : globalThis);

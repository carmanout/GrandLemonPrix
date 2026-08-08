'use strict';
/* ============================================================
   EL GRAND LEMONPRIX 🍋 — Lógica del concurso
   Misma URL para móvil (control del presentador) y PC (panel).
   Sincronización opcional con Google Sheets vía Apps Script.
   ============================================================ */

/* ---------------- Utilidades ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtPts = n => (n % 1 === 0 ? String(n) : n.toFixed(1));
const eur = n => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const parseEuro = s => {
  const n = parseFloat(String(s).trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
};
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------------- Detección de vista (móvil = control, PC = panel) ---------------- */
function detectarVista() {
  const p = new URLSearchParams(location.search).get('vista');
  if (p === 'panel' || p === 'movil') return p;
  const ua = navigator.userAgent || '';
  return (/Mobi|Android|iPhone|iPod/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820))
    ? 'movil' : 'panel';
}
const VISTA = detectarVista();
document.body.classList.add(VISTA);
function cambiarVista(v) {
  const u = new URL(location.href); u.searchParams.set('vista', v); location.href = u.toString();
}

/* ---------------- Estado del concurso ---------------- */
const LKEY = 'lemonprix_state_v1';
const NOMBRE_FASE = {
  setup: 'Preparación', r1: 'Ronda 1 · El Aluvión', r2: 'Ronda 2 · Cifras y Letras',
  r3: 'Ronda 3 · El Precio Exacto', r4: 'Ronda 4 · Conexión Perfecta',
  podio: '¡Podio final!', r5: 'Ronda 5 · El Duelo Final', fin: 'Fin del concurso'
};
function defaultState() {
  return {
    rev: 0, fase: 'setup', updatedAt: Date.now(), ultimoEvento: '',
    config: { ptsR1: 1, ptsR2: 3, ptsR3: [5, 3, 2, 1, 1], ptsR4: 1, durR1: 30, durR2: 60 },
    equipos: [],                                   // {nombre, j1, j2, puntos}
    r1: { idx: null, resultados: {}, usadas: [] },
    r2: { sub: 0, tipos: ['cifras', 'letras', 'cifras', 'letras'], actual: null, estado: 'pre', resultados: [] },
    r3: { producto: null, filas: null, resuelto: false, usadas: [], total: 3 },
    r4: { idx: 0, sub: 0, usadas: [], resultados: {}, actual: null },
    ganadorIdx: null, empateIdxs: null,
    r5: { fallos: { A: 0, B: 0 }, turno: 'A', categoria: null, pregunta: null, usadas: [], ganador: null },
    timer: null                                    // {endsAt, dur, label}
  };
}
function saveLocal() { try { localStorage.setItem(LKEY, JSON.stringify(S)); } catch (e) {} }
function loadLocal() {
  try { const s = JSON.parse(localStorage.getItem(LKEY)); if (s && s.config) return s; } catch (e) {}
  return null;
}
let S = loadLocal() || defaultState();
const equiposOrdenados = () => [...S.equipos].sort((a, b) => b.puntos - a.puntos);

/* ---------------- Sincronización con Google Sheets (Apps Script) ---------------- */
const GASKEY = 'lemonprix_gas_url';
const GAS_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbxY7omtcBVZbJT271WWnUsZOZuMe10mHRver775MhzCvihWwDIw99nRCG5dmhnGOamc/exec';
const gasUrl = () => {
  const stored = localStorage.getItem(GASKEY);
  if (stored) return stored;
  try { localStorage.setItem(GASKEY, GAS_URL_DEFAULT); } catch (e) {}
  return GAS_URL_DEFAULT;
};
let pushTimer = null;
function push(evento, inmediato) {
  S.rev++; S.updatedAt = Date.now(); if (evento) S.ultimoEvento = evento;
  saveLocal();
  const url = gasUrl(); if (!url) return;
  const enviar = () => {
    const payload = JSON.stringify({
      rev: S.rev, fase: S.fase, evento: evento || '',
      marcador: equiposOrdenados().map(e => [e.nombre, `${e.j1} y ${e.j2}`, e.puntos]),
      state: JSON.stringify(S)
    });
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload })
      .catch(() => {});
  };
  if (inmediato) { clearTimeout(pushTimer); enviar(); }
  else { clearTimeout(pushTimer); pushTimer = setTimeout(enviar, 450); }
}
async function pull() {
  const url = gasUrl(); if (!url) return false;
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
    const data = JSON.parse(await r.text());
    if (data && typeof data.rev === 'number' && data.rev > S.rev) {
      S = data; saveLocal(); render(); return true;
    }
  } catch (e) {}
  return false;
}

/* ---------------- Temporizador ---------------- */
let timerLocal = { activo: false, cb: null };
function iniciarTemporizador(seg, label, cb) {
  S.timer = { endsAt: Date.now() + seg * 1000, dur: seg, label };
  timerLocal = { activo: true, cb };
}
function detenerTemporizador() { timerLocal = { activo: false, cb: null }; S.timer = null; }
setInterval(() => {
  const t = S && S.timer;
  $$('[data-timerbar]').forEach(el => {
    if (!t) { el.style.width = '0%'; return; }
    const rest = Math.max(0, t.endsAt - Date.now());
    el.style.width = (rest / (t.dur * 1000) * 100) + '%';
    el.classList.toggle('bajo', rest < 6000);
  });
  $$('[data-timerseg]').forEach(el => {
    if (!t) { el.textContent = ''; return; }
    const rest = Math.ceil(Math.max(0, t.endsAt - Date.now()) / 1000);
    el.textContent = rest;
    el.classList.toggle('bajo', rest <= 5);
  });
  if (timerLocal.activo && t && Date.now() >= t.endsAt) {
    const cb = timerLocal.cb; timerLocal = { activo: false, cb: null };
    cb && cb();
  }
}, 150);

/* ---------------- Generadores: Cifras y Letras ---------------- */
function generarCifras() {
  const pool = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 25, 50, 75, 100];
  const p = [...pool], numeros = [];
  for (let k = 0; k < 6; k++) numeros.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
  return { numeros, objetivo: 100 + Math.floor(Math.random() * 900) };
}
function resolverCifras(numeros, objetivo) {
  let mejor = { diff: Infinity, valor: null, expr: '' };
  const ini = numeros.map(n => ({ v: n, e: String(n) }));
  function dfs(arr) {
    if (mejor.diff === 0) return;
    for (const it of arr) {
      const d = Math.abs(it.v - objetivo);
      if (d < mejor.diff) mejor = { diff: d, valor: it.v, expr: `${it.e} = ${it.v}` };
    }
    if (arr.length < 2) return;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j], resto = [];
        for (let k = 0; k < arr.length; k++) if (k !== i && k !== j) resto.push(arr[k]);
        const ops = [{ v: a.v + b.v, e: `(${a.e} + ${b.e})` }];
        if (a.v !== 1 && b.v !== 1) ops.push({ v: a.v * b.v, e: `(${a.e} × ${b.e})` });
        if (a.v > b.v) ops.push({ v: a.v - b.v, e: `(${a.e} − ${b.e})` });
        if (b.v > a.v) ops.push({ v: b.v - a.v, e: `(${b.e} − ${a.e})` });
        if (b.v > 1 && a.v % b.v === 0) ops.push({ v: a.v / b.v, e: `(${a.e} ÷ ${b.e})` });
        if (a.v > 1 && b.v % a.v === 0) ops.push({ v: b.v / a.v, e: `(${b.e} ÷ ${a.e})` });
        for (const op of ops) { dfs([...resto, op]); if (mejor.diff === 0) return; }
      }
    }
  }
  dfs(ini);
  return mejor;
}
function generarLetras() {
  const voc = 'AAAEEEEIIOOOUU', con = 'NNNSSSRRRLLLDDDTTTCCCCMMMPPBBBGGVVFFYQHZJÑXKW';
  const nVoc = 4 + Math.floor(Math.random() * 2);      // 4 o 5 vocales
  const out = [];
  for (let i = 0; i < nVoc; i++) out.push(voc[Math.floor(Math.random() * voc.length)]);
  for (let i = nVoc; i < 9; i++) out.push(con[Math.floor(Math.random() * con.length)]);
  return shuffle(out);
}

/* ============================================================
   VISTA MÓVIL — pantallas del presentador
   ============================================================ */
let UI = { pantalla: 'juego' };   // juego | marcador | ajustes
let r1Run = null;                 // partida en curso de El Aluvión (local, rápido)

function render() {
  if (VISTA === 'panel') { renderPanel(); return; }
  renderMovil();
}
function renderMovil() {
  let c = '';
  if (UI.pantalla === 'marcador') c = screenMarcador();
  else if (UI.pantalla === 'ajustes') c = screenAjustes();
  else c = screenJuego();
  $('#app').innerHTML = cabecera() + (gasUrl() ? '' : bannerLocal()) + c + navMovil();
}
function cabecera() {
  return `<div class="cabecera">
    <div class="logo-emoji">🍋</div>
    <div><h1>EL GRAND <span>LEMONPRIX</span></h1><div class="sub">Panel del presentador</div></div>
    <div class="fase-pill">${esc(NOMBRE_FASE[S.fase])}</div>
  </div>`;
}
function bannerLocal() {
  return `<div class="banner-local">⚠️ <b>Modo local:</b> los datos solo se guardan en este navegador.
    Para sincronizar móvil y PC con tu hoja de Google, pega la URL del script en
    <b>Ajustes ⚙️</b>.</div>`;
}
function navMovil() {
  const b = (p, ic, txt) =>
    `<button type="button" data-act="nav" data-arg="${p}" class="${UI.pantalla === p ? 'activo' : ''}">
      <span class="ic">${ic}</span>${txt}</button>`;
  return `<div class="nav-movil">
      ${b('juego', '🎮', 'Juego')}${b('marcador', '🏆', 'Marcador')}${b('ajustes', '⚙️', 'Ajustes')}
    </div>
    <button type="button" class="cambiar-vista" data-act="vista-panel">🖥️ Ver versión para pantalla / PC</button>`;
}
function screenJuego() {
  switch (S.fase) {
    case 'setup': return screenSetup();
    case 'r1':    return screenR1();
    case 'r2':    return screenR2();
    case 'r3':    return screenR3();
    case 'r4':    return screenR4();
    case 'podio': return screenPodio();
    case 'r5':    return screenR5();
    case 'fin':   return screenFin();
    default:      return screenSetup();
  }
}

/* ---------- SETUP: registro de equipos ---------- */
function screenSetup() {
  if (!S.equipos.length) {
    S.equipos = Array.from({ length: 5 }, () => ({ nombre: '', j1: '', j2: '', puntos: 0 }));
  }
  const filas = S.equipos.map((e, i) => `
    <div class="equipo-form">
      <div class="tit"><b>Equipo ${i + 1}</b>
        ${S.equipos.length > 2 ? `<button type="button" class="del" data-act="setup-del" data-arg="${i}">✖</button>` : ''}
      </div>
      <label class="campo">Nombre del equipo
        <input type="text" id="eq-nombre-${i}" value="${esc(e.nombre)}" placeholder="Los Limones Ágiles" maxlength="30"></label>
      <div class="fila">
        <label class="campo">Jugador/a 1
          <input type="text" id="eq-j1-${i}" value="${esc(e.j1)}" placeholder="Nombre" maxlength="20"></label>
        <label class="campo">Jugador/a 2
          <input type="text" id="eq-j2-${i}" value="${esc(e.j2)}" placeholder="Nombre" maxlength="20"></label>
      </div>
    </div>`).join('');
  return `<div class="card">
      <h2>🍋 Registro de equipos</h2>
      <p class="muted">Inscribe las parejas participantes (5 en el Lemonprix clásico, de 2 a 8 posibles).</p>
    </div>
    ${filas}
    ${S.equipos.length < 8 ? `<button type="button" class="btn sec" data-act="setup-add">➕ Añadir otro equipo</button>` : ''}
    <button type="button" class="btn verde" data-act="setup-empezar">🚦 ¡Empezar el concurso!</button>`;
}
function leerFormSetup() {
  S.equipos = S.equipos.map((e, i) => ({
    nombre: ($('#eq-nombre-' + i)?.value || '').trim(),
    j1: ($('#eq-j1-' + i)?.value || '').trim(),
    j2: ($('#eq-j2-' + i)?.value || '').trim(),
    puntos: e.puntos || 0
  }));
}

/* ---------- RONDA 1 · EL ALUVIÓN ---------- */
function screenR1() {
  const total = S.equipos.length, hechos = Object.keys(S.r1.resultados).length;
  if (r1Run) {
    const qa = r1Run.cola[r1Run.pos];
    return `<div class="card" style="text-align:center">
        <div class="resumen-ronda">EL ALUVIÓN · Turno de <b>${esc(S.equipos[r1Run.equipoIdx].nombre)}</b></div>
        <div class="timer-big" data-timerseg></div>
        <div class="timerbar"><i data-timerbar></i></div>
        <div class="contadores">
          <span class="c-ok">✔ ${r1Run.aciertos}</span><span class="c-ko">✖ ${r1Run.fallos}</span>
        </div>
      </div>
      <div class="pregunta-card">
        <div class="pregunta">${esc(qa[0])}</div>
        <div class="respuesta">💡 ${esc(qa[1])}</div>
      </div>
      <div class="botones-juicio">
        <button type="button" class="btn-juicio ko" data-act="r1-fallo">✖<small>FALLO</small></button>
        <button type="button" class="btn-juicio ok" data-act="r1-acierto">✔<small>CORRECTO</small></button>
      </div>
      <button type="button" class="btn-ghost" data-act="r1-terminar">⏹ Terminar este turno ya</button>`;
  }
  const lista = S.equipos.map((e, i) => {
    const r = S.r1.resultados[i];
    return `<div class="equipo-item ${r ? 'hecho' : ''}">
      <div class="info">
        <div class="nombre">${r ? '✅' : '⏳'} ${esc(e.nombre)}</div>
        <div class="jugs">${esc(e.j1)} y ${esc(e.j2)}</div>
      </div>
      ${r ? `<div class="pts">+${fmtPts(r.pts)} pts<br><span class="chip">${r.aciertos}✔ ${r.fallos}✖</span></div>`
          : `<button type="button" class="btn mini" data-act="r1-jugar" data-arg="${i}">▶ Jugar</button>`}
    </div>`;
  }).join('');
  return `<div class="card">
      <h2>🌊 Ronda 1 · El Aluvión</h2>
      <p class="muted">Cada equipo tiene <b>${S.config.durR1} segundos</b> para responder el máximo de preguntas.
      Lee la pregunta en voz alta y pulsa ✔ o ✖. Acierto = <b>+${fmtPts(S.config.ptsR1)} pt</b>.</p>
      <p class="resumen-ronda">Equipos que han jugado: ${hechos}/${total}</p>
    </div>
    ${lista}
    ${hechos === total ? `<button type="button" class="btn verde" data-act="ir-r2">Continuar a la Ronda 2 ➜</button>` : ''}`;
}
function r1Fin() {
  detenerTemporizador();
  if (!r1Run) return;
  const i = r1Run.equipoIdx, eq = S.equipos[i];
  const pts = r1Run.aciertos * S.config.ptsR1;
  eq.puntos = Math.round((eq.puntos + pts) * 10) / 10;
  S.r1.resultados[i] = { aciertos: r1Run.aciertos, fallos: r1Run.fallos, pts };
  const ev = `🌊 Aluvión · ${eq.nombre}: ${r1Run.aciertos} aciertos y ${r1Run.fallos} fallos (+${fmtPts(pts)} pts)`;
  r1Run = null;
  push(ev, true); render(); toast('Puntuación guardada ✔');
}

/* ---------- RONDA 2 · CIFRAS Y LETRAS ---------- */
function screenR2() {
  const R = S.r2, cfg = S.config;
  if (R.resultados.length >= 4) {
    const resumen = R.resultados.map((r, k) => {
      const gan = r.ganadores.length ? r.ganadores.map(i => esc(S.equipos[i].nombre)).join(', ') : 'Nadie';
      return `<div class="equipo-item hecho"><div class="info">
        <div class="nombre">${k + 1}ª · ${r.tipo === 'cifras' ? '🔢 Cifras' : '🔤 Letras'}</div>
        <div class="jugs">Mejor marca: ${gan}</div></div></div>`;
    }).join('');
    return `<div class="card"><h2>🔢🔤 Ronda 2 · Cifras y Letras</h2>
      <p class="muted">Las 4 pruebas han terminado.</p></div>${resumen}
      <button type="button" class="btn verde" data-act="ir-r3">Continuar a la Ronda 3 ➜</button>`;
  }
  const tipo = R.tipos[R.sub];
  let centro = '';
  if (!R.actual) {
    centro = `<button type="button" class="btn" data-act="r2-generar">
      🎲 Generar ${tipo === 'cifras' ? 'los números' : 'las letras'}</button>`;
  } else if (R.estado === 'jugando') {
    centro = `<div class="timer-big" data-timerseg></div><div class="timerbar"><i data-timerbar></i></div>
      <p class="muted" style="text-align:center;margin-top:8px">¡Tiempo en marcha! ⏳</p>`;
  } else if (R.estado === 'pre') {
    centro = `<div class="fila">
        <button type="button" class="btn verde" data-act="r2-empezar">▶ Empezar ${cfg.durR2} s</button>
        <button type="button" class="btn sec" data-act="r2-generar">🔄 Otra</button>
      </div>`;
  } else { // puntuar
    const picks = S.equipos.map((e, i) => `
      <label class="pick"><input type="checkbox" name="ganR2" value="${i}"> ${esc(e.nombre)}</label>`).join('');
    centro = `<p class="muted" style="margin-top:10px">Marca el equipo (o equipos, si hay empate) con la mejor marca.
      Cada uno recibe <b>+${fmtPts(cfg.ptsR2)} pts</b>. Si nadie lo consigue, no marques ninguno.</p>
      <div style="margin-top:10px">${picks}</div>
      <button type="button" class="btn verde" data-act="r2-guardar">💾 Guardar y siguiente</button>`;
  }
  return `<div class="card">
      <h2>${tipo === 'cifras' ? '🔢 Cifras' : '🔤 Letras'} · Prueba ${R.sub + 1} de 4</h2>
      <p class="muted">Tienen <b>${cfg.durR2} segundos</b>. ${tipo === 'cifras'
        ? 'Hay que llegar al número objetivo (o acercarse lo máximo) usando los 6 números.'
        : 'Hay que formar la palabra más larga posible con las 9 letras.'}</p>
      ${R.actual ? bloqueRetoR2() : ''}
      ${centro}
    </div>`;
}
function bloqueRetoR2() {
  const a = S.r2.actual;
  if (a.tipo === 'cifras') {
    return `<div class="fichas">${a.numeros.map(n => `<span class="ficha">${n}</span>`).join('')}</div>
      <div class="objetivo">🎯 ${a.objetivo}</div>
      ${S.r2.estado === 'puntuar' ? `<div class="solucion">💡 Mejor solución: ${esc(a.solucion)}</div>` : ''}`;
  }
  return `<div class="fichas">${a.letras.map(l => `<span class="ficha letra">${l}</span>`).join('')}</div>`;
}
function r2FinTimer() { S.r2.estado = 'puntuar'; S.timer = null; push('', true); render(); toast('¡Tiempo!'); }
function elegirProductoR3() {
  const usados = S.r3.usadas;
  const disponibles = BANCO_PRECIOS.map((_, k) => k).filter(k => !usados.includes(k));
  if (!disponibles.length) return null;
  const k = disponibles[Math.floor(Math.random() * disponibles.length)];
  S.r3.usadas.push(k);
  return BANCO_PRECIOS[k];
}

/* ---------- RONDA 3 · EL PRECIO EXACTO ---------- */
function screenR3() {
  const R = S.r3;
  const rondaActual = Math.min(R.usadas.length + (R.producto ? 1 : 0), R.total);
  if (!R.producto) {
    return `<div class="card"><h2>💰 Ronda 3 · El Precio Exacto</h2>
      <p class="muted">Se enseñan <b>3 productos</b> distintos y cada pareja dice cuánto cree que cuesta.
      Cuanto más cerca queden, más puntos: ${S.config.ptsR3.join(' / ')}… (los empates puntúan igual).</p>
      <button type="button" class="btn" data-act="r3-elegir">🎁 Empezar la ronda 1/3</button></div>`;
  }
  const p = R.producto;
  const cardP = `<div class="card producto">
      ${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.nombre)}">` : `<div class="emoji">${p.emoji}</div>`}
      <div class="nombre">${esc(p.nombre)}</div>
      <div class="resumen-ronda">Producto ${Math.min(R.usadas.length, R.total)}/${R.total}</div>
      ${R.resuelto ? `<div class="precio-real">💰 Precio real: ${eur(p.precio)}</div>`
                   : `<div class="precio-real">🤫 Precio real: ${eur(p.precio)} (no lo digas)</div>`}
    </div>`;
  if (R.resuelto) {
    const filas = R.filas.map(f => `<tr>
      <td>${f.rank === 1 ? '🥇' : f.rank === 2 ? '🥈' : f.rank === 3 ? '🥉' : f.rank + 'º'}</td>
      <td>${esc(S.equipos[f.i].nombre)}</td><td>${eur(f.est)}</td><td>${eur(f.dist)}</td>
      <td class="pts">+${fmtPts(f.pts)}</td></tr>`).join('');
    const siguiente = R.usadas.length >= R.total
      ? `<button type="button" class="btn verde" data-act="ir-r4">Continuar a la Ronda 4 ➜</button>`
      : `<button type="button" class="btn verde" data-act="r3-elegir">Siguiente producto ➜</button>`;
    return `${cardP}<div class="card"><h3>Resultados</h3>
      <table class="tabla"><tr><th></th><th>Equipo</th><th>Dijo</th><th>Diferencia</th><th>Pts</th></tr>${filas}</table>
      ${siguiente}</div>`;
  }
  const inputs = S.equipos.map((e, i) => `
    <label class="campo">${esc(e.nombre)}
      <input type="text" inputmode="decimal" id="est-${i}" placeholder="0,00 €"></label>`).join('');
  return `${cardP}<div class="card"><h3>Anota lo que dice cada equipo</h3>${inputs}
    <button type="button" class="btn verde" data-act="r3-calcular">💰 Revelar y puntuar</button></div>`;
}

/* ---------- RONDA 4 · CONEXIÓN PERFECTA ---------- */
function screenR4() {
  const R = S.r4, eq = S.equipos[R.idx];
  const progreso = S.equipos.map((e, i) => {
    const res = R.resultados[i] || [];
    const pts = res.filter(Boolean).length * S.config.ptsR4;
    const hecho = res.length >= 2;
    return `<div class="equipo-item ${hecho ? 'hecho' : ''}">
      <div class="info"><div class="nombre">${hecho ? '✅' : i === R.idx ? '👉' : '⏳'} ${esc(e.nombre)}</div>
      <div class="jugs">${res.map(x => x ? '💚' : '💔').join(' ') || 'Sin jugar aún'}</div></div>
      ${res.length ? `<div class="pts">+${fmtPts(pts)}</div>` : ''}</div>`;
  }).join('');
  let centro;
  if (!R.actual) {
    centro = `<div class="card" style="text-align:center">
        <h2>Turno de ${esc(eq.nombre)}</h2>
        <p class="muted">Pregunta ${R.sub + 1} de 2 · sobre <b>${esc(R.sub === 0 ? eq.j1 : eq.j2)}</b></p>
        <button type="button" class="btn" data-act="r4-sacar">🎲 Sacar pregunta</button></div>`;
  } else {
    centro = `<div class="pregunta-conexion">${esc(R.actual.texto)}</div>
      <div class="notas-hint">✍️ Los dos escriben la respuesta en secreto (en una nota)… ¡y la comparan a la vez!</div>
      <div class="botones-juicio">
        <button type="button" class="btn-juicio ko" data-act="r4-no">💔<small>NO COINCIDEN</small></button>
        <button type="button" class="btn-juicio ok" data-act="r4-si">💚<small>¡COINCIDEN!</small></button>
      </div>`;
  }
  return `<div class="card"><h2>💞 Ronda 4 · Conexión Perfecta</h2>
    <p class="muted">2 preguntas por equipo. Si ambos escriben lo mismo: <b>+${fmtPts(S.config.ptsR4)} pt</b>.
    Al terminar se proclama el equipo ganador del concurso.</p></div>
    ${centro}<div class="card"><h3>Progreso</h3>${progreso}</div>`;
}
function r4Avanzar(coinciden) {
  const R = S.r4, eq = S.equipos[R.idx];
  (R.resultados[R.idx] = R.resultados[R.idx] || []).push(coinciden);
  if (coinciden) eq.puntos = Math.round((eq.puntos + S.config.ptsR4) * 10) / 10;
  R.actual = null; R.sub++;
  if (R.sub >= 2) { R.sub = 0; R.idx++; }
  if (R.idx >= S.equipos.length) { r4Final(); return; }
  push('', true); render();
}
function r4Final() {
  const ord = equiposOrdenados(), max = ord[0].puntos;
  const lideres = S.equipos.map((e, i) => i).filter(i => S.equipos[i].puntos === max);
  S.fase = 'podio';
  if (lideres.length === 1) {
    S.ganadorIdx = lideres[0];
    push(`🏆 ¡${ord[0].nombre} gana El Grand Lemonprix con ${fmtPts(max)} puntos!`, true);
  } else {
    S.empateIdxs = lideres;
    push(`⚡ ¡Empate a ${fmtPts(max)} puntos! Hay que desempatar…`, true);
  }
  render();
}

/* ---------- PODIO ---------- */
function screenPodio() {
  const ord = equiposOrdenados();
  const bloque = (e, cls, emoji) => e ? `<div class="cajon ${cls}">
    <div class="emoji">${emoji}</div>${esc(e.nombre)}<div class="muted">${fmtPts(e.puntos)} pts</div></div>` : '';
  let extra = '';
  if (S.empateIdxs) {
    extra = `<div class="card"><h3>⚡ Desempate</h3>
      <p class="muted">Hay empate en lo más alto. Como presentador, elige al equipo ganador del concurso:</p>
      ${S.empateIdxs.map(i => `<button type="button" class="btn sec" data-act="podio-elegir" data-arg="${i}">
        👑 ${esc(S.equipos[i].nombre)}</button>`).join('')}</div>`;
  } else if (S.ganadorIdx !== null) {
    extra = `<button type="button" class="btn verde" data-act="ir-r5">👑 Ir al Duelo Final ➜</button>`;
  }
  return `<div class="card" style="text-align:center">
      <h2>🏆 Clasificación final del concurso</h2>
      <div class="podio-movil">${bloque(ord[1], 'c2', '🥈')}${bloque(ord[0], 'c1', '🥇')}${bloque(ord[2], 'c3', '🥉')}</div>
      ${S.ganadorIdx !== null ? `<h3>🍋 Ganador del concurso: ${esc(S.equipos[S.ganadorIdx].nombre)}</h3>` : ''}
    </div>${extra}`;
}

/* ---------- RONDA 5 · EL DUELO FINAL ---------- */
function nombresDuelo() {
  const g = S.equipos[S.ganadorIdx];
  return { A: g.j1, B: g.j2 };
}
function screenR5() {
  const R = S.r5, n = nombresDuelo();
  const limones = f => '🍋'.repeat(3 - f) + '💥'.repeat(f);
  const vs = `<div class="vs">
    <div class="jugador ${R.turno === 'A' && !R.ganador ? 'turno' : ''}"><b>${esc(n.A)}</b>
      <div class="fallos">${limones(R.fallos.A)}</div><small class="muted">${R.fallos.A}/3 fallos</small></div>
    <div class="jugador ${R.turno === 'B' && !R.ganador ? 'turno' : ''}"><b>${esc(n.B)}</b>
      <div class="fallos">${limones(R.fallos.B)}</div><small class="muted">${R.fallos.B}/3 fallos</small></div>
  </div>`;
  let centro;
  if (R.pregunta) {
    centro = `<div class="card"><div class="resumen-ronda">${esc(R.categoria)} · turno de <b>${esc(n[R.turno])}</b></div>
      <div class="pregunta-card"><div class="pregunta">${esc(R.pregunta[0])}</div>
      <div class="respuesta">💡 ${esc(R.pregunta[1])}</div></div>
      <div class="botones-juicio">
        <button type="button" class="btn-juicio ko" data-act="r5-fallo">✖<small>FALLA</small></button>
        <button type="button" class="btn-juicio ok" data-act="r5-acierto">✔<small>ACIERTA</small></button>
      </div></div>`;
  } else {
    const cats = Object.keys(BANCO_DUELO).map(c =>
      `<button type="button" class="cat-btn" data-act="r5-cat" data-arg="${esc(c)}">${esc(c)}</button>`).join('');
    centro = `<div class="card"><h3>Elige la temática de la pregunta</h3>
      <p class="muted">Turno de <b>${esc(n[R.turno])}</b></p>
      <div class="categorias">${cats}</div></div>`;
  }
  return `<div class="card"><h2>⚔️ Ronda 5 · El Duelo Final</h2>
    <p class="muted"><b>${esc(n.A)}</b> y <b>${esc(n.B)}</b> compiten entre ellos.
    Quien falle <b>3 preguntas</b> pierde. El ganador se lleva el <b>premio sorpresa</b> 🎁</p></div>
    ${vs}${centro}`;
}

/* ---------- FIN ---------- */
function screenFin() {
  const n = nombresDuelo(), gan = S.r5.ganador ? n[S.r5.ganador] : '—';
  return `<div class="card" style="text-align:center">
    <div style="font-size:4rem">👑🍋</div>
    <h2>¡${esc(gan)} se lleva el premio sorpresa!</h2>
    <p class="muted">Y <b>${esc(S.equipos[S.ganadorIdx].nombre)}</b> se proclama ganador de El Grand Lemonprix.</p>
    <button type="button" class="btn sec" data-act="nav" data-arg="marcador">🏆 Ver marcador final</button>
  </div>`;
}

/* ---------- Marcador y ajustes ---------- */
function screenMarcador() {
  const ord = equiposOrdenados();
  const filas = ord.map((e, k) => `<div class="equipo-item ${k === 0 ? 'hecho' : ''}">
    <div class="medalla">${k === 0 ? '🥇' : k === 1 ? '🥈' : k === 2 ? '🥉' : (k + 1) + 'º'}</div>
    <div class="info"><div class="nombre">${esc(e.nombre)}</div>
      <div class="jugs">${esc(e.j1)} y ${esc(e.j2)}</div></div>
    <div class="pts">${fmtPts(e.puntos)} pts</div></div>`).join('');
  return `<div class="card"><h2>🏆 Marcador</h2>
    ${S.ultimoEvento ? `<p class="resumen-ronda">Último: ${esc(S.ultimoEvento)}</p>` : ''}
    ${filas || '<p class="muted">Aún no hay equipos registrados.</p>'}</div>`;
}
function screenAjustes() {
  const c = S.config;
  return `<div class="card"><h2>☁️ Sincronización con Google Sheets</h2>
    <p class="muted">Pega aquí la <b>URL de la aplicación web</b> de tu Apps Script
    (ver instrucciones en el README). Sin ella, la app funciona en modo local.</p>
    <label class="campo">URL del script
      <input type="url" id="gas-url" value="${esc(gasUrl())}" placeholder="https://script.google.com/macros/s/AKfycbxY7omtcBVZbJT271WWnUsZOZuMe10mHRver775MhzCvihWwDIw99nRCG5dmhnGOamc/exec"></label>
    <div class="fila">
      <button type="button" class="btn verde" data-act="aj-guardar-url">💾 Guardar URL</button>
      <button type="button" class="btn sec" data-act="aj-probar">📡 Probar conexión</button>
    </div></div>
  <div class="card"><h2>🎯 Puntuación y tiempos</h2>
    <div class="fila">
      <label class="campo">Puntos por acierto (R1)<input type="text" inputmode="decimal" id="cfg-r1" value="${c.ptsR1}"></label>
      <label class="campo">Puntos por prueba (R2)<input type="text" inputmode="decimal" id="cfg-r2" value="${c.ptsR2}"></label>
    </div>
    <label class="campo">Puntos por posición (R3, separados por comas)
      <input type="text" id="cfg-r3" value="${c.ptsR3.join(',')}"></label>
    <div class="fila">
      <label class="campo">Puntos por coincidencia (R4)<input type="text" inputmode="decimal" id="cfg-r4" value="${c.ptsR4}"></label>
      <label class="campo">Segundos R1 / R2<input type="text" id="cfg-dur" value="${c.durR1},${c.durR2}"></label>
    </div>
    <button type="button" class="btn verde" data-act="aj-guardar-cfg">💾 Guardar ajustes</button></div>
  <div class="card"><h2>🧹 Zona de control</h2>
    <button type="button" class="btn sec" data-act="aj-reiniciar">🔄 Nuevo concurso (mantiene equipos)</button>
    <button type="button" class="btn rojo" data-act="aj-borrar">🗑️ Borrar todo y empezar de cero</button>
    <button type="button" class="btn-ghost" data-act="vista-panel">🖥️ Ver versión para pantalla / PC</button></div>`;
}

/* ============================================================
   ACCIONES (delegación de clics)
   ============================================================ */
const ACTIONS = {
  'nav': p => { UI.pantalla = p; render(); },
  'vista-panel': () => cambiarVista('panel'),

  /* ----- setup ----- */
  'setup-add': () => { leerFormSetup(); S.equipos.push({ nombre: '', j1: '', j2: '', puntos: 0 }); push(); render(); },
  'setup-del': i => { leerFormSetup(); S.equipos.splice(+i, 1); push(); render(); },
  'setup-empezar': () => {
    leerFormSetup();
    const ok = S.equipos.filter(e => e.nombre && e.j1 && e.j2);
    if (S.equipos.length < 2) { toast('Necesitas al menos 2 equipos'); return; }
    if (ok.length !== S.equipos.length) { toast('Rellena nombre y los dos jugadores de cada equipo'); return; }
    S.equipos.forEach(e => e.puntos = 0);
    S.fase = 'r1';
    push(`🍋 ¡Comienza El Grand Lemonprix con ${S.equipos.length} equipos!`, true);
    render();
  },

  /* ----- ronda 1 ----- */
  'r1-jugar': i => {
    i = +i;
    const disponibles = BANCO_ALUVION.map((_, k) => k).filter(k => !S.r1.usadas.includes(k));
    if (!disponibles.length) { toast('¡Se acabaron las preguntas del banco!'); return; }
    const claves = shuffle(disponibles);
    r1Run = { equipoIdx: i, claves, cola: claves.map(k => BANCO_ALUVION[k]),
              pos: 0, aciertos: 0, fallos: 0 };
    S.r1.idx = i;
    iniciarTemporizador(S.config.durR1, 'El Aluvión', r1Fin);
    push(`🌊 El Aluvión: turno de ${S.equipos[i].nombre}… ¡${S.config.durR1} segundos!`, true);
    render();
  },
  'r1-acierto': () => {
    if (!r1Run) return;
    S.r1.usadas.push(r1Run.claves[r1Run.pos]);
    r1Run.aciertos++; r1Run.pos++;
    if (r1Run.pos >= r1Run.cola.length) { r1Fin(); return; }
    render();
  },
  'r1-fallo': () => {
    if (!r1Run) return;
    S.r1.usadas.push(r1Run.claves[r1Run.pos]);
    r1Run.fallos++; r1Run.pos++;
    if (r1Run.pos >= r1Run.cola.length) { r1Fin(); return; }
    render();
  },
  'r1-terminar': () => { if (r1Run && confirm('¿Terminar el turno de este equipo ya?')) r1Fin(); },
  'ir-r2': () => { S.fase = 'r2'; push('🔢🔤 Comienza Cifras y Letras', true); render(); },

  /* ----- ronda 2 ----- */
  'r2-generar': () => {
    if (S.r2.estado === 'jugando') return;
    const tipo = S.r2.tipos[S.r2.sub];
    if (tipo === 'cifras') {
      const { numeros, objetivo } = generarCifras();
      const sol = resolverCifras(numeros, objetivo);
      S.r2.actual = { tipo, numeros, objetivo, solucion: sol.expr };
    } else {
      S.r2.actual = { tipo, letras: generarLetras() };
    }
    S.r2.estado = 'pre'; push('', true); render();
  },
  'r2-empezar': () => {
    S.r2.estado = 'jugando';
    iniciarTemporizador(S.config.durR2, 'Cifras y Letras', r2FinTimer);
    push(`⏱️ Cifras y Letras (${S.r2.sub + 1}/4): ¡${S.config.durR2} segundos en marcha!`, true);
    render();
  },
  'r2-guardar': () => {
    const ganadores = $$('input[name=ganR2]:checked').map(x => +x.value);
    const tipo = S.r2.tipos[S.r2.sub];
    S.r2.resultados.push({ tipo, ganadores, pts: S.config.ptsR2 });
    ganadores.forEach(i => S.equipos[i].puntos = Math.round((S.equipos[i].puntos + S.config.ptsR2) * 10) / 10);
    const nombres = ganadores.map(i => S.equipos[i].nombre).join(' y ');
    const ev = ganadores.length
      ? `${tipo === 'cifras' ? '🔢' : '🔤'} Prueba ${S.r2.sub + 1}: mejor marca de ${nombres} (+${fmtPts(S.config.ptsR2)} pts)`
      : `${tipo === 'cifras' ? '🔢' : '🔤'} Prueba ${S.r2.sub + 1}: nadie puntuó`;
    S.r2.sub++; S.r2.actual = null; S.r2.estado = 'pre';
    push(ev, true); render(); toast('Guardado ✔');
  },
  'ir-r3': () => { S.fase = 'r3'; push('💰 Comienza El Precio Exacto', true); render(); },

  /* ----- ronda 3 ----- */
  'r3-elegir': () => {
    if (S.r3.usadas.length >= S.r3.total) {
      S.fase = 'r4';
      push('💞 Comienza Conexión Perfecta', true); render();
      return;
    }
    const producto = elegirProductoR3();
    if (!producto) {
      S.fase = 'r4';
      push('💞 Comienza Conexión Perfecta', true); render();
      return;
    }
    S.r3.producto = producto;
    S.r3.resuelto = false; S.r3.filas = null;
    push(`💰 El Precio Exacto: producto ${S.r3.usadas.length}/${S.r3.total} · ¿cuánto cuesta?`, true); render();
  },
  'r3-calcular': () => {
    const est = S.equipos.map((_, i) => parseEuro($('#est-' + i)?.value));
    if (est.some(v => v === null)) { toast('Escribe la estimación de todos los equipos'); return; }
    const precio = S.r3.producto.precio, cfg = S.config.ptsR3;
    const filas = est.map((v, i) => ({ i, est: v, dist: Math.round(Math.abs(v - precio) * 100) / 100 }));
    const dists = [...new Set(filas.map(f => f.dist))].sort((a, b) => a - b);
    filas.forEach(f => {
      f.rank = dists.indexOf(f.dist) + 1;
      f.pts = cfg[f.rank - 1] ?? cfg[cfg.length - 1] ?? 0;
    });
    filas.sort((a, b) => a.dist - b.dist);
    filas.forEach(f => S.equipos[f.i].puntos = Math.round((S.equipos[f.i].puntos + f.pts) * 10) / 10);
    S.r3.filas = filas; S.r3.resuelto = true;
    const mejores = filas.filter(f => f.rank === 1).map(f => S.equipos[f.i].nombre).join(' y ');
    push(`💰 Precio real: ${eur(precio)}. Más cerca: ${mejores} (+${fmtPts(filas[0].pts)} pts)`, true);
    render(); toast('Puntuación guardada ✔');
  },
  'ir-r4': () => { S.fase = 'r4'; push('💞 Comienza Conexión Perfecta', true); render(); },

  /* ----- ronda 4 ----- */
  'r4-sacar': () => {
    const disp = BANCO_CONEXION.map((_, k) => k).filter(k => !S.r4.usadas.includes(k));
    if (!disp.length) { toast('¡No quedan tópicos! Añade más en data.js'); return; }
    const k = disp[Math.floor(Math.random() * disp.length)];
    S.r4.usadas.push(k);
    const eq = S.equipos[S.r4.idx];
    const jugador = S.r4.sub === 0 ? eq.j1 : eq.j2;
    S.r4.actual = { texto: BANCO_CONEXION[k].replace('{J}', jugador) };
    push(`💞 ${eq.nombre}: ¡a escribir en secreto!`, true); render();
  },
  'r4-si': () => r4Avanzar(true),
  'r4-no': () => r4Avanzar(false),

  /* ----- podio ----- */
  'podio-elegir': i => {
    S.ganadorIdx = +i; S.empateIdxs = null;
    push(`🏆 Tras el desempate, ¡${S.equipos[S.ganadorIdx].nombre} gana El Grand Lemonprix!`, true);
    render();
  },
  'ir-r5': () => {
    if (S.ganadorIdx === null) { toast('Primero hay que resolver el empate'); return; }
    S.fase = 'r5'; push('⚔️ ¡El Duelo Final comienza!', true); render();
  },

  /* ----- ronda 5 ----- */
  'r5-cat': cat => {
    const banco = BANCO_DUELO[cat] || [];
    const disp = banco.map((_, k) => k).filter(k => !S.r5.usadas.includes(cat + k));
    if (!disp.length) { toast('¡No quedan preguntas de esta temática!'); return; }
    const k = disp[Math.floor(Math.random() * disp.length)];
    S.r5.usadas.push(cat + k);
    S.r5.categoria = cat; S.r5.pregunta = banco[k];
    push(`⚔️ Duelo · ${cat}: pregunta en juego`, true); render();
  },
  'r5-acierto': () => { r5Resp(true); },
  'r5-fallo': () => { r5Resp(false); },

  /* ----- ajustes ----- */
  'aj-guardar-url': () => {
    const v = ($('#gas-url')?.value || '').trim();
    if (v) localStorage.setItem(GASKEY, v); else localStorage.removeItem(GASKEY);
    toast(v ? 'URL guardada. Sincronización activada ☁️' : 'URL borrada. Modo local.');
    push('', true); render();
  },
  'aj-probar': async () => {
    const v = ($('#gas-url')?.value || '').trim() || gasUrl();
    if (!v) { toast('Pega primero la URL del script'); return; }
    toast('Probando conexión…');
    try {
      const r = await fetch(v + (v.includes('?') ? '&' : '?') + 't=' + Date.now());
      await r.text();
      toast('✅ Conexión correcta con tu hoja de Google');
    } catch (e) { toast('❌ No se pudo conectar. Revisa la URL y el despliegue.'); }
  },
  'aj-guardar-cfg': () => {
    const num = (id, def) => { const n = parseEuro($(id)?.value); return n === null ? def : n; };
    const r3 = String($('#cfg-r3')?.value || '').split(',').map(s => parseEuro(s)).filter(n => n !== null);
    const dur = String($('#cfg-dur')?.value || '').split(',').map(s => parseEuro(s));
    S.config.ptsR1 = num('#cfg-r1', S.config.ptsR1);
    S.config.ptsR2 = num('#cfg-r2', S.config.ptsR2);
    if (r3.length) S.config.ptsR3 = r3;
    S.config.ptsR4 = num('#cfg-r4', S.config.ptsR4);
    if (dur[0]) S.config.durR1 = dur[0];
    if (dur[1]) S.config.durR2 = dur[1];
    push('⚙️ Ajustes actualizados', true); render(); toast('Ajustes guardados ✔');
  },
  'aj-reiniciar': () => {
    if (!confirm('¿Empezar un concurso nuevo? Se mantienen los equipos pero se ponen a cero las puntuaciones.')) return;
    const eq = S.equipos.map(e => ({ ...e, puntos: 0 }));
    const cfg = S.config, rev = S.rev;
    S = defaultState(); S.rev = rev; S.config = cfg; S.equipos = eq;
    S.fase = eq.length ? 'r1' : 'setup';
    r1Run = null; UI.pantalla = 'juego';
    push('🔄 ¡Nuevo concurso! Marcador a cero', true); render();
  },
  'aj-borrar': () => {
    if (!confirm('¿BORRAR TODO? Se eliminarán equipos, puntuaciones y ajustes de este navegador.')) return;
    const rev = S.rev;
    localStorage.removeItem(LKEY);
    S = defaultState(); S.rev = rev;
    r1Run = null; UI.pantalla = 'juego';
    push('🧹 Se ha borrado todo. Nuevo Lemonprix en preparación', true);
    render(); toast('Todo borrado');
  }
};
function r5Resp(acierto) {
  const R = S.r5, n = nombresDuelo();
  const t = R.turno, jug = n[t];
  if (!acierto) R.fallos[t]++;
  R.pregunta = null;
  if (R.fallos[t] >= 3) {
    R.ganador = t === 'A' ? 'B' : 'A';
    S.fase = 'fin';
    push(`👑 ${jug} acumula 3 fallos. ¡${n[R.ganador]} se lleva el premio sorpresa del Grand Lemonprix!`, true);
  } else {
    R.turno = t === 'A' ? 'B' : 'A';
    push(acierto ? `⚔️ ${jug} acierta` : `⚔️ ${jug} falla (${R.fallos[t]}/3)`, true);
  }
  render();
}

/* ============================================================
   VISTA PANEL — gran pantalla (solo lectura)
   ============================================================ */
function renderPanel() {
  const ord = equiposOrdenados();
  let escenario = '';
  switch (S.fase) {
    case 'setup': {
      escenario = `<div class="esc-emoji">🍋</div>
        <div class="esc-titulo">¡Bienvenidos a El Grand Lemonprix!</div>
        <div class="esc-sub">El presentador está registrando los equipos…</div>
        ${S.equipos.filter(e => e.nombre).length ? `<div style="margin-top:18px;width:100%;max-width:560px">
          ${S.equipos.filter(e => e.nombre).map(e => `<div class="fila-marca"><div class="eq">
            <b>${esc(e.nombre)}</b><small>${esc(e.j1)} y ${esc(e.j2)}</small></div></div>`).join('')}</div>` : ''}`;
      break;
    }
    case 'r1': {
      const jugando = S.timer && S.r1.idx !== null;
      const res = Object.entries(S.r1.resultados)
        .map(([i, r]) => `<tr><td>${esc(S.equipos[i].nombre)}</td><td>${r.aciertos}✔ ${r.fallos}✖</td><td class="pts">+${fmtPts(r.pts)}</td></tr>`).join('');
      escenario = `<div class="esc-titulo">🌊 El Aluvión</div>
        ${jugando ? `<div class="esc-sub">Turno de <b style="color:#fff">${esc(S.equipos[S.r1.idx].nombre)}</b></div>
          <div class="cuenta-atras" data-timerseg></div>
          <div class="timerbar-panel"><i data-timerbar></i></div>
          <div class="esc-sub" style="margin-top:10px">¡A responder como rayos! ⚡</div>`
        : `<div class="esc-emoji">🌊</div><div class="esc-sub">Preparando el siguiente turno…</div>`}
        ${res ? `<table class="tabla-p"><tr><th>Equipo</th><th>Resultado</th><th>Pts</th></tr>${res}</table>` : ''}`;
      break;
    }
    case 'r2': {
      const a = S.r2.actual;
      let centro = '';
      if (a) {
        centro = a.tipo === 'cifras'
          ? `<div class="fichas-panel">${a.numeros.map(n => `<span class="ficha-p">${n}</span>`).join('')}</div>
             <div class="objetivo-p">🎯 ${a.objetivo}</div>
             ${S.r2.estado === 'puntuar' ? `<div class="solucion-p">💡 Mejor solución: ${esc(a.solucion)}</div>` : ''}`
          : `<div class="fichas-panel">${a.letras.map(l => `<span class="ficha-p letra">${l}</span>`).join('')}</div>
             ${S.r2.estado === 'puntuar' ? `<div class="solucion-p">✍️ El presentador comprueba las palabras…</div>` : ''}`;
      } else {
        centro = `<div class="esc-emoji">🔢🔤</div><div class="esc-sub">Generando la prueba ${S.r2.sub + 1} de 4…</div>`;
      }
      escenario = `<div class="esc-titulo">${a && a.tipo === 'letras' ? '🔤 Letras' : '🔢 Cifras'} · Prueba ${Math.min(S.r2.sub + 1, 4)} de 4</div>
        ${centro}
        ${S.timer ? `<div class="cuenta-atras" data-timerseg></div><div class="timerbar-panel"><i data-timerbar></i></div>` : ''}`;
      break;
    }
    case 'r3': {
      const p = S.r3.producto;
      const ronda = Math.min(S.r3.usadas.length || 0, S.r3.total);
      if (!p) {
        escenario = `<div class="esc-emoji">💰</div><div class="esc-titulo">El Precio Exacto</div>
          <div class="esc-sub">Eligiendo producto ${ronda + 1} de ${S.r3.total}…</div>`;
      } else {
        const filas = S.r3.resuelto ? S.r3.filas.map(f => `<tr>
          <td>${f.rank === 1 ? '🥇' : f.rank === 2 ? '🥈' : f.rank === 3 ? '🥉' : f.rank + 'º'}</td>
          <td>${esc(S.equipos[f.i].nombre)}</td><td>${eur(f.est)}</td><td>${eur(f.dist)}</td>
          <td class="pts">+${fmtPts(f.pts)}</td></tr>`).join('') : '';
        escenario = `${p.img ? `<img src="${esc(p.img)}" alt="" style="max-height:34vh;border-radius:18px">`
                            : `<div class="esc-emoji">${p.emoji}</div>`}
          <div class="esc-nombre">${esc(p.nombre)}</div>
          <div class="esc-sub">Producto ${Math.min(S.r3.usadas.length, S.r3.total)}/${S.r3.total}</div>
          ${S.r3.resuelto
            ? `<div class="solucion-p">💰 Precio real: ${eur(p.precio)}</div>
               <table class="tabla-p"><tr><th></th><th>Equipo</th><th>Dijo</th><th>Diferencia</th><th>Pts</th></tr>${filas}</table>`
            : `<div class="esc-sub" style="margin-top:10px">🤔 Los equipos están dando su precio…</div>`}`;
      }
      break;
    }
    case 'r4': {
      const progreso = S.equipos.map((e, i) => {
        const res = S.r4.resultados[i] || [];
        return `<tr><td>${esc(e.nombre)}</td><td>${res.map(x => x ? '💚' : '💔').join(' ') || '—'}</td></tr>`;
      }).join('');
      escenario = `<div class="esc-titulo">💞 Conexión Perfecta</div>
        ${S.r4.actual
          ? `<div class="esc-sub">Turno de <b style="color:#fff">${esc(S.equipos[S.r4.idx].nombre)}</b></div>
             <div class="pregunta-p" style="margin-top:12px">${esc(S.r4.actual.texto)}</div>
             <div class="esc-sub" style="margin-top:14px">✍️ Escribidlo en secreto… ¡y comparad!</div>`
          : `<div class="esc-emoji">💞</div><div class="esc-sub">Preparando la siguiente pregunta…</div>`}
        <table class="tabla-p"><tr><th>Equipo</th><th>Conexiones</th></tr>${progreso}</table>`;
      break;
    }
    case 'podio': {
      const bloque = (e, cls, emoji) => e ? `<div class="cajon ${cls}">
        <div class="emoji">${emoji}</div><div class="eqn">${esc(e.nombre)}</div>
        <div class="pts">${fmtPts(e.puntos)} pts</div></div>` : '';
      escenario = `${confetti()}
        <div class="esc-titulo">${S.empateIdxs ? '⚡ ¡EMPATE EN LO MÁS ALTO!' : '🏆 ¡Tenemos ganador del concurso!'}</div>
        ${S.empateIdxs ? `<div class="esc-sub">El presentador decide el desempate entre:
          ${S.empateIdxs.map(i => esc(S.equipos[i].nombre)).join(' · ')}</div>` : ''}
        <div class="podio-p">${bloque(ord[1], 'c2', '🥈')}${bloque(ord[0], 'c1', '🥇')}${bloque(ord[2], 'c3', '🥉')}</div>`;
      break;
    }
    case 'r5': {
      const n = nombresDuelo(), R = S.r5;
      const limones = f => '🍋'.repeat(3 - f) + '💥'.repeat(f);
      escenario = `<div class="esc-titulo">⚔️ El Duelo Final</div>
        <div class="esc-sub">Quien falle 3 preguntas, pierde. En juego: ¡el premio sorpresa! 🎁</div>
        <div class="vs-p">
          <div class="jugador-p ${R.turno === 'A' ? 'turno' : ''}"><b>${esc(n.A)}</b>
            <div class="fallos">${limones(R.fallos.A)}</div></div>
          <div class="jugador-p ${R.turno === 'B' ? 'turno' : ''}"><b>${esc(n.B)}</b>
            <div class="fallos">${limones(R.fallos.B)}</div></div>
        </div>
        ${R.pregunta ? `<div class="solucion-p">${esc(R.categoria)}</div>
          <div class="pregunta-p" style="margin-top:10px">${esc(R.pregunta[0])}</div>` : ''}`;
      break;
    }
    case 'fin': {
      const n = nombresDuelo(), gan = S.r5.ganador ? n[S.r5.ganador] : '';
      escenario = `${confetti()}
        <div class="esc-emoji">👑🍋</div>
        <div class="esc-titulo">¡${esc(gan)} se lleva el premio sorpresa!</div>
        <div class="esc-sub">Y <b style="color:var(--limon)">${esc(S.equipos[S.ganadorIdx].nombre)}</b>
          gana El Grand Lemonprix con ${fmtPts(S.equipos[S.ganadorIdx].puntos)} puntos</div>`;
      break;
    }
  }
  $('#app').innerHTML = `<div class="panel-wrap">
    <header class="panel-header">
      <div class="logo">🍋 EL GRAND <span>LEMONPRIX</span></div>
      <div class="fase-tag">${esc(NOMBRE_FASE[S.fase])}</div>
    </header>
    <main class="panel-main">
      <section class="panel-escenario">${escenario}</section>
      <aside class="panel-marcador"><h2>🏆 MARCADOR</h2>
        ${ord.map((e, k) => `<div class="fila-marca ${k === 0 && e.puntos > 0 ? 'lider' : ''}">
          <div class="pos">${k === 0 ? '🥇' : k === 1 ? '🥈' : k === 2 ? '🥉' : (k + 1) + 'º'}</div>
          <div class="eq"><b>${esc(e.nombre)}</b><small>${esc(e.j1)} y ${esc(e.j2)}</small></div>
          <div class="pts">${fmtPts(e.puntos)}</div></div>`).join('') ||
          '<div class="esc-sub">Esperando equipos…</div>'}
      </aside>
    </main>
    <footer class="panel-footer">${esc(S.ultimoEvento || 'El concurso más cítrico de la historia 🍋')}
      ${gasUrl() ? '' : '<div class="sync-aviso">⚠️ Sin URL de sincronización configurada: esta pantalla no recibirá los datos del móvil.</div>'}
    </footer>
  </div>`;
}
function confetti() {
  let out = '<div class="confetti">';
  for (let i = 0; i < 28; i++) {
    out += `<span style="left:${Math.random() * 100}%;animation-duration:${3 + Math.random() * 4}s;animation-delay:${Math.random() * 3}s">${Math.random() < .5 ? '🍋' : '🎉'}</span>`;
  }
  return out + '</div>';
}

/* ============================================================
   ARRANQUE
   ============================================================ */
$('#app').addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el.dataset.arg, el, e);
});
render();
if (VISTA === 'panel') {
  pull();
  setInterval(pull, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
} else {
  pull().then(aplicado => { if (!aplicado && gasUrl()) push('', true); render(); });
}

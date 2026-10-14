import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, TRIP_ID } from "./firebase-config.js?v=5";

const root = document.getElementById("root");
const CONFIGURED = firebaseConfig.apiKey && firebaseConfig.apiKey !== "PEGAR_AQUI";

// ---------- Utilidades ----------
const CURS = ["USD", "ARS"];
const CUR_NAME = { USD: "Dólares", ARS: "Pesos" };
const KIND_LABEL = { cuota: "Cuota agencia", aereo: "Aéreos Smiles", gasto: "Gasto allá", transfer: "Transferencia" };
const DEFAULT_DATE = "2027-08-07";
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_L = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const SVG = (d, extra) => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + '>' + d + '</svg>';
const ICON = {
  cuota: SVG('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>'),
  aereo: SVG('<path d="M2 16l20-6-3-2-6 2-5-6H6l3 7-4 1-2-2H2l1 4z"/><path d="M3 21h18"/>'),
  gasto: SVG('<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
  transfer: SVG('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'),
  wand: SVG('<path d="M4 20L14 10"/><path d="M16 3l1 2.5 2.5 1-2.5 1L16 10l-1-2.5-2.5-1 2.5-1z" fill="currentColor"/>', ' stroke-width="2.4"'),
  home: SVG('<path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z"/>'),
  list: SVG('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  close: SVG('<path d="M6 6l12 12M18 6L6 18"/>')
};
const uid = p => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const r2 = n => (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * 100 + 1e-7) / 100;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function money(n, cur, dec) {
  const v = Math.abs(+n) < 0.005 ? 0 : +n, d = dec === 0 ? 0 : 2;
  return (cur === "ARS" ? "$ " : "US$ ") + new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}
function today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function parseDate(s) { const a = String(s || "").split("-").map(Number); return a.length === 3 && a[0] ? new Date(a[0], a[1] - 1, a[2]) : null; }
function dayLabel(d) {
  if (!d) return "Sin fecha"; if (d === today()) return "Hoy";
  const a = d.split("-"); return a.length === 3 ? (+a[2]) + " " + MESES[+a[1] - 1] + " " + a[0] : d;
}
function shortDate(d) { const a = String(d || "").split("-"); return a.length === 3 ? (+a[2]) + " " + MESES[+a[1] - 1] : ""; }
const ls = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

// ---------- Estado de la pantalla ----------
let auth, db, user = null, unsubTrip = null, unsubEntries = null;
let trip = null, tripLoaded = false, entries = [], entriesLoaded = false;
let tab = ls.get("tab2", "inicio"), filter = ls.get("filter", "todo"), sheet = null, confirmPerson = null;
let authView = "login", authMsg = "", authErr = "", busy = false, toast = "";
if (["inicio", "pagos", "saldos", "ajustes"].indexOf(tab) < 0) tab = "inicio";

// ---------- Firebase ----------
if (CONFIGURED) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = initializeFirestore(app, {});
  }
  onAuthStateChanged(auth, u => {
    user = u; stopListening();
    if (u && u.emailVerified && allowed(u.email)) startListening();
    render();
  });
} else {
  render();
}
function allowed(email) { return ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(String(email || "").toLowerCase()); }
const tripRef = () => doc(db, "trips", TRIP_ID);
const entriesCol = () => collection(db, "trips", TRIP_ID, "entries");

function startListening() {
  tripLoaded = false; entriesLoaded = false;
  unsubTrip = onSnapshot(tripRef(), snap => {
    trip = snap.exists() ? snap.data() : null; tripLoaded = true; render();
  }, err => { authErr = permMsg(err); tripLoaded = true; render(); });
  unsubEntries = onSnapshot(entriesCol(), snap => {
    entries = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); entriesLoaded = true; render();
  }, err => { authErr = permMsg(err); entriesLoaded = true; render(); });
}
function stopListening() {
  if (unsubTrip) unsubTrip(); if (unsubEntries) unsubEntries();
  unsubTrip = unsubEntries = null; trip = null; entries = []; tripLoaded = entriesLoaded = false;
}
function permMsg(err) {
  return err && err.code === "permission-denied"
    ? "Esta cuenta no tiene permiso para ver el viaje. Revisá que las reglas de Firestore estén publicadas."
    : "No se pudo conectar con la base de datos. Probá de nuevo en un rato.";
}
function authError(e) {
  const c = e && e.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "El mail o la contraseña no coinciden.";
  if (c.includes("email-already-in-use")) return "Ese mail ya tiene cuenta. Ingresá con tu contraseña o usá \"Olvidé mi contraseña\".";
  if (c.includes("weak-password")) return "La contraseña tiene que tener al menos 6 caracteres.";
  if (c.includes("invalid-email")) return "Ese mail no parece válido.";
  if (c.includes("too-many-requests")) return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
  if (c.includes("network")) return "Sin conexión. Revisá internet y probá de nuevo.";
  return "Algo salió mal (" + c + "). Probá de nuevo.";
}
function fail(e) { toast = "No se pudo guardar: " + (e && e.code === "permission-denied" ? "sin permiso." : "probá de nuevo."); render(); }

// ---------- Cálculos (por moneda) ----------
function people() { return (trip && trip.people) || []; }
function person(id) { return people().find(p => p.id === id) || null; }
function pname(id) { const p = person(id); return p ? p.name : "(borrado)"; }
function totals() { return Object.assign({ USD: 0, ARS: 0 }, (trip && trip.totals) || {}); }
function splitOf(e) {
  const all = people().map(p => p.id);
  const ids = (e.split && e.split.length ? e.split : all).filter(id => !!person(id));
  return ids.length ? ids : all;
}
function agencyCurs() { const t = totals(); return CURS.filter(c => (+t[c] || 0) > 0 || entries.some(e => e.cur === c && e.kind === "cuota")); }
function compute() { const R = {}; CURS.forEach(c => R[c] = computeCur(c)); return R; }
function computeCur(cur) {
  const paid = {}, owed = {}, aporte = {}; let cuotaTotal = 0, gastoTotal = 0, aereoTotal = 0;
  people().forEach(p => { paid[p.id] = 0; owed[p.id] = 0; aporte[p.id] = 0; });
  entries.forEach(e => {
    if ((e.cur || "USD") !== cur) return;
    const a = +e.amount || 0;
    if (e.kind === "cuota" || e.kind === "gasto" || e.kind === "aereo") {
      if (e.kind === "cuota") { cuotaTotal += a; if (e.from in aporte) aporte[e.from] += a; }
      else if (e.kind === "aereo") aereoTotal += a; else gastoTotal += a;
      if (e.from in paid) paid[e.from] += a;
      const ids = splitOf(e), part = a / ids.length;
      ids.forEach(id => { owed[id] += part; });
    } else if (e.kind === "transfer") {
      if (e.from in paid) { paid[e.from] += a; aporte[e.from] += a; }
      if (e.to in paid) { paid[e.to] -= a; aporte[e.to] -= a; }
    }
  });
  const n = Math.max(1, people().length), total = +totals()[cur] || 0, toca = total / n;
  const ppl = people().map(p => ({
    p, balance: r2(paid[p.id] - owed[p.id]), owed: owed[p.id], aporte: aporte[p.id], toca,
    falta: Math.max(0, r2(toca - aporte[p.id]))
  }));
  const cred = [], debt = [];
  ppl.forEach(x => { if (x.balance > 0.005) cred.push({ id: x.p.id, v: x.balance }); else if (x.balance < -0.005) debt.push({ id: x.p.id, v: -x.balance }); });
  cred.sort((a, b) => b.v - a.v); debt.sort((a, b) => b.v - a.v);
  const settle = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const m = r2(Math.min(debt[i].v, cred[j].v));
    if (m > 0.005) settle.push({ from: debt[i].id, to: cred[j].id, amount: m, cur });
    debt[i].v = r2(debt[i].v - m); cred[j].v = r2(cred[j].v - m);
    if (debt[i].v <= 0.005) i++; if (cred[j].v <= 0.005) j++;
  }
  return { cur, total, cuotaTotal, gastoTotal, aereoTotal, left: Math.max(0, r2(total - cuotaTotal)), people: ppl, settle };
}
function allSettles(R) { const out = []; CURS.forEach(c => R[c].settle.forEach((s, k) => out.push({ s, k }))); return out; }
function tripDate() { return (trip && trip.date) || DEFAULT_DATE; }
function daysLeft() {
  const t = parseDate(tripDate()), n = parseDate(today());
  return t && n ? Math.round((t - n) / 86400000) : null;
}
function longDate(s) { const d = parseDate(s); return d ? DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES_L[d.getMonth()] + " de " + d.getFullYear() : ""; }
function myName() {
  const email = String(user && user.email || "").toLowerCase(), idx = ALLOWED_EMAILS.map(e => e.toLowerCase()).indexOf(email);
  const p = people()[idx]; return p ? p.name : "";
}

// ---------- Decoración ----------
const DECOR = '<svg class="decor" aria-hidden="true" viewBox="0 0 390 112" preserveAspectRatio="xMidYMin meet">'
  + '<path d="M0 14 Q 48 32 97 14 T 195 14 T 292 14 T 390 14" fill="none" stroke="#13254D" stroke-width="1" opacity="0.3"/>'
  + '<path d="M14 18 l10 0 -5 12z" fill="#FF6B57"/><path d="M44 26 l10 -1 -4 12z" fill="#FFC93C"/><path d="M74 23 l10 -2 -3 12z" fill="#3CC4A0"/>'
  + '<path d="M108 18 l10 1 -6 11z" fill="#6E8BFF"/><path d="M140 24 l10 0 -5 12z" fill="#FF6B57"/><path d="M172 22 l10 -2 -4 12z" fill="#FFC93C"/>'
  + '<path d="M206 17 l10 1 -5 12z" fill="#3CC4A0"/><path d="M238 24 l10 0 -5 12z" fill="#6E8BFF"/><path d="M270 22 l10 -2 -4 12z" fill="#FF6B57"/>'
  + '<path d="M302 17 l10 1 -5 12z" fill="#FFC93C"/><path d="M334 24 l10 0 -5 12z" fill="#3CC4A0"/><path d="M364 21 l10 -1 -4 12z" fill="#6E8BFF"/>'
  + '<g class="float1"><path d="M340 44 C 323 44 317 61 323 73 C 327 82 335 87 340 91 C 345 87 353 82 357 73 C 363 61 357 44 340 44z" fill="#FF6B57"/>'
  + '<path d="M340 44 C 334 52 332 76 340 91 C 348 76 346 52 340 44z" fill="#FFC93C"/><path d="M335.5 93 h9 v6 h-9z" fill="#8A5A2B"/></g>'
  + '<g class="float2"><path d="M290 58 C 280 58 276 68 280 76 C 283 81 287 84 290 87 C 293 84 297 81 300 76 C 304 68 300 58 290 58z" fill="#3CC4A0"/>'
  + '<path d="M290 58 C 286 63 285 78 290 87 C 295 78 294 63 290 58z" fill="#FFFFFF" opacity="0.7"/><path d="M287 89 h6 v4 h-6z" fill="#8A5A2B"/></g>'
  + '<g stroke="#FF6B57" stroke-width="1.5" stroke-linecap="round"><path d="M236 70 L236 60"/><path d="M236 70 L245 65"/><path d="M236 70 L246 72"/><path d="M236 70 L243 79"/><path d="M236 70 L229 79"/><path d="M236 70 L226 70"/><path d="M236 70 L228 63"/></g>'
  + '<g fill="#FFC93C"><path d="M262 92 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M200 50 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z"/><path d="M372 88 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4z"/></g></svg>';

// ---------- Pantallas de acceso ----------
function authShell(inner) {
  return '<div class="screen auth has-decor">' + DECOR + '<div class="auth-head"><span class="hello">¡Bienvenidos!</span><h1 class="title">Cuentas del<br>Viaje</h1></div>' + inner + '</div>';
}
function renderAuth() {
  if (!CONFIGURED) return authShell('<div class="card"><p>Falta pegar la configuración de Firebase en <strong>firebase-config.js</strong>.</p></div>');
  let h = '<div class="card form">';
  if (user && !allowed(user.email)) {
    h += '<p><strong>' + esc(user.email) + '</strong> no está habilitado para este viaje.</p><p class="note">Solo pueden entrar las dos cuentas del viaje.</p>'
      + '<button class="btn" data-act="logout">Salir</button>';
  } else if (user && !user.emailVerified) {
    h += '<p>Te mandamos un mail a <strong>' + esc(user.email) + '</strong> para confirmar tu cuenta.</p>'
      + '<p class="note">Abrí el link del mail (fijate también en Correo no deseado) y después tocá el botón de abajo.</p>'
      + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : '') + (authMsg ? '<p class="ok">' + esc(authMsg) + '</p>' : '')
      + '<button class="btn" data-act="verified"' + (busy ? ' disabled' : '') + '>Ya confirmé mi mail</button>'
      + '<button class="btn-ghost" data-act="resend">Reenviar el mail</button>'
      + '<button class="linkish" data-act="logout">Usar otra cuenta</button>';
  } else {
    const reg = authView === "register", reset = authView === "reset";
    h += '<form class="stack" data-form="' + (reset ? "reset" : reg ? "register" : "login") + '">'
      + '<h2>' + (reset ? "Recuperar contraseña" : reg ? "Crear mi cuenta" : "Ingresar") + '</h2>'
      + '<label>Mail<input id="au-email" name="email" type="email" autocomplete="email" required value="' + esc(ls.get("lastEmail", "")) + '"></label>'
      + (reset ? '' : '<label>Contraseña<input id="au-pass" name="pass" type="password" minlength="6" autocomplete="' + (reg ? "new-password" : "current-password") + '" required></label>')
      + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : '') + (authMsg ? '<p class="ok">' + esc(authMsg) + '</p>' : '')
      + '<button class="btn" type="submit"' + (busy ? ' disabled' : '') + '>' + (reset ? "Mandarme el mail" : reg ? "Crear cuenta" : "Ingresar") + '</button></form>';
    if (!reg && !reset) h += '<button class="linkish" data-act="view" data-view="register">Es mi primera vez: crear mi cuenta</button><button class="linkish" data-act="view" data-view="reset">Olvidé mi contraseña</button>';
    else h += '<button class="linkish" data-act="view" data-view="login">Volver a ingresar</button>';
  }
  return authShell(h + '</div>');
}

function renderSetup() {
  return authShell('<div class="card form"><h2>Primer uso</h2><p>Todavía no hay un viaje guardado. Podés empezar de cero o traer lo que cargaste en la versión anterior.</p>'
    + '<button class="btn" data-act="setup-new">Empezar de cero</button></div>'
    + '<div class="card form"><label>Pegá acá el código de la versión anterior<textarea id="imp-text" placeholder="{&quot;tripName&quot;: …}"></textarea></label>'
    + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : '')
    + '<button class="btn-ghost" data-act="import">Importar datos</button></div>'
    + '<p class="who">Conectado como ' + esc(user.email) + ' · <button class="linkish inline" data-act="logout">Salir</button></p>');
}

// ---------- Piezas ----------
function entryRow(e) {
  const sp = splitOf(e);
  const sub = e.kind === "transfer"
    ? esc(pname(e.from)) + " le pasó a " + esc(pname(e.to))
    : "Pagó " + esc(pname(e.from)) + (sp.length < people().length ? " · para " + sp.map(pname).map(esc).join(", ") : "");
  const title = e.kind === "transfer" ? "Transferencia" : (e.title || KIND_LABEL[e.kind]);
  return '<button class="item" data-act="open" data-id="' + esc(e.id) + '"><span class="ico k-' + e.kind + '">' + (ICON[e.kind] || "") + '</span>'
    + '<span class="mid"><span class="t">' + esc(title) + '</span><span class="note">' + sub + (e.date ? ' · ' + shortDate(e.date) : '') + '</span></span>'
    + '<span class="amt">' + money(+e.amount, e.cur) + '</span></button>';
}
function sortEntries(list) { return list.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0)); }
function emptyCard(title, text) { return '<div class="card empty"><span class="spark" aria-hidden="true">✦</span><strong>' + title + '</strong><span>' + text + '</span></div>'; }
function ring(pct, label) {
  const deg = Math.max(0, Math.min(360, pct * 3.6)), shown = Math.max(deg, pct > 0 ? 6 : 0);
  return '<div class="ring" role="img" aria-label="' + Math.round(pct) + '% ' + label + '" style="background:conic-gradient(var(--coral) 0deg ' + shown + 'deg, var(--ring-bg) ' + shown + 'deg 360deg)">'
    + '<div class="ring-in"><span class="ring-n">' + Math.round(pct) + '%</span><span class="ring-l">pagado</span></div></div>';
}

// ---------- Inicio ----------
function renderInicio(R) {
  const days = daysLeft(), name = myName();
  let h = '<header class="head"><span class="hello">¡Hola' + (name ? ', ' + esc(name) : '') + '!</span><h1 class="title">' + esc(trip.tripName || "Nuestro viaje") + '</h1></header>';
  if (days != null) {
    h += days > 0
      ? '<div class="countdown"><span class="cd-n">' + days + '</span><span class="cd-t">' + (days === 1 ? "día" : "días") + ' para la magia<small>' + longDate(tripDate()) + '</small></span></div>'
      : '<div class="countdown"><span class="cd-n">✦</span><span class="cd-t">' + (days === 0 ? "¡Hoy empieza la magia!" : "¡A disfrutar del viaje!") + '<small>' + longDate(tripDate()) + '</small></span></div>';
  }
  const ac = agencyCurs();
  if (!ac.length) h += '<button class="card agency empty-agency" data-act="goto-settings"><strong>Cargá el costo total</strong><span class="note">Tocá acá para poner cuánto cuesta el viaje con la agencia.</span></button>';
  ac.forEach(c => {
    const C = R[c], pct = C.total > 0 ? Math.min(100, C.cuotaTotal / C.total * 100) : 0;
    h += '<div class="card agency">' + ring(pct, "pagado a la agencia") + '<div class="ag-txt">'
      + '<span class="eyebrow">Agencia · ' + (C.left > 0.005 ? 'falta' : 'listo') + (ac.length > 1 ? ' · ' + CUR_NAME[c].toLowerCase() : '') + '</span>'
      + '<span class="big">' + (C.left > 0.005 ? money(C.left, c, 0) : '¡Pagado!') + '</span>'
      + '<span class="note">' + money(C.cuotaTotal, c, 0) + ' de ' + money(C.total, c, 0) + (C.left > 0.005 && people().length ? ' · ' + money(C.left / people().length, c, 0) + ' c/u' : '') + '</span></div></div>';
  });
  // Aéreos y saldo
  const aCur = CURS.filter(c => R[c].aereoTotal > 0);
  const settles = allSettles(R);
  h += '<div class="tiles">'
    + '<button class="tile t-mint" data-act="filter-go" data-filter="aereo"><span class="ico k-aereo">' + ICON.aereo + '</span><span class="tl">Aéreos Smiles</span>'
    + (aCur.length ? aCur.map(c => '<span class="tv">' + money(R[c].aereoTotal, c, 0) + '</span>').join("") : '<span class="tv sm">Sin pagos</span>') + '</button>'
    + '<button class="tile t-coral" data-act="tab" data-tab="saldos"><span class="ico k-transfer-on">' + ICON.transfer + '</span>';
  if (settles.length) {
    const s = settles[0].s;
    h += '<span class="tl">' + esc(pname(s.from)) + ' le debe a ' + esc(pname(s.to)) + '</span><span class="tv">' + money(s.amount, s.cur, 0) + '</span>'
      + (settles.length > 1 ? '<span class="note">y ' + (settles.length - 1) + ' más</span>' : '');
  } else h += '<span class="tl">Saldos</span><span class="tv sm">¡Están a mano!</span>';
  h += '</button></div>';
  // Últimos pagos
  const last = sortEntries(entries).slice(0, 3);
  h += '<div class="sec-head"><h2>Últimos pagos</h2>' + (entries.length ? '<button class="linkish" data-act="filter-go" data-filter="todo">Ver todos</button>' : '') + '</div>';
  h += last.length ? '<div class="card list">' + last.map(entryRow).join("") + '</div>' : emptyCard("Todavía no hay pagos", 'Tocá "Añadir pago" cuando paguen una cuota, los aéreos o algo allá.');
  return h;
}

// ---------- Pagos ----------
const FILTERS = [["todo", "Todo"], ["cuota", "Agencia"], ["aereo", "Aéreos"], ["gasto", "Allá"], ["transfer", "Transferencias"]];
function renderPagos(R) {
  let h = '<header class="head"><h1 class="title sm">Pagos</h1></header>';
  h += '<div class="chips" role="group" aria-label="Filtrar">' + FILTERS.map(f => '<button class="chip" data-act="filter" data-filter="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + '</button>').join("") + '</div>';
  const kindTot = { cuota: "cuotaTotal", aereo: "aereoTotal", gasto: "gastoTotal" }[filter];
  if (kindTot) {
    const cs = CURS.filter(c => R[c][kindTot] > 0);
    if (cs.length) h += '<div class="card sums">' + cs.map(c => '<div class="sum"><span class="eyebrow">Total ' + FILTERS.find(f => f[0] === filter)[1].toLowerCase() + ' · ' + CUR_NAME[c].toLowerCase() + '</span><span class="big sm">' + money(R[c][kindTot], c) + '</span>'
      + (filter !== "cuota" ? '<span class="note">' + money(R[c][kindTot] / Math.max(1, people().length), c) + ' por persona</span>' : '') + '</div>').join("") + '</div>';
  }
  if (filter === "aereo") h += '<p class="note pad">Tasas e impuestos de los vuelos con Smiles. No se suman a lo pagado a la agencia, pero sí entran en los saldos.</p>';
  const list = sortEntries(filter === "todo" ? entries : entries.filter(e => e.kind === filter));
  if (!list.length) return h + emptyCard("No hay pagos acá", 'Tocá "Añadir pago" para cargar el primero.');
  h += '<div class="card list">'; let last = null;
  list.forEach(e => { if (e.date !== last) { h += '<div class="day">' + dayLabel(e.date) + '</div>'; last = e.date; } h += entryRow(e); });
  return h + '</div>';
}

// ---------- Saldos ----------
function renderSaldos(R) {
  let h = '<header class="head"><h1 class="title sm">Saldos</h1></header>';
  const settles = allSettles(R);
  h += '<div class="sec-head"><h2>Quién le debe a quién</h2></div>';
  if (!settles.length) h += emptyCard("¡Están a mano!", "Nadie le debe nada a nadie.");
  else h += '<div class="card list">' + settles.map(o => {
    const s = o.s;
    return '<div class="debt"><span class="ico k-transfer-on">' + ICON.transfer + '</span><div class="mid"><span class="t">' + esc(pname(s.from)) + ' le debe a ' + esc(pname(s.to)) + '</span>'
      + '<button class="linkish left" data-act="settle" data-cur="' + s.cur + '" data-k="' + o.k + '">Marcar como saldado</button></div><span class="amt coral">' + money(s.amount, s.cur) + '</span></div>';
  }).join("") + '</div>';
  h += '<p class="note pad">Dólares y pesos se cuentan por separado: lo que se debe en pesos se devuelve en pesos y lo que se debe en dólares, en dólares.</p>';

  const ac = agencyCurs();
  if (ac.length && people().length) {
    h += '<div class="sec-head"><h2>Lo que aportó cada uno a la agencia</h2></div><div class="card list">';
    people().forEach(p => {
      h += '<div class="person"><strong>' + esc(p.name) + '</strong>';
      ac.forEach(c => {
        const x = R[c].people.find(y => y.p.id === p.id); if (!x) return;
        const pp = x.toca > 0 ? Math.min(100, Math.max(0, x.aporte) / x.toca * 100) : 0;
        h += '<div class="pbar"><div class="pbar-top"><span>' + money(x.aporte, c, 0) + ' de ' + money(x.toca, c, 0) + '</span><span class="note">' + (x.falta > 0.005 ? 'falta ' + money(x.falta, c, 0) : '¡completo!') + '</span></div>'
          + '<div class="bar"><i style="width:' + pp.toFixed(1) + '%"></i></div></div>';
      });
      h += '</div>';
    });
    h += '</div>';
  }
  const tl = sortEntries(entries.filter(e => e.kind === "transfer"));
  h += '<div class="sec-head"><h2>Transferencias</h2></div>';
  h += tl.length ? '<div class="card list">' + tl.map(entryRow).join("") + '</div>' : emptyCard("Sin transferencias", "Cuando uno le pase plata al otro para emparejar, queda acá.");
  return h;
}

// ---------- Ajustes ----------
function renderAjustes() {
  const t = totals();
  let h = '<header class="head"><h1 class="title sm">Ajustes</h1></header>';
  h += '<div class="card form"><h2>El viaje</h2>'
    + '<label>Nombre<input id="set-name" value="' + esc(trip.tripName || "") + '"></label>'
    + '<label>Fecha de salida<input id="set-date" type="date" value="' + esc(tripDate()) + '"></label></div>';
  h += '<div class="card form"><h2>Costo total con la agencia</h2>'
    + '<label>En dólares (US$)<input id="set-total-USD" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(t.USD || "") + '" placeholder="0"></label>'
    + '<label>En pesos ($)<input id="set-total-ARS" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(t.ARS || "") + '" placeholder="0"></label>'
    + '<p class="note">Lo que les cobra la agencia en cada moneda. Se divide en partes iguales entre los viajeros. Los aéreos con Smiles van aparte.</p></div>';
  h += '<div class="card form"><h2>Viajeros</h2>';
  people().forEach(p => {
    h += '<div class="person-edit"><input id="pn-' + esc(p.id) + '" data-act="pname" data-id="' + esc(p.id) + '" value="' + esc(p.name) + '" aria-label="Nombre">'
      + (confirmPerson === p.id ? '<button class="btn-danger" data-act="person-del-yes" data-id="' + esc(p.id) + '">Borrar</button><button class="btn-ghost" data-act="person-del-no">No</button>'
        : '<button class="icon-btn" data-act="person-del" data-id="' + esc(p.id) + '" aria-label="Borrar a ' + esc(p.name) + '">' + ICON.close + '</button>') + '</div>';
  });
  if (confirmPerson) h += '<p class="err">Se borran también sus pagos y transferencias.</p>';
  h += '<form class="inline-add" data-form="person"><input id="np-name" name="name" placeholder="Nombre de otro viajero" required><button class="btn sm" type="submit">Agregar</button></form></div>';
  h += '<div class="card form"><h2>Copia de seguridad</h2><p class="note">Copia todos los datos como texto, para guardarlos donde quieras.</p>'
    + '<button class="btn-ghost" data-act="export">Copiar copia de seguridad</button><textarea id="export-text" readonly hidden></textarea></div>';
  h += '<p class="who">Conectado como ' + esc(user.email) + ' · <button class="linkish inline" data-act="logout">Salir</button></p>';
  return h;
}

function renderApp() {
  const R = compute();
  let h = '<div class="screen app' + (tab === "inicio" ? ' has-decor">' + DECOR : '">');
  if (toast) h += '<div class="toast"><span>' + esc(toast) + '</span><button class="linkish" data-act="toast-ok">Ok</button></div>';
  h += tab === "pagos" ? renderPagos(R) : tab === "saldos" ? renderSaldos(R) : tab === "ajustes" ? renderAjustes() : renderInicio(R);
  h += '</div>';
  if (tab !== "ajustes" && people().length) h += '<div class="cta-wrap"><button class="cta" data-act="new">' + ICON.wand + 'Añadir pago</button></div>';
  const tabs = [["inicio", "Inicio", ICON.home], ["pagos", "Pagos", ICON.list], ["saldos", "Saldos", ICON.transfer], ["ajustes", "Ajustes", ICON.gear]];
  h += '<nav class="tabbar" aria-label="Secciones">' + tabs.map(t => '<button data-act="tab" data-tab="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '>' + t[2] + '<span>' + t[1] + '</span></button>').join("") + '</nav>';
  if (sheet) h += renderSheet();
  return h;
}

function renderSheet() {
  const k = sheet.kind, opts = sel => people().map(p => '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>').join("");
  let h = '<div class="scrim" data-act="scrim"><form class="sheet" data-form="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">'
    + '<div class="sheet-head"><span></span><h2 id="sheet-title">' + (sheet.id ? "Editar" : "Añadir pago") + '</h2><button type="button" class="icon-btn" data-act="close" aria-label="Cerrar">' + ICON.close + '</button></div>'
    + '<div class="kinds" role="group" aria-label="Tipo">' + ["cuota", "aereo", "gasto", "transfer"].map(x =>
      '<button type="button" class="kind" data-act="kind" data-kind="' + x + '" aria-pressed="' + (k === x) + '"><span class="ico k-' + x + '">' + ICON[x] + '</span>' + KIND_LABEL[x] + '</button>').join("") + '</div>';
  const hint = { cuota: "Una cuota que uno de ustedes le pagó a la agencia. Se descuenta del costo total.",
    aereo: "Tasas o impuestos de los vuelos con Smiles. Se pagan aparte, no se descuentan del costo de la agencia.",
    gasto: "Algo que pagó uno durante el viaje para los dos. No se descuenta del costo total.",
    transfer: "Plata que uno le pasó al otro para emparejar las cuentas." }[k];
  h += '<p class="hint">' + hint + '</p>';
  if (k !== "transfer") h += '<label>Título<input id="sh-title" data-f="title" value="' + esc(sheet.title) + '" placeholder="' + ({ cuota: "Ej: Cuota 3, Seña hotel", aereo: "Ej: Impuestos vuelo ida", gasto: "Ej: Cena, Souvenirs, Uber" })[k] + '" required></label>';
  h += '<div class="amount-field"><span class="lbl">Cantidad</span><div class="amount-in"><div class="cur-switch" role="group" aria-label="Moneda">'
    + CURS.map(c => '<button type="button" data-act="cur" data-cur="' + c + '" aria-pressed="' + (sheet.cur === c) + '">' + (c === "USD" ? "US$" : "$ pesos") + '</button>').join("")
    + '</div><input id="sh-amount" data-f="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="' + esc(sheet.amount) + '" placeholder="0,00" required aria-label="Cantidad"></div></div>';
  if (k === "transfer") {
    h += '<div class="two"><label>De<select id="sh-from" data-f="from">' + opts(sheet.from) + '</select></label><label>Para<select id="sh-to" data-f="to">' + opts(sheet.to) + '</select></label></div>'
      + '<label>Cuándo<input id="sh-date" data-f="date" type="date" value="' + esc(sheet.date) + '"></label>';
  } else {
    h += '<div class="two"><label>Pagó<select id="sh-from" data-f="from">' + opts(sheet.from) + '</select></label><label>Cuándo<input id="sh-date" data-f="date" type="date" value="' + esc(sheet.date) + '"></label></div>';
    h += '<div class="split"><div class="split-head"><span>Dividir</span><span>En partes iguales</span></div>';
    people().forEach(p => {
      const on = sheet.split.indexOf(p.id) >= 0;
      h += '<label class="split-row"><input type="checkbox" id="sp-' + esc(p.id) + '" data-split="' + esc(p.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(p.name) + '</span><span class="split-amt" data-amt="' + esc(p.id) + '"></span></label>';
    });
    h += '</div>';
  }
  if (sheet.error) h += '<p class="err">' + esc(sheet.error) + '</p>';
  h += '<div class="sheet-actions">';
  if (sheet.id) h += sheet.confirmDel
    ? '<button type="button" class="btn-danger" data-act="sheet-del-yes">Sí, eliminar</button><button type="button" class="btn-ghost" data-act="sheet-del-no">No</button>'
    : '<button type="button" class="btn-danger" data-act="sheet-del">Eliminar</button>';
  return h + '<button type="submit" class="btn grow">' + (sheet.id ? "Guardar" : "Añadir") + '</button></div></form></div>';
}
function updateSplitAmounts() {
  if (!sheet || sheet.kind === "transfer") return;
  const a = +sheet.amount || 0, n = sheet.split.length;
  people().forEach(p => {
    const el = root.querySelector('[data-amt="' + CSS.escape(p.id) + '"]');
    if (el) el.textContent = sheet.split.indexOf(p.id) >= 0 && n ? money(a / n, sheet.cur) : money(0, sheet.cur);
  });
}

function render() {
  let h;
  if (!CONFIGURED || !user || !user.emailVerified || !allowed(user.email)) h = renderAuth();
  else if (!tripLoaded || !entriesLoaded) h = authShell('<p class="note center">Cargando el viaje…</p>' + (authErr ? '<p class="err center">' + esc(authErr) + '</p>' : ''));
  else if (!trip) h = renderSetup();
  else h = renderApp();
  if (!navigator.onLine) h += '<div class="offline">Sin conexión · se guarda cuando vuelva</div>';

  const active = document.activeElement && document.activeElement.id;
  const caret = active && document.activeElement.selectionStart != null ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const sh0 = root.querySelector(".sheet"), shTop = sh0 ? sh0.scrollTop : 0;
  const keep = {}; ["au-email", "au-pass", "imp-text", "np-name"].forEach(id => { const el = document.getElementById(id); if (el) keep[id] = el.value; });
  if (active && !sheet && document.activeElement && "value" in document.activeElement) keep[active] = document.activeElement.value;
  root.innerHTML = h;
  Object.keys(keep).forEach(id => { const el = document.getElementById(id); if (el) el.value = keep[id]; });
  const sh = root.querySelector(".sheet"); if (sh) sh.scrollTop = shTop;
  if (active) { const el = document.getElementById(active); if (el && el.focus) { el.focus({ preventScroll: true }); try { if (caret) el.setSelectionRange(caret[0], caret[1]); } catch (e) {} } }
  updateSplitAmounts();
}
addEventListener("online", render); addEventListener("offline", render);

// ---------- Acciones ----------
function setTab(t) { tab = t; ls.set("tab2", tab); window.scrollTo(0, 0); render(); }
function openSheet(e) {
  const all = people().map(p => p.id);
  if (e) sheet = { id: e.id, cur: e.cur || "USD", kind: e.kind, title: e.title || "", amount: e.amount, from: e.from, to: e.to || all[1] || all[0], date: e.date || today(), split: splitOf(e).slice(), confirmDel: false, created: e.created };
  else {
    const k = tab === "saldos" ? "transfer" : (tab === "pagos" && filter !== "todo") ? filter : "cuota";
    sheet = { id: null, cur: ls.get("lastCur", "USD"), kind: k, title: "", amount: "", from: all[0], to: all[1] || all[0], date: today(), split: all.slice(), confirmDel: false };
  }
  render();
  const f = root.querySelector("#sh-title") || root.querySelector("#sh-amount"); if (f) f.focus();
}
function submitSheet() {
  const a = r2(+sheet.amount || 0);
  const err = m => { sheet.error = m; render(); };
  if (sheet.kind !== "transfer" && !String(sheet.title).trim()) return err("Poné un título para reconocerlo después.");
  if (a <= 0) return err("Ingresá una cantidad mayor a cero.");
  if (sheet.kind === "transfer" && sheet.from === sheet.to) return err("Elegí dos personas distintas.");
  if (sheet.kind !== "transfer" && !sheet.split.length) return err("Elegí al menos una persona para dividir.");
  const id = sheet.id || uid("e");
  const rec = sheet.kind === "transfer"
    ? { kind: "transfer", cur: sheet.cur, title: "", amount: a, from: sheet.from, to: sheet.to, date: sheet.date || today() }
    : { kind: sheet.kind, cur: sheet.cur, title: String(sheet.title).trim(), amount: a, from: sheet.from, date: sheet.date || today(),
        split: sheet.split.length === people().length ? null : sheet.split.slice() };
  rec.created = sheet.created || Date.now(); rec.by = user.email;
  const isNew = !sheet.id;
  ls.set("lastCur", sheet.cur);
  sheet = null; render(); if (isNew && window.__burst) window.__burst();
  setDoc(doc(entriesCol(), id), rec).catch(fail);
}
function saveTrip(patch) { updateDoc(tripRef(), patch).catch(fail); }

function migrate(S) {
  if (!S || typeof S !== "object" || !Array.isArray(S.people)) throw new Error("formato");
  let tot = S.totals, ents = S.entries || [];
  if (!tot) {
    let tc = +S.totalCost || 0; const names = {};
    (S.items || []).forEach(i => { tc += +i.cost || 0; names[i.id] = i.name; });
    const c0 = S.currency === "ARS" ? "ARS" : "USD"; tot = { USD: 0, ARS: 0 }; tot[c0] = tc;
    ents = ents.map(e => {
      if (e.kind === "pago") return { id: e.id, kind: "cuota", title: e.note || names[e.itemId] || "Cuota", amount: +e.amount, from: e.from, split: null, date: e.date, cur: c0 };
      if (e.kind === "saldo") return { id: e.id, kind: "transfer", amount: +e.amount, from: e.from, to: e.to, date: e.date, cur: c0 };
      if (e.kind === "gasto" && e.note && !e.title) return Object.assign({}, e, { title: e.note, cur: e.cur || c0 });
      return Object.assign({ cur: c0 }, e);
    });
  }
  return {
    trip: { tripName: S.tripName || "Viaje a Disney 2027", date: S.date || DEFAULT_DATE, totals: { USD: +tot.USD || 0, ARS: +tot.ARS || 0 }, people: S.people.map(p => ({ id: String(p.id), name: String(p.name) })) },
    entries: ents.map(e => {
      const r = { kind: e.kind, cur: e.cur || "USD", title: e.title || "", amount: +e.amount || 0, from: e.from || "", date: e.date || today(), created: +e.created || Date.now() };
      if (e.kind === "transfer") r.to = e.to || ""; else r.split = e.split && e.split.length ? e.split : null;
      return { id: String(e.id || uid("e")), data: r };
    })
  };
}

root.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const act = b.getAttribute("data-act");
  if (act === "scrim") { if (ev.target === b) { sheet = null; render(); } return; }
  if (b.tagName === "INPUT" || b.tagName === "SELECT") return;
  if (act === "view") { authView = b.getAttribute("data-view"); authErr = authMsg = ""; render(); }
  else if (act === "logout") { await signOut(auth); authView = "login"; authErr = authMsg = ""; }
  else if (act === "verified") {
    busy = true; authErr = ""; render();
    try { await user.reload(); await user.getIdToken(true); user = auth.currentUser;
      if (user.emailVerified) { if (allowed(user.email)) startListening(); } else authErr = "Todavía no figura como confirmado. Abrí el link del mail y probá de nuevo.";
    } catch (e) { authErr = authError(e); }
    busy = false; render();
  }
  else if (act === "resend") { try { await sendEmailVerification(user); authMsg = "Listo, te lo mandamos de nuevo."; authErr = ""; } catch (e) { authErr = authError(e); } render(); }
  else if (act === "setup-new") {
    const ps = [{ id: "p1", name: "Juan" }, { id: "p2", name: "Melina" }];
    setDoc(tripRef(), { tripName: "Viaje a Disney 2027", date: DEFAULT_DATE, totals: { USD: 0, ARS: 0 }, people: ps }).catch(fail);
  }
  else if (act === "import") {
    const txt = (document.getElementById("imp-text") || {}).value || "";
    let M; try { M = migrate(JSON.parse(txt.trim())); } catch (e) { authErr = "No pude leer ese código. Copialo completo, desde la primera { hasta la última }."; render(); return; }
    authErr = ""; const batch = writeBatch(db);
    batch.set(tripRef(), M.trip);
    M.entries.forEach(e => batch.set(doc(entriesCol(), e.id), e.data));
    batch.commit().then(() => { toast = M.entries.length === 1 ? "Se importó 1 movimiento." : "Se importaron " + M.entries.length + " movimientos."; render(); }).catch(fail);
  }
  else if (act === "toast-ok") { toast = ""; render(); }
  else if (act === "tab") setTab(b.getAttribute("data-tab"));
  else if (act === "filter") { filter = b.getAttribute("data-filter"); ls.set("filter", filter); render(); }
  else if (act === "filter-go") { filter = b.getAttribute("data-filter"); ls.set("filter", filter); setTab("pagos"); }
  else if (act === "goto-settings") { setTab("ajustes"); const t = document.getElementById("set-total-USD"); if (t) t.focus(); }
  else if (act === "new") openSheet(null);
  else if (act === "open") { const e = entries.find(x => x.id === b.getAttribute("data-id")); if (e) openSheet(e); }
  else if (act === "close") { sheet = null; render(); }
  else if (act === "cur") { sheet.cur = b.getAttribute("data-cur"); render(); const ai = document.getElementById("sh-amount"); if (ai) ai.focus(); }
  else if (act === "kind") {
    sheet.kind = b.getAttribute("data-kind"); sheet.error = "";
    if (sheet.kind === "transfer" && sheet.to === sheet.from) { const o = people().find(p => p.id !== sheet.from); if (o) sheet.to = o.id; }
    render();
  }
  else if (act === "sheet-del") { sheet.confirmDel = true; render(); }
  else if (act === "sheet-del-no") { sheet.confirmDel = false; render(); }
  else if (act === "sheet-del-yes") { const id = sheet.id; sheet = null; render(); deleteDoc(doc(entriesCol(), id)).catch(fail); }
  else if (act === "settle") {
    const s = compute()[b.getAttribute("data-cur")].settle[+b.getAttribute("data-k")];
    if (s) { setDoc(doc(entriesCol(), uid("e")), { kind: "transfer", cur: s.cur, title: "", amount: s.amount, from: s.from, to: s.to, date: today(), created: Date.now(), by: user.email }).catch(fail); if (window.__burst) window.__burst(); }
  }
  else if (act === "person-del") { confirmPerson = b.getAttribute("data-id"); render(); }
  else if (act === "person-del-no") { confirmPerson = null; render(); }
  else if (act === "person-del-yes") {
    const pid = b.getAttribute("data-id"); confirmPerson = null;
    const batch = writeBatch(db);
    batch.update(tripRef(), { people: people().filter(p => p.id !== pid) });
    entries.forEach(e => {
      if (e.from === pid || e.to === pid) batch.delete(doc(entriesCol(), e.id));
      else if (e.split && e.split.indexOf(pid) >= 0) batch.update(doc(entriesCol(), e.id), { split: e.split.filter(x => x !== pid) });
    });
    batch.commit().catch(fail);
  }
  else if (act === "export") {
    const data = JSON.stringify({ tripName: trip.tripName, date: tripDate(), totals: totals(), people: people(), entries: entries.map(e => { const c = Object.assign({}, e); delete c.by; return c; }) });
    const ta = document.getElementById("export-text");
    try { await navigator.clipboard.writeText(data); toast = "Copia de seguridad copiada. Pegala en una nota o mandatela por mail."; render(); }
    catch (e) { if (ta) { ta.hidden = false; ta.value = data; ta.focus(); ta.select(); } }
  }
});
root.addEventListener("input", ev => {
  const t = ev.target; if (!sheet) return;
  const f = t.getAttribute("data-f"); if (f) { sheet[f] = t.value; if (f === "amount") updateSplitAmounts(); }
});
root.addEventListener("change", ev => {
  const t = ev.target;
  if (sheet) {
    const sp = t.getAttribute("data-split");
    if (sp) { if (t.checked) { if (sheet.split.indexOf(sp) < 0) sheet.split.push(sp); } else sheet.split = sheet.split.filter(x => x !== sp); updateSplitAmounts(); return; }
    const f = t.getAttribute("data-f"); if (f) { sheet[f] = t.value; return; }
  }
  if (!trip) return;
  if (t.id === "set-name") saveTrip({ tripName: t.value.trim() || "Nuestro viaje" });
  else if (t.id === "set-date") { if (parseDate(t.value)) saveTrip({ date: t.value }); }
  else if (t.id === "set-total-USD" || t.id === "set-total-ARS") saveTrip({ ["totals." + t.id.slice(-3)]: Math.max(0, r2(+t.value || 0)) });
  else if (t.getAttribute("data-act") === "pname") {
    const id = t.getAttribute("data-id"), name = t.value.trim(); if (!name) return;
    saveTrip({ people: people().map(p => p.id === id ? { id: p.id, name } : p) });
  }
});
root.addEventListener("submit", async ev => {
  ev.preventDefault();
  const form = ev.target, kind = form.getAttribute("data-form"), d = new FormData(form);
  if (kind === "sheet") return submitSheet();
  if (kind === "person") {
    const n = String(d.get("name") || "").trim(); if (!n) return;
    saveTrip({ people: people().concat([{ id: uid("p"), name: n }]) }); form.reset(); return;
  }
  const email = String(d.get("email") || "").trim(), pass = String(d.get("pass") || "");
  ls.set("lastEmail", email);
  busy = true; authErr = authMsg = ""; render();
  try {
    if (kind === "login") await signInWithEmailAndPassword(auth, email, pass);
    else if (kind === "register") {
      if (!allowed(email)) { authErr = "Este mail no está habilitado para el viaje."; }
      else { const cred = await createUserWithEmailAndPassword(auth, email, pass); await sendEmailVerification(cred.user); }
    } else if (kind === "reset") { await sendPasswordResetEmail(auth, email); authMsg = "Te mandamos un mail para elegir una contraseña nueva (fijate en Correo no deseado)."; }
  } catch (e) { authErr = authError(e); }
  busy = false; render();
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && sheet) { sheet = null; render(); } });
// La cuenta regresiva se actualiza sola al cambiar el día o al volver a la app.
let lastDay = today();
document.addEventListener("visibilitychange", () => { if (!document.hidden && today() !== lastDay) { lastDay = today(); render(); } });
setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60000);

// ---------- Fuegos artificiales al añadir un pago ----------
(function fireworks() {
  const cv = document.getElementById("sky"), ctx = cv && cv.getContext ? cv.getContext("2d") : null;
  if (!ctx) return;
  let sparks = [], running = false, reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  const COLS = ["#FF6B57", "#FFC93C", "#3CC4A0", "#6E8BFF", "#F49AB8"];
  function size() { const dpr = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function burst(x, y) {
    const c = COLS[Math.floor(Math.random() * COLS.length)], n = 50;
    for (let i = 0; i < n; i++) { const a = i / n * 6.283, v = 1.8 + Math.random() * 2.4; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: Math.random() < .25 ? "#FFC93C" : c }); }
    if (!running) { running = true; requestAnimationFrame(loop); }
  }
  function loop() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.013;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (sparks.length) requestAnimationFrame(loop); else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  window.__burst = () => { if (reduce) return; const w = innerWidth;
    burst(w * (0.2 + Math.random() * 0.25), 110 + Math.random() * 80);
    setTimeout(() => burst(w * (0.55 + Math.random() * 0.25), 90 + Math.random() * 90), 260);
    setTimeout(() => burst(w * (0.35 + Math.random() * 0.3), 150 + Math.random() * 60), 520); };
  size(); addEventListener("resize", size);
})();

// ---------- Instalable y sin conexión ----------
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {}));

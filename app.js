import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, TRIP_ID } from "./firebase-config.js?v=4";

const root = document.getElementById("root");
const CONFIGURED = firebaseConfig.apiKey && firebaseConfig.apiKey !== "PEGAR_AQUI";

// ---------- Utilidades ----------
const CURS = ["USD", "ARS"];
const CUR_NAME = { USD: "Dólares", ARS: "Pesos" };
const KIND_LABEL = { cuota: "Cuota del viaje", aereo: "Aéreos Smiles", gasto: "Gasto allá", transfer: "Transferencia" };
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const ICON = {
  cuota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/></svg>',
  aereo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16l20-6-3-2-6 2-5-6H6l3 7-4 1-2-2H2l1 4z"/><path d="M3 21h18"/></svg>',
  gasto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  transfer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>'
};
const uid = p => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const r2 = n => (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * 100 + 1e-7) / 100;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function money(n, cur) {
  const v = Math.abs(+n) < 0.005 ? 0 : +n;
  return (cur === "ARS" ? "$ " : "US$ ") + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dayLabel(d) {
  if (!d) return "Sin fecha"; if (d === today()) return "Hoy";
  const a = d.split("-"); return a.length === 3 ? (+a[2]) + " " + MESES[+a[1] - 1] + " " + a[0] : d;
}
const ls = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

// ---------- Estado de la pantalla ----------
let auth, db, user = null, unsubTrip = null, unsubEntries = null;
let trip = null, tripLoaded = false, entries = [], entriesLoaded = false;
let tab = ls.get("tab", "cuotas"), sheet = null, confirmPerson = null;
let authView = "login", authMsg = "", authErr = "", busy = false, toast = "";

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
function usedCurs() { const t = totals(); return CURS.filter(c => (+t[c] || 0) > 0 || entries.some(e => e.cur === c && e.kind === "cuota")); }
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

// ---------- Pantallas de acceso ----------
function renderAuth() {
  if (!CONFIGURED) return '<div class="auth"><div class="card"><h1>Cuentas del Viaje</h1><p>Falta pegar la configuración de Firebase en <strong>firebase-config.js</strong>.</p></div></div>';
  let h = '<div class="auth"><div class="top"><div class="emblem" aria-hidden="true">✦</div><h1>Cuentas del Viaje</h1></div><div class="card">';
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
    h += '<form class="settings" style="padding:0" data-form="' + (reset ? "reset" : reg ? "register" : "login") + '">'
      + '<p style="font-weight:800;font-size:17px">' + (reset ? "Recuperar contraseña" : reg ? "Crear mi cuenta" : "Ingresar") + '</p>'
      + '<label>Mail<input id="au-email" name="email" type="email" autocomplete="email" required value="' + esc(ls.get("lastEmail", "")) + '"></label>'
      + (reset ? '' : '<label>Contraseña<input id="au-pass" name="pass" type="password" minlength="6" autocomplete="' + (reg ? "new-password" : "current-password") + '" required></label>')
      + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : '') + (authMsg ? '<p class="ok">' + esc(authMsg) + '</p>' : '')
      + '<button class="btn" type="submit"' + (busy ? ' disabled' : '') + '>' + (reset ? "Mandarme el mail" : reg ? "Crear cuenta" : "Ingresar") + '</button></form>';
    if (!reg && !reset) h += '<button class="linkish" data-act="view" data-view="register">Es mi primera vez: crear mi cuenta</button><button class="linkish" data-act="view" data-view="reset">Olvidé mi contraseña</button>';
    else h += '<button class="linkish" data-act="view" data-view="login">Volver a ingresar</button>';
  }
  return h + '</div></div>';
}

// ---------- Primer uso: crear o importar el viaje ----------
function renderSetup() {
  return '<div class="auth"><div class="top"><div class="emblem" aria-hidden="true">✦</div><h1>Primer uso</h1></div>'
    + '<div class="card"><p>Todavía no hay un viaje guardado. Podés empezar de cero o traer lo que cargaste en la versión anterior.</p>'
    + '<button class="btn" data-act="setup-new">Empezar de cero</button></div>'
    + '<div class="card"><label>Pegá acá el código de la versión anterior<textarea id="imp-text" placeholder="{&quot;tripName&quot;: …}"></textarea></label>'
    + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : '')
    + '<button class="btn-ghost" data-act="import">Importar datos</button></div>'
    + '<p class="who">Conectado como ' + esc(user.email) + ' · <button class="linkish" data-act="logout" style="display:inline">Salir</button></p></div>';
}

// ---------- App ----------
function entryRow(e) {
  const sp = splitOf(e);
  const sub = e.kind === "transfer"
    ? esc(pname(e.from)) + " le pasó a " + esc(pname(e.to))
    : "Pagado por " + esc(pname(e.from)) + (sp.length < people().length ? " · para " + sp.map(pname).map(esc).join(", ") : "");
  const title = e.kind === "transfer" ? "Transferencia" : (e.title || KIND_LABEL[e.kind]);
  return '<button class="entry" data-act="open" data-id="' + esc(e.id) + '"><span class="ico ' + e.kind + '">' + (ICON[e.kind] || "") + '</span>'
    + '<span class="mid"><span class="t" style="display:block">' + esc(title) + '</span><span class="note">' + sub + '</span></span>'
    + '<span class="amt num">' + money(+e.amount, e.cur) + '</span></button>';
}
function entryList(list, emptyTitle, emptyText) {
  if (!list.length) return '<div class="panel"><div class="empty"><span class="star">✦</span><strong>' + emptyTitle + '</strong><span>' + emptyText + '</span></div></div>';
  list = list.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0));
  let h = '<div class="panel">', last = null;
  list.forEach(e => { if (e.date !== last) { h += '<div class="day">' + dayLabel(e.date) + '</div>'; last = e.date; } h += entryRow(e); });
  return h + '</div>';
}

function renderApp() {
  const R = compute(), used = usedCurs(), t = totals();
  let h = '<div class="wrap">';
  h += '<header class="top"><div class="emblem" aria-hidden="true">✦</div>'
    + '<input class="trip-name" id="trip-name" value="' + esc(trip.tripName || "Nuestro viaje") + '" aria-label="Nombre del viaje"></header>';
  if (toast) h += '<div class="banner"><span>' + esc(toast) + '</span><button class="btn-ghost" data-act="toast-ok">Ok</button></div>';

  h += '<div class="pass">';
  if (!used.length) h += '<div><div class="eyebrow">Costo total del viaje</div><div class="big">Sin cargar</div><div class="note">Poné cuánto cuesta el viaje en dólares y en pesos.</div></div>';
  used.forEach((c, idx) => {
    const C = R[c], pct = C.total > 0 ? Math.min(100, C.cuotaTotal / C.total * 100) : 0;
    h += '<div class="cur-block' + (idx ? ' cur-next' : '') + '"><div class="cur-tag">' + CUR_NAME[c] + '</div>'
      + '<div class="pass-row"><div><div class="eyebrow">Pagado a la agencia</div><div class="big num">' + money(C.cuotaTotal, c) + '</div>'
      + '<div class="note num">de ' + money(C.total, c) + ' de costo total</div></div>'
      + '<div class="right"><div class="eyebrow">Falta pagar</div><div class="big num foil">' + money(C.left, c) + '</div></div></div>'
      + '<div><div class="bar" role="img" aria-label="' + Math.round(pct) + '% pagado"><i style="width:' + pct.toFixed(1) + '%"></i></div>'
      + '<div class="note num" style="margin-top:6px">' + Math.round(pct) + '% pagado</div></div>';
    if (C.people.length && C.total > 0) {
      h += '<div class="contrib">';
      C.people.forEach(x => {
        const pp = x.toca > 0 ? Math.min(100, Math.max(0, x.aporte) / x.toca * 100) : 0;
        h += '<div class="contrib-row"><strong>' + esc(x.p.name) + '</strong><span class="num">' + money(x.aporte, c) + ' <span class="note">de ' + money(x.toca, c) + '</span></span>'
          + '<div class="bar sm"><i style="width:' + pp.toFixed(1) + '%"></i></div>'
          + '<span class="note num" style="grid-column:1/-1">' + (x.falta > 0.005 ? 'Le falta aportar ' + money(x.falta, c) : 'Ya aportó toda su parte') + '</span></div>';
      });
      h += '</div>';
    }
    h += '</div>';
  });
  h += '<button class="edit-total" data-act="goto-settings">Cambiar costo total</button></div>';

  const tabs = [["cuotas", "Cuotas"], ["aereos", "Aéreos"], ["gastos", "Gastos"], ["saldos", "Saldos"], ["ajustes", "Ajustes"]];
  h += '<div class="tabs" role="tablist">' + tabs.map(x => '<button class="tab" role="tab" id="tab-' + x[0] + '" data-act="tab" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + x[1] + '</button>').join("") + '</div>';

  if (tab === "cuotas") {
    h += entryList(entries.filter(e => e.kind === "cuota"), "Todavía no hay cuotas", 'Tocá "Añadir" cada vez que uno de ustedes le pague una cuota a la agencia.');
  } else if (tab === "aereos") {
    let ac = CURS.filter(c => R[c].aereoTotal > 0); if (!ac.length) ac = ["ARS"];
    h += '<div class="panel">' + ac.map(c => '<div class="sum-row"><div><span class="eyebrow">Aéreos Smiles · ' + CUR_NAME[c] + '</span><span class="v num">' + money(R[c].aereoTotal, c) + '</span></div>'
      + '<div style="text-align:right"><span class="eyebrow">Por persona</span><span class="v num">' + money(R[c].aereoTotal / Math.max(1, people().length), c) + '</span></div></div>').join('<div style="border-top:1px solid var(--line)"></div>') + '</div>';
    h += '<p class="note">Lo que pagan aparte por los vuelos con Smiles (tasas e impuestos). No se suma a lo pagado a la agencia, pero sí entra en los saldos entre ustedes.</p>';
    h += entryList(entries.filter(e => e.kind === "aereo"), "Todavía no hay pagos de aéreos", 'Tocá "Añadir", elegí "Aéreos" y cargá las tasas o impuestos de los vuelos con Smiles.');
  } else if (tab === "gastos") {
    let gc = CURS.filter(c => R[c].gastoTotal > 0); if (!gc.length) gc = ["USD"];
    h += '<div class="panel">' + gc.map(c => '<div class="sum-row"><div><span class="eyebrow">Gastos allá · ' + CUR_NAME[c] + '</span><span class="v num">' + money(R[c].gastoTotal, c) + '</span></div>'
      + '<div style="text-align:right"><span class="eyebrow">Por persona</span><span class="v num">' + money(R[c].gastoTotal / Math.max(1, people().length), c) + '</span></div></div>').join('<div style="border-top:1px solid var(--line)"></div>') + '</div>';
    h += entryList(entries.filter(e => e.kind === "gasto"), "Aún no hay gastos", "Durante el viaje, cargá acá las comidas, souvenirs o traslados que pague uno para los dos.");
  } else if (tab === "saldos") {
    const settles = []; CURS.forEach(c => R[c].settle.forEach((s, k) => settles.push({ s, k })));
    h += '<h3>Quién le debe a quién</h3><div class="panel">';
    if (!settles.length) h += '<div class="empty"><span class="star">✦</span><strong>Están a mano</strong><span>Nadie le debe nada a nadie.</span></div>';
    settles.forEach(o => {
      const s = o.s;
      h += '<div class="row"><div class="grow"><strong>' + esc(pname(s.from)) + '</strong> <span class="arrow">le debe a</span> <strong>' + esc(pname(s.to)) + '</strong></div>'
        + '<span class="amt num">' + money(s.amount, s.cur) + '</span><button class="btn-ghost" data-act="settle" data-cur="' + s.cur + '" data-k="' + o.k + '" style="padding:7px 14px;font-size:13px">Marcar como saldado</button></div>';
    });
    h += '</div><h3>Saldo de cada uno</h3><div class="panel">';
    people().forEach(p => {
      let pills = ""; const owedTxt = [];
      CURS.forEach(c => {
        if (used.indexOf(c) < 0 && !entries.some(e => e.cur === c)) return;
        const x = R[c].people.find(y => y.p.id === p.id); if (!x) return;
        const b = x.balance;
        pills += Math.abs(b) < 0.005 ? '<span class="pill neutral">A mano en ' + CUR_NAME[c].toLowerCase() + '</span>' : b > 0 ? '<span class="pill good num">le deben ' + money(b, c) + '</span>' : '<span class="pill bad num">debe ' + money(-b, c) + '</span>';
        owedTxt.push(money(x.owed, c));
      });
      h += '<div class="row"><div class="grow"><strong>' + esc(p.name) + '</strong>' + (owedTxt.length ? '<div class="note num">Le corresponde ' + owedTxt.join(" + ") + ' de lo pagado hasta hoy</div>' : '') + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">' + (pills || '<span class="pill neutral">A mano</span>') + '</div></div>';
    });
    h += '</div><p class="note">Dólares y pesos se cuentan por separado: lo que se debe en pesos se devuelve en pesos y lo que se debe en dólares, en dólares.</p>';
    h += '<h3>Transferencias</h3>' + entryList(entries.filter(e => e.kind === "transfer"), "Sin transferencias", "Cuando uno le pase plata al otro para emparejar, queda registrado acá.");
  } else {
    h += '<div class="panel settings">'
      + '<label>Costo total en dólares (US$)<input id="set-total-USD" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(t.USD || "") + '" placeholder="0"></label>'
      + '<label>Costo total en pesos ($)<input id="set-total-ARS" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(t.ARS || "") + '" placeholder="0"></label>'
      + '<p class="note" style="margin:-4px 0 0">Poné lo que les cobra la agencia en cada moneda. Por ejemplo, el pasaje en pesos y el hotel y las entradas en dólares. Cada total se divide en partes iguales entre los viajeros.</p>'
      + '</div><h3>Viajeros</h3><div class="panel settings">';
    people().forEach(p => {
      h += '<div class="person-edit"><input id="pn-' + esc(p.id) + '" data-act="pname" data-id="' + esc(p.id) + '" value="' + esc(p.name) + '" aria-label="Nombre">'
        + (confirmPerson === p.id ? '<button class="btn-danger" data-act="person-del-yes" data-id="' + esc(p.id) + '">Borrar</button><button class="btn-ghost" data-act="person-del-no">No</button>'
          : '<button class="btn-ghost" data-act="person-del" data-id="' + esc(p.id) + '" aria-label="Borrar a ' + esc(p.name) + '">×</button>') + '</div>';
    });
    if (confirmPerson) h += '<p class="err">Se borran también sus cuotas, gastos y transferencias.</p>';
    h += '<form class="inline-add" data-form="person"><input id="np-name" name="name" placeholder="Nombre de otro viajero" required><button class="btn" type="submit">Agregar</button></form></div>';
    h += '<h3>Copia de seguridad</h3><div class="panel settings"><p class="note" style="margin:0">Copia todos los datos como texto, para guardarlos donde quieras.</p>'
      + '<button class="btn-ghost" data-act="export">Copiar copia de seguridad</button><textarea id="export-text" readonly hidden></textarea></div>';
    h += '<p class="who">Conectado como ' + esc(user.email) + ' · <button class="linkish" data-act="logout" style="display:inline">Salir</button></p>';
  }

  if (people().length) h += '<button class="btn fab" data-act="new"><span aria-hidden="true">+</span> Añadir</button>';
  if (sheet) h += renderSheet();
  return h + '</div>';
}

function renderSheet() {
  const k = sheet.kind, opts = sel => people().map(p => '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>').join("");
  let h = '<div class="scrim" data-act="scrim"><form class="sheet" data-form="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">'
    + '<div class="sheet-head"><button type="button" class="close" data-act="close" aria-label="Cerrar">×</button><h2 id="sheet-title">' + (sheet.id ? "Editar" : "Añadir") + '</h2><span></span></div>'
    + '<div class="seg" role="group" aria-label="Tipo">' + ["cuota", "aereo", "gasto", "transfer"].map(x =>
      '<button type="button" data-act="kind" data-kind="' + x + '" aria-pressed="' + (k === x) + '">' + ({ cuota: "Cuota agencia", aereo: "Aéreos Smiles", gasto: "Gasto allá", transfer: "Transferencia" })[x] + '</button>').join("") + '</div>';
  if (k === "cuota") h += '<p class="hint">Una cuota que uno de ustedes le pagó a la agencia. Se descuenta del costo total.</p>';
  if (k === "aereo") h += '<p class="hint">Tasas o impuestos de los vuelos con Smiles. Se pagan aparte, no se descuentan del costo de la agencia.</p>';
  if (k === "gasto") h += '<p class="hint">Algo que pagó uno durante el viaje para los dos. No se descuenta del costo total.</p>';
  if (k === "transfer") h += '<p class="hint">Plata que uno le pasó al otro para emparejar las cuentas.</p>';
  if (k !== "transfer") h += '<label>Título<input id="sh-title" data-f="title" value="' + esc(sheet.title) + '" placeholder="' + (k === "cuota" ? "Ej: Cuota 3, Seña hotel" : k === "aereo" ? "Ej: Impuestos vuelo ida" : "Ej: Cena, Souvenirs, Uber") + '" required></label>';
  h += '<div class="amount-field"><span class="lbl">Cantidad</span><div class="amount-in"><div class="cur-switch" role="group" aria-label="Moneda">'
    + CURS.map(c => '<button type="button" data-act="cur" data-cur="' + c + '" aria-pressed="' + (sheet.cur === c) + '">' + (c === "USD" ? "US$" : "$ pesos") + '</button>').join("")
    + '</div><input id="sh-amount" data-f="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="' + esc(sheet.amount) + '" placeholder="0,00" required aria-label="Cantidad"></div></div>';
  if (k === "transfer") {
    h += '<div class="two"><label>De<select id="sh-from" data-f="from">' + opts(sheet.from) + '</select></label><label>Para<select id="sh-to" data-f="to">' + opts(sheet.to) + '</select></label></div>'
      + '<label>Cuándo<input id="sh-date" data-f="date" type="date" value="' + esc(sheet.date) + '"></label>';
  } else {
    h += '<div class="two"><label>Pagado por<select id="sh-from" data-f="from">' + opts(sheet.from) + '</select></label><label>Cuándo<input id="sh-date" data-f="date" type="date" value="' + esc(sheet.date) + '"></label></div>';
    h += '<div class="split"><div class="split-head"><span>Dividir</span><span>En partes iguales</span></div>';
    people().forEach(p => {
      const on = sheet.split.indexOf(p.id) >= 0;
      h += '<label class="split-row"><input type="checkbox" id="sp-' + esc(p.id) + '" data-split="' + esc(p.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(p.name) + '</span><span class="split-amt num" data-amt="' + esc(p.id) + '"></span></label>';
    });
    h += '</div>';
  }
  if (sheet.error) h += '<p class="err">' + esc(sheet.error) + '</p>';
  h += '<div class="sheet-actions">';
  if (sheet.id) h += sheet.confirmDel
    ? '<button type="button" class="btn-danger" data-act="sheet-del-yes">Sí, eliminar</button><button type="button" class="btn-ghost" data-act="sheet-del-no">No</button>'
    : '<button type="button" class="btn-danger" data-act="sheet-del">Eliminar</button>';
  return h + '<button type="submit" class="btn">' + (sheet.id ? "Guardar" : "Añadir") + '</button></div></form></div>';
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
  else if (!tripLoaded || !entriesLoaded) h = '<div class="auth"><p class="muted" style="text-align:center">Cargando el viaje…</p>' + (authErr ? '<p class="err" style="text-align:center">' + esc(authErr) + '</p>' : '') + '</div>';
  else if (!trip) h = renderSetup();
  else h = renderApp();
  if (!navigator.onLine) h += '<div class="offline">Sin conexión · se guarda cuando vuelva</div>';

  const active = document.activeElement && document.activeElement.id;
  const caret = active && document.activeElement.selectionStart != null ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const sh0 = root.querySelector(".sheet"), shTop = sh0 ? sh0.scrollTop : 0;
  // conservar lo que se está escribiendo en campos sueltos
  const keep = {}; ["au-email", "au-pass", "imp-text", "np-name"].forEach(id => { const el = document.getElementById(id); if (el) keep[id] = el.value; });
  // si alguien está escribiendo en un campo y llega un cambio del otro, no pisar lo que escribe
  if (active && !sheet && document.activeElement && "value" in document.activeElement) keep[active] = document.activeElement.value;
  root.innerHTML = h;
  Object.keys(keep).forEach(id => { const el = document.getElementById(id); if (el) el.value = keep[id]; });
  const sh = root.querySelector(".sheet"); if (sh) sh.scrollTop = shTop;
  if (active) { const el = document.getElementById(active); if (el && el.focus) { el.focus({ preventScroll: true }); try { if (caret) el.setSelectionRange(caret[0], caret[1]); } catch (e) {} } }
  updateSplitAmounts();
}
addEventListener("online", render); addEventListener("offline", render);

// ---------- Acciones ----------
function openSheet(e) {
  const all = people().map(p => p.id);
  if (e) sheet = { id: e.id, cur: e.cur || "USD", kind: e.kind, title: e.title || "", amount: e.amount, from: e.from, to: e.to || all[1] || all[0], date: e.date || today(), split: splitOf(e).slice(), confirmDel: false, created: e.created };
  else {
    const k = tab === "gastos" ? "gasto" : tab === "aereos" ? "aereo" : tab === "saldos" ? "transfer" : "cuota";
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
  tab = ({ cuota: "cuotas", aereo: "aereos", gasto: "gastos" })[rec.kind] || "saldos"; ls.set("tab", tab);
  sheet = null; render(); if (isNew && window.__burst) window.__burst();
  setDoc(doc(entriesCol(), id), rec).catch(fail);
}
function saveTrip(patch) { updateDoc(tripRef(), patch).catch(fail); }

function migrate(S) {
  // Acepta el formato de la versión anterior (página en Claude) en cualquiera de sus versiones
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
    trip: { tripName: S.tripName || "Viaje a Disney 2027", totals: { USD: +tot.USD || 0, ARS: +tot.ARS || 0 }, people: S.people.map(p => ({ id: String(p.id), name: String(p.name) })) },
    entries: ents.map(e => {
      const r = { kind: e.kind, cur: e.cur || "USD", title: e.title || "", amount: +e.amount || 0, from: e.from || "", date: e.date || today(), created: Date.now() };
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
    setDoc(tripRef(), { tripName: "Viaje a Disney 2027", totals: { USD: 0, ARS: 0 }, people: ps }).catch(fail);
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
  else if (act === "tab") { tab = b.getAttribute("data-tab"); ls.set("tab", tab); render(); }
  else if (act === "goto-settings") { tab = "ajustes"; ls.set("tab", tab); render(); const t = document.getElementById("set-total-USD"); if (t) t.focus(); }
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
    const data = JSON.stringify({ tripName: trip.tripName, totals: totals(), people: people(), entries: entries.map(e => { const c = Object.assign({}, e); delete c.by; return c; }) });
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
  if (t.id === "trip-name") saveTrip({ tripName: t.value.trim() || "Nuestro viaje" });
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

// ---------- Cielo: estrellas y fuegos artificiales ----------
(function sky() {
  const cv = document.getElementById("sky"), ctx = cv && cv.getContext ? cv.getContext("2d") : null;
  if (!ctx) return;
  let stars = [], sparks = [], cols = {}, reduce = false, last = 0, nextAuto = 0;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  const readCols = () => { const cs = getComputedStyle(document.documentElement); ["star", "fw1", "fw2", "fw3"].forEach(k => cols[k] = (cs.getPropertyValue("--" + k) || "#fff").trim()); };
  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(innerWidth * innerHeight / 7000); stars = [];
    for (let i = 0; i < n; i++) stars.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight * 0.85, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6.28, s: 0.6 + Math.random() * 1.6 });
    if (reduce) draw(0);
  }
  function burst(x, y) {
    if (reduce) return;
    const c = [cols.fw1, cols.fw2, cols.fw3][Math.floor(Math.random() * 3)], n = 46;
    for (let i = 0; i < n; i++) { const a = i / n * 6.283, v = 1.6 + Math.random() * 2.2; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c: Math.random() < .2 ? cols.fw1 : c }); }
  }
  window.__burst = () => { const w = innerWidth;
    burst(w * (0.2 + Math.random() * 0.25), 90 + Math.random() * 80);
    setTimeout(() => burst(w * (0.55 + Math.random() * 0.25), 70 + Math.random() * 90), 260);
    setTimeout(() => burst(w * (0.35 + Math.random() * 0.3), 120 + Math.random() * 60), 520); };
  function draw(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight); ctx.fillStyle = cols.star;
    stars.forEach(s => { ctx.globalAlpha = reduce ? 0.6 : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t / 1000 * s.s + s.p)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill(); });
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.035; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.012;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function loop(t) {
    if (document.hidden) { requestAnimationFrame(loop); return; }
    if (t - last > 2000) { readCols(); last = t; }
    if (t > nextAuto) { if (nextAuto) burst(innerWidth * (0.15 + Math.random() * 0.7), 60 + Math.random() * 120); nextAuto = t + 5000 + Math.random() * 5000; }
    draw(t); requestAnimationFrame(loop);
  }
  readCols(); size(); addEventListener("resize", size);
  if (!reduce) requestAnimationFrame(loop);
})();

// ---------- Instalable y sin conexión ----------
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {}));

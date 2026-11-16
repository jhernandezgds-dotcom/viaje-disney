import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, TRIP_ID } from "./firebase-config.js?v=8";

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
  close: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
  bell: SVG('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  camera: SVG('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  cal: SVG('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  check: SVG('<path d="M5 12l5 5 9-10"/>', ' stroke-width="2.6"'),
  chat: SVG('<path d="M4 19l1.5-4A7.5 7.5 0 1 1 9 18.5z"/>')
};
const MILES_GOAL = 460000, MILES_MONTHLY = 40000, MILES_DEADLINE = "2027-05";
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
let fbApp, auth, db, user = null, unsubTrip = null, unsubEntries = null, unsubLog = null;
let logItems = [], bellOpen = false, confirmPlan = null;
let trip = null, tripLoaded = false, entries = [], entriesLoaded = false;
let tab = ls.get("tab2", "inicio"), filter = ls.get("filter", "todo"), sheet = null, confirmPerson = null;
let authView = "login", authMsg = "", authErr = "", busy = false, toast = "";
if (["inicio", "pagos", "saldos", "millas", "ajustes"].indexOf(tab) < 0) tab = "inicio";

// ---------- Firebase ----------
if (CONFIGURED) {
  const app = fbApp = initializeApp(firebaseConfig);
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
const logCol = () => collection(db, "trips", TRIP_ID, "log");

function startListening() {
  tripLoaded = false; entriesLoaded = false;
  unsubTrip = onSnapshot(tripRef(), snap => {
    trip = snap.exists() ? snap.data() : null; tripLoaded = true; render();
  }, err => { authErr = permMsg(err); tripLoaded = true; render(); });
  unsubEntries = onSnapshot(entriesCol(), snap => {
    entries = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); entriesLoaded = true; render();
  }, err => { authErr = permMsg(err); entriesLoaded = true; render(); });
  unsubLog = onSnapshot(query(logCol(), orderBy("at", "desc"), limit(80)), snap => {
    logItems = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); render();
  }, () => {});
}
function stopListening() {
  if (unsubTrip) unsubTrip(); if (unsubEntries) unsubEntries(); if (unsubLog) unsubLog();
  unsubTrip = unsubEntries = unsubLog = null; trip = null; entries = []; logItems = []; tripLoaded = entriesLoaded = false;
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
    if ((e.cur || "USD") !== cur || isMillas(e)) return; // las millas no entran en los saldos
    const a = +e.amount || 0;
    if (e.kind === "cuota" || e.kind === "gasto" || e.kind === "aereo") {
      if (e.kind === "cuota") { cuotaTotal += a; if (e.from in aporte) aporte[e.from] += a; }
      else if (e.kind === "aereo") aereoTotal += a; else gastoTotal += a;
      if (e.from in paid) paid[e.from] += a;
      // Las millas son de quien las aporta: no se dividen.
      const ids = isMillas(e) ? [e.from] : splitOf(e), part = a / ids.length;
      ids.forEach(id => { if (id in owed) owed[id] += part; });
    } else if (e.kind === "transfer") {
      if (e.from in paid) { paid[e.from] += a; aporte[e.from] += a; }
      if (e.to in paid) { paid[e.to] -= a; aporte[e.to] -= a; }
    }
  });
  const n = Math.max(1, people().length), total = +totals()[cur] || 0, toca = total / n;
  const ppl = people().map(p => ({
    p, balance: r2(paid[p.id] - owed[p.id]), paid: paid[p.id], owed: owed[p.id], aporte: aporte[p.id], toca,
    falta: Math.max(0, r2(toca - aporte[p.id]))
  }));
  const settle = minSettle(ppl.map(x => ({ id: x.p.id, v: x.balance })), cur);
  return { cur, total, cuotaTotal, gastoTotal, aereoTotal, left: Math.max(0, r2(total - cuotaTotal)), people: ppl, settle };
}
function minSettle(bal, cur) {
  const cred = [], debt = [];
  bal.forEach(x => { if (x.v > 0.005) cred.push({ id: x.id, v: x.v }); else if (x.v < -0.005) debt.push({ id: x.id, v: -x.v }); });
  cred.sort((a, b) => b.v - a.v); debt.sort((a, b) => b.v - a.v);
  const settle = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const m = r2(Math.min(debt[i].v, cred[j].v));
    if (m > 0.005) settle.push({ from: debt[i].id, to: cred[j].id, amount: m, cur });
    debt[i].v = r2(debt[i].v - m); cred[j].v = r2(cred[j].v - m);
    if (debt[i].v <= 0.005) i++; if (cred[j].v <= 0.005) j++;
  }
  return settle;
}
const fmtMiles = n => new Intl.NumberFormat("es-AR").format(Math.round(+n || 0));
const isMillas = e => e.kind === "aereo" && e.sub === "millas";
function aereoStats() {
  const S = { miles: 0, cur: {} };
  entries.forEach(e => {
    if (e.kind !== "aereo") return;
    const c = e.cur || "USD", sub = isMillas(e) ? "millas" : "tasas", a = +e.amount || 0;
    if (sub === "millas") S.miles += +e.miles || 0;
    const C = S.cur[c] || (S.cur[c] = { millas: 0, tasas: 0, by: {} });
    C[sub] += a;
    const by = C.by[e.from] || (C.by[e.from] = { millas: 0, tasas: 0 });
    by[sub] += a;
  });
  return S;
}
function allSettles(R) { const out = []; CURS.forEach(c => R[c].settle.forEach((s, k) => out.push({ s, k }))); return out; }
function tripDate() { return (trip && trip.date) || DEFAULT_DATE; }
function daysLeft() {
  const t = parseDate(tripDate()), n = parseDate(today());
  return t && n ? Math.round((t - n) / 86400000) : null;
}
function longDate(s) { const d = parseDate(s); return d ? DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES_L[d.getMonth()] + " de " + d.getFullYear() : ""; }
function myId() {
  const email = String(user && user.email || "").toLowerCase(), idx = ALLOWED_EMAILS.map(e => e.toLowerCase()).indexOf(email);
  const p = people()[idx]; return p ? p.id : (people()[0] || {}).id;
}
function whoName(email) {
  const idx = ALLOWED_EMAILS.map(e => e.toLowerCase()).indexOf(String(email || "").toLowerCase());
  const p = people()[idx]; return p ? p.name : String(email || "Alguien").split("@")[0];
}
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const ym = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
function monthAdd(ymStr, k) { const [y, m] = ymStr.split("-").map(Number); const d = new Date(y, m - 1 + k, 1); return ym(d); }
function monthName(ymStr, short) { const [y, m] = String(ymStr).split("-").map(Number); return (short ? MESES[m - 1] : MESES_L[m - 1]) + " " + y; }
function monthsBetween(a, b) { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); }

// Millas: cada uno aporta las suyas a la cuenta Smiles de Melina
function millasCfg() {
  return { goal: +(trip && trip.milesGoal) || MILES_GOAL, monthly: +(trip && trip.milesMonthly) || MILES_MONTHLY, deadline: (trip && trip.milesDeadline) || MILES_DEADLINE };
}
function millasStats() {
  const S = { total: 0, by: {}, money: {}, month: {} }, cm = today().slice(0, 7);
  people().forEach(p => { S.by[p.id] = 0; S.month[p.id] = 0; });
  entries.forEach(e => {
    if (!isMillas(e)) return;
    const m = +e.miles || 0; S.total += m;
    if (e.from in S.by) S.by[e.from] += m;
    if ((e.date || "").slice(0, 7) === cm && e.from in S.month) S.month[e.from] += m;
    if (+e.amount > 0) { const c = e.cur || "ARS"; S.money[c] = S.money[c] || {}; S.money[c][e.from] = (S.money[c][e.from] || 0) + +e.amount; }
  });
  return S;
}
function millasPlan() {
  const C = millasCfg(), S = millasStats(), n = Math.max(1, people().length), per = C.monthly / n, cm = today().slice(0, 7);
  const remaining = Math.max(0, C.goal - S.total);
  const monthDone = people().every(p => S.month[p.id] >= per - 0.5);
  const startM = monthDone ? monthAdd(cm, 1) : cm;
  const need = Math.ceil(remaining / C.monthly);
  const eta = remaining <= 0 ? cm : monthAdd(startM, need - 1);
  const monthsLeft = Math.max(1, monthsBetween(startM, C.deadline) + 1);
  return { C, S, n, per, remaining, eta, ok: remaining <= 0 || monthsBetween(eta, C.deadline) >= 0, needPerMonth: Math.ceil(remaining / monthsLeft / 1000) * 1000, monthsLeft };
}

// Planes de cuotas
function plans() { return (trip && trip.plans) || []; }
function planStatus(p) {
  const paid = entries.filter(e => e.plan === p.id).length, n = paid + 1, done = n > p.count;
  const [y, m] = String(p.start || today().slice(0, 7)).split("-").map(Number);
  const d = new Date(y, m - 1 + (n - 1), 1), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(+p.day || 1, last));
  const due = ymd(d), end = new Date(y, m - 1 + (p.count - 1), 1);
  return { paid, n, done, due, overdue: !done && due < today(), end: ym(end) };
}

// Presupuesto de allá
function budget() { const b = (trip && trip.budget) || {}; return { daily: +b.daily || 0, cur: b.cur === "ARS" ? "ARS" : "USD", end: b.end || "" }; }
function fxRate() { return +(trip && trip.fx) || 0; }
function inCur(amount, from, to) {
  if (from === to) return amount;
  const fx = fxRate(); if (!fx) return null;
  return from === "ARS" ? amount / fx : amount * fx;
}
function budgetStats() {
  const B = budget(); if (!B.daily) return null;
  const start = tripDate(), end = B.end && B.end >= start ? B.end : start;
  const days = Math.round((parseDate(end) - parseDate(start)) / 86400000) + 1;
  let spent = 0, todaySpent = 0, other = 0; const t = today();
  entries.forEach(e => {
    if (e.kind !== "gasto") return;
    const v = inCur(+e.amount || 0, e.cur || "USD", B.cur);
    if (v == null) { other++; return; }
    spent += v; if (e.date === t) todaySpent += v;
  });
  const during = t >= start && t <= end;
  const dayN = during ? Math.round((parseDate(t) - parseDate(start)) / 86400000) + 1 : (t > end ? days : 0);
  return { B, start, end, days, total: B.daily * days, spent, todaySpent, during, dayN, avg: dayN ? spent / dayN : 0, other };
}

// Historial y novedades
function logAct(action, rec, extra) {
  if (!db || !user) return;
  const d = { at: Date.now(), by: user.email, action, kind: rec.kind || "", sub: rec.sub || "", title: rec.title || "", amount: +rec.amount || 0, cur: rec.cur || "", miles: +rec.miles || 0 };
  Object.assign(d, extra || {});
  setDoc(doc(logCol(), uid("l")), d).catch(() => {});
}
function seenKey() { return "seen:" + String(user && user.email || "").toLowerCase(); }
function unseenLogs() {
  const seen = +ls.get(seenKey(), "0") || 0, me = String(user && user.email || "").toLowerCase();
  return logItems.filter(l => String(l.by || "").toLowerCase() !== me && (+l.at || 0) > seen);
}
function logWhen(at) {
  const d = new Date(+at || 0), t = today(), k = ymd(d), hh = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const y = new Date(); y.setDate(y.getDate() - 1);
  return (k === t ? "hoy" : k === ymd(y) ? "ayer" : shortDate(k)) + " " + hh;
}
function logText(l) {
  const who = esc(whoName(l.by)), title = esc(l.title || KIND_LABEL[l.kind] || "un pago"), m = l.amount ? money(l.amount, l.cur) : "";
  if (l.action === "add") return l.sub === "millas" ? who + " sumó " + fmtMiles(l.miles) + " millas" : who + " cargó <strong>" + title + "</strong>" + (m ? " · " + m : "");
  if (l.action === "edit") return who + " editó <strong>" + title + "</strong>" + (l.prevAmount != null && +l.prevAmount !== +l.amount ? " · " + money(l.prevAmount, l.cur) + " → " + m : "");
  if (l.action === "delete") return who + " borró <strong>" + title + "</strong>" + (m ? " · " + m : "");
  if (l.action === "settle") return who + " marcó como saldado: " + esc(pname(l.from)) + " → " + esc(pname(l.to)) + " · " + m;
  if (l.action === "totals") return who + " cambió el costo total en " + (CUR_NAME[l.cur] || "").toLowerCase() + " a " + m;
  if (l.action === "plan") return who + " creó el plan de cuotas <strong>" + title + "</strong>";
  return who + " hizo un cambio";
}
function myName() {
  const email = String(user && user.email || "").toLowerCase(), idx = ALLOWED_EMAILS.map(e => e.toLowerCase()).indexOf(email);
  const p = people()[idx]; return p ? p.name : "";
}

// ---------- Apariencia día / noche (hora de Buenos Aires) ----------
const THEME_KEY = "themePref", BA_TZ = "America/Argentina/Buenos_Aires";
let themeMenu = false;
function themePref() { const p = ls.get(THEME_KEY, "auto"); return p === "day" || p === "night" ? p : "auto"; }
function baHour(d) {
  try { return +new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: BA_TZ }).format(d || new Date()) % 24; }
  catch (e) { return ((d || new Date()).getUTCHours() + 21) % 24; } // Buenos Aires = UTC−3, sin horario de verano
}
function themeMode() { const p = themePref(); if (p !== "auto") return p; const h = baHour(); return h >= 7 && h < 19 ? "day" : "night"; }
function applyTheme() {
  const m = themeMode(), r = document.documentElement;
  if (r.getAttribute("data-theme") !== m) r.setAttribute("data-theme", m);
  const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.setAttribute("content", m === "day" ? "#3793ef" : "#071850");
}
applyTheme();
// Se revisa al abrir, al volver a la app y cada minuto. Solo cambia un atributo: no se vuelve a dibujar ni se pierde lo escrito.
document.addEventListener("visibilitychange", () => { if (!document.hidden) applyTheme(); });
addEventListener("focus", applyTheme); addEventListener("pageshow", applyTheme);
setInterval(applyTheme, 60000);
const THEME_LABEL = { auto: "Automático", day: "Día", night: "Noche" }, THEME_ICON = { auto: "clock", day: "sun", night: "moon" };

// ---------- Íconos de línea del diseño aprobado ----------
Object.assign(ICON, {
  home: SVG('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  card: SVG('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>'),
  users: SVG('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.3A5.5 5.5 0 0 1 21.5 20"/>'),
  plane: SVG('<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  cuota: SVG('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M8 7v13M16 7v13"/>'),
  aereo: SVG('<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
  gasto: SVG('<path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
  flag: SVG('<path d="M5 21V4"/><path d="M5 4.5c4-2 7 2 13 0v8c-6 2-9-2-13 0"/>'),
  user: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>'),
  wallet: SVG('<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14.5a1.5 1.5 0 0 1 1.5 1.5V12"/><path d="M3 6v12a2 2 0 0 0 2 2h14.5a1.5 1.5 0 0 0 1.5-1.5V16"/><path d="M21 12h-4a2 2 0 0 0 0 4h4z"/>'),
  cloud: SVG('<path d="M17.5 19H8a5 5 0 1 1 1.6-9.7A6 6 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19z"/>'),
  chev: SVG('<path d="M9 6l6 6-6 6"/>'),
  chevDown: SVG('<path d="M6 9l6 6 6-6"/>'),
  back: SVG('<path d="M15 6l-6 6 6 6"/>'),
  sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: SVG('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  whatsapp: SVG('<path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8a5 5 0 0 1-2.8-2.8l.8-1-1-2z" fill="currentColor" stroke-width="1"/>'),
  warn: SVG('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>')
});
const ic = (name, cls) => '<span class="' + (cls || "icon-box") + '" aria-hidden="true">' + (ICON[name] || "") + '</span>';
const capital = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
function fullDate(d) { const a = String(d || "").split("-"); return a.length === 3 ? (+a[2]) + " " + MESES[+a[1] - 1] + " " + a[0] : "Sin fecha"; }
function moneyR(n, cur) { return money(n, cur, Math.abs((+n || 0) % 1) < 0.005 ? 0 : 2); }
const pct = (v, t) => t > 0 ? Math.max(0, Math.min(100, v / t * 100)) : 0;
const bar = (p, cls) => '<div class="progress' + (cls ? ' ' + cls : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(p) + '"><span style="width:' + p.toFixed(1) + '%"></span></div>';

// ---------- Encabezados ilustrados ----------
const HERO = {
  inicio: { day: "inicio-dia", night: "inicio-noche", title: "Viaje a Disney" },
  pagos: { day: "pagos-dia", night: null, title: "Pagos" },
  saldos: { day: null, night: "saldos-noche", title: "Saldos" },
  millas: { day: null, night: "millas-noche", title: "Millas Smiles" },
  anadir: { day: "anadir-dia", night: "anadir-noche", title: "Añadir pago" },
  ajustes: { day: "ajustes-dia", night: "ajustes-noche", title: "Ajustes" }
};
function hero(page, extra) {
  const H = HERO[page];
  const layer = mode => {
    const img = H[mode], cls = "hero-layer only-" + mode;
    return img ? '<div class="' + cls + '"><img class="hero-photo" src="assets/' + img + '.webp" alt="" decoding="async"></div>'
      : '<div class="' + cls + ' decorated"><img class="hero-photo" src="assets/paisaje-' + (mode === "day" ? "dia" : "noche") + '.webp" alt="" decoding="async">'
        + '<span class="hero-text" aria-hidden="true">' + esc(H.title) + '</span><span class="decor-stars" aria-hidden="true">✧ ⋆ ✦</span></div>';
  };
  const label = page === "inicio" ? "Viaje a Disney · " + longDate(tripDate()) : H.title;
  return '<header class="hero h-' + page + '">' + layer("day") + layer("night") + '<h1 class="sr-only">' + esc(label) + '</h1>' + (extra || "") + '</header>';
}
function headTools(withBell) {
  const p = themePref(), nUn = withBell ? unseenLogs().length : 0;
  let h = '<div class="head-tools">';
  if (withBell) h += '<button class="head-tool round" data-act="bell" aria-label="Novedades' + (nUn ? ': ' + nUn + ' sin ver' : '') + '">' + ICON.bell + (nUn ? '<span class="badge">' + (nUn > 9 ? "9+" : nUn) + '</span>' : '') + '</button>';
  h += '<div style="position:relative"><button class="head-tool" data-act="theme-menu" aria-haspopup="menu" aria-expanded="' + themeMenu + '" aria-label="Apariencia: ' + THEME_LABEL[p] + '">' + ICON[THEME_ICON[p]] + (p === "auto" ? "Auto" : THEME_LABEL[p]) + ' ▾</button>';
  if (themeMenu) h += '<div class="theme-options" role="menu" aria-label="Apariencia">' + ["auto", "day", "night"].map(k =>
    '<button role="menuitemradio" aria-checked="' + (p === k) + '" data-act="theme" data-theme="' + k + '">' + ICON[THEME_ICON[k]] + THEME_LABEL[k] + '</button>').join("")
    + '<small>Automático: día de 7:00 a 19:00 y noche de 19:00 a 7:00, hora de Buenos Aires.</small></div>';
  return h + '</div></div>';
}

// ---------- Pantallas de acceso ----------
function authShell(inner) {
  return '<div class="shell auth-shell">' + headTools(false) + hero("inicio") + '<div class="page-content">' + inner + '</div></div>';
}
function renderAuth() {
  if (!CONFIGURED) return authShell('<div class="card"><p>Falta pegar la configuración de Firebase en <strong>firebase-config.js</strong>.</p></div>');
  let h = '<div class="card form">';
  if (user && !allowed(user.email)) {
    h += '<p><strong>' + esc(user.email) + '</strong> no está habilitado para este viaje.</p><p class="note">Solo pueden entrar las dos cuentas del viaje.</p>'
      + '<button class="btn" data-act="logout">Salir</button>';
  } else if (user && !user.emailVerified) {
    h += '<h2 class="auth-title">Confirmá tu mail</h2><p>Te mandamos un mail a <strong>' + esc(user.email) + '</strong> para confirmar tu cuenta.</p>'
      + '<p class="note">Abrí el link del mail (fijate también en Correo no deseado) y después tocá el botón de abajo.</p>'
      + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : '') + (authMsg ? '<p class="ok">' + esc(authMsg) + '</p>' : '')
      + '<button class="btn" data-act="verified"' + (busy ? ' disabled' : '') + '>Ya confirmé mi mail</button>'
      + '<button class="btn-ghost" data-act="resend">Reenviar el mail</button>'
      + '<button class="linkish block" data-act="logout">Usar otra cuenta</button>';
  } else {
    const reg = authView === "register", reset = authView === "reset";
    h += '<form data-form="' + (reset ? "reset" : reg ? "register" : "login") + '">'
      + '<h2 class="auth-title">' + (reset ? "Recuperar contraseña" : reg ? "Crear mi cuenta" : "Ingresar") + '</h2>'
      + '<label>Mail<input id="au-email" name="email" type="email" autocomplete="email" required value="' + esc(ls.get("lastEmail", "")) + '"></label>'
      + (reset ? '' : '<label>Contraseña<input id="au-pass" name="pass" type="password" minlength="6" autocomplete="' + (reg ? "new-password" : "current-password") + '" required></label>')
      + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : '') + (authMsg ? '<p class="ok">' + esc(authMsg) + '</p>' : '')
      + '<button class="btn" type="submit"' + (busy ? ' disabled' : '') + '>' + (reset ? "Mandarme el mail" : reg ? "Crear cuenta" : "Ingresar") + '</button></form>';
    if (!reg && !reset) h += '<button class="linkish block" data-act="view" data-view="register">Es mi primera vez: crear mi cuenta</button><button class="linkish block" data-act="view" data-view="reset">Olvidé mi contraseña</button>';
    else h += '<button class="linkish block" data-act="view" data-view="login">Volver a ingresar</button>';
  }
  return authShell(h + '</div>');
}
function renderSetup() {
  return authShell('<div class="card form"><h2 class="auth-title">Primer uso</h2><p>Todavía no hay un viaje guardado. Podés empezar de cero o traer lo que cargaste en la versión anterior.</p>'
    + '<button class="btn" data-act="setup-new">Empezar de cero</button></div>'
    + '<div class="card form"><label>Pegá acá el código de la versión anterior<textarea id="imp-text" placeholder="{&quot;tripName&quot;: …}"></textarea></label>'
    + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : '')
    + '<button class="btn-ghost" data-act="import">Importar datos</button></div>'
    + '<p class="who-line">Conectado como ' + esc(user.email) + ' · <button class="linkish" data-act="logout">Salir</button></p>');
}

// ---------- Piezas ----------
function entryRow(e) {
  const sp = splitOf(e);
  const sub = e.kind === "transfer"
    ? esc(pname(e.from)) + " le pasó a " + esc(pname(e.to))
    : isMillas(e) ? "Aportó " + esc(pname(e.from)) + ' · ' + fmtMiles(e.miles) + ' millas'
    : "Pagó " + esc(pname(e.from)) + (sp.length < people().length ? " · para " + sp.map(pname).map(esc).join(", ") : "");
  const title = e.kind === "transfer" ? (e.title || "Transferencia") : (e.title || (isMillas(e) ? "Compra de millas" : KIND_LABEL[e.kind]));
  return '<button class="entry" data-act="open" data-id="' + esc(e.id) + '" aria-label="' + esc(title) + ', ver detalle">'
    + '<span class="entry-icon" aria-hidden="true">' + (ICON[e.kind] || "") + '</span>'
    + '<span class="entry-text"><span class="entry-title">' + esc(title) + '</span><span class="entry-sub">' + fullDate(e.date) + ' · ' + sub + '</span></span>'
    + '<span class="amount-chip">' + (isMillas(e) && !(+e.amount > 0) ? fmtMiles(e.miles) + ' mi' : moneyR(+e.amount, e.cur)) + '</span>'
    + '<span class="check-ok" aria-hidden="true">' + ICON.check + '</span></button>';
}
function sortEntries(list) { return list.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0)); }
function emptyCard(title, text) { return '<div class="card smaller"><div class="card-title">✦ ' + title + '</div><div class="card-sub" style="margin-top:4px">' + text + '</div></div>'; }
const addBtn = () => people().length ? '<button class="primary" data-act="new">' + ICON.wand + '+ Añadir pago</button><div class="space"></div>' : '';

// Próximos pagos reales: planes de cuotas pendientes y millas del mes que faltan
function upcoming() {
  const out = [];
  plans().map(p => ({ p, st: planStatus(p) })).filter(x => !x.st.done).sort((a, b) => a.st.due.localeCompare(b.st.due)).forEach(x => out.push({ type: "plan", p: x.p, st: x.st }));
  const MP = millasPlan(), cm = today().slice(0, 7);
  if (MP.remaining > 0 && cm <= MP.C.deadline) people().forEach(p => { if (MP.S.month[p.id] < MP.per - 0.5) out.push({ type: "miles", person: p, per: MP.per - MP.S.month[p.id] }); });
  return out;
}

// ---------- Inicio ----------
function renderInicio(R) {
  const days = daysLeft();
  let h = hero("inicio") + '<div class="page-content compact">';
  if (days != null) h += '<div class="card important smaller"><div class="card-head">' + ic("cal") + '<div class="stack"><div class="card-sub">' + (days > 0 ? "Faltan" : "La aventura") + '</div><div class="big-number">'
    + (days > 0 ? new Intl.NumberFormat("es-AR").format(days) + (days === 1 ? " día" : " días") : days === 0 ? "¡Hoy empieza la magia!" : "¡A disfrutar del viaje!") + ' <span class="spark" aria-hidden="true">✦</span></div>'
    + '<div class="card-sub">' + longDate(tripDate()) + '</div></div></div></div>';
  const un = unseenLogs();
  if (un.length) h += '<button class="card smaller" data-act="bell"><div class="card-head">' + ic("bell") + '<div class="flex1"><div class="card-title">' + (un.length === 1 ? 'Hay 1 novedad' : 'Hay ' + un.length + ' novedades') + '</div><div class="card-sub">' + logText(un[0]).replace(/<[^>]+>/g, "") + '</div></div>' + ic("chev", "chev") + '</div></button>';
  const ac = agencyCurs(), n = Math.max(1, people().length);
  if (!ac.length) h += '<button class="card important" data-act="panel" data-panel="package"><div class="card-head">' + ic("cuota") + '<div class="flex1"><div class="card-title">Paquete</div><div class="card-sub">Tocá acá para cargar cuánto cuesta el viaje con la agencia.</div></div>' + ic("chev", "chev") + '</div></button>';
  ac.forEach(c => {
    const C = R[c], p = pct(C.cuotaTotal, C.total);
    h += '<div class="card important"><div class="card-head">' + ic("cuota") + '<div class="flex1"><div class="card-title">Paquete' + (ac.length > 1 ? ' · ' + CUR_NAME[c].toLowerCase() : '') + '</div>'
      + '<div class="big-number">' + (C.total > 0 ? moneyR(C.total, c) : 'Sin costo cargado') + '</div></div><span class="mini-tag">' + Math.round(p) + ' %</span></div>' + bar(p)
      + '<div class="row" style="margin-top:6px"><span class="subtle">Pagado ' + money(C.cuotaTotal, c, 0) + (C.total > 0 ? (C.left > 0.005 ? ' · falta ' + money(C.left, c, 0) + ' (' + money(C.left / n, c, 0) + ' c/u)' : ' · ¡completo!') : '') + '</span>'
      + '<button class="secondary-btn xs" data-act="filter-go" data-filter="cuota">Ver cuotas ›</button></div></div>';
  });
  const MP = millasPlan(), mp = pct(MP.S.total, MP.C.goal);
  h += '<div class="card important"><div class="card-head">' + ic("plane") + '<div class="flex1"><div class="card-title">Millas Smiles</div><div class="big-number" style="font-size:21px">' + fmtMiles(MP.S.total) + ' <small>/ ' + fmtMiles(MP.C.goal) + '</small></div></div><span class="mini-tag">' + Math.round(mp) + ' %</span></div>'
    + bar(mp) + '<button class="inline-action" data-act="tab" data-tab="millas">Ver progreso y aportes ›</button></div>';
  const up = upcoming();
  h += '<div class="card smaller"><div class="card-head" style="align-items:flex-start">' + ic("cal") + '<div class="flex1"><div class="card-title" style="margin-bottom:4px">Próximas cuotas</div>';
  if (!up.length) h += '<div class="card-sub">No hay cuotas pendientes. Podés cargar un plan en Ajustes › Paquete y cuotas.</div>';
  up.slice(0, 4).forEach(u => {
    if (u.type === "plan") {
      const p = u.p, st = u.st;
      h += '<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><div class="flex1"><div style="font-weight:900;font-size:13px">• ' + esc(p.title) + ' (' + st.n + ' de ' + p.count + ')</div>'
        + '<div class="card-sub">' + (st.overdue ? '<span class="pill over">Vencida</span> ' : '') + 'vence ' + shortDate(st.due) + ' · paga ' + esc(pname(p.from)) + ' · ' + money(p.amount, p.cur, 0) + '</div></div>'
        + '<button class="secondary-btn xs" data-act="plan-pay" data-id="' + esc(p.id) + '">Registrar</button></div>';
    } else {
      h += '<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><div class="flex1"><div style="font-weight:900;font-size:13px">• Compra de millas (' + monthName(today().slice(0, 7), true) + ')</div>'
        + '<div class="card-sub">' + esc(u.person.name) + ' · faltan ' + fmtMiles(u.per) + ' millas este mes</div></div>'
        + '<button class="secondary-btn xs" data-act="miles-pay" data-pid="' + esc(u.person.id) + '">Registrar</button></div>';
    }
  });
  if (up.length > 4) h += '<div class="card-sub" style="margin-top:4px">y ' + (up.length - 4) + ' más</div>';
  h += '</div></div></div>';
  const BS = budgetStats();
  if (BS && BS.during) {
    const p = pct(BS.todaySpent, BS.B.daily), left = BS.B.daily - BS.todaySpent;
    h += '<div class="card smaller"><div class="card-head">' + ic("wallet") + '<div class="flex1"><div class="card-sub">Presupuesto de hoy · día ' + BS.dayN + ' de ' + BS.days + '</div><div class="big-number" style="font-size:20px">' + money(BS.todaySpent, BS.B.cur, 0) + ' <small>de ' + money(BS.B.daily, BS.B.cur, 0) + '</small></div></div></div>'
      + bar(p, left < 0 ? "over" : "") + '<div class="subtle" style="margin-top:6px">' + (left >= 0 ? 'Quedan ' + money(left, BS.B.cur, 0) + ' para hoy' : 'Se pasaron ' + money(-left, BS.B.cur, 0) + ' hoy') + ' · promedio ' + money(BS.avg, BS.B.cur, 0) + '/día</div></div>';
  }
  const settles = allSettles(R);
  h += '<button class="card smaller" data-act="tab" data-tab="saldos"><div class="card-head">' + ic("users") + '<div class="flex1"><div class="card-title">Saldos</div><div class="card-sub">'
    + (settles.length ? settles.map(o => esc(pname(o.s.from)) + ' le debe a ' + esc(pname(o.s.to)) + ' ' + money(o.s.amount, o.s.cur)).join(" · ") : '¡Están a mano!') + '</div></div>' + ic("chev", "chev") + '</div></button>';
  h += addBtn();
  const last = sortEntries(entries).slice(0, 3);
  h += '<div class="card smaller"><div class="row"><div><div class="card-title">💫 Últimos movimientos</div><div class="subtle">Lo más reciente del viaje</div></div>'
    + (entries.length ? '<button class="inline-action" data-act="filter-go" data-filter="todo">Ver todos ›</button>' : '') + '</div>'
    + (last.length ? last.map(entryRow).join("") : '<p class="note">Todavía no hay pagos. Tocá "Añadir pago" cuando paguen una cuota, los aéreos o algo allá.</p>') + '</div>';
  return h + '</div>';
}

// ---------- Pagos ----------
const FILTERS = [["todo", "Todos", null], ["cuota", "Agencia", "cuota"], ["aereo", "Aéreos", "plane"], ["gasto", "Allá", "gasto"], ["transfer", "Transferencias", "transfer"]];
function renderPagos(R) {
  let h = hero("pagos") + '<div class="page-content">';
  h += '<div class="filterbar" role="group" aria-label="Filtrar movimientos">' + FILTERS.map(f => '<button class="filter" data-act="filter" data-filter="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '"'
    + (f[2] ? ' aria-label="' + f[1] + '" title="' + f[1] + '">' + ICON[f[2]] + (filter === f[0] ? '<span>' + f[1] + '</span>' : '') : '>' + f[1]) + '</button>').join("") + '</div>';
  const fl = FILTERS.find(f => f[0] === filter) || FILTERS[0];
  const kindTot = { cuota: "cuotaTotal", gasto: "gastoTotal" }[filter];
  if (kindTot) {
    const cs = CURS.filter(c => R[c][kindTot] > 0);
    if (cs.length) h += '<div class="card smaller sums">' + cs.map(c => '<div class="sum"><div class="card-sub">Total ' + fl[1].toLowerCase() + ' · ' + CUR_NAME[c].toLowerCase() + '</div><div class="big-number" style="font-size:20px">' + money(R[c][kindTot], c) + '</div>'
      + (filter !== "cuota" ? '<div class="subtle">' + money(R[c][kindTot] / Math.max(1, people().length), c) + ' por persona</div>' : '') + '</div>').join("") + '</div>';
  }
  if (filter === "aereo") h += '<button class="card smaller" data-act="tab" data-tab="millas"><div class="card-head">' + ic("plane") + '<div class="flex1"><div class="card-title">Millas Smiles</div><div class="card-sub">' + fmtMiles(millasStats().total) + ' millas juntadas · ver meta, ritmo y aportes</div></div>' + ic("chev", "chev") + '</div></button>' + renderTasas();
  if (filter === "gasto") h += renderBudget();
  const list = sortEntries(filter === "todo" ? entries : entries.filter(e => e.kind === filter));
  h += '<div class="row"><div class="page-heading"><h2>Movimientos</h2></div><span class="subtle">' + list.length + (list.length === 1 ? ' registro' : ' registros') + '</span></div>';
  if (!list.length) h += emptyCard("No hay pagos acá", 'Tocá "Añadir pago" para cargar el primero.');
  else {
    const groups = []; list.forEach(e => { const k = (e.date || "").slice(0, 7) || "—"; let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k, items: [] }); g.items.push(e); });
    groups.forEach(g => { h += '<div class="month">' + (g.k === "—" ? "Sin fecha" : capital(monthName(g.k))) + '</div><div class="card entry-list">' + g.items.map(entryRow).join("") + '</div>'; });
  }
  h += '<div class="hint">ℹ️ Los importes en US$ y en $ se mantienen separados. La compra de millas propias no genera deuda entre ustedes.</div>';
  return h + addBtn() + '</div>';
}
function putBlock(label, c, total, by, key) {
  const n = Math.max(1, people().length);
  let h = '<div style="margin-top:8px"><div class="card-sub">' + label + ' · ' + CUR_NAME[c].toLowerCase() + '</div><div class="big-number" style="font-size:20px">' + money(total, c) + '</div>'
    + '<div class="subtle">A cada uno le toca ' + money(total / n, c) + '</div>';
  people().forEach(p => { const v = (by[p.id] && by[p.id][key]) || 0; h += '<div class="unify-row"><span>' + esc(p.name) + ' puso</span><strong>' + money(v, c) + '</strong></div>'; });
  return h + '</div>';
}
function renderTasas() {
  const AS = aereoStats(), tc = CURS.filter(c => AS.cur[c] && AS.cur[c].tasas > 0);
  return '<div class="card smaller"><div class="card-head">' + ic("info") + '<div class="flex1"><div class="card-title">Tasas e impuestos</div><div class="card-sub">Se dividen 50/50 y entran en los saldos.</div></div></div>'
    + (tc.length ? tc.map(c => putBlock("Total tasas", c, AS.cur[c].tasas, AS.cur[c].by, "tasas")).join("") : '<p class="note">Todavía no cargaron tasas.</p>') + '</div>';
}
function renderBudget() {
  const BS = budgetStats();
  if (!BS) return '<button class="card smaller" data-act="panel" data-panel="budget"><div class="card-head">' + ic("wallet") + '<div class="flex1"><div class="card-title">Definí un presupuesto por día</div><div class="card-sub">Tocá acá para cargarlo y ver si van bien durante el viaje.</div></div>' + ic("chev", "chev") + '</div></button>';
  const p = pct(BS.spent, BS.total);
  let h = '<div class="card smaller"><div class="card-head">' + ic("wallet") + '<div class="flex1"><div class="card-sub">Presupuesto para allá</div><div class="big-number" style="font-size:20px">' + money(BS.spent, BS.B.cur, 0) + ' <small>de ' + money(BS.total, BS.B.cur, 0) + '</small></div></div></div>'
    + bar(p, BS.spent > BS.total ? "over" : "")
    + '<div class="subtle" style="margin-top:6px">' + money(BS.B.daily, BS.B.cur, 0) + ' por día × ' + BS.days + ' días' + (BS.dayN ? ' · promedio ' + money(BS.avg, BS.B.cur, 0) + '/día' : '') + '</div>';
  if (BS.during) h += '<div class="subtle"><strong>Hoy:</strong> ' + money(BS.todaySpent, BS.B.cur, 0) + ' de ' + money(BS.B.daily, BS.B.cur, 0) + '</div>';
  if (BS.other) h += '<div class="subtle">' + BS.other + ' gasto(s) en otra moneda no se cuentan: cargá el tipo de cambio en Ajustes.</div>';
  return h + '</div>';
}

// ---------- Saldos ----------
let saldosView = ls.get("saldosView", "persona"), settleOpen = false, unifyOn = ls.get("unify", "") === "1";
function waLink(s) {
  const txt = "Cuentas del Viaje ✨\n" + pname(s.from) + " le debe a " + pname(s.to) + " " + money(s.amount, s.cur) + " (al " + shortDate(today()) + ").";
  return "https://wa.me/?text=" + encodeURIComponent(txt);
}
function debtCard(o) {
  const s = o.s;
  return '<div class="card cream smaller debt-card">' + ic("info") + '<div class="flex1"><div class="card-sub" style="font-size:13px">' + esc(pname(s.from)) + ' le debe a ' + esc(pname(s.to)) + '</div><div class="debt-amt">' + moneyR(s.amount, s.cur) + '</div></div>'
    + '<a class="wa-btn" target="_blank" rel="noopener" href="' + waLink(s) + '">' + ICON.whatsapp + '<span>Avisar por<br>WhatsApp</span></a></div>';
}
function renderSaldos(R) {
  let h = hero("saldos") + '<div class="page-content">';
  h += '<div class="segment" role="group" aria-label="Vista de saldos"><button data-act="sview" data-v="persona" aria-pressed="' + (saldosView !== "neteo") + '">Por persona</button><button data-act="sview" data-v="neteo" aria-pressed="' + (saldosView === "neteo") + '">Neteo</button></div>';
  const cs = CURS.filter(c => entries.some(e => (e.cur || "USD") === c && !isMillas(e)));
  const settles = allSettles(R);
  if (saldosView !== "neteo") {
    if (!cs.length) h += emptyCard("Todavía no hay saldos", "Cuando carguen pagos compartidos, acá ven cuánto puso cada uno.");
    cs.forEach(c => {
      if (cs.length > 1) h += '<div class="section-caption">En ' + CUR_NAME[c].toLowerCase() + '</div>';
      R[c].people.forEach(x => {
        const b = x.balance, cls = b > 0.005 ? "pos" : b < -0.005 ? "neg" : "zero";
        h += '<div class="card smaller person-card"><span class="avatar" aria-hidden="true">' + ICON.user + '</span><div class="flex1"><div class="card-title">' + esc(x.p.name) + '</div><div class="card-sub">Saldo neto</div></div>'
          + '<span class="bal-pill ' + cls + '">' + (cls === "pos" ? "+ " : cls === "neg" ? "− " : "") + moneyR(Math.abs(b), c) + '</span></div>';
      });
    });
    if (cs.length) h += settles.length ? settles.map(debtCard).join("") : emptyCard("¡Están a mano!", "Nadie le debe nada a nadie.");
  } else {
    h += '<div class="section-caption">Quién le debe a quién</div>';
    h += settles.length ? settles.map(debtCard).join("") : emptyCard("¡Están a mano!", "Nadie le debe nada a nadie.");
    const ac = agencyCurs();
    if (ac.length && people().length) {
      h += '<div class="card smaller"><div class="card-title">Lo que aportó cada uno a la agencia</div>';
      people().forEach(p => {
        ac.forEach(c => {
          const x = R[c].people.find(y => y.p.id === p.id); if (!x) return;
          h += '<div style="margin-top:10px"><div class="row"><strong style="font-size:14px">' + esc(p.name) + '</strong><span class="subtle">' + money(x.aporte, c, 0) + ' de ' + money(x.toca, c, 0) + ' · ' + (x.falta > 0.005 ? 'falta ' + money(x.falta, c, 0) : '¡completo!') + '</span></div>'
            + bar(pct(Math.max(0, x.aporte), x.toca), "thin") + '</div>';
        });
      });
      h += '</div>';
    }
    const tl = sortEntries(entries.filter(e => e.kind === "transfer"));
    h += '<div class="section-caption">Transferencias</div>' + (tl.length ? '<div class="card entry-list" style="border-radius:18px">' + tl.map(entryRow).join("") + '</div>' : emptyCard("Sin transferencias", "Cuando uno le pase plata al otro para emparejar, queda acá."));
  }
  h += renderUnify(R);
  if (settles.length) h += '<button class="outline-btn" data-act="settle-open">' + ICON.check + 'Marcar como saldado</button>';
  h += '<p class="tiny-note" style="text-align:center;margin:8px 4px 0">Dólares y pesos se cuentan por separado: lo que se debe en pesos se devuelve en pesos, y lo que se debe en dólares, en dólares.</p>';
  return h + renderExplain(R) + '</div>';
}
function unifiedSettle(R) {
  const fx = fxRate(); if (!fx) return null;
  return minSettle(people().map(p => {
    const u = R.USD.people.find(x => x.p.id === p.id), a = R.ARS.people.find(x => x.p.id === p.id);
    return { id: p.id, v: r2((u ? u.balance : 0) + (a ? a.balance : 0) / fx) };
  }), "USD");
}
function renderUnify(R) {
  const fx = fxRate(), anyDebt = R.USD.settle.length + R.ARS.settle.length;
  let h = '<div class="card smaller"><label class="switch-row"><span><span class="card-title" style="font-size:15px;display:block">Unificar en US$</span><span class="card-sub">' + (fx ? 'Tipo de cambio $ ' + new Intl.NumberFormat("es-AR").format(fx) + ' por US$' : 'Usa el tipo de cambio que acuerden') + '</span></span>'
    + '<input type="checkbox" id="unify-toggle"' + (unifyOn ? ' checked' : '') + ' aria-label="Unificar las deudas en dólares"></label>';
  if (unifyOn) {
    h += '<label>Tipo de cambio ($ por US$)<input id="set-fx" type="number" min="0" step="0.01" inputmode="decimal" value="' + (fx || "") + '" placeholder="Ej: 1200 (MEP, tarjeta…)"></label>';
    const U = unifiedSettle(R);
    if (!fx) h += '<p class="note">Cargá el tipo de cambio y la app junta las deudas en pesos y en dólares en un solo número.</p>';
    else if (!U.length) h += '<p class="note">Con este tipo de cambio quedan a mano.</p>';
    else h += '<div class="section-caption" style="margin-left:0">Saldo combinado aproximado</div>' + U.map(s => '<div class="unify-row"><span>' + esc(pname(s.from)) + ' le debe a ' + esc(pname(s.to)) + '</span><strong>' + money(s.amount, "USD") + '</strong></div>').join("")
      + '<p class="tiny-note">Equivale a todo lo de arriba, al tipo de $ ' + new Intl.NumberFormat("es-AR").format(fx) + ' (también son ' + money(U[0].amount * fx, "ARS", 0) + '). Es una conversión de referencia: no cambia los importes originales.</p>'
      + (anyDebt ? '<button class="btn-ghost" data-act="settle-all">Ya lo pagaron así: marcar todo como saldado</button>' : '');
  }
  return h + '</div>';
}
function renderExplain(R) {
  const cs = CURS.filter(c => entries.some(e => (e.cur || "USD") === c && e.kind !== "transfer" && !isMillas(e)));
  let h = '<details class="cfg explain"><summary><span>¿Cómo se calcula? ' + ICON.chevDown + '</span></summary><div class="card smaller">';
  cs.forEach(c => {
    h += '<div class="card-sub">' + CUR_NAME[c] + '</div><table class="xt"><thead><tr><th></th><th>Puso</th><th>Le tocaba</th><th>Saldo</th></tr></thead><tbody>';
    R[c].people.forEach(x => {
      h += '<tr><td>' + esc(x.p.name) + '</td><td>' + money(x.paid, c, 0) + '</td><td>' + money(x.owed, c, 0) + '</td><td class="' + (x.balance >= 0 ? 'pos' : 'neg') + '">' + (x.balance >= 0 ? '+' : '−') + money(Math.abs(x.balance), c, 0) + '</td></tr>';
    });
    h += '</tbody></table>';
  });
  return h + '<p class="tiny-note">"Puso" suma todo lo que pagó (cuotas, tasas, gastos y transferencias enviadas, menos las recibidas). "Le tocaba" es su parte de cada gasto compartido. Si Juan paga US$ 100 para los dos, Melina le debe US$ 50. '
    + '<b>Millas:</b> cada uno paga las suyas, no se dividen. <b>Tasas:</b> se dividen 50/50. <b>Transferencias:</b> reducen la deuda, no son un gasto nuevo. Saldo positivo: le deben; negativo: debe.</p></div></details>';
}
function renderSettleSheet(R) {
  const settles = allSettles(R);
  return overlay("Saldar cuentas", '<p class="hint">Se registra como una transferencia de quien debe a quien le deben. Cada moneda se salda por separado.</p>'
    + (settles.length ? settles.map(o => '<div class="settle-row"><div class="flex1"><strong>' + esc(pname(o.s.from)) + ' → ' + esc(pname(o.s.to)) + '</strong><div class="subtle">' + CUR_NAME[o.s.cur] + '</div></div>'
      + '<button class="secondary-btn" data-act="settle" data-cur="' + o.s.cur + '" data-k="' + o.k + '">' + ICON.check + 'Saldar ' + money(o.s.amount, o.s.cur) + '</button></div>').join("") : '<p class="note">No hay deudas pendientes.</p>'));
}

// ---------- Millas ----------
function millasByMonth() {
  const M = {};
  entries.forEach(e => { if (!isMillas(e)) return; const k = (e.date || "").slice(0, 7); if (!k) return; (M[k] = M[k] || {})[e.from] = ((M[k] || {})[e.from] || 0) + (+e.miles || 0); });
  return M;
}
function renderMillas() {
  const MP = millasPlan(), C = MP.C, S = MP.S, half = C.goal / 2, cm = today().slice(0, 7), p = pct(S.total, C.goal);
  let h = hero("millas") + '<div class="page-content">';
  h += '<div class="card important"><div class="card-head">' + ic("flag") + '<div class="flex1"><div class="card-sub">Meta total · cuenta Smiles de Melina</div><div class="big-number">' + fmtMiles(C.goal) + ' millas</div></div><span class="mini-tag">' + Math.round(p) + ' %</span></div>'
    + bar(p) + '<div class="tiny-note" style="margin-top:8px">' + fmtMiles(S.total) + ' acumuladas · ' + (MP.remaining > 0 ? 'faltan ' + fmtMiles(MP.remaining) : '¡meta cumplida!') + '</div>'
    + '<div class="hint" style="margin-bottom:0">✈️ Ida: ' + fmtMiles(half) + ' millas ' + (S.total >= half ? '✓ alcanzada' : '· faltan ' + fmtMiles(half - S.total)) + '<br>✈️ Vuelta: ' + fmtMiles(half) + ' millas ' + (MP.remaining <= 0 ? '✓ alcanzada' : '· faltan ' + fmtMiles(Math.min(half, MP.remaining))) + '</div></div>';
  h += '<div class="miles-grid">';
  people().forEach(pp => {
    const v = S.by[pp.id] || 0, per = C.goal / MP.n, paid = CURS.filter(c => S.money[c] && S.money[c][pp.id]).map(c => money(S.money[c][pp.id], c, 0)).join(" + ");
    h += '<div class="mile-person"><div class="who">' + ICON.user + esc(pp.name) + '</div><div class="val">' + fmtMiles(v) + ' <span class="subtle">/ ' + fmtMiles(per) + '</span></div>' + bar(pct(v, per), "thin")
      + (paid ? '<div class="tiny-note" style="margin-top:5px">Puso ' + paid + '</div>' : '') + '</div>';
  });
  h += '</div>';
  h += '<div class="card cream smaller"><div class="card-head" style="align-items:flex-start">' + ic("cal") + '<div class="flex1"><div class="card-sub">Ritmo actual</div><div class="big-number" style="font-size:21px">' + fmtMiles(C.monthly) + ' <small>millas/mes</small></div>'
    + '<div class="tiny-note">' + fmtMiles(MP.per) + ' por persona, a la cuenta Smiles de Melina · fecha límite ' + monthName(C.deadline) + '</div>'
    + (MP.remaining <= 0 ? '<div class="ok-line">' + ICON.check + '¡Ya juntaron todas las millas!</div>'
      : MP.ok ? '<div class="ok-line">' + ICON.check + '¡Llegan en ' + monthName(MP.eta) + '!</div>'
      : '<div class="warn-line">' + ICON.warn + '<span>A este ritmo llegarían en ' + monthName(MP.eta) + '. Para llegar a ' + monthName(C.deadline) + ' necesitan unas ' + fmtMiles(MP.needPerMonth) + ' por mes.</span></div>')
    + '</div></div></div>';
  // Aportes mes a mes (con lo que está cargado de verdad)
  const BM = millasByMonth(), ks = Object.keys(BM).sort();
  let start = ks.length && ks[0] < cm ? ks[0] : cm; const end = C.deadline > start ? C.deadline : start;
  const months = []; for (let k = start, i = 0; k <= end && i < 30; k = monthAdd(k, 1), i++) months.push(k);
  h += '<div class="card smaller"><div class="card-title">Aportes mensuales</div><div class="tiny-note">Cada uno aporta sus millas; no se dividen ni generan deuda.</div>';
  months.forEach(k => {
    const m = BM[k] || {}, sum = Object.keys(m).reduce((a, id) => a + m[id], 0);
    const done = people().filter(pp => (m[pp.id] || 0) >= MP.per - 0.5).length, all = done === people().length && people().length;
    h += '<div class="month-row"><span class="mcheck' + (all ? ' on' : done ? ' half' : '') + '" aria-hidden="true">' + (all ? ICON.check : '') + '</span><div class="flex1"><div class="month-label">' + capital(monthName(k, true)) + (k === cm ? ' · este mes' : '') + '</div><div class="month-people">';
    people().forEach(pp => {
      const v = m[pp.id] || 0, ok = v >= MP.per - 0.5;
      if (ok) h += '<span class="mp-chip done">' + ICON.check + esc(pp.name) + ' +' + fmtMiles(v) + '</span>';
      else if (k <= cm) h += '<button class="mp-chip" data-act="miles-pay" data-pid="' + esc(pp.id) + '" data-month="' + k + '" aria-label="Registrar millas de ' + esc(pp.name) + ' en ' + monthName(k) + '">' + ICON.plus + esc(pp.name) + (v ? ' ' + fmtMiles(v) : '') + ' · registrar</button>';
      else h += '<span class="mp-chip">' + esc(pp.name) + ' · pendiente</span>';
    });
    h += '</div></div><span class="month-sum">' + (sum ? '+' + fmtMiles(sum) : '+' + fmtMiles(C.monthly)) + '</span></div>';
  });
  h += '</div>';
  h += renderTasas();
  h += '<details class="card smaller cfg"><summary class="row"><span class="card-title" style="font-size:15px">⚙ Editar meta y ritmo</span>' + ic("chevDown", "chev") + '</summary>' + milesFields() + '</details>';
  return h + '</div>';
}
function milesFields() {
  const C = millasCfg();
  return '<label>Meta total de millas (ida y vuelta, los dos)<input id="set-goal" type="number" min="0" step="1000" inputmode="numeric" value="' + C.goal + '"></label>'
    + '<label>Juntan por mes entre los dos<input id="set-mmonthly" type="number" min="0" step="1000" inputmode="numeric" value="' + C.monthly + '"></label>'
    + '<label>Fecha límite para sacar los pasajes<input id="set-mdeadline" type="month" value="' + esc(C.deadline) + '"></label>'
    + '<p class="tiny-note">Los cambios se guardan al salir de cada campo. Los aportes ya cargados no se modifican.</p>';
}

// ---------- Añadir / editar pago ----------
function renderAdd() {
  const k = sheet.kind, mill = k === "aereo" && sheet.sub === "millas";
  let h = hero("anadir", '<button class="hero-back" data-act="close" aria-label="Volver sin guardar"></button>') + '<div class="page-content compact">';
  h += '<div class="backrow"><button class="backbtn" data-act="close">' + ICON.back + 'Volver</button><span class="subtle">' + (sheet.id ? "Editar movimiento" : "Nuevo movimiento") + '</span></div>';
  h += '<form class="form-card" data-form="sheet" aria-labelledby="add-q"><h3 id="add-q">¿Qué vas a registrar?</h3><div class="category-grid" role="group" aria-label="Tipo de movimiento">'
    + ["cuota", "aereo", "gasto", "transfer"].map(x => '<button type="button" class="category-btn" data-act="kind" data-kind="' + x + '" aria-pressed="' + (k === x) + '"><span class="tick" aria-hidden="true">' + ICON.check + '</span>' + ICON[x] + '<span>' + KIND_LABEL[x] + '</span></button>').join("") + '</div>';
  if (k === "aereo") h += '<div class="field"><span class="lbl">Tipo de aéreo</span><div class="radio-row" role="group" aria-label="Tipo de aéreo">' + [["millas", "Compra de millas"], ["tasas", "Tasas e impuestos"]].map(s =>
    '<button type="button" data-act="sub" data-sub="' + s[0] + '" aria-pressed="' + (sheet.sub === s[0]) + '">' + s[1] + '</button>').join("") + '</div></div>';
  const hint = { cuota: "Una cuota que uno de ustedes le pagó a la agencia. Se descuenta del costo del paquete.",
    aereo: mill ? "Millas que aporta cada uno a la cuenta Smiles de Melina. No se dividen: cada uno pone las suyas. Si las compraste, poné cuánto pagaste."
      : "Tasas o impuestos de los vuelos con Smiles. Se dividen 50/50 y no se descuentan del costo de la agencia.",
    gasto: "Algo que pagó uno durante el viaje. No se descuenta del costo del paquete.",
    transfer: "Plata que uno le pasó al otro para emparejar las cuentas. Reduce la deuda; no es un gasto nuevo." }[k];
  h += '<p class="hint">' + hint + '</p>';
  if (k !== "transfer") h += '<div class="field"><label class="lbl" for="sh-title">' + (mill ? 'Descripción (opcional)' : 'Descripción') + '</label><input id="sh-title" data-f="title" value="' + esc(sheet.title) + '" maxlength="60" placeholder="'
    + (mill ? "Ej: Compra con promo" : ({ cuota: "Ej: Cuota agencia · dic 2026", aereo: "Ej: Impuestos vuelo ida", gasto: "Ej: Cena, Souvenirs, Uber" })[k]) + '"' + (mill ? '' : ' required') + '></div>';
  const pills = (who, sel) => '<div class="radio-row' + (people().length > 2 ? ' many' : '') + '" role="group">' + people().map(p => '<button type="button" data-act="who" data-who="' + who + '" data-id="' + esc(p.id) + '" aria-pressed="' + (sel === p.id) + '">' + ICON.user + esc(p.name) + '</button>').join("") + '</div>';
  h += '<div class="field"><span class="lbl">' + (k === "transfer" ? "¿Quién transfirió?" : mill ? "¿Quién aportó?" : "¿Quién pagó?") + '</span>' + pills("from", sheet.from) + '</div>';
  if (k === "transfer") h += '<div class="field"><span class="lbl">¿A quién?</span>' + pills("to", sheet.to) + '</div>';
  h += '<div class="money-head"><label class="lbl" for="sh-amount">' + (mill ? 'Cuánto pagaste (opcional)' : 'Monto') + '</label><div class="cur-switch" role="group" aria-label="Moneda">'
    + CURS.map(c => '<button type="button" data-act="cur" data-cur="' + c + '" aria-pressed="' + (sheet.cur === c) + '" aria-label="' + CUR_NAME[c] + '">' + (c === "USD" ? "US$" : "$") + '</button>').join("") + '</div></div>'
    + '<input id="sh-amount" data-f="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="' + esc(sheet.amount) + '" placeholder="' + (sheet.cur === "USD" ? "US$ 0,00" : "$ 0,00") + '"' + (mill ? '' : ' required') + '>';
  if (mill) h += '<div class="field"><label class="lbl" for="sh-miles">Millas recibidas</label><input id="sh-miles" data-f="miles" type="number" min="1" step="1" inputmode="numeric" value="' + esc(sheet.miles) + '" placeholder="Ej: 20000" required></div>';
  h += '<div class="field"><label class="lbl" for="sh-date">Fecha</label><input id="sh-date" data-f="date" type="date" value="' + esc(sheet.date) + '"></div>';
  if (k !== "transfer" && !mill) {
    h += '<div class="field"><span class="lbl">¿Entre quiénes se divide?</span><div class="split-pills">';
    people().forEach(p => {
      const on = sheet.split.indexOf(p.id) >= 0;
      h += '<label class="split-pill"><input type="checkbox" id="sp-' + esc(p.id) + '" data-split="' + esc(p.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(p.name) + '</span><span class="split-amt" data-amt="' + esc(p.id) + '"></span></label>';
    });
    h += '</div><p class="tiny-note" style="margin:6px 2px 0">' + (k === "aereo" ? "Las tasas e impuestos se dividen 50/50." : "En partes iguales entre los que marques. Si es un gasto propio, dejá marcado solo a quien pagó.") + '</p></div>';
    h += '<label class="scan' + (sheet.scanning ? ' busy' : '') + '"><input type="file" id="scan-file" accept="image/*" hidden>' + ICON.camera + (sheet.scanning ? 'Leyendo el ticket…' : 'Escanear ticket con IA') + '</label>'
      + (sheet.scanMsg ? '<p class="ok">' + esc(sheet.scanMsg) + '</p>' : '');
  }
  if (mill) h += '<p class="tiny-note" style="margin:8px 2px 0">✈️ Cada uno paga sus millas: no genera deuda.</p>';
  if (sheet.by) h += '<p class="tiny-note" style="margin-top:10px">Cargado por ' + esc(whoName(sheet.by)) + (sheet.created ? ' · ' + logWhen(sheet.created) : '') + '</p>';
  if (sheet.error) h += '<p class="err" role="alert">' + esc(sheet.error) + '</p>';
  h += '<div class="form-actions">';
  if (sheet.id) h += sheet.confirmDel
    ? '<button type="button" class="btn-danger" data-act="sheet-del-yes">Sí, eliminar</button><button type="button" class="secondary-btn" data-act="sheet-del-no">No</button>'
    : '<button type="button" class="btn-danger" data-act="sheet-del">Eliminar</button>';
  return h + '<button type="submit" class="primary">' + ICON.wand + (sheet.id ? 'Guardar cambios' : 'Guardar pago') + '</button></div></form></div>';
}
function updateSplitAmounts() {
  if (!sheet || sheet.kind === "transfer") return;
  const a = +sheet.amount || 0, n = sheet.split.length;
  people().forEach(p => {
    const el = root.querySelector('[data-amt="' + CSS.escape(p.id) + '"]');
    if (el) el.textContent = sheet.split.indexOf(p.id) >= 0 && n ? money(a / n, sheet.cur) : money(0, sheet.cur);
  });
}

// ---------- Ajustes ----------
let panel = null;
function renderAjustes() {
  const t = totals(), C = millasCfg(), B = budget(), fx = fxRate(), nUn = unseenLogs().length;
  const items = [
    ["trip", "cal", "Datos del viaje", fullDate(tripDate())],
    ["members", "users", "Integrantes", people().map(p => p.name).join(" y ") || "Agregá a los viajeros"],
    ["package", "card", "Paquete y cuotas", [t.USD ? money(t.USD, "USD", 0) : "", t.ARS ? money(t.ARS, "ARS", 0) : ""].filter(Boolean).join(" + ") || "Cargá el costo y los planes de cuotas"],
    ["miles", "plane", "Millas Smiles", "Meta: " + fmtMiles(C.goal)],
    ["budget", "wallet", "Presupuesto del viaje", B.daily ? money(B.daily, B.cur, 0) + " por día" + (B.end ? " · vuelta " + fullDate(B.end) : "") : "Gasto diario y fecha de vuelta"],
    ["fx", "transfer", "Tipo de cambio", fx ? "$ " + new Intl.NumberFormat("es-AR").format(fx) + " por US$" : "US$ ↔ $"],
    ["history", "bell", "Novedades e historial", nUn ? nUn + " sin ver" : "Quién cargó, editó o borró cada cosa"],
    ["backup", "cloud", "Copia de seguridad", "Copiar todos los datos como texto"],
    ["theme", THEME_ICON[themePref()], "Apariencia", THEME_LABEL[themePref()] + (themePref() === "auto" ? " · según la hora de Buenos Aires" : "")]
  ];
  let h = hero("ajustes") + '<div class="page-content compact">';
  h += items.map(i => '<button class="settings-item" data-act="' + (i[0] === "history" ? "bell" : "panel") + '" data-panel="' + i[0] + '"><span class="settings-icon" aria-hidden="true">' + ICON[i[1]] + '</span><span class="flex1"><strong>' + i[2] + (i[0] === "history" && nUn ? '<span class="badge">' + nUn + '</span>' : '') + '</strong><small>' + esc(i[3]) + '</small></span>' + ic("chev", "chev") + '</button>').join("");
  return h + '<p class="who-line">Conectado como ' + esc(user.email) + ' · <button class="linkish" data-act="logout">Salir</button></p></div>';
}
function renderPanel() {
  const t = totals(), B = budget(), fx = fxRate();
  const opt = (arr, sel) => arr.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join("");
  const done = '<button class="primary" style="margin-top:16px" data-act="close">Listo</button>';
  if (panel === "trip") return overlay("Datos del viaje", '<label>Nombre del viaje<input id="set-name" value="' + esc(trip.tripName || "") + '"></label>'
    + '<label>Fecha de salida<input id="set-date" type="date" value="' + esc(tripDate()) + '"></label><p class="tiny-note">El encabezado muestra «Viaje a Disney». La cuenta regresiva usa esta fecha.</p>' + done);
  if (panel === "members") {
    let h = '';
    people().forEach(p => {
      h += '<div class="person-edit"><input id="pn-' + esc(p.id) + '" data-act="pname" data-id="' + esc(p.id) + '" value="' + esc(p.name) + '" aria-label="Nombre de ' + esc(p.name) + '">'
        + (confirmPerson === p.id ? '<button class="btn-danger" data-act="person-del-yes" data-id="' + esc(p.id) + '">Borrar</button><button class="secondary-btn" data-act="person-del-no">No</button>'
          : '<button class="icon-btn" data-act="person-del" data-id="' + esc(p.id) + '" aria-label="Borrar a ' + esc(p.name) + '">' + ICON.close + '</button>') + '</div>';
    });
    if (confirmPerson) h += '<p class="err">Se borran también sus pagos y transferencias.</p>';
    h += '<form class="inline-add" data-form="person"><input id="np-name" name="name" placeholder="Nombre de otro viajero" required aria-label="Nombre de otro viajero"><button class="secondary-btn" type="submit">Agregar</button></form>'
      + '<p class="tiny-note" style="margin-top:10px">Los mails que pueden entrar siguen configurados en Firebase y no se cambian desde acá.</p>';
    return overlay("Integrantes", h + done);
  }
  if (panel === "package") {
    let h = '<label>Costo del paquete en dólares (US$)<input id="set-total-USD" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(t.USD || "") + '" placeholder="0"></label>'
      + '<label>Costo del paquete en pesos ($)<input id="set-total-ARS" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(t.ARS || "") + '" placeholder="0"></label>'
      + '<p class="tiny-note">Lo que les cobra la agencia en cada moneda. Se divide en partes iguales. Los aéreos con Smiles van aparte.</p>'
      + '<h3 class="sub-title">Planes de cuotas</h3><p class="tiny-note">Cargá una vez las cuotas fijas y la app muestra en Inicio cuál toca pagar.</p>';
    plans().forEach(p => {
      const st = planStatus(p);
      h += '<div class="person-edit"><div class="mid"><span class="t">' + esc(p.title) + '</span><span class="subtle">' + money(p.amount, p.cur, 0) + ' × ' + p.count + ' · día ' + p.day + ' · ' + (st.done ? 'terminado' : 'pagadas ' + st.paid + ' de ' + p.count + ' · termina ' + monthName(st.end, true)) + '</span></div>'
        + (confirmPlan === p.id ? '<button class="btn-danger" data-act="plan-del-yes" data-id="' + esc(p.id) + '">Borrar</button><button class="secondary-btn" data-act="plan-del-no">No</button>'
          : '<button class="icon-btn" data-act="plan-del" data-id="' + esc(p.id) + '" aria-label="Borrar plan ' + esc(p.title) + '">' + ICON.close + '</button>') + '</div>';
    });
    if (confirmPlan) h += '<p class="note">Los pagos que ya registraron no se borran.</p>';
    h += '<details class="cfg"' + (plans().length ? '' : ' open') + '><summary class="secondary-btn wide" style="margin-top:10px">+ Agregar un plan</summary><form data-form="plan"><label>Nombre<input id="pl-title" name="title" required placeholder="Ej: Agencia"></label>'
      + '<div class="two"><label>Monto por cuota<input id="pl-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>'
      + '<label>Moneda<select id="pl-cur" name="cur">' + opt([["USD", "US$"], ["ARS", "$ pesos"]], "USD") + '</select></label></div>'
      + '<div class="two"><label>Cantidad de cuotas<input id="pl-count" name="count" type="number" min="1" max="60" step="1" inputmode="numeric" required></label>'
      + '<label>Día de pago<input id="pl-day" name="day" type="number" min="1" max="31" step="1" inputmode="numeric" value="10" required></label></div>'
      + '<div class="two"><label>Primera cuota<input id="pl-start" name="start" type="month" value="' + today().slice(0, 7) + '" required></label>'
      + '<label>La paga<select id="pl-from" name="from">' + opt(people().map(p => [p.id, p.name]), myId()) + '</select></label></div>'
      + '<label>Tipo<select id="pl-kind" name="kind">' + opt([["cuota", "Cuota agencia"], ["aereo", "Tasas aéreos Smiles"]], "cuota") + '</select></label>'
      + '<button class="btn" type="submit">Agregar plan</button></form></details>';
    return overlay("Paquete y cuotas", h + done);
  }
  if (panel === "miles") return overlay("Millas Smiles", milesFields() + done);
  if (panel === "budget") return overlay("Presupuesto del viaje", '<div class="two"><label>Por día<input id="set-bdaily" type="number" min="0" step="1" inputmode="decimal" value="' + (B.daily || "") + '" placeholder="Ej: 150"></label>'
    + '<label>Moneda<select id="set-bcur">' + opt([["USD", "US$"], ["ARS", "$ pesos"]], B.cur) + '</select></label></div>'
    + '<label>Fecha de vuelta<input id="set-bend" type="date" value="' + esc(B.end) + '"></label>'
    + '<p class="hint">Se compara con los «Gastos allá». Durante el viaje van a ver en Inicio cuánto gastaron hoy. No cambia los saldos.</p>' + done);
  if (panel === "fx") return overlay("Tipo de cambio", '<label>Pesos por cada US$ 1<input id="set-fx" type="number" min="0" step="0.01" inputmode="decimal" value="' + (fx || "") + '" placeholder="Ej: 1200 (MEP, tarjeta…)"></label>'
    + '<p class="hint">Se usa solo si eligen «Unificar en US$» en Saldos y para sumar gastos en otra moneda al presupuesto. Los importes originales no se convierten.</p>' + done);
  if (panel === "backup") return overlay("Copia de seguridad", '<p class="tiny-note">Copia todos los datos del viaje como texto, para guardarlos donde quieras (una nota, un mail).</p>'
    + '<button class="btn" data-act="export">' + ICON.cloud + 'Copiar copia de seguridad</button><textarea id="export-text" readonly hidden aria-label="Copia de seguridad"></textarea>' + done);
  if (panel === "theme") return overlay("Apariencia", '<div class="radio-row many" role="group" aria-label="Apariencia">' + ["auto", "day", "night"].map(k =>
    '<button type="button" data-act="theme" data-theme="' + k + '" aria-pressed="' + (themePref() === k) + '">' + ICON[THEME_ICON[k]] + THEME_LABEL[k] + '</button>').join("") + '</div>'
    + '<p class="hint">Automático: de 7:00 a 18:59 se ve de día y de 19:00 a 6:59 de noche, siempre con la hora de Buenos Aires (aunque estén en Orlando).</p>' + done);
  return "";
}
function overlay(title, inner) {
  return '<div class="overlay" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ov-title"><div class="sheet-head"><h2 id="ov-title">' + title + '</h2>'
    + '<button type="button" class="sheet-close" data-act="close" aria-label="Cerrar">×</button></div>' + inner + '</div></div>';
}

// ---------- Armado de la pantalla ----------
const TABS = [["inicio", "Inicio", "home"], ["pagos", "Pagos", "card"], ["saldos", "Saldos", "users"], ["millas", "Millas", "plane"], ["ajustes", "Ajustes", "gear"]];
function renderApp() {
  const R = compute();
  let h = '<div class="shell">' + headTools(true) + '<main id="main">';
  h += sheet ? renderAdd() : tab === "pagos" ? renderPagos(R) : tab === "saldos" ? renderSaldos(R) : tab === "millas" ? renderMillas() : tab === "ajustes" ? renderAjustes() : renderInicio(R);
  h += '</main>';
  const cur = sheet ? "pagos" : tab;
  h += '<nav class="bottom-nav" aria-label="Secciones">' + TABS.map(t => '<button data-act="tab" data-tab="' + t[0] + '"' + (cur === t[0] ? ' aria-current="page"' : '') + '>' + ICON[t[2]] + '<span>' + t[1] + '</span></button>').join("") + '</nav>';
  if (toast) h += '<div class="toast" role="status"><span>' + esc(toast) + '</span><button class="linkish" data-act="toast-ok">Ok</button></div>';
  if (bellOpen) h += renderBell();
  else if (settleOpen && !sheet) h += renderSettleSheet(R);
  else if (panel && !sheet) h += renderPanel();
  return h + '</div>';
}
function renderBell() {
  const seen = +ls.get(seenKey(), "0") || 0, me = String(user.email || "").toLowerCase();
  let h = '';
  if (!logItems.length) h += '<p class="note center">Todavía no hay cambios registrados. Cada pago que carguen, editen o borren aparece acá.</p>';
  else h += logItems.map(l => {
    const fresh = String(l.by || "").toLowerCase() !== me && (+l.at || 0) > seen;
    return '<div class="log' + (fresh ? ' fresh' : '') + '"><span class="dot" aria-hidden="true"></span><span class="mid"><span>' + logText(l) + '</span><span class="subtle">' + logWhen(l.at) + (fresh ? ' · nuevo' : '') + '</span></span></div>';
  }).join("");
  return overlay("Novedades", h);
}

function render() {
  let h;
  if (!CONFIGURED || !user || !user.emailVerified || !allowed(user.email)) h = renderAuth();
  else if (!tripLoaded || !entriesLoaded) h = authShell('<p class="note center">Cargando el viaje…</p>' + (authErr ? '<p class="err">' + esc(authErr) + '</p>' : ''));
  else if (!trip) h = renderSetup();
  else h = renderApp();
  if (!navigator.onLine) h += '<div class="offline" role="status">Sin conexión · se guarda cuando vuelva</div>';

  const active = document.activeElement && document.activeElement.id;
  const caret = active && document.activeElement.selectionStart != null ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const sh0 = root.querySelector(".sheet"), shTop = sh0 ? sh0.scrollTop : 0;
  const openDetails = Array.from(root.querySelectorAll("details[open]")).map(d => d.querySelector("summary") && d.querySelector("summary").textContent);
  const keep = {}; ["au-email", "au-pass", "imp-text", "np-name", "pl-title", "pl-amount", "pl-count", "pl-day", "pl-start", "pl-cur", "pl-from", "pl-kind"].forEach(id => { const el = document.getElementById(id); if (el) keep[id] = el.value; });
  if (active && !sheet && document.activeElement && "value" in document.activeElement && document.activeElement.type !== "checkbox") keep[active] = document.activeElement.value;
  root.innerHTML = h;
  Object.keys(keep).forEach(id => { const el = document.getElementById(id); if (el) el.value = keep[id]; });
  root.querySelectorAll("details").forEach(d => { const s = d.querySelector("summary"); if (s && openDetails.indexOf(s.textContent) >= 0) d.open = true; });
  const sh = root.querySelector(".sheet"); if (sh) sh.scrollTop = shTop;
  if (active) { const el = document.getElementById(active); if (el && el.focus) { el.focus({ preventScroll: true }); try { if (caret) el.setSelectionRange(caret[0], caret[1]); } catch (e) {} } }
  updateSplitAmounts();
}
addEventListener("online", render); addEventListener("offline", render);

// ---------- Acciones ----------
function setTab(t) { tab = t; ls.set("tab2", tab); sheet = null; panel = null; settleOpen = false; themeMenu = false; render(); window.scrollTo(0, 0); }
// Cierra solo la capa de arriba: novedades, hoja de Ajustes/Saldos o, por último, la pantalla de Añadir pago.
function closeTop() {
  if (themeMenu) themeMenu = false;
  else if (bellOpen) { markSeen(); bellOpen = false; }
  else if (settleOpen) settleOpen = false;
  else if (panel) { panel = null; confirmPerson = null; confirmPlan = null; }
  else if (sheet) { sheet = null; render(); window.scrollTo(0, 0); return; }
  render();
}
function openSheet(e) {
  const all = people().map(p => p.id);
  if (e) sheet = { by: e.by || "", plan: e.plan || null, planN: e.planN || null, id: e.id, sub: e.sub || "tasas", miles: e.miles || "", cur: e.cur || "USD", kind: e.kind, title: e.title || "", amount: e.amount, from: e.from, to: e.to || all[1] || all[0], date: e.date || today(), split: splitOf(e).slice(), confirmDel: false, created: e.created };
  else {
    const k = tab === "saldos" ? "transfer" : (tab === "pagos" && filter !== "todo") ? filter : "cuota";
    sheet = { id: null, sub: "millas", miles: "", cur: ls.get("lastCur", "USD"), kind: k, title: "", amount: "", from: myId() || all[0], to: all.find(x => x !== myId()) || all[0], date: today(), split: all.slice(), confirmDel: false };
  }
  panel = null; settleOpen = false; bellOpen = false; themeMenu = false;
  render(); window.scrollTo(0, 0);
}
function openSheetWith(preset) {
  openSheet(null); Object.assign(sheet, preset); render();
}
function submitSheet() {
  const a = r2(+sheet.amount || 0);
  const err = m => { sheet.error = m; render(); };
  const mill = sheet.kind === "aereo" && sheet.sub === "millas";
  if (sheet.kind !== "transfer" && !mill && !String(sheet.title).trim()) return err("Poné un título para reconocerlo después.");
  if (mill && !(Math.round(+sheet.miles || 0) > 0)) return err("Ingresá cuántas millas recibieron.");
  if (a < 0 || (a <= 0 && !mill)) return err("Ingresá una cantidad mayor a cero.");
  if (sheet.kind === "transfer" && sheet.from === sheet.to) return err("Elegí dos personas distintas.");
  if (sheet.kind !== "transfer" && !sheet.split.length) return err("Elegí al menos una persona para dividir.");
  const id = sheet.id || uid("e");
  const rec = sheet.kind === "transfer"
    ? { kind: "transfer", cur: sheet.cur, title: "", amount: a, from: sheet.from, to: sheet.to, date: sheet.date || today() }
    : { kind: sheet.kind, cur: sheet.cur, title: String(sheet.title).trim(), amount: a, from: sheet.from, date: sheet.date || today(),
        split: sheet.split.length === people().length ? null : sheet.split.slice() };
  if (rec.kind === "aereo") { rec.sub = mill ? "millas" : "tasas"; if (mill) { rec.miles = Math.round(+sheet.miles); if (!rec.title) rec.title = "Compra de millas"; } }
  if (sheet.plan) { rec.plan = sheet.plan; rec.planN = sheet.planN || null; }
  if (mill && !rec.title) rec.title = "Aporte de millas";
  rec.created = sheet.created || Date.now(); rec.by = sheet.by || user.email;
  const isNew = !sheet.id, prev = isNew ? null : entries.find(x => x.id === sheet.id);
  ls.set("lastCur", sheet.cur);
  sheet = null; render(); window.scrollTo(0, 0); if (isNew && window.__burst) window.__burst();
  setDoc(doc(entriesCol(), id), rec).catch(fail);
  logAct(isNew ? "add" : "edit", rec, prev ? { prevAmount: +prev.amount || 0 } : {});
}
function markSeen() { ls.set(seenKey(), String(Date.now())); }

// ---------- Escanear ticket con IA (Firebase AI Logic, nivel gratuito de Gemini) ----------
function shrinkImage(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("imagen")); };
    img.src = url;
  });
}
async function scanReceipt(file) {
  if (!file || !sheet) return;
  sheet.scanning = true; sheet.error = ""; sheet.scanMsg = ""; render();
  try {
    const b64 = await shrinkImage(file);
    const { getAI, getGenerativeModel, GoogleAIBackend } = await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-ai.js");
    const ai = getAI(fbApp, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(ai, { model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
    const prompt = 'Leé este ticket, factura o comprobante y devolvé SOLO un JSON con esta forma: {"titulo": "nombre corto del comercio o concepto, en español, máximo 30 caracteres", "total": número del total pagado con punto decimal y sin símbolos, "moneda": "USD" o "ARS", "fecha": "AAAA-MM-DD" o null}. Si es de Estados Unidos o dice USD/US$, la moneda es USD; si es de Argentina en pesos, ARS.';
    const r = await model.generateContent([prompt, { inlineData: { data: b64, mimeType: "image/jpeg" } }]);
    const j = JSON.parse(String(r.response.text()).replace(/^```(json)?|```$/g, "").trim());
    if (!sheet) return;
    if (j.titulo) sheet.title = String(j.titulo).slice(0, 40);
    if (+j.total > 0) sheet.amount = String(r2(+j.total));
    if (j.moneda === "USD" || j.moneda === "ARS") sheet.cur = j.moneda;
    if (j.fecha && parseDate(j.fecha)) sheet.date = j.fecha;
    sheet.scanMsg = "Listo. Revisá los datos antes de guardar.";
  } catch (e) {
    const msg = String(e && (e.message || e.code) || e);
    if (sheet) sheet.error = /api-not-enabled|not been used|disabled|PERMISSION_DENIED|403|firebasevertexai|AI Logic|API key/i.test(msg)
      ? "Falta activar AI Logic en la consola de Firebase. Mientras tanto, cargalo a mano."
      : "No pude leer el ticket. Probá con otra foto más nítida o cargalo a mano.";
  }
  if (sheet) { sheet.scanning = false; render(); }
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
      if (e.kind === "aereo") { r.sub = e.sub === "millas" ? "millas" : "tasas"; if (e.miles) r.miles = Math.round(+e.miles); }
      return { id: String(e.id || uid("e")), data: r };
    })
  };
}

root.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const act = b.getAttribute("data-act");
  if (themeMenu && act !== "theme-menu" && act !== "theme") { themeMenu = false; render(); if (act === "scrim") return; }
  if (act === "scrim") { if (ev.target === b) closeTop(); return; }
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
  else if (act === "goto-settings") { setTab("ajustes"); panel = "package"; render(); }
  else if (act === "new") openSheet(null);
  else if (act === "open") { const e = entries.find(x => x.id === b.getAttribute("data-id")); if (e) openSheet(e); }
  else if (act === "close") closeTop();
  else if (act === "theme-menu") { themeMenu = !themeMenu; render(); }
  else if (act === "theme") { const v = b.getAttribute("data-theme"); ls.set(THEME_KEY, v === "day" || v === "night" ? v : "auto"); themeMenu = false; applyTheme(); render(); }
  else if (act === "panel") { panel = b.getAttribute("data-panel"); confirmPerson = null; confirmPlan = null; render(); }
  else if (act === "sview") { saldosView = b.getAttribute("data-v") === "neteo" ? "neteo" : "persona"; ls.set("saldosView", saldosView); render(); }
  else if (act === "settle-open") { settleOpen = true; render(); }
  else if (act === "who") {
    const w = b.getAttribute("data-who"), id = b.getAttribute("data-id"); if (!sheet || (w !== "from" && w !== "to")) return;
    sheet[w] = id; sheet.error = "";
    if (sheet.kind === "transfer" && sheet.from === sheet.to) { const o = people().find(p => p.id !== id); if (o) sheet[w === "from" ? "to" : "from"] = o.id; }
    render();
  }
  else if (act === "bell") { bellOpen = true; render(); }
  else if (act === "plan-pay") {
    const p = plans().find(x => x.id === b.getAttribute("data-id")); if (!p) return;
    const st = planStatus(p);
    openSheetWith({ kind: p.kind === "aereo" ? "aereo" : "cuota", sub: "tasas", title: p.title + " · cuota " + st.n + "/" + p.count, amount: String(p.amount), cur: p.cur, from: p.from, plan: p.id, planN: st.n });
  }
  else if (act === "miles-pay") {
    const MP = millasPlan(), pid = b.getAttribute("data-pid"), cm = today().slice(0, 7), mo = /^\d{4}-\d{2}$/.test(b.getAttribute("data-month") || "") ? b.getAttribute("data-month") : cm;
    const already = (millasByMonth()[mo] || {})[pid] || 0;
    openSheetWith({ kind: "aereo", sub: "millas", from: pid, miles: String(Math.max(1, Math.round(MP.per - already))), title: "Millas de " + MESES_L[+mo.slice(5) - 1], cur: "ARS", date: mo === cm ? today() : mo + "-01" });
  }
  else if (act === "plan-del") { confirmPlan = b.getAttribute("data-id"); render(); }
  else if (act === "plan-del-no") { confirmPlan = null; render(); }
  else if (act === "plan-del-yes") { const id = b.getAttribute("data-id"); confirmPlan = null; saveTrip({ plans: plans().filter(p => p.id !== id) }); }
  else if (act === "settle-all") {
    const R = compute(), fx = fxRate(), U = unifiedSettle(R) || [];
    const batch = writeBatch(db);
    CURS.forEach(c => R[c].settle.forEach(s => batch.set(doc(entriesCol(), uid("e")), { kind: "transfer", cur: s.cur, title: "Saldado unificado (tipo $ " + fx + ")", amount: s.amount, from: s.from, to: s.to, date: today(), created: Date.now(), by: user.email })));
    batch.commit().then(() => { if (U[0]) logAct("settle", { kind: "transfer", amount: U[0].amount, cur: "USD" }, { from: U[0].from, to: U[0].to }); if (window.__burst) window.__burst(); }).catch(fail);
  }
  else if (act === "cur") { sheet.cur = b.getAttribute("data-cur"); render(); const ai = document.getElementById("sh-amount"); if (ai) ai.focus(); }
  else if (act === "sub") { sheet.sub = b.getAttribute("data-sub"); sheet.error = ""; render(); }
  else if (act === "kind") {
    sheet.kind = b.getAttribute("data-kind"); sheet.error = "";
    if (sheet.kind === "transfer" && sheet.to === sheet.from) { const o = people().find(p => p.id !== sheet.from); if (o) sheet.to = o.id; }
    render();
  }
  else if (act === "sheet-del") { sheet.confirmDel = true; render(); }
  else if (act === "sheet-del-no") { sheet.confirmDel = false; render(); }
  else if (act === "sheet-del-yes") { const id = sheet.id, old = entries.find(x => x.id === id); sheet = null; render(); deleteDoc(doc(entriesCol(), id)).then(() => { if (old) logAct("delete", old); }).catch(fail); }
  else if (act === "settle") {
    const s = compute()[b.getAttribute("data-cur")].settle[+b.getAttribute("data-k")];
    settleOpen = false; if (!s) render();
    if (s) { setDoc(doc(entriesCol(), uid("e")), { kind: "transfer", cur: s.cur, title: "", amount: s.amount, from: s.from, to: s.to, date: today(), created: Date.now(), by: user.email }).catch(fail); logAct("settle", { kind: "transfer", amount: s.amount, cur: s.cur }, { from: s.from, to: s.to }); if (window.__burst) window.__burst(); }
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
  if (t.id === "scan-file") { scanReceipt(t.files && t.files[0]); t.value = ""; return; }
  if (t.id === "unify-toggle") { unifyOn = t.checked; ls.set("unify", unifyOn ? "1" : ""); render(); return; }
  if (sheet) {
    const sp = t.getAttribute("data-split");
    if (sp) { if (t.checked) { if (sheet.split.indexOf(sp) < 0) sheet.split.push(sp); } else sheet.split = sheet.split.filter(x => x !== sp); updateSplitAmounts(); return; }
    const f = t.getAttribute("data-f"); if (f) { sheet[f] = t.value; return; }
  }
  if (!trip) return;
  if (t.id === "set-name") saveTrip({ tripName: t.value.trim() || "Nuestro viaje" });
  else if (t.id === "set-goal") saveTrip({ milesGoal: Math.max(0, Math.round(+t.value || 0)) });
  else if (t.id === "set-mmonthly") saveTrip({ milesMonthly: Math.max(0, Math.round(+t.value || 0)) });
  else if (t.id === "set-mdeadline") { if (/^\d{4}-\d{2}$/.test(t.value)) saveTrip({ milesDeadline: t.value }); }
  else if (t.id === "set-fx") saveTrip({ fx: Math.max(0, r2(+t.value || 0)) });
  else if (t.id === "set-bdaily" || t.id === "set-bcur" || t.id === "set-bend") {
    const B = budget();
    if (t.id === "set-bdaily") B.daily = Math.max(0, r2(+t.value || 0));
    if (t.id === "set-bcur") B.cur = t.value === "ARS" ? "ARS" : "USD";
    if (t.id === "set-bend") B.end = parseDate(t.value) ? t.value : "";
    saveTrip({ budget: B });
  }
  else if (t.id === "set-date") { if (parseDate(t.value)) saveTrip({ date: t.value }); }
  else if (t.id === "set-total-USD" || t.id === "set-total-ARS") {
    const c = t.id.slice(-3), v = Math.max(0, r2(+t.value || 0));
    saveTrip({ ["totals." + c]: v }); logAct("totals", { amount: v, cur: c });
  }
  else if (t.getAttribute("data-act") === "pname") {
    const id = t.getAttribute("data-id"), name = t.value.trim(); if (!name) return;
    saveTrip({ people: people().map(p => p.id === id ? { id: p.id, name } : p) });
  }
});
root.addEventListener("submit", async ev => {
  ev.preventDefault();
  const form = ev.target, kind = form.getAttribute("data-form"), d = new FormData(form);
  if (kind === "sheet") return submitSheet();
  if (kind === "plan") {
    const g = k => String(d.get(k) || "").trim();
    const p = { id: uid("pl"), title: g("title"), amount: r2(+g("amount") || 0), cur: g("cur") === "ARS" ? "ARS" : "USD", count: Math.max(1, Math.round(+g("count") || 1)),
      day: Math.min(31, Math.max(1, Math.round(+g("day") || 1))), start: /^\d{4}-\d{2}$/.test(g("start")) ? g("start") : today().slice(0, 7), from: g("from") || myId(), kind: g("kind") === "aereo" ? "aereo" : "cuota" };
    if (!p.title || !(p.amount > 0)) return;
    form.reset(); saveTrip({ plans: plans().concat([p]) }); logAct("plan", { title: p.title, amount: p.amount, cur: p.cur }); return;
  }
  if (kind === "person") {
    const n = String(d.get("name") || "").trim(); if (!n) return;
    form.reset(); saveTrip({ people: people().concat([{ id: uid("p"), name: n }]) }); return;
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
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && (sheet || bellOpen || panel || settleOpen || themeMenu)) closeTop(); });
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

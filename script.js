/* Conçu et développé par Mamadou Fall — P.Scann by Soned © 2026 Mamadou Fall
   Espace Soned Afrique (V10) : le site. Le script Google de Soned décide de l'heure, du type de pointage (arrivée ou départ),
   des retards, des absences. Le site ne peut ni modifier ni supprimer un pointage.  Le logo est dans logo.js. */
'use strict';

/* ---------- 1. RÉGLAGES ---------- */
const CONFIG = {
  site: { lat: 14.74282340329234, lng: -17.28942341797315, radius: 100, maxAcc: 150 },   // Soned Afrique (mètres)
  endpoint: ' https://script.google.com/macros/s/AKfycbwiyF_qT5wmxL0r27DCioayFxFXg4YzTnLWD0MSa9J1mChNLIoTimQBUbDA_Pumcy_i3Q/exec',   // ← adresse « /exec » du script Google (voir README)
  version: '10.0',                       // version attendue du script Google
  tz: 'Africa/Dakar',
  devMail: 'fatina200118@gmail.com'     // développeur : Mamadou Fall
};

/* ---------- 2. OUTILS ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const store = {
  get(k, s = localStorage) { try { return s.getItem(k); } catch { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, v); } catch {} },
  del(k, s = localStorage) { try { s.removeItem(k); } catch {} }
};
let toastTimer;
function toast(msg, type = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + type;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ''), 3600);
}
function copyText(t) {
  const done = () => toast('Adresse copiée.');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => toast(t));
  else { const i = document.createElement('input'); i.value = t; document.body.appendChild(i); i.select(); try { document.execCommand('copy'); done(); } catch { toast(t); } i.remove(); }
}

/* ---------- 3. DATE ET HEURE (horloge du serveur, pas celle du téléphone) ---------- */
let offsetMs = 0;
const nowMs = () => Date.now() + offsetMs;
const dtf = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function parts(ms) { const p = {}; dtf.formatToParts(ms).forEach(x => (p[x.type] = x.value)); return { key: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, sec: p.second, h: +p.hour }; }
const dateOf = key => new Date(key + 'T12:00:00Z');
const addDays = (key, n) => { const d = dateOf(key); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const longDate = key => cap(dateOf(key).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
const shortDate = key => dateOf(key).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const fmtH = hm => (hm ? hm.replace(/^0/, '').replace(':', 'h') : '—');
const fmtMin = m => Math.floor(m / 60) + 'h' + ('0' + (m % 60)).slice(-2);
const fmtDist = m => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : m + ' m');
const first = n => String(n).split(' ')[0];
const monthLabel = ym => cap(dateOf(ym + '-01').toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }));
const today = () => parts(nowMs()).key;

/* ---------- 4. ICÔNES ET AVATARS ---------- */
const VERIFIED = '<svg class="vb" viewBox="0 0 24 24" role="img" aria-label="Profil vérifié"><path fill="#1d9bf0" d="M22.5 12c0-1.2-.7-2.2-1.7-2.8.3-1.1.1-2.3-.6-3.2-.8-.9-1.9-1.3-3.1-1.2-.5-1-1.5-1.8-2.7-1.9-1.2-.2-2.3.3-3 1.2-.8-.9-1.9-1.4-3-1.2-1.2.2-2.2.9-2.7 1.9-1.2-.1-2.3.3-3.1 1.2-.7.9-.9 2.1-.6 3.2-1 .6-1.7 1.6-1.7 2.8s.7 2.2 1.7 2.8c-.3 1.1-.1 2.3.6 3.2.8.9 1.9 1.3 3.1 1.2.5 1 1.5 1.8 2.7 1.9 1.2.2 2.3-.3 3-1.2.8.9 1.9 1.4 3 1.2 1.2-.2 2.2-.9 2.7-1.9 1.2.1 2.3-.3 3.1-1.2.7-.9.9-2.1.6-3.2 1-.6 1.7-1.6 1.7-2.8z"/><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="m7.8 12.3 2.8 2.8 5.6-5.8"/></svg>';
const IC = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7.5 8 6 8-6"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};
const avatarHue = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return [95, 120, 145, 165, 185, 45, 28][h % 7]; };
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatar = (n, size = '', img = null) => `<span class="avatar ${size}" style="--h:${avatarHue(n)}">${img ? `<img src="${esc(img)}" alt="">` : esc(initials(n))}</span>`;

/* ---------- 5. FENÊTRES ---------- */
let modalLocked = false;
function openModal(html, locked = false) {
  modalLocked = locked; $('#modalBox').innerHTML = html; $('#modal').hidden = false; document.body.style.overflow = 'hidden';
  const f = $('#modalBox input,#modalBox select,#modalBox textarea'); if (f && !/date|time/.test(f.type)) setTimeout(() => f.focus(), 60);
}
function closeModal() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; document.body.style.overflow = ''; modalLocked = false; }
function confirmModal(html, okLabel, fn, cls = '') {
  openModal(`${html}<div class="modal-actions"><button type="button" class="btn line" data-close>Annuler</button><button type="button" class="btn ${cls}" id="cmOk">${esc(okLabel)}</button></div>`);
  $('#cmOk').onclick = async () => { const b = $('#cmOk'); b.disabled = true; try { await fn(); } finally { if (b.isConnected) b.disabled = false; } };
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) return closeModal();
  if (e.target.id === 'modal' && !modalLocked) closeModal();
  const cp = e.target.closest('[data-copy]'); if (cp) copyText(cp.dataset.copy);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden && !modalLocked) closeModal(); });

/* ---------- 6. ÉCRAN D'ACCUEIL ---------- */
const Splash = (() => {
  let closed = false, timer;
  function close() {
    if (closed) return; closed = true; clearTimeout(timer);
    const s = $('#splash'); s.classList.add('leave'); document.body.classList.remove('splash-on');
    setTimeout(() => { s.hidden = true; s.style.display = 'none'; }, 650);
    splashDone = true; maybeCheckPosition();
  }
  return {
    start() {
      $('#splashLogo').src = LOGO; $('#topLogo').src = LOGO; $('#splashDate').textContent = longDate(parts(nowMs()).key);
      const s = $('#splash'); s.addEventListener('click', close);
      s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') close(); });
      timer = setTimeout(close, 3400);
    }
  };
})();

/* ---------- 7. POSITION ---------- */
let pos = null, geoAsked = false, splashDone = false, posPromise = null, posFailed = false;
function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = x => x * Math.PI / 180, dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
let geoLast = null;
function setGeo(state, text, retry = false) { geoLast = { state, text, retry }; if (S.work === 'tele') return; paintGeo(geoLast); }
function paintGeo(g) { $('#geo').className = 'geo ' + g.state; $('#geoTxt').textContent = g.text; $('#retry').hidden = !g.retry; }
const getPosition = () => new Promise((res, rej) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }) : rej({ code: 0 })));
function checkPosition() { setGeo('wait', 'Vérification de votre position…'); posFailed = false; posPromise = readPosition(); return posPromise; }
async function readPosition() {
  try {
    const p = await getPosition(), { latitude: lat, longitude: lng, accuracy } = p.coords;
    const dist = Math.round(distanceM(lat, lng, CONFIG.site.lat, CONFIG.site.lng)), acc = Math.round(accuracy), r = CONFIG.site.radius;
    pos = { lat, lng, acc, dist };
    if (dist <= r && acc <= CONFIG.site.maxAcc) setGeo('ok', `Vous êtes sur place (à ${fmtDist(dist)} du site).`);
    else if (dist - acc > r) setGeo('far', `Vous êtes à ${fmtDist(dist)} du site : hors zone. Votre pointage sera enregistré mais marqué en rouge.`, true);
    else setGeo('unk', `Position peu précise (± ${fmtDist(acc)}). Votre pointage sera enregistré mais marqué « position non vérifiée ».`, true);
  } catch (e) {
    pos = null; posFailed = true;
    setGeo('unk', e && e.code === 1 ? 'Localisation refusée. Autorisez-la dans votre navigateur, sinon votre pointage sera marqué « position non vérifiée ».' : 'Position introuvable. Votre pointage sera enregistré mais marqué « position non vérifiée ».', true);
  }
}
function maybeCheckPosition() { if (!geoAsked && splashDone && $('#punchCard') && !$('#punchCard').hidden) { geoAsked = true; checkPosition(); } }

/* ---------- 8. SERVEUR (script Google) ---------- */
const NOCONFIG = !CONFIG.endpoint;
function syncClock(j, t0, t1) {
  const srv = typeof j.serverTime === 'number' ? j.serverTime : Date.parse(j.serverTime);
  if (isFinite(srv)) offsetMs = srv - (t0 + t1) / 2;
}
async function apiGet(params) {
  if (NOCONFIG) throw new Error('config');
  const t0 = Date.now();
  let j;
  for (let i = 0; i < 2; i++) {                          // une seconde chance : le premier appel après une pause est parfois refusé ou lent
    try { const r = await fetch(CONFIG.endpoint + '?' + new URLSearchParams({ ...params, _: Date.now() }), { cache: 'no-store' }); j = await r.json(); break; }
    catch (e) { if (i) throw e; await new Promise(res => setTimeout(res, 700)); }
  }
  syncClock(j, t0, Date.now());
  if (!j.ok) { const e = new Error('refus'); e.msg = j.error; throw e; }
  return j;
}
async function apiPost(body) {
  if (NOCONFIG) throw new Error('config');
  const t0 = Date.now();
  const r = await fetch(CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });   // pas de « preflight » CORS
  const j = await r.json(); if (j.serverTime) syncClock(j, t0, Date.now());
  return j;
}

/* ---------- 9. IDENTITÉ SUR CE TÉLÉPHONE ---------- */
const DEV_KEY = 'pscann7_dev', ME_KEY = 'pscann7_me', PH_KEY = 'pscann7_ph';
function deviceId() {
  let d = store.get(DEV_KEY);
  if (!/^[a-z0-9]{12,40}$/.test(d || '')) { d = (uid() + uid()).replace(/[^a-z0-9]/g, '').slice(0, 24); store.set(DEV_KEY, d); }
  return d;
}
const WORK_KEY = 'pscann8_work', DOOR_KEY = 'pscann10_door', ROSTER_KEY = 'pscann10_roster';
const doorToken = () => { const d = store.get(DOOR_KEY); return /^[a-z0-9]{16,40}$/.test(d || '') ? d : ''; };
function deviceName() {                                  // pour aider le RH à reconnaître le téléphone (ce n'est pas ce qui sert à l'identifier)
  const ua = navigator.userAgent || '', ch = navigator.userAgentData;
  let n = '';
  if (/iPhone/.test(ua)) n = 'iPhone'; else if (/iPad/.test(ua)) n = 'iPad';
  else { const m = ua.match(/Android [\d.]+; ([^;)]+)/); if (m) n = m[1].replace(/ Build.*/, '').trim(); }
  if (!n && ch && ch.platform) n = ch.platform + (ch.mobile ? ' (mobile)' : ' (ordinateur)');
  if (!n) n = /Windows/.test(ua) ? 'PC Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return (n + (br ? ' · ' + br : '')).slice(0, 60);
}
const S = { pmode: 'both', door: false, canB: true, roster: null, cardInfo: false, mails: {}, rules: null, work: 'bureau', loading: true, error: false, me: null, info: null, mode: 'loading', badCard: false, contact: '', version: '', old: false, pin: null, note: '' };
let scanKey = null, doneVisible = false, sending = false, sendId = null;
function loadMe() { try { return JSON.parse(store.get(ME_KEY)); } catch { return null; } }
const saveMe = () => store.set(ME_KEY, JSON.stringify(S.me));
function myPhoto() { try { const p = JSON.parse(store.get(PH_KEY)); return p && S.me && p.id === S.me.id ? p.img : null; } catch { return null; } }
function setMyPhoto(img) { if (img && S.me) store.set(PH_KEY, JSON.stringify({ id: S.me.id, img })); else store.del(PH_KEY); }

async function loadState() {
  const params = { action: 'state', dev: deviceId() }, k = scanKey || (S.me && S.me.k), dt = doorToken();
  if (k) params.k = k; else if (S.me) params.emp = S.me.id;
  if (dt) params.d = dt;
  const j = await apiGet(params);
  S.pmode = j.mode || 'both'; S.door = !!dt && !!j.door;
  if (S.door) S.doorExpired = false;
  if (dt && !j.door) { store.del(DOOR_KEY); store.del(ROSTER_KEY); S.roster = null; S.doorExpired = true; }
  S.loading = false; S.error = false; S.contact = j.contact || ''; S.mails = j.mails || {}; S.rules = j.rules || null; S.version = j.version || '';
  S.old = j.version !== CONFIG.version;
  if (scanKey) {                                         // on vient de scanner une carte
    if (j.me) { S.me = { id: j.me.id, name: j.me.name, k: scanKey }; saveMe(); S.info = j.me; S.badCard = false; S.pin = null; }
    else S.badCard = true;
    scanKey = null;
  } else if (S.me) {
    if (j.me) { S.info = j.me; S.me.name = j.me.name; }
    else { S.badCard = !!j.badCard; S.me = null; S.info = null; store.del(ME_KEY); setMyPhoto(null); }   // carte remplacée ou personne retirée
  }
  if (S.info && !S.info.ph) setMyPhoto(null);
}

function setPill(kind, text) { $('#pill').className = 'pill ' + kind; $('#pillTxt').textContent = text; }
function showCard(which) {
  S.mode = which; $('.hero').classList.toggle('compact', which === 'punch' || which === 'setpin' || which === 'namepick');
  const ids = { closed: '#closed', welcome: '#welcome', namepick: '#namePick', setpin: '#setPin', punch: '#punchCard', done: '#done' };
  for (const k in ids) $(ids[k]).hidden = k !== which;
  if (which === 'punch') maybeCheckPosition();
}
function notice(title, text, retry = true) {
  $('#closed').querySelector('h2').textContent = title; $('#closedTxt').textContent = text; $('#reload').hidden = !retry; showCard('closed');
}
function renderHi() {
  const h = parts(nowMs()).h, g = h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
  $('#hi').textContent = S.info ? `${g} ${first(S.info.name)}` : g;
}
function renderPoint() {
  const b = $('#verBanner'); b.hidden = !S.old || S.loading || S.error;
  if (!b.hidden) b.innerHTML = '<span>Le service doit mettre à jour le script Google du site. Certaines fonctions peuvent ne pas marcher.</span>';
  if (doneVisible) return;
  renderHi();
  if (S.loading) { setPill('wait', 'Connexion…'); return; }
  if (S.error) { setPill('error', 'Connexion impossible'); notice('Connexion impossible', 'Vérifiez votre connexion internet, puis réessayez.'); return; }
  setPill('', 'Pointage ouvert 24h/24, 7j/7');
  if (!S.me || !S.info) return renderWelcome();
  if (S.info.blocked) return notice('Accès bloqué', 'Votre accès est bloqué après 5 codes incorrects. Présentez-vous au RH ou à l’informaticien pour le débloquer.', false);
  if (S.info.susp) return notice('Carte suspendue', 'Votre carte a été suspendue (signalée perdue ou partagée). Voyez un gestionnaire pour en recevoir une nouvelle.', false);
  if (!S.info.locked) { if (S.info.card || S.pmode !== 'badge') return renderSetPin(); return renderWelcome('Pour créer votre code, scannez votre carte personnelle (QR code). Pas de carte ? Voyez un gestionnaire.'); }
  renderPunch();
}
function renderWelcome(msg) {
  if (S.door && S.pmode !== 'badge' && !msg && !S.badCard && !S.cardInfo) return renderNamePick();
  if (S.mode !== 'welcome') { $('#findBox').hidden = true; $('#findQ').value = ''; $('#found').innerHTML = ''; showCard('welcome'); }
  const cardOk = S.pmode !== 'door', doorOk = S.pmode !== 'badge';
  $('#welcomeH').textContent = cardOk ? 'Scannez votre carte pour pointer' : 'Scannez le QR code de l’entrée';
  $('#welcomeSteps').innerHTML = cardOk
    ? '<li><b>1</b>Ouvrez l’appareil photo de votre téléphone</li><li><b>2</b>Scannez le QR code de votre carte' + (doorOk ? ' (ou celui affiché à l’entrée du bureau)' : '') + '</li><li><b>3</b>Appuyez sur le gros bouton vert</li>'
    : '<li><b>1</b>Ouvrez l’appareil photo de votre téléphone</li><li><b>2</b>Scannez le QR code affiché à l’entrée du bureau</li><li><b>3</b>Choisissez votre nom puis pointez</li>';
  $('#welcomeNote').textContent = msg || (S.badCard ? 'Cette carte n’est plus valide. Demandez une nouvelle carte à un gestionnaire.' : S.doorExpired ? 'Le QR code de l’entrée a changé : scannez le nouveau QR affiché au bureau.' : S.note || (cardOk ? 'Chaque personne a sa carte personnelle avec un QR code.' : 'Au bureau, un QR code est affiché à l’entrée.'));
}
/* QR de l'entrée : la liste des noms (avec le poste) */
async function loadRoster() {
  const d = doorToken(); if (!d) return;
  try { const j = await apiGet({ action: 'roster', d }); S.roster = j.list; store.set(ROSTER_KEY, JSON.stringify(j.list)); }
  catch (e) { if (!S.roster) { try { S.roster = JSON.parse(store.get(ROSTER_KEY)); } catch { S.roster = null; } } }
}
function renderNamePick() {
  if (S.mode !== 'namepick') { $('#npQ').value = ''; showCard('namepick'); }
  drawNames();
}
function drawNames() {
  const box = $('#npList'), q = norm($('#npQ').value);
  if (!S.roster) { box.innerHTML = '<p class="muted">Chargement de la liste…</p>'; return; }
  const l = S.roster.filter(e => !q || norm(e.name).includes(q) || norm(e.role || '').includes(q));
  box.innerHTML = l.length ? l.map(e => `<button type="button" data-emp="${esc(e.id)}" data-n="${esc(e.name)}">${avatar(e.name)}<span class="who"><b>${esc(e.name)}</b><small>${esc(e.role || (e.kd === 'stagiaire' ? 'Stagiaire' : ''))}</small></span>${e.np ? '<i class="tag amber">Nouveau</i>' : ''}</button>`).join('')
    : '<p class="muted">Aucun nom trouvé. Vous n’êtes pas dans la liste ? Voyez le RH.</p>';
}
function renderSetPin() {
  if (S.mode !== 'setpin') { $('#spNew').value = ''; $('#spNew2').value = ''; $('#spErr').textContent = ''; showCard('setpin'); }
  $('#spAvatar').innerHTML = avatar(S.info.name, 'big', myPhoto()); $('#spTitle').textContent = 'Bienvenue ' + first(S.info.name);
  $('#spNote').hidden = !!S.info.card;
}
function setWork(w, remember) {
  const canT = !!S.info && S.info.tele !== false;
  S.work = !S.canB && canT ? 'tele' : (w === 'tele' && canT ? 'tele' : 'bureau');
  if (remember) store.set(WORK_KEY, S.work);
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.w === S.work));
  if (S.work === 'tele') { $('#geo').className = 'geo tele'; $('#geoTxt').textContent = 'Télétravail : votre position doit correspondre à l’un de vos lieux enregistrés (Profil → Mes lieux de télétravail). Sinon le RH est prévenu.'; $('#retry').hidden = true; if (!geoAsked) { geoAsked = true; checkPosition(); } }
  else if (geoLast) paintGeo(geoLast);
  else { setGeo('wait', 'Vérification de votre position…'); }
  if (S.work === 'bureau') maybeCheckPosition();
}
function renderPunch() {
  const first = S.mode !== 'punch';
  if (first) { $('#pin').value = ''; $('#err').textContent = ''; }
  const i = S.info;
  S.canB = !!S.me.k || (S.door && S.pmode !== 'badge');       // au bureau : carte personnelle, ou QR de l'entrée
  if (!S.canB && i.tele === false) return notice('Pointage au bureau', 'Pour pointer au bureau, scannez le QR code affiché à l’entrée (ou votre carte personnelle).', false);
  if (first) {                                           // premier affichage : on reprend le dernier choix (sinon celui du dernier pointage)
    const saved = store.get(WORK_KEY), want = !S.canB ? 'tele' : i.tele === false ? 'bureau' : (saved === 'tele' || saved === 'bureau' ? saved : i.mode === 'tele' ? 'tele' : 'bureau');
    S.work = want; showCard('punch'); setWork(want, false);
  }
  $('.modeq').hidden = $('#modeSeg').hidden = !(S.canB && i.tele !== false);
  $('#doorHint').hidden = S.canB;
  if (i.tele === false && S.work === 'tele') setWork('bureau', false);
  $('#meAvatar').innerHTML = avatar(i.name, 'big', myPhoto());
  $('#meTitle').innerHTML = esc(i.name) + (i.verified ? VERIFIED : '');
  $('#sendTxt').textContent = i.inside ? 'Pointer mon départ' : 'Pointer mon arrivée';
  $('#send').classList.toggle('out', !!i.inside);
  const t = today();
  $('#meLine').textContent = !i.last ? 'Aucun pointage enregistré pour le moment.' :
    `Dernier pointage : ${i.inside ? 'arrivée' : 'départ'} à ${fmtH(i.last.time)}${i.last.day !== t ? ' (' + shortDate(i.last.day) + ')' : ''}.`;
}
async function refreshState() {
  if (document.hidden || doneVisible || sending || !$('#modal').hidden || tab !== 'point' || (S.mode === 'punch' && $('#pin').value) || S.mode === 'setpin') return;
  try { await loadState(); if (S.door && S.mode === 'namepick') await loadRoster(); } catch { if (S.loading) S.error = true; }
  renderPoint();
}
function tick() {
  const p = parts(nowMs()); $('#clock').innerHTML = `${p.hm}<span>:${p.sec}</span>`; $('#date').textContent = longDate(p.key);
  if (!$('#splash').hidden) $('#splashDate').textContent = longDate(p.key);
}
async function reloadAll() { S.loading = true; S.error = false; renderPoint(); try { await loadState(); } catch { S.error = true; } renderPoint(); }
function forgetMe() {
  S.me = null; S.info = null; S.pin = null; store.del(ME_KEY); setMyPhoto(null); S.mode = 'loading'; doneVisible = false; geoAsked = false; renderPoint();
}

/* Recherche du nom (secours : carte oubliée) */
let findTimer;
async function doFind() {
  const q = $('#findQ').value.trim(), box = $('#found');
  if (q.length < 3) { box.innerHTML = ''; return; }
  try {
    const j = await apiGet({ action: 'find', q });
    box.innerHTML = j.list.length ? j.list.map(e => `<button type="button" data-emp="${esc(e.id)}" data-n="${esc(e.name)}">${avatar(e.name)}<span class="who"><b>${esc(e.name)}</b><small>${esc(e.role || '')}</small></span>${e.np ? '<i class="tag amber">Nouveau</i>' : ''}</button>`).join('') :
      '<p class="muted">Aucun résultat. Vérifiez l’orthographe ou voyez le RH : votre nom doit être dans la liste.</p>';
  } catch { box.innerHTML = '<p class="err">Recherche impossible pour le moment.</p>'; }
}
function chooseEmp(id, name, tele) {
  S.me = { id, name }; S.info = null; S.badCard = false; S.pin = null; saveMe(); S.mode = 'loading'; geoAsked = false; S.cardInfo = false;
  if (tele) store.set(WORK_KEY, 'tele'); else if (S.door) store.set(WORK_KEY, 'bureau');
  reloadAll();
}

/* Premier code */
async function savePin() {
  const n = $('#spNew').value, n2 = $('#spNew2').value, err = $('#spErr');
  if (!/^\d{4}$/.test(n)) return void (err.textContent = 'Le code doit avoir exactement 4 chiffres.');
  if (n !== n2) return void (err.textContent = 'Les deux codes ne sont pas identiques.');
  const b = $('#spSave'); b.disabled = true; err.textContent = '';
  try {
    const r = await apiPost({ action: 'lock', ...(S.me.k ? { k: S.me.k } : { emp: S.me.id }), dev: deviceId(), dn: deviceName(), newPin: n });
    if (r.ok) { toast('Code enregistré. Vous pouvez pointer.'); S.info.locked = true; S.mode = 'loading'; try { await loadState(); } catch {} renderPoint(); }
    else err.textContent = r.error || 'Impossible d’enregistrer le code.';
  } catch { err.textContent = 'Pas de connexion. Réessayez.'; }
  b.disabled = false;
}

/* Pointer */
async function submitPunch(ev) {
  ev.preventDefault(); if (sending || !S.info) return;
  const pin = $('#pin').value.trim(), err = $('#err');
  if (!/^\d{4}$/.test(pin)) return void (err.textContent = 'Saisissez votre code (4 chiffres).');
  err.textContent = ''; $('#errChat').hidden = true; const b = $('#send'), label = $('#sendTxt').textContent; b.disabled = true; $('#sendTxt').textContent = 'Enregistrement…'; sending = true;
  sendId ||= uid();                                      // même identifiant si on réessaie : jamais de doublon
  try {
    const tele = S.work === 'tele';
    if (posPromise) await posPromise;
    const body = { action: 'punch', id: sendId, dev: deviceId(), dn: deviceName(), dt: doorToken(), pin, mode: tele ? 'tele' : 'bureau', lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, acc: pos ? pos.acc : null };
    if (S.me.k) body.k = S.me.k; else body.emp = S.me.id;
    const r = await apiPost(body);
    if (r.ok) { sendId = null; showDone(r); }
    else {
      sendId = null; err.textContent = r.error || 'Le pointage a été refusé.'; $('#pin').value = ''; $('#errChat').hidden = !(r.closed || r.early);
      if (r.needPlace) setTimeout(() => { showTab('me'); toast('Enregistrez d’abord un lieu de télétravail.'); }, 1200);
      if (r.door) { await loadState().catch(() => {}); S.mode = 'loading'; renderPoint(); err.textContent = r.error; } if (r.reset) forgetMe(); else if (r.blocked) { await loadState(); S.mode = 'loading'; notice('Accès bloqué', r.error, false); } else if (r.susp || r.ended || r.noCard) { await loadState(); S.mode = 'loading'; renderPoint(); if (r.ended) notice('Stage terminé', r.error, false); }
    }
  } catch { err.textContent = 'Pas de connexion : votre pointage n’est pas enregistré. Réessayez.'; }
  finally { sending = false; b.disabled = false; if ($('#sendTxt').textContent === 'Enregistrement…') $('#sendTxt').textContent = label; }
}
function showDone(r) {
  doneVisible = true;
  const tele = !!r.tele, bad = tele ? r.status !== 'Télétravail' : r.status !== 'Sur place', arrival = r.type === 'Arrivée';
  $('#done').className = 'card done' + (bad ? ' bad' : '') + (tele ? ' tele' : '');
  $('#done').innerHTML = `<div class="tick">${IC.check}</div>
    <h2>${esc(r.name)}${r.verified ? VERIFIED : ''}</h2><p class="muted">${arrival ? 'Arrivée enregistrée' : 'Départ enregistré'} · ${esc(longDate(r.day || today()))}</p>
    <div class="big">${fmtH(r.time)}</div>
    <p class="stat">${tele && !bad ? 'En télétravail' : esc(r.status)}${bad ? ' — signalé au RH' : ''}</p>
    ${r.dv === 1 ? `<p class="devok">${VERIFIED}<span>Appareil vérifié</span></p>` : r.dv === 0 ? '<p class="devno">Appareil non reconnu : le RH le vérifiera. Votre pointage est bien enregistré.</p>' : ''}
    ${r.absent ? `<p class="late">Arrivée après ${fmtH(S.rules ? S.rules.absentFrom : '08:30')} : vous êtes considéré(e) absent(e) aujourd’hui. Le RH voit votre pointage.</p>` : r.late > 0 ? `<p class="late">Retard : ${r.late} min</p>` : ''}
    ${r.earliest ? `<p class="stat">Départ possible à partir de ${fmtH(r.earliest)}</p>` : ''}
    <p class="bye">${arrival ? 'Bonne journée !' : 'Bonne soirée, à bientôt !'}</p>
    <button type="button" class="btn wide" id="doneBtn">Terminé</button>`;
  showCard('done'); window.scrollTo(0, 0);
  $('#doneBtn').onclick = async () => { doneVisible = false; S.mode = 'loading'; geoAsked = false; $('#pin').value = ''; await reloadAll(); };
}

/* ---------- 10. ÉQUIPE (public : uniquement des nombres) ---------- */
let tab = 'point', dayKey = null, dayData = null, loadingDay = false;
function showTab(t) {
  tab = t;
  ['point', 'members', 'me', 'admin'].forEach(k => ($('#v-' + k).hidden = k !== t));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.body.classList.toggle('wide', t === 'admin');
  if (t === 'members') loadDay(); else if (t === 'point') { renderPoint(); refreshState(); } else if (t === 'me') renderMe(); else adminShow();
  window.scrollTo(0, 0);
}
async function loadDay() {
  if (loadingDay) return; loadingDay = true; $('#mErr').hidden = true;
  try { dayData = await apiGet({ action: 'day', date: dayKey || '' }); dayKey = dayData.date; }
  catch { $('#mErr').hidden = false; $('#mErr').innerHTML = '<span>Impossible de charger. Vérifiez votre connexion.</span>'; }
  loadingDay = false; renderDay();
}
function renderDay() {
  if (!dayData) { $('#counters').innerHTML = ''; return; }
  const { date, today: t, arrivals, left, present, tele } = dayData, isToday = date === t;
  $('#dTitle').textContent = (isToday ? 'Aujourd’hui · ' : '') + shortDate(date);
  $('#dNext').disabled = date >= t;
  $('#counters').innerHTML = `<div class="counter"><b>${arrivals}</b><span>Arrivées</span></div>` +
    `<div class="counter ${isToday ? '' : 'gray'}"><b>${isToday ? present : arrivals - left}</b><span>${isToday ? 'Présents' : 'Sans départ'}</span></div><div class="counter gray"><b>${left}</b><span>Départs</span></div>`;
  const tn = $('#teleNote'); tn.hidden = !tele; tn.textContent = tele ? `Parmi les arrivées : ${tele} en télétravail.` : '';
}

/* ---------- 11. MON PROFIL ---------- */
let meData = null, meLoading = false;
function hoursFr(m) { return fmtMin(m || 0); }
async function meCall(op, extra = {}) {
  const r = await apiPost({ action: 'me', op, ...(S.me.k ? { k: S.me.k } : { emp: S.me.id }), dev: deviceId(), dn: deviceName(), pin: S.pin, ...extra });
  if (!r.ok && (r.needPin || /Code incorrect/.test(r.error || ''))) S.pin = null;
  return r;
}
function renderMe() {
  const box = $('#meBody');
  if (!S.me) {
    box.innerHTML = `<div class="card scanhero" style="margin-top:18px"><h2>Votre profil</h2><p class="muted">Choisissez votre nom dans l’onglet Pointage (ou scannez votre carte) pour ouvrir votre profil : photo, présences, retards, congés, lieux de télétravail.</p></div>`;
    return;
  }
  if (S.info && S.info.susp) { box.innerHTML = '<div class="card" style="margin-top:18px"><h2>Carte suspendue</h2><p class="muted">Voyez un gestionnaire pour recevoir une nouvelle carte.</p></div>'; return; }
  if (!S.pin) {
    box.innerHTML = `<form class="card" id="mePinForm" style="margin-top:18px"><div class="person">${avatar(S.me.name, 'big', myPhoto())}<div><h2>${esc(S.me.name)}</h2><small>Votre profil est protégé</small></div></div>
      <label style="text-align:center">Entrez votre code<input id="mePin" class="pinbox" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></label>
      <p class="err" id="mePinErr" role="alert"></p><button class="btn wide" type="submit">Ouvrir mon profil</button></form>`;
    $('#mePin').addEventListener('input', e => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)));
    $('#mePinForm').onsubmit = async e => {
      e.preventDefault(); const p = $('#mePin').value; if (!/^\d{4}$/.test(p)) return void ($('#mePinErr').textContent = 'Saisissez 4 chiffres.');
      S.pin = p; await loadMeData(true);
    };
    return;
  }
  if (!meData) { box.innerHTML = '<div class="card center muted" style="margin-top:18px">Chargement…</div>'; loadMeData(); return; }
  drawMe();
}
async function loadMeData(fromForm) {
  if (meLoading) return; meLoading = true;
  try {
    const r = await meCall('get');
    if (r.ok) { meData = r; if (r.photo) setMyPhoto(r.photo); drawMe(); }
    else { meData = null; renderMe(); const e = $('#mePinErr'); if (e) e.textContent = r.error || 'Impossible d’ouvrir le profil.'; }
  } catch { const e = $('#mePinErr'); if (e) e.textContent = 'Pas de connexion.'; else $('#meBody').innerHTML = '<div class="card" style="margin-top:18px"><p class="err">Pas de connexion.</p></div>'; S.pin = fromForm ? null : S.pin; }
  meLoading = false;
}
function drawMe() {
  const d = meData, p = d.profile, st = d.stats || {}, k = p.kind === 'stagiaire', rec = d.recent || [];
  const dotc = x => x.kd === 'conge' ? 'lv' : x.kd === 'ferie' || x.kd === 'repos' || x.kd === 'hors' ? 'off' : x.a ? (x.ab ? 'abs' : x.late ? 'late' : '') : 'abs';
  const lbl = x => x.kd === 'conge' ? 'En congé' : x.kd === 'ferie' ? 'Jour férié' : x.kd === 'repos' ? 'Non travaillé' : x.kd === 'hors' ? '—' : x.a ? `${fmtH(x.a)} → ${fmtH(x.dp)}${x.ab ? ' · arrivée tardive (absent)' : x.late ? ' · retard ' + x.late + ' min' : ''}${x.t ? ' · télétravail' : ''}${x.auto ? ' · départ automatique' : ''}` : 'Absent';
  $('#meBody').innerHTML = `<div class="card prof" style="margin-top:18px">
      ${avatar(p.name, 'xl', d.photo)}
      <h2>${esc(p.name)}${p.verified ? VERIFIED : ''}</h2>
      <div class="role">${esc(p.role || (k ? 'Stagiaire' : 'Employé'))}</div>
      <div><span class="tag">${k ? 'Stagiaire' : 'Employé'}</span>${p.service ? `<span class="tag gray">${esc(p.service)}</span>` : ''}${p.verified ? '<span class="tag blue">Vérifié par Soned</span>' : '<span class="tag gray">Non vérifié</span>'}</div>
      ${k && p.intern ? `<p class="muted" style="margin-top:10px;font-size:.9rem">${p.intern.school ? esc(p.intern.school) + ' · ' : ''}${p.intern.from ? 'du ' + esc(shortDate(p.intern.from)) : ''}${p.intern.to ? ' au ' + esc(shortDate(p.intern.to)) : ''}${p.intern.tutor ? '<br>Tuteur : ' + esc(p.intern.tutor) : ''}</p>` : ''}
      <div class="modal-actions" style="justify-content:center"><button class="btn ghost sm" id="phBtn" type="button">${d.photo ? 'Changer ma photo' : 'Ajouter ma photo'}</button>${d.photo ? '<button class="btn line sm" id="phDel" type="button">Retirer</button>' : ''}</div>
      <input type="file" id="phFile" accept="image/*" hidden>
      ${d.photo && !p.verified ? '<p class="muted" style="font-size:.82rem;margin-top:8px">Un gestionnaire vérifiera votre photo pour afficher le badge ✔.</p>' : ''}
    </div>
    ${rulesCard(d)}
    ${balanceCard(d)}
    ${placesCard(d)}
    <div class="card"><h3>Mes messages au RH</h3><p class="muted">Un problème, un oubli, un justificatif d’absence ? Écrivez ici : le RH est prévenu tout de suite.</p>
      <div class="modal-actions" style="justify-content:flex-start"><button class="btn sm" id="chatBtn" type="button">${IC.mail} Écrire au RH${d.chat && d.chat.unread ? ' · ' + d.chat.unread + ' nouveau' + (d.chat.unread > 1 ? 'x' : '') : ''}</button></div></div>
    ${annCard(d)}
    <div class="card"><h3>Mon mois (${esc(monthLabel(today().slice(0, 7)))})</h3>
      <div class="stats">
        <div class="stat"><b>${st.days || 0}</b><span>Jours de présence</span></div>
        <div class="stat"><b>${st.tele || 0}</b><span>Dont en télétravail</span></div>
        <div class="stat ${st.late ? 'bad' : ''}"><b>${st.late || 0}</b><span>Retards${st.late ? ' · ' + st.lateMin + ' min' : ''}</span></div>
        <div class="stat ${st.absent ? 'bad' : ''}"><b>${st.absent || 0}</b><span>Absences</span></div>
        <div class="stat"><b>${st.leave || 0}</b><span>Jours de congé</span></div>
        <div class="stat"><b>${st.holiday || 0}</b><span>Jours fériés</span></div>
        <div class="stat"><b>${hoursFr(st.min)}</b><span>Heures travaillées</span></div>
        <div class="stat ${st.forgot ? 'bad' : ''}"><b>${st.forgot || 0}</b><span>Départs non pointés</span></div>
        <div class="stat ${st.flagged ? 'bad' : ''}"><b>${st.flagged || 0}</b><span>Hors zone / non vérifié</span></div>
      </div>
      <p style="margin:16px 0 0"><b>Présence</b> <span class="muted">${st.presence == null ? 'pas encore de jour attendu' : st.presence + ' %'}</span></p><div class="bar"><i style="width:${st.presence || 0}%"></i></div>
      <p style="margin:12px 0 0"><b>Ponctualité</b> <span class="muted">${st.punct == null ? '—' : st.punct + ' %'}</span></p><div class="bar"><i style="width:${st.punct || 0}%"></i></div>
    </div>
    <div class="card"><h3>Mes derniers jours</h3><div class="hist">${rec.length ? rec.map(x => `<div class="hrow"><span class="dot ${dotc(x)}"></span><span class="d">${esc(shortDate(x.d))}</span><span class="t">${esc(lbl(x))}</span></div>`).join('') : '<p class="muted">Rien à afficher pour le moment.</p>'}</div></div>
    <div class="card"><h3>${S.me.k ? 'Ma carte' : 'Mon code'}</h3>
      <p class="muted">${S.me.k ? 'Votre carte est liée à ce téléphone et protégée par votre code.' : 'Votre code à 4 chiffres protège votre pointage. Le RH valide votre téléphone : une coche bleue apparaît sur vos pointages.'}</p>
      <div class="modal-actions" style="justify-content:flex-start"><button class="btn line sm" id="chPin" type="button">Changer mon code</button>${S.me.k ? '<button class="btn danger sm" id="lostBtn" type="button">Ma carte est perdue ou partagée</button>' : ''}</div>
      <p style="margin:14px 0 0"><button class="link" id="lockMe" type="button">Fermer mon profil</button></p></div>`;
  $('#phBtn').onclick = () => $('#phFile').click();
  $('#chatBtn').onclick = openChat;
  if ($('#plAdd')) $('#plAdd').onclick = openAddPlace;
  $$('#meBody [data-pl]').forEach(b => (b.onclick = () => confirmModal('<h2>Retirer ce lieu ?</h2><p>Vous ne pourrez plus pointer en télétravail depuis cet endroit.</p>', 'Retirer', async () => { const r = await meCall('rmplace', { pid: b.dataset.pl }); if (r.ok) { meData = r; closeModal(); drawMe(); toast('Lieu retiré.'); } else toast(r.error || 'Impossible.', 'error'); }, 'danger')));
  $('#phFile').onchange = e => { const f = e.target.files[0]; if (f) uploadPhoto(f); e.target.value = ''; };
  if ($('#phDel')) $('#phDel').onclick = async () => {
    const r = await meCall('rmphoto'); if (r.ok) { meData = r; setMyPhoto(null); drawMe(); toast('Photo retirée.'); } else toast(r.error || 'Impossible.', 'error');
  };
  $('#lockMe').onclick = () => { S.pin = null; meData = null; renderMe(); };
  $('#chPin').onclick = openChangePin;
  if ($('#lostBtn')) $('#lostBtn').onclick = () => confirmModal('<h2>Carte perdue ou partagée ?</h2><p>Votre carte sera <b>suspendue tout de suite</b> : plus personne ne pourra pointer avec. Un gestionnaire vous créera ensuite un nouveau QR code.</p>', 'Suspendre ma carte', async () => {
    const r = await meCall('report', { why: 'Carte perdue ou partagée' });
    if (r.ok) { closeModal(); toast('Carte suspendue. Voyez un gestionnaire.'); meData = null; S.pin = null; await reloadAll(); renderMe(); } else toast(r.error || 'Impossible de suspendre la carte.', 'error');
  }, 'danger');
}
const IC_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
function rulesCard(d) {
  const r = d.rules; if (!r) return '';
  return `<div class="card"><h3>Mes horaires</h3><div class="rules"><div><b>${fmtH(r.start)}</b><span>Arrivée</span></div><div><b>${fmtH(r.absentFrom)}</b><span>Considéré absent dès</span></div><div><b>${fmtH(r.arrivalClose)}</b><span>Fin du pointage d’arrivée</span></div><div><b>${fmtH(r.dayClose)}</b><span>Clôture de la journée</span></div></div>
    <p class="muted" style="margin:10px 0 0;font-size:.88rem">${hoursFr(r.work)} de travail par jour, pause comprise en plus. Départ oublié : l’application pointe votre départ à ${fmtH(r.dayClose)}.</p></div>`;
}
function balanceCard(d) {
  const b = d.balance; if (!b) return '';
  return `<div class="card"><h3>Mes congés ${esc(String(new Date().getFullYear()))}</h3><div class="stats"><div class="stat"><b>${b.total}</b><span>Jours de droit</span></div><div class="stat"><b>${b.taken}</b><span>Jours pris</span></div><div class="stat ${b.abs ? 'bad' : ''}"><b>${b.abs}</b><span>Absences déduites</span></div><div class="stat ${b.left < 0 ? 'bad' : ''}"><b>${b.left}</b><span>Jours restants</span></div></div>
    <p class="muted" style="margin:10px 0 0;font-size:.85rem">Une absence non justifiée est retirée automatiquement de vos congés. Justificatif : écrivez au RH.</p></div>`;
}
function placesCard(d) {
  if (!d.tele) return '';
  const pl = d.places || [];
  return `<div class="card"><h3>Mes lieux de télétravail</h3><p class="muted">Enregistrez l’endroit où vous travaillez, depuis cet endroit (${d.maxPlaces || 4} lieux au maximum). Un pointage de télétravail depuis un autre lieu est signalé au RH.</p>
    <div class="rows">${pl.length ? pl.map(p => `<div class="rowc"><span class="ico">${IC_PIN}</span><div class="nm"><b>${esc(p.n)}</b></div><button class="btn line sm" type="button" data-pl="${esc(p.id)}">Retirer</button></div>`).join('') : '<p class="muted" style="margin:0">Aucun lieu enregistré : vous ne pouvez pas encore pointer en télétravail.</p>'}</div>
    ${pl.length < (d.maxPlaces || 4) ? `<button class="btn sm" id="plAdd" type="button" style="margin-top:12px">${IC.plus} Ajouter l’endroit où je suis (${pl.length}/${d.maxPlaces || 4})</button>` : ''}</div>`;
}
function annCard(d) {
  const a = d.ann || []; if (!a.length) return '';
  return `<div class="card"><h3>Messages du service</h3><div class="anns">${a.map(x => `<div class="ann ${x.c === 'Prévention' ? 'prev' : ''}"><b>${esc(x.c)}</b><p>${esc(x.x)}</p><small>${esc(x.by)} (${esc(x.role)}) · ${esc(x.d)}</small></div>`).join('')}</div></div>`;
}
function openAddPlace() {
  openModal(`<h2>Ajouter un lieu de télétravail</h2><p class="muted">Placez-vous à l’endroit où vous travaillez, puis donnez-lui un nom.</p>
    <label>Nom du lieu<input id="plN" maxlength="30" placeholder="Ex : Maison, Chez ma sœur"></label><p class="err" id="plErr" role="alert"></p>
    <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="plOk" type="button">${IC_PIN} Enregistrer ici</button></div>`);
  $('#plOk').onclick = async () => {
    const n = $('#plN').value.trim(); if (n.length < 2) return void ($('#plErr').textContent = 'Donnez un nom au lieu.');
    $('#plOk').disabled = true; $('#plErr').textContent = 'Recherche de votre position…';
    try {
      const p = await getPosition(), c = p.coords, r = await meCall('addplace', { n, lat: c.latitude, lng: c.longitude, acc: Math.round(c.accuracy) });
      if (r.ok) { meData = r; closeModal(); drawMe(); toast('Lieu enregistré.'); } else { $('#plErr').textContent = r.error || 'Impossible.'; $('#plOk').disabled = false; }
    } catch (e) { $('#plErr').textContent = e && e.code === 1 ? 'Localisation refusée : autorisez-la dans votre navigateur.' : 'Position introuvable. Réessayez à l’extérieur ou activez le GPS.'; $('#plOk').disabled = false; }
  };
}
async function openChat() {
  if (!S.me) return void toast('Choisissez votre nom pour écrire au RH.', 'error');
  if (!S.pin) { showTab('me'); return void toast('Entrez votre code pour écrire au RH.'); }
  const r = await meCall('chat'); if (!r.ok) return void toast(r.error || 'Impossible.', 'error');
  const draw = c => {
    openModal(`<button class="modal-x" data-close type="button" aria-label="Fermer">×</button><h2>Écrire au RH</h2>
      <div class="chat" id="chBox">${c.list.length ? c.list.map(m => `<div class="bub ${m.f === 'e' ? 'me' : 'rh'}"><small>${esc(m.f === 'e' ? 'Vous' : m.by)} · ${esc(m.time)}${m.j ? ' · justificatif du ' + esc(shortDate(m.j)) : ''}</small>${esc(m.x)}</div>`).join('') : '<p class="muted" style="margin:0">Aucun message pour le moment.</p>'}</div>
      <label>Votre message<textarea id="chT" rows="3" maxlength="600" placeholder="Ex : Mon téléphone était en panne ce matin."></textarea></label>
      <label class="sw"><input id="chJ" type="checkbox"> C’est un justificatif d’absence ou de retard</label>
      <label id="chDW" hidden>Jour concerné<input id="chD" type="date" max="${today()}" value="${today()}"></label>
      <p class="err" id="chErr" role="alert"></p><div class="modal-actions"><button class="btn" id="chOk" type="button">Envoyer au RH</button></div>`);
    const box = $('#chBox'); box.scrollTop = box.scrollHeight;
    $('#chJ').onchange = () => ($('#chDW').hidden = !$('#chJ').checked);
    $('#chOk').onclick = async () => {
      const txt = $('#chT').value.trim(); if (txt.length < 2) return void ($('#chErr').textContent = 'Écrivez votre message.');
      $('#chOk').disabled = true;
      const x = await meCall('say', { txt, just: $('#chJ').checked, date: $('#chJ').checked ? $('#chD').value : '' });
      if (x.ok) { meData = x; toast('Message envoyé au RH.'); draw(x.chat); } else { $('#chErr').textContent = x.error || 'Impossible.'; $('#chOk').disabled = false; }
    };
  };
  draw(r.chat); meData = r;
}
function squarePhoto(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(img.width, img.height), sx = (img.width - s) / 2, sy = (img.height - s) / 2;
      for (const size of [256, 224, 192, 160, 128]) {
        const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); x.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        for (let q = .85; q >= .4; q -= .1) { const d = c.toDataURL('image/jpeg', q); if (d.length <= 60000) return res(d); }
      }
      rej(new Error('big'));
    };
    img.onerror = () => rej(new Error('img')); img.src = url;
  });
}
async function uploadPhoto(file) {
  try {
    toast('Envoi de la photo…'); const img = await squarePhoto(file);
    const r = await meCall('photo', { img });
    if (r.ok) { meData = r; setMyPhoto(r.photo || img); drawMe(); toast('Photo enregistrée. Un gestionnaire la vérifiera.'); } else toast(r.error || 'Photo refusée.', 'error');
  } catch { toast('Cette image n’a pas pu être utilisée. Essayez-en une autre.', 'error'); }
}
function openChangePin() {
  openModal(`<h2>Changer mon code</h2>
    <label>Nouveau code (4 chiffres)<input id="npA" class="pinbox" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></label>
    <label>Confirmez<input id="npB" class="pinbox" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></label>
    <p class="err" id="npErr" role="alert"></p>
    <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="npOk" type="button">Enregistrer</button></div>`);
  $$('#modalBox .pinbox').forEach(i => i.addEventListener('input', () => (i.value = i.value.replace(/\D/g, '').slice(0, 4))));
  $('#npOk').onclick = async () => {
    const a = $('#npA').value, b = $('#npB').value, err = $('#npErr');
    if (!/^\d{4}$/.test(a)) return void (err.textContent = 'Le code doit avoir 4 chiffres.');
    if (a !== b) return void (err.textContent = 'Les deux codes ne sont pas identiques.');
    $('#npOk').disabled = true;
    try {
      const r = await apiPost({ action: 'lock', ...(S.me.k ? { k: S.me.k } : { emp: S.me.id }), dev: deviceId(), pin: S.pin, newPin: a });
      if (r.ok) { S.pin = a; closeModal(); toast('Code changé.'); } else { err.textContent = r.error || 'Impossible.'; $('#npOk').disabled = false; }
    } catch { err.textContent = 'Pas de connexion.'; $('#npOk').disabled = false; }
  };
}

/* ---------- 12. CONTACT (service ou développeur) ---------- */
function openContact() {
  const t = parts(nowMs()), info = `\n\n---\nPage : ${location.origin}${location.pathname}\nDate : ${longDate(t.key)} ${t.hm}\n${S.me ? 'Nom : ' + S.me.name + '\n' : ''}`;
  const mk = (to, subj, body) => `mailto:${to}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body + info)}`;
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const opt = (ico, title, txt, to, subj, body) => `<div class="card" style="box-shadow:none;border:1px solid var(--line);padding:14px;margin-bottom:10px"><div class="person" style="margin:0"><span class="ico">${ico}</span><div><b>${title}</b><br><small>${txt}</small></div></div>
    <div class="modal-actions" style="margin-top:12px"><a class="btn sm" href="${mk(to, subj, body)}">Écrire un e-mail</a><button class="btn line sm" type="button" data-copy="${esc(to)}">Copier l’adresse</button></div><small style="display:block;margin-top:8px">${esc(to)}</small></div>`;
  const m = S.mails || {}, rh = m.rh || S.contact, dev = m.dev || CONFIG.devMail;
  openModal(`<button class="modal-x" data-close type="button" aria-label="Fermer">×</button><h2>Un problème ? Écrivez-nous</h2><p class="muted">Choisissez la bonne personne.</p>
    ${S.me ? `<div class="card" style="box-shadow:none;border:1px solid var(--g300);background:var(--g50);padding:14px;margin-bottom:10px"><div class="person" style="margin:0"><span class="ico">${svg('<path d="M4 5h16v11H9l-5 4z"/>')}</span><div><b>Message dans l’application</b><br><small>Le plus rapide : le RH répond ici, avec vos justificatifs.</small></div></div><div class="modal-actions" style="margin-top:12px"><button class="btn sm" id="ctChat" type="button">Écrire au RH</button></div></div>` : ''}
    ${rh ? opt(svg('<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>'), 'Le RH', 'Pointage oublié, carte perdue, congés, justificatif', rh, 'Espace Soned Afrique — demande au RH', 'Bonjour,\n\n') : ''}
    ${m.info ? opt(svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'), 'L’informaticien', 'Code bloqué, téléphone, carte QR, souci technique', m.info, 'Espace Soned Afrique — demande à l’informaticien', 'Bonjour,\n\n') : ''}
    ${opt(svg('<path d="m14.7 6.3 3 3M4 20l8.5-8.5M15 3.5a4.5 4.5 0 0 0-4.3 5.8L3.5 16.5a2 2 0 0 0 3 3l7.2-7.2A4.5 4.5 0 0 0 20.5 9l-3 3-3-3z"/>'), 'Le développeur (Mamadou Fall)', 'Le site ne marche pas, un bug, une idée', dev, 'Espace Soned Afrique — problème technique', 'Bonjour Mamadou,\n\nJe vous écris car :\n')}
    ${!rh && !m.info ? '<p class="muted" style="font-size:.9rem">Le RH n’a pas encore saisi ses adresses e-mail.</p>' : ''}`);
  if ($('#ctChat')) $('#ctChat').onclick = () => { closeModal(); showTab('me'); if (S.pin) openChat(); else toast('Entrez votre code pour écrire au RH.'); };
}

/* ---------- 13. QR CODE ET IMPRESSION ---------- */
function qrSvg(text, px) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2, t = n + 2 * m; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${t} ${t}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#0b1f12"/></svg>`;
}
const siteUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
const cardUrl = e => siteUrl() + '?k=' + encodeURIComponent(e.k);
const doorUrl = d => siteUrl() + '?d=' + encodeURIComponent(d);
function cardHtml(e, photo) {
  const kind = e.kind === 'stagiaire' ? 'Stagiaire' : 'Employé', role = e.kind === 'stagiaire' ? (/^stagiaire/i.test(e.role || '') ? e.role : (e.role || '')) : (e.role || '');
  const ini = String(e.name).split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<div class="pcard"><div class="pband"><img src="${LOGO}" alt=""><span>Soned Afrique</span></div>
    <div class="pphoto">${photo ? `<img src="${photo}" alt="">` : `<b>${esc(ini)}</b>`}</div>
    <div class="pb"><div class="pn">${esc(e.name)}</div><div class="pr">${esc(role || ' ')}</div><span class="pk">${kind}</span>
    <div class="pq">${qrSvg(cardUrl(e), 170)}</div><p class="pt">Scannez ce QR code avec l’appareil photo de votre téléphone pour pointer.</p></div>
    <div class="pfoot">Carte personnelle · ne pas prêter<br><span>Espace Soned Afrique · Développé par Mamadou Fall</span></div></div>`;
}
function printHtml(html, cls = '') {
  $('#printSheet').innerHTML = html;
  document.body.classList.add('printing'); if (cls) document.body.classList.add(cls);
  const done = () => { document.body.classList.remove('printing', 'print-cards', 'print-poster'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1500);
}
async function printCards(list) {
  if (!list.length) return void toast('Aucune carte à imprimer.', 'error');
  const photos = {};
  if (typeof adm === 'function') {                                        // photos des profils (10 à la fois)
    const ids = list.filter(e => e.ph).map(e => e.id);
    if (ids.length) toast('Préparation des badges…');
    for (let i = 0; i < ids.length; i += 10) { try { Object.assign(photos, (await adm('photomany', { ids: ids.slice(i, i + 10) })).photos); } catch (e) { break; } }
  }
  printHtml(list.map(e => cardHtml(e, photos[e.id])).join(''), 'print-cards');
}

/* ---------- 14. APPLICATION INSTALLABLE (PWA) ---------- */
let installEvt = window.__bip || null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function platform() {
  const ua = navigator.userAgent || '', ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const edge = /Edg\//.test(ua), firefox = /Firefox|FxiOS/.test(ua), crios = /CriOS/.test(ua), samsung = /SamsungBrowser/i.test(ua);
  const chrome = /Chrome\//.test(ua) && !edge && !/OPR\//.test(ua) && !samsung;
  return { ios, android: /android/i.test(ua), edge, firefox, crios, samsung, chrome, safari: /Safari/.test(ua) && !chrome && !crios && !firefox && !edge && !samsung,
    inapp: /FBAN|FBAV|Instagram|WhatsApp|Snapchat|TikTok|MicroMessenger|Twitter|Line\//i.test(ua) };
}
function installHelp() {
  const p = platform(); let title = 'Installer l’application', steps;
  const li = a => a.map((t, i) => `<li><b>${i + 1}</b><span>${t}</span></li>`).join('');
  if (p.inapp) steps = li(['Touchez les trois points (⋮ ou …) en haut ou en bas de l’écran', 'Choisissez « Ouvrir dans le navigateur » (Chrome ou Safari)', 'Revenez sur cette page et touchez « Installer »']);
  else if (p.ios && !p.safari) steps = li(['Sur iPhone et iPad, l’installation se fait avec <b>Safari</b>', 'Copiez l’adresse de cette page et ouvrez-la dans Safari', 'Touchez Partager (le carré avec une flèche), puis « Sur l’écran d’accueil »']);
  else if (p.ios) steps = li(['Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut), en bas de l’écran', 'Faites défiler et touchez <b>« Sur l’écran d’accueil »</b>', 'Touchez <b>Ajouter</b> : l’icône apparaît avec vos autres applications']);
  else if (p.android) steps = li(['Touchez le menu <b>⋮</b> en haut à droite du navigateur', 'Touchez <b>« Installer l’application »</b> (ou « Ajouter à l’écran d’accueil »)', 'Confirmez : l’icône apparaît avec vos autres applications', '<span class="muted">Pas d’option ? Ouvrez cette page avec Chrome.</span>']);
  else if (p.firefox) steps = li(['Firefox ne permet pas d’installer l’application sur ordinateur', 'Ouvrez cette adresse avec <b>Chrome</b> ou <b>Edge</b>', 'Cliquez ensuite sur « Installer »']);
  else if (p.edge) steps = li(['Cliquez sur l’icône <b>d’installation</b> à droite de la barre d’adresse (un petit écran avec un +)', 'Ou menu <b>…</b> → Applications → <b>Installer ce site en tant qu’application</b>', 'Confirmez avec <b>Installer</b>']);
  else steps = li(['Cliquez sur l’icône <b>d’installation</b> à droite de la barre d’adresse (un petit écran avec une flèche)', 'Ou menu <b>⋮</b> → Enregistrer et partager → <b>Installer Espace Soned…</b>', 'Confirmez avec <b>Installer</b>']);
  openModal(`<button class="modal-x" data-close type="button" aria-label="Fermer">×</button><h2>${title}</h2><p class="muted">Votre navigateur n’a pas proposé l’installation automatique. Voici comment faire, en quelques secondes :</p>
    <ul class="steps">${steps}</ul><div class="modal-actions"><button class="btn line sm" type="button" data-copy="${esc(siteUrl())}">Copier l’adresse du site</button><button class="btn sm" data-close type="button">Compris</button></div>`);
}
async function installNow() {
  if (installEvt) {
    const e = installEvt; installEvt = null; window.__bip = null;
    try { e.prompt(); const c = await e.userChoice; if (c && c.outcome === 'accepted') { toast('Application installée.'); hideInstall(); } else toast('Vous pouvez l’installer plus tard avec le bouton en haut.'); }
    catch { installHelp(); }
    return;
  }
  installHelp();
}
function hideInstall() { $('#installBox').hidden = true; $('#instTop').hidden = true; }
function setupPwa() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (isStandalone() || store.get('pscann10_installed')) return hideInstall();
  $('#instTop').hidden = false;
  const snooze = Number(store.get('pscann10_later')) || 0;
  $('#installBox').hidden = Date.now() < snooze;
  const upd = () => { $('#installTxt').textContent = installEvt ? 'Un seul geste pour l’ajouter à votre écran d’accueil.' : 'Accès direct depuis votre écran d’accueil, sans ouvrir le navigateur.'; };
  upd();
  window.addEventListener('bipready', () => { installEvt = window.__bip; upd(); });
  window.addEventListener('appinstalled', () => { store.set('pscann10_installed', '1'); hideInstall(); toast('Application installée.'); });
  $('#installBtn').onclick = installNow; $('#instTop').onclick = installNow;
  $('#installLater').onclick = () => { store.set('pscann10_later', String(Date.now() + 3 * 86400000)); $('#installBox').hidden = true; };
}

/* ---------- 15. DÉMARRAGE ---------- */
function bind() {
  if ($('#errChat')) $('#errChat').onclick = () => { if (S.pin) openChat(); else { openContact(); } };
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('#mailBtn').onclick = openContact;
  $('#reload').onclick = reloadAll;
  $('#spSave').onclick = savePin;
  $('#punchCard').addEventListener('submit', submitPunch);
  $$('.pinbox').forEach(i => i.addEventListener('input', () => (i.value = i.value.replace(/\D/g, '').slice(0, 4))));
  $('#retry').onclick = () => checkPosition();
  $('#modeSeg').addEventListener('click', e => { const b = e.target.closest('button[data-w]'); if (b) setWork(b.dataset.w, true); });
  $('#forget').onclick = () => confirmModal('<h2>Ce n’est pas vous ?</h2><p>Ce téléphone oubliera cette carte. Pour pointer à nouveau, il faudra scanner une carte.</p>', 'Oublier', () => { closeModal(); forgetMe(); });
  $('#npQ').addEventListener('input', drawNames);
  $('#npList').addEventListener('click', e => { const b = e.target.closest('button[data-emp]'); if (b) chooseEmp(b.dataset.emp, b.dataset.n, false); });
  $('#npTele').onclick = () => { S.cardInfo = true; S.mode = 'loading'; renderPoint(); $('#findBox').hidden = false; $('#findQ').focus(); };
  $('#npCard').onclick = () => { S.cardInfo = true; S.mode = 'loading'; renderPoint(); };
  $('#noCardBtn').onclick = () => { $('#findBox').hidden = !$('#findBox').hidden; if (!$('#findBox').hidden) $('#findQ').focus(); };
  $('#findQ').addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(doFind, 350); });
  $('#found').addEventListener('click', e => { const b = e.target.closest('button[data-emp]'); if (b) chooseEmp(b.dataset.emp, b.dataset.n, true); });
  $('#dPrev').onclick = () => { dayKey = addDays(dayKey || today(), -1); loadDay(); };
  $('#dNext').onclick = () => { dayKey = addDays(dayKey || today(), 1); loadDay(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshState(); });
  bindAdmin();
}
async function boot() {
  const u = new URLSearchParams(location.search);
  if (u.get('k')) { scanKey = u.get('k').slice(0, 60); history.replaceState(null, '', location.pathname); }   // le lien de la carte est effacé de la barre d'adresse
  if (u.get('d')) { const d = u.get('d').slice(0, 40); if (/^[a-z0-9]{16,40}$/.test(d)) { store.set(DOOR_KEY, d); store.del(ROSTER_KEY); } history.replaceState(null, '', location.pathname); }   // QR de l'entrée
  S.me = loadMe(); Splash.start(); bind(); setupPwa(); tick(); setInterval(tick, 1000);
  if (doorToken()) { try { S.roster = JSON.parse(store.get(ROSTER_KEY)); } catch { S.roster = null; } }   // liste déjà connue : affichage immédiat
  try { await Promise.all([loadState(), doorToken() ? loadRoster() : null]); } catch { S.error = true; S.loading = false; }
  if (S.door && !S.roster) await loadRoster();
  renderPoint(); setInterval(refreshState, 30000);
}

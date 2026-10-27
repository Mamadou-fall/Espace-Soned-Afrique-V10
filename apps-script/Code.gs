// Conçu et développé par Mamadou Fall — P.Scann by Soned © 2026 Mamadou Fall
/**
 * ESPACE SONED AFRIQUE (P.Scann) V10 — Script Google de Soned Afrique (sans Google Sheet, sans base de données)
 *
 *  NOUVEAU V10 : mode « QR à l'entrée » (chacun choisit son nom, code à 4 chiffres, GPS), clé d'appareil (2 téléphones validés par le RH,
 *  coche bleue sur les pointages), pointage des RH eux-mêmes, import de la liste, télétravail depuis le site (4 lieux), onglet Appareils.
 *
 *  1. Les gestionnaires (plusieurs, chacun avec son code) ajoutent les employés et les stagiaires dans l'espace Soned :
 *     chacun reçoit un QR code personnel (une carte à imprimer).
 *  2. L'employé scanne sa carte : le pointage est enregistré (24h/24, 7j/7). L'heure vient du SERVEUR.
 *     La carte est liée à son téléphone et protégée par un code à 4 chiffres.
 *  3. Les données sont dans un dossier Drive : employes.json, reglages.json, conges.json, journal.json,
 *     un fichier par jour et une photo par profil.
 *  4. Services (horaires), jours fériés, congés : un employé en congé ou un jour férié ne compte pas comme absent.
 *  5. Chaque action d'un gestionnaire est inscrite dans un journal qu'on ne peut ni modifier ni effacer depuis le site.
 *  6. Présentiel ou télétravail : à chaque pointage, la personne choisit. En présentiel, la position est vérifiée (zone du site).
 *     En télétravail, aucune position n'est demandée : le pointage est marqué « Télétravail » (confiance + trace : heure, téléphone, code).
 *  7. E-mails : alerte immédiate (retard, hors zone), point de 10h et de 19h, rapport de la veille vers 8h.
 *  8. Chaque matin vers 8h, la liste de la veille est envoyée par e-mail (PDF), seulement s'il y a eu des pointages
 *     et si une adresse a été saisie dans l'espace Soned.
 */
const CONFIG = {
  VERSION: '10.0',
  FOLDER: 'Espace Soned',                        // dossier Drive créé par le script (nom modifiable avant de lancer setup)
  TZ: 'Africa/Dakar',
  SITE: { lat: 14.74282340329234, lng: -17.28942341797315, radius: 100 }, // Soned Afrique, rayon en mètres
  MAIL_REPORT: [],                             // adresses du rapport : vides au départ, saisies dans l'espace Soned
  REPORT_HOUR: 8,                              // le rapport de la veille part entre 8h et 9h (Google choisit la minute)
  CLOSE_HOUR: 18,                              // la journée est clôturée vers 18h : départ automatique pour ceux qui ont oublié
  TELE_RADIUS: 150,                            // rayon (m) autour d'un lieu de télétravail enregistré
  MAX_PLACES: 4,
  MAX_DEVICES: 2,                              // téléphones validés par employé
  MAX_PEND: 3,                                 // téléphones en attente de validation par employé                               // lieux de télétravail par employé
  MAX_FAILS: 5,                                // codes faux avant blocage (employés et gestionnaires)
  MAX_EMPLOYEES: 300,
  MAX_ADMINS: 8,
  MAX_SERVICES: 20,
  ALERT_MAX_DAY: 30,                           // alertes immédiates par jour (le quota Gmail gratuit est d'environ 100 e-mails)
  MAIL_MAX_DAY: 60,
  RECAP_HOURS: [10, 19],                       // points e-mail de la journée
  MAX_RANGE_DAYS: 95,                          // statistiques : 3 mois au maximum par calcul
  MIN_GAP_SEC: 60,                             // délai minimum entre deux pointages d'une même personne
  MAX_ACC_M: 150,                              // au-delà de ±150 m d'imprécision, la position n'est pas considérée comme vérifiée
  MAX_SHIFT_H: 16,                             // au-delà, une arrivée sans départ est considérée comme « départ oublié »
  PHOTO_MAX: 70000,                            // taille maximale d'une photo de profil (texte base64)
  DEFAULTS: {
    start: '08:00', tol: 0, absentFrom: '08:30', arrivalClose: '09:30', dayClose: '18:00', work: 480, leaveDays: 24, days: [1, 2, 3, 4, 5],
    pauses: [['13:30', '14:30'], ['13:30', '14:30'], ['13:30', '14:30'], ['13:30', '14:30'], ['13:30', '15:00'], null, null]   // lundi → dimanche
  },
  // Jours fériés à date fixe au Sénégal. Les fêtes religieuses (Korité, Tabaski…) changent chaque année : le gestionnaire les ajoute.
  FIXED_HOLIDAYS: [
    { md: '01-01', n: 'Jour de l’An' }, { md: '04-04', n: 'Fête de l’Indépendance' }, { md: '05-01', n: 'Fête du Travail' },
    { md: '08-15', n: 'Assomption' }, { md: '11-01', n: 'Toussaint' }, { md: '12-25', n: 'Noël' }
  ]
};

const OK_STATUS = 'Sur place';
const TELE = 'Télétravail';                                           // pointage fait à distance : pas de position demandée
const AUTO = 'Départ automatique';                                    // départ enregistré par l'application à l'heure de clôture
const MANUAL = 'Saisi par Soned';                                   // pointage ajouté à la main par un gestionnaire
const badSt_ = st => !!st && st !== OK_STATUS && st !== 'Corrigé' && st !== MANUAL && st !== TELE && st !== AUTO;   // « en rouge » : hors zone ou position non vérifiée
const DAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const LEAVE_TYPES = ['Congé annuel', 'Maladie', 'Autre'];
const ROLES = { rh: 'RH', info: 'Informaticien', autre: 'Gestionnaire' };
let WHO_ = 'Système';                                               // qui fait l'action en cours (pour le journal)

/* ---------- À lancer UNE FOIS à la main : crée le dossier, le code Soned et l'envoi automatique de 8h ---------- */
function newAdminCode_() { return String(Math.floor(100000 + Math.random() * 900000)); }
function setup() {
  folder_();
  const s = settings_();
  if (!s.admins.length) {
    const code = newAdminCode_();
    s.admins = [{ id: uid_(), name: '', code: hashObj_(code), tmp: true, role: 'rh' }];
    saveSettings_(s);
    Logger.log('CODE PROVISOIRE DE L\'ESPACE SONED : ' + code + '  (à la première connexion, le gestionnaire choisit son nom et son propre code)');
  } else {
    Logger.log('Il existe déjà ' + s.admins.length + ' gestionnaire(s). Pour tout réinitialiser, lancez la fonction nouveauCodeSoned.');
  }
  if (!s.door) { s.door = newDoor_(); saveSettings_(s); Logger.log('QR d\'entrée créé : il sera affiché dans l\'espace RH, onglet « QR d\'entrée ».'); }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['sendDailyReport', 'sendRecap', 'closeDay'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyReport').timeBased().everyDays(1).atHour(CONFIG.REPORT_HOUR).inTimezone(CONFIG.TZ).create();
  ScriptApp.newTrigger('closeDay').timeBased().everyDays(1).atHour(CONFIG.CLOSE_HOUR).inTimezone(CONFIG.TZ).create();
  CONFIG.RECAP_HOURS.forEach(function (h) { ScriptApp.newTrigger('sendRecap').timeBased().everyDays(1).atHour(h).inTimezone(CONFIG.TZ).create(); });
  Logger.log('Clôture de la journée (départ automatique) vers ' + CONFIG.CLOSE_HOUR + 'h. Points e-mail à ' + CONFIG.RECAP_HOURS.join('h et ') + 'h.');
  Logger.log('P.Scann est prêt. Dossier Drive : ' + CONFIG.FOLDER + '. Rapport chaque matin vers ' + CONFIG.REPORT_HOUR + 'h.');
}
// Tous les codes perdus ? Lancez cette fonction : tous les gestionnaires sont remplacés par un seul accès provisoire.
// Un gestionnaire est bloqué et personne d'autre ne peut le débloquer ? Lancez cette fonction.
function debloquerTout() { writeJson_('securite.json', { d: {} }); Logger.log('Tous les appareils de gestionnaires sont débloqués.'); }
function nouveauCodeSoned() {
  const s = settings_(), code = newAdminCode_();
  s.admins = [{ id: uid_(), name: '', code: hashObj_(code), tmp: true, role: 'rh' }]; saveSettings_(s);
  Logger.log('NOUVEAU CODE PROVISOIRE DE L\'ESPACE SONED : ' + code);
}

/* ---------- Outils ---------- */
const fmt_ = (d, p) => Utilities.formatDate(d, CONFIG.TZ, p);
const day_ = d => fmt_(d, 'yyyy-MM-dd');
const minutes_ = hm => { const p = String(hm).split(':'); return Number(p[0]) * 60 + Number(p[1]); };
const hmFr_ = hm => { if (!hm) return '—'; const p = hm.split(':'); return Number(p[0]) + 'h' + p[1]; };
const normName_ = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const esc_ = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const clean_ = (s, max) => String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const uid_ = () => Utilities.getUuid().replace(/-/g, '').slice(0, 8);
const newDoor_ = () => (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 24);
const isoDow_ = key => { const d = new Date(key + 'T12:00:00Z'); return ((d.getUTCDay() + 6) % 7) + 1; }; // 1 = lundi … 7 = dimanche
function dateFr_(key) {
  const p = key.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
  return DAYS_FR[(d.getUTCDay() + 6) % 7] + ' ' + Number(p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
}
const validTime_ = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
const validMail_ = m => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(m || ''));
const validKey_ = k => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));

/* ---------- Codes personnels : jamais stockés en clair ---------- */
function hash_(salt, code) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + code, Utilities.Charset.UTF_8));
}
function hashObj_(code) { const s = uid_() + uid_(); return { s: s, h: hash_(s, String(code)) }; }
const sameCode_ = (obj, code) => !!obj && hash_(obj.s, String(code)) === obj.h;
const newToken_ = id => id + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 14);
const weakPin_ = p => /^(\d)\1{3}$/.test(p) || p === '1234' || p === '4321';

// Trop d'essais ratés : blocage de 10 minutes
function tooMany_(key) { const c = CacheService.getScriptCache().get('f_' + key); return !!c && Number(c) >= 5; }
function noteFail_(key) { const ca = CacheService.getScriptCache(); ca.put('f_' + key, String((Number(ca.get('f_' + key)) || 0) + 1), 600); }
function clearFail_(key) { CacheService.getScriptCache().remove('f_' + key); }

/* ---------- Stockage (dossier Drive) ---------- */
function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé : on le recrée */ } }
  const f = DriveApp.createFolder(CONFIG.FOLDER);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}
const CACHE_TTL = 600;   // 10 minutes ; une modification faite à la main dans Drive peut mettre jusqu'à 10 minutes à apparaître
function readJson_(name, fallback) {
  const ca = CacheService.getScriptCache(), hit = ca.get('j_' + name);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* cache illisible : on relit Drive */ } }
  const it = folder_().getFilesByName(name);
  if (!it.hasNext()) return fallback;
  let v; try { v = JSON.parse(it.next().getBlob().getDataAsString()); } catch (e) { return fallback; }
  try { ca.put('j_' + name, JSON.stringify(v), CACHE_TTL); } catch (e) { /* trop gros pour le cache : sans importance */ }
  return v;
}
function writeJson_(name, obj) {
  const f = folder_(), it = f.getFilesByName(name), txt = JSON.stringify(obj);
  if (it.hasNext()) it.next().setContent(txt); else f.createFile(name, txt, MimeType.PLAIN_TEXT);
  try { CacheService.getScriptCache().put('j_' + name, txt, CACHE_TTL); } catch (e) { /* sans importance */ }
}
const readDay_ = key => { const d = readJson_(key + '.json', null); return d && d.sessions ? d : { date: key, sessions: [] }; };
const writeDay_ = day => writeJson_(day.date + '.json', day);
const employees_ = () => readJson_('employes.json', { list: [] }).list;
const saveEmployees_ = list => writeJson_('employes.json', { list: list });

/* ---------- Réglages, photos, congés ---------- */
function validPauses_(a, d) {
  if (!Array.isArray(a) || a.length !== 7) return d.pauses.map(x => x && x.slice());
  return a.map(function (x, i) { return (Array.isArray(x) && validTime_(x[0]) && validTime_(x[1]) && minutes_(x[1]) > minutes_(x[0])) ? [x[0], x[1]] : null; });
}
function settings_() {
  const s = readJson_('reglages.json', {});
  const d = CONFIG.DEFAULTS;
  let admins = Array.isArray(s.admins) ? s.admins : (s.admin ? [{ id: 'a0', name: '', code: s.admin, tmp: !!s.adminTmp }] : []);   // reprend l'ancien code unique de la V5
  admins = admins.map(a => Object.assign({}, a, { role: ROLES[a.role] ? a.role : 'rh' }));
  const services = (Array.isArray(s.services) ? s.services : []).filter(x => x && x.id && x.name).map(x => ({
    id: x.id, name: x.name, night: !!x.night,
    start: validTime_(x.start) ? x.start : d.start, tol: typeof x.tol === 'number' ? x.tol : d.tol,
    days: Array.isArray(x.days) && x.days.length ? x.days : d.days.slice()
  }));
  const mails = { rh: '', dev: '', info: '' };
  if (s.mails) Object.keys(mails).forEach(k => { if (validMail_(s.mails[k])) mails[k] = s.mails[k]; });
  const extra = (Array.isArray(s.mail) && !s.mails) ? s.mail.filter(validMail_) : [];                 // anciennes adresses de la V8
  const mail = Object.keys(mails).map(k => mails[k]).concat(extra).filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);
  return {
    start: validTime_(s.start) ? s.start : d.start,
    tol: typeof s.tol === 'number' ? s.tol : d.tol,
    absentFrom: validTime_(s.absentFrom) ? s.absentFrom : d.absentFrom,
    arrivalClose: validTime_(s.arrivalClose) ? s.arrivalClose : d.arrivalClose,
    dayClose: validTime_(s.dayClose) ? s.dayClose : d.dayClose,
    work: (typeof s.work === 'number' && s.work >= 60 && s.work <= 720) ? s.work : d.work,
    leaveDays: (typeof s.leaveDays === 'number' && s.leaveDays >= 0 && s.leaveDays <= 90) ? s.leaveDays : d.leaveDays,
    pauses: validPauses_(s.pauses, d),
    days: Array.isArray(s.days) && s.days.length ? s.days : d.days.slice(),
    mails: mails, mail: mail,
    contact: validMail_(s.contact) ? s.contact : mails.rh,
    holidays: (Array.isArray(s.holidays) ? s.holidays : []).filter(h => h && validKey_(h.d)),
    services: services, admins: admins,
    alerts: s.alerts !== false,
    mode: ['badge', 'door', 'both'].indexOf(s.mode) >= 0 ? s.mode : 'both',
    door: /^[a-z0-9]{16,40}$/.test(String(s.door || '')) ? s.door : ''
  };
}
const saveSettings_ = s => writeJson_('reglages.json', { start: s.start, tol: s.tol, absentFrom: s.absentFrom, arrivalClose: s.arrivalClose, dayClose: s.dayClose, work: s.work, leaveDays: s.leaveDays, pauses: s.pauses, days: s.days, mails: s.mails, contact: s.contact, holidays: s.holidays, services: s.services, admins: s.admins, alerts: s.alerts, mode: s.mode, door: s.door });
const publicSettings_ = s => ({
  start: s.start, tol: s.tol, absentFrom: s.absentFrom, arrivalClose: s.arrivalClose, dayClose: s.dayClose, work: s.work, leaveDays: s.leaveDays, pauses: s.pauses,
  days: s.days, mails: s.mails, mail: s.mail, contact: s.contact,
  services: s.services, holidays: s.holidays, fixedHolidays: CONFIG.FIXED_HOLIDAYS, leaveTypes: LEAVE_TYPES,
  alerts: s.alerts, mode: s.mode
});
const leaves_ = () => readJson_('conges.json', { list: [] }).list;
const saveLeaves_ = list => writeJson_('conges.json', { list: list });
const photoName_ = id => 'ph_' + id + '.json';
const readPhoto_ = id => { const p = readJson_(photoName_(id), null); return p && p.d ? p.d : null; };
const writePhoto_ = (id, d) => writeJson_(photoName_(id), { d: d });
function deleteFile_(name) {
  const it = folder_().getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
  try { CacheService.getScriptCache().remove('j_' + name); } catch (e) { /* sans importance */ }
}
const validPhoto_ = p => typeof p === 'string' && p.length <= CONFIG.PHOTO_MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p);

/* ---------- Règles : horaires, jours fériés, congés ---------- */
const holidayName_ = (key, s) => {
  const f = CONFIG.FIXED_HOLIDAYS.filter(h => h.md === key.slice(5))[0];
  if (f) return f.n;
  const c = s.holidays.filter(h => h.d === key)[0];
  return c ? (c.n || 'Jour férié') : null;
};
const leaveOf_ = (emp, key, leaves) => leaves.filter(l => l.e === emp.id && l.from <= key && key <= l.to)[0] || null;
// Horaire d'un employé : celui de son service, sinon l'horaire général ; ses jours personnels passent avant.
const schedFor_ = (emp, s) => {
  const v = emp.svc ? s.services.filter(x => x.id === emp.svc)[0] : null, b = v || s;
  const shift = v ? minutes_(v.start) - minutes_(s.start) : 0, mm = m => { m = Math.max(0, Math.min(1439, m)); return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); };
  return {
    start: b.start, tol: b.tol, days: (emp.days && emp.days.length) ? emp.days : b.days, night: !!(v && v.night),
    absentFrom: mm(minutes_(s.absentFrom) + shift), arrivalClose: mm(minutes_(s.arrivalClose) + shift), dayClose: s.dayClose, work: s.work, pauses: s.pauses
  };
};
const pauseMin_ = (sc, dow) => { const p = sc.pauses[dow - 1]; return p ? minutes_(p[1]) - minutes_(p[0]) : 0; };
// Heure de départ la plus tôt : arrivée + durée de travail + pause, sans dépasser l'heure de clôture.
const earliestDep_ = (arr, sc, dow) => Math.min(minutes_(arr) + sc.work + pauseMin_(sc, dow), minutes_(sc.dayClose));
// Minutes réellement travaillées : la pause du jour est retirée.
function netMin_(a, d, sc, dow) {
  let m = minutes_(d) - minutes_(a); if (m <= 0) return 0;
  const p = sc.pauses[dow - 1];
  if (p) { const ov = Math.min(minutes_(d), minutes_(p[1])) - Math.max(minutes_(a), minutes_(p[0])); if (ov > 0) m -= ov; }
  return Math.max(0, m);
}
// Un stagiaire n'est attendu que pendant son stage ; personne n'est attendu avant son ajout.
const activeOn_ = (emp, key) => (emp.created || '0000-00-00') <= key &&
  !(emp.intern && ((emp.intern.from && key < emp.intern.from) || (emp.intern.to && key > emp.intern.to)));
// Nature d'un jour pour une personne : 'travail' (attendu) | 'ferie' | 'conge' | 'repos' | 'hors' (pas encore là / stage fini)
function kind_(emp, key, s, leaves) {
  if (!activeOn_(emp, key)) return 'hors';
  if (holidayName_(key, s)) return 'ferie';
  if (leaveOf_(emp, key, leaves)) return 'conge';
  return schedFor_(emp, s).days.indexOf(isoDow_(key)) >= 0 ? 'travail' : 'repos';
}
function lateMin_(time, sc) {
  const m = minutes_(time), st = minutes_(sc.start);
  return m > st + sc.tol ? m - st : 0;
}
const absLate_ = (time, sc) => minutes_(time) >= minutes_(sc.absentFrom);       // arrivée à partir de 8h30 : considéré absent (mais le pointage est gardé)
// Une personne est « à l'intérieur » si sa dernière arrivée n'a pas de départ et n'est pas trop ancienne.
const isInside_ = (emp, nowMs) => emp.active && emp.state === 'in' && emp.last && (nowMs - Date.parse(emp.last)) <= CONFIG.MAX_SHIFT_H * 3600000;
const empKind_ = emp => emp && emp.kind === 'stagiaire' ? 'stagiaire' : 'employe';

function distanceM_(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// Position : « sur place » seulement si la précision est correcte ; « hors zone » seulement si c'est certain
// (un ordinateur donne souvent une position très approximative : elle reste alors « non vérifiée »).
function statusOf_(lat, lng, acc) {
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  lat = num(lat); lng = num(lng); acc = num(acc);
  if (lat == null || lng == null) return { status: 'Position non vérifiée', dist: null };
  const dist = distanceM_(lat, lng, CONFIG.SITE.lat, CONFIG.SITE.lng), r = CONFIG.SITE.radius;
  if (dist <= r && (acc == null || acc <= CONFIG.MAX_ACC_M)) return { status: OK_STATUS, dist: dist };
  if (dist - (acc || 0) > r) return { status: 'Hors zone', dist: dist };
  return { status: 'Position non vérifiée', dist: dist };
}


/* ---------- Alertes (fil d'événements pour le RH) + e-mails ---------- */
//  Tout ce qui compte est inscrit dans alertes.json : la cloche de l'espace RH et les notifications du navigateur la lisent.
function evt_(lvl, text, empId) {
  try {
    const ev = readJson_('alertes.json', { list: [], seen: {} });
    ev.list.push({ i: uid_(), t: new Date().toISOString(), l: lvl, x: clean_(text, 220), e: empId || null });
    if (ev.list.length > 400) ev.list = ev.list.slice(-400);
    writeJson_('alertes.json', ev);
  } catch (e) { /* une alerte ne doit jamais bloquer une action */ }
}
function notify_(lvl, text, empId, mail) {
  evt_(lvl, text, empId);
  if (!mail) return;
  try {
    const s = settings_(); if (!s.mail.length || !s.alerts) return;
    if (!mailBudget_(CONFIG.ALERT_MAX_DAY)) return;                // plafond atteint : le point de 10h/19h les reprend
    const html = '<div style="font-family:Arial,sans-serif;max-width:520px"><h3 style="color:#0c5f20;margin-bottom:4px">Alerte — Espace Soned</h3><p>' + esc_(text) + '</p>' +
      '<p style="font-size:12px;color:#777">Message automatique de P.Scann by Soned. Retrouvez toutes les alertes dans l’espace RH (cloche).</p></div>';
    MailApp.sendEmail({ to: s.mail.join(','), name: 'P.Scann by Soned', subject: 'Alerte : ' + text.slice(0, 90), htmlBody: html });
  } catch (e) { /* quota : sans importance */ }
}
const eventsView_ = (adminId, limit) => {
  const ev = readJson_('alertes.json', { list: [], seen: {} }), seen = (ev.seen && ev.seen[adminId]) || '';
  const list = ev.list.slice(-limit).reverse().map(x => Object.assign({}, x, { time: fmt_(new Date(x.t), 'dd/MM HH:mm'), nw: x.t > seen }));
  return { list: list, unread: ev.list.filter(x => x.t > seen).length };
};
function eventsSeen_(adminId) {
  const ev = readJson_('alertes.json', { list: [], seen: {} }); ev.seen = ev.seen || {}; ev.seen[adminId] = new Date().toISOString(); writeJson_('alertes.json', ev);
}

/* ---------- Messages : discussion avec le RH, annonces, justificatifs ---------- */
const msgs_ = () => { const m = readJson_('messages.json', { th: {}, ann: [] }); m.th = m.th || {}; m.ann = m.ann || []; return m; };
const saveMsgs_ = m => writeJson_('messages.json', m);
const thread_ = (m, id) => m.th[id] || (m.th[id] = { m: [], ack: '', es: '' });          // ack : dernière lecture par le RH ; es : dernière lecture par l'employé
function say_(m, id, from, by, txt, extra) {
  const th = thread_(m, id);
  th.m.push(Object.assign({ i: uid_(), t: new Date().toISOString(), f: from, by: by, x: clean_(txt, 600) }, extra || {}));
  if (th.m.length > 80) th.m = th.m.slice(-80);
}

/* ---------- Clôture de la journée et registre des absences ---------- */
//  Départ oublié : à l'heure de clôture (18h), l'application pointe le départ elle-même, avec la mention « Départ automatique ».
function autoClose_(list, now) {
  const s = settings_(), today = day_(now), nowM = minutes_(fmt_(now, 'HH:mm')); let ch = false;
  list.forEach(function (emp) {
    if (emp.state !== 'in' || !emp.openDay) return;
    const sc = schedFor_(emp, s); if (sc.night) return;
    const od = emp.openDay;
    if (!(od < today || (od === today && nowM >= minutes_(sc.dayClose)))) return;
    const day = readDay_(od), ses = day.sessions.filter(x => x.i === emp.openId)[0];
    emp.state = 'out'; emp.openDay = null; emp.openId = null; ch = true;
    if (!ses) return;
    ses.d = (ses.a && minutes_(ses.a) > minutes_(sc.dayClose)) ? ses.a : sc.dayClose; ses.dT = now.toISOString(); ses.dS = AUTO; ses.dD = null; ses.auto = true;
    writeDay_(day);
    WHO_ = 'Système'; log_('Départ automatique', emp.name + ', ' + od + ' : départ enregistré à ' + hmFr_(ses.d) + ' (oubli).');
    notify_('warn', emp.name + ' n’a pas pointé son départ le ' + dateFr_(od) + ' : départ automatique à ' + hmFr_(ses.d) + '.', emp.id, false);
  });
  if (ch) saveEmployees_(list);
  return ch;
}
function closeDay() { autoClose_(employees_(), new Date()); }            // lancé vers 18h par un déclencheur

// Registre des absences : une ligne par jour de travail sans pointage (ou arrivée à partir de 8h30). Il sert au solde de congés.
const ledger_ = () => readJson_('absences.json', { done: [], list: [] });
function finalize_(key) {
  const led = ledger_(); if (led.done.indexOf(key) >= 0) return;
  const s = settings_(), emps = employees_(), leaves = leaves_(), day = readDay_(key), first = {};
  day.sessions.forEach(x => { if (!first[x.e]) first[x.e] = x; });
  emps.forEach(function (e) {
    if (!e.active || kind_(e, key, s, leaves) !== 'travail') return;
    const f = first[e.id];
    if (!f) led.list.push({ d: key, e: e.id, n: e.name, t: 'abs' });
    else if (f.abs) led.list.push({ d: key, e: e.id, n: e.name, t: 'late' });
  });
  led.done.push(key); if (led.done.length > 400) led.done = led.done.slice(-400); if (led.list.length > 4000) led.list = led.list.slice(-4000);
  writeJson_('absences.json', led);
}
function catchUp_() {                                                     // calcule les absences des jours passés (31 jours au plus)
  const led = ledger_(), yest = day_(new Date(Date.now() - 86400000));
  let k = led.done.length ? addDays_(led.done[led.done.length - 1], 1) : yest;
  if (daysBetween_(k, yest) > 31) k = addDays_(yest, -30);
  for (; k <= yest; k = addDays_(k, 1)) finalize_(k);
}
function unabs_(key, empId) {                                             // une correction ou un pointage manuel annule l'absence du jour
  const led = ledger_(), n = led.list.length;
  led.list = led.list.filter(a => !(a.d === key && a.e === empId));
  if (led.list.length !== n) writeJson_('absences.json', led);
}
function balance_(emp, year, s, leaves, led) {
  const total = typeof emp.leaveDays === 'number' ? emp.leaveDays : s.leaveDays, sc = schedFor_(emp, s);
  let taken = 0;
  leaves.filter(l => l.e === emp.id && l.type === 'Congé annuel').forEach(function (l) {
    const a = l.from < year + '-01-01' ? year + '-01-01' : l.from, z = l.to > year + '-12-31' ? year + '-12-31' : l.to;
    for (let k = a; k <= z; k = addDays_(k, 1)) if (sc.days.indexOf(isoDow_(k)) >= 0 && !holidayName_(k, s)) taken++;
  });
  const abs = led.list.filter(a => a.e === emp.id && a.d.slice(0, 4) === String(year) && !a.j).length;
  return { total: total, taken: taken, abs: abs, left: total - taken - abs };
}

/* ---------- Réponses au site (lecture) ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const now = new Date(), emps = employees_();
  if (p.action === 'state') {
    try { autoClose_(emps, now); } catch (x) { /* sans importance */ }
    const s = settings_(), out = { ok: true, serverTime: now.toISOString(), version: CONFIG.VERSION, mode: s.mode, door: !!(p.d && s.door && String(p.d) === s.door), contact: s.contact, mails: s.mails, rules: { start: s.start, absentFrom: s.absentFrom, arrivalClose: s.arrivalClose, dayClose: s.dayClose } };
    const m = p.k ? emps.filter(x => x.active && x.k === String(p.k))[0] : (p.emp ? emps.filter(x => x.active && x.id === p.emp)[0] : null);
    if (m) {
      const sv = m.svc ? s.services.filter(x => x.id === m.svc)[0] : null;
      out.me = {
        id: m.id, name: m.name, role: m.role, kind: empKind_(m), locked: !!m.pin, card: !!p.k, susp: !!m.susp, blocked: !!m.blocked, verified: !!m.verified, ph: !!m.ph, places: (m.places || []).length, dvOk: !!(p.dev && (m.devs || []).some(d => d.k === String(p.dev))),
        service: sv ? sv.name : '', inside: isInside_(m, now.getTime()), tele: m.tele !== false, mode: m.mode === 'tele' ? 'tele' : 'bureau',
        last: m.last ? { time: fmt_(new Date(m.last), 'HH:mm'), day: day_(new Date(m.last)) } : null
      };
    } else if (p.k) out.badCard = true;
    return json_(out);
  }
  if (p.action === 'find') {                // retrouver son nom (secours) : au moins 3 lettres, 6 résultats au plus, rien d'autre que le nom
    const q = normName_(p.q || '');
    if (q.length < 3) return json_({ ok: true, list: [] });
    const list = emps.filter(x => x.active && !x.susp && !x.adm && normName_(x.name).indexOf(q) >= 0).slice(0, 6).map(x => ({ id: x.id, name: x.name, role: x.role || '', np: !x.pin }));
    return json_({ ok: true, list: list });
  }
  if (p.action === 'roster') {              // QR de l'entrée : la liste des noms n'est donnée qu'avec le jeton du QR
    const s = settings_();
    if (s.mode === 'badge' || !s.door || String(p.d || '') !== s.door) return json_({ ok: false, error: 'QR de l’entrée non valide. Scannez à nouveau le QR code affiché à l’entrée.' });
    const list = emps.filter(x => x.active && !x.susp && !x.adm && !(x.intern && x.intern.to && x.intern.to < day_(now))).map(x => ({ id: x.id, name: x.name, role: x.role || '', np: !x.pin, kd: empKind_(x) }))
      .sort((a, c) => a.name.localeCompare(c.name, 'fr'));
    return json_({ ok: true, list: list, serverTime: now.toISOString() });
  }
  if (p.action === 'day') {                 // vue publique : uniquement des nombres, jamais de noms
    const today = day_(now);
    let key = validKey_(p.date) ? p.date : today;
    if (key > today) key = today;
    const day = readDay_(key), nowMs = now.getTime();
    const left = day.sessions.filter(s => s.d).length;
    const present = emps.filter(x => isInside_(x, nowMs)).length;
    return json_({ ok: true, date: key, today: today, arrivals: day.sessions.length, left: left, present: present, tele: day.sessions.filter(s => s.aS === TELE).length, serverTime: now.toISOString() });
  }
  return json_({ ok: true, service: 'P.Scann by Soned', version: CONFIG.VERSION });
}

/* ---------- Réponses au site (écriture) ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const b = JSON.parse(e.postData.contents); delete b.__adm;
    if (b.action === 'punch') return json_(punch_(b));
    if (b.action === 'lock') return json_(lock_(b));
    if (b.action === 'me') return json_(me_(b));
    if (b.action === 'adm') return json_(admin_(b));
    return json_({ ok: false, error: 'Action inconnue.' });
  } catch (err) {
    const m = String(err && err.message || err);
    return json_({ ok: false, error: /lock/i.test(m) ? 'Le serveur est très sollicité. Réessayez dans un instant.' : m });
  } finally {
    try { lock.releaseLock(); } catch (x) { /* rien */ }
  }
}

function findEmp_(list, id) { return list.filter(x => x.id === String(id || '') && x.active)[0]; }

// Qui est-ce, et a-t-il le droit de pointer ?
//  - carte personnelle (QR) : liée à UN téléphone ; sans code, il suffit de la carte ; avec code, il faut aussi le code
//  - nouveau téléphone : seulement avec le bon code (la carte est alors liée au nouveau téléphone)
//  - par le nom (secours) : seulement si la carte est verrouillée, avec le code
function authEmp_(list, b, opt) {
  opt = opt || {};
  const byCard = !!b.k;
  const emp = byCard ? list.filter(x => x.active && x.k === String(b.k))[0] : findEmp_(list, b.emp);
  if (!emp) return { err: { ok: false, reset: true, error: b.k ? 'Carte non reconnue. Demandez une nouvelle carte au service du personnel.' : 'Employé introuvable. Cherchez à nouveau votre nom.' } };
  if (b.__adm === true && !byCard && emp.adm) return { emp: emp, dirty: false };       // un gestionnaire connecté pointe pour lui-même (jamais pour un autre)
  if (emp.susp) return { err: { ok: false, susp: true, error: 'Cette carte est suspendue. Voyez un gestionnaire pour en obtenir une nouvelle.' } };
  if (emp.intern && emp.intern.to && emp.intern.to < day_(new Date())) return { err: { ok: false, ended: true, error: 'Votre stage est terminé. Voyez un gestionnaire.' } };
  const dev = /^[a-z0-9]{12,40}$/.test(String(b.dev || '')) ? String(b.dev) : '';
  const foreign = byCard && !!emp.dev && emp.dev !== dev;
  if (foreign && !emp.pin) return { err: { ok: false, device: true, error: 'Cette carte est liée à un autre téléphone. Voyez un gestionnaire pour la lier à celui-ci.' } };
  if (emp.blocked) return { err: { ok: false, blocked: true, error: 'Accès bloqué après ' + CONFIG.MAX_FAILS + ' codes incorrects. Présentez-vous au RH ou à l’informaticien pour le débloquer.' } };
  let dirty0 = false;
  if (emp.pin) {
    if (b.pin == null || b.pin === '') return { err: { ok: false, needPin: true, error: foreign ? 'Nouveau téléphone : entrez votre code pour le lier.' : 'Entrez votre code.' } };
    if (!sameCode_(emp.pin, b.pin)) {
      emp.fails = (emp.fails || 0) + 1;
      if (emp.fails >= CONFIG.MAX_FAILS) {
        emp.blocked = { at: new Date().toISOString() }; saveEmployees_(list); WHO_ = 'Système';
        log_('Sécurité', 'Accès bloqué après ' + CONFIG.MAX_FAILS + ' codes incorrects : ' + emp.name + '.');
        notify_('bad', emp.name + ' est bloqué(e) après ' + CONFIG.MAX_FAILS + ' codes incorrects. Il/elle doit venir au RH ou à l’informaticien.', emp.id, true);
        return { err: { ok: false, blocked: true, error: 'Accès bloqué après ' + CONFIG.MAX_FAILS + ' codes incorrects. Présentez-vous au RH ou à l’informaticien pour le débloquer.' } };
      }
      saveEmployees_(list);
      const left = CONFIG.MAX_FAILS - emp.fails;
      return { err: { ok: false, wrongPin: true, left: left, error: 'Code incorrect. Il vous reste ' + left + ' essai' + (left > 1 ? 's' : '') + ' avant le blocage de votre accès.' } };
    }
    if (emp.fails) { emp.fails = 0; dirty0 = true; }
  } else if (!byCard && !(opt.first && !emp.adm)) {
    return { err: { ok: false, noCard: true, error: 'Choisissez votre nom puis créez votre code à 4 chiffres, ou scannez votre carte personnelle.' } };
  }
  let dirty = dirty0;
  if (byCard && dev && emp.dev !== dev) {
    if (foreign) { WHO_ = 'Employé'; log_('Carte', 'Téléphone changé (code validé) : ' + emp.name + '.'); }
    emp.dev = dev; dirty = true;
  }
  return { emp: emp, dirty: dirty };
}

// Verrouiller sa carte (ou changer son code de verrou)
function lock_(b) {
  const list = employees_(), au = authEmp_(list, b, { first: true });
  if (au.err) return au.err;
  const s0 = settings_();
  if (!b.k && !au.emp.pin && s0.mode === 'badge') return { ok: false, error: 'Le mode « carte personnelle » est actif : scannez votre carte pour créer votre code.' };
  const emp = au.emp, np = String(b.newPin || '');
  if (!/^\d{4}$/.test(np)) return { ok: false, error: 'Le code doit avoir 4 chiffres.' };
  if (weakPin_(np)) return { ok: false, error: 'Code trop simple (ex. 1234 ou 1111). Choisissez-en un autre.' };
  if (emp.pin && np === String(b.pin)) return { ok: false, error: 'Choisissez un code différent de l’ancien.' };
  const firstTime = !emp.pin; emp.pin = hashObj_(np);
  if (firstTime && !b.k) {
    WHO_ = 'Employé'; const dv = /^[a-z0-9]{12,40}$/.test(String(b.dev || '')) ? String(b.dev) : '';
    if (dv) devCheck_(emp, dv, b.dn);
    log_('Code', 'Code créé depuis le site par ' + emp.name + (dv ? ' (appareil n° ' + dv.slice(0, 4).toUpperCase() + ')' : '') + '.');
    notify_('info', emp.name + ' a créé son code personnel' + (dv ? ' depuis l’appareil n° ' + dv.slice(0, 4).toUpperCase() + ' (à valider dans Appareils)' : '') + '. Ce n’est pas vous ? Réinitialisez son code.', emp.id, false);
  }
  saveEmployees_(list);
  return { ok: true };
}

// Clé d'appareil : chaque téléphone a une clé unique gardée dans l'application. Le RH valide jusqu'à 2 téléphones par employé.
// Un pointage depuis un téléphone validé porte la coche bleue ; depuis un autre téléphone il est accepté mais signalé (jamais bloqué).
function devCheck_(emp, dev, label) {
  if (!dev) return { v: 0, isNew: false };
  if ((emp.devs || []).some(d => d.k === dev)) return { v: 1, isNew: false };
  emp.pend = emp.pend || [];
  if (emp.pend.some(d => d.k === dev)) return { v: 0, isNew: false };
  emp.pend.push({ k: dev, n: clean_(label || '', 60), at: new Date().toISOString() });
  while (emp.pend.length > CONFIG.MAX_PEND) emp.pend.shift();
  return { v: 0, isNew: true };
}
const isNum_ = v => typeof v === 'number' && isFinite(v);
// Télétravail : le pointage doit venir d'un des lieux enregistrés par l'employé (4 au plus). Sinon il est signalé en rouge au RH.
function teleStatus_(emp, b) {
  const pl = emp.places || [];
  if (!isNum_(b.lat) || !isNum_(b.lng)) return { status: 'Position non vérifiée', dist: null };
  let best = null;
  pl.forEach(p => { const d = distanceM_(b.lat, b.lng, p.lat, p.lng); if (!best || d < best.d) best = { d: d, n: p.n }; });
  const acc = isNum_(b.acc) ? b.acc : 0;
  if (best && best.d <= CONFIG.TELE_RADIUS + Math.min(acc, 100)) return { status: TELE, dist: best.d, place: best.n };
  return { status: 'Lieu non enregistré', dist: best ? best.d : null };
}

function punch_(b) {
  const cache = CacheService.getScriptCache(), pid = String(b.id || '').slice(0, 40);
  if (pid) { const known = cache.get('id_' + pid); if (known) return JSON.parse(known); }        // double appui : même réponse
  const s = settings_(), list = employees_();
  const wantTele = b.mode === 'tele';
  if (!b.k && !b.__adm && !wantTele && (s.mode === 'badge' || !s.door || String(b.dt || '') !== s.door)) return { ok: false, door: true, error: 'Pour pointer au bureau, scannez le QR code affiché à l’entrée (ou votre carte personnelle).' };
  const au = authEmp_(list, b);
  if (au.err) return au.err;
  const emp = au.emp;
  const devId = /^[a-z0-9]{12,40}$/.test(String(b.dev || '')) ? String(b.dev) : '';
  const now = new Date(), nowMs = now.getTime(), key = day_(now), time = fmt_(now, 'HH:mm');
  const wasIn = isInside_(emp, nowMs);
  autoClose_(list, now);                                                                          // départ oublié de la veille (ou de 18h) : clôturé d'abord
  if (wasIn && emp.state !== 'in' && minutes_(time) >= minutes_(schedFor_(emp, s).dayClose)) return { ok: false, closed: true, error: 'La journée est clôturée à ' + hmFr_(schedFor_(emp, s).dayClose) + ' : votre départ a été enregistré automatiquement.' };
  if (emp.last && nowMs - Date.parse(emp.last) < CONFIG.MIN_GAP_SEC * 1000) {
    return { ok: false, error: 'Vous venez de pointer. Patientez une minute avant de recommencer.' };
  }
  const type = isInside_(emp, nowMs) ? 'Départ' : 'Arrivée';
  const tele = b.mode === 'tele';
  if (tele && emp.tele === false) return { ok: false, error: 'Le télétravail n’est pas activé pour vous. Pointez depuis le bureau.' };
  if (tele && !(emp.places || []).length) return { ok: false, needPlace: true, error: 'Enregistrez d’abord votre lieu de télétravail : Profil → Mes lieux de télétravail (depuis l’endroit où vous travaillez).' };
  const g = tele ? teleStatus_(emp, b) : statusOf_(b.lat, b.lng, b.acc), status = g.status, dist = g.dist;

  const dvr = b.__adm ? { v: 1, isNew: false } : devCheck_(emp, devId, b.dn);
  const day = readDay_(key), leaves = leaves_(), sc = schedFor_(emp, s), dow = isoDow_(key);
  const workday = kind_(emp, key, s, leaves) === 'travail' && !sc.night, m = minutes_(time);
  let late = 0, absent = false, earliest = null;
  if (type === 'Arrivée') {
    const first = !day.sessions.some(x => x.e === emp.id);
    if (workday && m >= minutes_(sc.dayClose)) {
      notify_('warn', emp.name + ' a essayé de pointer son arrivée à ' + hmFr_(time) + ' : la journée est clôturée.', emp.id, false);
      return { ok: false, closed: true, error: 'La journée est terminée (' + hmFr_(sc.dayClose) + '). Vous ne pouvez plus pointer. Écrivez au RH avec le bouton « Message ».' };
    }
    if (workday && first && m > minutes_(sc.arrivalClose)) {
      notify_('bad', emp.name + ' a essayé de pointer son arrivée à ' + hmFr_(time) + ' : le pointage d’arrivée était fermé depuis ' + hmFr_(sc.arrivalClose) + '. Considéré(e) absent(e).', emp.id, true);
      return { ok: false, closed: true, error: 'Le pointage d’arrivée est fermé depuis ' + hmFr_(sc.arrivalClose) + '. Vous êtes considéré(e) absent(e) aujourd’hui. Écrivez au RH avec le bouton « Message ».' };
    }
    if (first && workday) { late = lateMin_(time, sc); absent = absLate_(time, sc); earliest = earliestDep_(time, sc, dow); }
    const ses = { i: uid_(), e: emp.id, n: emp.name, r: emp.role, a: time, aT: now.toISOString(), aS: status, aD: dist, v: dvr.v };
    if (tele && g.place) ses.pl = g.place;
    if (absent) ses.abs = true; else if (late > 0) ses.late = late;
    if (absent) ses.late = late;
    day.sessions.push(ses); writeDay_(day);
    emp.state = 'in'; emp.openDay = key; emp.openId = ses.i;
  } else {
    const od = emp.openDay || key;
    let target = od === key ? day : readDay_(od);
    let ses = target.sessions.filter(x => x.i === emp.openId)[0];
    if (workday && ses && od === key && ses.a && target.sessions.filter(x => x.e === emp.id)[0] === ses) {   // départ avant l'heure : refusé (8 h de travail + pause)
      const min = earliestDep_(ses.a, sc, dow);
      if (m < min) {
        const hh = ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2);
        notify_('warn', emp.name + ' a essayé de pointer son départ à ' + hmFr_(time) + ' avant l’heure autorisée (' + hmFr_(hh) + ').', emp.id, false);
        return { ok: false, early: true, earliest: hh, error: 'Trop tôt pour partir : vous avez pointé à ' + hmFr_(ses.a) + ', votre départ est possible à partir de ' + hmFr_(hh) + ' (8 h de travail + pause). Un souci ? Écrivez au RH avec le bouton « Message ».' };
      }
    }
    if (!ses) { target = day; ses = { i: uid_(), e: emp.id, n: emp.name, r: emp.role, orph: true }; day.sessions.push(ses); }   // arrivée introuvable : on garde quand même le départ
    ses.d = time; ses.dT = now.toISOString(); ses.dS = status; ses.dD = dist; ses.vd = dvr.v;
    if (target.date !== key) ses.dDay = key;                                  // départ un autre jour que l'arrivée (service de nuit)
    writeDay_(target);
    emp.state = 'out'; emp.openDay = null; emp.openId = null;
  }
  emp.last = now.toISOString(); emp.mode = tele ? 'tele' : 'bureau';
  saveEmployees_(list);

  if (type === 'Arrivée' && absent) notify_('bad', emp.name + ' est arrivé(e) à ' + hmFr_(time) + ' (à partir de ' + hmFr_(sc.absentFrom) + ') : considéré(e) absent(e), pointage gardé.', emp.id, true);
  else if (type === 'Arrivée' && late > 0) notify_('warn', emp.name + ' est en retard de ' + late + ' min (arrivée à ' + hmFr_(time) + ').', emp.id, true);
  if (dvr.isNew) notify_('warn', emp.name + ' a pointé depuis un appareil non reconnu (n° ' + devId.slice(0, 4).toUpperCase() + '). Pointage accepté, sans coche bleue : à valider dans l’onglet Appareils.', emp.id, false);
  if (badSt_(status)) notify_('bad', emp.name + ' : ' + (type === 'Départ' ? 'départ' : 'arrivée') + ' à ' + hmFr_(time) + ' — ' + (status === 'Lieu non enregistré' ? 'pointage de télétravail depuis un lieu non enregistré' : String(status).toLowerCase()) + '.', emp.id, true);
  const out = { ok: true, type: type, time: time, status: status, name: emp.name, late: late, absent: absent, day: key, tele: tele, verified: !!emp.verified, dv: dvr.v, serverTime: now.toISOString() };
  if (earliest != null) out.earliest = ('0' + Math.floor(earliest / 60)).slice(-2) + ':' + ('0' + (earliest % 60)).slice(-2);
  if (pid) cache.put('id_' + pid, JSON.stringify(out), 3600);
  return out;
}

// Profil de l'employé (par sa carte) : voir ses chiffres, changer sa photo, signaler une carte perdue ou partagée
function me_(b) {
  if (!b.k && b.op === 'report') return { ok: false, error: 'Signaler une carte perdue demande la carte.' };
  const list = employees_(), au = authEmp_(list, b);
  if (au.err) return au.err;
  const emp = au.emp, s = settings_(), now = new Date(), op = b.op || 'get';
  WHO_ = 'Employé'; let flash = null;
  if (op === 'photo') {
    if (!validPhoto_(b.img)) return { ok: false, error: 'Photo non valide (JPEG, taille réduite).' };
    writePhoto_(emp.id, b.img); emp.ph = true; emp.verified = null;           // une nouvelle photo doit être vérifiée à nouveau
    saveEmployees_(list); log_('Profil', 'Photo modifiée : ' + emp.name + ' (à vérifier).');
  } else if (op === 'rmphoto') {
    deleteFile_(photoName_(emp.id)); emp.ph = false; emp.verified = null;
    saveEmployees_(list); log_('Profil', 'Photo retirée : ' + emp.name + '.');
  } else if (op === 'report') {                                                  // carte perdue ou partagée : suspendue tout de suite
    emp.susp = true; emp.alert = { at: now.toISOString(), why: clean_(b.why || 'Carte perdue ou partagée', 80) };
    saveEmployees_(list); log_('Sécurité', 'Carte signalée par l’employé et suspendue : ' + emp.name + '.');
    return { ok: true, suspended: true };
  } else if (op === 'addplace') {                                                // lieu de télétravail : l'employé l'enregistre lui-même (4 au plus)
    if (emp.tele === false) return { ok: false, error: 'Le télétravail n’est pas activé pour vous.' };
    emp.places = emp.places || [];
    if (emp.places.length >= CONFIG.MAX_PLACES) return { ok: false, error: 'Vous avez déjà ' + CONFIG.MAX_PLACES + ' lieux. Supprimez-en un pour en ajouter un autre.' };
    if (!isNum_(b.lat) || !isNum_(b.lng) || Math.abs(b.lat) > 90 || Math.abs(b.lng) > 180) return { ok: false, error: 'Position introuvable. Autorisez la localisation puis réessayez.' };
    if (isNum_(b.acc) && b.acc > 300) return { ok: false, error: 'Position trop imprécise (' + Math.round(b.acc) + ' m). Sortez ou activez le GPS puis réessayez.' };
    const nm = clean_(b.n || '', 30); if (nm.length < 2) return { ok: false, error: 'Donnez un nom au lieu (ex. Maison, Chez ma sœur).' };
    if (emp.places.some(p => distanceM_(b.lat, b.lng, p.lat, p.lng) < 60)) return { ok: false, error: 'Ce lieu est déjà enregistré.' };
    emp.places.push({ id: uid_(), n: nm, lat: Math.round(b.lat * 1e6) / 1e6, lng: Math.round(b.lng * 1e6) / 1e6 });
    saveEmployees_(list); log_('Télétravail', 'Lieu enregistré par ' + emp.name + ' : ' + nm + ' (' + emp.places.length + '/' + CONFIG.MAX_PLACES + ').');
    notify_('info', emp.name + ' a enregistré un lieu de télétravail : « ' + nm + ' » (' + emp.places.length + '/' + CONFIG.MAX_PLACES + ').', emp.id, false);
  } else if (op === 'rmplace') {
    emp.places = (emp.places || []).filter(p => p.id !== b.pid); saveEmployees_(list);
    log_('Télétravail', 'Lieu retiré par ' + emp.name + '.');
  } else if (op === 'say') {                                                     // message au RH (problème, justificatif)
    const txt = clean_(b.txt || '', 600); if (txt.length < 2) return { ok: false, error: 'Écrivez votre message.' };
    const mg = msgs_(), th = thread_(mg, emp.id);
    if (th.m.length && th.m[th.m.length - 1].f === 'e' && Date.parse(th.m[th.m.length - 1].t) > Date.now() - 5000) return { ok: false, error: 'Message déjà envoyé.' };
    const just = !!b.just && validKey_(b.date) ? b.date : null;
    say_(mg, emp.id, 'e', emp.name, txt, just ? { j: just } : null); th.es = new Date().toISOString(); saveMsgs_(mg);
    notify_(just ? 'warn' : 'info', (just ? 'Justificatif de ' : 'Message de ') + emp.name + (just ? ' pour le ' + dateFr_(just) : '') + ' : « ' + txt.slice(0, 80) + (txt.length > 80 ? '…' : '') + ' »', emp.id, true);
    flash = 'sent';
  } else if (au.dirty) saveEmployees_(list);
  const today = day_(now), st = rangeData_(today.slice(0, 7) + '-01', today, { emp: emp.id });
  const sv = emp.svc ? s.services.filter(x => x.id === emp.svc)[0] : null;
  return {
    ok: true, serverTime: now.toISOString(),
    profile: { name: emp.name, role: emp.role, kind: empKind_(emp), service: sv ? sv.name : '', verified: !!emp.verified, locked: !!emp.pin, intern: emp.intern || null },
    photo: emp.ph ? readPhoto_(emp.id) : null,
    stats: st.rows[0] || null, recent: (st.rows[0] ? st.rows[0].daily : []).slice(-10).reverse(),
    places: (emp.places || []).map(p => ({ id: p.id, n: p.n })), maxPlaces: CONFIG.MAX_PLACES, tele: emp.tele !== false, flash: flash,
    balance: (function () { try { catchUp_(); return balance_(emp, Number(today.slice(0, 4)), s, leaves_(), ledger_()); } catch (e) { return null; } })(),
    chat: chatFor_(emp, op === 'chat' || op === 'say'),
    ann: msgs_().ann.slice(-8).reverse().map(a => ({ i: a.i, c: a.c, x: a.x, by: a.by, role: a.role, d: fmt_(new Date(a.t), 'dd/MM/yyyy') })),
    rules: { start: s.start, absentFrom: s.absentFrom, arrivalClose: s.arrivalClose, dayClose: s.dayClose, work: s.work }
  };
}

function chatFor_(emp, markSeen) {
  const mg = msgs_(), th = mg.th[emp.id] || { m: [], es: '' };
  const unread = th.m.filter(x => x.f === 'g' && x.t > (th.es || '')).length;
  const out = { unread: markSeen ? 0 : unread, list: th.m.slice(-30).map(x => ({ f: x.f, by: x.by, x: x.x, j: x.j || null, time: fmt_(new Date(x.t), 'dd/MM HH:mm') })) };
  if (markSeen && unread) { th.es = new Date().toISOString(); mg.th[emp.id] = th; saveMsgs_(mg); }
  return out;
}

/* ---------- Espace Soned (protégé : chaque gestionnaire a son code) ---------- */
const daysBetween_ = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const addDays_ = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const normDays_ = a => (Array.isArray(a) && a.length && a.every(d => d >= 1 && d <= 7)) ? a.map(Number) : null;
function cleanIntern_(i) {
  i = i || {};
  const from = validKey_(i.from) ? i.from : '', to = validKey_(i.to) ? i.to : '';
  if (from && to && from > to) return { err: 'La fin du stage doit être après son début.' };
  return { school: clean_(i.school || '', 60), tutor: clean_(i.tutor || '', 60), from: from, to: to };
}
function newUniqueAdminCode_(s) {
  let code; do { code = newAdminCode_(); } while (s.admins.some(a => sameCode_(a.code, code)));
  return code;
}

//  Ce que chaque rôle n'a PAS le droit de faire (le RH peut tout). L'informaticien ne pointe personne à la main et ne touche ni aux horaires, ni aux congés, ni aux fériés.
const DENY_ = {
  info: ['fix', 'manual', 'save', 'svcsave', 'svcdel', 'holsave', 'holdel', 'leaveadd', 'leavedel', 'leaveset', 'justify', 'addadmin', 'resetadmin', 'renameadmin', 'rmadmin', 'setrole', 'alertset', 'modeset', 'newdoor'],
  autre: ['fix', 'manual', 'save', 'svcsave', 'svcdel', 'holsave', 'holdel', 'leaveadd', 'leavedel', 'leaveset', 'justify', 'addadmin', 'resetadmin', 'renameadmin', 'rmadmin', 'setrole', 'alertset',
    'add', 'update', 'remove', 'unlock', 'newqr', 'unbind', 'verify', 'unblockemp', 'unblockdev', 'rmplace', 'reply', 'sendreport', 'sendmonth', 'modeset', 'newdoor', 'devices', 'devok', 'devrm', 'devall', 'teleview', 'doorget']
};
const allowed_ = (role, op) => !(DENY_[role] && DENY_[role].indexOf(op) >= 0);

function admin_(b) {
  const s = settings_();
  if (!s.admins.length) return { ok: false, error: 'Espace Soned non configuré : lancez la fonction setup dans le script Google.' };
  const dev = /^[a-z0-9]{12,40}$/.test(String(b.dev || '')) ? String(b.dev) : 'inconnu', now = new Date();
  const sec = readJson_('securite.json', { d: {} }); sec.d = sec.d || {};
  const rec = sec.d[dev] || { n: 0 };
  const blockedMsg = 'Cet appareil est bloqué après ' + CONFIG.MAX_FAILS + ' codes incorrects. Présentez-vous au RH ou à l’informaticien avec ce numéro : ' + dev.slice(0, 4).toUpperCase() + '.';
  if (rec.blocked) return { ok: false, blocked: true, ref: dev.slice(0, 4).toUpperCase(), error: blockedMsg };
  const me = s.admins.filter(a => sameCode_(a.code, b.code))[0];
  if (!me) {
    WHO_ = 'Système'; rec.n = (rec.n || 0) + 1; rec.at = now.toISOString();
    if (rec.n >= CONFIG.MAX_FAILS) {
      rec.blocked = true; sec.d[dev] = rec; writeJson_('securite.json', sec);
      log_('Sécurité', 'Appareil ' + dev.slice(0, 4).toUpperCase() + ' bloqué après ' + CONFIG.MAX_FAILS + ' codes incorrects dans l’espace RH.');
      notify_('bad', 'Un appareil (n° ' + dev.slice(0, 4).toUpperCase() + ') est bloqué après ' + CONFIG.MAX_FAILS + ' codes incorrects dans l’espace RH. À débloquer par le RH ou l’informaticien.', null, true);
      return { ok: false, blocked: true, ref: dev.slice(0, 4).toUpperCase(), error: blockedMsg };
    }
    sec.d[dev] = rec; writeJson_('securite.json', sec);
    const left = CONFIG.MAX_FAILS - rec.n;
    return { ok: false, denied: true, left: left, error: 'Code incorrect. Il reste ' + left + ' essai' + (left > 1 ? 's' : '') + ' avant le blocage de cet appareil.' };
  }
  if (rec.n) { delete sec.d[dev]; writeJson_('securite.json', sec); }
  WHO_ = (me.name || 'Gestionnaire') + (me.role !== 'rh' ? ' (' + ROLES[me.role] + ')' : '');
  const op = b.op, nowMs = now.getTime(), today = day_(now), role = me.role;

  if (op === 'ping') return { ok: true, mustChange: !!me.tmp, name: me.name, id: me.id, role: role, roleName: ROLES[role], version: CONFIG.VERSION, unread: eventsView_(me.id, 1).unread };
  if (me.tmp && op !== 'chcode') return { ok: false, mustChange: true, error: 'Choisissez d’abord votre nom et votre code personnel.' };
  if (!allowed_(role, op)) return { ok: false, forbidden: true, error: 'Votre rôle (' + ROLES[role] + ') ne permet pas cette action.' };
  if (op === 'day' || op === 'employees') { try { autoClose_(employees_(), now); } catch (x) { /* sans importance */ } }

  /* --- Journée --- */
  if (op === 'day') {
    let key = validKey_(b.date) ? b.date : today;
    if (key > today) key = today;
    const day = readDay_(key), emps = employees_(), leaves = leaves_(), kinds = {};
    emps.forEach(e => (kinds[e.id] = empKind_(e)));
    const sessions = day.sessions.map(x => Object.assign({}, x, { kd: kinds[x.e] || 'employe', open: !x.d && key === day_(new Date(x.aT || now)) && isInsideSes_(x, emps, nowMs) })).sort((a, c) => (a.a || '') < (c.a || '') ? -1 : 1);
    const seen = {}; day.sessions.forEach(x => (seen[x.e] = 1));
    const absent = emps.filter(x => x.active && !seen[x.id] && kind_(x, key, s, leaves) === 'travail' && !(key !== x.openDay && isInside_(x, nowMs)))
      .map(x => ({ id: x.id, n: x.name, r: x.role, kd: empKind_(x) }));
    const onLeave = emps.filter(x => x.active && kind_(x, key, s, leaves) === 'conge').map(x => ({ id: x.id, n: x.name, r: x.role, t: leaveOf_(x, key, leaves).type }));
    const inside = emps.filter(x => isInside_(x, nowMs)).map(x => ({ id: x.id, n: x.name, r: x.role, since: fmt_(new Date(x.last), 'HH:mm'), day: day_(new Date(x.last)) }));
    return { ok: true, date: key, today: today, sessions: sessions, absent: absent, onLeave: onLeave, holiday: holidayName_(key, s), inside: inside, settings: publicSettings_(s), serverTime: now.toISOString() };
  }

  /* --- Employés et stagiaires --- */
  if (op === 'employees') return { ok: true, list: empView_(employees_(), nowMs), settings: publicSettings_(s) };

  if (op === 'add') {
    const list = employees_(), lines = String(b.text || '').split(/\r?\n/), added = [], skipped = [], known = {};
    list.forEach(x => (known[normName_(x.name)] = 1));
    const kind = b.kind === 'stagiaire' ? 'stagiaire' : 'employe';
    let intern = null;
    if (kind === 'stagiaire') { intern = cleanIntern_(b.intern); if (intern.err) return { ok: false, error: intern.err }; }
    const svcByName = {}; s.services.forEach(v => (svcByName[normName_(v.name)] = v.id));
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim(); if (!raw) continue;
      const parts = raw.split(/\s*[;\t]\s*/), name = clean_(parts[0], 60), role = clean_(parts[1] || '', 60), svc = svcByName[normName_(parts[2] || '')] || b.svc || null;
      if (name.length < 3) { skipped.push(raw + ' (nom trop court)'); continue; }
      if (known[normName_(name)]) { skipped.push(name + ' (déjà dans la liste)'); continue; }
      if (list.length >= CONFIG.MAX_EMPLOYEES) { skipped.push(name + ' (liste pleine)'); continue; }
      const id = uid_();
      list.push({ id: id, k: newToken_(id), name: name, role: role, kind: kind, svc: svc && s.services.some(v => v.id === svc) ? svc : null, intern: intern ? Object.assign({}, intern) : null,
        pin: null, active: true, tele: true, days: null, state: 'out', openDay: null, openId: null, last: null, created: today, dev: null, verified: null, ph: false, susp: false, alert: null, places: [], fails: 0, blocked: null, leaveDays: null });
      known[normName_(name)] = 1; added.push({ name: name, role: role });
    }
    saveEmployees_(list);
    if (added.length) log_('Ajout', added.length + (kind === 'stagiaire' ? ' stagiaire(s)' : ' employé(s)') + ' ajouté(s) : ' + added.map(a => a.name).join(', ') + '.');
    return { ok: true, added: added, skipped: skipped, list: empView_(list, nowMs) };
  }

  if (op === 'update') {
    const list = employees_(), emp = list.filter(x => x.id === b.emp)[0];
    if (!emp) return { ok: false, error: 'Employé introuvable.' };
    if (b.name != null) {
      const name = clean_(b.name, 60);
      if (name.length < 3) return { ok: false, error: 'Nom trop court.' };
      if (list.some(x => x.id !== emp.id && normName_(x.name) === normName_(name))) return { ok: false, error: 'Ce nom existe déjà.' };
      emp.name = name;
    }
    if (b.role != null) emp.role = clean_(b.role, 60);
    if (b.leaveDays !== undefined && allowed_(role, 'leaveset')) emp.leaveDays = (b.leaveDays === null || b.leaveDays === '') ? null : Math.max(0, Math.min(90, Math.round(Number(b.leaveDays) || 0)));
    if (b.tele != null) emp.tele = !!b.tele;
    if (b.active != null) emp.active = !!b.active;
    if (b.svc !== undefined) emp.svc = b.svc && s.services.some(v => v.id === b.svc) ? b.svc : null;
    if (b.kind != null) emp.kind = b.kind === 'stagiaire' ? 'stagiaire' : 'employe';
    if (b.intern !== undefined) {
      if (emp.kind !== 'stagiaire' || b.intern === null) emp.intern = null;
      else { const i = cleanIntern_(b.intern); if (i.err) return { ok: false, error: i.err }; emp.intern = i; }
    }
    if (b.days !== undefined) {
      if (b.days === null) emp.days = null;
      else if (normDays_(b.days)) emp.days = normDays_(b.days);
      else return { ok: false, error: 'Jours de travail invalides.' };
    }
    saveEmployees_(list);
    log_('Modification', 'Fiche modifiée : ' + emp.name + ' (' + (emp.kind === 'stagiaire' ? 'stagiaire' : 'employé') + ', ' + (emp.active ? 'actif' : 'désactivé') + (emp.tele === false ? ', télétravail non autorisé' : '') + ').');
    return { ok: true, list: empView_(list, nowMs) };
  }

  if (op === 'remove') {                    // suppression définitive : ses anciens pointages restent dans l'historique
    const list = employees_(), emp = list.filter(x => x.id === b.emp)[0];
    if (!emp) return { ok: false, error: 'Employé introuvable (déjà supprimé ?). Actualisez la liste.' };
    const rest = list.filter(x => x.id !== emp.id);
    saveEmployees_(rest);
    saveLeaves_(leaves_().filter(l => l.e !== emp.id));
    deleteFile_(photoName_(emp.id));
    log_('Suppression', (emp.kind === 'stagiaire' ? 'Stagiaire' : 'Employé') + ' supprimé définitivement : ' + emp.name + (emp.role ? ' (' + emp.role + ')' : '') + '.');
    return { ok: true, list: empView_(rest, nowMs) };
  }

  if (op === 'unlock' || op === 'newqr' || op === 'unbind' || op === 'verify' || op === 'photoget') {
    const list = employees_(), emp = list.filter(x => x.id === b.emp)[0];
    if (!emp) return { ok: false, error: 'Employé introuvable.' };
    if (op === 'photoget') return { ok: true, photo: emp.ph ? readPhoto_(emp.id) : null };
    if (op === 'unlock') { emp.pin = null; emp.fails = 0; emp.blocked = null; log_('Carte', 'Code oublié, carte déverrouillée : ' + emp.name + '.'); }
    if (op === 'newqr') {                   // carte perdue ou partagée : l'ancien QR ne marche plus, la suspension est levée
      emp.k = newToken_(emp.id); emp.pin = null; emp.dev = null; emp.susp = false; emp.alert = null; emp.fails = 0; emp.blocked = null;
      log_('Carte', 'Nouveau QR créé (ancienne carte annulée) : ' + emp.name + '.');
    }
    if (op === 'unbind') { emp.dev = null; log_('Carte', 'Téléphone délié, la carte sera liée au prochain scan : ' + emp.name + '.'); }
    if (op === 'verify') {
      emp.verified = b.on ? { by: me.name || 'Gestionnaire', at: now.toISOString() } : null;
      log_('Vérification', (b.on ? 'Profil vérifié ✔ : ' : 'Vérification retirée : ') + emp.name + '.');
    }
    saveEmployees_(list);
    return { ok: true, list: empView_(list, nowMs) };
  }

  /* --- Corrections et pointage manuel --- */
  if (op === 'fix') {                       // correction d'un oubli : toujours marquée « corrigé »
    const key = validKey_(b.date) ? b.date : null; if (!key) return { ok: false, error: 'Date invalide.' };
    const day = readDay_(key), ses = day.sessions.filter(x => x.i === b.sid)[0];
    if (!ses) return { ok: false, error: 'Pointage introuvable.' };
    const list = employees_(), emp = list.filter(x => x.id === ses.e)[0];
    if (b.a != null && b.a !== '') {
      if (!validTime_(b.a)) return { ok: false, error: 'Heure d’arrivée invalide.' };
      ses.a = b.a;
      const firstOfEmp = day.sessions.filter(x => x.e === ses.e)[0] === ses;
      delete ses.late; delete ses.abs;
      if (firstOfEmp && emp && kind_(emp, key, s, leaves_()) === 'travail') { const sc0 = schedFor_(emp, s), l = lateMin_(ses.a, sc0); if (absLate_(ses.a, sc0)) { ses.abs = true; ses.late = l; } else if (l > 0) ses.late = l; }
    }
    if (b.d != null && b.d !== '') {
      if (!validTime_(b.d)) return { ok: false, error: 'Heure de départ invalide.' };
      ses.d = b.d; if (!ses.dS) { ses.dS = 'Corrigé'; ses.dD = null; }
      if (ses.a && minutes_(ses.d) < minutes_(ses.a)) ses.dDay = addDays_(key, 1); else delete ses.dDay;   // service de nuit
      if (emp && emp.openId === ses.i) { emp.state = 'out'; emp.openDay = null; emp.openId = null; saveEmployees_(list); }
    }
    ses.fix = { at: now.toISOString(), note: clean_(b.note || '', 120), by: WHO_ };
    writeDay_(day); unabs_(key, ses.e);
    log_('Correction', 'Pointage corrigé : ' + ses.n + ', ' + key + (b.a ? ', arrivée ' + b.a : '') + (b.d ? ', départ ' + b.d : '') + (ses.fix.note ? ' — ' + ses.fix.note : '') + '.');
    return { ok: true };
  }

  if (op === 'manual') {                    // pointage ajouté à la main (téléphone oublié, carte perdue…) : toujours marqué et journalisé
    const list = employees_(), emp = list.filter(x => x.id === b.emp)[0];
    if (!emp) return { ok: false, error: 'Employé introuvable.' };
    const nowT = fmt_(now, 'HH:mm'), key = validKey_(b.date) ? b.date : null;
    if (!key) return { ok: false, error: 'Date invalide.' };
    if (key > today) return { ok: false, error: 'La date ne peut pas être dans le futur.' };
    if (!validTime_(b.a)) return { ok: false, error: 'Heure d’arrivée invalide.' };
    const dep = (b.d != null && b.d !== '') ? b.d : null;
    if (dep && !validTime_(dep)) return { ok: false, error: 'Heure de départ invalide.' };
    const reason = clean_(b.reason, 40), note = clean_(b.note || '', 120);
    if (!reason) return { ok: false, error: 'Choisissez le motif.' };
    if (key === today && (b.a > nowT || (dep && dep > nowT && minutes_(dep) > minutes_(b.a)))) return { ok: false, error: 'L’heure ne peut pas être dans le futur.' };
    if (dep && dep === b.a) return { ok: false, error: 'Le départ doit être différent de l’arrivée.' };
    let dDay = null;
    if (dep && minutes_(dep) < minutes_(b.a)) {            // service de nuit : départ le lendemain
      dDay = addDays_(key, 1);
      if (dDay > today || (dDay === today && dep > nowT)) return { ok: false, error: 'Le départ doit être après l’arrivée.' };
    }
    const day = readDay_(key), sa = minutes_(b.a), ea = dep ? minutes_(dep) + (dDay ? 1440 : 0) : sa + 1;
    const clash = day.sessions.some(function (x) {
      if (x.e !== emp.id || !x.a) return false;
      const xs = minutes_(x.a), xe = x.d ? minutes_(x.d) + ((x.dDay && x.dDay !== key) ? 1440 : 0) : xs + 1;
      return sa < xe && xs < ea;
    });
    if (clash) return { ok: false, error: 'Cet employé a déjà un pointage à ces heures-là.' };
    if (!dep && key === today && isInside_(emp, nowMs)) return { ok: false, error: 'Cet employé est déjà marqué présent. Ajoutez son départ en corrigeant son pointage.' };
    const ses = { i: uid_(), e: emp.id, n: emp.name, r: emp.role, a: b.a, aT: now.toISOString(), aS: MANUAL, aD: null };
    const first = !day.sessions.some(x => x.e === emp.id);
    if (first && kind_(emp, key, s, leaves_()) === 'travail') { const sc0 = schedFor_(emp, s), l = lateMin_(b.a, sc0); if (absLate_(b.a, sc0)) { ses.abs = true; ses.late = l; } else if (l > 0) ses.late = l; }
    if (dep) { ses.d = dep; ses.dT = now.toISOString(); ses.dS = MANUAL; ses.dD = null; if (dDay) ses.dDay = dDay; }
    ses.fix = { at: now.toISOString(), manual: true, by: WHO_, note: reason + (note ? ' — ' + note : '') };
    day.sessions.push(ses); writeDay_(day); unabs_(key, emp.id);
    if (!dep && key === today) { emp.state = 'in'; emp.openDay = key; emp.openId = ses.i; emp.last = now.toISOString(); saveEmployees_(list); }
    log_('Pointage manuel', emp.name + ', ' + key + ', arrivée ' + b.a + (dep ? ', départ ' + dep : '') + ' — ' + ses.fix.note + '.');
    return { ok: true };
  }

  /* --- Réglages, services --- */
  if (op === 'settings') return { ok: true, settings: publicSettings_(s) };

  if (op === 'save') {
    const n = b.settings || {};
    if (![n.start, n.absentFrom, n.arrivalClose, n.dayClose].every(validTime_)) return { ok: false, error: 'Heures invalides.' };
    if (!(minutes_(n.start) < minutes_(n.absentFrom) && minutes_(n.absentFrom) <= minutes_(n.arrivalClose) && minutes_(n.arrivalClose) < minutes_(n.dayClose))) return { ok: false, error: 'Les heures doivent se suivre : début, puis « considéré absent », puis fin du pointage d’arrivée, puis clôture de la journée.' };
    const tol = Number(n.tol); if (!(tol >= 0 && tol <= 120)) return { ok: false, error: 'Tolérance invalide (0 à 120 minutes).' };
    const work = Math.round(Number(n.work)); if (!(work >= 60 && work <= 720)) return { ok: false, error: 'La durée de travail doit être entre 1 h et 12 h.' };
    if (!normDays_(n.days)) return { ok: false, error: 'Choisissez au moins un jour de travail.' };
    const lv = Math.round(Number(n.leaveDays)); if (!(lv >= 0 && lv <= 90)) return { ok: false, error: 'Congés annuels : entre 0 et 90 jours.' };
    if (!Array.isArray(n.pauses) || n.pauses.length !== 7) return { ok: false, error: 'Pauses invalides.' };
    const pauses = n.pauses.map(x => (Array.isArray(x) && x[0] && x[1]) ? [x[0], x[1]] : null);
    if (!pauses.every(x => x === null || (validTime_(x[0]) && validTime_(x[1]) && minutes_(x[1]) > minutes_(x[0])))) return { ok: false, error: 'Une pause est invalide (la fin doit être après le début).' };
    const m = n.mails || {}, mails = { rh: String(m.rh || '').trim(), dev: String(m.dev || '').trim(), info: String(m.info || '').trim() };
    if (!Object.keys(mails).every(k => !mails[k] || validMail_(mails[k]))) return { ok: false, error: 'Une adresse e-mail est invalide.' };
    s.start = n.start; s.absentFrom = n.absentFrom; s.arrivalClose = n.arrivalClose; s.dayClose = n.dayClose; s.tol = Math.round(tol); s.work = work; s.leaveDays = lv; s.pauses = pauses; s.days = normDays_(n.days);
    s.mails = mails; s.contact = mails.rh;
    saveSettings_(s); const s2 = settings_();
    log_('Réglages', 'Horaires modifiés : début ' + s.start + ', absent dès ' + s.absentFrom + ', fin du pointage ' + s.arrivalClose + ', clôture ' + s.dayClose + ', travail ' + hoursFr_(work) + ', congés annuels ' + lv + ' j ; adresses : ' + s2.mail.length + '.');
    notify_('info', 'Les horaires ont été modifiés par ' + WHO_ + ' : début ' + hmFr_(s.start) + ', absent dès ' + hmFr_(s.absentFrom) + ', fin du pointage ' + hmFr_(s.arrivalClose) + ', clôture ' + hmFr_(s.dayClose) + '.', null, true);
    return { ok: true, settings: publicSettings_(s2) };
  }

  if (op === 'svcsave') {
    const v = b.svc || {}, name = clean_(v.name, 40);
    if (name.length < 2) return { ok: false, error: 'Donnez un nom au service (2 lettres au moins).' };
    if (!validTime_(v.start)) return { ok: false, error: 'Heure invalide.' };
    const tol = Number(v.tol); if (!(tol >= 0 && tol <= 120)) return { ok: false, error: 'Tolérance invalide (0 à 120 minutes).' };
    if (!normDays_(v.days)) return { ok: false, error: 'Choisissez au moins un jour de travail.' };
    if (s.services.some(x => x.id !== v.id && normName_(x.name) === normName_(name))) return { ok: false, error: 'Ce service existe déjà.' };
    const rec = { id: v.id || uid_(), name: name, start: v.start, tol: Math.round(tol), days: normDays_(v.days), night: !!v.night };
    const at = s.services.findIndex(x => x.id === rec.id);
    if (at >= 0) s.services[at] = rec; else { if (s.services.length >= CONFIG.MAX_SERVICES) return { ok: false, error: 'Trop de services.' }; s.services.push(rec); }
    saveSettings_(s); log_('Service', (at >= 0 ? 'Service modifié : ' : 'Service créé : ') + name + ' (' + rec.start + ').');
    return { ok: true, settings: publicSettings_(s) };
  }
  if (op === 'svcdel') {
    const v = s.services.filter(x => x.id === b.id)[0];
    if (!v) return { ok: false, error: 'Service introuvable.' };
    s.services = s.services.filter(x => x.id !== v.id); saveSettings_(s);
    const list = employees_(); list.forEach(e => { if (e.svc === v.id) e.svc = null; }); saveEmployees_(list);
    log_('Service', 'Service supprimé : ' + v.name + ' (ses membres passent à l’horaire général).');
    return { ok: true, settings: publicSettings_(s), list: empView_(list, nowMs) };
  }

  /* --- Jours fériés et congés --- */
  if (op === 'holsave') {
    if (!validKey_(b.d)) return { ok: false, error: 'Date invalide.' };
    const name = clean_(b.n || '', 50) || 'Jour férié';
    s.holidays = s.holidays.filter(h => h.d !== b.d).concat([{ d: b.d, n: name }]).sort((a, c) => a.d < c.d ? -1 : 1);
    if (s.holidays.length > 300) return { ok: false, error: 'Trop de jours fériés enregistrés.' };
    saveSettings_(s); log_('Calendrier', 'Jour férié ajouté : ' + name + ', ' + b.d + '.'); evt_('info', 'Jour férié ajouté par ' + WHO_ + ' : ' + name + ', ' + dateFr_(b.d) + '.');
    return { ok: true, settings: publicSettings_(s) };
  }
  if (op === 'holdel') {
    const h = s.holidays.filter(x => x.d === b.d)[0];
    if (!h) return { ok: false, error: 'Jour férié introuvable.' };
    s.holidays = s.holidays.filter(x => x.d !== b.d); saveSettings_(s);
    log_('Calendrier', 'Jour férié retiré : ' + h.n + ', ' + h.d + '.');
    return { ok: true, settings: publicSettings_(s) };
  }
  if (op === 'leaves') {
    const emps = employees_(), names = {}; emps.forEach(e => (names[e.id] = e.name));
    const list = leaves_().filter(l => names[l.e]).map(l => Object.assign({ n: names[l.e] }, l)).sort((a, c) => a.from < c.from ? 1 : -1).slice(0, 400);
    return { ok: true, list: list, settings: publicSettings_(s) };
  }
  if (op === 'leaveadd') {
    const emp = employees_().filter(x => x.id === b.emp)[0];
    if (!emp) return { ok: false, error: 'Employé introuvable.' };
    if (!validKey_(b.from) || !validKey_(b.to)) return { ok: false, error: 'Dates invalides.' };
    if (b.from > b.to) return { ok: false, error: 'La fin du congé doit être après son début.' };
    if (daysBetween_(b.from, b.to) > 366) return { ok: false, error: 'Un congé ne peut pas dépasser un an.' };
    const type = LEAVE_TYPES.indexOf(b.type) >= 0 ? b.type : 'Autre', list = leaves_();
    if (list.some(l => l.e === emp.id && l.from <= b.to && b.from <= l.to)) return { ok: false, error: 'Cet employé a déjà un congé sur ces dates.' };
    list.push({ id: uid_(), e: emp.id, from: b.from, to: b.to, type: type, note: clean_(b.note || '', 80) });
    saveLeaves_(list); log_('Congé', 'Congé ajouté : ' + emp.name + ', ' + type + ', du ' + b.from + ' au ' + b.to + '.');
    evt_('info', 'Congé ajouté par ' + WHO_ + ' : ' + emp.name + ', ' + type + ', du ' + dateFr_(b.from) + ' au ' + dateFr_(b.to) + '.', emp.id);
    return { ok: true };
  }
  if (op === 'leavedel') {
    const list = leaves_(), l = list.filter(x => x.id === b.id)[0];
    if (!l) return { ok: false, error: 'Congé introuvable.' };
    saveLeaves_(list.filter(x => x.id !== l.id));
    const emp = employees_().filter(x => x.id === l.e)[0];
    log_('Congé', 'Congé supprimé : ' + (emp ? emp.name : '?') + ', du ' + l.from + ' au ' + l.to + '.');
    evt_('info', 'Congé supprimé par ' + WHO_ + ' : ' + (emp ? emp.name : '?') + ', du ' + dateFr_(l.from) + ' au ' + dateFr_(l.to) + '.', emp ? emp.id : null);
    return { ok: true };
  }

  /* --- Statistiques et rapports --- */
  if (op === 'month') {
    const ym = validMonth_(b.month) ? b.month : today.slice(0, 7);
    if (ym > today.slice(0, 7)) return { ok: false, error: 'Ce mois n’a pas encore commencé.' };
    return Object.assign({ ok: true }, monthData_(ym, b.kind));
  }
  if (op === 'stats') {
    if (!validKey_(b.from) || !validKey_(b.to) || b.from > b.to) return { ok: false, error: 'Période invalide.' };
    if (b.from > today) return { ok: false, error: 'Cette période n’a pas encore commencé.' };
    if (daysBetween_(b.from, b.to) + 1 > CONFIG.MAX_RANGE_DAYS) return { ok: false, error: 'Période trop longue (3 mois au maximum).' };
    return Object.assign({ ok: true }, rangeData_(b.from, b.to, { kind: b.kind, emp: b.emp }));
  }
  if (op === 'journal') return Object.assign({ ok: true }, journalView_(Math.min(Number(b.limit) || 200, 500)));

  if (op === 'sendreport') {                // envoi manuel du rapport (par défaut celui d'hier)
    if (!s.mail.length) return { ok: false, error: 'Ajoutez d’abord une adresse e-mail dans les réglages.' };
    let key = validKey_(b.date) ? b.date : day_(new Date(nowMs - 86400000));
    if (key >= today) key = day_(new Date(nowMs - 86400000));
    sendReport_(key);
    log_('Rapport', 'Rapport du ' + key + ' envoyé à ' + s.mail.length + ' adresse(s).');
    return { ok: true, to: s.mail.length, date: key };
  }
  if (op === 'sendmonth') {
    if (!s.mail.length) return { ok: false, error: 'Ajoutez d’abord une adresse e-mail dans les réglages.' };
    const ym = validMonth_(b.month) ? b.month : today.slice(0, 7);
    if (ym > today.slice(0, 7)) return { ok: false, error: 'Ce mois n’a pas encore commencé.' };
    sendMonth_(ym);
    log_('Rapport', 'Rapport mensuel ' + ym + ' envoyé à ' + s.mail.length + ' adresse(s).');
    return { ok: true, to: s.mail.length, month: ym };
  }

  if (op === 'alertset') {
    s.alerts = b.on !== false && b.on !== 'false'; saveSettings_(s);
    log_('Réglages', 'Alertes e-mail ' + (s.alerts ? 'activées' : 'désactivées') + '.');
    return { ok: true, alerts: s.alerts };
  }
  /* --- Gestionnaires et codes --- */
  if (op === 'chcode') {
    const nc = String(b.newCode || ''), name = clean_(b.name || '', 40);
    if (!/^[A-Za-z0-9]{6,20}$/.test(nc)) return { ok: false, error: 'Le code doit avoir 6 à 20 lettres ou chiffres.' };
    if (sameCode_(me.code, nc)) return { ok: false, error: 'Choisissez un code différent du code actuel.' };
    if (s.admins.some(a => a.id !== me.id && sameCode_(a.code, nc))) return { ok: false, error: 'Ce code est déjà utilisé. Choisissez-en un autre.' };
    if (me.tmp && name.length < 2) return { ok: false, error: 'Indiquez votre nom (2 lettres au moins).' };
    me.code = hashObj_(nc); if (name) me.name = name; const wasTmp = me.tmp; me.tmp = false; saveSettings_(s);
    WHO_ = me.name || 'Gestionnaire';
    log_('Sécurité', wasTmp ? 'Premier accès : ' + me.name + ' a choisi son code.' : 'Code changé par ' + me.name + '.');
    return { ok: true, name: me.name };
  }
  if (op === 'admins') return { ok: true, list: s.admins.map(a => ({ id: a.id, name: a.name || 'Gestionnaire', role: a.role, roleName: ROLES[a.role], tmp: !!a.tmp, me: a.id === me.id })) };
  if (op === 'addadmin') {
    const name = clean_(b.name || '', 40);
    if (name.length < 2) return { ok: false, error: 'Indiquez le nom du gestionnaire.' };
    if (s.admins.length >= CONFIG.MAX_ADMINS) return { ok: false, error: 'Nombre maximal de gestionnaires atteint.' };
    const code = newUniqueAdminCode_(s);
    const rl = ROLES[b.role] ? b.role : 'autre';
    s.admins.push({ id: uid_(), name: name, code: hashObj_(code), tmp: true, role: rl }); saveSettings_(s);
    log_('Sécurité', 'Gestionnaire ajouté : ' + name + ' (' + ROLES[rl] + ').');
    return { ok: true, code: code, name: name };
  }
  if (op === 'resetadmin') {
    const a = s.admins.filter(x => x.id === b.id)[0];
    if (!a) return { ok: false, error: 'Gestionnaire introuvable.' };
    if (a.id === me.id) return { ok: false, error: 'Pour changer votre propre code, utilisez « Changer mon code ».' };
    const code = newUniqueAdminCode_(s); a.code = hashObj_(code); a.tmp = true; saveSettings_(s);
    log_('Sécurité', 'Code réinitialisé pour : ' + (a.name || 'Gestionnaire') + '.');
    return { ok: true, code: code, name: a.name };
  }
  if (op === 'renameadmin') {
    const a = s.admins.filter(x => x.id === b.id)[0], name = clean_(b.name || '', 40);
    if (!a) return { ok: false, error: 'Gestionnaire introuvable.' };
    if (name.length < 2) return { ok: false, error: 'Indiquez le nom du gestionnaire.' };
    const old = a.name || 'Gestionnaire'; a.name = name; saveSettings_(s);
    { const l2 = employees_(), le = l2.filter(x => x.adm === a.id)[0]; if (le) { le.name = name; saveEmployees_(l2); } }
    log_('Sécurité', 'Gestionnaire renommé : ' + old + ' → ' + name + '.');
    return { ok: true, name: name };
  }
  if (op === 'setrole') {
    const a = s.admins.filter(x => x.id === b.id)[0];
    if (!a) return { ok: false, error: 'Gestionnaire introuvable.' };
    if (a.id === me.id) return { ok: false, error: 'Vous ne pouvez pas changer votre propre rôle.' };
    if (!ROLES[b.role]) return { ok: false, error: 'Rôle inconnu.' };
    a.role = b.role; saveSettings_(s); log_('Sécurité', 'Rôle de ' + (a.name || 'Gestionnaire') + ' : ' + ROLES[a.role] + '.');
    return { ok: true };
  }
  if (op === 'rmadmin') {
    const a = s.admins.filter(x => x.id === b.id)[0];
    if (!a) return { ok: false, error: 'Gestionnaire introuvable.' };
    if (a.id === me.id) return { ok: false, error: 'Vous ne pouvez pas vous retirer vous-même.' };
    s.admins = s.admins.filter(x => x.id !== a.id); saveSettings_(s);
    { const l2 = employees_(), le = l2.filter(x => x.adm === a.id)[0]; if (le) { le.active = false; saveEmployees_(l2); } }
    log_('Sécurité', 'Gestionnaire retiré : ' + (a.name || 'Gestionnaire') + '.');
    return { ok: true };
  }


  /* --- Mode de pointage, QR de l'entrée --- */
  if (op === 'doorget') {
    if (!s.door) { s.door = newDoor_(); saveSettings_(s); }
    return { ok: true, door: s.door, mode: s.mode };
  }
  if (op === 'modeset') {
    if (['badge', 'door', 'both'].indexOf(b.mode) < 0) return { ok: false, error: 'Mode inconnu.' };
    if (!s.door) s.door = newDoor_();
    s.mode = b.mode; saveSettings_(s);
    log_('Réglages', 'Mode de pointage : ' + ({ badge: 'carte personnelle seulement', door: 'QR de l’entrée seulement', both: 'carte personnelle et QR de l’entrée' })[s.mode] + '.');
    return { ok: true, mode: s.mode, door: s.door };
  }
  if (op === 'newdoor') {
    s.door = newDoor_(); saveSettings_(s);
    log_('Sécurité', 'Nouveau QR d’entrée créé : l’ancien QR ne fonctionne plus.'); notify_('warn', 'Un nouveau QR d’entrée a été créé par ' + WHO_ + '. L’ancien QR ne fonctionne plus : imprimez le nouveau.', null, false);
    return { ok: true, door: s.door, mode: s.mode };
  }

  /* --- Appareils : 2 téléphones validés par employé --- */
  if (op === 'devices') {
    const list = employees_().filter(x => x.active && !x.adm);
    const view = x => ({ id: x.id, name: x.name, role: x.role || '', devs: (x.devs || []).map(d => ({ k: d.k, ref: d.k.slice(0, 4).toUpperCase(), n: d.n || '', at: d.at, time: fmt_(new Date(d.at), 'dd/MM HH:mm') })),
      pend: (x.pend || []).map(d => ({ k: d.k, ref: d.k.slice(0, 4).toUpperCase(), n: d.n || '', at: d.at, time: fmt_(new Date(d.at), 'dd/MM HH:mm') })) });
    const rows = list.map(view).sort((a, c) => (c.pend.length - a.pend.length) || a.name.localeCompare(c.name, 'fr'));
    return { ok: true, rows: rows, max: CONFIG.MAX_DEVICES, noDev: rows.filter(r => !r.devs.length).length };
  }
  if (op === 'devok' || op === 'devrm' || op === 'devall') {
    const list = employees_(), todo = [];
    if (op === 'devall') list.forEach(x => { if (x.active && !x.adm && !(x.devs || []).length && (x.pend || []).length === 1) todo.push(x); });
    else { const emp = list.filter(x => x.id === b.emp)[0]; if (!emp) return { ok: false, error: 'Employé introuvable.' }; todo.push(emp); }
    let n = 0;
    todo.forEach(emp => {
      emp.devs = emp.devs || []; emp.pend = emp.pend || [];
      if (op === 'devok' || op === 'devall') {
        const k = op === 'devall' ? emp.pend[0].k : String(b.k || ''), d = emp.pend.filter(y => y.k === k)[0];
        if (!d) return;
        if (emp.devs.length >= CONFIG.MAX_DEVICES) { if (op === 'devok') { todo.err = emp.name + ' a déjà ' + CONFIG.MAX_DEVICES + ' téléphones validés. Retirez-en un d’abord.'; } return; }
        emp.pend = emp.pend.filter(y => y.k !== k); emp.devs.push({ k: d.k, n: d.n, at: now.toISOString(), by: me.name || 'Gestionnaire' }); n++;
        log_('Appareil', 'Téléphone validé (n° ' + d.k.slice(0, 4).toUpperCase() + ') pour ' + emp.name + '.');
      } else {
        const k = String(b.k || ''), from = b.list === 'pend' ? 'pend' : 'devs', before = emp[from].length;
        emp[from] = emp[from].filter(y => y.k !== k); if (emp[from].length < before) { n++; log_('Appareil', (from === 'pend' ? 'Téléphone refusé' : 'Téléphone retiré') + ' (n° ' + k.slice(0, 4).toUpperCase() + ') : ' + emp.name + '.'); }
      }
    });
    if (todo.err) return { ok: false, error: todo.err };
    saveEmployees_(list);
    return { ok: true, n: n };
  }

  /* --- Télétravail : lieux enregistrés (vue RH / informaticien) --- */
  if (op === 'teleview') {
    const rows = employees_().filter(x => x.active && !x.adm).map(x => ({ id: x.id, name: x.name, role: x.role || '', tele: x.tele !== false, places: (x.places || []).map(p => ({ id: p.id, n: p.n, lat: p.lat, lng: p.lng })) }))
      .sort((a, c) => a.name.localeCompare(c.name, 'fr'));
    return { ok: true, rows: rows, max: CONFIG.MAX_PLACES };
  }

  /* --- Mon pointage (RH, informaticien, gestionnaire : chacun pointe pour lui-même seulement) --- */
  if (op === 'selfplace' || op === 'selfrmplace') {                         // lieux de télétravail du gestionnaire (4 au plus), comme les employés
    const list = employees_(), emp = list.filter(x => x.adm === me.id)[0];
    if (!emp) return { ok: false, error: 'Complétez d’abord votre fiche (poste, photo).' };
    emp.places = emp.places || [];
    if (op === 'selfrmplace') emp.places = emp.places.filter(p => p.id !== b.pid);
    else {
      if (emp.places.length >= CONFIG.MAX_PLACES) return { ok: false, error: 'Vous avez déjà ' + CONFIG.MAX_PLACES + ' lieux. Supprimez-en un pour en ajouter un autre.' };
      if (!isNum_(b.lat) || !isNum_(b.lng) || Math.abs(b.lat) > 90 || Math.abs(b.lng) > 180) return { ok: false, error: 'Position introuvable. Autorisez la localisation puis réessayez.' };
      if (isNum_(b.acc) && b.acc > 300) return { ok: false, error: 'Position trop imprécise (' + Math.round(b.acc) + ' m). Sortez ou activez le GPS puis réessayez.' };
      const nm = clean_(b.n || '', 30); if (nm.length < 2) return { ok: false, error: 'Donnez un nom au lieu (ex. Maison).' };
      if (emp.places.some(p => distanceM_(b.lat, b.lng, p.lat, p.lng) < 60)) return { ok: false, error: 'Ce lieu est déjà enregistré.' };
      emp.places.push({ id: uid_(), n: nm, lat: Math.round(b.lat * 1e6) / 1e6, lng: Math.round(b.lng * 1e6) / 1e6 });
      log_('Télétravail', 'Lieu enregistré par ' + emp.name + ' : ' + nm + ' (' + emp.places.length + '/' + CONFIG.MAX_PLACES + ').');
    }
    saveEmployees_(list);
    return { ok: true, places: emp.places.map(p => ({ id: p.id, n: p.n })) };
  }
  if (op === 'selfget' || op === 'selfsave' || op === 'selfpunch') {
    const list = employees_();
    let emp = list.filter(x => x.adm === me.id)[0];
    if (op === 'selfsave') {
      const poste = clean_(b.role || '', 60);
      if (b.img != null && b.img !== '' && !validPhoto_(b.img)) return { ok: false, error: 'Photo non valide (JPEG, taille réduite).' };
      if (!emp) {
        if (list.length >= CONFIG.MAX_EMPLOYEES) return { ok: false, error: 'Liste pleine.' };
        const id = uid_();
        emp = { id: id, k: newToken_(id), name: me.name || 'Gestionnaire', role: poste, kind: 'employe', svc: null, intern: null, pin: null, active: true, tele: true, days: null, state: 'out', openDay: null, openId: null, last: null, created: today, dev: null, verified: null, ph: false, susp: false, alert: null, places: [], fails: 0, blocked: null, leaveDays: null, adm: me.id, devs: [], pend: [] };
        list.push(emp);
      } else { emp.role = poste; emp.name = me.name || emp.name; }
      if (b.img) { writePhoto_(emp.id, b.img); emp.ph = true; }
      saveEmployees_(list); log_('Profil', 'Fiche de pointage du gestionnaire : ' + emp.name + (poste ? ' (' + poste + ')' : '') + '.');
    }
    if (op === 'selfpunch') {
      if (!emp) return { ok: false, error: 'Complétez d’abord votre fiche (poste, photo).' };
      const pb = { id: b.id, dev: b.dev, mode: b.mode === 'tele' ? 'tele' : 'bureau', lat: b.lat, lng: b.lng, acc: b.acc, emp: emp.id, __adm: true, dn: b.dn };
      const r = punch_(pb);
      return Object.assign({}, r, { self: true });
    }
    const e2 = emp ? employees_().filter(x => x.id === emp.id)[0] : null;
    return { ok: true, has: !!e2, name: me.name || '', profile: e2 ? { role: e2.role || '', inside: isInside_(e2, nowMs), last: e2.last ? { time: fmt_(new Date(e2.last), 'HH:mm'), day: day_(new Date(e2.last)) } : null, places: (e2.places || []).map(p => ({ id: p.id, n: p.n })), tele: e2.tele !== false } : null, photo: e2 && e2.ph ? readPhoto_(e2.id) : null };
  }

  /* --- Alertes (cloche) --- */
  if (op === 'events') return Object.assign({ ok: true }, eventsView_(me.id, Math.min(Number(b.limit) || 80, 200)));
  if (op === 'seen') { eventsSeen_(me.id); return { ok: true }; }

  /* --- Blocages : employés bloqués après 5 codes faux, appareils de gestionnaires --- */
  if (op === 'blocked') {
    const emps = employees_().filter(x => x.blocked).map(x => ({ id: x.id, n: x.name, r: x.role, at: x.blocked.at, time: fmt_(new Date(x.blocked.at), 'dd/MM HH:mm') }));
    const devs = Object.keys(sec.d).filter(k => sec.d[k].blocked).map(k => ({ dev: k, ref: k.slice(0, 4).toUpperCase(), time: sec.d[k].at ? fmt_(new Date(sec.d[k].at), 'dd/MM HH:mm') : '' }));
    return { ok: true, emps: emps, devs: devs };
  }
  if (op === 'unblockemp') {
    const list = employees_(), emp = list.filter(x => x.id === b.emp)[0];
    if (!emp) return { ok: false, error: 'Employé introuvable.' };
    emp.blocked = null; emp.fails = 0; saveEmployees_(list);
    log_('Sécurité', 'Accès débloqué : ' + emp.name + '.'); evt_('info', emp.name + ' a été débloqué(e) par ' + WHO_ + '.', emp.id);
    return { ok: true };
  }
  if (op === 'unblockdev') {
    const k = String(b.tdev || ''); if (!sec.d[k]) return { ok: false, error: 'Appareil introuvable.' };
    delete sec.d[k]; writeJson_('securite.json', sec);
    log_('Sécurité', 'Appareil de gestionnaire débloqué (n° ' + k.slice(0, 4).toUpperCase() + ').'); evt_('info', 'Appareil ' + k.slice(0, 4).toUpperCase() + ' débloqué par ' + WHO_ + '.');
    return { ok: true };
  }
  if (op === 'rmplace') {
    const list = employees_(), emp = list.filter(x => x.id === b.emp)[0];
    if (!emp) return { ok: false, error: 'Employé introuvable.' };
    emp.places = (emp.places || []).filter(p => p.id !== b.pid); saveEmployees_(list); log_('Télétravail', 'Lieu retiré par ' + WHO_ + ' : ' + emp.name + '.');
    return { ok: true, list: empView_(list, nowMs) };
  }
  if (op === 'photomany') {                                              // photos pour l'impression des badges (10 à la fois)
    const out = {}; (Array.isArray(b.ids) ? b.ids : []).slice(0, 10).forEach(id => { out[id] = readPhoto_(id); });
    return { ok: true, photos: out };
  }

  /* --- Messages : discussions avec les employés, annonces --- */
  if (op === 'threads') {
    const mg = msgs_(), emps = employees_(), names = {}; emps.forEach(e => (names[e.id] = e));
    const list = Object.keys(mg.th).filter(id => names[id] && mg.th[id].m.length).map(function (id) {
      const th = mg.th[id], last = th.m[th.m.length - 1];
      return { e: id, n: names[id].name, last: last.x.slice(0, 80), from: last.f, time: fmt_(new Date(last.t), 'dd/MM HH:mm'), t: last.t, unread: th.m.some(x => x.f === 'e' && x.t > (th.ack || '')), just: th.m.some(x => x.j) };
    }).sort((a, c) => a.t < c.t ? 1 : -1);
    return { ok: true, list: list, unread: list.filter(x => x.unread).length };
  }
  if (op === 'thread') {
    const mg = msgs_(), th = mg.th[b.emp] || { m: [], ack: '' }, emp = employees_().filter(x => x.id === b.emp)[0];
    if (!emp) return { ok: false, error: 'Employé introuvable.' };
    if (mg.th[b.emp]) { th.ack = now.toISOString(); saveMsgs_(mg); }
    return { ok: true, n: emp.name, list: th.m.map(x => ({ f: x.f, by: x.by, x: x.x, j: x.j || null, time: fmt_(new Date(x.t), 'dd/MM HH:mm') })) };
  }
  if (op === 'reply') {
    const emp = employees_().filter(x => x.id === b.emp)[0], txt = clean_(b.txt || '', 600);
    if (!emp) return { ok: false, error: 'Employé introuvable.' };
    if (txt.length < 2) return { ok: false, error: 'Écrivez votre réponse.' };
    const mg = msgs_(), th = thread_(mg, emp.id);
    say_(mg, emp.id, 'g', (me.name || 'Gestionnaire') + ' (' + ROLES[role] + ')', txt); th.ack = now.toISOString(); saveMsgs_(mg);
    return { ok: true };
  }
  if (op === 'annlist') return { ok: true, list: msgs_().ann.slice().reverse().map(a => ({ i: a.i, c: a.c, x: a.x, by: a.by, role: a.role, mine: a.aid === me.id, time: fmt_(new Date(a.t), 'dd/MM/yyyy HH:mm') })) };
  if (op === 'annpost') {
    const txt = clean_(b.txt || '', 600), cat = ['Prévention', 'Justificatif', 'Information'].indexOf(b.cat) >= 0 ? b.cat : 'Information';
    if (txt.length < 3) return { ok: false, error: 'Écrivez votre note (3 lettres au moins).' };
    const mg = msgs_(); mg.ann.push({ i: uid_(), t: now.toISOString(), aid: me.id, by: me.name || 'Gestionnaire', role: ROLES[role], c: cat, x: txt });
    if (mg.ann.length > 60) mg.ann = mg.ann.slice(-60);
    saveMsgs_(mg); log_('Note', cat + ' publiée : ' + txt.slice(0, 80)); evt_('info', cat + ' publiée par ' + (me.name || 'Gestionnaire') + ' (' + ROLES[role] + ').');
    return { ok: true };
  }
  if (op === 'anndel') {
    const mg = msgs_(), a = mg.ann.filter(x => x.i === b.id)[0];
    if (!a) return { ok: false, error: 'Note introuvable.' };
    if (a.aid !== me.id && role !== 'rh') return { ok: false, error: 'Seul son auteur ou le RH peut la supprimer.' };
    mg.ann = mg.ann.filter(x => x.i !== a.i); saveMsgs_(mg); return { ok: true };
  }

  /* --- Congés : soldes, absences, justification --- */
  if (op === 'balances') {
    catchUp_();
    const led = ledger_(), leaves = leaves_(), year = Number(today.slice(0, 4)), emps = employees_().filter(x => x.active && empKind_(x) === 'employe');
    const list = emps.map(e => Object.assign({ e: e.id, n: e.name, r: e.role }, balance_(e, year, s, leaves, led))).sort((a, c) => a.n.localeCompare(c.n, 'fr'));
    const names = {}; employees_().forEach(e => (names[e.id] = e.name));
    const abs = led.list.filter(a => names[a.e] && a.d.slice(0, 4) === String(year)).slice(-120).reverse().map(a => ({ d: a.d, e: a.e, n: names[a.e], t: a.t, j: a.j || null }));
    return { ok: true, year: year, list: list, abs: abs, leaveDays: s.leaveDays };
  }
  if (op === 'justify') {
    const led = ledger_(), a = led.list.filter(x => x.d === b.d && x.e === b.emp)[0];
    if (!a) return { ok: false, error: 'Absence introuvable.' };
    a.j = b.on === false ? null : { by: me.name || 'RH', note: clean_(b.note || '', 80) }; writeJson_('absences.json', led);
    log_('Absence', (a.j ? 'Absence justifiée (non déduite des congés) : ' : 'Justification retirée : ') + a.n + ', ' + a.d + '.');
    return { ok: true };
  }
  if (op === 'leaveset') {
    const d = Math.round(Number(b.days)); if (!(d >= 0 && d <= 90)) return { ok: false, error: 'Entre 0 et 90 jours.' };
    const list = employees_(), emp = list.filter(x => x.id === b.emp)[0]; if (!emp) return { ok: false, error: 'Employé introuvable.' };
    emp.leaveDays = d; saveEmployees_(list); log_('Congé', 'Congés annuels de ' + emp.name + ' : ' + d + ' jours.');
    return { ok: true };
  }
  return { ok: false, error: 'Opération inconnue. Le script Google n’est peut-être pas à jour (Déployer → Gérer les déploiements → Nouvelle version).' };
}
function isInsideSes_(ses, emps, nowMs) { const e = emps.filter(x => x.id === ses.e)[0]; return !!e && e.openId === ses.i && isInside_(e, nowMs); }
function empView_(list, nowMs) {
  return list.map(x => ({
    id: x.id, k: x.k, name: x.name, role: x.role, kind: empKind_(x), svc: x.svc || null, active: x.active, tele: x.tele !== false, days: x.days, locked: !!x.pin, inside: isInside_(x, nowMs),
    ph: !!x.ph, verified: x.verified ? { by: x.verified.by, at: x.verified.at } : null, susp: !!x.susp, blocked: !!x.blocked, places: (x.places || []).map(p => ({ id: p.id, n: p.n })), leaveDays: typeof x.leaveDays === 'number' ? x.leaveDays : null, alert: x.alert || null, bound: !!x.dev, dv: (x.devs || []).length, pv: (x.pend || []).length, adm: !!x.adm, intern: x.intern || null, created: x.created || ''
  })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/* ---------- E-mails : alerte immédiate (cas importants) + points de 10h et 19h ---------- */
//  Le quota gratuit de Gmail est d'environ 100 e-mails par jour : on garde une réserve et les alertes immédiates sont plafonnées.
function mailBudget_(n) {
  const props = PropertiesService.getScriptProperties(), key = day_(new Date()), raw = String(props.getProperty('MQ') || '');
  const cur = raw.indexOf(key + ':') === 0 ? Number(raw.split(':')[1]) || 0 : 0;
  if (cur + 1 > n) return false;
  props.setProperty('MQ', key + ':' + (cur + 1)); return true;
}
function sendRecap() {                       // lancé à 10h et à 19h par un déclencheur
  const s = settings_(); if (!s.mail.length || !s.alerts) return;
  const now = new Date(), key = day_(now), hour = Number(fmt_(now, 'HH:mm').slice(0, 2));
  const r = reportData_(key), s2 = r.s;
  if (!r.rows.length && !r.absent.length) return;
  if (!mailBudget_(CONFIG.MAIL_MAX_DAY)) return;
  const label = hour < 13 ? 'Point de ' + hour + 'h (pointage d’arrivée fermé)' : 'Point de fin de journée';
  const html = reportHtml_(key, label);
  const subject = label + ' — ' + r.n + ' présent(s)' + (r.late ? ', ' + r.late + ' retard(s)' : '') + (r.flagged ? ', ' + r.flagged + ' hors zone' : '') + (hour < 13 && r.absent.length ? ', ' + r.absent.length + ' pas encore pointé(s)' : '');
  try { MailApp.sendEmail({ to: s.mail.join(','), name: 'P.Scann by Soned', subject: subject, htmlBody: html }); } catch (e) { /* quota : on réessaiera au prochain point */ }
}

/* ---------- Rapport du matin (la veille) ---------- */
function reportData_(key) {
  const s = settings_(), emps = employees_(), leaves = leaves_(), day = readDay_(key), nowMs = Date.now(), today = day_(new Date());
  const sessions = day.sessions.slice().sort((a, b) => (a.a || '') < (b.a || '') ? -1 : 1);
  const people = {}; sessions.forEach(x => (people[x.e] = 1));
  const absent = emps.filter(x => x.active && !people[x.id] && kind_(x, key, s, leaves) === 'travail' && !(isInside_(x, nowMs) && x.openDay !== key));
  const onLeave = emps.filter(x => x.active && kind_(x, key, s, leaves) === 'conge');
  const rows = sessions.map(function (x) {
    const e = emps.filter(y => y.id === x.e)[0];
    const ongoing = !x.d && e && e.openId === x.i && isInside_(e, nowMs);
    return { x: x, state: x.d ? 'ok' : (ongoing ? 'ongoing' : 'forgot') };
  });
  return {
    s: s, rows: rows, absent: absent, onLeave: onLeave, holiday: holidayName_(key, s),
    n: Object.keys(people).length,
    late: sessions.filter(x => x.late && !x.abs).length, absLate: sessions.filter(x => x.abs).length, auto: sessions.filter(x => x.auto).length,
    flagged: sessions.filter(x => (x.a && badSt_(x.aS)) || (x.d && badSt_(x.dS))).length,
    tele: sessions.filter(x => x.aS === TELE).length,
    forgot: rows.filter(r => r.state === 'forgot').length,
    isPast: key < today
  };
}
function reportHtml_(key, title) {
  const r = reportData_(key);
  const th = 'style="text-align:left;padding:8px;background:#0c5f20;color:#fff"', td = 'style="padding:8px;border-bottom:1px solid #ddd;vertical-align:top"';
  const rows = r.rows.map(function (o) {
    const x = o.x, bad = (x.a && badSt_(x.aS)) || (x.d && badSt_(x.dS));
    const dep = x.d ? hmFr_(x.d) + (x.auto ? ' <small style="color:#8a4a00">(départ automatique)</small>' : '') + (x.dDay && x.dDay !== key ? ' <small>(' + esc_(dateFr_(x.dDay)) + ')</small>' : '') : (o.state === 'ongoing' ? '<span style="color:#8a4a00">en cours</span>' : '<b style="color:#c0392b">non pointé</b>');
    const pos = [];
    if (x.a && badSt_(x.aS)) pos.push('Arrivée : ' + esc_(x.aS) + (x.aD != null ? ' (' + x.aD + ' m)' : ''));
    if (x.d && badSt_(x.dS)) pos.push('Départ : ' + esc_(x.dS) + (x.dD != null ? ' (' + x.dD + ' m)' : ''));
    if (x.pl) pos.push('Lieu : ' + esc_(x.pl));
    if (x.fix) pos.push('<i>' + (x.fix.manual ? 'Saisi par Soned' : 'Corrigé par Soned') + '</i>');
    return '<tr style="' + (bad ? 'background:#fdecea;' : '') + '"><td ' + td + '><b>' + esc_(x.n) + '</b><br><small>' + esc_(x.r || '') + '</small></td><td ' + td + '>' + hmFr_(x.a) +
      (x.abs ? '<br><b style="color:#c0392b">considéré absent (arrivée tardive)</b>' : (x.late ? '<br><b style="color:#c0392b">retard ' + x.late + ' min</b>' : '')) + '</td><td ' + td + '>' + dep + '</td><td ' + td + '>' + (pos.join('<br>') || (x.aS === TELE ? 'Télétravail' : 'Sur place')) + '</td></tr>';
  }).join('');
  return '<div style="font-family:Arial,sans-serif;max-width:780px"><h2 style="color:#0c5f20;margin-bottom:2px">Soned Afrique — ' + esc_(title || 'liste de pointage') + '</h2>' +
    '<p style="margin-top:0;color:#555">' + esc_(dateFr_(key)) + (r.holiday ? ' · <b>' + esc_(r.holiday) + ' (jour férié)</b>' : '') + '</p>' +
    '<p><b>' + r.n + '</b> personne(s) ayant pointé' + (r.tele ? ' (dont <b>' + r.tele + '</b> en télétravail)' : '') + (r.late ? ' · <b style="color:#c0392b">' + r.late + ' retard(s)</b>' : '') + (r.absLate ? ' · <b style="color:#c0392b">' + r.absLate + ' arrivée(s) tardive(s) (absent)</b>' : '') + (r.auto ? ' · ' + r.auto + ' départ(s) automatique(s)' : '') +
    (r.flagged ? ' · <b style="color:#c0392b">' + r.flagged + ' hors zone ou non vérifié(s)</b>' : '') +
    (r.forgot ? ' · <b style="color:#c0392b">' + r.forgot + ' départ(s) non pointé(s)</b>' : '') + '</p>' +
    (r.rows.length ? '<table style="border-collapse:collapse;width:100%;font-size:14px"><tr><th ' + th + '>Nom</th><th ' + th + '>Arrivée</th><th ' + th + '>Départ</th><th ' + th + '>Position</th></tr>' + rows + '</table>' : '<p>Aucun pointage enregistré ce jour-là.</p>') +
    (r.absent.length ? '<p style="margin-top:16px"><b>' + (r.isPast ? 'Absents (jour de travail sans pointage)' : 'Pas encore pointés') + ' :</b> ' + r.absent.map(m => esc_(m.name)).join(', ') + '</p>' : '') +
    (r.onLeave.length ? '<p><b>En congé :</b> ' + r.onLeave.map(m => esc_(m.name)).join(', ') + '</p>' : '') +
    '<p style="font-size:12px;color:#777;margin-top:16px">Retard : arrivée après l’heure de début du service (' + hmFr_(r.s.start) + (r.s.tol ? ', tolérance ' + r.s.tol + ' min' : '') + '). Arrivée à partir de ' + hmFr_(r.s.absentFrom) + ' : considéré absent. Hors zone : plus de ' + CONFIG.SITE.radius + ' m du site (présentiel). Télétravail : lieu non enregistré = signalé.</p></div>';
}
function sendReport_(key) {
  const s = settings_(); if (!s.mail.length) return;
  const html = reportHtml_(key), n = reportData_(key).n;
  const opt = { to: s.mail.join(','), name: 'P.Scann by Soned', subject: 'Pointage du ' + dateFr_(key) + ' — ' + n + ' présent(s)', htmlBody: html };
  try { opt.attachments = [Utilities.newBlob(html, 'text/html', 'pointage.html').getAs('application/pdf').setName('pointage-' + key + '.pdf')]; } catch (e) { /* sans PDF si la conversion échoue */ }
  MailApp.sendEmail(opt);
}
function sendDailyReport() {                 // lancé chaque matin par le déclencheur
  try { autoClose_(employees_(), new Date()); catchUp_(); } catch (e) { /* sans importance */ }
  const yesterday = day_(new Date(Date.now() - 86400000));
  if (reportData_(yesterday).rows.length) sendReport_(yesterday);   // aucun mail les jours sans pointage (ni sans adresse)
}

/* ---------- Statistiques : une ligne par personne sur une période ---------- */
const validMonth_ = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const monthFr_ = ym => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
const hoursFr_ = min => Math.floor(min / 60) + 'h' + ('0' + (min % 60)).slice(-2);
const pct_ = (a, b) => b > 0 ? Math.round(100 * a / b) : null;
//  Absence = jour de travail attendu (ni férié, ni congé, ni repos), avant aujourd'hui, sans aucun pointage.
function rangeData_(from, to, opt) {
  opt = opt || {};
  const s = settings_(), emps = employees_(), leaves = leaves_(), today = day_(new Date());
  if (to > today) to = today;
  const keys = []; for (let k = from; k <= to && keys.length <= CONFIG.MAX_RANGE_DAYS; k = addDays_(k, 1)) keys.push(k);
  const kindWanted = opt.kind === 'stagiaire' || opt.kind === 'employe' ? opt.kind : null;
  const want = e => (!opt.emp || e.id === opt.emp) && (!kindWanted || empKind_(e) === kindWanted);
  const byId = {}; emps.forEach(e => (byId[e.id] = e));
  const rows = {};
  const row = (id, n, r, kd) => rows[id] || (rows[id] = { id: id, n: n, r: r || '', kd: kd || 'employe', days: 0, due: 0, absent: 0, late: 0, lateMin: 0, min: 0, forgot: 0, flagged: 0, tele: 0, leave: 0, holiday: 0, daily: opt.emp ? [] : undefined, _d: {}, _t: {} });
  const nowMs = Date.now();
  keys.forEach(function (key) {
    const day = readDay_(key), seen = {};
    day.sessions.forEach(function (x) {
      const e = byId[x.e];
      if (e ? !want(e) : (opt.emp || kindWanted === 'stagiaire')) return;
      seen[x.e] = 1;
      const r = row(x.e, e ? e.name : x.n, e ? e.role : x.r, e ? empKind_(e) : 'employe');
      if (!r._d[key]) { r._d[key] = 1; r.days++; }
      if (x.late && !x.abs) { r.late++; r.lateMin += x.late; }
      if (x.a && x.d) { let m; if (x.dDay && x.dDay !== key) { m = minutes_(x.d) - minutes_(x.a) + 1440; } else m = netMin_(x.a, x.d, e ? schedFor_(e, s) : s, isoDow_(key)); if (m > 0 && m <= 1440) r.min += m; }
      else if (!x.d && key < today) { if (!(e && e.openId === x.i && isInside_(e, nowMs))) r.forgot++; }
      if ((x.a && badSt_(x.aS)) || (x.d && badSt_(x.dS))) r.flagged++;
      if (x.aS === TELE && !r._t[key]) { r._t[key] = 1; r.tele++; }
    });
    emps.forEach(function (e) {
      if (!want(e) || !e.active) return;
      const kd = kind_(e, key, s, leaves), r = row(e.id, e.name, e.role, empKind_(e));
      if (kd === 'conge') r.leave++;
      else if (kd === 'ferie') r.holiday++;
      else if (kd === 'travail' && key < today) { r.due++; const f0 = day.sessions.filter(x => x.e === e.id)[0]; if (!seen[e.id] || (f0 && f0.abs)) r.absent++; }
      if (opt.emp) {
        const ss = day.sessions.filter(x => x.e === e.id), last = ss.length ? ss[ss.length - 1] : null;
        r.daily.push({ d: key, kd: kd, a: ss.length ? ss[0].a : null, dp: last ? last.d || null : null, dDay: last && last.dDay || null, late: ss.length && !ss[0].abs ? (ss[0].late || 0) : 0, ab: !!(ss.length && ss[0].abs), auto: ss.some(x => x.auto), t: ss.some(x => x.aS === TELE), manual: ss.some(x => x.fix && x.fix.manual) });
      }
    });
  });
  const list = Object.keys(rows).map(k => { const r = rows[k]; delete r._d; delete r._t; r.presence = pct_(r.due - r.absent, r.due); r.punct = pct_(r.days - r.late, r.days); return r; })
    .sort((a, b) => a.n.localeCompare(b.n, 'fr'));
  const t = list.reduce((a, r) => ({ days: a.days + r.days, due: a.due + r.due, absent: a.absent + r.absent, late: a.late + r.late, min: a.min + r.min, forgot: a.forgot + r.forgot, flagged: a.flagged + r.flagged, tele: a.tele + r.tele, leave: a.leave + r.leave }),
    { days: 0, due: 0, absent: 0, late: 0, min: 0, forgot: 0, flagged: 0, tele: 0, leave: 0 });
  t.presence = pct_(t.due - t.absent, t.due); t.punct = pct_(t.days - t.late, t.days);
  return { from: from, to: to, rows: list, totals: t, daysCounted: keys.length, partial: to === today };
}
function monthData_(ym, kind) {
  const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
  const d = rangeData_(ym + '-01', last, { kind: kind });
  d.month = ym; d.label = monthFr_(ym);
  return d;
}
function monthHtml_(ym) {
  const m = monthData_(ym);
  const th = 'style="text-align:left;padding:7px;background:#0c5f20;color:#fff;font-size:13px"', td = 'style="padding:7px;border-bottom:1px solid #ddd;font-size:13px"';
  const rows = m.rows.map(r => '<tr><td ' + td + '><b>' + esc_(r.n) + '</b><br><small>' + esc_(r.kd === 'stagiaire' ? 'Stagiaire' : r.r) + '</small></td><td ' + td + '>' + r.days + '</td><td ' + td + '>' + r.absent + '</td><td ' + td + '>' + r.late + (r.late ? ' (' + r.lateMin + ' min)' : '') + '</td><td ' + td + '>' + r.leave + '</td><td ' + td + '>' + hoursFr_(r.min) + '</td><td ' + td + '>' + r.forgot + '</td><td ' + td + '>' + (r.presence == null ? '—' : r.presence + ' %') + '</td><td ' + td + '>' + r.tele + '</td></tr>').join('');
  return '<div style="font-family:Arial,sans-serif;max-width:820px"><h2 style="color:#0c5f20;margin-bottom:2px">Soned Afrique — rapport mensuel</h2><p style="margin-top:0;color:#555">' + esc_(m.label) + (m.partial ? ' (mois en cours)' : '') + '</p>' +
    '<p><b>' + m.rows.length + '</b> personne(s) · <b>' + m.totals.days + '</b> jour(s) de présence · <b>' + m.totals.late + '</b> retard(s) · <b>' + m.totals.absent + '</b> absence(s) · <b>' + m.totals.leave + '</b> jour(s) de congé · <b>' + hoursFr_(m.totals.min) + '</b> travaillées' + (m.totals.tele ? ' · <b>' + m.totals.tele + '</b> jour(s) en télétravail' : '') + '</p>' +
    (m.rows.length ? '<table style="border-collapse:collapse;width:100%"><tr><th ' + th + '>Nom</th><th ' + th + '>Présent</th><th ' + th + '>Absences</th><th ' + th + '>Retards</th><th ' + th + '>Congés</th><th ' + th + '>Heures</th><th ' + th + '>Sans départ</th><th ' + th + '>Présence</th><th ' + th + '>Télétravail</th></tr>' + rows + '</table>' : '<p>Aucun pointage ce mois-ci.</p>') +
    '<p style="font-size:12px;color:#777;margin-top:14px">Absence : jour de travail sans pointage, hors jours fériés et congés. Présence : part des jours attendus où la personne a pointé. Les départs non pointés ne comptent pas dans les heures.</p></div>';
}
function sendMonth_(ym) {
  const s = settings_(); if (!s.mail.length) return;
  const html = monthHtml_(ym);
  const opt = { to: s.mail.join(','), name: 'P.Scann by Soned', subject: 'Rapport mensuel de pointage — ' + monthFr_(ym), htmlBody: html };
  try { opt.attachments = [Utilities.newBlob(html, 'text/html', 'mensuel.html').getAs('application/pdf').setName('pointage-' + ym + '.pdf')]; } catch (e) { /* sans PDF si la conversion échoue */ }
  MailApp.sendEmail(opt);
}

/* ---------- Journal des modifications : on ajoute seulement, jamais de modification ni de suppression ---------- */
//  Chaque ligne est liée à la précédente par une empreinte (SHA-256) : si quelqu'un modifie ou efface une ligne
//  directement dans Drive, la chaîne est rompue et l'espace Soned affiche « Intégrité compromise ».
function jhash_(prev, e) { return hash_(prev, e.t + '|' + e.w + '|' + e.a + '|' + e.x); }
function log_(action, text) {
  try {
    const j = readJson_('journal.json', { entries: [] }), prev = j.entries.length ? j.entries[j.entries.length - 1].h : 'debut';
    const e = { t: new Date().toISOString(), w: clean_(WHO_, 40), a: clean_(action, 30), x: clean_(text, 300) };
    e.h = jhash_(prev, e);
    j.entries.push(e); writeJson_('journal.json', j);
  } catch (err) { /* le journal ne doit jamais bloquer une action */ }
}
function journalView_(limit) {
  const j = readJson_('journal.json', { entries: [] }), all = j.entries || [];
  let prev = 'debut', broken = -1;
  for (let i = 0; i < all.length; i++) { if (all[i].h !== jhash_(prev, all[i])) { broken = i; break; } prev = all[i].h; }
  const rows = all.slice(-limit).reverse().map(e => ({ t: e.t, w: e.w, a: e.a, x: e.x, time: fmt_(new Date(e.t), 'dd/MM/yyyy HH:mm') }));
  return { total: all.length, intact: broken < 0, brokenAt: broken < 0 ? null : broken + 1, entries: rows };
}

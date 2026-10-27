/* Conçu et développé par Mamadou Fall — Espace Soned Afrique © 2026 Mamadou Fall
   Espace RH : réservé aux gestionnaires (chacun a son nom, son rôle et son code). */
'use strict';

const ADM_KEY = 'pscann6_adm';
const ROLE_NAMES = { rh: 'RH', info: 'Informaticien', autre: 'Gestionnaire' };
const R = () => (ME_ADM && ME_ADM.role) || 'rh';
const isRH = () => R() === 'rh';
const canPeople = () => R() !== 'autre';
const OLD_MSG = 'Le script Google doit être mis à jour (Apps Script → Déployer → Gérer les déploiements → Modifier → Nouvelle version).';
const NET_MSG = 'Pas de connexion. Réessayez.';
const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const ATABS = [['today', 'Aujourd’hui'], ['me', 'Mon pointage'], ['msg', 'Messages'], ['people', 'Personnes'], ['dev', 'Appareils'], ['tele', 'Télétravail'], ['door', 'QR d’entrée'], ['svc', 'Services'], ['cal', 'Congés'], ['stats', 'Statistiques'], ['month', 'Mensuel'], ['journal', 'Journal'], ['set', 'Réglages']];
const TAB_ROLES = { svc: ['rh'], dev: ['rh', 'info'], tele: ['rh', 'info'], door: ['rh', 'info'] };
const tabsFor = () => ATABS.filter(([k]) => !TAB_ROLES[k] || TAB_ROLES[k].includes(R()));
let admCode = store.get(ADM_KEY, sessionStorage), atab = 'today', ME_ADM = null;
const A = { date: null, emps: null, set: null, from: null, to: null, kind: '', month: null, q: '' };

async function adm(op, extra = {}) {
  let r;
  try { r = await apiPost({ action: 'adm', code: admCode, dev: deviceId(), op, ...extra }); }
  catch (e) { const x = new Error(NET_MSG); x.net = true; throw x; }
  if (r.blocked || r.denied) { adminLockOut(r.error || 'Le code a changé ou n’est plus valide.'); const x = new Error('denied'); x.denied = true; throw x; }
  if (r.mustChange) { forceChange(); const x = new Error('denied'); x.denied = true; x.must = true; throw x; }
  if (!r.ok) { const e = new Error(/inconnue/i.test(r.error || '') ? OLD_MSG : (r.error || 'Opération refusée.')); throw e; }
  return r;
}
const errMsg = e => (e && !e.denied ? e.message : '');
function aMsg(t, bad) { const m = $('#aMsg'); m.hidden = !t; m.className = 'msg' + (bad ? ' err2' : ''); m.innerHTML = t ? `<span>${esc(t)}</span>` : ''; }
function adminLockOut(msg) {
  admCode = null; ME_ADM = null; store.del(ADM_KEY, sessionStorage); closeModal(); stopBell();
  $('#adminApp').hidden = true; $('#adminLock').hidden = false; $('#aErr').textContent = msg || ''; $('#aCode').value = '';
}
async function adminShow() {
  if (!admCode) { $('#adminLock').hidden = false; $('#adminApp').hidden = true; setTimeout(() => $('#aCode').focus(), 50); return; }
  try { const r = await adm('ping'); enterApp(r); }
  catch (e) { if (!e.denied) { $('#adminLock').hidden = false; $('#adminApp').hidden = true; $('#aErr').textContent = errMsg(e); } }
}
function enterApp(p) {
  ME_ADM = p; $('#adminLock').hidden = true; $('#adminApp').hidden = false; if (!tabsFor().some(([k]) => k === atab)) atab = 'today';
  $('#aName').textContent = p.name || 'Gestionnaire'; $('#aRole').textContent = p.roleName || ROLE_NAMES[p.role] || 'RH'; $('#aAvatar').innerHTML = avatar(p.name || 'Gestionnaire');
  startBell(p.unread || 0);
  $('#atabs').innerHTML = tabsFor().map(([k, l]) => `<button type="button" data-a="${k}" class="${k === atab ? 'on' : ''}">${l}</button>`).join('');
  aMsg(p.version !== CONFIG.version ? OLD_MSG : '', true);
  goTab(atab);
}
function forceChange() {
  openModal(`<h2>Créez votre compte</h2><p class="muted">Le code provisoire ne sert qu’une fois. Indiquez votre nom et choisissez votre propre mot de passe : il n’appartient qu’à vous. Votre nom apparaîtra dans le journal à côté de vos actions.</p>
    <label>Votre nom<input id="fcName" maxlength="40" autocomplete="off" placeholder="Ex : Awa Diop"></label>
    <label>Votre mot de passe (6 à 20 lettres ou chiffres)<input id="fcNew" type="password" autocomplete="off"></label>
    <label>Confirmez le mot de passe<input id="fcNew2" type="password" autocomplete="off"></label>
    <p id="fcErr" class="err" role="alert"></p><div class="modal-actions"><button type="button" class="btn" id="fcSave">Enregistrer</button></div>`, true);
  $('#fcSave').onclick = async () => {
    const name = $('#fcName').value.trim(), n = $('#fcNew').value.trim(), n2 = $('#fcNew2').value.trim(), err = $('#fcErr');
    if (name.length < 2) return void (err.textContent = 'Indiquez votre nom.');
    if (!/^[A-Za-z0-9]{6,20}$/.test(n)) return void (err.textContent = 'Le mot de passe doit avoir 6 à 20 lettres ou chiffres.');
    if (n !== n2) return void (err.textContent = 'Les deux codes ne sont pas identiques.');
    $('#fcSave').disabled = true;
    try { const r = await adm('chcode', { newCode: n, name }); admCode = n; store.set(ADM_KEY, n, sessionStorage); closeModal(); toast('Bienvenue, ' + (r.name || name) + '.'); adminShow(); }
    catch (e) { err.textContent = errMsg(e); $('#fcSave').disabled = false; }
  };
}

/* ---------- navigation ---------- */
function goTab(t) {
  atab = t; $$('#atabs button').forEach(b => b.classList.toggle('on', b.dataset.a === t)); window.scrollTo(0, 0);
  const body = $('#aBody'); body.innerHTML = '<div class="card center muted">Chargement…</div>';
  const f = { today: tToday, me: tMe, dev: tDevices, tele: tTele, door: tDoor, msg: tMsg, alerts: tAlerts, people: tPeople, svc: tSvc, cal: tCal, stats: tStats, month: tMonth, journal: tJournal, set: tSet }[t];
  f().catch(e => { if (!e.denied) body.innerHTML = `<div class="card"><p class="err">${esc(errMsg(e))}</p><button class="btn line sm" type="button" data-retry>Réessayer</button></div>`; });
}
function bindAdmin() {
  $('#aForm').onsubmit = async ev => {
    ev.preventDefault(); const c = $('#aCode').value.trim(); if (!c) return;
    admCode = c; $('#aErr').textContent = '';
    try { const r = await adm('ping'); store.set(ADM_KEY, c, sessionStorage); if (r.mustChange) { forceChange(); return; } enterApp(r); }
    catch (e) { if (!e.denied) { admCode = null; $('#aErr').textContent = errMsg(e); } }
  };
  $('#aOut').onclick = () => adminLockOut('');
  $('#aBell').onclick = () => goTab('alerts');
  $('#atabs').addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b) goTab(b.dataset.a); });
  $('#aBody').addEventListener('click', e => { if (e.target.closest('[data-retry]')) goTab(atab); });
}

/* ---------- cloche : alertes pour le RH ---------- */
let bellTimer = null, lastUnread = 0;
function setBell(n) { const b = $('#aBellN'); if (!b) return; b.hidden = !n; b.textContent = n > 99 ? '99+' : n; $('#aBell').classList.toggle('on', n > 0); }
function startBell(n) { stopBell(); lastUnread = n; setBell(n); bellTimer = setInterval(pollBell, 60000); }
function stopBell() { if (bellTimer) clearInterval(bellTimer); bellTimer = null; setBell(0); }
async function pollBell() {
  if (!admCode) return;
  try {
    const r = await adm('ping'); if (atab === 'alerts') return;
    if (r.unread > lastUnread) {
      const ev = await adm('events', { limit: 1 }).catch(() => null), txt = ev && ev.list[0] ? ev.list[0].x : (r.unread - lastUnread) + ' nouvelle(s) alerte(s)';
      if (!document.hidden) toast(txt);
      if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('Espace Soned : alerte', { body: txt, icon: 'icons/icon-192.png', tag: 'soned-alert' }); } catch {} }
    }
    lastUnread = r.unread; setBell(r.unread);
  } catch {}
}

/* ---------- petits morceaux communs ---------- */
const svcName = id => { const v = A.set && A.set.services.find(x => x.id === id); return v ? v.name : ''; };
const tag = (t, c = '') => `<span class="tag ${c}">${esc(t)}</span>`;
const optList = (items, sel) => items.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
const dayChips = (sel, name) => `<div class="chips">${DOW.map((d, i) => `<label><input type="checkbox" name="${name}" value="${i + 1}"${sel.includes(i + 1) ? ' checked' : ''}>${d}</label>`).join('')}</div>`;
const pickDays = name => $$(`input[name="${name}"]:checked`).map(i => +i.value);
async function getEmps(force) { if (!A.emps || force) { const r = await adm('employees'); A.emps = r.list; A.set = r.settings; } return A.emps; }
async function getSet(force) { if (!A.set || force) A.set = (await adm('settings')).settings; return A.set; }
function download(name, text, type = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: type + ';charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const pct = v => (v == null ? '—' : v + ' %');
function errIn(id, e) { const x = $(id); if (x) x.textContent = errMsg(e); }

/* ---------- AUJOURD'HUI ---------- */
let aDay = null;
async function tToday() {
  const d = await adm('day', { date: A.date || '' }); aDay = d; A.date = d.date; A.set = d.settings;
  const isToday = d.date === d.today, ss = d.sessions, people = new Set(ss.map(x => x.e)).size, late = ss.filter(x => x.late && !x.abs).length, absLate = ss.filter(x => x.abs).length;
  const flagged = ss.filter(x => badSes(x)).length, tele = ss.filter(x => x.aS === 'Télétravail').length;
  $('#aBody').innerHTML = `
    <div class="datebar"><button class="btn line sm" id="adPrev" type="button">‹</button><h2>${isToday ? 'Aujourd’hui · ' : ''}${esc(shortDate(d.date))}</h2><button class="btn line sm" id="adNext" type="button"${isToday ? ' disabled' : ''}>›</button></div>
    ${d.holiday ? `<div class="msg" style="background:var(--g100);color:var(--g800)"><span>Jour férié : ${esc(d.holiday)}. Personne n’est compté absent.</span></div>` : ''}
    <div class="dash">
      <div class="kpi"><b>${isToday ? d.inside.length : people}</b><span>${isToday ? 'Présents maintenant' : 'Personnes présentes'}</span></div>
      <div class="kpi amber"><b>${late}</b><span>En retard</span></div>
      <div class="kpi red"><b>${d.absent.length + absLate}</b><span>${isToday ? 'Absents ou pas encore pointés' : 'Absents'}</span></div>
      <div class="kpi blue"><b>${d.onLeave.length}</b><span>En congé</span></div>
    </div>
    <div class="manualrow">${isRH() ? `<button class="btn sm" id="adManual" type="button">${IC.plus} Pointage manuel</button>` : ''}${flagged ? tag(flagged + ' hors zone ou non vérifié', 'red') : ''}${tele ? tag(tele + ' en télétravail', 'blue2') : ''}
      ${canPeople() ? `<button class="btn line sm" id="adRep" type="button" style="margin-left:auto">${IC.mail} Rapport d’hier</button>` : ''}</div>
    <p class="sub">Pointages (${ss.length})</p>
    <div class="rows">${ss.length ? ss.map(sessRow).join('') : '<div class="card center muted">Aucun pointage ce jour-là.</div>'}</div>
    ${d.absent.length ? `<p class="sub">${isToday ? 'Attendus, pas encore pointés' : 'Absents'} (${d.absent.length})</p><div class="rows">${d.absent.map(x => `<div class="rowc">${avatar(x.n)}<div class="nm"><b>${esc(x.n)}</b><small>${esc(x.kd === 'stagiaire' ? 'Stagiaire' : x.r || '')}</small></div></div>`).join('')}</div>` : ''}
    ${d.onLeave.length ? `<p class="sub">En congé (${d.onLeave.length})</p><div class="rows">${d.onLeave.map(x => `<div class="rowc">${avatar(x.n)}<div class="nm"><b>${esc(x.n)}</b><small>${esc(x.t)}</small></div></div>`).join('')}</div>` : ''}`;
  $('#adPrev').onclick = () => { A.date = addDays(A.date, -1); goTab('today'); };
  $('#adNext').onclick = () => { A.date = addDays(A.date, 1); goTab('today'); };
  if ($('#adManual')) $('#adManual').onclick = () => openManual();
  if ($('#adRep')) $('#adRep').onclick = () => confirmModal('<h2>Envoyer le rapport d’hier ?</h2><p class="muted">Il part par e-mail aux adresses saisies dans les Réglages.</p>', 'Envoyer', async () => {
    try { const r = await adm('sendreport'); closeModal(); toast('Rapport envoyé à ' + r.to + ' adresse(s).'); } catch (e) { toast(errMsg(e), 'error'); }
  });
  $$('#aBody [data-sid]').forEach(b => b.onclick = () => openFix(b.dataset.sid));
}
const OK_ST = ['Sur place', 'Corrigé', 'Saisi par Soned', 'Télétravail', 'Départ automatique'];
const badSes = x => (x.a && x.aS && !OK_ST.includes(x.aS)) || (x.d && x.dS && !OK_ST.includes(x.dS));
function sessRow(x) {
  const bad = badSes(x), tags = [];
  if (x.abs) tags.push(tag('Arrivée tardive : considéré absent', 'red')); else if (x.late) tags.push(tag('Retard ' + x.late + ' min', 'amber'));
  if (x.auto) tags.push(tag('Départ automatique', 'amber'));
  if ((x.v === 0 || x.vd === 0) && !x.fix) tags.push(tag('Appareil non reconnu', 'gray'));
  if (x.pl) tags.push(tag('Lieu : ' + x.pl, 'blue2'));
  if (x.kd === 'stagiaire') tags.push(tag('Stagiaire', 'blue'));
  if (x.aS === 'Télétravail') tags.push(tag('Télétravail', 'blue2'));
  if (x.fix) tags.push(tag(x.fix.manual ? 'Saisi par ' + (x.fix.by || 'Soned') : 'Corrigé par ' + (x.fix.by || 'Soned'), 'gray'));
  if (bad) tags.push(tag(!OK_ST.includes(x.aS) ? x.aS : x.dS, 'red'));
  if (!x.d) tags.push(x.open ? tag('Présent', '') : tag('Départ non pointé', 'red'));
  return `<button class="rowc ${isRH() ? 'click' : ''} ${bad ? 'bad' : ''}" type="button" ${isRH() ? `data-sid="${esc(x.i)}"` : ''}>${avatar(x.n)}<div class="nm"><b>${esc(x.n)}${x.v === 1 && x.vd !== 0 ? VERIFIED : ''}</b><small>${esc(x.r || '')}</small><div>${tags.join('')}</div></div>
    <div class="times"><div><small>ARRIVÉE</small><b>${fmtH(x.a)}</b></div><div><small>DÉPART</small><b>${fmtH(x.d)}</b>${x.dDay ? `<small>${esc(shortDate(x.dDay))}</small>` : ''}</div></div></button>`;
}
function openFix(sid) {
  const s = aDay.sessions.find(x => x.i === sid); if (!s) return;
  openModal(`<h2>Corriger un pointage</h2><p class="muted">${esc(s.n)} · ${esc(longDate(aDay.date))}</p>
    <div class="row2"><label>Arrivée<input id="fA" type="time" value="${esc(s.a || '')}"></label><label>Départ<input id="fD" type="time" value="${esc(s.d || '')}"></label></div>
    <label>Note (facultatif)<input id="fN" maxlength="120" placeholder="Ex : oubli confirmé par le chef de service"></label>
    <p class="muted" style="font-size:.85rem;margin-top:10px">La correction est marquée « corrigée par ${esc(ME_ADM.name || 'vous')} » et inscrite au journal.</p>
    <p class="err" id="fErr" role="alert"></p>
    <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="fOk" type="button">Enregistrer</button></div>`);
  $('#fOk').onclick = async () => {
    $('#fOk').disabled = true;
    try { await adm('fix', { date: aDay.date, sid, a: $('#fA').value, d: $('#fD').value, note: $('#fN').value }); closeModal(); toast('Pointage corrigé.'); goTab('today'); }
    catch (e) { errIn('#fErr', e); $('#fOk').disabled = false; }
  };
}
async function openManual(empId) {
  let list; try { list = (await getEmps(true)).filter(e => e.active); } catch (e) { return toast(errMsg(e), 'error'); }
  if (!list.length) return toast('Ajoutez d’abord des employés.', 'error');
  const t = parts(nowMs());
  openModal(`<h2>Pointage manuel</h2><p class="muted">Pour une personne qui a oublié son téléphone ou perdu sa carte. Le pointage sera marqué « Saisi par ${esc(ME_ADM.name || 'Soned')} » et inscrit au journal.</p>
    <label>Personne<select id="mE">${optList(list.map(e => [e.id, e.name + (e.kind === 'stagiaire' ? ' (stagiaire)' : '')]), empId)}</select></label>
    <label>Date<input id="mDate" type="date" max="${t.key}" value="${A.date || t.key}"></label>
    <div class="row2"><label>Arrivée<input id="mA" type="time" value=""></label><label>Départ (facultatif)<input id="mD" type="time"></label></div>
    <label>Motif<select id="mR">${optList(['Téléphone oublié', 'Carte perdue', 'Panne du site', 'Autre'].map(x => [x, x]))}</select></label>
    <label>Note (facultatif)<input id="mN" maxlength="120"></label>
    <p class="err" id="mErr2" role="alert"></p>
    <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="mOk" type="button">Enregistrer</button></div>`);
  $('#mOk').onclick = async () => {
    $('#mOk').disabled = true;
    try { await adm('manual', { emp: $('#mE').value, date: $('#mDate').value, a: $('#mA').value, d: $('#mD').value, reason: $('#mR').value, note: $('#mN').value }); closeModal(); toast('Pointage manuel enregistré.'); if (atab === 'today') { A.date = $('#mDate') ? A.date : A.date; goTab('today'); } }
    catch (e) { errIn('#mErr2', e); $('#mOk').disabled = false; }
  };
}

/* ---------- EMPLOYÉS / STAGIAIRES ---------- */
let PK = 'employe';
const peopleSeg = k => `<div class="seg full" id="pSeg">${[['employe', 'Employés'], ['stagiaire', 'Stagiaires'], ['gest', 'Gestionnaires']].map(([v, l]) => `<button type="button" data-pk="${v}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const bindPSeg = () => { $('#pSeg').onclick = e => { const b = e.target.closest('button[data-pk]'); if (b && b.dataset.pk !== PK) { PK = b.dataset.pk; A.q = ''; goTab('people'); } }; };
async function tPeople() { return PK === 'gest' ? tAdmins() : tEmp(PK); }
// Employés et appareils bloqués après 5 codes faux : à débloquer par le RH ou l'informaticien
async function blockedCard() {
  if (!canPeople()) return '';
  let b; try { b = await adm('blocked'); } catch (e) { return ''; }
  if (!b.emps.length && !b.devs.length) return '';
  return `<div class="card blk"><h3>Accès bloqués (${b.emps.length + b.devs.length})</h3><p class="muted">Après 5 codes faux, l’accès est bloqué jusqu’à ce qu’une personne du RH ou l’informaticien le débloque.</p><div class="rows">
    ${b.emps.map(x => `<div class="rowc">${avatar(x.n)}<div class="nm"><b>${esc(x.n)}</b><small>Employé · bloqué le ${esc(x.time)}</small></div><button class="btn sm" data-ube="${esc(x.id)}" type="button">Débloquer</button></div>`).join('')}
    ${b.devs.map(x => `<div class="rowc"><span class="ico">${IC.lock}</span><div class="nm"><b>Appareil n° ${esc(x.ref)}</b><small>Gestionnaire · bloqué le ${esc(x.time)}</small></div><button class="btn sm" data-ubd="${esc(x.dev)}" type="button">Débloquer</button></div>`).join('')}</div></div>`;
}
function bindBlocked() {
  $$('#aBody [data-ube]').forEach(b => (b.onclick = async () => { try { await adm('unblockemp', { emp: b.dataset.ube }); toast('Accès débloqué.'); goTab('people'); } catch (e) { toast(errMsg(e), 'error'); } }));
  $$('#aBody [data-ubd]').forEach(b => (b.onclick = async () => { try { await adm('unblockdev', { tdev: b.dataset.ubd }); toast('Appareil débloqué.'); goTab('people'); } catch (e) { toast(errMsg(e), 'error'); } }));
}
async function tEmp(kind) {
  const all = await getEmps(true), isI = kind === 'stagiaire', list = all.filter(e => e.kind === kind);
  const label = isI ? 'stagiaire' : 'employé';
  const blk = await blockedCard();
  $('#aBody').innerHTML = `${peopleSeg(kind)}${blk}<div class="toolbar"><input id="eQ" type="search" placeholder="Chercher un nom…" value="${esc(A.q)}" style="min-width:100%"></div>
    <div class="toolbar">${canPeople() ? `<button class="btn sm" id="eAdd" type="button">${IC.plus} ${isI ? 'Ajouter des stagiaires' : 'Ajouter des employés'}</button><button class="btn line sm" id="eImp" type="button">${IC.file} Importer un fichier</button><button class="btn line sm" id="eCards" type="button">${IC.print} Imprimer les badges</button>` : ''}<span class="muted" id="eCount"></span></div>
    <div class="rows" id="eList"></div>`;
  const draw = () => {
    const q = norm($('#eQ').value); A.q = $('#eQ').value;
    const l = list.filter(e => norm(e.name).includes(q));
    $('#eCount').textContent = `${list.length} ${label}${list.length > 1 ? 's' : ''}`;
    $('#eList').innerHTML = l.length ? l.map(e => {
      const tg = [];
      if (e.blocked) tg.push(tag('Accès bloqué', 'red')); if (e.susp) tg.push(tag('Carte suspendue', 'red')); if (!e.active) tg.push(tag('Désactivé', 'gray'));
      if (!e.locked) tg.push(tag('Code à créer', 'amber')); if (e.tele === false) tg.push(tag('Bureau seulement', 'gray')); else if (!(e.places || []).length) tg.push(tag('Aucun lieu de télétravail', 'gray')); if (e.svc) tg.push(tag(svcName(e.svc), 'gray'));
      if (isI && e.intern && e.intern.to) tg.push(tag('jusqu’au ' + shortDate(e.intern.to), e.intern.to < today() ? 'red' : 'gray'));
      if (e.adm) tg.push(tag('Compte RH', 'blue')); if (e.pv) tg.push(tag(e.pv + (e.pv > 1 ? ' appareils à valider' : ' appareil à valider'), 'amber')); else if (e.dv) tg.push(tag('Appareil validé', 'blue2'));
      if (e.inside) tg.push(tag('Présent'));
      return `<button class="rowc click" type="button" data-emp="${esc(e.id)}">${avatar(e.name)}<div class="nm"><b>${esc(e.name)}${e.verified ? VERIFIED : ''}</b><small>${esc(e.role || (isI ? 'Stagiaire' : ''))}</small><div>${tg.join('')}</div></div></button>`;
    }).join('') : `<div class="card center muted">${list.length ? 'Aucun résultat.' : `Aucun ${label} pour le moment. Touchez « Ajouter ».`}</div>`;
  };
  bindPSeg(); bindBlocked(); draw(); $('#eQ').oninput = draw;
  $('#eList').onclick = e => { const b = e.target.closest('[data-emp]'); if (b) openEmp(b.dataset.emp); };
  if ($('#eAdd')) { $('#eAdd').onclick = () => openAdd(kind); $('#eImp').onclick = () => openImport(kind); $('#eCards').onclick = () => printCards(list.filter(e => e.active)); }
}
function openAdd(kind, pre) {
  const isI = kind === 'stagiaire', svcs = A.set ? A.set.services : [];
  openModal(`<h2>${isI ? 'Ajouter des stagiaires' : 'Ajouter des employés'}</h2>
    <label>Un nom par ligne <small>(Nom ; Poste ; Service — poste et service facultatifs)</small><textarea id="adT" rows="${pre ? 10 : 5}" placeholder="Awa Diop ; Comptable\nModou Fall ; Technicien">${esc(pre || '')}</textarea></label>
    ${svcs.length ? `<label>Service<select id="adS"><option value="">Horaire général</option>${optList(svcs.map(v => [v.id, v.name]))}</select></label>` : ''}
    ${isI ? `<label>École<input id="adSc" maxlength="60" placeholder="Ex : SUP’INFO Dakar"></label><label>Tuteur dans l’entreprise<input id="adTu" maxlength="60"></label>
    <div class="row2"><label>Début du stage<input id="adF" type="date"></label><label>Fin du stage<input id="adTo" type="date"></label></div>
    <p class="muted" style="font-size:.85rem">Après la date de fin, le pointage est refusé (« Votre stage est terminé »).</p>` : ''}
    <p class="err" id="adErr" role="alert"></p>
    <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="adOk" type="button">Ajouter</button></div>`);
  $('#adOk').onclick = async () => {
    $('#adOk').disabled = true;
    try {
      const body = { text: $('#adT').value, kind, svc: $('#adS') ? $('#adS').value || null : null };
      if (isI) body.intern = { school: $('#adSc').value, tutor: $('#adTu').value, from: $('#adF').value, to: $('#adTo').value };
      const r = await adm('add', body); A.emps = r.list;
      closeModal(); toast(r.added.length ? r.added.length + ' ajouté(s).' : 'Personne n’a été ajouté.', r.added.length ? '' : 'error');
      if (r.skipped.length) aMsg('Ignoré : ' + r.skipped.join(' ; '), true); else aMsg('');
      goTab(atab);
    } catch (e) { errIn('#adErr', e); $('#adOk').disabled = false; }
  };
}
async function openEmp(id) {
  const e = (A.emps || []).find(x => x.id === id); if (!e) return;
  if (!canPeople()) return openModal(`<button class="modal-x" data-close type="button" aria-label="Fermer">×</button><div class="person"><span>${avatar(e.name, 'big')}</span><div><h2>${esc(e.name)}</h2><small>${esc(e.role || (e.kind === 'stagiaire' ? 'Stagiaire' : 'Employé'))}</small></div></div>
    <p class="muted">Votre rôle permet de consulter. Les modifications se font par le RH ou l’informaticien.</p><div class="modal-actions"><button class="btn" id="eStats" type="button">Statistiques</button></div>`) || ($('#eStats').onclick = () => { closeModal(); openStatsOf(id); });
  const isI = e.kind === 'stagiaire', svcs = A.set ? A.set.services : [], it = e.intern || {};
  openModal(`<button class="modal-x" data-close type="button" aria-label="Fermer">×</button>
    <div class="person"><span id="eAv">${avatar(e.name, 'big')}</span><div><h2>${esc(e.name)}${e.verified ? VERIFIED : ''}</h2><small>${isI ? 'Stagiaire' : 'Employé'}${e.verified ? ' · vérifié par ' + esc(e.verified.by) : ''}</small></div></div>
    <div>${e.blocked ? tag('Accès bloqué (5 codes faux)', 'red') : ''}${e.susp ? tag('Carte suspendue' + (e.alert ? ' : ' + e.alert.why : ''), 'red') : ''}${e.locked ? tag('Code créé') : tag('Code à créer', 'amber')}${e.bound ? tag('Liée à un téléphone', 'gray') : tag('Pas de téléphone lié', 'gray')}${!e.active ? tag('Désactivé', 'gray') : ''}</div>
    <label>Nom<input id="eN" maxlength="60" value="${esc(e.name)}"></label>
    <label>Poste<input id="eR" maxlength="60" value="${esc(e.role || '')}"></label>
    <label>Service<select id="eS"><option value="">Horaire général</option>${optList(svcs.map(v => [v.id, v.name]), e.svc)}</select></label>
    <label class="sw"><input id="eTele" type="checkbox" ${e.tele !== false ? 'checked' : ''}> Peut pointer en télétravail <small>(depuis ses lieux enregistrés, 4 au maximum)</small></label>
    <div id="ePl">${(e.places || []).length ? (e.places || []).map(p => `<div class="rowc" style="margin-bottom:6px"><span class="ico">${IC.pin}</span><div class="nm"><b>${esc(p.n)}</b><small>Lieu enregistré par l’employé</small></div><button class="btn line sm" data-rpl="${esc(p.id)}" type="button">Retirer</button></div>`).join('') : '<p class="muted" style="font-size:.85rem">Aucun lieu de télétravail enregistré.</p>'}</div>
    ${isRH() ? `<label>Jours de congé annuel <small>(vide = ${A.set && A.set.leaveDays != null ? A.set.leaveDays : 24} jours, valeur générale)</small><input id="eLv" type="number" min="0" max="90" value="${e.leaveDays == null ? '' : e.leaveDays}"></label>` : ''}
    <label>Statut<select id="eK">${optList([['employe', 'Employé'], ['stagiaire', 'Stagiaire']], e.kind)}</select></label>
    <div id="eInt" ${isI ? '' : 'hidden'}><label>École<input id="eSc" maxlength="60" value="${esc(it.school || '')}"></label><label>Tuteur<input id="eTu" maxlength="60" value="${esc(it.tutor || '')}"></label>
      <div class="row2"><label>Début du stage<input id="eF" type="date" value="${esc(it.from || '')}"></label><label>Fin du stage<input id="eTo" type="date" value="${esc(it.to || '')}"></label></div></div>
    <label class="sw"><input id="eDays" type="checkbox" ${e.days ? 'checked' : ''}> Jours de travail personnels</label>
    <div id="eDaysBox" ${e.days ? '' : 'hidden'}>${dayChips(e.days || [1, 2, 3, 4, 5], 'ed')}</div>
    <p class="err" id="eErr" role="alert"></p>
    <div class="modal-actions"><button class="btn" id="eSave" type="button">Enregistrer</button></div>
    <p class="sub">Carte et sécurité</p>
    <div class="modal-actions" style="justify-content:flex-start;margin-top:0">
      <button class="btn ghost sm" id="eCard" type="button">${IC.print} Badge QR</button>
      <button class="btn ghost sm" id="eVer" type="button">${e.verified ? 'Retirer le ✔' : 'Marquer ✔ Vérifié'}</button>
      ${e.blocked ? '<button class="btn sm" id="eUnblock" type="button">Débloquer l’accès</button>' : ''}
      <button class="btn ghost sm" id="eUnlock" type="button">Code oublié</button>
      ${e.bound ? '<button class="btn ghost sm" id="eUnbind" type="button">Délier le téléphone</button>' : ''}
      <button class="btn ghost sm" id="eNewQr" type="button">Nouveau QR</button></div>
    <p class="sub">Suivi</p>
    <div class="modal-actions" style="justify-content:flex-start;margin-top:0">
      <button class="btn ghost sm" id="eStats" type="button">Statistiques</button>
      ${isRH() ? '<button class="btn ghost sm" id="eManual" type="button">Pointage manuel</button>' : ''}
      <button class="btn ghost sm" id="eWrite" type="button">Écrire à cette personne</button>
      ${isI ? '<button class="btn ghost sm" id="eFiche" type="button">Fiche de présence</button>' : ''}
      <button class="btn ghost sm" id="eAct" type="button">${e.active ? 'Désactiver' : 'Réactiver'}</button></div>
    <p class="sub" style="color:var(--red)">Zone dangereuse</p>
    <button class="btn danger sm" id="eDel" type="button">Supprimer définitivement</button>`);
  adm('photoget', { emp: id }).then(r => { if (r.photo && $('#eAv')) $('#eAv').innerHTML = avatar(e.name, 'big', r.photo); }).catch(() => {});
  $('#eK').onchange = () => ($('#eInt').hidden = $('#eK').value !== 'stagiaire');
  $('#eDays').onchange = () => ($('#eDaysBox').hidden = !$('#eDays').checked);
  const upd = async (extra, okMsg) => { const r = await adm('update', { emp: id, ...extra }); A.emps = r.list; toast(okMsg); };
  const act = (op, okMsg, extra = {}) => async () => { try { const r = await adm(op, { emp: id, ...extra }); A.emps = r.list; closeModal(); toast(okMsg); goTab(atab); } catch (x) { errIn('#eErr', x); } };
  $('#eSave').onclick = async () => {
    try {
      const k = $('#eK').value, ex = { name: $('#eN').value, role: $('#eR').value, svc: $('#eS').value || null, kind: k, tele: $('#eTele').checked, days: $('#eDays').checked ? pickDays('ed') : null };
      if ($('#eLv')) ex.leaveDays = $('#eLv').value === '' ? null : Number($('#eLv').value);
      ex.intern = k === 'stagiaire' ? { school: $('#eSc').value, tutor: $('#eTu').value, from: $('#eF').value, to: $('#eTo').value } : null;
      await upd(ex, 'Fiche enregistrée.'); closeModal(); goTab(atab);
    } catch (x) { errIn('#eErr', x); }
  };
  $('#eCard').onclick = () => printCards([e]);
  $('#eVer').onclick = act('verify', e.verified ? 'Vérification retirée.' : 'Profil vérifié ✔', { on: !e.verified });
  $('#eUnlock').onclick = () => confirmModal(`<h2>Code oublié ?</h2><p>Le code de <b>${esc(e.name)}</b> sera effacé. Il en créera un nouveau au prochain scan de sa carte.</p>`, 'Effacer le code', act('unlock', 'Code effacé.'));
  if ($('#eUnbind')) $('#eUnbind').onclick = () => confirmModal(`<h2>Délier le téléphone ?</h2><p>La carte de <b>${esc(e.name)}</b> sera liée au prochain téléphone qui la scannera.</p>`, 'Délier', act('unbind', 'Téléphone délié.'));
  $('#eNewQr').onclick = () => confirmModal(`<h2>Créer un nouveau QR ?</h2><p>L’ancienne carte de <b>${esc(e.name)}</b> ne marchera plus. Son code sera effacé. Pensez à imprimer la nouvelle carte.</p>`, 'Créer le nouveau QR', async () => {
    try { const r = await adm('newqr', { emp: id }); A.emps = r.list; closeModal(); toast('Nouveau QR créé.'); goTab(atab); printCards([r.list.find(x => x.id === id)]); } catch (x) { toast(errMsg(x), 'error'); }
  });
  $('#eAct').onclick = async () => { try { await upd({ active: !e.active }, e.active ? 'Désactivé.' : 'Réactivé.'); closeModal(); goTab(atab); } catch (x) { errIn('#eErr', x); } };
  $('#eStats').onclick = () => { closeModal(); openStatsOf(id); };
  if ($('#eManual')) $('#eManual').onclick = () => { closeModal(); openManual(id); };
  $('#eWrite').onclick = () => { closeModal(); openThread(id); };
  if ($('#eUnblock')) $('#eUnblock').onclick = act('unblockemp', 'Accès débloqué.');
  $$('#ePl [data-rpl]').forEach(b => (b.onclick = async () => { try { const r = await adm('rmplace', { emp: id, pid: b.dataset.rpl }); A.emps = r.list; closeModal(); toast('Lieu retiré.'); goTab(atab); } catch (x) { errIn('#eErr', x); } }));
  if ($('#eFiche')) $('#eFiche').onclick = () => { closeModal(); printFiche(id); };
  $('#eDel').onclick = () => openDelete(e);
}
function openDelete(e) {
  openModal(`<h2>Supprimer ${esc(e.name)} ?</h2>
    <div class="msg err2" style="display:block"><b>Cette action est définitive.</b><br>La fiche, la carte QR, la photo et les congés de cette personne seront supprimés. Ses anciens pointages restent dans l’historique et les rapports.</div>
    <p class="muted">Si vous voulez seulement qu’elle ne pointe plus, utilisez plutôt « Désactiver ».</p>
    <p class="err" id="dlErr" role="alert"></p>
    <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn danger" id="dlOk" type="button">Supprimer définitivement</button></div>`);
  $('#dlOk').onclick = async () => {
    const b = $('#dlOk'); b.disabled = true; b.textContent = 'Suppression…'; $('#dlErr').textContent = '';
    try { const r = await adm('remove', { emp: e.id }); A.emps = r.list; closeModal(); toast(e.name + ' a été supprimé.'); goTab(atab); }
    catch (x) { b.disabled = false; b.textContent = 'Supprimer définitivement'; errIn('#dlErr', x); }
  };
}

/* ---------- SERVICES ---------- */
async function tSvc() {
  const s = await getSet(true), l = s.services;
  $('#aBody').innerHTML = `<p class="muted">Un service = une équipe avec une heure de début différente (horaires décalés ou de nuit). Sans service, c’est l’horaire général des Réglages qui s’applique.</p><div class="toolbar"><button class="btn sm" id="sNew" type="button">${IC.plus} Nouveau service</button></div>
    <div class="rows">${l.length ? l.map(v => `<button class="rowc click" type="button" data-s="${esc(v.id)}"><div class="nm"><b>${esc(v.name)}${v.night ? ' 🌙' : ''}</b><small>${fmtH(v.start)} · tolérance ${v.tol} min · ${v.days.map(d => DOW[d - 1]).join(' ')}</small></div></button>`).join('') : '<div class="card center muted">Aucun service. L’horaire général s’applique à tout le monde.</div>'}</div>`;
  $('#sNew').onclick = () => openSvc(null);
  $('#aBody').onclick = e => { const b = e.target.closest('[data-s]'); if (b) openSvc(l.find(x => x.id === b.dataset.s)); };
}
function openSvc(v) {
  const d = Object.assign({ name: '', start: '08:00', tol: 0, days: [1, 2, 3, 4, 5], night: false }, v || {});
  openModal(`<h2>${v ? 'Modifier le service' : 'Nouveau service'}</h2>
    <label>Nom du service<input id="vN" maxlength="40" value="${esc(d.name)}" placeholder="Ex : Équipe de nuit"></label>
    <div class="row2"><label>Début<input id="vS" type="time" value="${d.start}"></label><label>Tolérance (min)<input id="vT" type="number" min="0" max="120" value="${d.tol}"></label></div>
    <p class="muted" style="font-size:.85rem">« Considéré absent » et la fin du pointage d’arrivée se décalent avec l’heure de début (réglages généraux : ${esc(A.set ? fmtH(A.set.absentFrom) + ' et ' + fmtH(A.set.arrivalClose) : '')} pour un début à ${esc(A.set ? fmtH(A.set.start) : '')}).</p>
    <label>Jours de travail</label>${dayChips(d.days, 'sd')}
    <label class="sw"><input id="vNight" type="checkbox" ${d.night ? 'checked' : ''}> Service de nuit (le départ a lieu le lendemain)</label>
    <p class="err" id="vErr" role="alert"></p>
    <div class="modal-actions">${v ? '<button class="btn danger" id="vDel" type="button">Supprimer</button>' : ''}<button class="btn line" data-close type="button">Annuler</button><button class="btn" id="vOk" type="button">Enregistrer</button></div>`);
  $('#vOk').onclick = async () => {
    try { const r = await adm('svcsave', { svc: { id: v && v.id, name: $('#vN').value, start: $('#vS').value, tol: $('#vT').value, days: pickDays('sd'), night: $('#vNight').checked } }); A.set = r.settings; closeModal(); toast('Service enregistré.'); goTab('svc'); }
    catch (e) { errIn('#vErr', e); }
  };
  if (v) $('#vDel').onclick = () => confirmModal(`<h2>Supprimer « ${esc(v.name)} » ?</h2><p>Ses membres passent à l’horaire général.</p>`, 'Supprimer', async () => {
    try { const r = await adm('svcdel', { id: v.id }); A.set = r.settings; A.emps = r.list; closeModal(); toast('Service supprimé.'); goTab('svc'); } catch (e) { toast(errMsg(e), 'error'); }
  }, 'danger');
}

/* ---------- CONGÉS : soldes, absences, jours fériés, congés ---------- */
async function tCal() {
  const [s, lv, bl] = await Promise.all([getSet(true), adm('leaves'), adm('balances')]); A.set = lv.settings || s;
  const set = A.set, fx = set.fixedHolidays || [], ed = isRH();
  const absTxt = a => a.t === 'late' ? 'Arrivée à partir de ' + fmtH(set.absentFrom) : 'Aucun pointage';
  $('#aBody').innerHTML = `<div class="card"><h3>Soldes de congés ${bl.year}</h3><p class="muted">Chaque employé a ${set.leaveDays} jours de congé annuel (modifiable dans sa fiche). Les <b>absences non justifiées</b> sont retirées automatiquement de son solde, le lendemain matin.</p>
      <div class="mwrap"><table class="mtable"><thead><tr><th>Nom</th><th class="num">Droit</th><th class="num">Pris</th><th class="num">Absences</th><th class="num">Reste</th></tr></thead><tbody>
      ${bl.list.length ? bl.list.map(b => `<tr><td><b>${esc(b.n)}</b><small>${esc(b.r || '')}</small></td><td class="num">${b.total}</td><td class="num">${b.taken}</td><td class="num">${b.abs ? `<b style="color:var(--red)">${b.abs}</b>` : 0}</td><td class="num"><b style="color:${b.left < 0 ? 'var(--red)' : 'var(--g700)'}">${b.left}</b></td></tr>`).join('') : '<tr><td colspan="5" class="muted">Aucun employé.</td></tr>'}</tbody></table></div></div>
    <div class="card"><h3>Absences de l’année</h3><p class="muted">Calculées automatiquement : jour de travail sans pointage, ou arrivée à partir de ${esc(fmtH(set.absentFrom))}. ${ed ? 'Si l’absence est justifiée, touchez « Justifier » : elle n’est plus déduite des congés.' : ''}</p>
      <div class="rows">${bl.abs.length ? bl.abs.map(a => `<div class="rowc">${avatar(a.n)}<div class="nm"><b>${esc(a.n)}</b><small>${esc(shortDate(a.d))} · ${esc(absTxt(a))}${a.j ? ' · justifiée' + (a.j.note ? ' (' + esc(a.j.note) + ')' : '') + ' par ' + esc(a.j.by) : ''}</small></div>${ed ? (a.j ? `<button class="btn line sm" data-un="${esc(a.d)}|${esc(a.e)}" type="button">Retirer</button>` : `<button class="btn sm" data-jf="${esc(a.d)}|${esc(a.e)}" data-nm="${esc(a.n)}" type="button">Justifier</button>`) : (a.j ? tag('Justifiée', '') : tag('Déduite', 'red'))}</div>`).join('') : '<div class="card center muted" style="box-shadow:none">Aucune absence pour le moment.</div>'}</div></div>
    <div class="card"><h3>Jours fériés</h3><p class="muted">Un jour férié n’est jamais compté comme une absence. Les fêtes à date fixe sont déjà prévues ; ajoutez les fêtes religieuses (Korité, Tabaski, Magal…) chaque année.</p>
      <div>${fx.map(h => tag(h.md.slice(3) + '/' + h.md.slice(0, 2) + ' · ' + h.n)).join('')}</div>
      <div class="rows" style="margin-top:12px">${set.holidays.map(h => `<div class="rowc"><div class="nm"><b>${esc(h.n)}</b><small>${esc(longDate(h.d))}</small></div>${ed ? `<button class="btn line sm" data-hd="${esc(h.d)}" type="button">Retirer</button>` : ''}</div>`).join('')}</div>
      ${ed ? `<button class="btn sm" id="hAdd" type="button" style="margin-top:12px">${IC.plus} Ajouter un jour férié</button>` : '<p class="muted" style="font-size:.85rem">Seul le RH peut modifier les jours fériés.</p>'}</div>
    <div class="card"><h3>Congés</h3><p class="muted">Un employé en congé n’est pas compté absent. Le « Congé annuel » est retiré de son solde.</p>
      ${ed ? `<button class="btn sm" id="lAdd" type="button">${IC.plus} Ajouter un congé</button>` : '<p class="muted" style="font-size:.85rem">Seul le RH peut modifier les congés.</p>'}
      <div class="rows" style="margin-top:12px">${lv.list.length ? lv.list.map(l => `<div class="rowc">${avatar(l.n)}<div class="nm"><b>${esc(l.n)}</b><small>${esc(l.type)} · ${esc(shortDate(l.from))} → ${esc(shortDate(l.to))}${l.note ? ' · ' + esc(l.note) : ''}</small></div>${ed ? `<button class="btn line sm" data-ld="${esc(l.id)}" type="button">Retirer</button>` : ''}</div>`).join('') : '<div class="card center muted" style="box-shadow:none">Aucun congé enregistré.</div>'}</div></div>`;
  $('#aBody').onclick = async e => {
    const hd = e.target.closest('[data-hd]'), ld = e.target.closest('[data-ld]'), jf = e.target.closest('[data-jf]'), un = e.target.closest('[data-un]');
    try {
      if (hd) { await adm('holdel', { d: hd.dataset.hd }); toast('Jour férié retiré.'); goTab('cal'); }
      if (ld) { await adm('leavedel', { id: ld.dataset.ld }); toast('Congé retiré.'); goTab('cal'); }
      if (un) { const [d, emp] = un.dataset.un.split('|'); await adm('justify', { d, emp, on: false }); toast('Justification retirée : l’absence est de nouveau déduite.'); goTab('cal'); }
      if (jf) {
        const [d, emp] = jf.dataset.jf.split('|');
        openModal(`<h2>Justifier l’absence</h2><p class="muted">${esc(jf.dataset.nm)} · ${esc(longDate(d))}. Elle ne sera pas retirée des congés.</p><label>Motif (facultatif)<input id="jN" maxlength="80" placeholder="Ex : certificat médical reçu"></label><p class="err" id="jErr" role="alert"></p>
          <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="jOk" type="button">Justifier</button></div>`);
        $('#jOk').onclick = async () => { try { await adm('justify', { d, emp, note: $('#jN').value }); closeModal(); toast('Absence justifiée.'); goTab('cal'); } catch (x) { errIn('#jErr', x); } };
      }
    } catch (x) { toast(errMsg(x), 'error'); }
  };
  if (!ed) return;
  $('#hAdd').onclick = () => {
    openModal(`<h2>Ajouter un jour férié</h2><label>Date<input id="hD" type="date"></label><label>Nom<input id="hN" maxlength="50" placeholder="Ex : Tabaski"></label><p class="err" id="hErr" role="alert"></p>
      <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="hOk" type="button">Ajouter</button></div>`);
    $('#hOk').onclick = async () => { try { await adm('holsave', { d: $('#hD').value, n: $('#hN').value }); closeModal(); toast('Jour férié ajouté.'); goTab('cal'); } catch (x) { errIn('#hErr', x); } };
  };
  $('#lAdd').onclick = async () => {
    const emps = (await getEmps(true)).filter(e => e.active); if (!emps.length) return toast('Ajoutez d’abord des employés.', 'error');
    openModal(`<h2>Ajouter un congé</h2><label>Personne<select id="lE">${optList(emps.map(e => [e.id, e.name]))}</select></label>
      <div class="row2"><label>Du<input id="lF" type="date"></label><label>Au (inclus)<input id="lT" type="date"></label></div>
      <label>Type<select id="lY">${optList((set.leaveTypes || ['Congé annuel', 'Maladie', 'Autre']).map(x => [x, x]))}</select></label>
      <label>Note (facultatif)<input id="lN" maxlength="80"></label><p class="err" id="lErr" role="alert"></p>
      <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="lOk" type="button">Ajouter</button></div>`);
    $('#lOk').onclick = async () => { try { await adm('leaveadd', { emp: $('#lE').value, from: $('#lF').value, to: $('#lT').value, type: $('#lY').value, note: $('#lN').value }); closeModal(); toast('Congé ajouté.'); goTab('cal'); } catch (x) { errIn('#lErr', x); } };
  };
}

/* ---------- STATISTIQUES ---------- */
const kindSeg = k => `<div class="seg" id="kSeg">${[['', 'Tous'], ['employe', 'Employés'], ['stagiaire', 'Stagiaires']].map(([v, l]) => `<button type="button" data-k="${v}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
function statsTable(rows, clickable) {
  return `<div class="mwrap"><table class="mtable"><thead><tr><th>Nom</th><th class="num">Présent</th><th class="num">Retards</th><th class="num">Absences</th><th class="num">Congés</th><th class="num">Fériés</th><th class="num">Heures</th><th class="num">Sans départ</th><th class="num">Hors zone</th><th class="num">Télétravail</th><th class="num">Présence</th><th class="num">Ponctualité</th></tr></thead><tbody>
    ${rows.length ? rows.map(r => `<tr class="${clickable ? 'click' : ''}" data-r="${esc(r.id)}"><td><b>${esc(r.n)}</b><small>${esc(r.kd === 'stagiaire' ? 'Stagiaire' : r.r)}</small></td><td class="num">${r.days}</td><td class="num">${r.late}${r.late ? `<small>${r.lateMin} min</small>` : ''}</td><td class="num">${r.absent}</td><td class="num">${r.leave}</td><td class="num">${r.holiday}</td><td class="num">${fmtMin(r.min)}</td><td class="num">${r.forgot}</td><td class="num">${r.flagged}</td><td class="num">${r.tele || 0}</td><td class="num">${pct(r.presence)}</td><td class="num">${pct(r.punct)}</td></tr>`).join('') : '<tr><td colspan="12" class="muted" style="text-align:center;padding:20px">Aucune donnée sur cette période.</td></tr>'}</tbody></table></div>`;
}
const statsCsv = rows => 'Nom;Statut;Poste;Jours présent;Jours en télétravail;Retards;Minutes de retard;Absences;Congés;Jours fériés;Heures;Départs non pointés;Hors zone;Présence %;Ponctualité %\n' +
  rows.map(r => [r.n, r.kd === 'stagiaire' ? 'Stagiaire' : 'Employé', r.r, r.days, r.tele || 0, r.late, r.lateMin, r.absent, r.leave, r.holiday, fmtMin(r.min), r.forgot, r.flagged, r.presence ?? '', r.punct ?? ''].map(csvCell).join(';')).join('\n');
async function tStats() {
  const t = today(); A.from ||= t.slice(0, 8) + '01'; A.to ||= t;
  $('#aBody').innerHTML = `<div class="card"><div class="row2"><label>Du<input id="stF" type="date" value="${A.from}" max="${t}"></label><label>Au<input id="stT" type="date" value="${A.to}" max="${t}"></label></div>
    <div class="toolbar" style="margin-top:12px">${kindSeg(A.kind)}<button class="btn sm" id="stGo" type="button">Afficher</button></div><p class="muted" style="margin:0;font-size:.85rem">Période de 3 mois au plus. Touchez une ligne pour voir le détail d’une personne.</p></div><div id="stOut"></div>`;
  const run = async () => {
    A.from = $('#stF').value; A.to = $('#stT').value; $('#stOut').innerHTML = '<div class="card center muted">Calcul…</div>';
    try {
      const r = await adm('stats', { from: A.from, to: A.to, kind: A.kind });
      $('#stOut').innerHTML = `<div class="dash"><div class="kpi"><b>${pct(r.totals.presence)}</b><span>Présence</span></div><div class="kpi"><b>${pct(r.totals.punct)}</b><span>Ponctualité</span></div><div class="kpi amber"><b>${r.totals.late}</b><span>Retards</span></div><div class="kpi red"><b>${r.totals.absent}</b><span>Absences</span></div></div>${statsTable(r.rows, true)}`;
      $$('#stOut tr.click').forEach(tr => tr.onclick = () => openStatsOf(tr.dataset.r));
    } catch (e) { $('#stOut').innerHTML = `<div class="msg err2"><span>${esc(errMsg(e))}</span></div>`; }
  };
  $('#stGo').onclick = run; $('#kSeg').onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { A.kind = b.dataset.k; $$('#kSeg button').forEach(x => x.classList.toggle('on', x === b)); } };
  run();
}
async function openStatsOf(id) {
  const t = today(), from = A.from || t.slice(0, 8) + '01', to = A.to || t;
  openModal('<div class="card center muted" style="box-shadow:none">Chargement…</div>');
  try {
    const r = await adm('stats', { from, to, emp: id }), x = r.rows[0];
    if (!x) return openModal('<p>Aucune donnée.</p><div class="modal-actions"><button class="btn" data-close type="button">Fermer</button></div>');
    const cls = d => d.kd === 'conge' ? 'lv' : (d.kd === 'ferie' || d.kd === 'repos' || d.kd === 'hors') ? 'off' : d.a ? (d.ab ? 'abs' : d.late ? 'late' : '') : (d.d < t ? 'abs' : '');
    const pad = ((new Date(from + 'T12:00:00Z').getUTCDay() + 6) % 7);
    openModal(`<button class="modal-x" data-close type="button" aria-label="Fermer">×</button><h2>${esc(x.n)}</h2><p class="muted">Du ${esc(shortDate(from))} au ${esc(shortDate(r.to))}</p>
      <div class="stats"><div class="stat"><b>${x.days}</b><span>Jours de présence</span></div><div class="stat ${x.late ? 'bad' : ''}"><b>${x.late}</b><span>Retards${x.late ? ' · ' + x.lateMin + ' min' : ''}</span></div>
      <div class="stat ${x.absent ? 'bad' : ''}"><b>${x.absent}</b><span>Absences</span></div><div class="stat"><b>${x.leave}</b><span>Jours de congé</span></div><div class="stat"><b>${x.holiday}</b><span>Jours fériés</span></div><div class="stat"><b>${fmtMin(x.min)}</b><span>Heures</span></div>
      <div class="stat ${x.forgot ? 'bad' : ''}"><b>${x.forgot}</b><span>Départs non pointés</span></div><div class="stat ${x.flagged ? 'bad' : ''}"><b>${x.flagged}</b><span>Hors zone</span></div>
      <div class="stat"><b>${x.tele || 0}</b><span>Jours en télétravail</span></div></div>
      <p style="margin:14px 0 0"><b>Présence</b> <span class="muted">${pct(x.presence)}</span></p><div class="bar"><i style="width:${x.presence || 0}%"></i></div>
      <p style="margin:10px 0 0"><b>Ponctualité</b> <span class="muted">${pct(x.punct)}</span></p><div class="bar"><i style="width:${x.punct || 0}%"></i></div>
      <div class="dayc">${DOW.map(d => `<div class="head">${d[0]}</div>`).join('')}${'<div class="head"></div>'.repeat(pad)}${x.daily.map(d => `<div class="${cls(d)}" title="${esc(shortDate(d.d))}">${+d.d.slice(8)}</div>`).join('')}</div>
      <div class="legend"><span><span class="dot"></span>Présent</span><span><span class="dot late"></span>Retard</span><span><span class="dot abs"></span>Absent</span><span><span class="dot lv"></span>Congé</span><span><span class="dot off"></span>Non travaillé / férié</span></div>
      <div class="modal-actions"><button class="btn line" id="stFiche" type="button">${IC.print} Fiche de présence</button><button class="btn" data-close type="button">Fermer</button></div>`);
    $('#stFiche').onclick = () => { closeModal(); printFiche(id, from, to); };
  } catch (e) { openModal(`<p class="err">${esc(errMsg(e))}</p><div class="modal-actions"><button class="btn" data-close type="button">Fermer</button></div>`); }
}
async function printFiche(id, from, to) {
  const t = today(); from ||= A.from || t.slice(0, 8) + '01'; to ||= A.to || t;
  try {
    const r = await adm('stats', { from, to, emp: id }), x = r.rows[0], e = (A.emps || []).find(z => z.id === id) || {}, it = e.intern || {};
    const rows = x.daily.filter(d => d.kd === 'travail' || d.a).map(d => `<tr><td>${esc(shortDate(d.d))}</td><td>${fmtH(d.a)}</td><td>${fmtH(d.dp)}${d.dDay ? ' (' + esc(shortDate(d.dDay)) + ')' : ''}</td><td>${d.a ? (d.late ? 'Retard ' + d.late + ' min' : 'Présent') : 'Absent'}${d.manual ? ' · saisi par Soned' : ''}</td><td></td></tr>`).join('');
    printHtml(`<div class="pdoc"><div style="display:flex;align-items:center;gap:10px"><img src="${LOGO}" style="height:36px" alt=""><div><h1>Fiche de présence — stagiaire</h1><div>Soned Afrique</div></div></div>
      <p style="margin-top:14px"><b>${esc(x.n)}</b>${it.school ? ' · ' + esc(it.school) : ''}${it.tutor ? '<br>Tuteur : ' + esc(it.tutor) : ''}${it.from ? '<br>Stage du ' + esc(shortDate(it.from)) + (it.to ? ' au ' + esc(shortDate(it.to)) : '') : ''}<br>Période : du ${esc(shortDate(from))} au ${esc(shortDate(r.to))}</p>
      <p>Jours de présence : <b>${x.days}</b> · Absences : <b>${x.absent}</b> · Retards : <b>${x.late}</b> · Heures : <b>${fmtMin(x.min)}</b></p>
      <table><tr><th>Date</th><th>Arrivée</th><th>Départ</th><th>Observation</th><th>Visa du tuteur</th></tr>${rows || '<tr><td colspan="5">Aucun jour.</td></tr>'}</table>
      <p style="margin-top:34px">Signature du tuteur : ______________________ &nbsp;&nbsp; Cachet de l’entreprise :</p><div class="pbr">Pointages enregistrés par Espace Soned Afrique · Développé par Mamadou Fall</div></div>`);
  } catch (e) { toast(errMsg(e), 'error'); }
}

/* ---------- MENSUEL ---------- */
let monthRows = [];
async function tMonth() {
  A.month ||= today().slice(0, 7);
  const out = async () => {
    const m = A.month; $('#moOut').innerHTML = '<div class="card center muted">Calcul…</div>';
    try {
      const r = await adm('month', { month: m, kind: A.kind }); monthRows = r.rows;
      $('#moOut').innerHTML = `<p class="muted">${r.partial ? 'Mois en cours : les chiffres s’arrêtent à aujourd’hui.' : ''}</p><div class="dash"><div class="kpi"><b>${pct(r.totals.presence)}</b><span>Présence</span></div><div class="kpi"><b>${pct(r.totals.punct)}</b><span>Ponctualité</span></div><div class="kpi amber"><b>${r.totals.late}</b><span>Retards</span></div><div class="kpi red"><b>${r.totals.absent}</b><span>Absences</span></div></div>${statsTable(r.rows, true)}`;
      $$('#moOut tr.click').forEach(tr => tr.onclick = () => { A.from = m + '-01'; A.to = r.to; openStatsOf(tr.dataset.r); });
    } catch (e) { $('#moOut').innerHTML = `<div class="msg err2"><span>${esc(errMsg(e))}</span></div>`; }
  };
  $('#aBody').innerHTML = `<div class="datebar"><button class="btn line sm" id="moP" type="button">‹</button><h2 id="moT">${esc(monthLabel(A.month))}</h2><button class="btn line sm" id="moN" type="button">›</button></div>
    <div class="toolbar">${kindSeg(A.kind)}</div>
    <div class="toolbar"><button class="btn line sm" id="moCsv" type="button">Télécharger (Excel)</button><button class="btn line sm" id="moPrint" type="button">${IC.print} Imprimer / PDF</button><button class="btn line sm" id="moMail" type="button">${IC.mail} Envoyer par e-mail</button></div><div id="moOut"></div>`;
  const shift = n => { const [y, mo] = A.month.split('-').map(Number), d = new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); if (d > today().slice(0, 7)) return; A.month = d; $('#moT').textContent = monthLabel(d); out(); };
  $('#moP').onclick = () => shift(-1); $('#moN').onclick = () => shift(1);
  $('#kSeg').onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { A.kind = b.dataset.k; $$('#kSeg button').forEach(x => x.classList.toggle('on', x === b)); out(); } };
  $('#moCsv').onclick = () => monthRows.length ? download('pointage-' + A.month + '.csv', statsCsv(monthRows)) : toast('Rien à télécharger.', 'error');
  $('#moPrint').onclick = () => monthRows.length ? printHtml(`<div class="pdoc"><div style="display:flex;align-items:center;gap:10px"><img src="${LOGO}" style="height:36px" alt=""><div><h1>Rapport mensuel — ${esc(monthLabel(A.month))}</h1><div>Soned Afrique</div></div></div>
    <table><tr><th>Nom</th><th>Présent</th><th>Retards</th><th>Absences</th><th>Congés</th><th>Heures</th><th>Sans départ</th><th>Présence</th><th>Télétravail</th></tr>${monthRows.map(r => `<tr><td><b>${esc(r.n)}</b><br><small>${esc(r.kd === 'stagiaire' ? 'Stagiaire' : r.r)}</small></td><td>${r.days}</td><td>${r.late}${r.late ? ' (' + r.lateMin + ' min)' : ''}</td><td>${r.absent}</td><td>${r.leave}</td><td>${fmtMin(r.min)}</td><td>${r.forgot}</td><td>${pct(r.presence)}</td><td>${r.tele || 0}</td></tr>`).join('')}</table>
    <p style="font-size:.75rem;color:#667;margin-top:10px">Absence : jour de travail sans pointage, hors jours fériés et congés.</p><div class="pbr">Développé par Mamadou Fall · Espace Soned Afrique</div></div>`) : toast('Rien à imprimer.', 'error');
  $('#moMail').onclick = () => confirmModal(`<h2>Envoyer le rapport de ${esc(monthLabel(A.month))} ?</h2><p class="muted">Il part par e-mail, en PDF, aux adresses saisies dans les Réglages.</p>`, 'Envoyer', async () => {
    try { const r = await adm('sendmonth', { month: A.month }); closeModal(); toast('Rapport envoyé à ' + r.to + ' adresse(s).'); } catch (e) { toast(errMsg(e), 'error'); }
  });
  out();
}

/* ---------- JOURNAL ---------- */
async function tJournal() {
  const j = await adm('journal', { limit: 200 });
  $('#aBody').innerHTML = `<div class="integrity ${j.intact ? '' : 'bad'}">${j.intact ? '✔ Intégrité vérifiée : le journal n’a jamais été modifié.' : '⚠ Intégrité compromise : le journal a été modifié à la ligne ' + j.brokenAt + '.'}</div>
    <p class="muted">Chaque action d’un gestionnaire est inscrite ici avec son nom. Personne ne peut modifier ni effacer ce journal depuis le site. (${j.total} action${j.total > 1 ? 's' : ''})</p>
    <div class="card">${j.entries.length ? j.entries.map(e => `<div class="jrow"><b>${esc(e.a)}</b> · ${esc(e.w)}<small>${esc(e.time)}</small>${esc(e.x)}</div>`).join('') : '<p class="muted">Aucune action pour le moment.</p>'}</div>`;
}

/* ---------- RÉGLAGES ---------- */
const PAUSE_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
async function tSet() {
  const s = await getSet(true), ed = isRH(), dis = ed ? '' : ' disabled';
  const m = s.mails || { rh: '', dev: '', info: '' };
  const hh = n => (n / 60).toString().replace('.', ',');
  $('#aBody').innerHTML = `${ed ? '' : '<div class="msg"><span>Seul le RH peut modifier les horaires et les adresses e-mail.</span></div>'}
    <div class="card"><h3>Horaires de pointage</h3><p class="muted">Valables pour toutes les personnes sans service. Modifiables à tout moment : le RH est informé de chaque changement.</p>
      <div class="row2"><label>Heure d’arrivée<input id="gS" type="time" value="${s.start}"${dis}></label><label>Tolérance (min)<input id="gT" type="number" min="0" max="120" value="${s.tol}"${dis}></label></div>
      <div class="row2"><label>Considéré absent dès<input id="gA" type="time" value="${s.absentFrom}"${dis}></label><label>Fin du pointage d’arrivée<input id="gC" type="time" value="${s.arrivalClose}"${dis}></label></div>
      <p class="muted" style="font-size:.85rem;margin:-4px 0 10px">Arrivée à partir de « considéré absent » : le pointage est gardé, la personne est comptée absente. Après la fin du pointage d’arrivée : plus de pointage, le RH est prévenu.</p>
      <div class="row2"><label>Clôture de la journée<input id="gD" type="time" value="${s.dayClose}"${dis}></label><label>Travail par jour (heures)<input id="gW" type="number" min="1" max="12" step="0.25" value="${hh(s.work).replace(',', '.')}"${dis}></label></div>
      <p class="muted" style="font-size:.85rem;margin:-4px 0 10px">À la clôture, un départ oublié est pointé automatiquement à cette heure (« départ automatique »). Départ le plus tôt = arrivée + travail + pause, sans dépasser la clôture.</p>
      <label>Jours de travail</label>${dayChips(s.days, 'gd')}
      <label>Congé annuel par employé (jours)<input id="gL" type="number" min="0" max="90" value="${s.leaveDays}"${dis}></label></div>
    <div class="card"><h3>Pauses</h3><p class="muted">La pause est retirée du temps de travail et ajoutée à l’heure de départ. Videz les deux heures pour un jour sans pause.</p>
      <div class="pauses">${PAUSE_DAYS.map((d, i) => `<div class="pz"><b>${d}</b><input type="time" id="pf${i}" value="${s.pauses[i] ? s.pauses[i][0] : ''}"${dis} aria-label="Début de pause ${d}"><span>→</span><input type="time" id="pt${i}" value="${s.pauses[i] ? s.pauses[i][1] : ''}"${dis} aria-label="Fin de pause ${d}"></div>`).join('')}</div></div>
    <div class="card"><h3>${IC.mail} Adresses e-mail</h3><p class="muted">Ces 3 personnes reçoivent les alertes, les points de 10h et de 19h et le rapport de 8h. Ce sont aussi les adresses proposées aux employés avec le bouton enveloppe.</p>
      <label>RH<input id="mRh" type="email" value="${esc(m.rh)}" placeholder="rh@soned-afrique.org"${dis}></label>
      <label>Développeur (Mamadou Fall)<input id="mDev" type="email" value="${esc(m.dev)}" placeholder="adresse du développeur"${dis}></label>
      <label>Informaticien<input id="mInfo" type="email" value="${esc(m.info)}" placeholder="adresse de l’informaticien"${dis}></label>
      <label class="sw"><input id="gAl" type="checkbox" ${s.alerts !== false ? 'checked' : ''}${dis}> Envoyer les alertes par e-mail (retard, absent, hors zone, lieu inconnu, blocage)</label></div>
    <p class="err" id="gErr" role="alert"></p>${ed ? '<button class="btn wide" id="gOk" type="button">Enregistrer les réglages</button>' : ''}
    <div class="card" style="margin-top:14px"><h3>À propos</h3><p class="muted">Espace Soned Afrique · site ${CONFIG.version} · script ${esc(ME_ADM && ME_ADM.version || '?')}<br>Développé par Mamadou Fall, étudiant en programmation, sous l’encadrement de M. Djiby, responsable informatique.</p></div>`;
  if (!ed) return;
  $('#gOk').onclick = async () => {
    try {
      const pauses = PAUSE_DAYS.map((d, i) => ($(`#pf${i}`).value && $(`#pt${i}`).value ? [$(`#pf${i}`).value, $(`#pt${i}`).value] : null));
      const r = await adm('save', { settings: { start: $('#gS').value, tol: $('#gT').value, absentFrom: $('#gA').value, arrivalClose: $('#gC').value, dayClose: $('#gD').value, work: Math.round(Number($('#gW').value) * 60), leaveDays: $('#gL').value, days: pickDays('gd'), pauses, mails: { rh: $('#mRh').value.trim(), dev: $('#mDev').value.trim(), info: $('#mInfo').value.trim() } } });
      A.set = r.settings; S.contact = r.settings.contact; await adm('alertset', { on: $('#gAl').checked }); $('#gErr').textContent = ''; toast('Réglages enregistrés.');
    } catch (e) { errIn('#gErr', e); }
  };
}
function showCode(name, code, msg) {
  openModal(`<h2>Code de ${esc(name)}</h2><p>${esc(msg || 'Transmettez ce code provisoire à la personne, en main propre. À sa première connexion, elle choisira son propre code.')}</p>
    <div class="card center" style="background:var(--g50);box-shadow:none"><div style="font-size:2.2rem;font-weight:800;letter-spacing:.12em;color:var(--g800)">${esc(code)}</div></div>
    <p class="muted" style="font-size:.85rem">Ce code ne sera plus affiché ensuite.</p><div class="modal-actions"><button class="btn" data-close type="button">J’ai noté le code</button></div>`);
  if (atab === 'set' || atab === 'people') goTab(atab);
}

/* ---------- GESTIONNAIRES (dans « Personnes ») ---------- */
async function tAdmins() {
  const ad = await adm('admins'), blk = await blockedCard(), rh = isRH();
  const rolesInfo = `<div class="roles"><div><b>RH</b><span>Tout : horaires, congés, fériés, pointage manuel, gestionnaires.</span></div><div><b>Informaticien</b><span>Ajoute les personnes, débloque les accès, imprime les badges. Ne pointe personne à la main et ne modifie ni horaires, ni congés, ni fériés.</span></div><div><b>Gestionnaire</b><span>Consulte les pointages et écrit des notes. Ne modifie rien d’autre.</span></div></div>`;
  $('#aBody').innerHTML = `${peopleSeg('gest')}${blk}
    <div class="card"><h3>Gestionnaires</h3><p class="muted">Chacun a son nom, son rôle et son code personnel : le journal indique qui a fait quoi. Après 5 codes faux, l’appareil est bloqué jusqu’à ce que le RH ou l’informaticien le débloque.</p>${rolesInfo}
      <div class="rows">${ad.list.map(a => `<div class="rowc" style="flex-wrap:wrap">${avatar(a.name)}<div class="nm" style="flex:1;min-width:150px"><b>${esc(a.name)}${a.me ? ' (vous)' : ''}</b><small>${a.tmp ? 'Code provisoire, pas encore changé' : 'Code personnel actif'}</small><div>${tag(a.roleName || ROLE_NAMES[a.role] || 'RH', a.role === 'rh' ? '' : a.role === 'info' ? 'blue2' : 'gray')}</div></div>${a.me || !rh ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap;width:100%;margin-top:4px"><button class="btn line sm" data-rn="${esc(a.id)}" data-n="${esc(a.name)}" type="button">Modifier le nom</button><button class="btn line sm" data-ro="${esc(a.id)}" data-r="${esc(a.role)}" type="button">Rôle</button><button class="btn line sm" data-rs="${esc(a.id)}" type="button">Nouveau code</button><button class="btn danger sm" data-rm="${esc(a.id)}" data-n="${esc(a.name)}" type="button">Retirer</button></div>`}</div>`).join('')}</div>
      <div class="modal-actions" style="justify-content:flex-start">${rh ? `<button class="btn sm" id="gAdd" type="button">${IC.plus} Ajouter un gestionnaire</button>` : ''}<button class="btn line sm" id="gMy" type="button">Mon nom et mon code</button></div></div>`;
  bindPSeg(); bindBlocked();
  $('#aBody').onclick = e => {
    const rs = e.target.closest('[data-rs]'), rm = e.target.closest('[data-rm]'), rn = e.target.closest('[data-rn]'), ro = e.target.closest('[data-ro]');
    if (ro) {
      openModal(`<h2>Rôle</h2><label>Rôle<select id="roS">${optList(Object.entries(ROLE_NAMES), ro.dataset.r)}</select></label><p class="err" id="roErr" role="alert"></p><div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="roOk" type="button">Enregistrer</button></div>`);
      $('#roOk').onclick = async () => { try { await adm('setrole', { id: ro.dataset.ro, role: $('#roS').value }); closeModal(); toast('Rôle modifié.'); goTab('people'); } catch (x) { errIn('#roErr', x); } };
    }
    if (rs) confirmModal('<h2>Nouveau code ?</h2><p>Un nouveau code provisoire sera créé. Transmettez-le à la personne : elle choisira ensuite le sien.</p>', 'Créer le code', async () => {
      try { const r = await adm('resetadmin', { id: rs.dataset.rs }); showCode(r.name, r.code); } catch (x) { toast(errMsg(x), 'error'); }
    });
    if (rm) confirmModal(`<h2>Retirer ${esc(rm.dataset.n)} ?</h2><p>Cette personne n’aura plus accès à l’espace RH.</p>`, 'Retirer', async () => {
      try { await adm('rmadmin', { id: rm.dataset.rm }); closeModal(); toast('Gestionnaire retiré.'); goTab('people'); } catch (x) { toast(errMsg(x), 'error'); }
    }, 'danger');
    if (rn) {
      openModal(`<h2>Modifier le nom</h2><label>Nom<input id="rnN" maxlength="40" value="${esc(rn.dataset.n)}"></label><p class="err" id="rnErr" role="alert"></p>
        <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="rnOk" type="button">Enregistrer</button></div>`);
      $('#rnOk').onclick = async () => { try { await adm('renameadmin', { id: rn.dataset.rn, name: $('#rnN').value }); closeModal(); toast('Nom modifié.'); goTab('people'); } catch (x) { errIn('#rnErr', x); } };
    }
  };
  $('#gAdd').onclick = () => {
    openModal(`<h2>Ajouter un gestionnaire</h2><label>Nom<input id="nmA" maxlength="40" placeholder="Ex : Fatou Sow"></label><label>Rôle<select id="nmR">${optList(Object.entries(ROLE_NAMES), 'info')}</select></label><p class="err" id="nmErr" role="alert"></p>
      <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="nmOk" type="button">Créer</button></div>`);
    $('#nmOk').onclick = async () => { try { const r = await adm('addadmin', { name: $('#nmA').value, role: $('#nmR').value }); showCode(r.name, r.code); } catch (x) { errIn('#nmErr', x); } };
  };
  $('#gMy').onclick = () => {
    openModal(`<h2>Mon nom et mon code</h2><label>Mon nom<input id="mcN" maxlength="40" value="${esc(ME_ADM && ME_ADM.name || '')}" placeholder="Ex : Awa Diop"></label><label>Nouveau code (6 à 20 lettres ou chiffres)<input id="mcA" type="password" autocomplete="off"></label><label>Confirmez<input id="mcB" type="password" autocomplete="off"></label><p class="err" id="mcErr" role="alert"></p>
      <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="mcOk" type="button">Enregistrer</button></div>`);
    $('#mcOk').onclick = async () => {
      const a = $('#mcA').value.trim(), b = $('#mcB').value.trim(); if (a !== b) return void ($('#mcErr').textContent = 'Les deux codes ne sont pas identiques.');
      try { const r = await adm('chcode', { newCode: a, name: $('#mcN').value }); admCode = a; store.set(ADM_KEY, a, sessionStorage); closeModal(); toast('Code changé.'); adminShow(); } catch (x) { errIn('#mcErr', x); }
    };
  };
}

/* ---------- ALERTES (cloche) ---------- */
async function tAlerts() {
  const r = await adm('events', { limit: 100 });
  const canNotif = 'Notification' in window, perm = canNotif ? Notification.permission : 'denied';
  $('#aBody').innerHTML = `<div class="card"><h3>Alertes</h3><p class="muted">Tout ce qui se passe, dans l’ordre : retards, absents, arrivées trop tardives, lieux de télétravail inconnus, hors zone, accès bloqués, départs automatiques, messages, changements d’horaires et de congés. Les plus importantes partent aussi par e-mail.</p>
    ${canNotif && perm !== 'granted' && perm !== 'denied' ? '<button class="btn sm" id="nfOn" type="button">Activer les notifications sur cet appareil</button>' : perm === 'granted' ? '<p class="muted" style="margin:0;font-size:.88rem">✔ Notifications activées sur cet appareil.</p>' : ''}</div>
    <div class="rows">${r.list.length ? r.list.map(e => `<div class="rowc evt ${e.l}${e.nw ? ' nw' : ''}"><span class="evd"></span><div class="nm"><b>${esc(e.x)}</b><small>${esc(e.time)}</small></div></div>`).join('') : '<div class="card center muted">Aucune alerte pour le moment.</div>'}</div>`;
  if ($('#nfOn')) $('#nfOn').onclick = async () => { try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notifications activées.' : 'Notifications refusées.'); goTab('alerts'); } catch {} };
  try { await adm('seen'); lastUnread = 0; setBell(0); } catch {}
}

/* ---------- MESSAGES : discussions avec les employés + notes du service ---------- */
let MK = 'disc';
async function tMsg() {
  const seg = `<div class="seg full" id="msgSeg">${[['disc', 'Discussions'], ['notes', 'Notes du service']].map(([v, l]) => `<button type="button" data-mk="${v}" class="${v === MK ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const bind = () => ($('#msgSeg').onclick = e => { const b = e.target.closest('button[data-mk]'); if (b && b.dataset.mk !== MK) { MK = b.dataset.mk; goTab('msg'); } });
  if (MK === 'notes') {
    const r = await adm('annlist');
    $('#aBody').innerHTML = `${seg}<div class="card"><h3>Écrire une note</h3><p class="muted">Prévention, justificatif, information : tous les gestionnaires peuvent écrire. Les employés la voient dans leur profil.</p>
      <label>Catégorie<select id="anC">${optList(['Prévention', 'Justificatif', 'Information'].map(x => [x, x]))}</select></label>
      <label>Votre note<textarea id="anT" rows="3" maxlength="600" placeholder="Ex : Rappel : badge visible à l’entrée, signalez toute perte."></textarea></label><p class="err" id="anErr" role="alert"></p>
      <button class="btn sm" id="anOk" type="button">Publier</button></div>
      <div class="rows">${r.list.length ? r.list.map(a => `<div class="card ann ${a.c === 'Prévention' ? 'prev' : ''}" style="margin-bottom:10px"><b>${esc(a.c)}</b><p>${esc(a.x)}</p><small>${esc(a.by)} (${esc(a.role)}) · ${esc(a.time)}</small>${a.mine || isRH() ? ` <button class="link" data-ad="${esc(a.i)}" type="button">Supprimer</button>` : ''}</div>`).join('') : '<div class="card center muted">Aucune note.</div>'}</div>`;
    bind();
    $('#anOk').onclick = async () => { try { await adm('annpost', { cat: $('#anC').value, txt: $('#anT').value }); toast('Note publiée.'); goTab('msg'); } catch (e) { errIn('#anErr', e); } };
    $$('#aBody [data-ad]').forEach(b => (b.onclick = async () => { try { await adm('anndel', { id: b.dataset.ad }); toast('Note supprimée.'); goTab('msg'); } catch (e) { toast(errMsg(e), 'error'); } }));
    return;
  }
  const r = await adm('threads');
  $('#aBody').innerHTML = `${seg}<p class="muted">Les messages des employés (problème, oubli, justificatif). Pour écrire en premier à quelqu’un, ouvrez sa fiche dans « Personnes ».</p>
    <div class="rows">${r.list.length ? r.list.map(x => `<button class="rowc click ${x.unread ? 'unr' : ''}" type="button" data-th="${esc(x.e)}">${avatar(x.n)}<div class="nm"><b>${esc(x.n)}</b><small>${x.from === 'e' ? '' : 'Vous : '}${esc(x.last)}</small><div>${x.unread ? tag('Nouveau', 'red') : ''}${x.just ? tag('Justificatif', 'amber') : ''}</div></div><small>${esc(x.time)}</small></button>`).join('') : '<div class="card center muted">Aucune discussion pour le moment.</div>'}</div>`;
  bind(); $$('#aBody [data-th]').forEach(b => (b.onclick = () => openThread(b.dataset.th)));
}
async function openThread(emp) {
  let r; try { r = await adm('thread', { emp }); } catch (e) { return toast(errMsg(e), 'error'); }
  const can = R() !== 'autre';
  openModal(`<button class="modal-x" data-close type="button" aria-label="Fermer">×</button><h2>${esc(r.n)}</h2>
    <div class="chat" id="thBox">${r.list.length ? r.list.map(m => `<div class="bub ${m.f === 'e' ? 'rh' : 'me'}"><small>${esc(m.f === 'e' ? m.by : m.by)} · ${esc(m.time)}${m.j ? ' · justificatif du ' + esc(shortDate(m.j)) : ''}</small>${esc(m.x)}</div>`).join('') : '<p class="muted" style="margin:0">Aucun message. Écrivez le premier.</p>'}</div>
    ${can ? '<label>Votre réponse<textarea id="thT" rows="3" maxlength="600"></textarea></label><p class="err" id="thErr" role="alert"></p><div class="modal-actions"><button class="btn" id="thOk" type="button">Envoyer</button></div>' : '<p class="muted">Votre rôle permet de lire seulement.</p>'}`);
  const box = $('#thBox'); box.scrollTop = box.scrollHeight;
  if (can) $('#thOk').onclick = async () => { try { await adm('reply', { emp, txt: $('#thT').value }); toast('Message envoyé.'); closeModal(); if (atab === 'msg') goTab('msg'); } catch (e) { errIn('#thErr', e); } };
}


/* =====================================================================
   V10 — Appareils, télétravail, QR de l'entrée, mon pointage, import
   ===================================================================== */
IC.file = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 17v-6M9.5 13.5 12 11l2.5 2.5"/></svg>';

/* ---------- Appareils : 2 téléphones validés par employé ---------- */
async function tDevices() {
  const d = await adm('devices'), rows = d.rows;
  const pendAll = rows.reduce((n, r) => n + r.pend.length, 0), single = rows.filter(r => !r.devs.length && r.pend.length === 1).length;
  $('#aBody').innerHTML = `<div class="card"><h3>Appareils de pointage</h3>
    <p class="muted">Chaque téléphone a une clé unique, gardée dans l’application. Vous validez jusqu’à <b>${d.max} téléphones</b> par employé. Un pointage fait avec un téléphone validé reçoit la <b>coche bleue</b> ${VERIFIED}. Avec un autre téléphone, le pointage est <b>accepté quand même</b> (la personne n’est pas déclarée absente) : il est seulement signalé « appareil non reconnu » pour que vous puissiez vérifier.</p>
    <div class="dash"><div class="kpi blue"><b>${rows.length - d.noDev}</b><span>Avec un téléphone validé</span></div><div class="kpi amber"><b>${pendAll}</b><span>À valider</span></div><div class="kpi red"><b>${d.noDev}</b><span>Sans téléphone validé</span></div></div>
    ${single ? `<button class="btn wide" id="dvAll" type="button">Valider ${single} téléphone${single > 1 ? 's' : ''} en attente (un seul par personne)</button><p class="muted" style="font-size:.85rem;margin:8px 0 0">À utiliser au lancement : si chaque personne a pointé une fois depuis son propre téléphone.</p>` : ''}</div>
    <div class="toolbar"><input id="dvQ" type="search" placeholder="Chercher un nom…" style="min-width:100%"></div><div class="rows" id="dvList"></div>`;
  const chip = (x, pend, id) => `<div class="dvchip ${pend ? 'pend' : ''}"><div>${pend ? '<span class="tag amber">À valider</span>' : VERIFIED}<b>${esc(x.n || 'Téléphone')}</b><small>n° ${esc(x.ref)} · ${pend ? 'vu le ' : 'validé le '}${esc(x.time)}</small></div>
      <div class="dvbtn">${pend ? `<button class="btn sm" type="button" data-ok="${esc(id)}|${esc(x.k)}">Valider</button><button class="btn line sm" type="button" data-no="${esc(id)}|${esc(x.k)}|pend">Refuser</button>` : `<button class="btn line sm" type="button" data-no="${esc(id)}|${esc(x.k)}|devs">Retirer</button>`}</div></div>`;
  const draw = () => {
    const q = norm($('#dvQ').value);
    const l = rows.filter(r => norm(r.name).includes(q));
    $('#dvList').innerHTML = l.length ? l.map(r => `<div class="card dvrow"><div class="person" style="margin:0 0 8px">${avatar(r.name)}<div><b>${esc(r.name)}</b><br><small>${esc(r.role || '')}</small></div></div>
      ${r.devs.map(x => chip(x, false, r.id)).join('')}${r.pend.map(x => chip(x, true, r.id)).join('')}${!r.devs.length && !r.pend.length ? '<p class="muted" style="margin:0;font-size:.9rem">Aucun téléphone connu : la personne n’a pas encore pointé.</p>' : ''}</div>`).join('') : '<div class="card center muted">Aucun résultat.</div>';
  };
  draw(); $('#dvQ').oninput = draw;
  const act = async (op, x) => { try { await adm(op, x); toast(op === 'devok' ? 'Téléphone validé.' : 'Fait.'); goTab('dev'); } catch (e) { toast(errMsg(e), 'error'); } };
  $('#dvList').onclick = e => {
    const ok = e.target.closest('[data-ok]'), no = e.target.closest('[data-no]');
    if (ok) { const [emp, k] = ok.dataset.ok.split('|'); act('devok', { emp, k }); }
    if (no) { const [emp, k, list] = no.dataset.no.split('|'); act('devrm', { emp, k, list }); }
  };
  if ($('#dvAll')) $('#dvAll').onclick = () => confirmModal(`<h2>Valider ${single} téléphone${single > 1 ? 's' : ''} ?</h2><p class="muted">Chaque personne concernée n’a pointé que depuis un seul téléphone : il sera validé comme son téléphone de pointage.</p>`, 'Valider', async () => { try { const r = await adm('devall'); closeModal(); toast(r.n + ' téléphone(s) validé(s).'); goTab('dev'); } catch (e) { toast(errMsg(e), 'error'); } });
}

/* ---------- Télétravail : autorisations et lieux ---------- */
async function tTele() {
  const d = await adm('teleview'), rows = d.rows, ok = rows.filter(r => r.tele).length;
  $('#aBody').innerHTML = `<div class="card"><h3>Télétravail</h3>
    <p class="muted">Chaque personne en télétravail enregistre jusqu’à <b>${d.max} lieux</b> depuis le site (Profil → Mes lieux de télétravail). Un pointage de télétravail depuis un lieu non enregistré est <b>signalé</b> dans l’espace RH. Ici vous voyez tous les lieux, vous les retirez si besoin et vous autorisez ou non le télétravail.</p>
    <div class="dash"><div class="kpi blue"><b>${ok}</b><span>Télétravail autorisé</span></div><div class="kpi"><b>${rows.filter(r => r.places.length).length}</b><span>Avec au moins un lieu</span></div><div class="kpi amber"><b>${rows.filter(r => r.tele && !r.places.length).length}</b><span>Autorisés sans lieu</span></div></div></div>
    <div class="toolbar"><input id="tlQ" type="search" placeholder="Chercher un nom…" style="min-width:100%"></div><div class="rows" id="tlList"></div>`;
  const draw = () => {
    const q = norm($('#tlQ').value), l = rows.filter(r => norm(r.name).includes(q));
    $('#tlList').innerHTML = l.length ? l.map(r => `<div class="card dvrow"><div class="person" style="margin:0 0 8px">${avatar(r.name)}<div><b>${esc(r.name)}</b><br><small>${esc(r.role || '')}</small></div>
      ${isRH() ? `<button class="btn ${r.tele ? 'line' : ''} sm" type="button" style="margin-left:auto" data-t="${esc(r.id)}|${r.tele ? 0 : 1}">${r.tele ? 'Télétravail : oui' : 'Télétravail : non'}</button>` : `<span class="tag ${r.tele ? 'blue2' : 'gray'}" style="margin-left:auto">${r.tele ? 'Autorisé' : 'Non autorisé'}</span>`}</div>
      ${r.places.length ? r.places.map(p => `<div class="dvchip"><div><span class="ico">${IC.pin}</span><b>${esc(p.n)}</b><small><a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener noreferrer">Voir sur Google Maps</a></small></div>${isRH() ? `<div class="dvbtn"><button class="btn line sm" type="button" data-rp="${esc(r.id)}|${esc(p.id)}">Retirer</button></div>` : ''}</div>`).join('') : '<p class="muted" style="margin:0;font-size:.9rem">Aucun lieu enregistré.</p>'}</div>`).join('') : '<div class="card center muted">Aucun résultat.</div>';
  };
  draw(); $('#tlQ').oninput = draw;
  $('#tlList').onclick = async e => {
    const t = e.target.closest('[data-t]'), rp = e.target.closest('[data-rp]');
    try {
      if (t) { const [emp, v] = t.dataset.t.split('|'); await adm('update', { emp, tele: v === '1' }); A.emps = null; toast('Mis à jour.'); goTab('tele'); }
      if (rp) { const [emp, pid] = rp.dataset.rp.split('|'); await adm('rmplace', { emp, pid }); toast('Lieu retiré.'); goTab('tele'); }
    } catch (x) { toast(errMsg(x), 'error'); }
  };
}

/* ---------- QR de l'entrée et mode de pointage ---------- */
const MODES = [['both', 'Carte personnelle et QR de l’entrée', 'Chacun peut pointer avec sa carte ou en choisissant son nom au bureau. Recommandé.'], ['door', 'QR de l’entrée seulement', 'Un seul QR affiché à l’entrée : chacun choisit son nom dans la liste.'], ['badge', 'Carte personnelle seulement', 'Chacun scanne sa propre carte (badge QR).']];
function posterHtml(url) {
  return `<div class="poster"><div class="pst-top"><img src="${LOGO}" alt=""><b>Soned Afrique</b></div>
    <h1>Pointez votre présence</h1><p class="pst-sub">Scannez ce QR code avec l’appareil photo de votre téléphone</p>
    <div class="pst-qr">${qrSvg(url, 420)}</div>
    <ol class="pst-steps"><li><b>1</b><span>Scannez le QR code</span></li><li><b>2</b><span>Touchez votre nom dans la liste</span></li><li><b>3</b><span>Entrez votre code à 4 chiffres et pointez</span></li></ol>
    <p class="pst-note">Votre position est vérifiée : vous devez être au bureau.<br>En télétravail ? Ouvrez le site et touchez « Je travaille à distance ».</p>
    <div class="pst-foot">Espace Soned Afrique · Développé par Mamadou Fall</div></div>`;
}
async function tDoor() {
  const d = await adm('doorget'), url = doorUrl(d.door);
  const desc = MODES.find(m => m[0] === d.mode);
  $('#aBody').innerHTML = `<div class="card"><h3>Comment pointe-t-on au bureau ?</h3>
    <div class="modes">${MODES.map(([v, l, t]) => `<button type="button" class="mode ${v === d.mode ? 'on' : ''}" data-mode="${v}"${isRH() ? '' : ' disabled'}><b>${esc(l)}</b><small>${esc(t)}</small></button>`).join('')}</div>
    ${isRH() ? '' : '<p class="muted" style="font-size:.85rem">Seul le RH peut changer le mode.</p>'}</div>
    <div class="card center"><h3>QR code de l’entrée</h3>
      <p class="muted">À afficher à l’entrée du bureau (imprimé ou sur un écran). Le jeton du QR n’est connu que des personnes qui le scannent : la liste des noms n’est pas visible sans lui.</p>
      <div class="doorqr">${qrSvg(url, 260)}</div>
      <p class="muted" style="font-size:.78rem;word-break:break-all;margin:6px 0 12px">${esc(url)}</p>
      <div class="modal-actions" style="justify-content:center"><button class="btn" id="dPrint" type="button">${IC.print} Imprimer l’affiche</button><button class="btn line" type="button" data-copy="${esc(url)}">Copier le lien</button>${isRH() ? '<button class="btn danger sm" id="dNew" type="button">Nouveau QR</button>' : ''}</div>
      ${d.mode === 'badge' ? '<p class="err" style="margin-top:12px">Le mode « carte personnelle seulement » est actif : ce QR ne fonctionne pas pour l’instant.</p>' : ''}</div>
    <div class="card"><h3>Ce qui protège ce pointage</h3><ul class="plain"><li><b>Votre position</b> : un pointage hors du site est accepté mais signalé en rouge.</li><li><b>Le code à 4 chiffres</b> de chaque personne : personne ne peut pointer à la place d’un collègue.</li><li><b>L’appareil</b> : la coche bleue montre que le pointage vient d’un téléphone validé.</li><li><b>Le QR change quand vous le décidez</b> : « Nouveau QR » annule l’ancien (si la photo du QR circule, par exemple).</li></ul></div>`;
  $$('#aBody [data-mode]').forEach(b => (b.onclick = async () => { if (b.dataset.mode === d.mode) return; try { await adm('modeset', { mode: b.dataset.mode }); toast('Mode enregistré.'); goTab('door'); } catch (e) { toast(errMsg(e), 'error'); } }));
  $('#dPrint').onclick = () => printHtml(posterHtml(url), 'print-poster');
  if ($('#dNew')) $('#dNew').onclick = () => confirmModal('<h2>Créer un nouveau QR ?</h2><p>L’ancien QR de l’entrée ne fonctionnera plus. Il faudra imprimer et afficher le nouveau. Les téléphones qui avaient l’ancien devront le scanner à nouveau.</p>', 'Créer le nouveau QR', async () => { try { await adm('newdoor'); closeModal(); toast('Nouveau QR créé. Imprimez-le.'); goTab('door'); } catch (e) { toast(errMsg(e), 'error'); } }, 'danger');
}

/* ---------- Mon pointage (RH, informaticien, gestionnaire) ---------- */
let selfMode = 'bureau';
async function tMe() {
  const d = await adm('selfget');
  if (!d.has) {
    $('#aBody').innerHTML = `<div class="card"><div class="person">${avatar(d.name || 'Gestionnaire', 'big')}<div><h2>Votre fiche de pointage</h2><small>Les RH et l’informaticien pointent aussi.</small></div></div>
      <p class="muted">Indiquez votre poste et, si vous voulez, votre photo. Vous pourrez ensuite pointer ici, comme tout le monde. Vous ne pouvez pointer que pour vous-même.</p>
      <label>Votre poste<input id="smRole" maxlength="60" placeholder="Ex : Responsable RH"></label>
      <div class="modal-actions" style="justify-content:flex-start"><button class="btn line sm" id="smPh" type="button">Ajouter ma photo</button><span class="muted" id="smPhN"></span></div><input type="file" id="smFile" accept="image/*" hidden>
      <p class="err" id="smErr" role="alert"></p><button class="btn wide" id="smOk" type="button">Enregistrer ma fiche</button></div>`;
    let img = null;
    $('#smPh').onclick = () => $('#smFile').click();
    $('#smFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { img = await squarePhoto(f); $('#smPhN').textContent = 'Photo prête ✔'; } catch { $('#smPhN').textContent = 'Photo non utilisable.'; } };
    $('#smOk').onclick = async () => { const role = $('#smRole').value.trim(); if (role.length < 2) return void ($('#smErr').textContent = 'Indiquez votre poste.'); $('#smOk').disabled = true; try { await adm('selfsave', { role, img }); A.emps = null; goTab('me'); } catch (e) { errIn('#smErr', e); $('#smOk').disabled = false; } };
    return;
  }
  const p = d.profile, canT = p.tele;
  if (!canT) selfMode = 'bureau';
  $('#aBody').innerHTML = `<div class="card center"><div class="person" style="justify-content:center">${avatar(d.name, 'xl', d.photo)}</div><h2 style="margin:8px 0 0">${esc(d.name)}</h2><p class="muted" style="margin:2px 0 10px">${esc(p.role)}</p>
      <p>${p.inside ? '<span class="tag">Présent</span>' : '<span class="tag gray">Absent pour le moment</span>'}${p.last ? ` <span class="muted" style="font-size:.88rem">Dernier pointage : ${fmtH(p.last.time)}${p.last.day !== today() ? ' (' + esc(shortDate(p.last.day)) + ')' : ''}</span>` : ''}</p>
      <div class="seg full" id="smSeg"><button type="button" data-w="bureau" class="${selfMode === 'bureau' ? 'on' : ''}">Au bureau</button><button type="button" data-w="tele" class="${selfMode === 'tele' ? 'on' : ''}">En télétravail</button></div>
      <p class="muted" style="font-size:.88rem;margin:0 0 12px">${selfMode === 'bureau' ? 'Votre position est vérifiée : vous devez être sur le site.' : 'Votre position doit correspondre à l’un de vos lieux de télétravail.'}</p>
      <button class="btn wide ${p.inside ? 'danger' : ''}" id="smGo" type="button">${p.inside ? 'Pointer mon départ' : 'Pointer mon arrivée'}</button>
      <p class="err" id="smErr" role="alert"></p></div>
    <div class="card"><h3>Mes lieux de télétravail</h3><p class="muted">Jusqu’à 4 lieux. Enregistrez l’endroit depuis lequel vous travaillez, en y étant.</p>
      <div class="rows">${p.places.length ? p.places.map(x => `<div class="rowc"><span class="ico">${IC.pin}</span><div class="nm"><b>${esc(x.n)}</b></div><button class="btn line sm" type="button" data-rp="${esc(x.id)}">Retirer</button></div>`).join('') : '<p class="muted" style="margin:0">Aucun lieu enregistré.</p>'}</div>
      ${p.places.length < 4 ? `<button class="btn sm" id="smAdd" type="button" style="margin-top:12px">${IC.plus} Ajouter l’endroit où je suis (${p.places.length}/4)</button>` : ''}</div>
    <div class="card"><h3>Ma fiche</h3><p class="muted">Poste : ${esc(p.role)}</p><div class="modal-actions" style="justify-content:flex-start"><button class="btn line sm" id="smEdit" type="button">Modifier mon poste ou ma photo</button></div></div>`;
  $('#smSeg').onclick = e => { const b = e.target.closest('button[data-w]'); if (b) { selfMode = b.dataset.w; goTab('me'); } };
  $('#smGo').onclick = async () => {
    const b = $('#smGo'); b.disabled = true; $('#smErr').textContent = selfMode === 'bureau' ? 'Vérification de votre position…' : 'Vérification de votre lieu…';
    let pos = {};
    try { const g = await getPosition(); pos = { lat: g.coords.latitude, lng: g.coords.longitude, acc: Math.round(g.coords.accuracy) }; } catch {}
    try {
      const r = await adm('selfpunch', { id: uid(), mode: selfMode, dn: deviceName(), ...pos });
      const bad = selfMode === 'tele' ? r.status !== 'Télétravail' : r.status !== 'Sur place';
      openModal(`<div class="center"><div class="tick" style="margin:0 auto 8px">${IC.check}</div><h2>${r.type === 'Arrivée' ? 'Arrivée enregistrée' : 'Départ enregistré'}</h2><div class="big" style="font-size:2.4rem;font-weight:800">${fmtH(r.time)}</div>
        <p class="${bad ? 'err' : 'muted'}">${esc(r.status)}${bad ? ' — signalé' : ''}</p>${r.late > 0 ? `<p class="late">Retard : ${r.late} min</p>` : ''}</div><div class="modal-actions"><button class="btn" data-close type="button">Terminé</button></div>`);
      goTab('me');
    } catch (e) { $('#smErr').textContent = errMsg(e); b.disabled = false; }
  };
  if ($('#smAdd')) $('#smAdd').onclick = () => {
    openModal(`<h2>Ajouter un lieu de télétravail</h2><p class="muted">Placez-vous à l’endroit où vous travaillez, puis donnez-lui un nom.</p><label>Nom du lieu<input id="plN" maxlength="30" placeholder="Ex : Maison"></label><p class="err" id="plErr" role="alert"></p>
      <div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="plOk" type="button">${IC.pin} Enregistrer ici</button></div>`);
    $('#plOk').onclick = async () => {
      const n = $('#plN').value.trim(); if (n.length < 2) return void ($('#plErr').textContent = 'Donnez un nom au lieu.');
      $('#plOk').disabled = true; $('#plErr').textContent = 'Recherche de votre position…';
      try { const g = await getPosition(), c = g.coords; await adm('selfplace', { n, lat: c.latitude, lng: c.longitude, acc: Math.round(c.accuracy) }); closeModal(); toast('Lieu enregistré.'); goTab('me'); }
      catch (e) { $('#plErr').textContent = e && e.code === 1 ? 'Localisation refusée : autorisez-la dans votre navigateur.' : (errMsg(e) || 'Position introuvable. Activez le GPS et réessayez.'); $('#plOk').disabled = false; }
    };
  };
  $$('#aBody [data-rp]').forEach(b => (b.onclick = async () => { try { await adm('selfrmplace', { pid: b.dataset.rp }); goTab('me'); } catch (e) { toast(errMsg(e), 'error'); } }));
  $('#smEdit').onclick = () => {
    openModal(`<h2>Ma fiche</h2><label>Votre poste<input id="smRole" maxlength="60" value="${esc(p.role)}"></label><div class="modal-actions" style="justify-content:flex-start"><button class="btn line sm" id="smPh" type="button">Changer ma photo</button><span class="muted" id="smPhN"></span></div><input type="file" id="smFile" accept="image/*" hidden>
      <p class="err" id="smErr2" role="alert"></p><div class="modal-actions"><button class="btn line" data-close type="button">Annuler</button><button class="btn" id="smOk" type="button">Enregistrer</button></div>`);
    let img = null;
    $('#smPh').onclick = () => $('#smFile').click();
    $('#smFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { img = await squarePhoto(f); $('#smPhN').textContent = 'Photo prête ✔'; } catch { $('#smPhN').textContent = 'Photo non utilisable.'; } };
    $('#smOk').onclick = async () => { const role = $('#smRole').value.trim(); if (role.length < 2) return void ($('#smErr2').textContent = 'Indiquez votre poste.'); $('#smOk').disabled = true; try { await adm('selfsave', { role, img }); A.emps = null; closeModal(); goTab('me'); } catch (e) { errIn('#smErr2', e); $('#smOk').disabled = false; } };
  };
}

/* ---------- Import de la liste des employés (Excel, CSV, PDF texte) ---------- */
const loadedLibs = {};
function loadScript(src) {
  if (!loadedLibs[src]) loadedLibs[src] = new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('Impossible de charger l’outil de lecture. Vérifiez votre connexion.')); document.head.appendChild(el); });
  return loadedLibs[src];
}
async function pdfRows(file) {
  await loadScript('lib/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, rows = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    const items = tc.items.filter(t => t.str.trim()).map(t => ({ x: t.transform[4], y: t.transform[5], s: t.str.trim(), w: t.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = []; items.forEach(it => { const l = lines.find(L => Math.abs(L.y - it.y) <= 3); if (l) l.it.push(it); else lines.push({ y: it.y, it: [it] }); });
    lines.forEach(L => {
      L.it.sort((a, b) => a.x - b.x); const cells = []; let cur = null;
      L.it.forEach(it => { if (cur && it.x - cur.end < 14) { cur.s += ' ' + it.s; cur.end = it.x + it.w; } else { cur = { s: it.s, end: it.x + it.w }; cells.push(cur); } });
      rows.push(cells.map(c => c.s));
    });
  }
  return rows;
}
async function readRows(file) {
  const n = file.name.toLowerCase();
  if (/\.pdf$/.test(n)) return pdfRows(file);
  if (/\.(xlsx|xls|xlsm|ods)$/.test(n)) {
    await loadScript('lib/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }), rows = [];
    wb.SheetNames.forEach(sn => XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, raw: false }).forEach(r => rows.push(r.map(c => String(c ?? '').trim()))));
    return rows;
  }
  const txt = (await file.text()).replace(/^﻿/, ''), lines = txt.split(/\r?\n/).filter(l => l.trim());
  const best = [';', '\t', ',', '|'].map(d => [d, lines.slice(0, 8).reduce((k, l) => k + l.split(d).length - 1, 0)]).sort((a, b) => b[1] - a[1])[0];
  return lines.map(l => (best[1] ? l.split(best[0]) : [l]).map(c => c.replace(/^"|"$/g, '').trim()));
}
function rowsToLines(rows) {
  rows = rows.map(r => r.map(c => String(c || '').trim())).filter(r => r.some(Boolean));
  if (!rows.length) return [];
  const isHead = r => r.length > 1 && r.map(norm).some(c => /^(nom|noms|name|prenom|prenoms|poste|fonction|titre|emploi|role|employe|agent)/.test(c)) && r.every(c => c.length < 40);
  const hi = rows.slice(0, 6).findIndex(isHead);                       // le titre du document (PDF, Excel) peut précéder les en-têtes
  if (hi > 0) rows = rows.slice(hi);
  const hd = rows[0].map(norm), hasHead = hi >= 0;
  let iPre = -1, iNom = -1, iPoste = -1, body = rows;
  if (hasHead) {
    body = rows.slice(1);
    iPre = hd.findIndex(c => /^prenom/.test(c)); iPoste = hd.findIndex(c => /(poste|fonction|titre|emploi|job|role)/.test(c));
    iNom = hd.findIndex(c => /^(nom|noms|name|employe|agent|personnel)/.test(c) && !/^prenom/.test(c));
    if (iNom < 0 && iPre >= 0) { iNom = iPre; iPre = -1; }
    if (iNom < 0) iNom = hd.findIndex((c, i) => i !== iPoste);
  } else {
    const numCol = body.filter(r => /^\d+[.)\-]?$/.test(r[0] || '')).length >= body.length * 0.4;
    iNom = numCol ? 1 : 0; iPoste = iNom + 1;
  }
  const seen = new Set(), out = [];
  body.forEach(r => {
    let name = [iPre >= 0 ? r[iPre] : '', r[iNom] || ''].filter(Boolean).join(' ').replace(/^\d+\s*[.)\-]\s*/, '').replace(/\s+/g, ' ').trim();
    const poste = (iPoste >= 0 ? r[iPoste] || '' : '').replace(/\s+/g, ' ').trim();
    if (name.length < 3 || !/[A-Za-zÀ-ÿ]/.test(name) || /^\d+$/.test(name)) return;
    const k = norm(name); if (seen.has(k)) return; seen.add(k);
    out.push(name + (poste ? ' ; ' + poste : ''));
  });
  return out.slice(0, 300);
}
function openImport(kind) {
  openModal(`<button class="modal-x" data-close type="button" aria-label="Fermer">×</button><h2>Importer une liste</h2>
    <p class="muted">Choisissez un fichier <b>Excel</b> (.xlsx), <b>CSV</b> ou <b>PDF</b> (texte, pas une photo). Une colonne <b>Nom</b> (ou Prénom + Nom) et une colonne <b>Poste</b> sont reconnues. Vous vérifiez la liste avant d’ajouter.</p>
    <label class="filebtn"><input type="file" id="impFile" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.pdf,application/pdf"><span class="btn">${IC.file} Choisir un fichier</span></label>
    <p class="muted" id="impMsg" style="margin-top:10px"></p>`);
  $('#impFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; $('#impMsg').textContent = 'Lecture du fichier…';
    try {
      const lines = rowsToLines(await readRows(f));
      if (!lines.length) return void ($('#impMsg').innerHTML = 'Aucun nom lisible. Pour un PDF qui est une photo (scanné), utilisez plutôt Excel ou CSV.');
      closeModal(); openAdd(kind, lines.join('\n')); toast(lines.length + ' personne(s) lue(s) : vérifiez la liste puis ajoutez.');
    } catch (err) { $('#impMsg').textContent = 'Lecture impossible : ' + (err && err.message ? err.message : 'fichier non reconnu') + '.'; }
  };
}

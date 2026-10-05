const $ = (id) => document.getElementById(id);

/* ===================== Firebase init ===================== */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const dbFS = firebase.firestore();
// Secondary app instance, used ONLY to create new accounts without logging
// the current admin out (createUserWithEmailAndPassword signs the caller
// in as the new user on whichever auth instance it's called on).
const secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = secondaryApp.auth();

const ROOT_ADMIN_EMAIL = 'mhanbli@batisante.fr';
const ROLES_COL = 'roles';
const SNAPSHOT_DOC = 'config/kpi_snapshot';
const WRITE_DENIED = "Enregistrement refusé : vérifiez votre connexion ou vos droits d'accès.";

let CURRENT_EMAIL = null;
let CURRENT_ROLE = null;
let IS_ADMIN = false;
let ROLES = {}; // email -> { role, isRoot }
let hasLocalUploads = false;

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

/* ===================== Access ===================== */
function renderAdmins() {
  const el = $('adminsList');
  if (!el) return;
  const entries = Object.keys(ROLES).map((email) => ({ email, role: ROLES[email].role, isRoot: ROLES[email].isRoot }));
  if (!entries.find((e) => e.email === ROOT_ADMIN_EMAIL)) entries.unshift({ email: ROOT_ADMIN_EMAIL, role: 'admin', isRoot: true });
  el.innerHTML = entries.map((a) => `<tr>
    <td>${a.email}</td>
    <td><span class="badge">${a.role === 'observateur' ? 'Observateur' : 'Admin'}</span></td>
    <td>${a.isRoot ? '—' : `<button class="linkbtn" data-email="${a.email}">Retirer</button>`}</td>
  </tr>`).join('');
  el.querySelectorAll('button[data-email]').forEach((b) => b.addEventListener('click', async () => {
    try { await dbFS.collection(ROLES_COL).doc(b.dataset.email).delete(); }
    catch (e) { console.error('remove role failed', e); alert(WRITE_DENIED); }
  }));
}

function listenRoles() {
  dbFS.collection(ROLES_COL).onSnapshot((snap) => {
    ROLES = {};
    snap.forEach((doc) => { ROLES[doc.id] = doc.data(); });
    renderAdmins();
    // Re-evaluate current user's role in case it just changed/was removed.
    if (CURRENT_EMAIL) applyRoleForCurrentUser();
  }, (err) => console.error('roles subscription error', err));
}

function applyRoleForCurrentUser() {
  if (CURRENT_EMAIL === ROOT_ADMIN_EMAIL) {
    CURRENT_ROLE = 'admin';
  } else if (ROLES[CURRENT_EMAIL]) {
    CURRENT_ROLE = ROLES[CURRENT_EMAIL].role === 'observateur' ? 'observateur' : 'admin';
  } else {
    // Signed in with Firebase but no access entry: revoke immediately.
    CURRENT_ROLE = null;
  }
  IS_ADMIN = CURRENT_ROLE === 'admin';
  if (!CURRENT_ROLE) {
    auth.signOut();
    showPublicView();
    $('loginError').textContent = "Ce compte n'a pas (ou plus) d'accès à l'application. Contactez un administrateur.";
    $('loginPanel').style.display = '';
    $('openLoginBtn').style.display = 'none';
    return;
  }
  showAdminView();
}

function listenSnapshot() {
  dbFS.doc(SNAPSHOT_DOC).onSnapshot((snap) => {
    if (!snap.exists || hasLocalUploads) return;
    const data = snap.data();
    if (data && data.json) {
      try { AGG = JSON.parse(data.json); refreshUI(); } catch (e) { console.error('bad snapshot json', e); }
    }
  }, (err) => console.error('snapshot subscription error', err));
}

async function saveSnapshot() {
  const el = $('saveMsg');
  try {
    await dbFS.doc(SNAPSHOT_DOC).set({ json: JSON.stringify(AGG), generatedAt: new Date().toISOString() });
    if (el) { el.textContent = 'Données enregistrées.'; el.style.color = '#1f8a5c'; }
  } catch (e) {
    console.error('saveSnapshot failed', e);
    if (el) { el.textContent = WRITE_DENIED; el.style.color = '#c23d3d'; }
  }
}

function showAdminView() {
  $('publicView').style.display = 'none';
  $('adminView').style.display = '';
  $('adminOnlySections').style.display = IS_ADMIN ? '' : 'none';
  $('adminOnlySections2').style.display = IS_ADMIN ? '' : 'none';
  $('adminWho').textContent = (CURRENT_EMAIL || '') + (IS_ADMIN ? '' : ' · lecture seule');
  refreshUI();
}
function showPublicView() {
  IS_ADMIN = false; CURRENT_EMAIL = null; CURRENT_ROLE = null;
  $('adminView').style.display = 'none';
  $('publicView').style.display = '';
  $('loginPanel').style.display = 'none';
  $('openLoginBtn').style.display = '';
  $('loginEmail').value = ''; $('loginCode').value = ''; $('loginError').textContent = '';
}

auth.onAuthStateChanged((user) => {
  if (!user) { if (CURRENT_EMAIL) showPublicView(); return; }
  CURRENT_EMAIL = normEmail(user.email);
  applyRoleForCurrentUser();
});

$('openLoginBtn').addEventListener('click', () => { $('loginPanel').style.display = ''; $('openLoginBtn').style.display = 'none'; });
$('cancelLoginBtn').addEventListener('click', showPublicView);
$('logoutBtn').addEventListener('click', () => auth.signOut());

$('loginSubmit').addEventListener('click', async () => {
  const email = normEmail($('loginEmail').value);
  const code = $('loginCode').value;
  const errEl = $('loginError');
  errEl.textContent = '';
  if (!email || !code) { errEl.textContent = 'Renseignez votre e-mail et votre mot de passe.'; return; }
  try {
    await auth.signInWithEmailAndPassword(email, code);
    // onAuthStateChanged takes it from here.
  } catch (e) {
    if (e.code === 'auth/user-not-found' && email === ROOT_ADMIN_EMAIL) {
      // First-ever connection: bootstrap the root admin account.
      try {
        if (!code || code.length < 6) { errEl.textContent = 'Choisissez un mot de passe de 6 caractères minimum pour créer votre compte.'; return; }
        await auth.createUserWithEmailAndPassword(email, code);
      } catch (e2) {
        errEl.textContent = 'Impossible de créer le compte administrateur : ' + (e2.message || e2.code);
      }
      return;
    }
    errEl.textContent = 'Identifiants incorrects.';
  }
});

$('adminAdd').addEventListener('click', async () => {
  const email = normEmail($('adminAddEmail').value);
  const code = $('adminAddCode').value;
  const roleSel = $('adminAddRole');
  const role = roleSel && roleSel.value === 'observateur' ? 'observateur' : 'admin';
  const msgEl = $('adminAddMsg');
  msgEl.textContent = '';
  if (!email.endsWith('@batisante.fr')) { msgEl.textContent = 'Adresse @batisante.fr requise.'; return; }
  if (!code || code.length < 6) { msgEl.textContent = 'Mot de passe de 6 caractères minimum.'; return; }
  try {
    // Created on the SECONDARY auth instance so the current admin stays logged in here.
    await secondaryAuth.createUserWithEmailAndPassword(email, code);
    await secondaryAuth.signOut();
    await dbFS.collection(ROLES_COL).doc(email).set({ role });
    $('adminAddEmail').value = ''; $('adminAddCode').value = '';
    msgEl.textContent = 'Accès ajouté — disponible depuis n\'importe quel appareil.';
    msgEl.style.color = '#1f8a5c';
  } catch (e) {
    msgEl.textContent = e.code === 'auth/email-already-in-use' ? 'Un compte existe déjà avec cette adresse.' : (e.message || WRITE_DENIED);
    msgEl.style.color = '#c23d3d';
  }
});

$('pwChangeBtn').addEventListener('click', async () => {
  const code = $('pwChangeCode').value;
  const msgEl = $('pwChangeMsg');
  msgEl.textContent = '';
  if (!code || code.length < 6) { msgEl.textContent = 'Mot de passe de 6 caractères minimum.'; return; }
  try {
    await auth.currentUser.updatePassword(code);
    $('pwChangeCode').value = '';
    msgEl.textContent = 'Mot de passe mis à jour.';
    msgEl.style.color = '#1f8a5c';
  } catch (e) {
    msgEl.textContent = e.code === 'auth/requires-recent-login' ? 'Reconnectez-vous puis réessayez (sécurité).' : (e.message || WRITE_DENIED);
    msgEl.style.color = '#c23d3d';
  }
});

/* ===================== State ===================== */
const DB = { intervalo: null, infotech: null, amplitude: null, consolidation: null };
const META = { intervalo: null, infotech: null, amplitude: null, consolidation: null };
let AGG = {}; // trig -> { nom, equipe, months: { ym: {...} } }
let workers = {};

const MONTH_LABEL = { '01':'Janvier','02':'Février','03':'Mars','04':'Avril','05':'Mai','06':'Juin','07':'Juillet','08':'Août','09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre' };
const MONTH_ABBR = { '01':'Janv.','02':'Févr.','03':'Mars','04':'Avr.','05':'Mai','06':'Juin','07':'Juil.','08':'Août','09':'Sept.','10':'Oct.','11':'Nov.','12':'Déc.' };

const TEAM = {};
'ABH SLD|ABU TAH|AEL PPE|AFB PPE|AFI BEE|AGE FNE|ARA NDS|ARI FPE|ARK BEE|ATR NDS|BEA SLD|BEE BEE|BHV BEE|BIR FNE|BLB BEE|BLK PPE|BOC TAH|COF TAH|COM TAH|CTB BEE|CYR BEE|DIG TAH|DSU TAH|DYA NDS|EAR BEE|EBE SLD|EMD BEE|FME NDS|FNE FNE|FOD SLD|FPE FPE|GAV BEE|GEL NDS|GGL LFB|GHA BEE|GUA BEE|GWL TAH|GYS NDS|HCA FNE|HHL BEE|ICO LFB|ITO LFB|JDV FNE|KBU PPE|KDU PPE|KES BEE|LDC NDS|LEY SLD|LFB LFB|LOA BEE|MAM NDS|MAS BEE|MDI LFB|MFA BEE|MHU FPE|MMB NDS|MMS TAH|MOB LFB|MSE BEE|MSU FNE|MUS NDS|NDI LFB|NDS NDS|OAL FNE|OSE FNE|PEZ FPE|PGO BEE|PMU BEE|PPE PPE|RFI BEE|RME TAH|RMT SLD|RMU SLD|RYR LFB|SDI LFB|SEE LFB|SHS SLD|SMP NDS|SNE BEE|STC LFB|TAH TAH|TAN BEE|TCH BEE|TEM TAH|TJO BEE|TRS NDS|WAZ FPE|WBO SLD|YAG SLD|YBM FPE|YHE LFB|YNA PPE|YYI PPE|ZBA PPE|ZKO LFB|ALG TAH|JBI SLD|GDL FPE|HTR SLD|QVE SLD|IOI FPE|STR EAK|JOB AIL|PRF AIL|NKI AIL|JFR AIL|SPR AIL|AAB DAK|MBS DAK|BAB DAK|KBH DAK|SBK DAK|YHD DAK|III DAK|AIS DAK|FSA DAK|BAA DBT|WBD DBT|JPD DBT|ALF DBT|GDI CEB|HHI FPE|GUM FPE|DNE FPE|BIL FPE|AIL AIL|BMB BEE|RYH BEE|MMZ BEE|BDJ SLD|KKA BEE|FRL BEE|DBT DBT|YDO SLD|KOS SLD|DDO FPE|FOF LFB|MKO NDS|MSO TAH|BGR SLD|BYD SLD|LYH FPE|WDB FPE|HAC FNE|FLR BEE|SLD SLD'
  .split('|').forEach((x) => { const p = x.split(' '); TEAM[p[0]] = p[1]; });

/* ===================== Worker plumbing ===================== */
function startWorker(kind, file) {
  const slotEl = $('status_' + kind);
  const barEl = $('bar_' + kind);
  slotEl.textContent = 'Lecture du fichier...';
  slotEl.className = 'status';
  barEl.style.width = '3%';
  barEl.parentElement.style.display = 'block';

  const worker = new Worker('worker.js');
  workers[kind] = worker;

  worker.onmessage = function (e) {
    const msg = e.data;
    if (msg.type === 'progress') {
      barEl.style.width = Math.max(3, msg.pct) + '%';
      if (msg.label) slotEl.textContent = msg.label;
    } else if (msg.type === 'error') {
      slotEl.textContent = '❌ ' + msg.message;
      slotEl.className = 'status err';
      barEl.parentElement.style.display = 'none';
      worker.terminate();
      delete workers[kind];
    } else if (msg.type === 'done') {
      DB[kind] = msg.data;
      META[kind] = { totalRows: msg.totalRows, keptRows: msg.keptRows, missing: msg.missing };
      barEl.style.width = '100%';
      let extra = msg.missing && msg.missing.length ? (' — champs non détectés: ' + msg.missing.join(', ')) : '';
      slotEl.textContent = '✅ ' + msg.keptRows.toLocaleString('fr-FR') + ' / ' + msg.totalRows.toLocaleString('fr-FR') + ' lignes retenues (BSH)' + extra;
      slotEl.className = extra ? 'status warn' : 'status ok';
      setTimeout(() => { barEl.parentElement.style.display = 'none'; }, 900);
      worker.terminate();
      delete workers[kind];
      rebuildAggregate();
      refreshUI();
      saveSnapshot();
    }
  };
  worker.onerror = function (err) {
    slotEl.textContent = '❌ Erreur worker: ' + (err.message || 'inconnue');
    slotEl.className = 'status err';
    worker.terminate();
    delete workers[kind];
  };

  file.arrayBuffer().then((buf) => {
    worker.postMessage({ kind, buffer: buf }, [buf]);
  }).catch((err) => {
    slotEl.textContent = '❌ Impossible de lire ce fichier: ' + err.message;
    slotEl.className = 'status err';
  });
}

['intervalo', 'infotech', 'amplitude', 'consolidation'].forEach((kind) => {
  $('file_' + kind).addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) {
      if (!confirm('Ce fichier fait ' + (f.size / 1024 / 1024).toFixed(0) + ' Mo. Le traitement peut prendre du temps et consommer beaucoup de mémoire. Continuer ?')) {
        e.target.value = '';
        return;
      }
    }
    startWorker(kind, f);
  });
});

/* ===================== Aggregation ===================== */
function ensureTech(trig) {
  if (!AGG[trig]) AGG[trig] = { nom: null, equipe: TEAM[trig] || null, months: {} };
  return AGG[trig];
}
function ensureMonth(trig, ym) {
  const t = ensureTech(trig);
  if (!t.months[ym]) {
    t.months[ym] = {
      prodCount: 0, planTotal: 0, planOk: 0, nonPrevuesMode: 0,
      ampSumMin: 0, ampCount: 0,
      infotechCount: 0, infotechTraitee: 0,
      njw: 0, njwIntervalo: 0, rdvConf: 0, rdvNonConf: 0, nbActivites: 0, dureeActHeures: 0
    };
  }
  return t.months[ym];
}

function rebuildAggregate() {
  hasLocalUploads = true;
  AGG = {};
  const cons = DB.consolidation;
  if (cons) {
    for (let i = 0; i < cons.trig.length; i++) {
      const trig = cons.trig[i];
      const ym = cons.ym[i];
      const r = ensureMonth(trig, ym);
      r.rdvConf += cons.completed[i];
      r.rdvNonConf += Math.max(0, cons.total[i] - cons.completed[i]);
    }
  }

  const iv = DB.intervalo;
  if (iv) {
    const workDaySetsIv = {}; // "trig|ym" -> Set of distinct execution days (Intervalo)
    for (let i = 0; i < iv.trig.length; i++) {
      const trig = iv.trig[i];
      const ym = iv.ym[i];
      const r = ensureMonth(trig, ym);
      r.prodCount++;
      if (iv.datePrevYMD[i]) {
        r.planTotal++;
        if (iv.datePrevYMD[i] === iv.dateExeYMD[i]) r.planOk++;
      }
      if (iv.mode[i] === 'PONC') r.nonPrevuesMode++;
      const t = ensureTech(trig);
      if (!t.nom && iv.nom[i]) t.nom = iv.nom[i];
      if (iv.dateExeYMD[i]) {
        const key = trig + '|' + ym;
        if (!workDaySetsIv[key]) workDaySetsIv[key] = new Set();
        workDaySetsIv[key].add(iv.dateExeYMD[i]);
      }
    }
    Object.keys(workDaySetsIv).forEach((key) => {
      const sep = key.lastIndexOf('|');
      const trig = key.slice(0, sep), ym = key.slice(sep + 1);
      ensureMonth(trig, ym).njwIntervalo = workDaySetsIv[key].size;
    });
  }

  const amp = DB.amplitude;
  if (amp) {
    const workDaySets = {}; // "trig|ym" -> Set of distinct days with at least one mission
    for (let i = 0; i < amp.trig.length; i++) {
      const trig = amp.trig[i], ym = amp.ym[i];
      const r = ensureMonth(trig, ym);
      r.ampSumMin += amp.minutes[i];
      r.ampCount++;
      r.nbActivites++;
      r.dureeActHeures += amp.minutes[i] / 60;
      const key = trig + '|' + ym;
      if (!workDaySets[key]) workDaySets[key] = new Set();
      workDaySets[key].add(amp.dayKey[i]);
    }
    Object.keys(workDaySets).forEach((key) => {
      const sep = key.lastIndexOf('|');
      const trig = key.slice(0, sep), ym = key.slice(sep + 1);
      ensureMonth(trig, ym).njw = workDaySets[key].size;
    });
  }

  const info = DB.infotech;
  if (info) {
    for (let i = 0; i < info.trig.length; i++) {
      const ym = info.ym[i];
      if (!ym) continue;
      const r = ensureMonth(info.trig[i], ym);
      r.infotechCount++;
      if (info.sousStatut[i] === 'Traitée') r.infotechTraitee++;
    }
  }
}

/* ===================== Filters / selection ===================== */
function allMonths() {
  const s = new Set();
  Object.values(AGG).forEach((t) => Object.keys(t.months).forEach((ym) => s.add(ym)));
  return [...s].sort();
}
function allEquipes() {
  const s = new Set();
  Object.values(AGG).forEach((t) => { if (t.equipe) s.add(t.equipe); });
  return [...s].sort();
}
function techList(equipe) {
  return Object.keys(AGG)
    .filter((trig) => equipe === 'ALL' || AGG[trig].equipe === equipe)
    .map((trig) => ({ trig, nom: AGG[trig].nom || trig }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

function refreshUI() {
  const months = allMonths();
  const monthSel = $('month');
  const prevMonth = monthSel.value;
  monthSel.innerHTML = months.map((ym) => `<option value="${ym}">${MONTH_LABEL[ym.slice(5)] || ym.slice(5)} ${ym.slice(0,4)}</option>`).join('') || '<option value="">—</option>';
  if (months.includes(prevMonth)) monthSel.value = prevMonth;
  else monthSel.value = months[months.length - 1] || '';

  const equipeSel = $('equipe');
  const prevEquipe = equipeSel.value || 'ALL';
  equipeSel.innerHTML = '<option value="ALL">Toutes les équipes</option>' + allEquipes().map((e) => `<option>${e}</option>`).join('');
  equipeSel.value = prevEquipe;

  refreshTechOptions();
  render();
}
function refreshTechOptions() {
  const techSel = $('tech');
  const prevTech = techSel.value || 'ALL';
  const equipe = $('equipe').value || 'ALL';
  const list = techList(equipe);
  techSel.innerHTML = '<option value="ALL">Vue équipe (tous)</option>' + list.map((t) => `<option value="${t.trig}">${t.nom} (${t.trig})</option>`).join('');
  techSel.value = list.find((t) => t.trig === prevTech) ? prevTech : 'ALL';
}
$('equipe').addEventListener('change', () => { refreshTechOptions(); render(); });
$('tech').addEventListener('change', render);
$('month').addEventListener('change', render);
$('objectifHeures').addEventListener('change', render);

/* ===================== KPI computation ===================== */
function emptyRec() {
  return { prodCount: 0, planTotal: 0, planOk: 0, nonPrevuesMode: 0, ampSumMin: 0, ampCount: 0, infotechCount: 0, infotechTraitee: 0, njw: 0, njwIntervalo: 0, rdvConf: 0, rdvNonConf: 0, nbActivites: 0, dureeActHeures: 0 };
}
function mergeRec(a, b) {
  Object.keys(a).forEach((k) => { a[k] += (b[k] || 0); });
  return a;
}
function selectionRecord(month, equipe, tech) {
  const r = emptyRec();
  let count = 0;
  Object.keys(AGG).forEach((trig) => {
    if (tech !== 'ALL' && trig !== tech) return;
    if (tech === 'ALL' && equipe !== 'ALL' && AGG[trig].equipe !== equipe) return;
    const m = AGG[trig].months[month];
    if (!m) return;
    mergeRec(r, m);
    count++;
  });
  return { r, count };
}
function ops(rec) { return rec.prodCount > 0 ? rec.prodCount : rec.nbActivites; }
function fmtMin(m) { if (m == null) return '—'; m = Math.round(m); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; }
function pct(v) { return v == null ? '—' : v.toFixed(1) + ' %'; }
function num(v, d) { return v == null ? '—' : v.toFixed(d == null ? 2 : d); }

/* ===================== Rendering ===================== */
function render() {
  const month = $('month').value;
  const equipe = $('equipe').value || 'ALL';
  const tech = $('tech').value || 'ALL';
  if (!month) {
    const msg = 'Importez au moins un fichier pour calculer les indicateurs.';
    $('kpis').innerHTML = `<div class="notice" style="margin:18px">${msg}</div>`;
    $('tableBody').innerHTML = '';
    return;
  }

  const { r, count } = selectionRecord(month, equipe, tech);
  const opsN = ops(r);
  const opsPerDay = r.njwIntervalo > 0 ? opsN / r.njwIntervalo : null;
  const opsSuspect = opsPerDay != null && opsPerDay > 15;
  const totalRdv = r.rdvConf + r.rdvNonConf;
  const planning = totalRdv > 0 ? (r.rdvConf / totalRdv) * 100 : null;
  const tempsClientMin = r.ampCount > 0 ? r.ampSumMin / r.ampCount : null;
  const pctNonPrevues = totalRdv > 0 ? (r.rdvNonConf / totalRdv) * 100 : null;

  const objectifH = +($('objectifHeures').value || 7);
  const heuresParJour = (r.dureeActHeures > 0 && r.njw > 0) ? r.dureeActHeures / r.njw : null;
  const objectifPct = heuresParJour != null ? (heuresParJour / objectifH) * 100 : null;
  const heuresSuspect = heuresParJour != null && heuresParJour > 16;

  const cards = [
    { label: 'AMPLITUDE', value: tempsClientMin != null ? fmtMin(tempsClientMin) : '—', sub: 'Durée moyenne', warn: tempsClientMin == null ? "Pas de données pour cette sélection" : (r.ampCount < 5 ? `Basé sur ${r.ampCount} mission(s)` : '') },
    { label: 'RESPECT DU PLANNING', value: pct(planning), sub: 'Missions complétées ÷ missions totales', warn: planning == null ? 'Pas de données' : '' },
    { label: 'ATTEINTE OBJECTIF DE PERFORMANCE', value: pct(objectifPct), sub: heuresParJour != null ? `${heuresParJour.toFixed(1)} h/jour vs objectif ${objectifH} h/jour` : `Objectif : ${objectifH} h/jour`, warn: heuresParJour == null ? "Pas de donnée de durée disponible" : (heuresSuspect ? `Donnée suspecte (${heuresParJour.toFixed(0)} h/jour)` : '') },
    { label: 'OPÉRATIONS / JOUR', value: num(opsPerDay), sub: 'Opérations réalisées ÷ jours travaillés (Intervalo)', warn: opsPerDay == null ? 'Jours travaillés indisponibles' : (opsSuspect ? `Donnée suspecte (${opsPerDay.toFixed(0)} /jour)` : '') },
    { label: 'RDV OBLIGATOIRES RÉALISÉS / NON RÉALISÉS', value: totalRdv > 0 ? `${r.rdvConf} / ${r.rdvNonConf}` : '—', sub: pctNonPrevues != null ? pctNonPrevues.toFixed(1) + ' % non réalisés' : 'Réalisés / non réalisés', warn: totalRdv === 0 ? 'Pas de données' : '' },
    { label: 'INFOTECH', value: r.infotechCount > 0 ? r.infotechCount : '—', sub: r.infotechCount > 0 ? `${(100 * r.infotechTraitee / r.infotechCount).toFixed(0)} % traitées` : 'Remontées terrain technicien', warn: r.infotechCount === 0 ? 'Pas de données' : '' }
  ];
  $('kpis').innerHTML = cards.map((c) => `<div class="stat"><label>${c.label}</label><b class="tnum">${c.value}</b><span class="sub">${c.sub}</span>${c.warn ? `<div class="flag">${c.warn}</div>` : ''}</div>`).join('');

  renderTable(month, equipe);
  renderTrend(tech, equipe);
  renderDiagnostics();
}

function renderDiagnostics() {
  const el = $('diagnostics');
  if (!el) return;
  const refTrigs = Object.keys(TEAM);
  const withAnyData = refTrigs.filter((trig) => AGG[trig] && Object.keys(AGG[trig].months).length > 0);
  const withNoData = refTrigs.filter((trig) => !AGG[trig] || Object.keys(AGG[trig].months).length === 0);
  const filesLoaded = Object.values(DB).some((d) => d);

  if (!filesLoaded) {
    el.innerHTML = '<p class="help">Importe des fichiers pour voir le diagnostic de couverture.</p>';
    return;
  }

  let html = `<p class="help"><b>${withAnyData.length}</b> / ${refTrigs.length} techniciens de la liste de référence ont au moins une donnée dans les fichiers chargés.</p>`;

  if (withNoData.length) {
    html += `<details><summary>${withNoData.length} technicien(s) sans aucune donnée (cliquer pour voir)</summary><div class="notice">`;
    html += withNoData.map((t) => `<span class="badge">${t} (${TEAM[t]})</span>`).join(' ');
    html += `<p style="margin-top:8px">Causes possibles : trigramme absent des 4 fichiers sur toute la période importée (personne inactive / arrivée récente / poste d'encadrement sans intervention terrain), ou trigramme orthographié différemment dans un des fichiers sources.</p></div></details>`;
  }

  el.innerHTML = html;
}

function renderTable(month, equipe) {
  const objectifH = +($('objectifHeures').value || 7);
  const rows = Object.keys(AGG)
    .filter((trig) => equipe === 'ALL' || AGG[trig].equipe === equipe)
    .map((trig) => {
      const t = AGG[trig];
      const m = t.months[month] || emptyRec();
      const opsN = ops(m);
      const opsPerDay = m.njwIntervalo > 0 ? opsN / m.njwIntervalo : null;
      const totalRdvRow = m.rdvConf + m.rdvNonConf;
      const planning = totalRdvRow > 0 ? (m.rdvConf / totalRdvRow) * 100 : null;
      const tcm = m.ampCount > 0 ? m.ampSumMin / m.ampCount : null;
      const heuresParJour = (m.dureeActHeures > 0 && m.njw > 0) ? m.dureeActHeures / m.njw : null;
      const objectifPct = heuresParJour != null ? (heuresParJour / objectifH) * 100 : null;
      return { trig, nom: t.nom || trig, equipe: t.equipe || '—', njw: m.njw, opsN, opsPerDay, opsSuspect: opsPerDay != null && opsPerDay > 15, rdvConf: m.rdvConf, rdvNonConf: m.rdvNonConf, planning, tcm, objectifPct, heuresSuspect: heuresParJour != null && heuresParJour > 16, infotechCount: m.infotechCount };
    })
    .filter((x) => x.njw || x.opsN || x.rdvConf || x.rdvNonConf || x.infotechCount)
    .sort((a, b) => a.nom.localeCompare(b.nom));

  $('tableBody').innerHTML = rows.map((x) => `<tr>
    <td><b>${x.trig}</b></td>
    <td>${x.nom}</td>
    <td><span class="badge">${x.equipe}</span></td>
    <td>${x.njw ? x.njw.toFixed(1) : '—'}</td>
    <td>${x.opsN || '—'}</td>
    <td>${x.opsPerDay != null ? x.opsPerDay.toFixed(2) + (x.opsSuspect ? ' ⚠️' : '') : '—'}</td>
    <td>${x.rdvConf} / ${x.rdvNonConf}</td>
    <td>${x.planning != null ? x.planning.toFixed(1) + ' %' : '—'}</td>
    <td>${x.tcm != null ? fmtMin(x.tcm) : '—'}</td>
    <td>${x.objectifPct != null ? x.objectifPct.toFixed(0) + ' %' + (x.heuresSuspect ? ' ⚠️' : '') : '—'}</td>
    <td>${x.infotechCount || '—'}</td>
  </tr>`).join('') || '<tr><td colspan="11">Aucune donnée pour ce filtre.</td></tr>';
}

function renderTrend(tech, equipe) {
  const currentYear = String(new Date().getFullYear());
  const months = allMonths().filter((ym) => ym.slice(0, 4) === currentYear);
  const opsDayData = [], planningData = [], tcmData = [];
  months.forEach((ym) => {
    const { r } = selectionRecord(ym, equipe, tech);
    const opsN = ops(r);
    opsDayData.push(r.njwIntervalo > 0 ? opsN / r.njwIntervalo : 0);
    const totalRdvYm = r.rdvConf + r.rdvNonConf;
    planningData.push(totalRdvYm > 0 ? (r.rdvConf / totalRdvYm) * 100 : 0);
    tcmData.push(r.ampCount > 0 ? r.ampSumMin / r.ampCount : 0);
  });
  const labels = months.map((ym) => MONTH_ABBR[ym.slice(5)] || ym.slice(5));
  if (!months.length) {
    ['chartOpsDay', 'chartPlanning', 'chartTemps'].forEach((id) => {
      const c = $(id);
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#64788a'; ctx.font = "11px 'Plus Jakarta Sans',Arial"; ctx.textAlign = 'center';
      ctx.fillText(`Pas de données ${currentYear}`, c.clientWidth / 2, c.clientHeight / 2);
    });
    return;
  }
  draw('chartOpsDay', labels, opsDayData, 'Opérations / jour', (v) => v.toFixed(2));
  draw('chartPlanning', labels, planningData, 'Respect planning (%)', (v) => v.toFixed(0) + '%');
  draw('chartTemps', labels, tcmData, 'Amplitude (min)', (v) => fmtMin(v));
}

function draw(id, labels, data, label, valueFmt) {
  const c = $(id);
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.clientWidth || 300, h = c.clientHeight || 180, dpr = devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(...data, 1);
  const L = 34, T = 24, B = 40, P = w - L - 10, H = h - T - B;
  ctx.strokeStyle = '#dde4ea';
  for (let i = 0; i < 4; i++) { const y = T + H * i / 3; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - 10, y); ctx.stroke(); }
  const slot = P / Math.max(data.length, 1);
  const bw = Math.min(28, slot * 0.55);
  data.forEach((v, i) => {
    const x = L + (i + 0.5) * slot;
    const hh = max > 0 ? (v / max) * H : 0;
    const barTop = T + H - hh;
    ctx.fillStyle = '#1ba3e0';
    ctx.fillRect(x - bw / 2, barTop, bw, hh);
    if (valueFmt) {
      const text = valueFmt(v);
      ctx.textAlign = 'center';
      const sizes = [9.5, 8.5, 7.5, 6.5];
      let chosen = null;
      for (let s = 0; s < sizes.length; s++) {
        ctx.font = "bold " + sizes[s] + "px 'Plus Jakarta Sans',Arial";
        if (ctx.measureText(text).width <= slot - 4) { chosen = sizes[s]; break; }
      }
      if (chosen) {
        ctx.font = "bold " + chosen + "px 'Plus Jakarta Sans',Arial";
        const fitsAbove = barTop - T >= chosen + 3;
        if (fitsAbove) {
          ctx.fillStyle = '#0c2d49'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(text, x, barTop - 4);
        } else {
          ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'top';
          ctx.fillText(text, x, T + 2);
        }
      }
    }
    ctx.save();
    ctx.translate(x, T + H + 8);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#64788a'; ctx.font = "9.5px 'Plus Jakarta Sans',Arial"; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(labels[i] || '', 0, 0);
    ctx.restore();
  });
  ctx.fillStyle = '#0c2d49'; ctx.font = "bold 10px 'Plus Jakarta Sans',Arial"; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, L, 10);
}

/* ===================== Boot ===================== */
refreshUI();
showPublicView();
listenRoles();
listenSnapshot();

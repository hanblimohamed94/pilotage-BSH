importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');

var TEAM = {};
'ABH SLD|ABU TAH|AEL PPE|AFB PPE|AFI BEE|AGE FNE|ARA NDS|ARI FPE|ARK BEE|ATR NDS|BEA SLD|BEE BEE|BHV BEE|BIR FNE|BLB BEE|BLK PPE|BOC TAH|COF TAH|COM TAH|CTB BEE|CYR BEE|DIG TAH|DSU TAH|DYA NDS|EAR BEE|EBE SLD|EMD BEE|FME NDS|FNE FNE|FOD SLD|FPE FPE|GAV BEE|GEL NDS|GGL LFB|GHA BEE|GUA BEE|GWL TAH|GYS NDS|HCA FNE|HHL BEE|ICO LFB|ITO LFB|JDV FNE|KBU PPE|KDU PPE|KES BEE|LDC NDS|LEY SLD|LFB LFB|LOA BEE|MAM NDS|MAS BEE|MDI LFB|MFA BEE|MHU FPE|MMB NDS|MMS TAH|MOB LFB|MSE BEE|MSU FNE|MUS NDS|NDI LFB|NDS NDS|OAL FNE|OSE FNE|PEZ FPE|PGO BEE|PMU BEE|PPE PPE|RFI BEE|RME TAH|RMT SLD|RMU SLD|RYR LFB|SDI LFB|SEE LFB|SHS SLD|SMP NDS|SNE BEE|STC LFB|TAH TAH|TAN BEE|TCH BEE|TEM TAH|TJO BEE|TRS NDS|WAZ FPE|WBO SLD|YAG SLD|YBM FPE|YHE LFB|YNA PPE|YYI PPE|ZBA PPE|ZKO LFB|ALG TAH|JBI SLD|GDL FPE|HTR SLD|QVE SLD|IOI FPE|STR EAK|JOB AIL|PRF AIL|NKI AIL|JFR AIL|SPR AIL|AAB DAK|MBS DAK|BAB DAK|KBH DAK|SBK DAK|YHD DAK|III DAK|AIS DAK|FSA DAK|BAA DBT|WBD DBT|JPD DBT|ALF DBT|GDI CEB|HHI FPE|GUM FPE|DNE FPE|BIL FPE|AIL AIL|BMB BEE|RYH BEE|MMZ BEE|BDJ SLD|KKA BEE|FRL BEE|DBT DBT|YDO SLD|KOS SLD|DDO FPE|FOF LFB|MKO NDS|MSO TAH|BGR SLD|BYD SLD|LYH FPE|WDB FPE|HAC FNE|FLR BEE|SLD SLD'
  .split('|').forEach(function (x) { var p = x.split(' '); TEAM[p[0]] = p[1]; });
function isRefTrig(t) { return !!TEAM[t]; }

function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function findHeaderRow(rows, anchors) {
  var maxScan = Math.min(rows.length, 25);
  for (var r = 0; r < maxScan; r++) {
    var row = rows[r];
    if (!row) continue;
    var normSet = {};
    for (var c = 0; c < row.length; c++) {
      var n = norm(row[c]);
      if (n) normSet[n] = true;
    }
    var ok = true;
    for (var a = 0; a < anchors.length; a++) {
      if (!normSet[anchors[a]]) { ok = false; break; }
    }
    if (ok) return r;
  }
  return -1;
}

function buildColMap(headerRow, fieldDefs) {
  var normHeader = headerRow.map(norm);
  var map = {};
  var missing = [];
  Object.keys(fieldDefs).forEach(function (field) {
    var syns = fieldDefs[field];
    var idx = -1;
    for (var s = 0; s < syns.length; s++) {
      var found = normHeader.indexOf(syns[s]);
      if (found !== -1) { idx = found; break; }
    }
    map[field] = idx;
    if (idx === -1) missing.push(field);
  });
  return { map: map, missing: missing };
}

function parseDateFlexible(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v;
  }
  if (typeof v === 'number') {
    // Excel serial date -> JS Date (UTC, 1899-12-30 epoch)
    var ms = Math.round((v - 25569) * 86400 * 1000);
    var dt = new Date(ms);
    return isNaN(dt.getTime()) ? null : dt;
  }
  var str = String(v).trim();
  var m = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    var yy = +m[3];
    if (yy < 100) yy += 2000;
    return new Date(Date.UTC(yy, +m[2] - 1, +m[1]));
  }
  var d2 = new Date(str);
  return isNaN(d2.getTime()) ? null : d2;
}

function ymKey(dateObj) {
  if (!dateObj) return null;
  var y = dateObj.getUTCFullYear();
  var m = dateObj.getUTCMonth() + 1;
  return y + '-' + (m < 10 ? '0' + m : m);
}

function ymdKey(dateObj) {
  if (!dateObj) return null;
  return ymKey(dateObj) + '-' + (dateObj.getUTCDate() < 10 ? '0' + dateObj.getUTCDate() : dateObj.getUTCDate());
}

function parseDurationMinutes(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.getUTCHours() * 60 + v.getUTCMinutes();
  }
  if (typeof v === 'number') {
    // fraction of a day, or already minutes if > 24
    if (v > 0 && v < 10) return Math.round(v * 1440);
    return Math.round(v);
  }
  var str = String(v).trim();
  var m = str.match(/^(\d{1,4}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return (+m[1]) * 60 + (+m[2]);
  return null;
}

var MONTHS_FR = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12
};

function normalizeSimple(v) {
  return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function processIntervalo(rows, headerIdx, defaultYear) {
  var cm = buildColMap(rows[headerIdx], {
    trig: ['intervenant'],
    nom: ['nominterv'],
    pole: ['pole'],
    dateExe: ['dateexe'],
    datePrev: ['dateprevue', 'dateprev'],
    mode: ['mode'],
    motifR: ['motifr'],
    dureeTerrain: ['dureeterrain']
  });
  var out = { trig: [], ym: [], dateExeYMD: [], datePrevYMD: [], mode: [], nom: [] };
  var total = 0, kept = 0;
  for (var i = headerIdx + 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    total++;
    var pole = cm.map.pole !== -1 ? row[cm.map.pole] : null;
    if (normalizeSimple(pole) !== 'hygiene') continue;
    var trig = cm.map.trig !== -1 ? String(row[cm.map.trig] || '').trim().toUpperCase() : '';
    if (!trig || !isRefTrig(trig)) continue;
    var dateExe = cm.map.dateExe !== -1 ? parseDateFlexible(row[cm.map.dateExe]) : null;
    if (!dateExe) continue;
    var datePrev = cm.map.datePrev !== -1 ? parseDateFlexible(row[cm.map.datePrev]) : null;
    kept++;
    out.trig.push(trig);
    out.ym.push(ymKey(dateExe));
    out.dateExeYMD.push(ymdKey(dateExe));
    out.datePrevYMD.push(datePrev ? ymdKey(datePrev) : null);
    out.mode.push(cm.map.mode !== -1 ? String(row[cm.map.mode] || '') : '');
    out.nom.push(cm.map.nom !== -1 ? String(row[cm.map.nom] || '') : '');
    if (i % 20000 === 0) postMessage({ type: 'progress', pct: Math.round((i / rows.length) * 100) });
  }
  return { data: out, totalRows: total, keptRows: kept, missing: cm.missing };
}

function processInfotech(rows, headerIdx) {
  // Salesforce export (HTML table, often saved as .xls) listing "Infotech"
  // field reports: technicians flagging something on-site (missing
  // equipment, an opportunity to quote extra work, etc.). One row per
  // report, with an opening date and a resolution status.
  var cm = buildColMap(rows[headerIdx], {
    trig: ['trigrammetechnicien'],
    proprietaire: ['proprietairedelarequete'],
    dateOuverture: ['datedouverture'],
    statut: ['statut'],
    sousStatut: ['sousstatut']
  });
  var out = { trig: [], ym: [], statut: [], sousStatut: [] };
  var total = 0, kept = 0;
  for (var i = headerIdx + 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    total++;
    var proprietaire = cm.map.proprietaire !== -1 ? normalizeSimple(row[cm.map.proprietaire]) : '';
    if (proprietaire === 'doublons') continue; // flagged duplicate report, not a real distinct signal
    var trig = cm.map.trig !== -1 ? String(row[cm.map.trig] || '').trim().toUpperCase() : '';
    if (!trig || !isRefTrig(trig)) continue;
    var dateOuv = cm.map.dateOuverture !== -1 ? parseDateFlexible(row[cm.map.dateOuverture]) : null;
    if (!dateOuv) continue;
    kept++;
    out.trig.push(trig);
    out.ym.push(ymKey(dateOuv));
    out.statut.push(cm.map.statut !== -1 ? String(row[cm.map.statut] || '') : '');
    out.sousStatut.push(cm.map.sousStatut !== -1 ? String(row[cm.map.sousStatut] || '') : '');
    if (i % 2000 === 0) postMessage({ type: 'progress', pct: Math.round((i / rows.length) * 100) });
  }
  return { data: out, totalRows: total, keptRows: kept, missing: cm.missing };
}

function processAmplitude(rows, headerIdx) {
  // New format: one row per mission with a technician trigram and a
  // start/end datetime (no company/société column, so no BSI-style exclusion
  // is possible here anymore — every row for a reference technician is kept).
  var cm = buildColMap(rows[headerIdx], {
    trig: ['ressourcedeservicetrigramme'],
    dateDebut: ['dateheuredebutmin'],
    dateFin: ['dateheurefinmax']
  });
  var out = { trig: [], ym: [], dayKey: [], minutes: [] };
  var total = 0, kept = 0;
  for (var i = headerIdx + 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    total++;
    var trig = cm.map.trig !== -1 ? String(row[cm.map.trig] || '').trim().toUpperCase() : '';
    if (!trig || trig.indexOf('/') !== -1 || !isRefTrig(trig)) continue;
    var dateDebut = cm.map.dateDebut !== -1 ? parseDateFlexible(row[cm.map.dateDebut]) : null;
    var dateFin = cm.map.dateFin !== -1 ? parseDateFlexible(row[cm.map.dateFin]) : null;
    if (!dateDebut || !dateFin) continue;
    var mins = (dateFin.getTime() - dateDebut.getTime()) / 60000;
    if (!(mins > 0) || mins > 1440 * 3) continue; // discard zero/negative or implausible multi-day durations (likely data errors)
    kept++;
    out.trig.push(trig);
    out.ym.push(ymKey(dateDebut));
    out.dayKey.push(ymdKey(dateDebut));
    out.minutes.push(mins);
    if (i % 20000 === 0) postMessage({ type: 'progress', pct: Math.round((i / rows.length) * 100) });
  }
  return { data: out, totalRows: total, keptRows: kept, missing: cm.missing };
}

function processConsolidation(rows, headerIdx, year) {
  // New format: a daily pivot export ("Nb de missions Completed pour RdV
  // Obligatoire"). Row 0-1 = manager/trigramme, columns from index 2 onward
  // repeat in blocks of 3 per day: "Nb missions Completed", "Nb Total
  // missions", "%". The date for each block sits in the row just above the
  // header row, repeated across the block's 3 columns. Subtotal rows (col1
  // is blank or starts with "Total") are skipped.
  var header = rows[headerIdx];
  var dateRow = rows[headerIdx - 1] || [];
  var blocks = [];
  for (var c = 2; c < header.length; c++) {
    var h = norm(header[c]);
    if (h.indexOf('completed') !== -1) {
      var totalCol = -1;
      for (var c2 = c + 1; c2 < Math.min(c + 4, header.length); c2++) {
        if (norm(header[c2]).indexOf('totalmissions') !== -1) { totalCol = c2; break; }
      }
      if (totalCol !== -1) {
        var d = parseDateFlexible(dateRow[c]);
        if (d) blocks.push({ date: d, completedCol: c, totalCol: totalCol });
      }
    }
  }
  var out = { trig: [], ym: [], completed: [], total: [] };
  var totalRows = 0, kept = 0;
  for (var i = headerIdx + 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    totalRows++;
    var trigRaw = row[1];
    if (trigRaw == null || trigRaw === '') continue;
    var trig = String(trigRaw).trim().toUpperCase();
    if (!trig || trig.indexOf('TOTAL') === 0 || !isRefTrig(trig)) continue;
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b];
      var completed = Number(row[blk.completedCol]) || 0;
      var tot = Number(row[blk.totalCol]) || 0;
      if (!completed && !tot) continue;
      kept++;
      out.trig.push(trig);
      out.ym.push(ymKey(blk.date));
      out.completed.push(completed);
      out.total.push(tot);
    }
    if (i % 100 === 0) postMessage({ type: 'progress', pct: Math.round((i / rows.length) * 100) });
  }
  var missing = blocks.length === 0 ? ['blocsQuotidiensCompletedTotal'] : [];
  return { data: out, totalRows: totalRows, keptRows: kept, missing: missing };
}

var HEADER_ANCHORS = {
  intervalo: ['pole', 'dateexe', 'intervenant'],
  infotech: ['trigrammetechnicien', 'datedouverture'],
  amplitude: ['ressourcedeservicetrigramme', 'dateheuredebutmin'],
  consolidation: ['trigrammetechnicien']
};

function htmlTableToRows(text) {
  // Some exports are saved with an .xls extension but are actually an HTML
  // table (common with certain reporting tools). Parse it directly rather
  // than handing it to the XLSX reader, which does not read this format.
  if (typeof DOMParser !== 'undefined') {
    var doc = new DOMParser().parseFromString(text, 'text/html');
    var table = doc.querySelector('table');
    if (!table) return null;
    var trs = table.querySelectorAll('tr');
    var rows = [];
    for (var i = 0; i < trs.length; i++) {
      var cells = trs[i].querySelectorAll('th,td');
      var row = [];
      for (var c = 0; c < cells.length; c++) row.push(cells[c].textContent.trim());
      rows.push(row);
    }
    return rows;
  }
  // Fallback for environments without DOMParser: crude regex extraction.
  var rows = [];
  var trMatches = text.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (var t = 0; t < trMatches.length; t++) {
    var cellMatches = trMatches[t].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || [];
    rows.push(cellMatches.map(function (c) {
      return c.replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
        .trim();
    }));
  }
  return rows;
}

onmessage = function (e) {
  var kind = e.data.kind;
  var buffer = e.data.buffer;
  var year = e.data.year || 2026;
  try {
    postMessage({ type: 'progress', pct: 5, label: 'Lecture du fichier...' });

    var rows;
    var bytes = new Uint8Array(buffer);
    var peekLen = Math.min(bytes.length, 512);
    var peekStr = '';
    for (var p = 0; p < peekLen; p++) peekStr += String.fromCharCode(bytes[p]);
    var isHtml = /^\s*<(!doctype|html|head|table|meta)/i.test(peekStr);

    if (isHtml) {
      postMessage({ type: 'progress', pct: 20, label: 'Fichier détecté comme export HTML...' });
      var decoder;
      try { decoder = new TextDecoder('iso-8859-1'); } catch (e1) { decoder = new TextDecoder('utf-8'); }
      var text = decoder.decode(buffer);
      rows = htmlTableToRows(text);
      if (!rows || !rows.length) {
        postMessage({ type: 'error', kind: kind, message: "Impossible de lire le tableau de ce fichier HTML." });
        return;
      }
      postMessage({ type: 'progress', pct: 45, label: 'Détection des colonnes...' });
    } else {
      postMessage({ type: 'progress', pct: 25, label: 'Conversion des lignes...' });
      var wb = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true });
      var sheetName = wb.SheetNames[0];
      var sheet = wb.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
      postMessage({ type: 'progress', pct: 45, label: 'Détection des colonnes...' });
    }

    var headerIdx = findHeaderRow(rows, HEADER_ANCHORS[kind]);
    if (headerIdx === -1) {
      postMessage({ type: 'error', kind: kind, message: 'Impossible de détecter la ligne d\'en-têtes dans ce fichier. Vérifie que c\'est bien le bon fichier pour ce slot.' });
      return;
    }

    var result;
    postMessage({ type: 'progress', pct: 55, label: 'Extraction des données BSH...' });
    if (kind === 'intervalo') result = processIntervalo(rows, headerIdx, year);
    else if (kind === 'infotech') result = processInfotech(rows, headerIdx);
    else if (kind === 'amplitude') result = processAmplitude(rows, headerIdx);
    else if (kind === 'consolidation') result = processConsolidation(rows, headerIdx, year);

    postMessage({
      type: 'done',
      kind: kind,
      data: result.data,
      totalRows: result.totalRows,
      keptRows: result.keptRows,
      missing: result.missing
    });
  } catch (err) {
    postMessage({ type: 'error', kind: kind, message: String(err && err.message ? err.message : err) });
  }
};

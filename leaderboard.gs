/**
 * Magnetball global leaderboard — Google Apps Script Web App.
 *
 * Paste this into your Sheet's Extensions → Apps Script, then
 * Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 * Copy the /exec URL into LB.endpoint in magnetball/index.html.
 *
 * Sheet tab must be named "Scores" with a header row:
 *   Timestamp | Name | RP | Country | Eyes | Colour
 * Columns are matched by header text, so order/extra columns are fine.
 *
 * A second tab "Replays" is created automatically the first time a clip is
 * saved (the game's "Save clip" posts the re-simulatable replay data there).
 *
 * Endpoints:
 *   GET  ?action=top&n=100                       → JSON array, sorted by RP desc
 *   GET  ?action=add&name=..&rp=..&country=..    → add/update a score (testing)
 *   GET  ?action=replays&n=20[&full=1]           → recent replays (metadata; full=1 includes data)
 *   POST name=..&rp=..&country=..&eyes=..&color=..           → add/update one score
 *   POST action=replay&name=..&field=..&frames=..&data=..    → store one replay
 */

var SHEET_NAME = 'Scores';
var HEADERS = ['Timestamp', 'Name', 'RP', 'Country', 'Eyes', 'Colour'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

// Map header label (lower-cased) → column index (0-based).
function colMap_(sh) {
  var row = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var m = {};
  row.forEach(function (h, i) { m[String(h).trim().toLowerCase()] = i; });
  return m;
}
function pick_(m, names) {
  for (var i = 0; i < names.length; i++) if (m[names[i]] != null) return m[names[i]];
  return -1;
}

function readRows_(n) {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var m = colMap_(sh);
  var iN = pick_(m, ['name', 'player']), iR = pick_(m, ['rp', 'points', 'score']),
      iF = pick_(m, ['country', 'flag']), iE = pick_(m, ['eyes']), iC = pick_(m, ['colour', 'color']);
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var out = [];
  data.forEach(function (r) {
    var name = iN >= 0 ? String(r[iN]).trim() : '';
    if (!name) return;
    out.push({
      name: name,
      rp: iR >= 0 ? Math.round(Number(r[iR]) || 0) : 0,
      country: iF >= 0 ? String(r[iF] || 'none') : 'none',
      eyes: iE >= 0 ? String(r[iE] || 'googly') : 'googly',
      color: iC >= 0 ? String(r[iC] || '') : '',
    });
  });
  out.sort(function (a, b) { return b.rp - a.rp; });
  return out.slice(0, n || 100);
}

// Upsert by name, keeping the highest RP for that player.
function addScore_(p) {
  var sh = sheet_();
  var name = String(p.name || '').trim().slice(0, 24);
  if (!name) return { ok: false, error: 'no name' };
  var rp = Math.round(Number(p.rp) || 0);
  var m = colMap_(sh);
  var iN = pick_(m, ['name', 'player']), iR = pick_(m, ['rp', 'points', 'score']),
      iF = pick_(m, ['country', 'flag']), iE = pick_(m, ['eyes']),
      iC = pick_(m, ['colour', 'color']), iT = pick_(m, ['timestamp', 'time', 'date']);
  var row = new Array(sh.getLastColumn()).fill('');
  if (iT >= 0) row[iT] = new Date();
  if (iN >= 0) row[iN] = name;
  if (iR >= 0) row[iR] = rp;
  if (iF >= 0) row[iF] = String(p.country || 'none');
  if (iE >= 0) row[iE] = String(p.eyes || 'googly');
  if (iC >= 0) row[iC] = String(p.color || '');

  // find an existing row for this name
  var last = sh.getLastRow(), foundRow = -1, foundRp = -Infinity;
  if (last >= 2 && iN >= 0) {
    var names = sh.getRange(2, iN + 1, last - 1, 1).getValues();
    var rps = iR >= 0 ? sh.getRange(2, iR + 1, last - 1, 1).getValues() : null;
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim().toLowerCase() === name.toLowerCase()) {
        foundRow = i + 2; foundRp = rps ? (Number(rps[i][0]) || 0) : -Infinity; break;
      }
    }
  }
  if (foundRow > 0) {
    if (rp > foundRp) sh.getRange(foundRow, 1, 1, row.length).setValues([row]); // only improve
    return { ok: true, updated: true };
  }
  sh.appendRow(row);
  return { ok: true, added: true };
}

// ---- Replays: re-simulatable goal clips stored as a compact data blob. The
// game's "Save clip" posts these (the video itself can't live in a Sheet). The
// Replays tab is created automatically on first write.
var REPLAY_SHEET = 'Replays';
var REPLAY_HEADERS = ['Timestamp', 'Name', 'Country', 'Field', 'Players', 'Frames', 'Data'];

function replaySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(REPLAY_SHEET);
  if (!sh) { sh = ss.insertSheet(REPLAY_SHEET); sh.appendRow(REPLAY_HEADERS); }
  else if (sh.getLastRow() === 0) sh.appendRow(REPLAY_HEADERS);
  return sh;
}

function addReplay_(p) {
  var data = String(p.data || '');
  if (!data) return { ok: false, error: 'no data' };
  if (data.length > 49000) return { ok: false, error: 'too big' };   // Sheet cell cap is 50k chars
  var sh = replaySheet_();
  sh.appendRow([
    new Date(),
    String(p.name || 'You').slice(0, 24),
    String(p.country || 'none'),
    String(p.field || ''),
    Math.round(Number(p.players) || 0),
    Math.round(Number(p.frames) || 0),
    data
  ]);
  return { ok: true, added: true, row: sh.getLastRow() - 1 };
}

// Recent replays. By default returns metadata only (no bulky Data column) unless
// full=1, so a listing stays light.
function readReplays_(n, full) {
  var sh = replaySheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var m = colMap_(sh);
  var iT = pick_(m, ['timestamp']), iN = pick_(m, ['name']), iF = pick_(m, ['country']),
      iFl = pick_(m, ['field']), iP = pick_(m, ['players']), iFr = pick_(m, ['frames']), iD = pick_(m, ['data']);
  var take = Math.min(n || 20, last - 1);
  var data = sh.getRange(last - take + 1, 1, take, sh.getLastColumn()).getValues();
  var out = [];
  data.forEach(function (r) {
    var o = { name: iN >= 0 ? r[iN] : '', country: iF >= 0 ? r[iF] : 'none',
      field: iFl >= 0 ? r[iFl] : '', players: iP >= 0 ? r[iP] : 0, frames: iFr >= 0 ? r[iFr] : 0,
      ts: iT >= 0 ? r[iT] : '' };
    if (full && iD >= 0) o.data = r[iD];
    out.push(o);
  });
  out.reverse();   // newest first
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'add') return json_(addScore_(p));
  if (p.action === 'replay') return json_(addReplay_(p));                 // GET add (testing)
  if (p.action === 'replays') return json_(readReplays_(parseInt(p.n, 10) || 20, p.full == '1'));
  var n = Math.min(500, Math.max(1, parseInt(p.n, 10) || 100));
  return json_(readRows_(n));
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  try {
    if (e && e.postData && e.postData.type === 'application/json') {
      p = JSON.parse(e.postData.contents) || p;
    }
  } catch (err) {}
  if (p.action === 'replay') return json_(addReplay_(p));
  return json_(addScore_(p));
}

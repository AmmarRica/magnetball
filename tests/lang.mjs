// LANGUAGES — six of them, applied by walking the DOM against a whitelist.
//
// ⚠️ **THE WHITELIST *IS* THE SAFETY MODEL.** Nothing is wrapped in an `L()` call; the
// menu's text is translated by walking it and replacing exact matches of known English
// strings. That means anything the table has never heard of cannot be touched — a
// player's typed name, a map they built, a country, a version stamp, a scoreline — which
// is exactly the failure a "translate what you see" walk would have. The suite therefore
// spends most of its length proving what is NOT translated.
//
// ⚠️ **THE ORIGINAL ENGLISH IS STASHED ON EACH NODE** and translation always runs from
// that, never from what is on screen. Without it, switching Spanish → French would look
// for "Ajustes" in a table keyed on "Settings", find nothing, and the first language you
// picked would be the last one you could pick. Measured as a round trip.
//
// ⚠️ **THE PASS RUNS LAST in `buildSettings`.** It ran before `buildSubTabs()` for one
// build and the chip rows were the only part of the menu still in English — a walk can
// only translate what is already in the DOM. Checked on a chip, not on a heading.
//
// ⚠️ MEASUREMENT TRAP: do not check "the menu changed". Nearly any bug still changes it.
// Every check below names the exact string it expects, in both directions.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:520, height:1000 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const $ = id => document.getElementById(id);
  const heads = () => [...document.querySelectorAll('#setup .card.collapsible > h2')]
    .map(h => h.textContent.trim().split('\n')[0].trim());
  const chips = g => [...document.querySelectorAll('.subtabs[data-tabs="' + g + '"] .subchip')]
    .map(c => c.textContent.trim());
  const setLang = k => { M.sel.lang = k; M.buildSettings(); };

  // ---- 1. the table itself -------------------------------------------------
  o.langs = Object.keys(M.LANGS).join(',');
  o.codes = M.LANG_CODES.join(',');
  o.rows = Object.keys(M.STRINGS).length;
  // ⚠️ Every row must carry one translation per code and none may be blank — a short row
  // is a string that silently stays English in one language only, which is the single
  // hardest thing to notice by looking at the screen.
  o.shortRows = Object.entries(M.STRINGS)
    .filter(([, v]) => !Array.isArray(v) || v.length !== M.LANG_CODES.length || v.some(x => !x))
    .map(([k]) => k);
  // ⚠️ Every code in LANG_CODES has to be a real entry in LANGS, or `L()` indexes a
  // column nobody can select and the tile for it does not exist.
  o.orphanCodes = M.LANG_CODES.filter(c => !M.LANGS[c]);
  // ⚠️ LATIN-1 ONLY, and this is a FONT constraint rather than taste: the UI face is
  // Kenney Mini Square, whose cmap stops at Latin-1 — plus it has no oe ligature. A glyph
  // past that falls back per character to system-ui and comes out as two typefaces in one
  // word, which is the thing nobody would think to look for.
  o.outsideLatin1 = [];
  for (const [k, v] of Object.entries(M.STRINGS))
    for (const t of v)
      for (const ch of t)
        if (ch.codePointAt(0) > 0x24F && ch.codePointAt(0) < 0x2000 && o.outsideLatin1.length < 6)
          o.outsideLatin1.push(k + ' → ' + ch);
  o.hasOeLigature = Object.values(M.STRINGS).some(v => v.some(t => /[œŒ]/.test(t)));

  // ---- 2. it actually translates ------------------------------------------
  setLang('en');
  o.enHeads = heads().join('|');
  o.enHasSettingsWords = /Display/.test(o.enHeads) && /Sound/.test(o.enHeads);
  setLang('es');
  o.esHeads = heads().join('|');
  o.esNamed = /Pantalla/.test(o.esHeads) && /Sonido/.test(o.esHeads) && /Tu jugador/.test(o.esHeads);
  o.esKick = document.querySelector('#matchCard > h2').textContent.trim().split('\n').map(x => x.trim()).join(' ');
  o.esKickNamed = /SAQUE/.test(o.esKick);
  // ⚠️ The chip rows, which is the check that catches the pass running too early.
  M.openSection('match');
  o.esChips = chips('match').join(',');
  o.esChipsNamed = o.esChips === 'Juego,Campo,Jugadores,Reglas';
  // ...and an ATTRIBUTE, which is a separate code path from the text nodes.
  o.esSearch = $('menuSearch').placeholder;
  o.esSearchNamed = /Buscar/.test(o.esSearch);
  // ⚠️ **A LEADING EMOJI IS SPLIT OFF AND PUT BACK.** The option tiles are labelled
  // "✨ On", "⊘ Off", "🚫 Off", "🔊 On" — the same handful of words behind a dozen
  // different pictures — so keying on the whole label would be a row per picture, all
  // saying "On", and a thirteenth tile arriving untranslated. `⊘` and `▶` need naming
  // explicitly: they are Math and Geometric characters, not emoji, so a pictographic-only
  // rule left "⊘ Off" in English beside a perfectly translated "✨ On".
  o.juiceTiles = [...document.querySelectorAll('#juicePick .opt')].map(t => t.textContent.trim()).join(',');
  o.emojiPrefixStripped = o.juiceTiles === '✨ Activado,⊘ Desactivado';
  // ...and the arrow that is PART of a key is not stripped, or the key is lost.
  o.backButton = M.L('← Back');
  o.arrowKeyIntact = o.backButton === '← Atrás';
  setLang('de');
  o.deHeads = heads().join('|');
  o.deNamed = /Anzeige/.test(o.deHeads) && /Einstellungen|Steuerung/.test(o.deHeads);

  // ---- 3. THE ROUND TRIP ---------------------------------------------------
  // The stash is what makes this possible at all: by now the DOM holds German, and the
  // table is keyed on English.
  setLang('fr');
  o.frNamed = /Affichage/.test(heads().join('|'));
  setLang('en');
  o.backToEn = heads().join('|');
  o.roundTrip = o.backToEn === o.enHeads;
  o.searchBackToEn = $('menuSearch').placeholder;
  o.attrRoundTrip = /Search settings/.test(o.searchBackToEn);

  // ---- 4. WHAT MUST NEVER BE TRANSLATED -----------------------------------
  setLang('es');
  // ⚠️ A person's own words. Every one of these is set to a string that IS in the table,
  // which is the only version of this check worth running: a name of "Kai" would pass on
  // a build that translates every name it can.
  // ⚠️ Measured on what is RENDERED, not on the model. A build with no walk at all leaves
  // the model alone, so `M.profile.name === 'Season'` passes on every build ever written —
  // it proves nothing. What has to hold is that the name survives being drawn: the walk
  // sees a text node reading exactly "Season", which IS in the table, and must still leave
  // it alone because a person typed it.
  M.profile.name = 'Season'; M.saveProfile && M.saveProfile();
  o.profileUntouched = M.profile.name === 'Season';
  // ⚠️ THE NAME BOOK is where a typed name is rendered ALONE in its own text node, which
  // is the only shape the walk can actually mangle — a match-history row joins the names
  // with ", " and the joined string is in no table. So the exposure is measured where it
  // exists, not where it is easiest to reach.
  M.noteNameResult('Season', 1, 3, 1, null, 1100, Date.now());
  M.noteNameResult('Off', 0, 1, 3, null, 1100, Date.now());
  M.renderStats();
  M.buildSettings();
  o.bookText = (document.getElementById('nameBook') || {}).textContent || '';
  o.bookKeptTypedNames = /Season/.test(o.bookText) && /Off/.test(o.bookText)
                      && !/Temporada/.test(o.bookText) && !/Desactivado/.test(o.bookText);
  M.matchLog.length = 0;
  M.noteMatch(Object.assign({}, M.world, {
    players: [{ team:0, ctrl:'human1', name:'Season' }, { team:1, ctrl:'human1', name:'Off' }],
    score: [1, 0], demo:false, drillMode:false, watch:false, cup:null, season:null, rogue:null,
  }), 5, 'w');
  // ⚠️ `openStats` ONLY — it builds the screen and then walks it, which is the path a
  // player takes. Calling `buildMatchLog()` again afterwards would redraw the rows in
  // fresh English with nothing walking them, and the check would then pass on every build
  // ever written because the walk never reached the row at all. (That is exactly what it
  // did for one revision, and a sabotage of the marking passed.)
  M.openStats();
  // The heading proves the screen really was walked, which is what makes the row check
  // below mean something.
  o.statsHeadings = [...document.querySelectorAll('#stats .card > h2')].map(h => h.textContent.trim()).join('|');
  o.statsScreenWalked = /Historial de partidos/.test(o.statsHeadings);
  // ⚠️ ...and a probe on something WRITTEN AS THE SCREEN OPENS, not on its static markup.
  // Every screen sits in the document from boot, so the body-wide pass at the end of
  // `buildSettings` already translated the headings above — they would read Spanish on a
  // build with no screen-level walk at all. `cupSub` is filled in by `buildCupScreen`,
  // which only runs inside `dockOrFull`, so it can only be Spanish if that pass exists.
  M.cup.size = 8; M.cupFill(); M.cupLock(true); M.cup.won = [];
  M.openCup();
  o.cupSub = ($('cupSub') || {}).textContent || '';
  o.builtScreenWalked = /Cuartos de final/.test(o.cupSub);
  M.cupLock(false);
  // ⚠️ Read off the WHOLE row, never off the `[data-noi18n]` marker: querying the marker
  // makes the check pass-by-absence — remove the marking and the selector finds nothing,
  // which reads as "" and fails for the wrong reason rather than for the right one. The
  // row text has to contain the names as typed, and must not contain their translations.
  o.renderedRow = (document.querySelector('#matchLogList div[style*="border-top"]') || {}).textContent || '';
  o.typedNamesSurviveTheWalk = /Season, Off/.test(o.renderedRow)
                            && !/Temporada/.test(o.renderedRow)
                            && !/Desactivado/.test(o.renderedRow);
  // ...and a field somebody built and called after a word in the table.
  M.maps = M.maps || {};
  // ...the version stamp and the changelog, both marked out of the walk.
  M.openLook && M.openLook('about');
  o.ver = ($('ver') || {}).textContent || '';
  o.verUntouched = /^v?\d{8}\./.test(o.ver);
  // ...and a scoreline, which is numbers the player watched all match.
  M.sel.lobby = 'off'; M.sel.autoReplay = false;
  M.setMatchSeed(9); M.startMatch();
  { const w = M.world; w.state = 'play'; w.stateT = 1; w.score = [3, 1];
    M.endMatch(w); M.finishMatch(w);
    o.scoreOnScreen = [...document.querySelectorAll('#ovStats .ovsnum')].map(x => x.textContent).join('-');
    o.scoreUntouched = o.scoreOnScreen === '3-1';
    // ...while the TITLE over it is translated, which is what proves the overlay is walked
    // at all rather than simply being skipped.
    o.title = (document.querySelector('#overlay h2') || {}).textContent || '';
    o.titleTranslated = /GANAS|PIERDES|EMPATE/.test(o.title);
    document.getElementById('overlay').classList.remove('show');
  }
  // ...and the words the pitch shouts, through the one funnel every caller uses.
  M.showBanner('GOAL!', '#fff');
  o.banner = $('banner').textContent;
  o.bannerTranslated = o.banner === '¡GOL!';
  M.showBanner('NOT IN THE TABLE', '#fff');
  o.unknownBanner = $('banner').textContent;
  o.unknownPassesThrough = o.unknownBanner === 'NOT IN THE TABLE';

  // ⚠️ IN ENGLISH THE WALK IS FREE, and switching back still restores everything. Both
  // halves matter: the skip is a real skip (measured), and the pass that HAS to run —
  // the first one after coming back from another language — still does, which is what
  // the round trip above already proved.
  {
    setLang('es'); setLang('en');
    const t0 = performance.now(); for (let i = 0; i < 20; i++) M.translateDom();
    o.walkEnMs = +((performance.now() - t0) / 20).toFixed(3);
    setLang('es');
    const t1 = performance.now(); for (let i = 0; i < 20; i++) M.translateDom();
    o.walkEsMs = +((performance.now() - t1) / 20).toFixed(3);
    o.englishIsFree = o.walkEnMs < 0.5 && o.walkEsMs > o.walkEnMs;
  }

  // ---- 5. the picker ------------------------------------------------------
  setLang('en');
  M.openLook && M.openLook('display');
  const tiles = [...document.querySelectorAll('#langPick .opt')].map(t => t.textContent.trim());
  o.tiles = tiles.join(',');
  // ⚠️ Labelled in the language they SELECT, never in the one you are reading. Somebody
  // who cannot read the current language is exactly the person reaching for this control,
  // so a tile reading "Spanish" is unreadable to the one person who needs it.
  o.tilesAreNative = /Español/.test(o.tiles) && /Français/.test(o.tiles)
                  && /Deutsch/.test(o.tiles) && !/Spanish/.test(o.tiles);
  o.tileCount = tiles.length;
  o.tilesMatchTable = tiles.length === Object.keys(M.LANGS).length;
  // ⚠️ `auto` is the default and follows the browser — a Spanish phone should not need a
  // setting found to be spoken to in Spanish.
  o.defaultIsAuto = M.defaultSel().lang === 'auto';
  o.autoReadsTheBrowser = (() => { M.sel.lang = 'auto'; return M.langKey(); })();
  // ...and an unknown code cannot break the game: it falls back to English.
  o.junkFallsBack = (() => { M.sel.lang = 'zz'; const k = M.langKey();
                             M.sel.lang = 'auto'; return k; })();

  M.sel.lang = 'en'; M.setMatchSeed(null);
  return o;
});

ok('six languages plus English and Automatic', r.tileCount === 7 && r.tilesMatchTable, r.langs);
ok('every code has an entry', !r.orphanCodes.length, r.orphanCodes.join(','));
ok('every row is complete', !r.shortRows.length,
   r.shortRows.slice(0,6).join(', ') + ' — a short row is a string that stays English in one language only, which is the hardest kind to spot');
ok('the table stays inside Latin-1', !r.outsideLatin1.length,
   r.outsideLatin1.join(', ') + ' — the UI face covers Latin-1 and nothing beyond it, so a glyph past that mixes two typefaces inside one word');
ok('...and uses no oe ligature', !r.hasOeLigature, 'the shipped font has no oe glyph');
ok('English is English', r.enHasSettingsWords, r.enHeads);
ok('Spanish names the cards', r.esNamed, r.esHeads);
ok('...and the hero button', r.esKickNamed, r.esKick);
ok('...and the chip rows', r.esChipsNamed,
   r.esChips + ' — the pass has to be the LAST thing buildSettings does, or the chips are the one part left in English');
ok('...and an attribute', r.esSearchNamed, r.esSearch);
ok('an emoji prefix is split off and put back', r.emojiPrefixStripped,
   r.juiceTiles + ' — one table row for "On" has to cover every ✨/⊘/🚫/🔊 tile, or a thirteenth picture arrives untranslated');
ok('...but an arrow that is part of a key is not', r.arrowKeyIntact, r.backButton);
ok('German too', r.deNamed, r.deHeads);
ok('French too', r.frNamed);
ok('switching back to English restores it exactly', r.roundTrip,
   'the original is stashed on each node — without it the first language you picked is the last one you could pick');
ok('...attributes included', r.attrRoundTrip, r.searchBackToEn);
ok('a screen built on the way in is walked', r.builtScreenWalked,
   'the bracket said "' + r.cupSub + '" — this is written by buildCupScreen inside dockOrFull, so it is the half a body-wide pass at boot cannot reach');
ok('every screen is walked, not just the menu', r.statsScreenWalked,
   r.statsHeadings + ' — the pass at the end of buildSettings only ever reached the main menu, so the career screen, the drills list and the tournament stayed in English');
ok('a typed name is never translated', r.profileUntouched && r.typedNamesSurviveTheWalk
   && r.bookKeptTypedNames,
   'the name book rendered "' + String(r.bookText).replace(/\s+/g, ' ').slice(0, 90) +
   '" and the history row "' + r.renderedRow +
   '" — the names are deliberately "Season" and "Off", both of which ARE in the table, and both are drawn into the DOM where the walk can reach them');
ok('the version stamp is never translated', r.verUntouched, r.ver);
ok('a scoreline is never translated', r.scoreUntouched, r.scoreOnScreen);
ok('...while the title over it IS', r.titleTranslated,
   'it said "' + r.title + '" — without this the scoreline check passes on a build that skips the overlay entirely');
ok('the pitch shouts in the language', r.bannerTranslated, r.banner);
ok('...and anything unknown passes straight through', r.unknownPassesThrough, r.unknownBanner);
ok('the tiles are labelled in their own language', r.tilesAreNative, r.tiles);
ok('Automatic is the default and reads the browser', r.defaultIsAuto && !!r.autoReadsTheBrowser,
   'auto resolved to ' + r.autoReadsTheBrowser);
ok('an unknown code falls back to English', r.junkFallsBack === 'en', r.junkFallsBack);
ok('the walk costs nothing in English', r.englishIsFree,
   r.walkEnMs + 'ms English vs ' + r.walkEsMs + 'ms Spanish — it runs on every option tap, and an unskipped walk measured 5.6ms against buildSettings\' own 24ms; requiring Spanish to be SLOWER is what stops "0ms" being true of a walk that never runs at all');
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL lang\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS lang');

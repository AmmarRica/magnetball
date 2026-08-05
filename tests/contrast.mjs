// No text sits on a colour too close to it. Walks every visible label on every
// screen under every theme, composites what's actually behind it, and holds the
// pair to WCAG AA (4.5:1, or 3:1 for large text).
//
// The background has to be COMPOSITED, not read off the element: the page paints
// with a gradient (so backgroundColor is transparent) and panels/pills are rgba.
// An earlier version of this walk fell back to white and reported ~90 phantom
// failures per theme while missing the real ones.
import { chromium, LAUNCH, stubLeaderboard } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:1000} });
// This suite opens the Leaderboard, which fetches a public Google Sheet.
// Serve it locally so the run is hermetic — see stubLeaderboard.
await stubLeaderboard(p, [{n:'Ada', rp:900}, {n:'Grace', rp:800}]);
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const out = await p.evaluate(async ()=>{
  const M=window.__magnet; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const parse = s => { const m=/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s||'');
    return m ? {r:+m[1],g:+m[2],b:+m[3],a:m[4]==null?1:+m[4]} : null; };
  const over = (fg,bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a),
                             b: fg.b*fg.a + bg.b*(1-fg.a), a:1 });
  const hex = c => '#'+[c.r,c.g,c.b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  const pageCol = () => { const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg').trim();
    return /^#[0-9a-f]{6}$/i.test(v)
      ? { r:parseInt(v.slice(1,3),16), g:parseInt(v.slice(3,5),16), b:parseInt(v.slice(5,7),16), a:1 }
      : (parse(v) || {r:0,g:0,b:0,a:1}); };
  const bgOf = el => {
    const page = pageCol(); const stack=[]; let node = el, opaque = false;
    while (node && !opaque){
      const cs = getComputedStyle(node);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0){ stack.push(c); if (c.a >= 0.999) opaque = true; }
      if (!opaque && /gradient/.test(cs.backgroundImage||'')){ stack.push(page); opaque = true; }
      node = node.parentElement;
    }
    let base = opaque ? stack.pop() : page;
    for (let i=stack.length-1;i>=0;i--) base = over(stack[i], base);
    return base;
  };
  const bad = [];
  const scan = (theme, screen, root) => {
    (root ? [root] : [...document.querySelectorAll('body *')]).forEach(el=>{
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const cs = getComputedStyle(el);
      if (!el.offsetParent && cs.position !== 'fixed') return;   // display:none subtree
      if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
      // Mid-animation samples are meaningless: the goal banner fades 0→1→0, so any
      // frame of the fade "fails" by construction. It gets its own check below.
      if (el.getAnimations && el.getAnimations().some(a=>a.playState==='running')) return;
      const txt = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
      if (!txt) return;
      const fg = parse(cs.color); if (!fg) return;
      const bgc = bgOf(el);
      const eff = over({...fg, a: fg.a * +cs.opacity}, bgc);
      const ratio = M.contrastRatio(hex(eff), hex(bgc));
      const px = parseFloat(cs.fontSize);
      const need = (px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700)) ? 3 : 4.5;
      if (ratio < need) bad.push({ theme, screen, txt: txt.slice(0,24),
        sel:(el.id?'#'+el.id:'')+'.'+String(el.className).slice(0,24),
        ratio:+ratio.toFixed(2), need, px, fg:hex(eff), bg:hex(bgc) });
    });
  };
  const screens = ['openStats','openHow','openShop','openSocial','openDrills','openSeason',
                   'openRogue','openLeaderboard','openDailyView','openCocktailCfg','openPadConfig'];
  let scanned = 0;
  for (const key of Object.keys(M.THEMES)){
    M.applyTheme(key); M.buildSettings(); M.updatePreview();
    document.querySelectorAll('.card.collapsible').forEach(c=>c.classList.remove('collapsed'));
    // body transitions colour over .2s — sampling sooner reads the OLD theme's ink
    // and invents failures that vanish a frame later.
    await wait(320);
    scan(key, 'menu'); scanned++;
    for (const s of screens){
      if (!M[s]) continue;
      try { M[s](); } catch(e){ continue; }
      await wait(320); scan(key, s); scanned++;
      try { M.toMenu(); } catch(e){}
      await wait(40);
    }
  }
  // The GOAL! banner prints over the COURT, which the DOM walk can't see, and the
  // court changes again when you pick ice or mud. It survives by being outlined in
  // the opposite ink — so assert the outline exists and separates from the fill.
  const banner = [];
  for (const key of Object.keys(M.THEMES)){
    M.applyTheme(key); await wait(60);
    for (const c of ['var(--red)','var(--cyan)']){
      M.showBanner('GOAL!', c);
      const el = document.getElementById('banner'), cs = getComputedStyle(el);
      const fill = hex(parse(cs.color));
      const stroke = hex(parse(cs.webkitTextStrokeColor));
      const w2 = parseFloat(cs.webkitTextStrokeWidth);
      banner.push({ theme:key, fill, stroke, w:w2,
        ok: w2 >= 2 && M.contrastRatio(fill, stroke) >= 3 });
    }
  }
  document.getElementById('banner').classList.remove('show');

  // The walk has to be able to FAIL, or "0 findings" means nothing. Paint a label
  // in its own background colour and confirm it gets caught.
  const probe = document.createElement('div');
  probe.textContent = 'invisible'; probe.style.cssText =
    'position:fixed;left:0;top:0;width:120px;height:20px;font-size:12px;background:#333333;color:#3a3a3a;z-index:99';
  document.body.appendChild(probe);
  const before = bad.length; scan('probe','probe', probe);
  const catches = bad.length > before;
  probe.remove();
  return { bad: bad.slice(0, 24), count: bad.length - (catches ? 1 : 0), scanned, catches,
           banner, bannerOk: banner.every(x=>x.ok), themes: Object.keys(M.THEMES).length };
});

console.log(JSON.stringify(out, null, 1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = out.count === 0 && out.catches === true && out.bannerOk === true &&
  out.scanned >= out.themes * 6 && errors.length === 0;
if(!ok && out.count) console.log('FAILED: ' + out.count + ' low-contrast labels');
if(!out.bannerOk) console.log('FAILED banner:', out.banner.filter(x=>!x.ok));
if(!out.catches) console.log('FAILED: the walk cannot detect a known-bad pair');
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);

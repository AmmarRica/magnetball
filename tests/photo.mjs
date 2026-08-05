// Your own photo as a faceplate — uploaded, or taken with the camera.
//
// Two things carry the weight here. First, RESOLUTION: a phone photo is megabytes
// and localStorage holds about five in total, so importing the original would break
// saving outright. It is stored at the size it is drawn at. Second, PRIVACY: the
// picture must never leave the device, so the leaderboard payload is inspected
// rather than assumed.
//
// The camera itself can't be exercised headlessly, so what's asserted there is the
// part that matters: it degrades to Upload instead of dead-ending.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:560,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.showSubTab('player','photo');

  // A deliberately WIDE, deliberately huge source: 1600×900 of solid magenta with a
  // green left edge. Wide so the centre-crop is provable, huge so the downscale is.
  const src = document.createElement('canvas'); src.width = 1600; src.height = 900;
  const sc = src.getContext('2d');
  sc.fillStyle = '#c000c0'; sc.fillRect(0,0,1600,900);
  sc.fillStyle = '#00c000'; sc.fillRect(0,0,200,900);        // only in the outer third
  o.sourceSize = [src.width, src.height];

  // ---- import: stored at the drawn size, not the camera's ------------------
  M.setPhoto(M.photoFrom(src, src.width, src.height));
  await wait(120);
  const url = M.profile.photo;
  o.stored = !!url && /^data:image\/jpe?g/.test(url);
  o.declaredSize = M.PHOTO.size;
  const im = new Image(); im.src = url;
  await new Promise(res => { im.onload = res; im.onerror = res; });
  o.decodedSize = [im.naturalWidth, im.naturalHeight];
  o.isSquareAtDeclaredSize = im.naturalWidth === M.PHOTO.size && im.naturalHeight === M.PHOTO.size;
  // Bytes: a data URL is ~4/3 of the payload. The whole point is that this fits in
  // localStorage alongside everything else, so put a real ceiling on it.
  o.bytes = Math.round(url.length * 3 / 4);
  o.smallEnoughToStore = o.bytes < 40 * 1024;
  // Centre-cropped, not squashed: the green edge was outside the middle square.
  const probe = document.createElement('canvas'); probe.width = probe.height = M.PHOTO.size;
  const pc = probe.getContext('2d'); pc.drawImage(im, 0, 0);
  const px = (x,y) => { const d = pc.getImageData(x,y,1,1).data; return [d[0],d[1],d[2]]; };
  o.centre = px(64,64); o.leftEdge = px(3,64);
  o.croppedNotSquashed = o.centre[0] > 120 && o.centre[2] > 120 && o.centre[1] < 90 &&
                         o.leftEdge[1] < 160;   // no green survived the crop

  // ---- it becomes your face, and it is drawn ------------------------------
  o.wornAutomatically = M.profile.flag === 'photo';
  const cv = document.createElement('canvas'); cv.width = cv.height = 80;
  const c2 = cv.getContext('2d');
  M.drawDisc(c2, 40, 40, 30, { color:'#46d17a', flag:'photo', eyes:'googly', cap:'none' });
  const face = c2.getImageData(40, 40, 1, 1).data;
  o.facePixel = [face[0], face[1], face[2]];
  o.photoIsDrawn = face[0] > 90 && face[2] > 90 && face[1] < face[0] - 40;   // magenta, not the green plate
  // ...and it reaches an actual match without a restart.
  M.sel.mode='1v1'; M.startMatch();
  const me = M.world.players.find(q=>q.ctrl==='human1');
  o.reachesThePitch = me && me.flag === 'photo';

  // ---- PRIVACY: the picture never leaves the device ------------------------
  // Inspect the real payload builder rather than trusting the shape of it.
  const sent = [];
  const realFetch = window.fetch;
  window.fetch = (u, opt) => { sent.push(String((opt && opt.body) || '') + ' ' + String(u)); return Promise.reject(new Error('blocked')); };
  M.LB.endpoint = 'https://example.invalid/exec';
  await M.lbSubmit();
  M.LB.endpoint = '';
  window.fetch = realFetch;
  o.submitted = sent.length;
  o.payloadHasNoImage = sent.every(t => !/data:image/.test(t) && !/base64/.test(t));
  o.payloadSaysPhoto = sent.some(t => /country=photo/.test(t));

  // ---- persistence, and removal --------------------------------------------
  o.persisted = (JSON.parse(localStorage.getItem('magnetball.profile')||'{}').photo || '') === url;
  M.setPhoto('');
  o.removedData = !M.profile.photo;
  o.removedFace = M.profile.flag !== 'photo';        // falls back rather than a blank plate
  // Restore, then check Reset look clears it too — a photo is part of your look.
  M.setPhoto(M.photoFrom(src, src.width, src.height));
  document.getElementById('lookReset').click();
  o.resetClearsPhoto = !M.profile.photo && M.profile.flag !== 'photo';

  // ---- the two ways in -----------------------------------------------------
  M.showSubTab('player','photo'); M.buildPhotoPane();
  const labels = () => [...document.querySelectorAll('#photoPane .photobtns button')].map(x=>x.textContent);
  o.buttons = labels();
  o.hasUpload = o.buttons.some(t=>/upload/i.test(t));
  o.hasCamera = o.buttons.some(t=>/take photo/i.test(t));
  const fileInput = document.getElementById('photoFile');
  o.fileInputAcceptsImages = !!fileInput && /image/.test(fileInput.accept);
  // A refused or missing camera must leave Upload working, not dead-end.
  const realGUM = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (navigator.mediaDevices){
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no'), {name:'NotAllowedError'}));
    await M.startPhotoCam(); await wait(60);
    o.refusalMessage = (document.getElementById('photoMsg')||{}).textContent || '';
    o.saysUploadStillWorks = /upload/i.test(o.refusalMessage);
    o.uploadSurvivesRefusal = labels().some(t=>/upload/i.test(t));
    navigator.mediaDevices.getUserMedia = realGUM;
  } else { o.saysUploadStillWorks = true; o.uploadSurvivesRefusal = true; }
  M.stopPhotoCam();
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.stored, 'the photo was not stored as an image data URL');
ok(r.isSquareAtDeclaredSize, `stored at ${JSON.stringify(r.decodedSize)}, not ${r.declaredSize}² — a camera-sized image would blow the localStorage quota`);
ok(r.smallEnoughToStore, `stored photo is ${r.bytes} bytes, too big to keep alongside everything else`);
ok(r.croppedNotSquashed, `a ${r.sourceSize[0]}×${r.sourceSize[1]} source was squashed rather than centre-cropped: centre ${JSON.stringify(r.centre)}, edge ${JSON.stringify(r.leftEdge)}`);
ok(r.wornAutomatically, 'importing a photo did not put it on');
ok(r.photoIsDrawn, `the disc does not show the photo: ${JSON.stringify(r.facePixel)}`);
ok(r.reachesThePitch, 'the photo did not reach a live match');
ok(r.submitted > 0, 'no leaderboard submission was attempted, so the privacy check proves nothing');
ok(r.payloadHasNoImage, 'the photo was included in a leaderboard submission');
ok(r.payloadSaysPhoto, 'the submission does not carry the faceplate choice at all');
ok(r.persisted, 'the photo was not saved');
ok(r.removedData && r.removedFace, 'removing the photo left it set or left a blank plate');
ok(r.resetClearsPhoto, 'Reset look left the photo on');
ok(r.hasUpload, `no Upload button: ${JSON.stringify(r.buttons)}`);
ok(r.hasCamera, `no Take photo button: ${JSON.stringify(r.buttons)}`);
ok(r.fileInputAcceptsImages, 'the file input does not ask for images');
ok(r.saysUploadStillWorks, `a refused camera does not point at Upload: "${r.refusalMessage}"`);
ok(r.uploadSurvivesRefusal, 'a refused camera left the pane with no way in');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nphoto OK');

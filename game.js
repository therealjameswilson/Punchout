
const cfg = await fetch('./config.json').then(r=>r.json());
const c = document.getElementById('game');
const ctx = c.getContext('2d', { alpha:false });
const SCALE = cfg.canvas.scale || 3;
c.style.width = (c.width*SCALE)+'px';
c.style.height = (c.height*SCALE)+'px';

const hudEl = document.getElementById('hud');
const nextBtn = document.getElementById('nextBtn');

function loadImage(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src=src; }); }

// Assets
const playerImg = await loadImage(cfg.player.image);
const frusCover = await loadImage(cfg.meta.frus_cover);

const opponents = [];
for (const o of cfg.opponents){ const img = await loadImage(o.image); opponents.push({...o, img}); }

let opponentIndex = 0;
let op = opponents[opponentIndex];

nextBtn.onclick = ()=>{ opponentIndex = (opponentIndex+1)%opponents.length; op = opponents[opponentIndex]; resetFight(); };

// Input
const keys = {};
addEventListener('keydown', e=>{ keys[e.key] = true; if (state==='TITLE' && e.key==='Enter') startFight(); if (state==='WIN' && e.key==='Enter') state='TITLE'; });
addEventListener('keyup', e=>{ keys[e.key] = false; });
c.addEventListener('click', ()=>{ if (state==='TITLE') startFight(); });

// Helpers
function sliceDraw(img, grid, index, dx, dy, dw, dh){
  const fw = Math.floor(img.width / grid.cols), fh = Math.floor(img.height / grid.rows);
  const sx = (index % grid.cols) * fw; const sy = Math.floor(index / grid.cols) * fh;
  ctx.drawImage(img, sx, sy, fw, fh, dx, dy, dw, dh);
}
function animFrame(seq, t, ms){ if (!seq || !seq.length) return 0; return seq[Math.floor(t/ms)%seq.length];}
function textBanner(str){ ctx.fillStyle=cfg.style.banner_bg; ctx.fillRect(0,0,c.width,18); ctx.fillStyle=cfg.style.banner_fg; ctx.font='bold 8px monospace'; ctx.fillText(str, 6, 12); }

// Entities
const player = { x: 110, y: 150, w: 36, h: 60, state:'idle', t:0, hearts: cfg.hud.hearts_start, stamina:100, stars:0, invuln:0 };
const foe    = { x: 90, y: 50,  w: 76, h: 90, state:'idle', t:0, stamina:100, kd:0, name: op.name };

function resetFight(){ player.state='idle'; player.t=0; player.hearts=cfg.hud.hearts_start; player.stamina=100; player.invuln=0; player.stars=0; foe.state='idle'; foe.t=0; foe.stamina=100; foe.name=op.name; }

// States
let state = 'TITLE'; // TITLE → FIGHT → WIN
let last = performance.now();
let tickerIdx = 0; let tickerT = 0;

requestAnimationFrame(loop);
function startFight(){ resetFight(); state='FIGHT'; }

function loop(now){ const dt = now-last; last=now; update(dt); render(); requestAnimationFrame(loop); }

function update(dt){
  tickerT += dt;
  if (tickerT > 3500){ tickerT = 0; tickerIdx = (tickerIdx+1) % cfg.meta.ticker.length; }

  if (state==='TITLE' || state==='WIN'){ return; }

  if (keys['a']||keys['A']) startPlayer('jab_left');
  if (keys['s']||keys['S']) startPlayer('jab_right');
  if (keys['ArrowLeft']) startPlayer('dodge_left');
  if (keys['ArrowRight']) startPlayer('dodge_right');
  if (keys['ArrowDown']) startPlayer('duck');
  if (keys['Enter']) startPlayer('star');

  player.t += dt; foe.t += dt; if (player.invuln>0) player.invuln -= dt;

  const P = cfg.tuning.player;
  if (player.state==='jab_left' || player.state==='jab_right'){
    const t = player.t;
    if (t < P.jab_startup_ms){}
    else if (t < P.jab_startup_ms + P.jab_active_ms){
      if (rectOverlap(playerHitbox(), foeHurtbox())) foe.stamina -= cfg.tuning.player_damage*dt/100;
    } else if (t < P.jab_startup_ms + P.jab_active_ms + P.jab_recovery_ms){} 
    else { player.state='idle'; player.t=0; }
  }
  if (player.state==='dodge_left' || player.state==='dodge_right' || player.state==='duck'){ if (player.t>260){ player.state='idle'; player.t=0; } }
  if (player.state==='star'){ if (player.t<200){} else if (player.t<320){ if (rectOverlap(playerStarHitbox(), foeHurtbox())) foe.stamina -= 20*dt/100; } else if (player.t<800){} else { player.state='idle'; player.t=0; } }

  if (foe.state==='idle'){ if (foe.t > op.ai.tell_ms + 200){ foe.state='tell'; foe.t=0; } }
  else if (foe.state==='tell'){ if (foe.t > op.ai.tell_ms){ foe.state='attack'; foe.t=0; } }
  else if (foe.state==='attack'){ if (!player.invuln && rectOverlap(foeHitbox(), playerHurtbox())){ player.hearts = Math.max(0, player.hearts-1); } if (foe.t > op.ai.active_ms){ foe.state='recover'; foe.t=0; } }
  else if (foe.state==='recover'){ if (foe.t > op.ai.recovery_ms){ foe.state='idle'; foe.t=0; } }

  if (foe.stamina<=0){ state='WIN'; }
  if (player.hearts<=0){ player.state='winded'; if (player.t>cfg.hud.winded_ms){ player.hearts=5; player.state='idle'; player.t=0; } }

  hudEl.textContent = `Opponent: ${foe.name} | Hearts: ${player.hearts} | Stars: ${player.stars} | Opp Stamina: ${Math.max(0,foe.stamina|0)} — Read the FRUS volume at ${cfg.meta.frus_link}`;
}

// Hitboxes
function rectOverlap(a,b){ return !(a.x2<b.x1 || a.x1>b.x2 || a.y2<b.y1 || a.y1>b.y2); }
function playerHurtbox(){ return {x1:120,y1:150,x2:150,y2:200}; }
function playerHitbox(){   return {x1:150,y1:140,x2:176,y2:180}; }
function playerStarHitbox(){ return {x1:140,y1:120,x2:190,y2:180}; }
function foeHurtbox(){ return {x1:100,y1:70,x2:160,y2:140}; }
function foeHitbox(){ return {x1:110,y1:130,x2:150,y2:190}; }

function render(){
  if (state==='TITLE'){ return renderTitle(); }
  if (state==='WIN'){ return renderWin(); }

  // Ruby red bukram ring
  ctx.fillStyle=cfg.style.ring_mat; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle=cfg.style.ring_mat_line; ctx.fillRect(0,120,c.width,2);

  // FRUS ticker banner
  textBanner(cfg.meta.ticker[tickerIdx]);

  // Opponent
  let opSeq = op.animations.idle;
  if (foe.state==='tell') opSeq = op.animations.tell;
  else if (foe.state==='attack') opSeq = op.animations.punch;
  else if (foe.state==='recover') opSeq = op.animations.hit;
  const opFrame = animFrame(opSeq, foe.t, 140);
  sliceDraw(op.img, op.grid, opFrame, foe.x, foe.y, foe.w, foe.h);

  // Player
  let pSeq = cfg.player.animations.idle;
  if (player.state==='jab_left') pSeq = cfg.player.animations.jab_left;
  else if (player.state==='jab_right') pSeq = cfg.player.animations.jab_right;
  else if (player.state==='dodge_left') pSeq = cfg.player.animations.dodge_left;
  else if (player.state==='dodge_right') pSeq = cfg.player.animations.dodge_right;
  else if (player.state==='duck') pSeq = [0];
  else if (player.state==='star') pSeq = cfg.player.animations.star;
  const pFrame = animFrame(pSeq, player.t, cfg.player.frame_ms);
  sliceDraw(playerImg, cfg.player.grid, pFrame, player.x, player.y, player.w, player.h);
}

function renderTitle(){
  ctx.fillStyle=cfg.style.ring_mat; ctx.fillRect(0,0,c.width,c.height);
  const W=110,H=160,x=(c.width-W)/2,y=28;
  ctx.fillStyle='#00000066'; ctx.fillRect(x-4,y-4,W+8,H+8);
  ctx.drawImage(frusCover, x, y, W, H);

  ctx.fillStyle='#fff'; ctx.font='bold 14px monospace'; ctx.fillText(cfg.meta.game_title, 14, 18);
  ctx.font='bold 10px monospace'; ctx.fillStyle=cfg.style.banner_fg; ctx.fillText('Press ENTER to Start', 58, 206);
  ctx.font='8px monospace'; ctx.fillStyle='#fff'; wrapText(`Featuring the new ${cfg.meta.frus_title}.`, 12, 196, 232, 9);
}

function renderWin(){
  ctx.fillStyle=cfg.style.ring_mat; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#fff'; ctx.font='bold 14px monospace'; ctx.fillText('TKO! BOB LINHARD WINS', 30, 24);
  ctx.font='8px monospace'; ctx.fillText('Read the volume now:', 66, 44);
  ctx.fillStyle=cfg.style.banner_fg; ctx.fillText(cfg.meta.frus_link, 10, 58);

  // Player victory frame
  const pFrame = cfg.player.animations.victory?.[0] ?? 15;
  sliceDraw(playerImg, cfg.player.grid, pFrame, 108, 110, 40, 64);

  // Cover thumbnail
  ctx.drawImage(frusCover, 10, 80, 80, 112);

  ctx.fillStyle='#fff'; ctx.font='bold 10px monospace'; ctx.fillText('Press ENTER for Title', 60, 224);
}

// text wrap
function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(' '); let line = '';
  for (let n=0;n<words.length;n++){
    const test = line + words[n] + ' '; const w = ctx.measureText(test).width;
    if (w > maxWidth && n>0){ ctx.fillText(line, x, y); line = words[n] + ' '; y += lineHeight; }
    else { line = test; }
  }
  ctx.fillText(line, x, y);
}

function startPlayer(action){
  if (player.state!=='idle') return;
  if (action==='jab_left'){ player.state='jab_left'; player.t=0; }
  if (action==='jab_right'){ player.state='jab_right'; player.t=0; }
  if (action==='dodge_left'){ player.state='dodge_left'; player.t=0; player.invuln = cfg.tuning.player.dodge_invuln_ms; }
  if (action==='dodge_right'){ player.state='dodge_right'; player.t=0; player.invuln = cfg.tuning.player.dodge_invuln_ms; }
  if (action==='duck'){ player.state='duck'; player.t=0; player.invuln = 180; }
  if (action==='star' && player.stars>0){ player.state='star'; player.t=0; player.stars--; }
}

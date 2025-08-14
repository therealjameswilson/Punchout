// Bob Linhard’s Punch‑Out!! game script
// This file is a patched version of the original game.js from
// https://github.com/therealjameswilson/Punchout.  It adds a small
// compatibility shim so that the game can run with the new
// configuration format.  Specifically, each opponent in
// `config.json` defines a `moves` array instead of a single `ai`
// object.  The original game code expected an `ai` property and
// would crash if it was missing.  This patched script assigns the
// first move in the `moves` array as an `ai` object when loading
// opponents, preventing runtime errors.

// Use top‑level await (allowed in ES modules) to load the
// configuration and assets before running the game loop.  If your
// browser does not support top‑level await, wrap this code in an
// async function and call it immediately.

// Load configuration
const cfg = await fetch('./config.json').then(r => r.json());

// Grab DOM elements
const c = document.getElementById('game');
const ctx = c.getContext('2d', { alpha: false });

// Scale the canvas for a retro‑pixel look
const SCALE = cfg.canvas.scale || 3;
c.style.width  = (c.width  * SCALE) + 'px';
c.style.height = (c.height * SCALE) + 'px';

// HUD and next opponent button
const hudEl   = document.getElementById('hud');
const nextBtn = document.getElementById('nextBtn');

// Helper to load an image
function loadImage(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.src = src;
  });
}

// Load core assets: player sprite sheet and FRUS cover
const playerImg = await loadImage(cfg.player.image);
const frusCover = await loadImage(cfg.meta.frus_cover);

// Load opponents and apply AI compatibility shim
const opponents = [];
for (const o of cfg.opponents) {
  const img = await loadImage(o.image);
  // If the opponent does not define an `ai` object but has a
  // `moves` array, fall back to the first move.  This prevents
  // runtime errors in the existing update loop which references
  // op.ai.tell_ms, op.ai.active_ms and op.ai.recovery_ms.
  let ai = o.ai;
  if (!ai && Array.isArray(o.moves) && o.moves.length > 0) {
    ai = { ...o.moves[0] };
  }
  opponents.push({ ...o, img, ai });
}

// Current opponent index and reference
let opponentIndex = 0;
let op = opponents[opponentIndex];

// When the user clicks “Next Opponent”, rotate to the next entry
nextBtn.onclick = () => {
  opponentIndex = (opponentIndex + 1) % opponents.length;
  op = opponents[opponentIndex];
  resetFight();
};

// Keyboard state tracking
const keys = {};
addEventListener('keydown', e => {
  keys[e.key] = true;
  // Start fight from title screen
  if (state === 'TITLE' && e.key === 'Enter') startFight();
  // Return to title screen from win screen
  if (state === 'WIN' && e.key === 'Enter') state = 'TITLE';
});
addEventListener('keyup', e => {
  keys[e.key] = false;
});
// Clicking the canvas also starts the fight from the title
c.addEventListener('click', () => {
  if (state === 'TITLE') startFight();
});

// Draw a single frame from a sprite sheet
function sliceDraw(img, grid, index, dx, dy, dw, dh) {
  const cols = grid.cols;
  const rows = grid.rows;
  const sw = Math.floor(img.width / cols);
  const sh = Math.floor(img.height / rows);
  const sx = (index % cols) * sw;
  const sy = Math.floor(index / cols) * sh;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// Return the correct frame index from an animation sequence
function animFrame(seq, t, ms) {
  if (!seq || !seq.length) return 0;
  return seq[Math.floor((t / ms) % seq.length)];
}

// Draw scrolling ticker text along the top of the ring
function textBanner(str) {
  ctx.fillStyle = cfg.style.banner_bg;
  ctx.fillRect(0, 0, c.width, 18);
  ctx.fillStyle = cfg.style.banner_fg;
  ctx.font = 'bold 8px monospace';
  ctx.fillText(str, 6, 12);
}

// Basic text wrapping for multiline strings
function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// Player and opponent state objects
const player = {
  x: 110,
  y: 150,
  w: 36,
  h: 60,
  state: 'idle',
  t: 0,
  hearts: cfg.hud.hearts_start,
  stamina: 100,
  stars: 0,
  invuln: 0
};
const foe = {
  x: 90,
  y: 50,
  w: 70,
  h: 90,
  state: 'idle',
  t: 0,
  hearts: cfg.hud.hearts_start,
  stamina: 100,
  invuln: 0,
  name: op.name
};

// Reset fight state for a new match
function resetFight() {
  player.state = 'idle';
  player.t = 0;
  player.hearts = cfg.hud.hearts_start;
  player.stamina = 100;
  player.invuln = 0;
  player.stars = 0;
  foe.state = 'idle';
  foe.t = 0;
  foe.stamina = 100;
  foe.name = op.name;
}

// Overall game state and timers
let state = 'TITLE'; // TITLE → FIGHT → WIN
let last  = performance.now();
let tickerT = 0;
let tickerIdx = 0;

// Main loop using requestAnimationFrame
requestAnimationFrame(loop);
function startFight() {
  resetFight();
  state = 'FIGHT';
}
function loop(now) {
  const dt = now - last;
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// Game update: handle input, player animation, opponent AI and collisions
function update(dt) {
  // Ticker updates every few seconds
  tickerT += dt;
  if (tickerT > 3500) {
    tickerT = 0;
    tickerIdx = (tickerIdx + 1) % cfg.meta.ticker.length;
  }

  // Title and win screens do not update gameplay
  if (state === 'TITLE' || state === 'WIN') return;

  // Handle player input
  if (keys['a'] || keys['A']) startPlayer('jab_left');
  if (keys['s'] || keys['S']) startPlayer('jab_right');
  if (keys['ArrowLeft'])  startPlayer('dodge_left');
  if (keys['ArrowRight']) startPlayer('dodge_right');
  if (keys['ArrowDown'])  startPlayer('duck');
  if (keys['Enter'])      startPlayer('star');

  // Advance timers
  player.t += dt;
  foe.t    += dt;
  if (player.invuln > 0) player.invuln -= dt;

  // Update player animation and resolve hits
  const P = cfg.tuning.player;
  if (player.state === 'jab_left' || player.state === 'jab_right') {
    const t = player.t;
    if (t < P.jab_startup_ms) {
      // Winding up
    } else if (t < P.jab_startup_ms + P.jab_active_ms) {
      // Active punch window: check collision with foe
      if (rectOverlap(playerHitbox(), foeHurtbox())) {
        foe.stamina -= cfg.tuning.player_damage * dt / 100;
      }
    } else if (t < P.jab_startup_ms + P.jab_active_ms + P.jab_recovery_ms) {
      // Recovering
    } else {
      player.state = 'idle';
      player.t = 0;
    }
  } else if (player.state === 'dodge_left' || player.state === 'dodge_right') {
    if (player.t >= cfg.tuning.player_dodge_invuln_ms) {
      player.state = 'idle';
      player.t = 0;
    }
  } else if (player.state === 'duck') {
    if (player.t >= cfg.tuning.player_dodge_invuln_ms) {
      player.state = 'idle';
      player.t = 0;
    }
  } else if (player.state === 'star') {
    // Star punch: bigger window and damage
    if (player.t < 200) {
      // Startup
    } else if (player.t < 200 + 120) {
      // Active star punch window
      if (rectOverlap(playerStarHitbox(), foeHurtbox())) {
        foe.stamina -= cfg.tuning.player_damage * 2 * dt / 100;
      }
    } else if (player.t < 200 + 120 + 500) {
      // Recovery
    } else {
      player.state = 'idle';
      player.t = 0;
    }
  }

  // Opponent AI: simple state machine using ai timings
  if (foe.state === 'idle') {
    if (foe.t > op.ai.tell_ms + 200) {
      foe.state = 'tell';
      foe.t = 0;
    }
  } else if (foe.state === 'tell') {
    if (foe.t > op.ai.tell_ms) {
      foe.state = 'attack';
      foe.t = 0;
    }
  } else if (foe.state === 'attack') {
    // Check for player getting hit (if not invulnerable)
    if (!player.invuln && rectOverlap(foeHitbox(), playerHurtbox())) {
      player.hearts = Math.max(0, player.hearts - 1);
      player.invuln = cfg.tuning.player_dodge_invuln_ms;
    }
    if (foe.t > op.ai.active_ms) {
      foe.state = 'recover';
      foe.t = 0;
    }
  } else if (foe.state === 'recover') {
    if (foe.t > op.ai.recovery_ms) {
      foe.state = 'idle';
      foe.t = 0;
    }
  }

  // Win / lose conditions
  if (foe.stamina <= 0) {
    state = 'WIN';
  }
  if (player.hearts <= 0) {
    // Reset hearts when the player is knocked out and return to idle
    player.hearts = cfg.hud.hearts_start;
    player.state = 'idle';
    player.t = 0;
  }

  // Update HUD text
  hudEl.textContent = `Opponent: ${foe.name} | Hearts: ${player.hearts} | Stars: ${player.stars} | Opp Stamina: ${Math.max(0, foe.stamina | 0)} — Read the FRUS volume at ${cfg.meta.frus_link}`;
}

// Axis‑aligned rectangle collision helper
function rectOverlap(a, b) {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}
// Bounding boxes for hit detection
function playerHurtbox() {
  // Rough rectangle around player
  return { x: 120, y: 150, w: 25, h: 60 };
}
function playerHitbox() {
  // Player jab reaches a bit forward
  return { x: 150, y: 140, w: 20, h: 40 };
}
function playerStarHitbox() {
  // Star punch reaches farther and higher
  return { x: 140, y: 120, w: 40, h: 70 };
}
function foeHurtbox() {
  return { x: foe.x + 10, y: foe.y + 10, w: foe.w - 20, h: foe.h - 20 };
}
function foeHitbox() {
  return { x: foe.x + 10, y: foe.y + 10, w: foe.w - 20, h: foe.h - 20 };
}

// Render the current frame
function render() {
  if (state === 'TITLE') {
    renderTitle();
    return;
  }
  if (state === 'WIN') {
    renderWin();
    return;
  }
  // Ring mat background
  ctx.fillStyle = cfg.style.ring_mat;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = cfg.style.ring_mat_line;
  ctx.fillRect(0, 0, c.width, 2);
  ctx.fillRect(0, c.height - 2, c.width, 2);

  // Scrolling ticker
  textBanner(cfg.meta.ticker[tickerIdx]);

  // Draw opponent sprite
  let opSeq;
  if (foe.state === 'idle') opSeq = op.animations.idle;
  else if (foe.state === 'tell') opSeq = op.animations.tell;
  else if (foe.state === 'attack') opSeq = op.animations.punch;
  else if (foe.state === 'recover') opSeq = op.animations.hit;
  else opSeq = op.animations.idle;
  const opFrame = animFrame(opSeq, foe.t, 140);
  sliceDraw(op.img, op.grid, opFrame, foe.x, foe.y, foe.w, foe.h);

  // Draw player sprite
  let pSeq;
  if (player.state === 'idle') pSeq = cfg.player.animations.idle;
  else if (player.state === 'jab_left') pSeq = cfg.player.animations.jab_left;
  else if (player.state === 'jab_right') pSeq = cfg.player.animations.jab_right;
  else if (player.state === 'dodge_left') pSeq = cfg.player.animations.dodge_left;
  else if (player.state === 'dodge_right') pSeq = cfg.player.animations.dodge_right;
  else if (player.state === 'star') pSeq = cfg.player.animations.star;
  else pSeq = cfg.player.animations.idle;
  const pFrame = animFrame(pSeq, player.t, cfg.player.frame_ms);
  sliceDraw(playerImg, cfg.player.grid, pFrame, player.x, player.y, player.w, player.h);
}

// Title screen rendering
function renderTitle() {
  ctx.fillStyle = cfg.style.ring_mat;
  ctx.fillRect(0, 0, c.width, c.height);
  // Draw FRUS cover
  ctx.drawImage(frusCover, 0, 0, 80, 112, 110, 24, 80, 112);
  // Title text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(cfg.meta.game_title, 14, 18);
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = cfg.style.banner_fg;
  ctx.fillText('Press ENTER to Start', 58, 206);
  ctx.font = '8px monospace';
  ctx.fillStyle = '#fff';
  wrapText(`Featuring the new ${cfg.meta.frus_title}.`, 12, 196, 232, 9);
}

// Win screen rendering
function renderWin() {
  ctx.fillStyle = cfg.style.ring_mat;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('TKO! BOB LINHARD WINS', 30, 24);
  ctx.font = '8px monospace';
  ctx.fillText('Read the volume now:', 66, 44);
  ctx.fillStyle = cfg.style.banner_fg;
  ctx.fillText(cfg.meta.frus_link, 10, 60);
  // Player victory frame
  const frame = cfg.player.animations.victory ? cfg.player.animations.victory[0] : 15;
  sliceDraw(playerImg, cfg.player.grid, frame, 108, 110, 40, 64);
  // Cover thumbnail
  ctx.drawImage(frusCover, 10, 80, 80, 112);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('Press ENTER for Title', 60, 224);
}

// Start a player action if idle and if allowed
function startPlayer(action) {
  if (player.state !== 'idle') return;
  if (action === 'jab_left') {
    player.state = 'jab_left';
    player.t = 0;
  } else if (action === 'jab_right') {
    player.state = 'jab_right';
    player.t = 0;
  } else if (action === 'dodge_left') {
    player.state = 'dodge_left';
    player.t = 0;
    player.invuln = cfg.tuning.player_dodge_invuln_ms;
  } else if (action === 'dodge_right') {
    player.state = 'dodge_right';
    player.t = 0;
    player.invuln = cfg.tuning.player_dodge_invuln_ms;
  } else if (action === 'duck') {
    player.state = 'duck';
    player.t = 0;
    player.invuln = cfg.tuning.player_dodge_invuln_ms;
  } else if (action === 'star' && player.stars > 0) {
    player.state = 'star';
    player.t = 0;
    player.stars--;
  }
}
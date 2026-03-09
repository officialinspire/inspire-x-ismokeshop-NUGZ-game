/* ═══════════════════════════════════════════════════════════
   NUGZ  v2 — index.js
   iSmokeShop Online Puzzle Game
   Full SFX, Music, Animations, Select/Deselect FX
═══════════════════════════════════════════════════════════ */

// ─── CONFIG ────────────────────────────────────────────────
const COLS = 7, ROWS = 9, MIN_MATCH = 3;
const NUG_TYPES = ['green', 'purple', 'white', 'teal', 'dark'];
const LEVEL_GOALS = [20, 35, 50, 70, 95, 125, 160, 200, 250, 310];
const LEVEL_MSGS  = [
  "Let's get lit! 🔥", "Oooh that's sticky! 🌿", "DANK! Keep going 💨",
  "Fire strain! 🔥", "You're on a roll! 😎", "This hits different! ✨",
  "Absolute banger! 💯", "Cloud nine! ☁️", "You're the plug! 👑",
  "LEGENDARY STATUS! 🏆"
];
const NUG_COLORS = { green:'#6fcf3f', purple:'#c080ff', white:'#d8f0a0', teal:'#5ecfc8', dark:'#7ab870' };
const COMBO_LABELS = ['DANK!','FIRE!','LIT! 🔥','BLAZED! 🌿','STONED! 💨','COOKED! 🍃','RIPPED! 💥','LEGENDARY! 🏆'];

// ─── STATE ────────────────────────────────────────────────
let G = {
  grid:[], score:0, level:1, moves:30,
  goal: LEVEL_GOALS[0], cleared:0,
  combo:0, maxCombo:0,
  running:false, selected:null, animating:false,
  nextNugs:[], cellSize:64,
  opts:{ sound:true, music:false, vibrate:true, effects:true, musicVol:0.6 }
};
let highScores = [];
let savedGame  = null;
let images     = {};

// ─── DOM ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const canvas   = $('gameCanvas');
const ctx      = canvas.getContext('2d');
const popLayer = $('popEffects');

// ─── SCREEN MANAGER ───────────────────────────────────────
const SCREENS = ['menu','game','pause','gameover','levelup','scores','options'];
function showScreen(name) {
  SCREENS.forEach(id => {
    const el = $(`screen-${id}`);
    if (el) el.classList.remove('active');
  });
  const target = $(`screen-${name}`);
  if (target) target.classList.add('active');
  document.body.classList.toggle('on-menu', name === 'menu');
  handleMusicForScreen(name);
}

// ═══════════════════════════════════════════════════════════
//  AUDIO ENGINE
// ═══════════════════════════════════════════════════════════
let ac = null;
function getAC() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return ac;
}
function resumeAC() {
  const a = getAC();
  if (a && a.state === 'suspended') a.resume();
}

// Procedural tone player
function tone(freq, type='sine', dur=0.09, vol=0.28, delay=0, attack=0.01, decay=0.05) {
  if (!G.opts.sound) return;
  const a = getAC(); if (!a) return;
  try {
    const osc  = a.createOscillator();
    const gain = a.createGain();
    osc.connect(gain); gain.connect(a.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, a.currentTime + delay);
    gain.gain.setValueAtTime(0, a.currentTime + delay);
    gain.gain.linearRampToValueAtTime(vol, a.currentTime + delay + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + attack + decay + dur);
    osc.start(a.currentTime + delay);
    osc.stop(a.currentTime + delay + attack + decay + dur + 0.05);
  } catch(e) {}
}
function chord(freqs, type, dur, vol, delay=0) {
  freqs.forEach((f,i) => tone(f, type, dur, vol / freqs.length, delay + i*0.015));
}

// ── SFX LIBRARY ───────────────────────────────────────────
const SFX = {
  select() {
    tone(440, 'sine', 0.06, 0.22);
    tone(660, 'sine', 0.04, 0.12, 0.04);
  },
  deselect() {
    tone(330, 'sine', 0.07, 0.18);
    tone(220, 'sine', 0.05, 0.10, 0.04);
  },
  swap() {
    tone(300, 'triangle', 0.07, 0.2);
    tone(420, 'triangle', 0.07, 0.2, 0.06);
  },
  invalid() {
    tone(180, 'sawtooth', 0.08, 0.25);
    tone(140, 'sawtooth', 0.08, 0.2, 0.08);
  },
  pop(count) {
    // Pleasing pop chord based on count
    const base = 350 + Math.min(count, 8) * 30;
    const notes = [base, base*1.25, base*1.5, base*2].slice(0, Math.min(count, 4));
    chord(notes, 'sine', 0.10, 0.35);
    // Percussive click
    tone(80, 'square', 0.03, 0.3, 0);
  },
  combo(level) {
    // Ascending arpeggio based on combo level
    const root = 260 + level * 40;
    const scale = [1, 1.25, 1.5, 1.875, 2, 2.5];
    const steps = Math.min(level + 2, scale.length);
    for (let i = 0; i < steps; i++) {
      tone(root * scale[i], 'sine', 0.12, 0.28, i * 0.07);
    }
  },
  clearBig() {
    // Big satisfying clear
    const freqs = [261, 329, 392, 523, 659];
    freqs.forEach((f, i) => tone(f, 'triangle', 0.2, 0.22, i * 0.06));
    // Sub boom
    tone(60, 'sine', 0.3, 0.5, 0.05);
  },
  levelUp() {
    const melody = [523, 659, 784, 1047, 1318];
    melody.forEach((n, i) => tone(n, 'triangle', 0.14, 0.3, i * 0.1));
    tone(60, 'sine', 0.4, 0.4, 0.05);
  },
  gameOver() {
    const sad = [400, 350, 300, 220];
    sad.forEach((n, i) => tone(n, 'sawtooth', 0.18, 0.25, i * 0.18));
  },
  shuffle() {
    for (let i = 0; i < 6; i++) {
      tone(200 + Math.random() * 400, 'sine', 0.05, 0.1, i * 0.04);
    }
  },
  lowMoves() {
    tone(280, 'square', 0.08, 0.3);
    tone(210, 'square', 0.08, 0.25, 0.1);
  },
  newGame() {
    const fanfare = [261, 329, 392, 523];
    fanfare.forEach((n, i) => tone(n, 'triangle', 0.12, 0.3, i * 0.08));
  },
  scoreAdd(pts) {
    const freq = 400 + Math.min(pts / 10, 400);
    tone(freq, 'sine', 0.06, 0.15);
  }
};

// ── MUSIC PLAYER ──────────────────────────────────────────
const bgMusic = $('bgMusic');
let musicEnabled = false;

function setMusicVolume(vol) {
  if (bgMusic) bgMusic.volume = Math.max(0, Math.min(1, vol));
}

function handleMusicForScreen(screenName) {
  if (!bgMusic) return;
  setMusicVolume(G.opts.musicVol);
  if (G.opts.music) {
    if (['menu','game'].includes(screenName)) {
      bgMusic.play().catch(() => {});
    } else {
      bgMusic.pause();
    }
  } else {
    bgMusic.pause();
  }
}

function toggleMusic(enabled) {
  G.opts.music = enabled;
  if (enabled) {
    setMusicVolume(G.opts.musicVol);
    bgMusic && bgMusic.play().catch(() => {});
  } else {
    bgMusic && bgMusic.pause();
  }
}

// ── HAPTICS ───────────────────────────────────────────────
function vib(pattern) {
  if (G.opts.vibrate && navigator.vibrate) navigator.vibrate(pattern);
}

// ═══════════════════════════════════════════════════════════
//  IMAGE LOADER
// ═══════════════════════════════════════════════════════════
function loadImages() {
  return new Promise(resolve => {
    const keys = [...NUG_TYPES, ...NUG_TYPES.map(n => n+'_glow'), ...NUG_TYPES.map(n => n+'_pop')];
    let pending = keys.length;
    keys.forEach(k => {
      const img = new Image();
      img.onload = img.onerror = () => { if (--pending <= 0) resolve(); };
      img.src = `sprites/${k}.png`;
      images[k] = img;
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  GRID ENGINE
// ═══════════════════════════════════════════════════════════
function randNug(exclude) {
  let types = exclude ? NUG_TYPES.filter(t => t !== exclude) : [...NUG_TYPES];
  return types[Math.floor(Math.random() * types.length)];
}

function createGrid() {
  const g = [];
  for (let r = 0; r < ROWS; r++) {
    g[r] = [];
    for (let c = 0; c < COLS; c++) {
      let excl = null;
      if (c >= 2 && g[r][c-1] === g[r][c-2]) excl = g[r][c-1];
      if (r >= 2 && g[r-1][c] === g[r-2][c]) {
        const v = g[r-1][c];
        excl = (excl && excl !== v) ? null : v;
      }
      g[r][c] = randNug(excl);
    }
  }
  return g;
}

function findMatches(g) {
  const matched = new Set();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS-2; c++) {
      const t = g[r][c]; if (!t) continue;
      let len = 1;
      while (c+len < COLS && g[r][c+len] === t) len++;
      if (len >= MIN_MATCH) for (let i=0;i<len;i++) matched.add(`${r},${c+i}`);
    }
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS-2; r++) {
      const t = g[r][c]; if (!t) continue;
      let len = 1;
      while (r+len < ROWS && g[r+len][c] === t) len++;
      if (len >= MIN_MATCH) for (let i=0;i<len;i++) matched.add(`${r+i},${c}`);
    }
  return matched;
}

function gravity(g) {
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS-1; r > 0; r--)
      if (!g[r][c]) {
        let a = r-1;
        while (a >= 0 && !g[a][c]) a--;
        if (a >= 0) { g[r][c] = g[a][c]; g[a][c] = null; }
      }
    for (let r = 0; r < ROWS; r++)
      if (!g[r][c]) g[r][c] = randNug();
  }
}

function swapCells(g,r1,c1,r2,c2) { const t=g[r1][c1]; g[r1][c1]=g[r2][c2]; g[r2][c2]=t; }
function isAdjacent(r1,c1,r2,c2) { return Math.abs(r1-r2)+Math.abs(c1-c2) === 1; }

function hasAnyMove(g) {
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    if (c+1<COLS) { swapCells(g,r,c,r,c+1); const m=findMatches(g).size; swapCells(g,r,c,r,c+1); if(m>0) return true; }
    if (r+1<ROWS) { swapCells(g,r,c,r+1,c); const m=findMatches(g).size; swapCells(g,r,c,r+1,c); if(m>0) return true; }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
//  CANVAS + DRAWING
// ═══════════════════════════════════════════════════════════
let cellAnims = {}; // key -> {scale, alpha, dx, dy}

function cellSize() { return G.cellSize; }

function resizeCanvas() {
  const area = document.querySelector('.game-area');
  if (!area) return;
  const aw = area.clientWidth - 8;
  const ah = area.clientHeight - 8;
  G.cellSize = Math.floor(Math.min(aw / COLS, ah / ROWS, 82));
  canvas.width  = G.cellSize * COLS;
  canvas.height = G.cellSize * ROWS;
}

function drawNug(type, cx, cy, size, glow=false, alpha=1, dx=0, dy=0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx + dx, cy + dy);
  if (glow) {
    ctx.shadowColor = NUG_COLORS[type] || '#6fcf3f';
    ctx.shadowBlur  = 18;
  }
  const key  = glow ? type+'_glow' : type;
  const img  = images[key];
  const half = size / 2;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -half, -half, size, size);
  } else {
    // Fallback circle
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI*2);
    ctx.fillStyle = NUG_COLORS[type] || '#6fcf3f';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = `${size*0.38}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌿', 0, 0);
  }
  ctx.restore();
}

function drawGrid() {
  const cs = G.cellSize;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Frosted panel background for grid
  ctx.fillStyle = 'rgba(5,14,3,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(111,207,63,0.09)';
  ctx.lineWidth = 1;
  for (let r=0; r<=ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0,r*cs); ctx.lineTo(canvas.width,r*cs); ctx.stroke();
  }
  for (let c=0; c<=COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c*cs,0); ctx.lineTo(c*cs,canvas.height); ctx.stroke();
  }

  for (let r=0; r<ROWS; r++) for (let c=0; c<COLS; c++) {
    const type = G.grid[r][c];
    if (!type) continue;

    const key  = `${r},${c}`;
    const anim = cellAnims[key] || {};
    const isSelected = G.selected && G.selected[0]===r && G.selected[1]===c;
    const scale = anim.scale  ?? 1;
    const alpha = anim.alpha  ?? 1;
    const dx    = anim.dx     ?? 0;
    const dy_   = anim.dy     ?? 0;
    const pad   = 5;
    const size  = (cs - pad*2) * scale;
    const cx    = c*cs + cs/2;
    const cy    = r*cs + cs/2;

    // Selected highlight cell
    if (isSelected) {
      ctx.save();
      ctx.fillStyle = 'rgba(111,207,63,0.18)';
      roundRect(ctx, c*cs+2, r*cs+2, cs-4, cs-4, 8);
      ctx.fill();
      ctx.restore();
    }

    drawNug(type, cx, cy, size, isSelected, alpha, dx, dy_);

    // Selected border
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = '#6fcf3f';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#6fcf3f';
      ctx.shadowBlur = 10;
      roundRect(ctx, c*cs+3, r*cs+3, cs-6, cs-6, 8);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Helper for rounded rects
function roundRect(c2d, x, y, w, h, r) {
  c2d.beginPath();
  c2d.moveTo(x+r, y);
  c2d.lineTo(x+w-r, y); c2d.arcTo(x+w, y, x+w, y+r, r);
  c2d.lineTo(x+w, y+h-r); c2d.arcTo(x+w, y+h, x+w-r, y+h, r);
  c2d.lineTo(x+r, y+h); c2d.arcTo(x, y+h, x, y+h-r, r);
  c2d.lineTo(x, y+r); c2d.arcTo(x, y, x+r, y, r);
  c2d.closePath();
}

// ─── ANIM HELPERS ─────────────────────────────────────────
function easeInOut(t) { return t<.5 ? 2*t*t : -1+(4-2*t)*t; }
function easeOutBack(t) { const c1=1.70158, c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }

function animateProp(keys, prop, from, to, dur, easing=easeInOut) {
  return new Promise(resolve => {
    const t0 = performance.now();
    function tick(now) {
      const t = Math.min((now-t0)/dur, 1);
      const e = easing(t);
      keys.forEach(k => { cellAnims[k] = cellAnims[k] || {}; cellAnims[k][prop] = from+(to-from)*e; });
      drawGrid();
      t < 1 ? requestAnimationFrame(tick) : resolve();
    }
    requestAnimationFrame(tick);
  });
}

async function animateSwap(r1,c1,r2,c2) {
  const cs = G.cellSize;
  const dx = (c2-c1)*cs, dy_ = (r2-r1)*cs;
  const k1 = `${r1},${c1}`, k2 = `${r2},${c2}`;
  const dur = 180;
  const t0 = performance.now();
  await new Promise(resolve => {
    function tick(now) {
      const t = Math.min((now-t0)/dur, 1);
      const e = easeOutBack(t);
      cellAnims[k1] = { dx: dx*e, dy: dy_*e };
      cellAnims[k2] = { dx:-dx*e, dy:-dy_*e };
      drawGrid();
      t < 1 ? requestAnimationFrame(tick) : resolve();
    }
    requestAnimationFrame(tick);
  });
  delete cellAnims[k1]; delete cellAnims[k2];
}

async function animatePop(keys) {
  // Pop-in then vanish
  const dur1 = 140, dur2 = 160;
  // Scale up
  await animateProp(keys, 'scale', 1, 1.35, dur1, easeOutBack);
  // Fade out + scale down
  const t0 = performance.now();
  await new Promise(resolve => {
    function tick(now) {
      const t = Math.min((now-t0)/dur2, 1);
      keys.forEach(k => {
        cellAnims[k] = { scale: 1.35*(1-t), alpha: 1-t };
      });
      drawGrid();
      t < 1 ? requestAnimationFrame(tick) : resolve();
    }
    requestAnimationFrame(tick);
  });
  keys.forEach(k => delete cellAnims[k]);
}

// ─── VISUAL EFFECTS ───────────────────────────────────────
function getCanvasRect() { return canvas.getBoundingClientRect(); }

function spawnPopText(r, c, text, color='#f5c842', size=26) {
  if (!G.opts.effects) return;
  const rect = getCanvasRect();
  const cs = G.cellSize;
  const el = document.createElement('div');
  el.className = 'pop-text';
  el.textContent = text;
  el.style.cssText = `
    color:${color};
    font-size:${size}px;
    left:${rect.left + c*cs + cs/2 - 30}px;
    top:${rect.top  + r*cs + cs*0.1}px;
  `;
  popLayer.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), {once:true});
}

function spawnParticles(r, c, color, count=10) {
  if (!G.opts.effects) return;
  const rect = getCanvasRect();
  const cs = G.cellSize;
  const cx = rect.left + c*cs + cs/2;
  const cy = rect.top  + r*cs + cs/2;
  for (let i=0; i<count; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    const angle = (i/count)*Math.PI*2 + Math.random()*0.3;
    const dist  = 25 + Math.random()*40;
    const sz    = 3 + Math.random()*8;
    el.style.cssText = `
      width:${sz}px; height:${sz}px;
      background:${color};
      left:${cx - sz/2}px; top:${cy - sz/2}px;
      --dx:${Math.cos(angle)*dist}px;
      --dy:${Math.sin(angle)*dist}px;
      animation-duration:${0.45 + Math.random()*0.3}s;
    `;
    popLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), {once:true});
  }
}

function spawnSelectRing(r, c) {
  if (!G.opts.effects) return;
  const rect = getCanvasRect();
  const cs = G.cellSize;
  const el = document.createElement('div');
  el.className = 'select-flash';
  el.style.cssText = `
    left:${rect.left + c*cs + 4}px;
    top:${rect.top  + r*cs + 4}px;
    width:${cs-8}px; height:${cs-8}px;
  `;
  popLayer.appendChild(el);
  setTimeout(() => el.remove(), 300);
}

function spawnDeselectRing(r, c) {
  if (!G.opts.effects) return;
  const rect = getCanvasRect();
  const cs = G.cellSize;
  const el = document.createElement('div');
  el.className = 'deselect-flash';
  el.style.cssText = `
    left:${rect.left + c*cs + 4}px;
    top:${rect.top  + r*cs + 4}px;
    width:${cs-8}px; height:${cs-8}px;
  `;
  popLayer.appendChild(el);
  setTimeout(() => el.remove(), 250);
}

function screenFlash(color='rgba(111,207,63,0.25)') {
  if (!G.opts.effects) return;
  const el = document.createElement('div');
  el.className = 'screen-flash';
  el.style.background = color;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), {once:true});
}

// ═══════════════════════════════════════════════════════════
//  MATCH PROCESSING  (cascade engine)
// ═══════════════════════════════════════════════════════════
async function processMatches() {
  let cascade = 0;
  while (true) {
    const matched = findMatches(G.grid);
    if (matched.size === 0) break;
    cascade++;
    G.combo++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;

    const cells = [...matched];
    const types = cells.map(k => G.grid[k.split(',')[0]][k.split(',')[1]]);

    // Pop animation
    await animatePop(cells);

    // Particles + score
    let pts = Math.floor(matched.size * 10 * Math.pow(G.combo, 1.4));
    G.score   += pts;
    G.cleared += matched.size;

    cells.forEach((key, i) => {
      const [r,c] = key.split(',').map(Number);
      spawnParticles(r, c, NUG_COLORS[types[i]] || '#fff', 8);
      G.grid[r][c] = null;
    });

    // SFX
    SFX.pop(matched.size);
    if (G.combo >= 2) {
      setTimeout(() => SFX.combo(G.combo), 80);
      vib([30, 20, 50]);
    } else {
      vib(30);
    }
    if (matched.size >= 6) {
      setTimeout(() => SFX.clearBig(), 60);
      screenFlash('rgba(111,207,63,0.22)');
    }

    // Text effects
    const [fr, fc] = cells[Math.floor(cells.length/2)].split(',').map(Number);
    if (G.combo >= 2) {
      const label = COMBO_LABELS[Math.min(G.combo-2, COMBO_LABELS.length-1)];
      spawnPopText(fr, fc-1, `${G.combo}x ${label}`, '#f5c842', 22);
    }
    spawnPopText(fr+1, fc, `+${pts}`, '#a8f070', 18);

    // Combo display update
    const cd = $('dispCombo');
    if (cd) {
      cd.textContent = G.combo >= 2 ? `${G.combo}x` : '';
      cd.classList.remove('combo-pop');
      void cd.offsetWidth;
      cd.classList.add('combo-pop');
    }

    updateHUD();
    await sleep(120);
    gravity(G.grid);
    await sleep(100);
  }
  return cascade;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════════════
function updateHUD() {
  $('dispScore').textContent  = G.score.toLocaleString();
  $('dispLevel').textContent  = G.level;
  $('dispMoves').textContent  = G.moves;
  $('dispBest').textContent   = (highScores[0]?.score || 0).toLocaleString();

  const pct = Math.min(G.cleared / G.goal, 1);
  $('progressBar').style.width    = (pct * 100) + '%';
  $('progressLabel').textContent  = `${G.cleared} / ${G.goal}`;

  // Score bump
  const sd = $('dispScore');
  sd.classList.remove('bump');
  void sd.offsetWidth;
  sd.classList.add('bump');

  // Low moves
  const md = document.querySelector('.moves-display');
  if (md) md.classList.toggle('low', G.moves <= 5 && G.moves > 0);
  if (G.moves === 5) SFX.lowMoves();
}

function updateNextDisplay() {
  const cont = $('nextNugDisplay');
  if (!cont) return;
  cont.innerHTML = '';
  G.nextNugs.slice(0,3).forEach(type => {
    const img = document.createElement('img');
    img.src = `sprites/${type}.png`;
    img.alt = type;
    img.onerror = () => { img.style.display='none'; };
    cont.appendChild(img);
  });
}

// ═══════════════════════════════════════════════════════════
//  GAME FLOW
// ═══════════════════════════════════════════════════════════
function initNextNugs() {
  G.nextNugs = Array.from({length:8}, () => randNug());
}

function newGame() {
  G.grid     = createGrid();
  G.score    = 0;
  G.level    = 1;
  G.moves    = 30;
  G.goal     = LEVEL_GOALS[0];
  G.cleared  = 0;
  G.combo    = 0;
  G.maxCombo = 0;
  G.running  = true;
  G.selected = null;
  G.animating= false;
  cellAnims  = {};
  initNextNugs();
  resizeCanvas();
  updateHUD();
  updateNextDisplay();
  drawGrid();
  showScreen('game');
  SFX.newGame();
  vib([20,10,40,10,60]);
}

async function handleSwap(r1,c1,r2,c2) {
  if (G.animating || !G.running) return;
  G.animating = true;
  G.combo = 0;

  // Deselect current
  spawnDeselectRing(r1, c1);
  G.selected = null;

  swapCells(G.grid, r1,c1, r2,c2);
  SFX.swap(); vib(15);
  await animateSwap(r1,c1,r2,c2);

  const matched = findMatches(G.grid);
  if (matched.size === 0) {
    // Swap back
    swapCells(G.grid, r1,c1, r2,c2);
    SFX.invalid(); vib([20,20,20]);
    await animateSwap(r1,c1,r2,c2);
    drawGrid();
    G.animating = false;
    return;
  }

  G.moves--;
  await processMatches();
  drawGrid();

  if (G.cleared >= G.goal) {
    await doLevelUp();
  } else if (G.moves <= 0) {
    doGameOver();
  } else if (!hasAnyMove(G.grid)) {
    spawnPopText(4, 2, '🔀 SHUFFLE!', '#5ec4c0', 22);
    SFX.shuffle();
    await sleep(600);
    G.grid = createGrid();
    drawGrid();
  }

  saveGame();
  G.animating = false;
  G.nextNugs.shift();
  G.nextNugs.push(randNug());
  updateNextDisplay();
}

async function doLevelUp() {
  SFX.levelUp();
  vib([50,30,100,30,150]);
  screenFlash('rgba(245,200,66,0.3)');
  G.level++;
  G.cleared = 0;
  G.goal    = LEVEL_GOALS[Math.min(G.level-1, LEVEL_GOALS.length-1)];
  G.moves   = Math.min(G.moves + 12, 45);

  $('luLevel').textContent = G.level;
  $('luMsg').textContent   = LEVEL_MSGS[Math.min(G.level-2, LEVEL_MSGS.length-1)];
  $('levelupStars').textContent = G.level >= 8 ? '🌟🌟🌟' : G.level >= 5 ? '⭐🌟⭐' : '⭐⭐⭐';
  showScreen('levelup');

  await new Promise(resolve => {
    $('btnContinue').onclick = () => {
      showScreen('game');
      resizeCanvas();
      drawGrid();
      resolve();
    };
  });
}

function doGameOver() {
  G.running = false;
  SFX.gameOver();
  vib([30,20,30,20,100]);
  addHighScore(G.score, G.level);

  $('goScore').textContent = G.score.toLocaleString();
  $('goLevel').textContent = G.level;
  $('goCombo').textContent = G.maxCombo;

  const isNew = G.score > 0 && highScores.length > 0 && G.score >= highScores[0]?.score;
  const nb = $('goNewBest');
  if (nb) nb.style.display = isNew ? 'block' : 'none';
  if (isNew) { SFX.levelUp(); screenFlash('rgba(245,200,66,0.4)'); }

  showScreen('gameover');
}

// ═══════════════════════════════════════════════════════════
//  SAVE / LOAD
// ═══════════════════════════════════════════════════════════
function saveGame() {
  savedGame = JSON.parse(JSON.stringify(G));
  try { localStorage.setItem('nugz_save', JSON.stringify(savedGame)); } catch(e) {}
}

function loadSave() {
  try {
    const s = localStorage.getItem('nugz_save');
    if (s) savedGame = JSON.parse(s);
  } catch(e) {}
  return savedGame;
}

// ─── SCORES ───────────────────────────────────────────────
function loadScores() {
  try { highScores = JSON.parse(localStorage.getItem('nugz_scores') || '[]'); }
  catch(e) { highScores = []; }
}
function saveScores() {
  try { localStorage.setItem('nugz_scores', JSON.stringify(highScores)); } catch(e) {}
}
function addHighScore(score, level) {
  highScores.push({ score, level });
  highScores.sort((a,b) => b.score - a.score);
  highScores = highScores.slice(0, 10);
  saveScores();
}
function renderScores() {
  const list = $('scoresList');
  const medals = ['🥇','🥈','🥉'];
  if (!highScores.length) {
    list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);padding:24px 0">No scores yet!<br>Play a game first 🌿</div>';
    return;
  }
  list.innerHTML = highScores.map((s,i) => `
    <div class="score-entry">
      <span class="score-rank">${medals[i] || '#'+(i+1)}</span>
      <span class="score-val">${s.score.toLocaleString()}</span>
      <span class="score-lvl">LVL ${s.level}</span>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
//  INPUT HANDLING
// ═══════════════════════════════════════════════════════════
function cellFromPoint(clientX, clientY) {
  const rect = getCanvasRect();
  const cs   = G.cellSize;
  const c    = Math.floor((clientX - rect.left) / cs);
  const r    = Math.floor((clientY - rect.top)  / cs);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return [r, c];
  return null;
}

function handleCellTap(r, c) {
  if (G.animating || !G.running) return;
  if (!G.selected) {
    // Select
    G.selected = [r, c];
    SFX.select();
    spawnSelectRing(r, c);
    vib(15);
    drawGrid();
  } else {
    const [sr, sc] = G.selected;
    if (sr === r && sc === c) {
      // Deselect same
      spawnDeselectRing(r, c);
      G.selected = null;
      SFX.deselect();
      drawGrid();
    } else if (isAdjacent(sr, sc, r, c)) {
      // Swap
      handleSwap(sr, sc, r, c);
    } else {
      // Re-select different cell
      spawnDeselectRing(sr, sc);
      spawnSelectRing(r, c);
      G.selected = [r, c];
      SFX.select();
      vib(12);
      drawGrid();
    }
  }
}

// Touch swipe detection
let touchOrigin = null;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  resumeAC();
  const t = e.touches[0];
  touchOrigin = { x: t.clientX, y: t.clientY, time: Date.now() };
  const pos = cellFromPoint(t.clientX, t.clientY);
  if (pos && !G.animating && G.running) handleCellTap(...pos);
}, { passive:false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (!touchOrigin || !G.selected || G.animating) { touchOrigin=null; return; }
  const t = e.changedTouches[0];
  const dx = t.clientX - touchOrigin.x;
  const dy = t.clientY - touchOrigin.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist > 22) {
    // Swipe gesture
    const [sr, sc] = G.selected;
    let tr = sr, tc = sc;
    if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
    else tr += dy > 0 ? 1 : -1;
    if (tr>=0&&tr<ROWS&&tc>=0&&tc<COLS) handleSwap(sr, sc, tr, tc);
  }
  touchOrigin = null;
}, { passive:false });

canvas.addEventListener('mousedown', e => {
  resumeAC();
  const pos = cellFromPoint(e.clientX, e.clientY);
  if (pos) handleCellTap(...pos);
});

// Keyboard (arrow keys for swapping after selecting)
document.addEventListener('keydown', e => {
  if (!G.selected || G.animating || !G.running) return;
  const [sr, sc] = G.selected;
  const dirs = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] };
  if (dirs[e.key]) {
    e.preventDefault();
    const [dr, dc] = dirs[e.key];
    const tr = sr+dr, tc = sc+dc;
    if (tr>=0&&tr<ROWS&&tc>=0&&tc<COLS) handleSwap(sr,sc,tr,tc);
  }
  if (e.key === 'Escape') {
    spawnDeselectRing(sr, sc);
    G.selected = null;
    SFX.deselect();
    drawGrid();
  }
});

// ═══════════════════════════════════════════════════════════
//  MENU FLOATING NUGS (centered row)
// ═══════════════════════════════════════════════════════════
function initFloatingNugs() {
  const container = $('floatingNugs');
  if (!container) return;
  container.innerHTML = '';
  NUG_TYPES.forEach((type, i) => {
    const img = document.createElement('img');
    img.src = `sprites/${type}.png`;
    img.alt = type;
    img.draggable = false;
    img.onerror = () => { img.style.display='none'; };
    container.appendChild(img);
  });
}

// Random sparkle on menu nugs
let menuSparkleTimer = null;
function startMenuSparkle() {
  clearInterval(menuSparkleTimer);
  menuSparkleTimer = setInterval(() => {
    const imgs = document.querySelectorAll('#floatingNugs img');
    if (!imgs.length) return;
    const img = imgs[Math.floor(Math.random()*imgs.length)];
    img.classList.add('sparkle');
    setTimeout(() => img.classList.remove('sparkle'), 380);
  }, 700);
}

// ═══════════════════════════════════════════════════════════
//  BUTTON WIRING
// ═══════════════════════════════════════════════════════════
function wire(id, fn) { const el=$(id); if(el) el.addEventListener('click', fn); }

wire('btnNewGame', () => { resumeAC(); newGame(); });

wire('btnResume', () => {
  resumeAC();
  const save = loadSave();
  if (save && save.grid && save.running !== false) {
    Object.assign(G, save);
    G.running   = true;
    G.animating = false;
    cellAnims   = {};
    resizeCanvas();
    updateHUD();
    updateNextDisplay();
    drawGrid();
    showScreen('game');
    SFX.select();
  } else {
    const btn = $('btnResume');
    const orig = btn.textContent;
    btn.textContent = '❌ NO SAVE FOUND';
    btn.style.opacity = '0.5';
    SFX.invalid();
    setTimeout(() => { btn.textContent=orig; btn.style.opacity=''; }, 2200);
  }
});

wire('btnHighScore', () => { renderScores(); showScreen('scores'); SFX.select(); });
wire('btnScoresBack', () => { showScreen('menu'); SFX.deselect(); });

wire('btnOptions', () => { syncOptionsUI(); showScreen('options'); SFX.select(); });
wire('btnOptBack', () => {
  G.opts.sound   = $('optSound').checked;
  G.opts.music   = $('optMusic').checked;
  G.opts.vibrate = $('optVibrate').checked;
  G.opts.effects = $('optEffects').checked;
  G.opts.musicVol= parseInt($('optMusicVol').value) / 100;
  setMusicVolume(G.opts.musicVol);
  toggleMusic(G.opts.music);
  showScreen('menu');
  SFX.deselect();
});

wire('btnQuit', () => {
  resumeAC();
  if (confirm('Quit NUGZ? 🌿')) { saveGame(); window.close(); }
});

wire('btnPause', () => { G.running=false; showScreen('pause'); });
wire('btnResumePause', () => { G.running=true; showScreen('game'); SFX.select(); });
wire('btnRestartPause', () => { if (confirm('Start a new game?')) newGame(); });
wire('btnMenuPause', () => { saveGame(); showScreen('menu'); });

wire('btnPlayAgain', () => { resumeAC(); newGame(); });
wire('btnGoMenu', () => { showScreen('menu'); });

// Music toggle in options
const optMusic = $('optMusic');
if (optMusic) {
  optMusic.addEventListener('change', () => {
    resumeAC();
    toggleMusic(optMusic.checked);
  });
}
const optMusicVol = $('optMusicVol');
if (optMusicVol) {
  optMusicVol.addEventListener('input', () => {
    G.opts.musicVol = parseInt(optMusicVol.value) / 100;
    setMusicVolume(G.opts.musicVol);
  });
}

// ── RESIZE ─────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if ($('screen-game')?.classList.contains('active')) {
    resizeCanvas(); drawGrid();
  }
});

// ── OPTIONS UI SYNC ────────────────────────────────────────
function syncOptionsUI() {
  const set = (id, val) => { const el=$(id); if(el) el.checked=val; };
  set('optSound',   G.opts.sound);
  set('optMusic',   G.opts.music);
  set('optVibrate', G.opts.vibrate);
  set('optEffects', G.opts.effects);
  const mv = $('optMusicVol');
  if (mv) mv.value = Math.round(G.opts.musicVol * 100);
}

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
async function boot() {
  loadScores();
  loadSave();
  syncOptionsUI();
  document.body.classList.add('on-menu');
  showScreen('menu');

  await loadImages();
  initFloatingNugs();
  startMenuSparkle();

  // Dim resume if no save
  if (!savedGame) {
    const btn = $('btnResume');
    if (btn) btn.style.opacity = '0.45';
  }

  // Unlock AudioContext + music on first user gesture
  const unlock = () => {
    resumeAC();
    if (G.opts.music) toggleMusic(true);
    document.removeEventListener('click',   unlock);
    document.removeEventListener('touchstart', unlock);
  };
  document.addEventListener('click',      unlock, { once:true });
  document.addEventListener('touchstart', unlock, { once:true });
}

boot();

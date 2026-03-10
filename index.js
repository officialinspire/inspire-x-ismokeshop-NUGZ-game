/* ═══════════════════════════════════════════════════════════
   NUGZ — index.js  (FINAL)
   All bugs fixed:
   • Pop/particle/select FX coordinates corrected (viewport→container-relative)
   • Resume no longer overwrites current G.opts
   • Loaded save validated (nextNugs, grid integrity)
   • doLevelUp double-tap guard
   • lowPuffs SFX triggers correctly (once, on transition to 5)
   • highScores isNew check fixed (uses pre-add comparison)
   • Combo resets properly between moves
═══════════════════════════════════════════════════════════ */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────
const COLS = 7, ROWS = 9, MIN_MATCH = 3;
const NUG_TYPES   = ['green','purple','white','teal','dark'];
const NUG_STRAINS = ['OG KUSH','PURPLE HAZE','WHITE WIDOW','BLUE DREAM','GDPURPS'];
const NUG_COLORS  = { green:'#6fcf3f', purple:'#c080ff', white:'#d8f0a0', teal:'#5ecfc8', dark:'#7ab870' };
const LEVEL_GOALS = [20,35,55,80,110,145,185,230,280,340];
const LEVEL_MSGS  = [
  "Let's get lit! 🔥","Oooh that's sticky! 🌿","DANK! Keep going 💨",
  "Fire strain! 🔥","You're on a roll! 😎","This hits different! ✨",
  "Absolute banger! 💯","Cloud nine! ☁️","You're the plug! 👑",
  "LEGENDARY STATUS! 🏆"
];
const COMBO_LABELS = ['DANK!','FIRE! 🔥','LIT! 🌿','BLAZED! 💨','STONED!','COOKED! 🍃','RIPPED!','LEGENDARY! 🏆'];

// ─── LAYOUT DETECTION ─────────────────────────────────────
const isMobile = () => {
  if (window.innerWidth < 768) return true;
  if (window.innerHeight <= 500 &&
      window.matchMedia('(orientation: landscape)').matches) return true;
  return false;
};

// ─── GLOBAL STATE ─────────────────────────────────────────
const G = {
  grid:[], score:0, level:1, moves:30,
  goal:LEVEL_GOALS[0], cleared:0, totalCleared:0,
  combo:0, maxCombo:0,
  running:false, selected:null, animating:false,
  nextNugs:[], cellSize:64,
  specials: {},                   // sidecar: "r,c" → 'ladybug'|'seed'|'water'
  opts:{ sound:true, music:true, vibrate:true, effects:true, musicVol:0.6 }
};
let highScores = [];
let savedGame   = null;
let images      = {};
let cellAnims   = {};
let activeCanvas, activePopLayer;
// Track previous moves count to fire lowPuffs SFX only on the transition to 5
let _prevMoves  = 30;

// ─── DOM HELPERS ──────────────────────────────────────────
const $ = id => document.getElementById(id);
const desktopCanvas = $('gameCanvas');
const mobileCanvas  = $('gameCanvasMobile');
const desktopPop    = $('popEffects');
const mobilePop     = $('popEffectsMobile');

function setActiveCanvas() {
  activeCanvas   = isMobile() ? mobileCanvas   : desktopCanvas;
  activePopLayer = isMobile() ? mobilePop       : desktopPop;
  bindActiveCanvasInput();
}

function bindActiveCanvasInput() {
  desktopCanvas.style.pointerEvents = (activeCanvas === desktopCanvas) ? 'auto' : 'none';
  mobileCanvas.style.pointerEvents  = (activeCanvas === mobileCanvas)  ? 'auto' : 'none';
}

// ─── SCREEN MANAGER ───────────────────────────────────────
const SCREEN_IDS = ['intro','menu','game','pause','gameover','levelup','scores','options'];
function showScreen(name) {
  SCREEN_IDS.forEach(id => $(`screen-${id}`)?.classList.remove('active'));
  $(`screen-${name}`)?.classList.add('active');
  document.body.className = `on-${name}`;
  handleMusic(name);
}

// ═══════════════════════════════════════════════════════════
//  AUDIO ENGINE  (Web Audio API — no files needed for SFX)
// ═══════════════════════════════════════════════════════════
let _ac = null;
function getAC() {
  if (!_ac) try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
  return _ac;
}
function resumeAC() {
  const a = getAC();
  if (a?.state === 'suspended') a.resume();
}

function tone(freq, type='sine', dur=0.09, vol=0.28, delay=0, atk=0.012) {
  if (!G.opts.sound) return;
  const a = getAC(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime + delay);
    g.gain.setValueAtTime(0,    a.currentTime + delay);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + delay + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + atk + dur);
    o.start(a.currentTime + delay);
    o.stop( a.currentTime + delay + atk + dur + 0.06);
  } catch(e){}
}
function chord(freqs, type, dur, vol) {
  freqs.forEach((f,i) => tone(f, type, dur, vol / freqs.length, i * 0.016));
}

const SFX = {
  select()   { tone(480,'sine',0.07,0.22); tone(720,'sine',0.05,0.12,0.046); },
  deselect() { tone(320,'sine',0.07,0.18); tone(200,'sine',0.06,0.10,0.052); },
  swap()     { tone(310,'triangle',0.07,0.20); tone(430,'triangle',0.07,0.20,0.066); },
  invalid()  { tone(160,'sawtooth',0.10,0.28); tone(120,'sawtooth',0.09,0.22,0.092); },
  pop(n) {
    const b = 360 + Math.min(n,8) * 28;
    chord([b, b*1.26, b*1.5, b*2].slice(0, Math.min(n,4)), 'sine', 0.12, 0.38);
    tone(85,'square',0.04,0.32);
  },
  combo(lvl) {
    const r = 270 + lvl * 45;
    const sc = [1, 1.25, 1.5, 1.875, 2, 2.5];
    for (let i = 0; i < Math.min(lvl+2, sc.length); i++)
      tone(r * sc[i], 'sine', 0.13, 0.26, i * 0.076);
  },
  bigClear() {
    chord([261,329,392,523,659],'triangle',0.22,0.28);
    tone(58,'sine',0.35,0.55,0.04);
  },
  levelUp() {
    [523,659,784,1047,1318].forEach((n,i) => tone(n,'triangle',0.16,0.28,i*0.1));
    tone(58,'sine',0.45,0.45,0.04);
  },
  gameOver() { [400,340,280,210].forEach((n,i) => tone(n,'sawtooth',0.20,0.24,i*0.19)); },
  shuffle()  { for(let i=0;i<6;i++) tone(180+Math.random()*400,'sine',0.06,0.10,i*0.046); },
  lowPuffs() { tone(270,'square',0.09,0.32); tone(200,'square',0.09,0.26,0.12); },
  newGame()  { [261,329,392,523].forEach((n,i) => tone(n,'triangle',0.14,0.28,i*0.086)); },
};

// ─── MUSIC ────────────────────────────────────────────────
const bgMusic = $('bgMusic');
function handleMusic(screen) {
  if (!bgMusic) return;
  bgMusic.volume = G.opts.musicVol;
  if (G.opts.music && ['menu','game'].includes(screen)) bgMusic.play().catch(()=>{});
  else if (screen !== 'intro') bgMusic.pause();
}
function toggleMusic(on) {
  G.opts.music = on;
  on ? bgMusic?.play().catch(()=>{}) : bgMusic?.pause();
}

// ─── HAPTICS ──────────────────────────────────────────────
function vib(pattern) {
  if (G.opts.vibrate && navigator.vibrate) navigator.vibrate(pattern);
}

// ═══════════════════════════════════════════════════════════
//  IMAGE LOADING
// ═══════════════════════════════════════════════════════════
function loadImages() {
  return new Promise(resolve => {
    let pending = NUG_TYPES.length;
    NUG_TYPES.forEach(k => {
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
function randNug(excl) {
  const t = excl ? NUG_TYPES.filter(x => x !== excl) : [...NUG_TYPES];
  return t[Math.floor(Math.random() * t.length)];
}

function createGrid() {
  const g = [];
  for (let r = 0; r < ROWS; r++) {
    g[r] = [];
    for (let c = 0; c < COLS; c++) {
      let ex = null;
      if (c >= 2 && g[r][c-1] === g[r][c-2]) ex = g[r][c-1];
      if (r >= 2 && g[r-1][c] === g[r-2][c]) {
        const v = g[r-1][c];
        ex = (ex && ex !== v) ? null : v;
      }
      g[r][c] = randNug(ex);
    }
  }
  return g;
}

function findMatches(g) {
  const m = new Set();
  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 2; c++) {
      const t = g[r][c]; if (!t) continue;
      let l = 1;
      while (c + l < COLS && g[r][c+l] === t) l++;
      if (l >= MIN_MATCH) for (let i = 0; i < l; i++) m.add(`${r},${c+i}`);
    }
  }
  // Vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 2; r++) {
      const t = g[r][c]; if (!t) continue;
      let l = 1;
      while (r + l < ROWS && g[r+l][c] === t) l++;
      if (l >= MIN_MATCH) for (let i = 0; i < l; i++) m.add(`${r+i},${c}`);
    }
  }
  return m;
}

// ═══════════════════════════════════════════════════════════
//  SECTION 2 — SPECIAL-PIECE HELPERS
//  G.specials is a sidecar map: "r,c" → type string.
//  The grid itself keeps the nug color; specials only add metadata.
// ═══════════════════════════════════════════════════════════
function setSpecial(r, c, type) { G.specials[`${r},${c}`] = type; }
function getSpecial(r, c)       { return G.specials[`${r},${c}`] || null; }
function clearSpecial(r, c)     { delete G.specials[`${r},${c}`]; }

// ═══════════════════════════════════════════════════════════
//  SECTION 3 — MATCH-SHAPE ANALYSIS
//  Scans the set of matched cells, finds individual runs, and
//  determines which special type (if any) each run should spawn.
//  Priority: seed (5+) > water (L/T intersection) > ladybug (4).
// ═══════════════════════════════════════════════════════════
function analyzeMatchesForSpecials(g, matchedSet) {
  const result = [];

  // Collect horizontal runs of 3+ fully within matchedSet
  const hRuns = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 2; c++) {
      const t = g[r][c];
      if (!t || !matchedSet.has(`${r},${c}`)) continue;
      if (c > 0 && g[r][c-1] === t && matchedSet.has(`${r},${c-1}`)) continue; // not start
      let l = 1;
      while (c + l < COLS && g[r][c+l] === t) l++;
      if (l >= 3) {
        const cells = Array.from({ length: l }, (_, i) => `${r},${c+i}`);
        if (cells.every(k => matchedSet.has(k))) hRuns.push({ cells, l });
      }
    }
  }

  // Collect vertical runs of 3+ fully within matchedSet
  const vRuns = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 2; r++) {
      const t = g[r][c];
      if (!t || !matchedSet.has(`${r},${c}`)) continue;
      if (r > 0 && g[r-1][c] === t && matchedSet.has(`${r-1},${c}`)) continue; // not start
      let l = 1;
      while (r + l < ROWS && g[r+l][c] === t) l++;
      if (l >= 3) {
        const cells = Array.from({ length: l }, (_, i) => `${r+i},${c}`);
        if (cells.every(k => matchedSet.has(k))) vRuns.push({ cells, l });
      }
    }
  }

  const assigned = new Set();

  // 1. Seed: any run of 5+ cells
  for (const run of [...hRuns, ...vRuns]) {
    if (run.l >= 5) {
      const center = run.cells[Math.floor(run.cells.length / 2)];
      if (!assigned.has(center)) { result.push({ key: center, type: 'seed' }); assigned.add(center); }
    }
  }

  // 2. Water: cell that belongs to both a horizontal AND vertical run (L or T)
  const hSet = new Set(hRuns.flatMap(r => r.cells));
  const vSet = new Set(vRuns.flatMap(r => r.cells));
  for (const k of hSet) {
    if (vSet.has(k) && !assigned.has(k)) {
      result.push({ key: k, type: 'water' });
      assigned.add(k);
    }
  }

  // 3. Ladybug: any run of exactly 4
  for (const run of [...hRuns, ...vRuns]) {
    if (run.l === 4) {
      const center = run.cells[Math.floor(run.cells.length / 2)];
      if (!assigned.has(center)) { result.push({ key: center, type: 'ladybug' }); assigned.add(center); }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
//  SECTION 4 — SPECIAL ACTIVATION LOGIC
//  Each function removes the special from the sidecar and
//  returns an array of "r,c" keys to clear from the grid.
// ═══════════════════════════════════════════════════════════

// Ladybug — clears the row or column with more filled cells.
// Theme: ladybugs patrol a full row/column eating pests.
function activateLadybug(r, c) {
  clearSpecial(r, c);
  let rowFill = 0, colFill = 0;
  for (let cc = 0; cc < COLS; cc++) if (G.grid[r][cc]) rowFill++;
  for (let rr = 0; rr < ROWS; rr++) if (G.grid[rr][c]) colFill++;
  const keys = [];
  if (rowFill >= colFill) {
    for (let cc = 0; cc < COLS; cc++) keys.push(`${r},${cc}`);
    spawnText(r, 3, '🐞 ROW CLEARED!', '#ff6655', 20);
  } else {
    for (let rr = 0; rr < ROWS; rr++) keys.push(`${rr},${c}`);
    spawnText(Math.floor(ROWS/2), c, '🐞 COL!', '#ff6655', 20);
  }
  SFX.bigClear();
  return keys;
}

// Magic Seed — clears every nug of the same color on the board.
// Theme: a magic seed spreads growth to every matching plant.
function activateSeed(r, c) {
  clearSpecial(r, c);
  const color = G.grid[r][c];
  const keys = [];
  for (let rr = 0; rr < ROWS; rr++)
    for (let cc = 0; cc < COLS; cc++)
      if (G.grid[rr][cc] === color) keys.push(`${rr},${cc}`);
  spawnText(r, c, '🌱 SEEDED!', '#88ff44', 22);
  SFX.bigClear();
  return keys;
}

// Water Drop — clears a 3×3 area centered on the drop.
// Theme: explosive watering causes rapid growth (and clearing).
function activateWater(r, c) {
  clearSpecial(r, c);
  const keys = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) keys.push(`${nr},${nc}`);
    }
  spawnText(r, c, '💧 SPLASH!', '#5ecfc8', 22);
  SFX.bigClear();
  return keys;
}

// Dispatch any special at position (r,c); returns cells to add to the clear set.
function triggerSpecial(r, c) {
  const type = getSpecial(r, c);
  if (!type) return [];
  if (type === 'ladybug') return activateLadybug(r, c);
  if (type === 'seed')    return activateSeed(r, c);
  if (type === 'water')   return activateWater(r, c);
  return [];
}

// ═══════════════════════════════════════════════════════════
//  SECTION 5 — GRAVITY WITH SPECIALS METADATA
//  When a nug falls from row A to row B, its sidecar entry
//  travels with it so the special remains attached.
// ═══════════════════════════════════════════════════════════
function gravity(g) {
  for (let c = 0; c < COLS; c++) {
    // Pull non-null cells downward; move their special metadata too
    for (let r = ROWS - 1; r > 0; r--) {
      if (!g[r][c]) {
        let a = r - 1;
        while (a >= 0 && !g[a][c]) a--;
        if (a >= 0) {
          g[r][c] = g[a][c]; g[a][c] = null;
          // Carry special sidecar entry along with the nug
          const sp = getSpecial(a, c);
          clearSpecial(a, c);
          if (sp) setSpecial(r, c, sp);
        }
      }
    }
    // Fill empty top cells with fresh nugs (no special)
    for (let r = 0; r < ROWS; r++) {
      if (!g[r][c]) g[r][c] = randNug();
    }
  }
}

function swapCells(g, r1, c1, r2, c2) {
  const t = g[r1][c1]; g[r1][c1] = g[r2][c2]; g[r2][c2] = t;
}

function isAdj(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function hasMove(g) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) {
        swapCells(g,r,c,r,c+1);
        const ok = findMatches(g).size > 0;
        swapCells(g,r,c,r,c+1);
        if (ok) return true;
      }
      if (r + 1 < ROWS) {
        swapCells(g,r,c,r+1,c);
        const ok = findMatches(g).size > 0;
        swapCells(g,r,c,r+1,c);
        if (ok) return true;
      }
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
//  CANVAS SIZING & DRAWING
// ═══════════════════════════════════════════════════════════
function calcCellSize() {
  if (isMobile()) {
    // Top HUD: ~54px + progress bar: ~7px = 61px
    // Bottom footer HUD: ~58px
    // Small padding: 8px total
    const avH = window.innerHeight - 61 - 58 - 8;
    const avW = window.innerWidth - 6;
    return Math.max(30, Math.floor(Math.min(avW / COLS, avH / ROWS, 76)));
  } else {
    const sideW = 220 + 200 + 2; // left + right sidebar + borders
    const avW = window.innerWidth - sideW - 20;
    const avH = window.innerHeight - 16;
    return Math.max(40, Math.floor(Math.min(avW / COLS, avH / ROWS, 88)));
  }
}

function resizeCanvas() {
  setActiveCanvas();
  const cs  = G.cellSize;
  const dpr = window.devicePixelRatio || 1;
  const logW = cs * COLS;
  const logH = cs * ROWS;
  activeCanvas.width  = logW * dpr;
  activeCanvas.height = logH * dpr;
  activeCanvas.style.width  = logW + 'px';
  activeCanvas.style.height = logH + 'px';
  desktopCanvas.style.display = (activeCanvas === desktopCanvas) ? 'block' : 'none';
  mobileCanvas.style.display  = (activeCanvas === mobileCanvas)  ? 'block' : 'none';
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y,   x+w, y+r,   r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x,   y+h, x,   y+h-r, r);
  ctx.lineTo(x, y+r);   ctx.arcTo(x,   y,   x+r, y,     r);
  ctx.closePath();
}

function drawGrid() {
  if (!activeCanvas) return;
  const cvs = activeCanvas;
  const ctx = cvs.getContext('2d');
  const cs  = G.cellSize;
  const dpr = window.devicePixelRatio || 1;
  const logW = cs * COLS;
  const logH = cs * ROWS;

  // Scale context so all drawing uses CSS-pixel coordinates (crisp on HiDPI)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, logW, logH);

  // Dark translucent grid backing
  ctx.fillStyle = 'rgba(3,8,2,0.78)';
  ctx.fillRect(0, 0, logW, logH);

  // Grid lines
  ctx.strokeStyle = 'rgba(111,207,63,0.09)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r*cs); ctx.lineTo(logW, r*cs); ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c*cs, 0); ctx.lineTo(c*cs, logH); ctx.stroke();
  }

  // Draw cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = G.grid[r]?.[c];
      if (!type) continue;

      const key  = `${r},${c}`;
      const anim = cellAnims[key] || {};
      const isSel = G.selected?.[0] === r && G.selected?.[1] === c;
      const scale = anim.scale ?? 1;
      const alpha = anim.alpha ?? 1;
      const ddx   = anim.dx ?? 0;
      const ddy   = anim.dy ?? 0;
      const pad   = cs < 56 ? 2 : 4;
      const size  = (cs - pad * 2) * scale;
      const cx = c * cs + cs / 2 + ddx;
      const cy = r * cs + cs / 2 + ddy;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Selected highlight
      if (isSel) {
        ctx.fillStyle = 'rgba(111,207,63,0.18)';
        rrect(ctx, c*cs+2, r*cs+2, cs-4, cs-4, 8);
        ctx.fill();
      }

      ctx.translate(cx, cy);
      if (isSel) { ctx.shadowColor = '#6fcf3f'; ctx.shadowBlur = 22; }

      const imgKey = type;
      const img = images[imgKey];
      if (img?.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -size/2, -size/2, size, size);
      } else {
        // Fallback circle
        ctx.beginPath(); ctx.arc(0, 0, size/2, 0, Math.PI*2);
        ctx.fillStyle = NUG_COLORS[type] || '#6fcf3f'; ctx.fill();
        ctx.font = `${size*0.38}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🌿', 0, 0);
      }

      ctx.restore();

      // Special-piece badge — drawn outside save/restore so alpha is always 1
      const spType = getSpecial(r, c);
      if (spType) {
        const icon = spType === 'ladybug' ? '🐞' : spType === 'seed' ? '🌱' : '💧';
        ctx.save();
        ctx.font = `${Math.max(10, size * 0.38)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Subtle dark shadow so the badge reads on any nug colour
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur  = 3;
        ctx.fillText(icon, cx + size * 0.26, cy - size * 0.26);
        ctx.restore();
      }

      // Selection ring drawn AFTER restore so no global alpha
      if (isSel) {
        ctx.save();
        ctx.strokeStyle = '#6fcf3f'; ctx.lineWidth = 2.5;
        ctx.shadowColor = '#6fcf3f'; ctx.shadowBlur  = 14;
        rrect(ctx, c*cs+3, r*cs+3, cs-6, cs-6, 8); ctx.stroke();
        ctx.restore();
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  ANIMATION HELPERS
// ═══════════════════════════════════════════════════════════
const eio = t => t < .5 ? 2*t*t : -1 + (4-2*t)*t;
const eob = t => { const c=2.5; return 1 + c*Math.pow(t-1,3) + c*Math.pow(t-1,2); };

function animKeys(keys, prop, from, to, dur, ef=eio) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const tick = now => {
      const t = Math.min((now - t0) / dur, 1), e = ef(t);
      keys.forEach(k => { cellAnims[k] = cellAnims[k] || {}; cellAnims[k][prop] = from + (to-from)*e; });
      drawGrid();
      t < 1 ? requestAnimationFrame(tick) : resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function animSwap(r1, c1, r2, c2) {
  const cs = G.cellSize;
  const dx = (c2-c1)*cs, dy = (r2-r1)*cs;
  const k1 = `${r1},${c1}`, k2 = `${r2},${c2}`;
  await new Promise(resolve => {
    const t0 = performance.now(), dur = 185;
    const tick = now => {
      const t = Math.min((now-t0)/dur, 1), e = eob(t);
      cellAnims[k1] = { dx: dx*e,  dy: dy*e  };
      cellAnims[k2] = { dx:-dx*e,  dy:-dy*e  };
      drawGrid();
      t < 1 ? requestAnimationFrame(tick) : resolve();
    };
    requestAnimationFrame(tick);
  });
  delete cellAnims[k1]; delete cellAnims[k2];
}

async function animPop(keys) {
  await animKeys(keys, 'scale', 1, 1.4, 125, eob);
  await new Promise(resolve => {
    const t0 = performance.now(), dur = 155;
    const tick = now => {
      const t = Math.min((now-t0)/dur, 1);
      keys.forEach(k => { cellAnims[k] = { scale: 1.4*(1-t), alpha: 1-t }; });
      drawGrid(); t < 1 ? requestAnimationFrame(tick) : resolve();
    };
    requestAnimationFrame(tick);
  });
  keys.forEach(k => delete cellAnims[k]);
}

// ═══════════════════════════════════════════════════════════
//  VISUAL FX
//  BUG FIX: all position calculations are relative to the
//  activePopLayer container (not the viewport) so elements
//  appear exactly over the correct grid cell.
// ═══════════════════════════════════════════════════════════
function popLayerRect() { return activePopLayer.getBoundingClientRect(); }
function canvasOffset()  {
  // Returns the canvas origin relative to its pop layer container
  const cRect = activeCanvas.getBoundingClientRect();
  const lRect = popLayerRect();
  return { x: cRect.left - lRect.left, y: cRect.top - lRect.top };
}

function cellCenter(r, c) {
  const cs = G.cellSize;
  const off = canvasOffset();
  return { x: off.x + c*cs + cs/2, y: off.y + r*cs + cs/2 };
}

function spawnText(r, c, text, color='#f5c842', size=26) {
  if (!G.opts.effects) return;
  const cs = G.cellSize;
  const off = canvasOffset();
  const x = off.x + c*cs + cs*0.1;
  const y = off.y + r*cs + cs*0.05;
  const el = document.createElement('div');
  el.className = 'pop-text';
  el.textContent = text;
  el.style.cssText = `color:${color};font-size:${size}px;left:${x}px;top:${y}px;`;
  activePopLayer.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function spawnParticles(r, c, color, n=10) {
  if (!G.opts.effects) return;
  const { x: px, y: py } = cellCenter(r, c);
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    const ang = (i/n)*Math.PI*2 + Math.random()*0.4;
    const dist = 20 + Math.random()*40, sz = 3 + Math.random()*7;
    el.style.cssText = `
      width:${sz}px; height:${sz}px; background:${color};
      left:${px - sz/2}px; top:${py - sz/2}px;
      --dx:${Math.cos(ang)*dist}px; --dy:${Math.sin(ang)*dist}px;
      animation-duration:${0.38 + Math.random()*0.34}s;`;
    activePopLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
}

function spawnFireParticles(r, c) {
  if (!G.opts.effects) return;
  const { x: px, y: py } = cellCenter(r, c);
  const fireColors = ['#ffee22','#ffcc00','#ffaa00','#ff7700','#ff4400','#ff2200'];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'fire-particle';
    const color = fireColors[Math.floor(Math.random() * fireColors.length)];
    const sz = 4 + Math.random() * 8;
    // Fan mostly upward with some spread
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.85;
    const dist = 28 + Math.random() * 52;
    const fdx = Math.cos(ang) * dist;
    const fdy = Math.sin(ang) * dist;
    const dur = (0.4 + Math.random() * 0.45).toFixed(2);
    el.style.cssText = `
      width:${sz}px; height:${sz * 1.35}px; background:${color};
      box-shadow:0 0 4px ${color};
      left:${px - sz / 2}px; top:${py - sz / 2}px;
      --fdx:${fdx}px; --fdy:${fdy}px;
      animation-duration:${dur}s;`;
    activePopLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
}

function spawnSelectFX(r, c) {
  if (!G.opts.effects) return;
  const cs = G.cellSize;
  const off = canvasOffset();
  const el = document.createElement('div');
  el.className = 'fx-select';
  el.style.cssText = `
    left:${off.x + c*cs + 4}px; top:${off.y + r*cs + 4}px;
    width:${cs-8}px; height:${cs-8}px;`;
  activePopLayer.appendChild(el);
  setTimeout(() => el.remove(), 300);
}

function spawnDeselectFX(r, c) {
  if (!G.opts.effects) return;
  const cs = G.cellSize;
  const off = canvasOffset();
  const el = document.createElement('div');
  el.className = 'fx-deselect';
  el.style.cssText = `
    left:${off.x + c*cs + 4}px; top:${off.y + r*cs + 4}px;
    width:${cs-8}px; height:${cs-8}px;`;
  activePopLayer.appendChild(el);
  setTimeout(() => el.remove(), 260);
}

function screenFlash(color = 'rgba(111,207,63,0.2)') {
  if (!G.opts.effects) return;
  const el = document.createElement('div');
  el.className = 'fx-screen-flash';
  el.style.background = color;
  el.style.zIndex = '400';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

// ═══════════════════════════════════════════════════════════
//  MATCH CASCADE ENGINE
// ═══════════════════════════════════════════════════════════
async function processMatches() {
  while (true) {
    const matched = findMatches(G.grid);
    if (!matched.size) break;

    G.combo++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;

    // --- Expand clear set by chaining any specials in the matched zone ---
    // We iterate until no new specials fire (handles stacked/adjacent specials).
    const toProcess = new Set(matched);
    const alreadyTriggered = new Set();
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const key of [...toProcess]) {
        const [r, c] = key.split(',').map(Number);
        if (getSpecial(r, c) && !alreadyTriggered.has(key)) {
          alreadyTriggered.add(key);
          const extra = triggerSpecial(r, c); // also removes from G.specials
          extra.forEach(k => { if (!toProcess.has(k)) { toProcess.add(k); expanded = true; } });
        }
      }
    }

    // --- Determine new specials born from this match (before we clear) ---
    // Analyse only the original findMatches result (not the special expansions)
    // so shape detection reflects the player's actual swap geometry.
    const newSpecials = analyzeMatchesForSpecials(G.grid, matched);
    // Only place a new special where no old special was already triggered
    const specialKeys = new Set(
      newSpecials.filter(s => !alreadyTriggered.has(s.key)).map(s => s.key)
    );

    // Cells that will hold a new special piece are NOT popped — they stay on the board
    const cellsToPop = [...toProcess].filter(k => !specialKeys.has(k));
    const types = [...toProcess].map(k => {
      const [r, c] = k.split(',').map(Number);
      return G.grid[r][c];
    });

    await animPop(cellsToPop);

    const pts = Math.floor(toProcess.size * 10 * Math.pow(G.combo, 1.45));
    G.score        += pts;
    G.cleared      += toProcess.size;
    G.totalCleared += toProcess.size;

    // Clear matched cells; skip cells that are becoming new specials
    let ti = 0;
    for (const k of toProcess) {
      const [r, c] = k.split(',').map(Number);
      highlightStrain(types[ti++]);
      if (specialKeys.has(k)) continue; // this cell becomes a special — keep its nug
      spawnFireParticles(r, c);
      clearSpecial(r, c); // remove any stale sidecar entry
      G.grid[r][c] = null;
    }

    // Register new specials into the sidecar (their nug remains in G.grid)
    for (const { key, type } of newSpecials) {
      if (!alreadyTriggered.has(key)) {
        const [r, c] = key.split(',').map(Number);
        setSpecial(r, c, type);
        const icon = type === 'ladybug' ? '🐞' : type === 'seed' ? '🌱' : '💧';
        spawnText(r, c - 1, `${icon}`, '#ffffff', 26);
        screenFlash('rgba(111,207,63,0.12)');
      }
    }

    SFX.pop(toProcess.size);
    if (toProcess.size >= 6) { setTimeout(() => SFX.bigClear(), 60); screenFlash('rgba(255,100,0,0.22)'); }
    if (G.combo >= 2) { setTimeout(() => SFX.combo(G.combo), 80); vib([30,20,55]); }
    else vib(30);

    // Pop text over middle cell
    const midKey = cellsToPop[Math.floor(cellsToPop.length / 2)] || [...toProcess][0];
    const [mr, mc] = midKey.split(',').map(Number);
    if (G.combo >= 2) {
      const label = COMBO_LABELS[Math.min(G.combo - 2, COMBO_LABELS.length - 1)];
      spawnText(mr - 1, mc, `${G.combo}x ${label}`, '#f5c842', 22);
      screenFlash('rgba(245,200,66,0.09)');
    }
    spawnText(mr, mc + 1, `+${pts}`, '#9ee060', 18);

    updateHUD();
    await sleep(110);
    gravity(G.grid);
    await sleep(90);
    if (G.cleared >= G.goal) break;
  }
}

function highlightStrain(type) {
  document.querySelectorAll('.strain-item').forEach(el => {
    if (el.dataset.type === type) {
      el.classList.add('active-match');
      setTimeout(() => el.classList.remove('active-match'), 620);
    }
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ═══════════════════════════════════════════════════════════
//  HUD UPDATES
// ═══════════════════════════════════════════════════════════
function updateHUD() {
  const sc  = G.score.toLocaleString();
  const bst = (highScores[0]?.score || 0).toLocaleString();
  const pct = Math.min(G.cleared / G.goal, 1) * 100;

  // ── Desktop HUD ──
  setEl('d-score', sc, true);
  setEl('d-best',  bst);
  setEl('d-level', G.level);
  setEl('d-moves', G.moves);
  const dp = $('d-progress'); if (dp) dp.style.width = pct + '%';
  setEl('d-progress-label', `${G.cleared} / ${G.goal}`);
  setEl('d-maxcombo', G.maxCombo + 'x');
  setEl('d-cleared', G.totalCleared);

  const dc = $('d-combo');
  if (dc) {
    dc.textContent = G.combo >= 2 ? `${G.combo}x` : '';
    dc.classList.remove('pop'); void dc.offsetWidth;
    if (G.combo >= 2) dc.classList.add('pop');
  }
  const dMovesEl = $('d-moves');
  if (dMovesEl) dMovesEl.classList.toggle('low', G.moves <= 5);

  // ── Mobile HUD ──
  setEl('m-score', sc, true);
  setEl('m-best',  bst);
  setEl('m-level', G.level);
  setEl('m-moves', G.moves);
  const mp = $('m-progress'); if (mp) mp.style.width = pct + '%';
  setEl('m-progress-label', `${G.cleared} / ${G.goal}`);

  const mc = $('m-combo');
  if (mc) {
    mc.textContent = G.combo >= 2 ? `${G.combo}x` : '';
    mc.classList.remove('pop'); void mc.offsetWidth;
    if (G.combo >= 2) mc.classList.add('pop');
  }
  const mPuffsWrap = document.querySelector('.mfhud-puffs');
  if (mPuffsWrap) mPuffsWrap.classList.toggle('low', G.moves <= 5);

  // Fire lowPuffs SFX only on the move that crosses to exactly 5
  if (G.moves === 5 && _prevMoves > 5) SFX.lowPuffs();
  _prevMoves = G.moves;
}

function setEl(id, val, bump=false) {
  const el = $(id); if (!el) return;
  el.textContent = val;
  if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

function updateNextDisplay() {
  ['d-next','m-next'].forEach(id => {
    const el = $(id); if (!el) return;
    el.innerHTML = '';
    (G.nextNugs || []).slice(0, 3).forEach(type => {
      const img = document.createElement('img');
      img.src = `sprites/${type}.png`; img.alt = type;
      img.onerror = () => img.style.display = 'none';
      el.appendChild(img);
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  GAME FLOW
// ═══════════════════════════════════════════════════════════
function newGame() {
  G.grid         = createGrid();
  G.score        = 0;
  G.level        = 1;
  G.moves        = 30;
  G.goal         = LEVEL_GOALS[0];
  G.cleared      = 0;
  G.totalCleared = 0;
  G.combo        = 0;
  G.maxCombo     = 0;
  G.running      = true;
  G.selected     = null;
  G.animating    = false;
  G.nextNugs     = Array.from({ length: 9 }, () => randNug());
  G.specials     = {};
  cellAnims      = {};
  _prevMoves     = 30;

  G.cellSize = calcCellSize();
  setActiveCanvas();
  bindActiveCanvasInput();
  resizeCanvas();
  updateHUD();
  updateNextDisplay();
  drawGrid();
  showScreen('game');
  SFX.newGame();
  vib([20,10,40,10,70]);
  // Save immediately so Resume is valid even if the player exits before the first move.
  saveGame();
}

async function doSwap(r1, c1, r2, c2) {
  if (G.animating || !G.running) return;
  G.animating = true;
  G.combo = 0;
  spawnDeselectFX(r1, c1);
  G.selected = null;

  // Capture any specials on the two cells before the swap
  const sp1 = getSpecial(r1, c1);
  const sp2 = getSpecial(r2, c2);

  // Move grid values and their sidecar specials atomically
  swapCells(G.grid, r1, c1, r2, c2);
  clearSpecial(r1, c1); clearSpecial(r2, c2);
  if (sp1) setSpecial(r2, c2, sp1);
  if (sp2) setSpecial(r1, c1, sp2);

  SFX.swap(); vib(15);
  await animSwap(r1, c1, r2, c2);

  const hasMatch   = findMatches(G.grid).size > 0;
  const hasSpecial = !!(sp1 || sp2);

  // No match and no special involved — reverse the swap
  if (!hasMatch && !hasSpecial) {
    swapCells(G.grid, r1, c1, r2, c2);
    clearSpecial(r1, c1); clearSpecial(r2, c2);
    if (sp1) setSpecial(r1, c1, sp1);
    if (sp2) setSpecial(r2, c2, sp2);
    SFX.invalid(); vib([20,20,20]);
    await animSwap(r1, c1, r2, c2);
    drawGrid();
    G.animating = false;
    return;
  }

  G.moves--;

  // If there is no regular match but a special was swapped, fire it directly
  if (!hasMatch && hasSpecial) {
    G.combo = 1;
    const toProcess = new Set();
    // sp1 is now at (r2,c2), sp2 is now at (r1,c1)
    if (sp1) triggerSpecial(r2, c2).forEach(k => toProcess.add(k));
    if (sp2) triggerSpecial(r1, c1).forEach(k => toProcess.add(k));

    if (toProcess.size) {
      await animPop([...toProcess]);
      const pts = Math.floor(toProcess.size * 10);
      G.score += pts; G.cleared += toProcess.size; G.totalCleared += toProcess.size;
      for (const k of toProcess) {
        const [r, c] = k.split(',').map(Number);
        spawnFireParticles(r, c);
        clearSpecial(r, c);
        G.grid[r][c] = null;
      }
      SFX.pop(toProcess.size);
      updateHUD();
      await sleep(110);
      gravity(G.grid);
      await sleep(90);
    }
  }

  await processMatches();
  drawGrid();

  // Post-cascade checks (level-up takes priority over game-over)
  if (G.cleared >= G.goal) {
    await doLevelUp();
  } else if (G.moves <= 0) {
    doGameOver();
    return; // doGameOver sets running=false; no further processing
  } else if (!hasMove(G.grid)) {
    spawnText(4, 2, '🔀 SHUFFLE!', '#5ecfc8', 22);
    SFX.shuffle();
    await sleep(640);
    G.grid = createGrid();
    drawGrid();
  }

  G.animating = false;
  // Only advance the preview queue on regular moves, not level-ups.
  // doLevelUp sets G.running = false; if still false here, a level-up
  // or game-over just fired — don't consume an extra preview nug.
  if (G.running) {
    G.nextNugs.shift();
    G.nextNugs.push(randNug());
    updateNextDisplay();
  }
  saveGame();
}

async function doLevelUp() {
  // Guard: prevent double-trigger from rapid taps on btnContinue
  G.running = false;

  SFX.levelUp();
  vib([50,30,100,30,160]);
  screenFlash('rgba(255,120,0,0.28)');
  setTimeout(() => screenFlash('rgba(245,200,66,0.22)'), 180);

  G.level++;
  G.cleared = 0;
  G.goal    = LEVEL_GOALS[Math.min(G.level - 1, LEVEL_GOALS.length - 1)];
  G.moves   = Math.min(G.moves + 12, 48);
  _prevMoves = G.moves; // reset warning tracker after puff refill

  $('luLevel').textContent = G.level;
  $('luMsg').textContent   = LEVEL_MSGS[Math.min(G.level - 2, LEVEL_MSGS.length - 1)];
  $('luStars').textContent = G.level >= 8 ? '🌟🌟🌟' : G.level >= 5 ? '⭐🌟⭐' : '⭐⭐⭐';

  showScreen('levelup');

  // Wait for player to tap Continue — one-shot handler with guard
  await new Promise(resolve => {
    const btn = $('btnContinue');
    const handler = () => {
      btn.removeEventListener('click', handler);
      showScreen('game');
      G.running = true;
      resizeCanvas();
      drawGrid();
      resolve();
    };
    btn.addEventListener('click', handler);
  });
}

function doGameOver() {
  G.running   = false;
  G.animating = false;

  SFX.gameOver();
  vib([30,20,30,20,100]);

  // Check if this is a new high score BEFORE adding
  const prevBest = highScores[0]?.score ?? 0;
  addHighScore(G.score, G.level);
  const isNew = G.score > 0 && G.score >= prevBest;

  $('goScore').textContent   = G.score.toLocaleString();
  $('goLevel').textContent   = G.level;
  $('goCombo').textContent   = G.maxCombo + 'x';
  $('goCleared').textContent = G.totalCleared;

  const nb = $('goNewBest');
  if (nb) nb.style.display = isNew ? 'block' : 'none';
  if (isNew) { SFX.levelUp(); screenFlash('rgba(245,200,66,0.45)'); }

  showScreen('gameover');
}

// ─── SAVE / LOAD ──────────────────────────────────────────
function saveGame() {
  savedGame = JSON.parse(JSON.stringify(G));
  try { localStorage.setItem('nugz_save', JSON.stringify(savedGame)); } catch(e){}
}

function loadSave() {
  try {
    const s = localStorage.getItem('nugz_save');
    if (s) savedGame = JSON.parse(s);
  } catch(e) {}
  return savedGame;
}

function validateSave(save) {
  // Validate on grid structure and score only — never on `running`,
  // so paused saves (running===false) are accepted correctly.
  if (!save) return false;
  if (typeof save.score !== 'number') return false;
  if (!Array.isArray(save.grid) || save.grid.length !== ROWS) return false;
  for (let r = 0; r < ROWS; r++) {
    if (!Array.isArray(save.grid[r]) || save.grid[r].length !== COLS) return false;
    for (let c = 0; c < COLS; c++) {
      const cell = save.grid[r][c];
      if (cell !== null && !NUG_TYPES.includes(cell)) return false;
    }
  }
  return true;
}

function loadScores() {
  try { highScores = JSON.parse(localStorage.getItem('nugz_scores') || '[]'); }
  catch(e) { highScores = []; }
}
function saveScores() {
  try { localStorage.setItem('nugz_scores', JSON.stringify(highScores)); } catch(e){}
}
function addHighScore(score, level) {
  highScores.push({ score, level });
  highScores.sort((a,b) => b.score - a.score);
  highScores = highScores.slice(0, 10);
  saveScores();
}

function renderScores() {
  const medals = ['🥇','🥈','🥉'];
  $('scoresList').innerHTML = !highScores.length
    ? '<div style="text-align:center;color:rgba(255,255,255,0.3);padding:28px 0">No scores yet!<br>Play a game first 🌿</div>'
    : highScores.map((s,i) =>
        `<div class="score-entry">
          <span class="score-rank">${medals[i] || '#'+(i+1)}</span>
          <span class="score-val">${s.score.toLocaleString()}</span>
          <span class="score-lvl">LVL ${s.level}</span>
        </div>`
      ).join('');
}

// ═══════════════════════════════════════════════════════════
//  INPUT — CANVAS (click, touch, swipe)
// ═══════════════════════════════════════════════════════════
function cellAt(clientX, clientY) {
  const rect = activeCanvas.getBoundingClientRect();
  const cs   = G.cellSize;
  const c = Math.floor((clientX - rect.left)  / cs);
  const r = Math.floor((clientY - rect.top)   / cs);
  return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? [r, c] : null;
}

function tapCell(r, c) {
  if (G.animating || !G.running) return;
  if (!G.selected) {
    G.selected = [r, c];
    SFX.select();
    spawnSelectFX(r, c);
    vib(14);
    drawGrid();
  } else {
    const [sr, sc] = G.selected;
    if (sr === r && sc === c) {
      spawnDeselectFX(r, c);
      G.selected = null;
      SFX.deselect();
      drawGrid();
    } else if (isAdj(sr, sc, r, c)) {
      doSwap(sr, sc, r, c);
    } else {
      // Re-select new cell
      spawnDeselectFX(sr, sc);
      spawnSelectFX(r, c);
      G.selected = [r, c];
      SFX.select();
      vib(12);
      drawGrid();
    }
  }
}

let _touchStart = null;

function setupCanvasInput(cvs) {
  cvs.addEventListener('touchstart', e => {
    e.preventDefault();
    resumeAC();
    const t = e.touches[0];
    _touchStart = { x: t.clientX, y: t.clientY };
    const pos = cellAt(t.clientX, t.clientY);
    if (pos) tapCell(...pos);
  }, { passive: false });

  cvs.addEventListener('touchend', e => {
    e.preventDefault();
    if (!_touchStart || !G.selected || G.animating) { _touchStart = null; return; }
    const t   = e.changedTouches[0];
    const dx  = t.clientX - _touchStart.x;
    const dy  = t.clientY - _touchStart.y;
    _touchStart = null;
    if (Math.sqrt(dx*dx + dy*dy) > 22) {
      // Swipe gesture — move in dominant direction from selected cell
      const [sr, sc] = G.selected;
      let tr = sr, tc = sc;
      if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
      else                              tr += dy > 0 ? 1 : -1;
      if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) doSwap(sr, sc, tr, tc);
    }
  }, { passive: false });

  cvs.addEventListener('mousedown', e => {
    resumeAC();
    const pos = cellAt(e.clientX, e.clientY);
    if (pos) tapCell(...pos);
  });
}

setupCanvasInput(desktopCanvas);
setupCanvasInput(mobileCanvas);

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (!G.selected || G.animating || !G.running) return;
  const [sr, sc] = G.selected;
  const dirs = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] };
  if (dirs[e.key]) {
    e.preventDefault();
    const [dr, dc] = dirs[e.key];
    const tr = sr+dr, tc = sc+dc;
    if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) doSwap(sr, sc, tr, tc);
  }
  if (e.key === 'Escape') {
    spawnDeselectFX(sr, sc);
    G.selected = null;
    SFX.deselect();
    drawGrid();
  }
});

// ═══════════════════════════════════════════════════════════
//  MENU NUG DECORATION
// ═══════════════════════════════════════════════════════════
function initMenuNugs() {
  // Desktop showcase
  const showcase = $('nugShowcase');
  if (showcase) {
    showcase.innerHTML = '';
    NUG_TYPES.forEach((type, i) => {
      const wrap = document.createElement('div'); wrap.className = 'nug-item';
      const img  = document.createElement('img');
      img.src = `sprites/${type}.png`; img.alt = type;
      img.style.setProperty('--dur', (3.2 + i * 0.4) + 's');
      img.style.setProperty('--del', (i   * 0.50)    + 's');
      img.onerror = () => img.style.display = 'none';
      const lbl  = document.createElement('div'); lbl.className = 'nug-label';
      lbl.textContent = NUG_STRAINS[i];
      wrap.appendChild(img); wrap.appendChild(lbl);
      showcase.appendChild(wrap);
    });
  }

  // Mobile nugs row
  const mrow = $('mobileNugsRow');
  if (mrow) {
    mrow.innerHTML = '';
    NUG_TYPES.forEach((type, i) => {
      const img = document.createElement('img');
      img.src = `sprites/${type}.png`; img.alt = type;
      img.style.setProperty('--dur', (3.0 + i * 0.5) + 's');
      img.style.setProperty('--del', (i   * 0.45)    + 's');
      img.onerror = () => img.style.display = 'none';
      mrow.appendChild(img);
    });
  }
}

// Random sparkle on mobile nug row
setInterval(() => {
  const imgs = document.querySelectorAll('#mobileNugsRow img');
  if (!imgs.length) return;
  const img = imgs[Math.floor(Math.random() * imgs.length)];
  img.classList.add('sparkle');
  setTimeout(() => img.classList.remove('sparkle'), 380);
}, 760);

// ═══════════════════════════════════════════════════════════
//  BUTTON WIRING
// ═══════════════════════════════════════════════════════════
function on(ids, fn) {
  (Array.isArray(ids) ? ids : [ids]).forEach(id => {
    const el = $(id); if (el) el.addEventListener('click', fn);
  });
}

// ─── BUTTON RESPONSIVENESS ────────────────────────────────
// Subtle hover tone (desktop only)
function hoverTone() { if (G.opts.sound) tone(520,'sine',0.035,0.07); }

// Wire hover sounds + ripple + instant press class on all interactive buttons
document.querySelectorAll('.menu-btn, .mbtn, .modal-btn, .side-btn').forEach(btn => {
  // Hover sound on mouse enter (skipped on touch to avoid double-fire)
  btn.addEventListener('mouseenter', () => { if (!btn.disabled) hoverTone(); });

  // Immediate visual press class for sub-frame feedback before click fires
  btn.addEventListener('pointerdown', e => {
    btn.classList.add('btn-pressing');
    // Ripple spawn at pointer position
    const r = btn.getBoundingClientRect();
    const rip = document.createElement('span');
    rip.className = 'btn-ripple';
    rip.style.left = (e.clientX - r.left) + 'px';
    rip.style.top  = (e.clientY - r.top)  + 'px';
    btn.appendChild(rip);
    rip.addEventListener('animationend', () => rip.remove(), { once: true });
  });

  const releasePressing = () => btn.classList.remove('btn-pressing');
  btn.addEventListener('pointerup',     releasePressing);
  btn.addEventListener('pointerleave',  releasePressing);
  btn.addEventListener('pointercancel', releasePressing);
});

// New Game
on(['btnNewGame-d','btnNewGame-m'], () => { resumeAC(); newGame(); });

// resumeGame — extracted so it can be called from the button handler.
// Fix: removed `save.running !== false` gate so paused saves are accepted.
// Fix: restores G.running=true / G.animating=false for a playable state.
// Fix: preserves G.opts — never overwrites with stale saved options.
// Fix: corrupt/missing saves are wiped from storage and Resume is disabled.
function resumeGame() {
  const save = loadSave();
  if (validateSave(save)) {
    // Preserve current options — only restore gameplay state
    const currentOpts = { ...G.opts };
    Object.assign(G, save);
    G.opts      = currentOpts;  // protect: don't restore stale opts from save
    G.running   = true;         // restore playable state regardless of how it was saved
    G.animating = false;
    // Ensure nextNugs exists (guard for saves made before Fix 3 landed)
    if (!Array.isArray(G.nextNugs) || G.nextNugs.length === 0) {
      G.nextNugs = Array.from({ length: 9 }, () => randNug());
    }
    gravity(G.grid);  // heal any nulls from a mid-cascade save
    if (!G.specials) G.specials = {};  // guard for old saves without specials
    cellAnims  = {};
    _prevMoves = G.moves;

    G.cellSize = calcCellSize();
    setActiveCanvas();
    bindActiveCanvasInput();
    resizeCanvas();
    updateHUD();
    updateNextDisplay();
    drawGrid();
    showScreen('game');
    SFX.select();
  } else {
    // Corrupt / missing save — wipe it so it cannot be retried, then
    // permanently disable the Resume buttons and show the NO SAVE message.
    try { localStorage.removeItem('nugz_save'); } catch(e) {}
    savedGame = null;
    ['btnResume-d','btnResume-m'].forEach(id => {
      const b = $(id); if (!b) return;
      b.innerHTML = b.classList.contains('mbtn')
        ? '❌ NO SAVE'
        : '<span class="btn-icon">❌</span><span class="btn-label">NO SAVE</span>';
      b.style.opacity = '0.42';
    });
    SFX.invalid();
  }
}

// Resume
on(['btnResume-d','btnResume-m'], () => { resumeAC(); resumeGame(); });

// High Scores
on(['btnHighScore-d','btnHighScore-m'], () => { renderScores(); showScreen('scores'); SFX.select(); });
on('btnScoresBack', () => { showScreen('menu'); SFX.deselect(); });

// Options
on(['btnOptions-d','btnOptions-m'], () => { syncOpts(); showScreen('options'); SFX.select(); });
on('btnOptBack', () => {
  G.opts.sound    = $('optSound').checked;
  G.opts.music    = $('optMusic').checked;
  G.opts.vibrate  = $('optVibrate').checked;
  G.opts.effects  = $('optEffects').checked;
  G.opts.musicVol = parseInt($('optMusicVol').value) / 100;
  if (bgMusic) bgMusic.volume = G.opts.musicVol;
  toggleMusic(G.opts.music);
  showScreen('menu');
  SFX.deselect();
});
$('optMusic')?.addEventListener('change', e => { resumeAC(); toggleMusic(e.target.checked); });
$('optMusicVol')?.addEventListener('input', e => {
  G.opts.musicVol = parseInt(e.target.value) / 100;
  if (bgMusic) bgMusic.volume = G.opts.musicVol;
});

// Quit
on(['btnQuit-d','btnQuit-m'], () => {
  resumeAC();
  if (confirm('Quit NUGZ? 🌿')) {
    saveGame();
    // window.close() only works for script-opened tabs.
    // Fall back to redirecting to the shop after a short delay.
    window.close();
    setTimeout(() => {
      try { window.location.href = 'https://www.ismokeshop.net'; } catch(e) {}
    }, 300);
  }
});

// Pause
on(['btnPause-d','btnPause-m2'], () => { G.running = false; showScreen('pause'); });
on('btnResumePause',  () => { G.running = true; showScreen('game'); SFX.select(); });
on('btnRestartPause', () => { if (confirm('Start a new game?')) newGame(); });
on('btnMenuPause',    () => { saveGame(); G.animating = false; showScreen('menu'); });

// Game over
on('btnPlayAgain', () => { resumeAC(); newGame(); });
on('btnGoMenu',    () => { showScreen('menu'); });

// ─── RESIZE HANDLER ───────────────────────────────────────
window.addEventListener('resize', debounce(() => {
  if ($('screen-game')?.classList.contains('active')) {
    G.cellSize = calcCellSize();
    setActiveCanvas();
    bindActiveCanvasInput();
    resizeCanvas();
    drawGrid();
  }
}, 120));

// ─── SYNC OPTIONS UI ──────────────────────────────────────
function syncOpts() {
  const s = (id, v) => { const e = $(id); if (e) e.checked = v; };
  s('optSound',   G.opts.sound);
  s('optMusic',   G.opts.music);
  s('optVibrate', G.opts.vibrate);
  s('optEffects', G.opts.effects);
  const mv = $('optMusicVol'); if (mv) mv.value = Math.round(G.opts.musicVol * 100);
}

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
async function boot() {
  loadScores();
  loadSave();
  syncOpts();

  // ── INTRO VIDEO ──────────────────────────────────────────
  function goToMenu() {
    showScreen('menu');
    if (!validateSave(savedGame)) {
      ['btnResume-d','btnResume-m'].forEach(id => {
        const b = $(id); if (b) b.style.opacity = '0.42';
      });
    }
  }

  const vid = $('introVideo');
  if (vid) {
    showScreen('intro');

    // Audio context must be unlocked by first user gesture; also unmute video if it
    // had to start muted for autoplay compliance.
    // Only start bgMusic if it isn't already playing — prevents a double-play glitch
    // when skip() and unlock() both fire from the same tap (skip goes first via
    // bubbling and already starts music via handleMusic; unlock just fills the gap
    // for cases where the first play() was blocked by autoplay policy).
    // A single mobile tap also synthesizes a click after touchstart, so without the
    // paused-guard bgMusic.play() would be called twice, causing an audible stutter.
    const unlock = () => {
      resumeAC();
      if (G.opts.music && bgMusic?.paused) bgMusic.play().catch(()=>{});
      if (!vid.ended && !vid.paused) vid.muted = false;
    };
    document.addEventListener('click',      unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });

    // Guard against goToMenu() being called twice (e.g. vid.pause() causes
    // the pending play() promise to reject, which would re-fire the catch handler)
    let gone = false;
    function goToMenuOnce() {
      if (gone) return;
      gone = true;
      goToMenu();
    }

    // Try unmuted autoplay first so the video has sound.
    // If the browser blocks unmuted autoplay, mute and retry.
    // If even muted autoplay is blocked, go straight to the menu.
    vid.play().catch(() => {
      if (gone) return; // skip was already triggered — don't retry
      vid.muted = true;
      vid.play().catch(() => goToMenuOnce());
    });

    let skipTriggered = false;
    const skip = (ev) => {
      if (skipTriggered) return;
      skipTriggered = true;
      // On mobile, touchstart is followed by a synthetic click. Suppress it so
      // skip/unlock handlers cannot race each other and stall the transition.
      if (ev?.cancelable) ev.preventDefault();
      ev?.stopPropagation?.();
      vid.removeEventListener('ended', skip);
      $('screen-intro')?.removeEventListener('click', skip);
      $('screen-intro')?.removeEventListener('touchstart', skip);
      // Remove unlock listeners so they can't race against vid.pause() on the
      // same touchstart event (bubbling to document would call vid.muted=false
      // on a video that's mid-pause, causing a media-pipeline freeze on mobile)
      document.removeEventListener('click',      unlock);
      document.removeEventListener('touchstart', unlock);
      goToMenuOnce(); // transition first so the UI never stalls
      // Full media teardown is more reliable on mobile than pause() during a
      // gesture event, which can freeze Safari/Chrome media pipelines.
      // Remove <source> children and the autoplay attribute BEFORE calling
      // vid.load() — otherwise load() re-reads the <source> src, autoplay
      // kicks in, and the video replays (even in a hidden container, some
      // mobile browsers surface the video or prevent the menu transition).
      requestAnimationFrame(() => {
        vid.pause();
        vid.removeAttribute('autoplay');
        vid.querySelectorAll('source').forEach(s => s.remove());
        vid.removeAttribute('src');
        vid.load();
      });
    };
    vid.addEventListener('ended', skip);
    $('screen-intro')?.addEventListener('click', skip);
    $('screen-intro')?.addEventListener('touchstart', skip, { passive: false });
  } else {
    // Audio unlock still needed even without intro video
    const unlock = () => { resumeAC(); if (G.opts.music && bgMusic?.paused) bgMusic.play().catch(()=>{}); };
    document.addEventListener('click',      unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    goToMenu();
  }

  // Load all sprites then populate menu decorations (runs in background)
  await loadImages();
  initMenuNugs();
}

setActiveCanvas();
bindActiveCanvasInput();
boot();

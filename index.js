/* ═══════════════════════════════════════════════════════════
   NUGZ v3 — index.js
   Unified game engine: desktop sidebar layout + mobile stack
   Full SFX / music / animations / select-deselect FX
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

// ─── DETECT LAYOUT ────────────────────────────────────────
const isMobile = () => window.innerWidth < 768 || (window.innerHeight <= 500 && window.innerWidth < window.innerHeight * 2);

// ─── STATE ────────────────────────────────────────────────
const G = {
  grid:[], score:0, level:1, moves:30,
  goal:LEVEL_GOALS[0], cleared:0, totalCleared:0,
  combo:0, maxCombo:0,
  running:false, selected:null, animating:false,
  nextNugs:[], cellSize:64,
  opts:{ sound:true, music:false, vibrate:true, effects:true, musicVol:0.6 }
};
let highScores = [];
let savedGame  = null;
let images     = {};
let cellAnims  = {};
let activeCanvas, activePopLayer;

// ─── DOM ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const desktopCanvas = $('gameCanvas');
const mobileCanvas  = $('gameCanvasMobile');
const desktopPop    = $('popEffects');
const mobilePop     = $('popEffectsMobile');

function setActiveCanvas() {
  if (isMobile()) {
    activeCanvas   = mobileCanvas;
    activePopLayer = mobilePop;
  } else {
    activeCanvas   = desktopCanvas;
    activePopLayer = desktopPop;
  }
}

// ─── SCREEN MANAGER ───────────────────────────────────────
const SCREEN_IDS = ['menu','game','pause','gameover','levelup','scores','options'];
function showScreen(name) {
  SCREEN_IDS.forEach(id => {
    const el = $(`screen-${id}`);
    if (el) el.classList.remove('active');
  });
  $(`screen-${name}`)?.classList.add('active');
  document.body.className = `on-${name}`;
  handleMusic(name);
}

// ═══════════════════════════════════════════════════════════
//  AUDIO ENGINE
// ═══════════════════════════════════════════════════════════
let ac = null;
function getAC() {
  if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
  return ac;
}
function resumeAC() { const a = getAC(); if (a?.state === 'suspended') a.resume(); }

function tone(freq, type='sine', dur=0.09, vol=0.28, delay=0, atk=0.01) {
  if (!G.opts.sound) return;
  const a = getAC(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime + delay);
    g.gain.setValueAtTime(0, a.currentTime + delay);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + delay + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + atk + dur);
    o.start(a.currentTime + delay);
    o.stop(a.currentTime + delay + atk + dur + 0.05);
  } catch(e){}
}
function chord(freqs, type, dur, vol) { freqs.forEach((f,i) => tone(f, type, dur, vol/freqs.length, i*0.016)); }

const SFX = {
  select()  { tone(480,'sine',0.07,0.22); tone(720,'sine',0.05,0.12,0.045); },
  deselect(){ tone(320,'sine',0.07,0.18); tone(200,'sine',0.06,0.10,0.05); },
  swap()    { tone(310,'triangle',0.07,0.2); tone(430,'triangle',0.07,0.2,0.065); },
  invalid() { tone(160,'sawtooth',0.10,0.28); tone(120,'sawtooth',0.09,0.22,0.09); },
  pop(n)    {
    const b = 360 + Math.min(n,8)*28;
    chord([b, b*1.26, b*1.5, b*2].slice(0,Math.min(n,4)), 'sine', 0.12, 0.38);
    tone(85,'square',0.04,0.32);
  },
  combo(lvl) {
    const r = 270 + lvl*45;
    const sc = [1,1.25,1.5,1.875,2,2.5];
    for (let i=0; i<Math.min(lvl+2,sc.length); i++) tone(r*sc[i],'sine',0.13,0.26,i*0.075);
  },
  bigClear() {
    chord([261,329,392,523,659],'triangle',0.22,0.28);
    tone(58,'sine',0.35,0.55,0.04);
  },
  levelUp()  {
    [523,659,784,1047,1318].forEach((n,i) => tone(n,'triangle',0.16,0.28,i*0.1));
    tone(58,'sine',0.45,0.45,0.04);
  },
  gameOver() { [400,340,280,210].forEach((n,i) => tone(n,'sawtooth',0.2,0.24,i*0.19)); },
  shuffle()  { for(let i=0;i<6;i++) tone(180+Math.random()*400,'sine',0.06,0.1,i*0.045); },
  lowPuffs() { tone(270,'square',0.09,0.32); tone(200,'square',0.09,0.26,0.12); },
  newGame()  { [261,329,392,523].forEach((n,i) => tone(n,'triangle',0.14,0.28,i*0.085)); },
};

// ─── MUSIC ────────────────────────────────────────────────
const bgMusic = $('bgMusic');
function handleMusic(screen) {
  if (!bgMusic) return;
  bgMusic.volume = G.opts.musicVol;
  if (G.opts.music && ['menu','game'].includes(screen)) bgMusic.play().catch(()=>{});
  else bgMusic.pause();
}
function toggleMusic(on) {
  G.opts.music = on;
  if (on) { bgMusic?.play().catch(()=>{}); }
  else bgMusic?.pause();
}

// ─── HAPTICS ──────────────────────────────────────────────
function vib(p) { if(G.opts.vibrate && navigator.vibrate) navigator.vibrate(p); }

// ═══════════════════════════════════════════════════════════
//  IMAGE LOADING
// ═══════════════════════════════════════════════════════════
function loadImages() {
  return new Promise(resolve => {
    const keys = [...NUG_TYPES, ...NUG_TYPES.map(n=>n+'_glow'), ...NUG_TYPES.map(n=>n+'_pop')];
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
function randNug(excl) {
  let t = excl ? NUG_TYPES.filter(x=>x!==excl) : [...NUG_TYPES];
  return t[Math.floor(Math.random()*t.length)];
}
function createGrid() {
  const g = [];
  for (let r=0; r<ROWS; r++) {
    g[r] = [];
    for (let c=0; c<COLS; c++) {
      let ex = null;
      if (c>=2 && g[r][c-1]===g[r][c-2]) ex = g[r][c-1];
      if (r>=2 && g[r-1][c]===g[r-2][c]) { const v=g[r-1][c]; ex=(ex&&ex!==v)?null:v; }
      g[r][c] = randNug(ex);
    }
  }
  return g;
}
function findMatches(g) {
  const m = new Set();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS-2;c++) {
    const t=g[r][c]; if(!t) continue;
    let l=1; while(c+l<COLS&&g[r][c+l]===t) l++;
    if(l>=MIN_MATCH) for(let i=0;i<l;i++) m.add(`${r},${c+i}`);
  }
  for(let c=0;c<COLS;c++) for(let r=0;r<ROWS-2;r++) {
    const t=g[r][c]; if(!t) continue;
    let l=1; while(r+l<ROWS&&g[r+l][c]===t) l++;
    if(l>=MIN_MATCH) for(let i=0;i<l;i++) m.add(`${r+i},${c}`);
  }
  return m;
}
function gravity(g) {
  for(let c=0;c<COLS;c++) {
    for(let r=ROWS-1;r>0;r--) if(!g[r][c]) {
      let a=r-1; while(a>=0&&!g[a][c]) a--;
      if(a>=0){g[r][c]=g[a][c];g[a][c]=null;}
    }
    for(let r=0;r<ROWS;r++) if(!g[r][c]) g[r][c]=randNug();
  }
}
function swapCells(g,r1,c1,r2,c2){const t=g[r1][c1];g[r1][c1]=g[r2][c2];g[r2][c2]=t;}
function isAdj(r1,c1,r2,c2){return Math.abs(r1-r2)+Math.abs(c1-c2)===1;}
function hasMove(g) {
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
    if(c+1<COLS){swapCells(g,r,c,r,c+1);const m=findMatches(g).size;swapCells(g,r,c,r,c+1);if(m>0)return true;}
    if(r+1<ROWS){swapCells(g,r,c,r+1,c);const m=findMatches(g).size;swapCells(g,r,c,r+1,c);if(m>0)return true;}
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
//  CANVAS DRAWING
// ═══════════════════════════════════════════════════════════
function resizeCanvas() {
  setActiveCanvas();
  const cs = G.cellSize;
  activeCanvas.width  = cs * COLS;
  activeCanvas.height = cs * ROWS;
  // Hide the other canvas
  desktopCanvas.style.display = activeCanvas === desktopCanvas ? 'block' : 'none';
  mobileCanvas.style.display  = activeCanvas === mobileCanvas  ? 'block' : 'none';
}

function calcCellSize() {
  if (isMobile()) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Deduct HUD areas (top ~54+7=61px, bottom ~58px)
    const availH = vh - 61 - 58 - 8;
    const availW = vw - 8;
    return Math.floor(Math.min(availW/COLS, availH/ROWS, 76));
  } else {
    const sideW = 220 + 200; // left + right sidebar
    const availW = window.innerWidth - sideW - 24;
    const availH = window.innerHeight - 20;
    return Math.floor(Math.min(availW/COLS, availH/ROWS, 86));
  }
}

function rrect(c2d, x, y, w, h, r) {
  c2d.beginPath();
  c2d.moveTo(x+r,y); c2d.lineTo(x+w-r,y); c2d.arcTo(x+w,y,x+w,y+r,r);
  c2d.lineTo(x+w,y+h-r); c2d.arcTo(x+w,y+h,x+w-r,y+h,r);
  c2d.lineTo(x+r,y+h); c2d.arcTo(x,y+h,x,y+h-r,r);
  c2d.lineTo(x,y+r); c2d.arcTo(x,y,x+r,y,r);
  c2d.closePath();
}

function drawGrid() {
  if (!activeCanvas) return;
  const cvs = activeCanvas;
  const c2d = cvs.getContext('2d');
  const cs  = G.cellSize;
  c2d.clearRect(0,0,cvs.width,cvs.height);

  // Background
  c2d.fillStyle = 'rgba(4,10,2,0.8)';
  c2d.fillRect(0,0,cvs.width,cvs.height);

  // Grid lines
  c2d.strokeStyle = 'rgba(111,207,63,0.08)';
  c2d.lineWidth = 1;
  for(let r=0;r<=ROWS;r++){c2d.beginPath();c2d.moveTo(0,r*cs);c2d.lineTo(cvs.width,r*cs);c2d.stroke();}
  for(let c=0;c<=COLS;c++){c2d.beginPath();c2d.moveTo(c*cs,0);c2d.lineTo(c*cs,cvs.height);c2d.stroke();}

  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) {
    const type = G.grid[r]?.[c];
    if(!type) continue;
    const key  = `${r},${c}`;
    const anim = cellAnims[key] || {};
    const isSel= G.selected?.[0]===r && G.selected?.[1]===c;
    const scale = anim.scale ?? 1;
    const alpha = anim.alpha ?? 1;
    const ddx   = anim.dx ?? 0;
    const ddy   = anim.dy ?? 0;
    const pad   = cs < 60 ? 3 : 5;
    const size  = (cs - pad*2) * scale;
    const cx = c*cs + cs/2 + ddx;
    const cy = r*cs + cs/2 + ddy;

    c2d.save();
    c2d.globalAlpha = alpha;

    // Selected cell highlight
    if (isSel) {
      c2d.fillStyle = 'rgba(111,207,63,0.16)';
      rrect(c2d, c*cs+2, r*cs+2, cs-4, cs-4, 8);
      c2d.fill();
    }

    // Draw nug image
    c2d.translate(cx, cy);
    if (isSel) { c2d.shadowColor='#6fcf3f'; c2d.shadowBlur=20; }
    const imgKey = isSel ? type+'_glow' : type;
    const img = images[imgKey];
    if (img?.complete && img.naturalWidth > 0) {
      c2d.drawImage(img, -size/2, -size/2, size, size);
    } else {
      // Fallback
      c2d.beginPath(); c2d.arc(0,0,size/2,0,Math.PI*2);
      c2d.fillStyle = NUG_COLORS[type]||'#6fcf3f'; c2d.fill();
      c2d.fillStyle='rgba(255,255,255,0.2)'; c2d.font=`${size*0.4}px sans-serif`;
      c2d.textAlign='center'; c2d.textBaseline='middle'; c2d.fillText('🌿',0,0);
    }
    c2d.restore();

    // Selected ring
    if (isSel) {
      c2d.save();
      c2d.strokeStyle='#6fcf3f'; c2d.lineWidth=2.5;
      c2d.shadowColor='#6fcf3f'; c2d.shadowBlur=12;
      rrect(c2d, c*cs+3, r*cs+3, cs-6, cs-6, 8); c2d.stroke();
      c2d.restore();
    }
  }
}

// ─── ANIMATION HELPERS ────────────────────────────────────
function eio(t){ return t<.5?2*t*t:-1+(4-2*t)*t; }
function eob(t){ const c=2.5; return 1+c*Math.pow(t-1,3)+c*Math.pow(t-1,2); }

function animKeys(keys, prop, from, to, dur, ef=eio) {
  return new Promise(resolve => {
    const t0=performance.now();
    const tick = now => {
      const t=Math.min((now-t0)/dur,1), e=ef(t);
      keys.forEach(k=>{ cellAnims[k]=cellAnims[k]||{}; cellAnims[k][prop]=from+(to-from)*e; });
      drawGrid();
      t<1 ? requestAnimationFrame(tick) : resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function animSwap(r1,c1,r2,c2) {
  const cs=G.cellSize, dx=(c2-c1)*cs, dy_=(r2-r1)*cs;
  const k1=`${r1},${c1}`, k2=`${r2},${c2}`;
  await new Promise(resolve => {
    const t0=performance.now(), dur=190;
    const tick = now => {
      const t=Math.min((now-t0)/dur,1), e=eob(t);
      cellAnims[k1]={dx:dx*e, dy:dy_*e};
      cellAnims[k2]={dx:-dx*e, dy:-dy_*e};
      drawGrid();
      t<1 ? requestAnimationFrame(tick) : resolve();
    };
    requestAnimationFrame(tick);
  });
  delete cellAnims[k1]; delete cellAnims[k2];
}

async function animPop(keys) {
  await animKeys(keys, 'scale', 1, 1.38, 130, eob);
  await new Promise(resolve => {
    const t0=performance.now(), dur=160;
    const tick = now => {
      const t=Math.min((now-t0)/dur,1);
      keys.forEach(k=>{cellAnims[k]={scale:1.38*(1-t), alpha:1-t};});
      drawGrid(); t<1?requestAnimationFrame(tick):resolve();
    };
    requestAnimationFrame(tick);
  });
  keys.forEach(k=>delete cellAnims[k]);
}

// ─── VISUAL FX ────────────────────────────────────────────
function canvasRect() { return activeCanvas.getBoundingClientRect(); }

function spawnText(r, c, text, color='#f5c842', size=26) {
  if(!G.opts.effects) return;
  const rect=canvasRect(), cs=G.cellSize;
  const el=document.createElement('div');
  el.className='pop-text';
  el.textContent=text;
  el.style.cssText=`color:${color};font-size:${size}px;left:${rect.left+c*cs+cs/2-30}px;top:${rect.top+r*cs+cs*0.05}px;`;
  activePopLayer.appendChild(el);
  el.addEventListener('animationend',()=>el.remove(),{once:true});
}

function spawnParticles(r,c,color,n=10) {
  if(!G.opts.effects) return;
  const rect=canvasRect(),cs=G.cellSize;
  const px=rect.left+c*cs+cs/2, py=rect.top+r*cs+cs/2;
  for(let i=0;i<n;i++){
    const el=document.createElement('div');
    el.className='particle';
    const ang=(i/n)*Math.PI*2+Math.random()*0.4;
    const dist=22+Math.random()*42, sz=3+Math.random()*7;
    el.style.cssText=`width:${sz}px;height:${sz}px;background:${color};left:${px-sz/2}px;top:${py-sz/2}px;--dx:${Math.cos(ang)*dist}px;--dy:${Math.sin(ang)*dist}px;animation-duration:${0.4+Math.random()*0.35}s;`;
    activePopLayer.appendChild(el);
    el.addEventListener('animationend',()=>el.remove(),{once:true});
  }
}

function spawnSelectFX(r,c) {
  if(!G.opts.effects) return;
  const rect=canvasRect(),cs=G.cellSize;
  const el=document.createElement('div');
  el.className='fx-select';
  el.style.cssText=`left:${rect.left+c*cs+4}px;top:${rect.top+r*cs+4}px;width:${cs-8}px;height:${cs-8}px;`;
  activePopLayer.appendChild(el);
  setTimeout(()=>el.remove(),280);
}

function spawnDeselectFX(r,c) {
  if(!G.opts.effects) return;
  const rect=canvasRect(),cs=G.cellSize;
  const el=document.createElement('div');
  el.className='fx-deselect';
  el.style.cssText=`left:${rect.left+c*cs+4}px;top:${rect.top+r*cs+4}px;width:${cs-8}px;height:${cs-8}px;`;
  activePopLayer.appendChild(el);
  setTimeout(()=>el.remove(),250);
}

function screenFlash(color='rgba(111,207,63,0.2)') {
  if(!G.opts.effects) return;
  const el=document.createElement('div');
  el.className='fx-screen-flash'; el.style.background=color;
  document.body.appendChild(el);
  el.addEventListener('animationend',()=>el.remove(),{once:true});
}

// ═══════════════════════════════════════════════════════════
//  MATCH CASCADE ENGINE
// ═══════════════════════════════════════════════════════════
async function processMatches() {
  while(true) {
    const matched = findMatches(G.grid);
    if(!matched.size) break;
    G.combo++;
    if(G.combo > G.maxCombo) G.maxCombo = G.combo;

    const cells = [...matched];
    const types = cells.map(k=>{ const[r,c]=k.split(',').map(Number); return G.grid[r][c]; });

    await animPop(cells);

    const pts = Math.floor(matched.size * 10 * Math.pow(G.combo, 1.45));
    G.score   += pts;
    G.cleared += matched.size;
    G.totalCleared += matched.size;

    cells.forEach((k,i) => {
      const[r,c]=k.split(',').map(Number);
      spawnParticles(r,c, NUG_COLORS[types[i]]||'#fff', 9);
      G.grid[r][c]=null;
      // Highlight strain in sidebar
      highlightStrain(types[i]);
    });

    SFX.pop(matched.size);
    if(matched.size>=6){ setTimeout(()=>SFX.bigClear(),60); screenFlash('rgba(111,207,63,0.2)'); }
    if(G.combo>=2){ setTimeout(()=>SFX.combo(G.combo),80); vib([30,20,55]); }
    else vib(30);

    // Pop texts
    const mid = cells[Math.floor(cells.length/2)].split(',').map(Number);
    if(G.combo>=2) {
      const label = COMBO_LABELS[Math.min(G.combo-2,COMBO_LABELS.length-1)];
      spawnText(mid[0]-1, mid[1], `${G.combo}x ${label}`, '#f5c842', 22);
      screenFlash('rgba(245,200,66,0.1)');
    }
    spawnText(mid[0], mid[1]+1, `+${pts}`, '#9ee060', 17);

    updateHUD();
    await sleep(110);
    gravity(G.grid);
    await sleep(95);
  }
}

function highlightStrain(type) {
  document.querySelectorAll('.strain-item').forEach(el => {
    if(el.dataset.type===type) {
      el.classList.add('active-match');
      setTimeout(()=>el.classList.remove('active-match'), 600);
    }
  });
}

const sleep = ms => new Promise(r=>setTimeout(r,ms));

// ═══════════════════════════════════════════════════════════
//  HUD UPDATES
// ═══════════════════════════════════════════════════════════
function updateHUD() {
  const sc = G.score.toLocaleString();
  const bst = (highScores[0]?.score || 0).toLocaleString();
  const pct = Math.min(G.cleared/G.goal,1)*100;

  // Desktop HUD
  setEl('d-score', sc, true);
  setEl('d-best',  bst);
  setEl('d-level', G.level);
  setEl('d-moves', G.moves);
  const dp=$('d-progress'); if(dp) dp.style.width=pct+'%';
  setEl('d-progress-label', `${G.cleared} / ${G.goal}`);
  setEl('d-maxcombo', G.maxCombo+'x');
  setEl('d-cleared', G.totalCleared);
  const dc=$('d-combo');
  if(dc){ dc.textContent=G.combo>=2?`${G.combo}x`:''; dc.classList.remove('pop'); void dc.offsetWidth; if(G.combo>=2) dc.classList.add('pop'); }
  // Low puffs warning
  const puffsEl=$('d-moves');
  if(puffsEl) puffsEl.classList.toggle('low', G.moves<=5);

  // Mobile HUD
  setEl('m-score', sc, true);
  setEl('m-best',  bst);
  setEl('m-level', G.level);
  setEl('m-moves', G.moves);
  const mp=$('m-progress'); if(mp) mp.style.width=pct+'%';
  setEl('m-progress-label', `${G.cleared} / ${G.goal}`);
  const mc=$('m-combo');
  if(mc){ mc.textContent=G.combo>=2?`${G.combo}x`:''; mc.classList.remove('pop'); void mc.offsetWidth; if(G.combo>=2) mc.classList.add('pop'); }
  // Mobile low puffs
  const mPuffsWrap=document.querySelector('.mfhud-puffs');
  if(mPuffsWrap) mPuffsWrap.classList.toggle('low', G.moves<=5);
  if(G.moves===5) SFX.lowPuffs();
}

function setEl(id, val, bump=false) {
  const el=$(id); if(!el) return;
  el.textContent = val;
  if(bump){ el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

function updateNextDisplay() {
  ['d-next','m-next'].forEach(id => {
    const el=$(id); if(!el) return;
    el.innerHTML='';
    G.nextNugs.slice(0,3).forEach(type=>{
      const img=document.createElement('img');
      img.src=`sprites/${type}.png`; img.alt=type;
      img.onerror=()=>img.style.display='none';
      el.appendChild(img);
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  GAME FLOW
// ═══════════════════════════════════════════════════════════
function newGame() {
  G.grid=createGrid(); G.score=0; G.level=1; G.moves=30;
  G.goal=LEVEL_GOALS[0]; G.cleared=0; G.totalCleared=0;
  G.combo=0; G.maxCombo=0; G.running=true;
  G.selected=null; G.animating=false;
  cellAnims={};
  G.nextNugs=Array.from({length:9},()=>randNug());
  G.cellSize=calcCellSize();
  setActiveCanvas();
  resizeCanvas();
  updateHUD(); updateNextDisplay(); drawGrid();
  showScreen('game');
  SFX.newGame(); vib([20,10,40,10,70]);
}

async function doSwap(r1,c1,r2,c2) {
  if(G.animating||!G.running) return;
  G.animating=true; G.combo=0;
  spawnDeselectFX(r1,c1); G.selected=null;

  swapCells(G.grid,r1,c1,r2,c2);
  SFX.swap(); vib(15);
  await animSwap(r1,c1,r2,c2);

  if(!findMatches(G.grid).size) {
    swapCells(G.grid,r1,c1,r2,c2);
    SFX.invalid(); vib([20,20,20]);
    await animSwap(r1,c1,r2,c2);
    drawGrid(); G.animating=false; return;
  }

  G.moves--;
  await processMatches();
  drawGrid();

  if(G.cleared>=G.goal) { await doLevelUp(); }
  else if(G.moves<=0)   { doGameOver(); }
  else if(!hasMove(G.grid)) {
    spawnText(4,2,'🔀 SHUFFLE!','#5ecfc8',22);
    SFX.shuffle(); await sleep(650);
    G.grid=createGrid(); drawGrid();
  }

  saveGame(); G.animating=false;
  G.nextNugs.shift(); G.nextNugs.push(randNug());
  updateNextDisplay();
}

async function doLevelUp() {
  SFX.levelUp(); vib([50,30,100,30,160]);
  screenFlash('rgba(245,200,66,0.3)');
  G.level++; G.cleared=0;
  G.goal  = LEVEL_GOALS[Math.min(G.level-1,LEVEL_GOALS.length-1)];
  G.moves = Math.min(G.moves+12, 48);
  $('luLevel').textContent = G.level;
  $('luMsg').textContent   = LEVEL_MSGS[Math.min(G.level-2,LEVEL_MSGS.length-1)];
  $('luStars').textContent = G.level>=8?'🌟🌟🌟':G.level>=5?'⭐🌟⭐':'⭐⭐⭐';
  showScreen('levelup');
  await new Promise(res=>{ $('btnContinue').onclick=()=>{ showScreen('game'); resizeCanvas(); drawGrid(); res(); }; });
}

function doGameOver() {
  G.running=false;
  SFX.gameOver(); vib([30,20,30,20,100]);
  addHighScore(G.score,G.level);
  $('goScore').textContent  = G.score.toLocaleString();
  $('goLevel').textContent  = G.level;
  $('goCombo').textContent  = G.maxCombo+'x';
  $('goCleared').textContent= G.totalCleared;
  const isNew = G.score>0 && highScores[0]?.score===G.score;
  const nb=$('goNewBest'); if(nb) nb.style.display=isNew?'block':'none';
  if(isNew){ SFX.levelUp(); screenFlash('rgba(245,200,66,0.45)'); }
  showScreen('gameover');
}

// ─── SAVE/LOAD ────────────────────────────────────────────
function saveGame() {
  savedGame=JSON.parse(JSON.stringify(G));
  try{localStorage.setItem('nugz3_save',JSON.stringify(savedGame));}catch(e){}
}
function loadSave() {
  try{const s=localStorage.getItem('nugz3_save');if(s)savedGame=JSON.parse(s);}catch(e){}
  return savedGame;
}
function loadScores(){try{highScores=JSON.parse(localStorage.getItem('nugz3_scores')||'[]');}catch(e){highScores=[];}}
function saveScores(){try{localStorage.setItem('nugz3_scores',JSON.stringify(highScores));}catch(e){}}
function addHighScore(score,level){highScores.push({score,level});highScores.sort((a,b)=>b.score-a.score);highScores=highScores.slice(0,10);saveScores();}
function renderScores() {
  const medals=['🥇','🥈','🥉'];
  $('scoresList').innerHTML=!highScores.length
    ?'<div style="text-align:center;color:rgba(255,255,255,0.3);padding:28px 0">No scores yet!<br>Play a game first 🌿</div>'
    :highScores.map((s,i)=>`<div class="score-entry"><span class="score-rank">${medals[i]||'#'+(i+1)}</span><span class="score-val">${s.score.toLocaleString()}</span><span class="score-lvl">LVL ${s.level}</span></div>`).join('');
}

// ═══════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════
function cellAt(clientX,clientY) {
  const rect=canvasRect(),cs=G.cellSize;
  const c=Math.floor((clientX-rect.left)/cs), r=Math.floor((clientY-rect.top)/cs);
  return (r>=0&&r<ROWS&&c>=0&&c<COLS)?[r,c]:null;
}

function tapCell(r,c) {
  if(G.animating||!G.running) return;
  if(!G.selected) {
    G.selected=[r,c]; SFX.select(); spawnSelectFX(r,c); vib(14); drawGrid();
  } else {
    const[sr,sc]=G.selected;
    if(sr===r&&sc===c){ spawnDeselectFX(r,c); G.selected=null; SFX.deselect(); drawGrid(); }
    else if(isAdj(sr,sc,r,c)){ doSwap(sr,sc,r,c); }
    else { spawnDeselectFX(sr,sc); spawnSelectFX(r,c); G.selected=[r,c]; SFX.select(); vib(12); drawGrid(); }
  }
}

let touchOrig=null;
function setupCanvasInput(cvs) {
  cvs.addEventListener('touchstart',e=>{
    e.preventDefault(); resumeAC();
    const t=e.touches[0]; touchOrig={x:t.clientX,y:t.clientY};
    const pos=cellAt(t.clientX,t.clientY); if(pos) tapCell(...pos);
  },{passive:false});
  cvs.addEventListener('touchend',e=>{
    e.preventDefault();
    if(!touchOrig||!G.selected||G.animating){touchOrig=null;return;}
    const t=e.changedTouches[0];
    const dx=t.clientX-touchOrig.x, dy=t.clientY-touchOrig.y;
    if(Math.sqrt(dx*dx+dy*dy)>24) {
      const[sr,sc]=G.selected;
      let tr=sr,tc=sc;
      if(Math.abs(dx)>Math.abs(dy)) tc+=dx>0?1:-1; else tr+=dy>0?1:-1;
      if(tr>=0&&tr<ROWS&&tc>=0&&tc<COLS) doSwap(sr,sc,tr,tc);
    }
    touchOrig=null;
  },{passive:false});
  cvs.addEventListener('mousedown',e=>{
    resumeAC();
    const pos=cellAt(e.clientX,e.clientY); if(pos) tapCell(...pos);
  });
}
setupCanvasInput(desktopCanvas);
setupCanvasInput(mobileCanvas);

// Keyboard
document.addEventListener('keydown',e=>{
  if(!G.selected||G.animating||!G.running) return;
  const[sr,sc]=G.selected;
  const dirs={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
  if(dirs[e.key]){e.preventDefault();const[dr,dc]=dirs[e.key];const tr=sr+dr,tc=sc+dc;if(tr>=0&&tr<ROWS&&tc>=0&&tc<COLS)doSwap(sr,sc,tr,tc);}
  if(e.key==='Escape'){spawnDeselectFX(sr,sc);G.selected=null;SFX.deselect();drawGrid();}
});

// ═══════════════════════════════════════════════════════════
//  MENU NUGS
// ═══════════════════════════════════════════════════════════
function initMenuNugs() {
  // Desktop showcase
  const showcase=$('nugShowcase');
  if(showcase) {
    showcase.innerHTML='';
    NUG_TYPES.forEach((type,i)=>{
      const wrap=document.createElement('div'); wrap.className='nug-item';
      const img=document.createElement('img'); img.src=`sprites/${type}.png`; img.alt=type;
      img.style.setProperty('--dur',(3.2+i*0.4)+'s');
      img.style.setProperty('--del',(i*0.5)+'s');
      img.onerror=()=>img.style.display='none';
      const lbl=document.createElement('div'); lbl.className='nug-label'; lbl.textContent=NUG_STRAINS[i];
      wrap.appendChild(img); wrap.appendChild(lbl);
      showcase.appendChild(wrap);
    });
  }
  // Mobile row
  const mrow=$('mobileNugsRow');
  if(mrow) {
    mrow.innerHTML='';
    NUG_TYPES.forEach((type,i)=>{
      const img=document.createElement('img'); img.src=`sprites/${type}.png`; img.alt=type;
      img.style.setProperty('--dur',(3+i*0.5)+'s');
      img.style.setProperty('--del',(i*0.45)+'s');
      img.onerror=()=>img.style.display='none';
      mrow.appendChild(img);
    });
  }
}

// Sparkle timer for mobile nugs
setInterval(()=>{
  const imgs=document.querySelectorAll('#mobileNugsRow img');
  if(!imgs.length) return;
  const img=imgs[Math.floor(Math.random()*imgs.length)];
  img.classList.add('sparkle');
  setTimeout(()=>img.classList.remove('sparkle'),380);
},750);

// ═══════════════════════════════════════════════════════════
//  BUTTON WIRING  (wire to all matching IDs)
// ═══════════════════════════════════════════════════════════
function on(ids, fn) {
  (Array.isArray(ids)?ids:[ids]).forEach(id=>{ const el=$(id); if(el) el.addEventListener('click',fn); });
}

on(['btnNewGame-d','btnNewGame-m'],()=>{ resumeAC(); newGame(); });

on(['btnResume-d','btnResume-m'],()=>{
  resumeAC();
  const save=loadSave();
  if(save?.grid&&save.running!==false) {
    Object.assign(G,save); G.running=true; G.animating=false; cellAnims={};
    G.cellSize=calcCellSize(); setActiveCanvas(); resizeCanvas();
    updateHUD(); updateNextDisplay(); drawGrid(); showScreen('game'); SFX.select();
  } else {
    ['btnResume-d','btnResume-m'].forEach(id=>{
      const b=$(id); if(!b) return;
      const orig=b.textContent; b.textContent='❌ NO SAVE'; b.style.opacity='0.5';
      SFX.invalid();
      setTimeout(()=>{b.textContent=orig;b.style.opacity='';},2000);
    });
  }
});

on(['btnHighScore-d','btnHighScore-m'],()=>{ renderScores(); showScreen('scores'); SFX.select(); });
on('btnScoresBack',()=>{ showScreen('menu'); SFX.deselect(); });

on(['btnOptions-d','btnOptions-m'],()=>{ syncOpts(); showScreen('options'); SFX.select(); });
on('btnOptBack',()=>{
  G.opts.sound   =$('optSound').checked;
  G.opts.music   =$('optMusic').checked;
  G.opts.vibrate =$('optVibrate').checked;
  G.opts.effects =$('optEffects').checked;
  G.opts.musicVol=parseInt($('optMusicVol').value)/100;
  if(bgMusic) bgMusic.volume=G.opts.musicVol;
  toggleMusic(G.opts.music);
  showScreen('menu'); SFX.deselect();
});
$('optMusic')?.addEventListener('change',e=>{ resumeAC(); toggleMusic(e.target.checked); });
$('optMusicVol')?.addEventListener('input',e=>{ G.opts.musicVol=parseInt(e.target.value)/100; if(bgMusic)bgMusic.volume=G.opts.musicVol; });

on(['btnQuit-d','btnQuit-m'],()=>{ resumeAC(); if(confirm('Quit NUGZ? 🌿')){saveGame();window.close();} });
on(['btnPause-d','btnPause-m2'],()=>{ G.running=false; showScreen('pause'); });
on('btnResumePause',()=>{ G.running=true; showScreen('game'); SFX.select(); });
on('btnRestartPause',()=>{ if(confirm('Start a new game?')) newGame(); });
on('btnMenuPause',()=>{ saveGame(); showScreen('menu'); });
on('btnPlayAgain',()=>{ resumeAC(); newGame(); });
on('btnGoMenu',()=>{ showScreen('menu'); });

// ─── RESIZE ───────────────────────────────────────────────
window.addEventListener('resize',()=>{
  if($('screen-game')?.classList.contains('active')) {
    G.cellSize=calcCellSize(); setActiveCanvas(); resizeCanvas(); drawGrid();
  }
});

function syncOpts() {
  const s=(id,v)=>{const e=$(id);if(e)e.checked=v;};
  s('optSound',G.opts.sound); s('optMusic',G.opts.music);
  s('optVibrate',G.opts.vibrate); s('optEffects',G.opts.effects);
  const mv=$('optMusicVol'); if(mv) mv.value=Math.round(G.opts.musicVol*100);
}

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
async function boot() {
  loadScores(); loadSave(); syncOpts();
  document.body.className='on-menu';
  showScreen('menu');
  await loadImages();
  initMenuNugs();
  if(!savedGame){ ['btnResume-d','btnResume-m'].forEach(id=>{const b=$(id);if(b)b.style.opacity='0.42';}); }
  // Unlock audio on first touch
  const unlock=()=>{ resumeAC(); if(G.opts.music)toggleMusic(true); };
  document.addEventListener('click',unlock,{once:true});
  document.addEventListener('touchstart',unlock,{once:true});
}

boot();

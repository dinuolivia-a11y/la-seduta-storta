(() => {
'use strict';

/* ================= utilità ================= */
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();
const pick = a => a[Math.floor(Math.random() * a.length)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const camel = s => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

const el = {};
$$('[id]').forEach(n => { el[camel(n.id)] = n; });

const LEVELS = ['soft', 'ironico', 'piccante'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '0123456789'.split('');
const WORDS = ['SÌ', 'NO', 'Addio'];
const PAUSE = reduceMotion ? 700 : 2300;

/* ================= stato ================= */
const G = {
  names: [], level: 'ironico', length: 12, sound: true,
  players: [], spirit: -1, word: '', lit: new Set(), marked: new Set(),
  q: 0, mediumStart: 0, medium: 0, deck: null, current: null, currentText: '', changed: false,
  answer: [], log: [], over: true, active: false, lastSpirit: '', lastWord: '',
  passIdx: 0, peekFrom: '', lastLvl: 0, finalVote: false, goodbye: false, timers: []
};
let screen = 'home';

/* ================= preferenze ================= */
const STORE = 'seduta-storta-v1';
function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s.names)) G.names = s.names.filter(n => typeof n === 'string' && n.trim()).slice(0, 8);
    if (LEVELS.indexOf(s.level) >= 0) G.level = s.level;
    if ([8, 12, 16].indexOf(s.length) >= 0) G.length = s.length;
    if (typeof s.sound === 'boolean') G.sound = s.sound;
  } catch (e) { /* niente preferenze salvate */ }
}
function savePrefs() {
  try { localStorage.setItem(STORE, JSON.stringify({ names: G.names, level: G.level, length: G.length, sound: G.sound })); } catch (e) {}
}

/* ================= suoni della seduta ================= */
const Snd = {
  ctx: null, out: null, noise: null, amb: null, nextWhisper: 0,
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.out = this.ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 2), b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = b;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio non disponibile */ }
  },
  can() { return !!(this.ctx && G.sound); },
  ambientOn() {
    if (!this.can() || this.amb) return;
    try {
      const c = this.ctx, t = c.currentTime;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 4;
      const g = c.createGain(); g.gain.value = 0;
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.7;
      const o3 = c.createOscillator(); o3.type = 'sine'; o3.frequency.value = 77.8;
      const g3 = c.createGain(); g3.gain.value = 0.4;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
      const lg = c.createGain(); lg.gain.value = 90;
      lfo.connect(lg); lg.connect(f.frequency);
      o1.connect(f); o2.connect(f); o3.connect(g3); g3.connect(f); f.connect(g); g.connect(this.out);
      const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 0.6;
      const ng = c.createGain(); ng.gain.value = 0;
      n.connect(nf); nf.connect(ng); ng.connect(this.out);
      [o1, o2, o3, lfo, n].forEach(o => o.start(t));
      g.gain.setTargetAtTime(0.05, t, 1.5); ng.gain.setTargetAtTime(0.02, t, 2);
      this.amb = { nodes: [o1, o2, o3, lfo, n], f: f, g: g, ng: ng, nf: nf };
      this.nextWhisper = now() + 6000;
    } catch (e) { this.amb = null; }
  },
  presence(p) {
    if (!this.amb) return;
    try {
      const t = this.ctx.currentTime;
      this.amb.f.frequency.setTargetAtTime(260 + 700 * p, t, 1);
      this.amb.g.gain.setTargetAtTime(0.05 + 0.07 * p, t, 1);
      this.amb.ng.gain.setTargetAtTime(0.02 + 0.05 * p, t, 1);
      this.amb.nf.frequency.setTargetAtTime(500 + 900 * p, t, 1);
    } catch (e) {}
  },
  ambientOff() {
    if (!this.amb) return;
    const a = this.amb; this.amb = null;
    try {
      const t = this.ctx.currentTime;
      a.g.gain.setTargetAtTime(0, t, 0.4); a.ng.gain.setTargetAtTime(0, t, 0.4);
      setTimeout(() => a.nodes.forEach(o => { try { o.stop(); } catch (e) {} }), 2500);
    } catch (e) {}
  },
  whisper() {
    if (!this.can()) return;
    try {
      const c = this.ctx, t = c.currentTime + 0.02, dur = 0.9 + Math.random() * 0.8;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 1400; f.Q.value = 5;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const trem = c.createOscillator(), tg = c.createGain(); trem.frequency.value = 7 + Math.random() * 9; tg.gain.value = 0.04;
      trem.connect(tg); tg.connect(g.gain);
      s.connect(f); f.connect(g);
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; g.connect(p); p.connect(this.out); }
      else g.connect(this.out);
      s.start(t, Math.random()); s.stop(t + dur + 0.05); trem.start(t); trem.stop(t + dur + 0.05);
    } catch (e) {}
  },
  knock() {
    if (!this.can()) return;
    try {
      const c = this.ctx, t = c.currentTime + 0.005;
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random()); s.stop(t + 0.08);
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
      og.gain.setValueAtTime(0.4, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(og); og.connect(this.out); o.start(t); o.stop(t + 0.12);
    } catch (e) {}
  },
  bell(low) {
    if (!this.can()) return;
    try {
      const c = this.ctx, t = c.currentTime + 0.01, base = low ? 98 : 196;
      [[1, 0.22], [2.76, 0.09], [5.4, 0.05], [8.9, 0.025]].forEach(pr => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = base * pr[0];
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pr[1], t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (low ? 4 : 3) / pr[0] + 0.4);
        o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 4.6);
      });
    } catch (e) {}
  },
  spiritWins() {
    if (!this.can()) return;
    try {
      const c = this.ctx, t = c.currentTime + 0.01;
      [55, 58.3, 77.8, 110.4].forEach((fr, i) => {
        const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(fr, t); o.frequency.exponentialRampToValueAtTime(fr * 1.5, t + 3);
        f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(2400, t + 2.5);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 1.6 + i * 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
        o.connect(f); f.connect(g); g.connect(this.out); o.start(t); o.stop(t + 4.1);
      });
    } catch (e) {}
  },
  livingWin() {
    if (!this.can()) return;
    try {
      const c = this.ctx, t0 = c.currentTime + 0.01;
      [392, 493.9, 587.3, 784].forEach((fr, i) => {
        const o = c.createOscillator(), g = c.createGain(), t = t0 + i * 0.16;
        o.type = 'triangle'; o.frequency.value = fr;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 1.7);
      });
    } catch (e) {}
  }
};

/* ================= la candela ================= */
const Presence = { p: 0.08 };
class Candle {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.p = Presence.p; this.gutter = 0; this.w = 2; this.h = 2; this.dpr = 1; this.seed = Math.random() * 100;
    this.resize();
  }
  resize() {
    const r = this.c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    this.w = w; this.h = h; this.dpr = dpr;
  }
  snuff() { this.gutter = 1; }
  draw(tms, dt) {
    const g = this.g, W = this.w, H = this.h;
    g.clearRect(0, 0, W, H);
    if (W < 16 || H < 16) return;
    this.p += (Presence.p - this.p) * (1 - Math.exp(-dt / 0.9));
    this.gutter = Math.max(0, this.gutter - dt * 0.5);
    const p = this.p, t = tms / 1000 + this.seed;
    const u = Math.min(W * 0.95, H);
    const cx = W / 2, bottom = H - u * 0.02;
    const bw = u * 0.2, bh = u * 0.4, top = bottom - bh;
    const wickH = u * 0.045, baseY = top - wickH * 0.55;
    const amp = 0.04 + 0.2 * p * p;
    const n = 0.5 * Math.sin(t * 7.1) + 0.3 * Math.sin(t * 13.7 + 1.3) + 0.2 * Math.sin(t * 23.3 + 0.4);
    const k = (1 + amp * n) * (1 - 0.72 * this.gutter);
    const fh = u * 0.3 * k, fw = fh * 0.34;
    const sway = (0.04 + 0.28 * p) * Math.sin(t * 2.3 + Math.sin(t * 0.7) * 2) + (reduceMotion ? 0 : (Math.random() - 0.5) * 0.04 * p);
    const hue = 36 + 172 * smooth(0.45, 0.98, p);
    const light = 1 - 0.55 * this.gutter;

    // alone
    const gy = baseY - fh * 0.45;
    const gr = Math.max(4, Math.min(u * (0.75 + 0.1 * n * amp), cx, gy, H - gy) * 0.98);
    const halo = g.createRadialGradient(cx, gy, 0, cx, gy, gr);
    halo.addColorStop(0, 'hsla(' + hue.toFixed(0) + ',100%,68%,' + (0.42 * light).toFixed(3) + ')');
    halo.addColorStop(0.35, 'hsla(' + hue.toFixed(0) + ',100%,58%,' + (0.12 * light).toFixed(3) + ')');
    halo.addColorStop(1, 'hsla(' + hue.toFixed(0) + ',100%,50%,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(cx, gy, gr, 0, Math.PI * 2); g.fill();

    // cera
    const body = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    body.addColorStop(0, '#D8C6A2'); body.addColorStop(0.35, '#FFF6E1'); body.addColorStop(0.7, '#F0E1C2'); body.addColorStop(1, '#BFA880');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(cx - bw / 2, top); g.lineTo(cx - bw / 2, bottom); g.lineTo(cx + bw / 2, bottom); g.lineTo(cx + bw / 2, top);
    g.closePath(); g.fill();
    // colature
    g.beginPath();
    g.moveTo(cx - bw * 0.5, top); g.quadraticCurveTo(cx - bw * 0.52, top + bh * 0.22, cx - bw * 0.42, top + bh * 0.26);
    g.quadraticCurveTo(cx - bw * 0.34, top + bh * 0.2, cx - bw * 0.3, top); g.closePath();
    g.moveTo(cx + bw * 0.18, top); g.quadraticCurveTo(cx + bw * 0.2, top + bh * 0.12, cx + bw * 0.28, top + bh * 0.14);
    g.quadraticCurveTo(cx + bw * 0.36, top + bh * 0.1, cx + bw * 0.38, top); g.closePath();
    g.fillStyle = '#FFF3D9'; g.fill();
    // bordo superiore illuminato
    g.beginPath(); g.ellipse(cx, top, bw / 2, bw * 0.12, 0, 0, Math.PI * 2);
    g.fillStyle = 'hsla(' + hue.toFixed(0) + ',90%,85%,' + (0.9 * light).toFixed(2) + ')'; g.fill();
    // stoppino
    g.beginPath(); g.moveTo(cx, top); g.quadraticCurveTo(cx + u * 0.006, top - wickH * 0.6, cx + sway * u * 0.01, top - wickH);
    g.lineWidth = Math.max(1, u * 0.012); g.strokeStyle = '#2B1A1A'; g.stroke();

    // fiamma
    const tipX = cx + sway * fh * 0.35;
    const path = (w, h, y) => {
      g.beginPath();
      g.moveTo(tipX, y - h);
      g.bezierCurveTo(cx + w * 0.95 + sway * h * 0.12, y - h * 0.55, cx + w, y - w * 0.1, cx, y + w * 0.38);
      g.bezierCurveTo(cx - w, y - w * 0.1, cx - w * 0.95 + sway * h * 0.12, y - h * 0.55, tipX, y - h);
      g.closePath();
    };
    const fl = g.createLinearGradient(0, baseY + fw * 0.4, 0, baseY - fh);
    fl.addColorStop(0, 'hsla(215,95%,55%,' + (0.9 * light).toFixed(2) + ')');
    fl.addColorStop(0.22, 'hsla(' + hue.toFixed(0) + ',100%,58%,' + (0.95 * light).toFixed(2) + ')');
    fl.addColorStop(0.7, 'hsla(' + (hue + 8).toFixed(0) + ',100%,72%,' + (0.9 * light).toFixed(2) + ')');
    fl.addColorStop(1, 'hsla(' + hue.toFixed(0) + ',100%,85%,0.15)');
    path(fw, fh, baseY); g.fillStyle = fl; g.fill();
    path(fw * 0.45, fh * 0.55, baseY - fh * 0.02);
    g.fillStyle = p > 0.8 ? 'rgba(225,240,255,' + (0.85 * light).toFixed(2) + ')' : 'rgba(255,252,235,' + (0.9 * light).toFixed(2) + ')';
    g.fill();
  }
}

/* ================= interfaccia ================= */
let lastSwap = 0, lastPD = 0;
const C = {};
function show(name) {
  screen = name; lastSwap = now();
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + name));
  const s = document.getElementById('s-' + name); if (s) s.scrollTop = 0;
  requestAnimationFrame(resizeAll);
}
function resizeAll() { Object.keys(C).forEach(k => C[k].resize()); }
let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg; el.toast.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('on'), 3200);
}
function later(fn, ms) { const id = setTimeout(fn, ms); G.timers.push(id); return id; }
function clearTimers() { G.timers.forEach(clearTimeout); G.timers = []; }
function renderText(node, tpl, map) {
  node.textContent = '';
  const re = /\{([A-Z])\}/g; let last = 0, m;
  while ((m = re.exec(tpl))) {
    if (m.index > last) node.appendChild(document.createTextNode(tpl.slice(last, m.index)));
    const b = document.createElement('strong'); b.textContent = map[m[1]] || 'qualcuno'; node.appendChild(b);
    last = re.lastIndex;
  }
  if (last < tpl.length) node.appendChild(document.createTextNode(tpl.slice(last)));
}
function blurActive() { try { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); } catch (e) {} }

/* ================= mazzo delle domande ================= */
function mkDeck(arr) { return { arr: arr, order: shuffle(arr.map((_, i) => i)), i: 0 }; }
function drawFrom(deck) {
  if (deck.i >= deck.order.length) { deck.order = shuffle(deck.arr.map((_, i) => i)); deck.i = 0; }
  return deck.arr[deck.order[deck.i++]];
}

/* ================= preparazione ================= */
const radioSyncs = [], switchSyncs = [];
function renderPlayers() {
  el.plist.textContent = '';
  G.names.forEach((n, i) => {
    const li = document.createElement('li'), sp = document.createElement('span'), x = document.createElement('button');
    sp.textContent = n; x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Rimuovi ' + n);
    x.addEventListener('click', () => { G.names.splice(i, 1); renderPlayers(); savePrefs(); });
    li.appendChild(sp); li.appendChild(x); el.plist.appendChild(li);
  });
  const n = G.names.length;
  el.pnote.textContent = n < 4 ? 'Servono almeno 4 persone' + (n ? ': ne mancano ' + (4 - n) + '.' : '.') : n >= 8 ? 'Siete in 8: il massimo.' : n + ' persone al tavolo. Si arriva fino a 8.';
  el.startBtn.disabled = n < 4;
  el.addBtn.disabled = n >= 8;
}
function addName() {
  const v = el.nameIn.value.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!v) { el.nameIn.focus(); return; }
  if (G.names.length >= 8) return;
  if (G.names.some(n => n.toLowerCase() === v.toLowerCase())) { toast('Questo nome c’è già.'); return; }
  G.names.push(v); el.nameIn.value = ''; renderPlayers(); savePrefs(); el.nameIn.focus();
}
function bindRadio(group, key, parse) {
  const btns = $$('[role="radio"]', group);
  const sync = () => btns.forEach(b => { const on = String(G[key]) === b.dataset.val; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
  btns.forEach((b, i) => {
    b.addEventListener('click', () => { G[key] = parse ? parse(b.dataset.val) : b.dataset.val; radioSyncs.forEach(f => f()); savePrefs(); });
    b.addEventListener('keydown', e => {
      const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
      if (!dir) return;
      e.preventDefault(); const nb = btns[(i + dir + btns.length) % btns.length]; nb.click(); nb.focus();
    });
  });
  radioSyncs.push(sync); sync();
}
function bindSwitches() {
  $$('.switch').forEach(sw => {
    const key = sw.dataset.key;
    const sync = () => sw.setAttribute('aria-checked', G[key] ? 'true' : 'false');
    sw.addEventListener('click', () => { G[key] = !G[key]; sync(); savePrefs(); if (!G[key]) Snd.ambientOff(); });
    switchSyncs.push(sync); sync();
  });
}

/* ================= le lettere sul tavolo ================= */
function renderBoardHelp() {
  const tiles = LETTERS.concat(DIGITS, ['Sì', 'No', 'Addio', 'Inizio']);
  el.tileList.textContent = '';
  tiles.forEach(t => { const s = document.createElement('span'); s.textContent = t; el.tileList.appendChild(s); });
  const ns = 'http://www.w3.org/2000/svg', svg = el.boardSvg;
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k]));
    if (text != null) n.textContent = text;
    svg.appendChild(n); return n;
  };
  svg.textContent = '';
  const cx = 160, cy = 160, R = 132;
  add('circle', { cx: cx, cy: cy, r: R + 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1, opacity: 0.35 });
  LETTERS.forEach((L, i) => {
    const a = -Math.PI / 2 + (i + 0.5) * (Math.PI * 2 / LETTERS.length);
    add('text', { x: (cx + Math.cos(a) * (R - 12)).toFixed(1), y: (cy + Math.sin(a) * (R - 12) + 6).toFixed(1), 'text-anchor': 'middle', 'font-size': 17, 'font-family': 'IM Fell English, Georgia, serif', fill: 'currentColor' }, L);
  });
  add('text', { x: 128, y: 92, 'text-anchor': 'middle', 'font-size': 18, 'font-family': 'IM Fell English, Georgia, serif', fill: 'currentColor' }, 'Sì');
  add('text', { x: 192, y: 92, 'text-anchor': 'middle', 'font-size': 18, 'font-family': 'IM Fell English, Georgia, serif', fill: 'currentColor' }, 'No');
  add('circle', { cx: cx, cy: cy, r: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 });
  add('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'IM Fell English, Georgia, serif', fill: 'currentColor' }, 'Inizio');
  add('text', { x: cx, y: 222, 'text-anchor': 'middle', 'font-size': 15, 'letter-spacing': 3, 'font-family': 'IM Fell English, Georgia, serif', fill: 'currentColor' }, '0123456789');
  add('text', { x: cx, y: 244, 'text-anchor': 'middle', 'font-size': 14, 'font-family': 'IM Fell English, Georgia, serif', fill: 'currentColor' }, 'Addio');
  if (isWeb()) {
    el.pdfLine.textContent = '';
    el.pdfLine.appendChild(document.createTextNode('Potete stampare le tessere già pronte, dal file '));
    const a = document.createElement('a'); a.href = 'bicchierino-lettere.pdf'; a.textContent = 'Lettere da stampare (PDF)'; a.style.color = 'inherit';
    el.pdfLine.appendChild(a);
    el.pdfLine.appendChild(document.createTextNode(', oppure scriverle a mano su foglietti o su post-it. Servono queste:'));
  }
}
function isWeb() { return (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') && window.self === window.top; }

/* ================= ruoli segreti ================= */
function newSeance() {
  clearTimers();
  const n = G.names.length;
  G.players = G.names.map(nm => ({ name: nm, out: false }));
  let s = Math.floor(Math.random() * n);
  if (G.players[s].name === G.lastSpirit && Math.random() < 0.8) s = (s + 1 + Math.floor(Math.random() * (n - 1))) % n;
  G.spirit = s; G.lastSpirit = G.players[s].name;
  const words = PAROLE[G.level].filter(w => w !== G.lastWord);
  G.word = pick(words); G.lastWord = G.word;
  G.lit = new Set(); G.marked = new Set(); G.log = []; G.q = 0; G.over = false; G.active = true; G.lastLvl = 0; G.finalVote = false; G.goodbye = false;
  G.mediumStart = Math.floor(Math.random() * n);
  G.deck = mkDeck(DOMANDE[G.level]);
  Presence.p = 0.08;
  keepAwake();
  showPass(0);
}
function showPass(i) {
  G.passIdx = i;
  el.passIntro.textContent = 'Passate il telefono a';
  el.passName.hidden = false; el.passName.textContent = G.players[i].name;
  el.passHint.textContent = i === 0 ? 'Solo tu devi guardare lo schermo. Gli altri guardino altrove.' : 'Solo tu devi guardare lo schermo.';
  el.passShow.hidden = false; el.passPick.hidden = true; el.passBack.hidden = true;
  el.passShow.disabled = true; later(() => { el.passShow.disabled = false; }, 600);
  show('pass');
}
function showPeek(from) {
  G.peekFrom = from;
  el.passIntro.textContent = 'Chi vuole rivedere il proprio ruolo?';
  el.passName.hidden = true;
  el.passHint.textContent = 'Gli altri guardino altrove.';
  el.passShow.hidden = true; el.passPick.hidden = false; el.passBack.hidden = false;
  el.passPick.textContent = '';
  G.players.forEach((p, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn wide'; b.textContent = p.name;
    b.addEventListener('click', () => showRole(i, true)); el.passPick.appendChild(b);
  });
  show('pass');
}
function uniqueLetters(word) {
  const out = [];
  for (let i = 0; i < word.length; i++) if (out.indexOf(word[i]) < 0) out.push(word[i]);
  return out;
}
function showRole(i, peek) {
  const spirit = i === G.spirit;
  el.roleTitle.textContent = spirit ? 'Sei lo Spirito' : 'Sei tra i vivi';
  el.roleWord.textContent = '';
  const sm = document.createElement('small'), st = document.createElement('strong');
  sm.textContent = spirit ? 'La tua parola maledetta' : 'Nessuna parola maledetta';
  st.textContent = spirit ? G.word : '—';
  el.roleWord.appendChild(sm); el.roleWord.appendChild(st);
  if (spirit) {
    const row = document.createElement('div'); row.className = 'need';
    const miss = [], gifts = [];
    uniqueLetters(G.word).forEach(ch => {
      const s = document.createElement('span'); s.textContent = ch;
      if (G.marked.has(ch)) s.className = 'got';
      else if (G.lit.has(ch)) { s.className = 'gift'; gifts.push(ch); }
      else { s.className = 'miss'; miss.push(ch); }
      row.appendChild(s);
    });
    el.roleWord.appendChild(row);
    const note = document.createElement('p'); note.className = 'role-left';
    if (!miss.length) note.textContent = 'Non ti manca niente.' + (gifts.length ? ' In blu, quelle regalate.' : '');
    else {
      let t = 'Ti manca ancora: ' + miss.join(', ') + '. Ogni lettera diversa, una volta sola.';
      if (gifts.length) t += ' In blu, regalate: ' + gifts.join(', ') + '.';
      note.textContent = t;
    }
    el.roleWord.appendChild(note);
  }
  el.roleText.textContent = spirit
    ? 'Porta il bicchiere sulle lettere ancora in evidenza, in qualsiasi ordine. Le doppie non si ripetono. Spingi con astuzia: se ti scoprono, hai perso.'
    : 'Scopri chi è lo Spirito prima che il bicchiere tocchi ogni lettera diversa della sua parola. Spingi anche tu: chi non spinge mai dà nell’occhio.';
  el.roleHide.dataset.peek = peek ? '1' : '';
  el.roleHide.textContent = peek ? 'Nascondi e torna alla seduta' : (i === G.players.length - 1 ? 'Nascondi' : 'Nascondi e passa il telefono');
  show('role');
}
function hideRole() {
  if (el.roleHide.dataset.peek === '1') { show(G.peekFrom || 'ask'); return; }
  if (G.passIdx < G.players.length - 1) showPass(G.passIdx + 1);
  else show('prep');
}

/* ================= la seduta ================= */
function fingers() { return G.players.filter(p => !p.out).length; }
function mediumIndex() { return (G.mediumStart + G.q - 1) % G.players.length; }
function evoke() {
  Snd.ensure(); Snd.ambientOn(); Snd.bell(true); blurActive();
  nextQuestion();
}
function nextQuestion() {
  clearTimers();
  G.q++; G.changed = false; G.answer = []; G.goodbye = false;
  G.medium = mediumIndex();
  drawQuestion();
  el.askCount.textContent = 'Domanda ' + G.q + ' di ' + G.length;
  const f = fingers();
  el.askFingers.textContent = f + (f === 1 ? ' dito' : ' dita') + ' sul bicchiere';
  el.askChange.disabled = false;
  show('ask');
}
function drawQuestion() {
  const q = drawFrom(G.deck);
  const others = G.players.map((_, i) => i).filter(i => i !== G.medium);
  const x = G.players[pick(others)].name;
  G.current = q;
  renderText(el.askQ, q.t, { X: x });
  G.currentText = el.askQ.textContent;
  el.askMedium.textContent = '';
  el.askMedium.appendChild(document.createTextNode('Legge il Medium: '));
  const b = document.createElement('b'); b.textContent = G.players[G.medium].name; el.askMedium.appendChild(b);
  el.askType.textContent = TIPO_RISPOSTA[q.a];
}
function changeQuestion() {
  if (G.changed) return;
  G.changed = true; el.askChange.disabled = true;
  drawQuestion();
}
function openAnswer() {
  G.answer = [];
  renderSlate(); markKeys();
  el.ansTitle.textContent = 'La risposta';
  el.ansSub.textContent = 'Toccate ogni lettera raggiunta. Addio chiude la seduta.';
  show('answer');
}
function buildKeys() {
  const mk = (host, list) => list.forEach(k => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'key'; b.textContent = k; b.dataset.k = k;
    b.setAttribute('aria-label', k.length === 1 ? 'Lettera ' + k : k);
    b.addEventListener('click', () => tapKey(k, b));
    host.appendChild(b);
  });
  mk(el.keysLetters, LETTERS); mk(el.keysWords, WORDS); mk(el.keysNums, DIGITS);
}
function tapKey(k, btn) {
  if (screen !== 'answer') return;
  if (G.answer.length >= 40) return;
  G.answer.push(k); Snd.knock();
  btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 180);
  renderSlate();
}
function renderSlate() {
  el.slate.textContent = '';
  if (!G.answer.length) { const s = document.createElement('span'); s.className = 'empty'; s.textContent = 'Il bicchiere non ha ancora toccato niente.'; el.slate.appendChild(s); }
  G.answer.forEach((k, i) => {
    const s = document.createElement('span'); s.className = 'tok' + (i === G.answer.length - 1 ? ' last' : ''); s.textContent = k; el.slate.appendChild(s);
  });
  el.ansDone.disabled = !G.answer.length;
  el.ansUndo.disabled = !G.answer.length;
}
function markKeys() { $$('.key', el.keysLetters).forEach(b => b.classList.toggle('seen', G.marked.has(b.dataset.k))); }
function formatAnswer(toks) {
  let out = '', prevWord = false;
  toks.forEach(k => {
    const word = k.length > 1;
    if (out && (word || prevWord)) out += ' ';
    out += k; prevWord = word;
  });
  return out;
}
function spiritState() {
  const letters = Array.from(new Set(G.word.split('')));
  const covered = letters.filter(l => G.marked.has(l) || G.lit.has(l)).length;
  return { total: letters.length, covered: covered, missing: letters.length - covered };
}
function presenceLevel(st) {
  if (st.missing <= 1) return 3;
  const f = st.covered / st.total;
  return f >= 0.6 ? 2 : f >= 0.3 ? 1 : 0;
}
function updatePresence(st) {
  Presence.p = st.missing <= 1 ? 1 : 0.9 * st.covered / st.total;
  Snd.presence(Presence.p);
}
function finishAnswer() {
  if (!G.answer.length) return;
  const toks = G.answer.slice();
  G.goodbye = toks.some(k => k === 'Addio');
  toks.forEach(k => { if (k.length === 1 && /[A-Z]/.test(k)) G.marked.add(k); });
  const text = formatAnswer(toks);
  G.log.push({ kind: 'qa', q: G.currentText, a: text, medium: G.players[G.medium].name });
  omen(text);
}
function omen(text) {
  clearTimers();
  el.omenAnswer.textContent = '«' + text + '»';
  el.omenHead.textContent = 'Il bicchiere si ferma…';
  el.omenHead.classList.remove('spirit-line');
  el.omenText.textContent = 'Nessuno si muova. Lo Spirito ascolta.';
  el.omenActions.hidden = true;
  show('omen');
  Snd.whisper();
  later(resolveOmen, PAUSE);
}
function resolveOmen() {
  const st = spiritState();
  updatePresence(st);
  if (st.missing === 0) { endGame('spirito', 'parola'); return; }
  const lvl = presenceLevel(st);
  el.omenHead.textContent = PRESENZA[lvl];
  el.omenHead.classList.toggle('spirit-line', lvl === 3);
  if (lvl > G.lastLvl) Snd.bell(lvl < 3);
  G.lastLvl = lvl;
  const dawn = G.q >= G.length, closing = dawn || G.goodbye;
  if (closing) {
    el.omenText.textContent = !dawn && G.goodbye
      ? 'Il bicchiere ha detto addio. È il momento dell’ultimo esorcismo.'
      : 'Fuori comincia a schiarire: sta sorgendo il sole. È il momento dell’ultimo esorcismo.';
    el.omenExo.textContent = 'Ultimo esorcismo';
    el.omenNext.hidden = true;
  } else {
    el.omenText.textContent = 'Tentate un esorcismo, o passate alla domanda successiva?';
    el.omenExo.textContent = 'Tentate un esorcismo';
    el.omenNext.hidden = false;
  }
  el.omenActions.hidden = false;
}

/* ================= esorcismo ================= */
function startExorcism() {
  clearTimers();
  G.finalVote = G.q >= G.length || G.goodbye;
  el.exoTitle.textContent = G.finalVote ? 'L’ultimo esorcismo' : 'Esorcismo';
  el.exoText.textContent = 'Al tre, ognuno indichi con la mano libera chi crede sia lo Spirito.';
  el.exoPick.textContent = ''; el.exoPick.hidden = true;
  el.exoCount.hidden = false; el.exoCount.textContent = '';
  el.exoCancel.hidden = G.finalVote;
  show('exo');
  const steps = ['Uno', 'Due', 'Tre!'];
  steps.forEach((w, i) => later(() => { el.exoCount.textContent = w; Snd.knock(); }, 700 + i * 950));
  later(showSuspects, 700 + steps.length * 950 + 250);
}
function showSuspects() {
  el.exoCount.hidden = true;
  el.exoText.textContent = 'Chi è stato indicato da più persone? In caso di parità, sceglie il Medium.';
  el.exoPick.textContent = '';
  G.players.forEach((p, i) => {
    if (p.out) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn wide'; b.textContent = p.name;
    b.addEventListener('click', () => accuse(i));
    el.exoPick.appendChild(b);
  });
  el.exoPick.hidden = false;
}
function accuse(i) {
  clearTimers();
  const name = G.players[i].name;
  el.revHead.textContent = name + ' viene esorcizzato…';
  el.revText.textContent = 'Tutti fermi. La fiamma decide.';
  el.revNext.hidden = true;
  show('reveal');
  Snd.whisper();
  later(() => resolveAccusation(i), PAUSE + 300);
}
function resolveAccusation(i) {
  const name = G.players[i].name;
  if (i === G.spirit) {
    G.log.push({ kind: 'ev', text: 'Esorcismo: ' + name + ' era lo Spirito.' });
    endGame('vivi', 'esorcismo'); return;
  }
  G.players[i].out = true;
  G.log.push({ kind: 'ev', text: 'Esorcismo: ' + name + ' non era lo Spirito e toglie il dito.' });
  if (G.finalVote) { endGame('spirito', (G.goodbye && G.q < G.length) ? 'addio' : 'alba', i); return; }
  const missing = Array.from(new Set(G.word.split(''))).filter(l => !G.marked.has(l) && !G.lit.has(l));
  if (missing.length) G.lit.add(pick(missing));
  const st = spiritState();
  updatePresence(st);
  Object.keys(C).forEach(k => C[k].snuff());
  Snd.bell(true);
  if (st.missing === 0) { endGame('spirito', 'dono', i); return; }
  if (fingers() === 1) { endGame('vivi', 'solo'); return; }
  el.revHead.textContent = name + ' non era lo Spirito.';
  el.revText.textContent = name + ' toglie il dito dal bicchiere. Lo Spirito si nutre del vostro errore e si prende in regalo una lettera della sua parola.';
  el.revNext.hidden = false;
  G.lastLvl = presenceLevel(st);
}

/* ================= fine della seduta ================= */
function endGame(winner, how, accused) {
  clearTimers();
  G.over = true;
  const sp = G.players[G.spirit].name;
  Snd.ambientOff();
  if (winner === 'vivi') {
    Presence.p = 0.05;
    el.endTitle.textContent = 'Lo Spirito è stato scacciato';
    el.endSub.textContent = how === 'solo'
      ? 'Sul bicchiere è rimasto un solo dito: quello di ' + sp + ', lo Spirito. Vincono i vivi.'
      : 'Era ' + sp + '. Vincono i vivi.';
    Snd.livingWin();
  } else {
    Presence.p = 1;
    el.endTitle.textContent = 'Lo Spirito ha vinto';
    el.endSub.textContent = how === 'parola'
      ? 'Il bicchiere ha toccato ogni lettera diversa della parola maledetta. Lo Spirito era ' + sp + '.'
      : how === 'dono'
        ? 'Con il vostro ultimo errore lo Spirito ha completato la sua parola. Era ' + sp + '.'
        : how === 'addio'
          ? 'Avete detto addio e accusato ' + G.players[accused].name + ', ma lo Spirito era ' + sp + '.'
          : 'All’alba avete accusato ' + G.players[accused].name + ', ma lo Spirito era ' + sp + '.';
    Snd.spiritWins();
  }
  el.endWord.textContent = '';
  let gifts = 0;
  const letters = uniqueLetters(G.word);
  const avail = Math.min(el.sEnd.clientWidth || 350, 600) - 40, nL = letters.length;
  const size = Math.max(22, Math.min(42, Math.floor((avail - (nL - 1) * 6) / nL)));
  letters.forEach(ch => {
    const s = document.createElement('span'); s.textContent = ch;
    s.style.width = size + 'px'; s.style.height = Math.round(size * 1.2) + 'px'; s.style.fontSize = Math.round(size * 0.66) + 'px';
    if (G.marked.has(ch)) s.className = 'on';
    else if (G.lit.has(ch)) { s.className = 'gift'; gifts++; }
    el.endWord.appendChild(s);
  });
  el.endLegend.textContent = 'La parola era ' + G.word + '. Ogni lettera diversa conta una volta sola: in colore quelle toccate dal bicchiere' + (gifts ? ', in blu quelle regalate dagli esorcismi sbagliati.' : '.');
  el.endLog.textContent = '';
  G.log.forEach(e => {
    const li = document.createElement('li');
    if (e.kind === 'qa') {
      const q = document.createElement('q'); q.textContent = e.q;
      const s = document.createElement('span'); s.textContent = '«' + e.a + '»  (Medium: ' + e.medium + ')';
      li.appendChild(q); li.appendChild(s);
    } else { const s = document.createElement('span'); s.className = 'ev'; s.textContent = e.text; li.appendChild(s); }
    el.endLog.appendChild(li);
  });
  show('end');
}
function quitToHome() { clearTimers(); letSleep(); Snd.ambientOff(); G.active = false; show('home'); }

let sentinella = null;
function keepAwake() {
  try {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(w => { sentinella = w; }).catch(() => {});
  } catch (e) {}
}
function letSleep() {
  const w = sentinella; sentinella = null;
  try { if (w) w.release(); } catch (e) {}
}

/* ================= ciclo della candela ================= */
let lastT = now();
function loop() {
  const t = now(), dt = clamp((t - lastT) / 1000, 0, 0.05); lastT = t;
  try {
    const map = { home: ['home'], prep: ['prep'], ask: ['miniAsk'], answer: ['miniAns'], omen: ['omen'], reveal: ['reveal'] };
    (map[screen] || []).forEach(k => C[k].draw(t, dt));
    if (Snd.amb && t > Snd.nextWhisper) { Snd.whisper(); Snd.nextWhisper = t + (7000 + Math.random() * 11000) * (1 - 0.6 * Presence.p); }
  } catch (e) { if (window.console) console.error(e); }
  requestAnimationFrame(loop);
}

/* ================= collegamenti ================= */
function init() {
  loadPrefs();
  C.home = new Candle(el.cvHome); C.prep = new Candle(el.cvPrep); C.omen = new Candle(el.cvOmen);
  C.reveal = new Candle(el.cvReveal); C.miniAsk = new Candle(el.cvMiniAsk); C.miniAns = new Candle(el.cvMiniAns);

  // un tocco cominciato prima di un cambio di schermata non preme niente nella schermata nuova
  document.addEventListener('pointerdown', () => { lastPD = now(); }, true);
  document.addEventListener('click', e => { if (e.detail > 0 && lastPD < lastSwap) { e.stopPropagation(); e.preventDefault(); } }, true);

  $$('[data-go]').forEach(b => b.addEventListener('click', () => { if (b.dataset.go === 'setup') renderPlayers(); show(b.dataset.go); }));
  el.addBtn.addEventListener('click', addName);
  el.nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addName(); } });
  bindRadio(el.levels, 'level');
  bindRadio(el.length, 'length', v => parseInt(v, 10));
  bindSwitches();
  el.startBtn.addEventListener('click', () => { if (G.names.length < 4) return; Snd.ensure(); blurActive(); savePrefs(); newSeance(); });
  el.passShow.addEventListener('click', () => showRole(G.passIdx, false));
  el.passBack.addEventListener('click', () => show(G.peekFrom || 'ask'));
  el.roleHide.addEventListener('click', hideRole);
  el.prepGo.addEventListener('click', evoke);
  el.prepPeek.addEventListener('click', () => showPeek('prep'));
  el.askGo.addEventListener('click', openAnswer);
  el.askChange.addEventListener('click', changeQuestion);
  el.askPeek.addEventListener('click', () => showPeek('ask'));
  el.ansUndo.addEventListener('click', () => { G.answer.pop(); renderSlate(); });
  el.ansDone.addEventListener('click', finishAnswer);
  el.omenExo.addEventListener('click', startExorcism);
  el.omenNext.addEventListener('click', nextQuestion);
  el.exoCancel.addEventListener('click', () => { clearTimers(); show('omen'); });
  el.revNext.addEventListener('click', nextQuestion);
  el.againBtn.addEventListener('click', () => { Snd.ensure(); newSeance(); });
  el.setupBtn.addEventListener('click', () => { letSleep(); G.active = false; renderPlayers(); show('setup'); });
  el.menuBtn.addEventListener('click', quitToHome);
  buildKeys();
  renderBoardHelp();
  window.addEventListener('resize', () => requestAnimationFrame(resizeAll));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && G.active) keepAwake(); });
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => resizeAll());
    [el.homeCandle, el.prepCandle, el.omenCandle, el.revealCandle, el.cvMiniAsk, el.cvMiniAns].forEach(n => ro.observe(n));
  }
  renderPlayers();
  show('home');
  requestAnimationFrame(loop);
  if (/[?&]debug\b/.test(location.search)) window.__bi = { G: G, Presence: Presence };
  if (isWeb() && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
}
init();
})();

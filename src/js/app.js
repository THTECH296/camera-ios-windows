// Câmera — o app Câmera do iOS 26/27 no Windows.
// Visor ao vivo, Foto (flash de tela, Live Photo, timer, estilos, proporção), Vídeo e Time-lapse.

import { api, native } from './api.js';
import { icon, svg } from './icons.js';
import { openViewer, refreshThumb, latest } from './gallery.js';

const $ = s => document.querySelector(s);
const video = $('#video');
const finder = $('#finder');
const body = document.body;

// ============ preferências ============
const DEF = {
  mode: 'foto', flash: 'auto', live: true, timer: 0, aspect: '4:3', style: 'padrao',
  grid: false, mirrorPreview: true, mirrorSave: true, sound: true, photoMax: false,
  deviceId: '', micId: '', vres: '1080', vfps: 30, counter: 0,
};
const prefs = (() => {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem('camera-prefs') || '{}') }; } catch { return { ...DEF }; }
})();
const save = () => { try { localStorage.setItem('camera-prefs', JSON.stringify(prefs)); } catch {} };

const MODES = [
  { id: 'timelapse', label: 'Time-lapse' },
  { id: 'video', label: 'Vídeo' },
  { id: 'foto', label: 'Foto' },
];
const STYLES = [
  { id: 'padrao', label: 'Padrão', f: '' },
  { id: 'vivido', label: 'Vívido', f: 'saturate(1.38) contrast(1.06)' },
  { id: 'rico', label: 'Contraste Rico', f: 'contrast(1.24) saturate(1.12) brightness(.95)' },
  { id: 'quente', label: 'Quente', f: 'sepia(.22) saturate(1.25) hue-rotate(-6deg) brightness(1.02)' },
  { id: 'frio', label: 'Frio', f: 'saturate(.92) hue-rotate(12deg) brightness(1.03) contrast(1.04)' },
  { id: 'luminoso', label: 'Luminoso', f: 'brightness(1.12) contrast(.92) saturate(1.08)' },
  { id: 'mono', label: 'Mono', f: 'grayscale(1) contrast(1.06)' },
  { id: 'noir', label: 'Noir', f: 'grayscale(1) contrast(1.5) brightness(.9)' },
];
const ASPECTS = { '4:3': 4 / 3, '16:9': 16 / 9, '1:1': 1 };
const VRES = { '720': [1280, 720], '1080': [1920, 1080], '4K': [3840, 2160] };

let stream = null, audioTrack = null, demoTimer = 0;
let cameras = [], mics = [];
let zoom = 1, ev = 0;
let busy = false;
const toast = msg => {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 1800);
};

// ============ janela ============
function wireWindow() {
  const w = api.win;
  if (!w) return;
  document.documentElement.classList.add('win-frameless');
  $('.w-close').onclick = () => w.close();
  $('.w-min').onclick = () => w.minimize();
  $('.w-max').onclick = () => w.toggleMaximize();
  // maximizada ou em tela cheia, a janela encosta nas bordas da tela: cantos retos
  const sync = async () => {
    const [max, full] = await Promise.all([w.isMaximized(), w.isFullscreen()]);
    document.documentElement.classList.toggle('win-square', max || full);
    const b = $('.w-max');
    b.title = max ? 'Restaurar' : 'Maximizar';
    b.firstElementChild.innerHTML = max
      ? '<rect x="2" y="3.6" width="6.4" height="6.4" rx="1.6" /><path d="M4.2 2h4.2A1.6 1.6 0 0 1 10 3.6v4.2" />'
      : '<rect x="2" y="2" width="8" height="8" rx="2.2" />';
  };
  w.onResized(sync);
  sync();
  // o visor e o trilho também arrastam a janela (fora dos botões)
  $('#rail').addEventListener('mousedown', e => { if (e.button === 0 && e.target.id === 'rail') w.startDragging(); });
  requestAnimationFrame(() => w.show());
}

// ============ layout ============
const aspectNow = () => (prefs.mode === 'foto' ? ASPECTS[prefs.aspect] : 16 / 9);
function layout() {
  const portrait = innerWidth < innerHeight * 1.02;
  body.classList.toggle('portrait', portrait);
  body.classList.toggle('landscape', !portrait);
  const st = $('#stage').getBoundingClientRect();
  const a = aspectNow();
  let w = st.width, h = w / a;
  if (h > st.height) { h = st.height; w = h * a; }
  // quase do tamanho do palco: preenche (como o iPhone faz com 16:9)
  if (st.width / w < 1.06 && st.height / h < 1.06) { w = st.width; h = st.height; }
  Object.assign(finder.style, {
    width: `${w}px`, height: `${h}px`,
    left: `${(st.width - w) / 2}px`, top: `${(st.height - h) / 2}px`,
  });
  // barra de cima e controles de baixo acompanham o visor, como no iPhone
  const s = $('#stage').style;
  s.setProperty('--fl', `${(st.width - w) / 2}px`);
  s.setProperty('--fw', `${w}px`);
  s.setProperty('--fb', `${(st.height - h) / 2}px`);
}
addEventListener('resize', () => { finder.classList.add('noanim'); layout(); clearTimeout(layout.t); layout.t = setTimeout(() => finder.classList.remove('noanim'), 80); });

// ============ visual do visor ============
const styleOf = id => STYLES.find(s => s.id === id) || STYLES[0];
const lookFilter = () => {
  const f = styleOf(prefs.style).f;
  const b = ev ? `brightness(${Math.pow(2, ev * 0.55).toFixed(3)})` : '';
  return [f, b].filter(Boolean).join(' ') || 'none';
};
function applyLook() {
  finder.style.setProperty('--look', lookFilter());
  finder.style.setProperty('--zoom', zoom);
  finder.style.setProperty('--mirror', prefs.mirrorPreview ? -1 : 1);
  $('#grid').classList.toggle('hidden', !prefs.grid);
}

// ============ câmera ============
function wantedSize() {
  if (prefs.mode !== 'foto') return VRES[prefs.vres];
  return prefs.photoMax ? [4096, 3072] : [1920, 1080];
}
let currentKey = '';
async function startCamera(force = false) {
  const [w, h] = wantedSize();
  const fps = prefs.mode === 'video' ? prefs.vfps : 30;
  const key = `${prefs.deviceId}|${w}|${fps}`;
  if (!force && key === currentKey && stream) return;
  currentKey = key;
  finder.classList.add('swap');
  stopStream();
  const constraints = {
    video: {
      deviceId: prefs.deviceId ? { exact: prefs.deviceId } : undefined,
      width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps },
    },
    audio: false,
  };
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      if (e.name === 'OverconstrainedError' || e.name === 'NotFoundError') {
        prefs.deviceId = ''; save();
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else throw e;
    }
    hideNoCam();
    $('#demo').classList.add('hidden');
  } catch (e) {
    console.warn('câmera', e);
    if (!native) { stream = demoStream(); }
    else { await listDevices(); showNoCam(e); return; }
  }
  video.srcObject = stream;
  await video.play().catch(() => {});
  await listDevices();
  setTimeout(() => finder.classList.remove('swap'), 140);
  if (prefs.mode === 'foto' && prefs.live) liveBuffer.start();
}
function stopStream() {
  liveBuffer.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  clearInterval(demoTimer);
  stream = null;
}
async function listDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    cameras = all.filter(d => d.kind === 'videoinput');
    mics = all.filter(d => d.kind === 'audioinput');
    const t = stream?.getVideoTracks()[0];
    const id = t?.getSettings?.().deviceId;
    if (id && !prefs.deviceId) { prefs.deviceId = id; save(); }
  } catch {}
}
async function ensureMic() {
  if (audioTrack && audioTrack.readyState === 'live') return audioTrack;
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: prefs.micId ? { exact: prefs.micId } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    });
    audioTrack = s.getAudioTracks()[0];
  } catch (e) {
    console.warn('microfone', e);
    audioTrack = null;
  }
  return audioTrack;
}

function showNoCam(e) {
  hideNoCam();
  const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
  const busyCam = e && (e.name === 'NotReadableError' || e.name === 'AbortError');
  const name = (cameras.find(c => c.deviceId === prefs.deviceId) || cameras[0])?.label || '';
  const camo = /camo/i.test(name);
  const d = document.createElement('div');
  d.className = 'nocam';
  d.innerHTML = `${svg('cameraSlash')}
    <h2>${denied ? 'Sem acesso à câmera' : busyCam ? 'Não foi possível ligar a câmera' : 'Nenhuma câmera encontrada'}</h2>
    <p>${denied ? 'Ative “Permitir que aplicativos da área de trabalho acessem sua câmera” nas configurações de privacidade do Windows.'
      : busyCam ? (camo ? 'A Camo não está recebendo imagem. Abra o Camo no iPhone e no PC — a Câmera liga sozinha assim que a imagem chegar.'
        : 'Ela pode estar em uso por outro app ou desconectada. Feche o outro app — a Câmera tenta de novo sozinha.')
      : 'Conecte uma webcam — a Câmera liga sozinha quando ela aparecer.'}</p>
    <div class="row">${denied ? '<button class="btn sec" data-a="priv">Abrir Privacidade</button>' : ''}<button class="btn" data-a="retry">Tentar de novo</button></div>`;
  d.onclick = ev2 => {
    const a = ev2.target.closest('[data-a]')?.dataset.a;
    if (a === 'priv') api.privacy();
    if (a === 'retry') startCamera(true);
  };
  finder.append(d);
  finder.classList.remove('swap');
  // tenta de novo sozinha de tempos em tempos (exceto sem permissão, que só muda nas configurações)
  clearInterval(retryT);
  if (!denied) retryT = setInterval(() => { if (!document.hidden && finder.querySelector('.nocam')) startCamera(true); }, 4000);
}
let retryT = 0;
const hideNoCam = () => { clearInterval(retryT); finder.querySelector('.nocam')?.remove(); };

// câmera de demonstração (navegador sem webcam): uma cena animada
function demoStream() {
  const c = $('#demo');
  c.width = 1920; c.height = 1080;
  const ctx = c.getContext('2d');
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    const g = ctx.createLinearGradient(0, 0, 0, 1080);
    g.addColorStop(0, '#f5a35c'); g.addColorStop(.45, '#e9677a'); g.addColorStop(1, '#2b2350');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
    ctx.fillStyle = 'rgba(255,236,200,.95)';
    ctx.beginPath(); ctx.arc(960 + Math.sin(t / 4) * 120, 520 + Math.cos(t / 5) * 30, 120, 0, 7); ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(20,16,40,${.35 + i * .18})`;
      ctx.beginPath(); ctx.moveTo(0, 1080);
      for (let x = 0; x <= 1920; x += 40) ctx.lineTo(x, 700 + i * 90 + Math.sin(x / (260 - i * 40) + t * (.3 + i * .15) + i) * (60 - i * 8));
      ctx.lineTo(1920, 1080); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 34px system-ui';
    ctx.fillText(`Câmera de demonstração · ${new Date().toLocaleTimeString('pt-BR')}`, 60, 80);
  };
  draw();
  demoTimer = setInterval(draw, 1000 / 30);
  return c.captureStream(30);
}

// ============ captura de quadro ============
// recorta o quadro da câmera na proporção, aplica zoom, estilo e espelho — igual ao que o visor mostra
function frameCanvas(aspect, { mirror = prefs.mirrorSave, maxW = 0, filter = true } = {}) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return null;
  let cw = vw, ch = vw / aspect;
  if (ch > vh) { ch = vh; cw = vh * aspect; }
  let ow = Math.round(cw), oh = Math.round(ch);
  if (maxW && ow > maxW) { oh = Math.round(oh * maxW / ow); ow = maxW; }
  const sw = cw / zoom, sh = ch / zoom;
  const c = frameCanvas.c || (frameCanvas.c = document.createElement('canvas'));
  c.width = ow; c.height = oh;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.filter = filter ? lookFilter() : 'none';
  if (mirror) { ctx.translate(ow, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, ow, oh);
  ctx.restore();
  return c;
}
const toBlob = (c, type = 'image/jpeg', q = 0.93) => new Promise(r => c.toBlob(r, type, q));

function nextName(ext) {
  prefs.counter = (prefs.counter % 9999) + 1; save();
  return `IMG_${String(prefs.counter).padStart(4, '0')}.${ext}`;
}

// som do obturador, sintetizado
let actx;
function shutterSound(kind = 'photo') {
  if (!prefs.sound) return;
  try {
    actx = actx || new AudioContext();
    const now = actx.currentTime;
    const burst = (at, dur, freq, gain) => {
      const n = actx.createBufferSource();
      const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      n.buffer = buf;
      const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4;
      const g = actx.createGain(); g.gain.value = gain;
      n.connect(f).connect(g).connect(actx.destination);
      n.start(now + at);
    };
    if (kind === 'photo') { burst(0, .045, 3200, .9); burst(.06, .05, 2200, .7); }
    else {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = kind === 'start' ? 1180 : 880; g.gain.setValueAtTime(.12, now); g.gain.exponentialRampToValueAtTime(.001, now + .18);
      o.connect(g).connect(actx.destination); o.start(now); o.stop(now + .2);
    }
  } catch {}
}

function blink() {
  const b = $('#blink');
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}

// ============ Live Photo: guarda ~1,5 s antes e grava ~1,5 s depois ============
const LIVE_FPS = 15, LIVE_HALF = 22;
const liveBuffer = {
  frames: [], timer: 0, after: null,
  start() {
    if (this.timer || !native && !stream) return;
    this.timer = setInterval(async () => {
      if (!video.videoWidth || document.hidden) return;
      const c = frameCanvas(ASPECTS[prefs.aspect], { maxW: 960 });
      if (!c) return;
      const bmp = await createImageBitmap(c);
      this.frames.push(bmp);
      if (this.after) {
        this.after.push(bmp);
        if (this.after.length >= LIVE_HALF) { const done = this.after; this.after = null; done.resolve(); }
      }
      while (this.frames.length > LIVE_HALF * 2 + 4) { const old = this.frames.shift(); if (!this.held?.has(old)) old.close(); }
    }, 1000 / LIVE_FPS);
  },
  stop() {
    clearInterval(this.timer); this.timer = 0;
    this.frames.forEach(f => { if (!this.held?.has(f)) f.close(); }); this.frames = [];
  },
  // devolve os quadros de antes + depois do clique
  async capture() {
    if (!this.timer || this.after) return null;
    const before = this.frames.slice(-LIVE_HALF);
    const after = [];
    this.held = new Set(before);
    await new Promise(r => { after.resolve = r; this.after = after; });
    after.forEach(f => this.held.add(f));
    return before.concat(after);
  },
};
// transforma uma lista de quadros num vídeo, tocando-os num canvas enquanto o MediaRecorder grava
async function encodeFrames(frames, fps, { width, height, bitrate = 6e6, onProgress } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  const s = c.captureStream(0);
  const track = s.getVideoTracks()[0];
  const { mime } = recMime();
  const rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => (rec.onstop = r));
  const draw = async f => {
    const bmp = f instanceof Blob ? await createImageBitmap(f) : f;
    ctx.drawImage(bmp, 0, 0, width, height);
    if (f instanceof Blob) bmp.close();
    track.requestFrame();
  };
  await draw(frames[0]);
  rec.start();
  const step = 1000 / fps;
  const t0 = performance.now();
  for (let i = 0; i < frames.length; i++) {
    await draw(frames[i]);
    onProgress?.(i / frames.length);
    const wait = t0 + (i + 1) * step - performance.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }
  rec.stop();
  await done;
  track.stop();
  return new Blob(chunks, { type: mime.split(';')[0] });
}

// ============ Foto ============
let countdown = null;
async function takePhoto() {
  if (busy) return;
  if (countdown) { cancelCountdown(); return; }
  if (prefs.timer) {
    const ok = await runCountdown(prefs.timer);
    if (!ok) return;
  }
  busy = true;
  try {
    let flash = prefs.flash === 'on' || (prefs.flash === 'auto' && isDark());
    if (flash) { body.classList.add('screen-flash'); await sleep(320); }
    const livePromise = prefs.live ? liveBuffer.capture() : null;
    const c = frameCanvas(ASPECTS[prefs.aspect]);
    if (flash) setTimeout(() => body.classList.remove('screen-flash'), 90);
    shutterSound('photo');
    blink();
    if (!c) return;
    const blob = await toBlob(c);
    const name = nextName('jpg');
    const thumbUrl = URL.createObjectURL(blob);
    refreshThumb({ url: thumbUrl, video: false, pop: true });
    const saved = await api.save(name, blob);
    if (livePromise) {
      livePromise.then(async frames => {
        if (!frames?.length) return;
        const f0 = frames[0];
        const v = await encodeFrames(frames, LIVE_FPS, { width: f0.width, height: f0.height, bitrate: 5e6 });
        frames.forEach(f => f.close());
        liveBuffer.held = null;
        await api.save(saved.replace(/\.jpg$/i, `.${v.type.includes('mp4') ? 'mp4' : 'webm'}`), v);
      }).catch(e => console.warn('live', e));
    }
  } catch (e) {
    console.error(e); toast('Não foi possível salvar a foto');
  } finally {
    busy = false;
  }
}
function isDark() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 18;
  const x = c.getContext('2d');
  try { x.drawImage(video, 0, 0, 32, 18); } catch { return false; }
  const d = x.getImageData(0, 0, 32, 18).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
  return s / (d.length / 4) < 58;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function runCountdown(n) {
  return new Promise(resolve => {
    const el = $('#count');
    el.classList.remove('hidden');
    let left = n;
    const tick = () => {
      if (left <= 0) { cancelCountdown(true); return; }
      el.innerHTML = `<b>${left}</b>`;
      left--;
      countdown.t = setTimeout(tick, 1000);
    };
    countdown = { resolve, t: 0 };
    tick();
  });
}
function cancelCountdown(ok = false) {
  if (!countdown) return;
  clearTimeout(countdown.t);
  $('#count').classList.add('hidden');
  const r = countdown.resolve; countdown = null;
  r(ok);
}

// ============ Vídeo ============
function recMime() {
  const list = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d002a,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ];
  const mime = list.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || 'video/webm';
  return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}
let rec = null;
async function startVideo() {
  if (busy || rec) return;
  busy = true;
  try {
    const a = await ensureMic();
    if (!a) toast('Gravando sem som (sem microfone)');
    // o vídeo passa por um canvas para levar zoom, estilo e espelho junto
    const c0 = frameCanvas(16 / 9);
    if (!c0) return;
    const out = document.createElement('canvas');
    out.width = c0.width; out.height = c0.height;
    const octx = out.getContext('2d');
    const fps = prefs.vfps;
    const cs = out.captureStream(fps);
    if (a) cs.addTrack(a);
    const { mime, ext } = recMime();
    const px = out.width * out.height;
    const bitrate = px > 4e6 ? 40e6 : px > 1.5e6 ? (fps > 30 ? 18e6 : 12e6) : 6e6;
    const mr = new MediaRecorder(cs, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 160000 });
    const chunks = [];
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    let running = true;
    const paint = () => {
      if (!running) return;
      const f = frameCanvas(16 / 9);
      if (f) octx.drawImage(f, 0, 0, out.width, out.height);
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(paint);
      else requestAnimationFrame(paint);
    };
    paint();
    rec = { mr, chunks, ext, mime, stopPaint: () => (running = false), t0: performance.now(), pausedAt: 0, pausedTotal: 0 };
    mr.start(1000);
    shutterSound('start');
    body.classList.add('recording');
    startClock();
  } catch (e) {
    console.error(e); toast('Não foi possível gravar'); rec = null;
  } finally {
    busy = false;
  }
}
async function stopVideo() {
  if (!rec) return;
  const r = rec; rec = null;
  const done = new Promise(res => (r.mr.onstop = res));
  r.mr.stop();
  await done;
  r.stopPaint();
  stopClock();
  shutterSound('stop');
  body.classList.remove('recording', 'paused');
  const blob = new Blob(r.chunks, { type: r.mime.split(';')[0] });
  const name = nextName(r.ext);
  refreshThumb({ url: URL.createObjectURL(blob), video: true, pop: true });
  await api.save(name, blob).catch(() => toast('Não foi possível salvar o vídeo'));
}
function togglePause() {
  if (!rec) return;
  if (rec.mr.state === 'recording') { rec.mr.pause(); rec.pausedAt = performance.now(); body.classList.add('paused'); }
  else { rec.mr.resume(); rec.pausedTotal += performance.now() - rec.pausedAt; rec.pausedAt = 0; body.classList.remove('paused'); }
  setPauseIcon();
}
function setPauseIcon() {
  const b = $('#b-pause');
  b.replaceChildren(icon(body.classList.contains('paused') ? 'play' : 'pause'));
  b.title = body.classList.contains('paused') ? 'Continuar' : 'Pausar a gravação';
}
let clockT = 0;
function startClock() {
  $('#rec-time').classList.remove('hidden');
  const el = $('#rec-time b');
  const tick = () => {
    const r = rec || tl;
    if (!r) return;
    const ms = (r.pausedAt || performance.now()) - r.t0 - (r.pausedTotal || 0);
    const s = Math.floor(ms / 1000);
    el.textContent = [s / 3600, (s % 3600) / 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':');
  };
  tick(); clockT = setInterval(tick, 250);
}
function stopClock() { clearInterval(clockT); $('#rec-time').classList.add('hidden'); $('#rec-time b').textContent = '00:00:00'; }
async function snapDuringVideo() {
  const c = frameCanvas(16 / 9);
  if (!c) return;
  shutterSound('photo'); blink();
  const blob = await toBlob(c);
  await api.save(nextName('jpg'), blob);
  toast('Foto salva');
}

// ============ Time-lapse ============
// como no iPhone: o intervalo dobra quando a gravação fica longa, e o vídeo final fica entre ~8 e ~16 s
let tl = null;
function startTimelapse() {
  if (busy || tl) return;
  const c0 = frameCanvas(16 / 9, { maxW: 1920 });
  if (!c0) return;
  tl = { frames: [], every: 250, last: 0, t0: performance.now(), w: c0.width, h: c0.height, timer: 0 };
  const grab = async () => {
    if (!tl) return;
    const now = performance.now();
    if (now - tl.last >= tl.every) {
      tl.last = now;
      const c = frameCanvas(16 / 9, { maxW: 1920 });
      if (c) {
        const b = await toBlob(c, 'image/jpeg', 0.86);
        if (!tl) return;
        tl.frames.push(b);
        if (tl.frames.length >= 480) { tl.frames = tl.frames.filter((_, i) => i % 2 === 0); tl.every *= 2; }
      }
    }
    tl.timer = setTimeout(grab, 40);
  };
  grab();
  shutterSound('start');
  body.classList.add('recording');
  startClock();
}
async function stopTimelapse() {
  if (!tl) return;
  const t = tl; tl = null;
  clearTimeout(t.timer);
  stopClock();
  shutterSound('stop');
  body.classList.remove('recording');
  if (t.frames.length < 2) { toast('Time-lapse curto demais'); return; }
  busy = true;
  $('#busy').classList.remove('hidden');
  const label = $('#busy span');
  try {
    const v = await encodeFrames(t.frames, 30, {
      width: t.w, height: t.h, bitrate: 16e6,
      onProgress: p => (label.textContent = `Processando time-lapse… ${Math.round(p * 100)}%`),
    });
    refreshThumb({ url: URL.createObjectURL(v), video: true, pop: true });
    await api.save(nextName(v.type.includes('mp4') ? 'mp4' : 'webm'), v);
  } catch (e) {
    console.error(e); toast('Não foi possível salvar o time-lapse');
  } finally {
    $('#busy').classList.add('hidden');
    label.textContent = 'Processando time-lapse…';
    busy = false;
  }
}

function shutter() {
  if (!$('#viewer').classList.contains('hidden')) return;
  closeTray();
  if (prefs.mode === 'foto') takePhoto();
  else if (prefs.mode === 'video') (rec ? stopVideo() : startVideo());
  else (tl ? stopTimelapse() : startTimelapse());
}

// ============ modos ============
function renderModes() {
  const track = $('#modes .track');
  track.replaceChildren(...MODES.map(m => {
    const b = document.createElement('button');
    b.textContent = m.label;
    b.dataset.id = m.id;
    b.onclick = () => setMode(m.id);
    return b;
  }));
  syncModes();
}
function syncModes() {
  const track = $('#modes .track');
  const box = $('#modes');
  let sel;
  track.querySelectorAll('button').forEach(b => { b.classList.toggle('sel', b.dataset.id === prefs.mode); if (b.dataset.id === prefs.mode) sel = b; });
  if (sel) track.style.transform = `translateX(${box.clientWidth / 2 - (sel.offsetLeft + sel.offsetWidth / 2)}px)`;
}
async function setMode(id) {
  if (id === prefs.mode || rec || tl || busy) return;
  cancelCountdown();
  prefs.mode = id; save();
  body.classList.remove('mode-foto', 'mode-video', 'mode-timelapse');
  body.classList.add(`mode-${id}`);
  closeTray();
  syncModes();
  renderTop();
  layout();
  if (id !== 'foto') liveBuffer.stop();
  await startCamera();
  if (id === 'foto' && prefs.live) liveBuffer.start();
  if (id === 'video') ensureMic();
}
const stepMode = d => {
  const i = MODES.findIndex(m => m.id === prefs.mode);
  const n = MODES[i + d];
  if (n) setMode(n.id);
};

// ============ zoom ============
const ZOOMS = [1, 2, 3];
function renderZoom() {
  const z = $('#zoom');
  z.replaceChildren(...ZOOMS.map((v, i) => {
    const b = document.createElement('button');
    const next = ZOOMS[i + 1] ?? Infinity;
    const active = zoom >= v - 0.001 && zoom < next - 0.001;
    b.classList.toggle('sel', active);
    b.textContent = active ? `${fmtZoom(zoom)}×` : String(v);
    b.onclick = () => setZoom(v, true);
    return b;
  }));
}
const fmtZoom = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
function setZoom(v, anim = false) {
  zoom = Math.min(8, Math.max(1, v));
  if (anim) { video.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1), opacity .35s, filter .4s'; setTimeout(() => (video.style.transition = ''), 460); }
  applyLook();
  renderZoom();
}

// ============ barra superior ============
function renderTop() {
  const f = $('#b-flash');
  f.replaceChildren(icon(prefs.flash === 'off' ? 'boltSlash' : prefs.flash === 'auto' ? 'boltA' : 'bolt'));
  f.classList.toggle('on-fill', prefs.flash === 'on');
  f.title = `Flash: ${{ auto: 'automático', on: 'ativado', off: 'desativado' }[prefs.flash]}`;
  const l = $('#b-live');
  l.replaceChildren(icon(prefs.live ? 'live' : 'liveSlash'));
  l.classList.toggle('on', prefs.live);
  l.title = prefs.live ? 'Live Photo: ativado' : 'Live Photo: desativado';
  const foto = prefs.mode === 'foto';
  f.style.visibility = foto ? '' : 'hidden';
  l.style.visibility = foto ? '' : 'hidden';
  $('#b-format').innerHTML = `<span>${prefs.vres === '4K' ? '4K' : prefs.vres === '720' ? 'HD 720' : 'HD'}</span><i></i><span>${prefs.vfps}</span>`;
  $('#b-tray').replaceChildren(icon('chevUp'));
}
function cycleFlash() {
  prefs.flash = { auto: 'on', on: 'off', off: 'auto' }[prefs.flash]; save();
  renderTop(); toast(`Flash ${{ auto: 'Automático', on: 'Ativado', off: 'Desativado' }[prefs.flash]}`);
  if (trayOpen) renderTray();
}
function toggleLive() {
  prefs.live = !prefs.live; save();
  if (prefs.live) liveBuffer.start(); else liveBuffer.stop();
  renderTop(); toast(prefs.live ? 'LIVE' : 'LIVE DESATIVADO');
  if (trayOpen) renderTray();
}
function cycleFormat(e) {
  const r = e.target.closest('span');
  const spans = [...$('#b-format').querySelectorAll('span')];
  if (r && spans.indexOf(r) === 1) {
    prefs.vfps = prefs.vfps === 30 ? 60 : prefs.vfps === 60 ? 24 : 30;
  } else {
    prefs.vres = { '720': '1080', '1080': '4K', '4K': '720' }[prefs.vres];
  }
  save(); renderTop(); startCamera();
}

// ============ bandeja de controles (seta para cima) ============
let trayOpen = false, trayItem = null, stylePreview = 0;
function toggleTray() { trayOpen ? closeTray() : openTray(); }
function openTray() { trayOpen = true; trayItem = null; body.classList.add('tray-open'); renderTray(); }
function closeTray() {
  trayOpen = false; trayItem = null; body.classList.remove('tray-open');
  $('#tray').classList.add('hidden'); $('#tray-opts').classList.add('hidden');
  clearInterval(stylePreview);
}
function trayItems() {
  const foto = prefs.mode === 'foto';
  const items = [];
  if (foto) items.push({ id: 'flash', ic: prefs.flash === 'off' ? 'boltSlash' : prefs.flash === 'auto' ? 'boltA' : 'bolt', on: prefs.flash === 'on', t: 'Flash' });
  if (foto) items.push({ id: 'live', ic: prefs.live ? 'live' : 'liveSlash', on: prefs.live, t: 'Live' });
  items.push({ id: 'exposure', ic: 'exposure', on: ev !== 0, t: 'Exposição' });
  if (foto) items.push({ id: 'timer', ic: 'timer', on: !!prefs.timer, t: 'Timer', tag: prefs.timer ? `${prefs.timer}s` : '' });
  items.push({ id: 'styles', ic: 'styles', on: prefs.style !== 'padrao', t: 'Estilos' });
  if (foto) items.push({ id: 'aspect', txt: prefs.aspect === '1:1' ? '1:1' : prefs.aspect, on: prefs.aspect !== '4:3', t: 'Proporção' });
  items.push({ id: 'grid', ic: 'grid', on: prefs.grid, t: 'Grade' });
  items.push({ id: 'settings', ic: 'gear', t: 'Ajustes' });
  return items;
}
function renderTray() {
  const tray = $('#tray'), opts = $('#tray-opts');
  clearInterval(stylePreview);
  if (!trayItem) {
    opts.classList.add('hidden');
    tray.classList.remove('hidden');
    tray.replaceChildren(...trayItems().map(it => {
      const b = document.createElement('button');
      b.title = it.t;
      b.classList.toggle('on', !!it.on);
      if (it.txt) b.innerHTML = `<span class="txt">${it.txt}</span>`;
      else b.append(icon(it.ic));
      if (it.tag) b.insertAdjacentHTML('beforeend', `<span class="tag">${it.tag}</span>`);
      b.onclick = () => trayClick(it.id);
      return b;
    }));
    return;
  }
  tray.classList.add('hidden');
  opts.classList.remove('hidden');
  const head = t => `<div class="t-title">${t}</div>`;
  const row = (list, cur, set) => {
    const r = document.createElement('div');
    r.className = 't-row gl capsule';
    const back = document.createElement('button');
    back.className = 't-back'; back.title = 'Voltar'; back.append(icon('chevLeft'));
    back.onclick = () => { trayItem = null; renderTray(); };
    r.append(back);
    list.forEach(([v, label]) => {
      const b = document.createElement('button');
      b.textContent = label; b.classList.toggle('sel', v === cur);
      b.onclick = () => { set(v); trayItem = null; renderTop(); renderTray(); };
      r.append(b);
    });
    return r;
  };
  opts.innerHTML = '';
  if (trayItem === 'flash') {
    opts.insertAdjacentHTML('beforeend', head('Flash'));
    opts.append(row([['auto', 'Automático'], ['on', 'Ativado'], ['off', 'Desativado']], prefs.flash, v => { prefs.flash = v; save(); }));
  } else if (trayItem === 'live') {
    opts.insertAdjacentHTML('beforeend', head('Live Photo'));
    opts.append(row([[true, 'Ativado'], [false, 'Desativado']], prefs.live, v => { prefs.live = v; save(); v ? liveBuffer.start() : liveBuffer.stop(); }));
  } else if (trayItem === 'timer') {
    opts.insertAdjacentHTML('beforeend', head('Timer'));
    opts.append(row([[0, 'Desativado'], [3, '3s'], [10, '10s']], prefs.timer, v => { prefs.timer = v; save(); }));
  } else if (trayItem === 'aspect') {
    opts.insertAdjacentHTML('beforeend', head('Proporção'));
    opts.append(row([['4:3', '4:3'], ['16:9', '16:9'], ['1:1', 'Quadrado']], prefs.aspect, v => { prefs.aspect = v; save(); layout(); }));
  } else if (trayItem === 'exposure') {
    opts.insertAdjacentHTML('beforeend', head('Exposição'));
    opts.append(ruler());
  } else if (trayItem === 'styles') {
    opts.insertAdjacentHTML('beforeend', head(`Estilos Fotográficos · ${styleOf(prefs.style).label}`));
    opts.append(stylesPicker());
  }
}
function trayClick(id) {
  if (id === 'grid') { prefs.grid = !prefs.grid; save(); applyLook(); renderTray(); return; }
  if (id === 'settings') { closeTray(); openSettings(); return; }
  trayItem = id; renderTray();
}

// régua de exposição: arrastar para os lados, de −2 a +2
function ruler() {
  const r = document.createElement('div');
  r.className = 'ruler gl capsule';
  const ticks = document.createElement('div');
  ticks.className = 'ticks';
  const N = 40; // −2..+2 em passos de 0,1
  for (let i = 0; i <= N; i++) {
    const t = document.createElement('i');
    if (i % 10 === 0) t.className = 'big';
    if (i === 20) t.className = 'zero';
    ticks.append(t);
  }
  const needle = document.createElement('div'); needle.className = 'needle';
  const val = document.createElement('div'); val.className = 'val';
  r.append(ticks, needle, val);
  const STEP = 10.5; // largura + espaço de cada traço
  const paint = () => {
    ticks.style.transform = `translateX(${-(ev + 2) * 10 * STEP - 0.75}px)`;
    val.textContent = ev === 0 ? '0,0' : `${ev > 0 ? '+' : ''}${ev.toFixed(1).replace('.', ',')}`;
  };
  paint();
  let start = null;
  r.onpointerdown = e => { start = { x: e.clientX, ev }; r.setPointerCapture(e.pointerId); ticks.style.transition = 'none'; };
  r.onpointermove = e => {
    if (!start) return;
    ev = Math.round(Math.min(2, Math.max(-2, start.ev - (e.clientX - start.x) / (10 * STEP))) * 10) / 10;
    applyLook(); paint();
  };
  r.onpointerup = () => { start = null; ticks.style.transition = ''; };
  r.ondblclick = () => { ev = 0; applyLook(); paint(); };
  r.onwheel = e => { e.preventDefault(); ev = Math.round(Math.min(2, Math.max(-2, ev - Math.sign(e.deltaY) * 0.1)) * 10) / 10; applyLook(); paint(); };
  return r;
}

// estilos fotográficos com prévia ao vivo
function stylesPicker() {
  const wrap = document.createElement('div');
  wrap.className = 'styles';
  const canv = [];
  STYLES.forEach(s => {
    const b = document.createElement('button');
    b.classList.toggle('sel', s.id === prefs.style);
    const sw = document.createElement('div'); sw.className = 'sw';
    const c = document.createElement('canvas'); c.width = 124; c.height = 124;
    sw.append(c);
    b.append(sw, document.createTextNode(s.label));
    b.onclick = () => {
      prefs.style = s.id; save(); applyLook();
      wrap.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
      $('#tray-opts .t-title').textContent = `Estilos Fotográficos · ${s.label}`;
    };
    canv.push([c, s]);
    wrap.append(b);
  });
  const paint = () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    const side = Math.min(vw, vh) / zoom;
    canv.forEach(([c, s]) => {
      const x = c.getContext('2d');
      x.save();
      x.filter = s.f || 'none';
      if (prefs.mirrorPreview) { x.translate(124, 0); x.scale(-1, 1); }
      x.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, 124, 124);
      x.restore();
    });
  };
  paint();
  stylePreview = setInterval(paint, 120);
  // fecha a bandeja ao voltar com a seta
  const back = document.createElement('button');
  back.className = 't-back gl round'; back.title = 'Voltar'; back.append(icon('chevLeft'));
  back.style.cssText = 'align-self:center;margin-right:6px;flex:none';
  back.onclick = () => { trayItem = null; renderTray(); };
  wrap.prepend(back);
  return wrap;
}

// ============ foco e exposição por toque ============
function wireFinder() {
  const fx = $('#focus');
  let down = null, lockT = 0, dimT = 0, hideT = 0, evDrag = null;
  const place = (x, y) => {
    fx.classList.remove('hidden', 'dim', 'ev');
    fx.style.left = `${x}px`; fx.style.top = `${y}px`;
    const sq = fx.querySelector('.sq'); sq.style.animation = 'none'; void sq.offsetWidth; sq.style.animation = '';
    fx.style.setProperty('--ev', (ev / 2).toFixed(2));
    clearTimeout(dimT); clearTimeout(hideT);
    dimT = setTimeout(() => fx.classList.add('dim'), 2200);
    hideT = setTimeout(() => { if (!$('#lock').classList.contains('hidden')) return; fx.classList.add('hidden'); }, 5000);
  };
  finder.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.nocam, .sun')) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    clearTimeout(lockT);
    lockT = setTimeout(() => {
      if (!down) return;
      const r = finder.getBoundingClientRect();
      place(down.x - r.left, down.y - r.top);
      $('#lock').classList.remove('hidden');
      clearTimeout(hideT); clearTimeout(dimT);
      focusAt(down.x, down.y);
      down = null;
    }, 650);
  });
  addEventListener('pointerup', e => {
    clearTimeout(lockT);
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    const d = down; down = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { stepMode(dx > 0 ? -1 : 1); return; }
    if (Math.hypot(dx, dy) > 10) return;
    if (trayOpen) { closeTray(); return; }
    const r = finder.getBoundingClientRect();
    $('#lock').classList.add('hidden');
    place(d.x - r.left, d.y - r.top);
    focusAt(d.x, d.y);
  });
  // arrastar o sol muda a exposição
  const sun = fx.querySelector('.sun');
  sun.querySelector('.ic-sun').append(icon('sun'));
  sun.addEventListener('pointerdown', e => {
    e.stopPropagation();
    evDrag = { y: e.clientY, ev };
    sun.setPointerCapture(e.pointerId);
    fx.classList.add('ev'); fx.classList.remove('dim');
    clearTimeout(dimT); clearTimeout(hideT);
  });
  sun.addEventListener('pointermove', e => {
    if (!evDrag) return;
    ev = Math.round(Math.min(2, Math.max(-2, evDrag.ev - (e.clientY - evDrag.y) / 60)) * 10) / 10;
    fx.style.setProperty('--ev', (ev / 2).toFixed(2));
    applyLook();
  });
  sun.addEventListener('pointerup', () => {
    evDrag = null;
    dimT = setTimeout(() => fx.classList.add('dim'), 1800);
    if ($('#lock').classList.contains('hidden')) hideT = setTimeout(() => fx.classList.add('hidden'), 4000);
  });
  // roda do mouse (ou pinça do touchpad) = zoom
  finder.addEventListener('wheel', e => {
    e.preventDefault();
    setZoom(zoom * Math.pow(1.0018, -e.deltaY * (e.ctrlKey ? 4 : 1)));
  }, { passive: false });
}
async function focusAt(cx, cy) {
  const t = stream?.getVideoTracks()[0];
  const caps = t?.getCapabilities?.() || {};
  const r = finder.getBoundingClientRect();
  let x = (cx - r.left) / r.width, y = (cy - r.top) / r.height;
  if (prefs.mirrorPreview) x = 1 - x;
  const adv = {};
  if (caps.focusMode?.includes('single-shot')) adv.focusMode = 'single-shot';
  if (caps.pointsOfInterest || 'pointsOfInterest' in (t?.getSettings?.() || {})) adv.pointsOfInterest = [{ x, y }];
  if (Object.keys(adv).length) t.applyConstraints({ advanced: [adv] }).catch(() => {});
}

// ============ trocar de câmera ============
async function flip() {
  const b = $('#b-flip');
  b.classList.toggle('turn');
  await listDevices();
  if (cameras.length < 2) { toast(cameras.length ? 'Só há uma câmera neste PC' : 'Nenhuma câmera'); return; }
  const cur = stream?.getVideoTracks()[0]?.getSettings?.().deviceId || prefs.deviceId;
  const i = cameras.findIndex(c => c.deviceId === cur);
  const n = cameras[(i + 1) % cameras.length];
  prefs.deviceId = n.deviceId; save();
  setZoom(1);
  await startCamera(true);
  toast(n.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)/i, '') || 'Câmera');
}

// ============ ajustes ============
async function openSettings() {
  await listDevices();
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const s = document.createElement('div'); s.className = 'sheet gl';
  const opt = (list, cur, fallback) => list.length
    ? list.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === cur ? 'selected' : ''}>${esc(d.label || `${fallback} ${i + 1}`)}</option>`).join('')
    : `<option value="">Nenhum</option>`;
  const sw = (k, label) => `<div class="row"><span class="lbl">${label}</span><button class="switch ${prefs[k] ? 'on' : ''}" data-k="${k}"></button></div>`;
  const dir = await api.rollDir();
  s.innerHTML = `
    <h2>Ajustes <button class="gl round" data-close title="Fechar">${svg('close')}</button></h2>
    <div class="grp-t">DISPOSITIVOS</div>
    <div class="grp">
      <div class="row"><span class="lbl">Câmera</span><select data-dev="cam">${opt(cameras, prefs.deviceId, 'Câmera')}</select></div>
      <div class="row"><span class="lbl">Microfone</span><select data-dev="mic">${opt(mics, prefs.micId || audioTrack?.getSettings?.().deviceId, 'Microfone')}</select></div>
    </div>
    <div class="grp-t">COMPOSIÇÃO</div>
    <div class="grp">
      ${sw('grid', 'Grade')}
      ${sw('mirrorPreview', 'Espelhar pré-visualização')}
      ${sw('mirrorSave', 'Espelhar câmera frontal nas fotos e vídeos')}
    </div>
    <div class="grp-t">CAPTURA</div>
    <div class="grp">
      ${sw('photoMax', 'Fotos na resolução máxima da webcam')}
      ${sw('sound', 'Som do obturador')}
    </div>
    <div class="grp-t">ROLO DA CÂMERA</div>
    <div class="grp">
      <div class="row btn" data-a="folder"><span class="lbl">${esc(dir)}</span><span class="val">Abrir ›</span></div>
    </div>
    <div class="foot">Espaço tira a foto · ← → trocam o modo · roda do mouse dá zoom · segure no visor para travar AE/AF</div>`;
  const close = () => { scrim.remove(); s.remove(); };
  scrim.onclick = close;
  s.onclick = async e => {
    if (e.target.closest('[data-close]')) return close();
    const k = e.target.closest('.switch')?.dataset.k;
    if (k) {
      prefs[k] = !prefs[k]; save();
      e.target.classList.toggle('on', prefs[k]);
      applyLook();
      if (k === 'photoMax') startCamera();
    }
    if (e.target.closest('[data-a="folder"]')) api.reveal();
  };
  s.onchange = e => {
    const d = e.target.dataset.dev;
    if (d === 'cam') { prefs.deviceId = e.target.value; save(); startCamera(true); }
    if (d === 'mic') { prefs.micId = e.target.value; save(); audioTrack?.stop(); audioTrack = null; if (prefs.mode === 'video') ensureMic(); }
  };
  document.body.append(scrim, s);
  settingsClose = close;
}
let settingsClose = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ============ teclado ============
addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea')) return;
  const viewer = !$('#viewer').classList.contains('hidden');
  if (viewer) return; // a galeria cuida das próprias teclas
  if (e.key === 'Escape') {
    if (document.querySelector('.sheet')) { settingsClose?.(); return; }
    if (countdown) { cancelCountdown(); return; }
    if (trayOpen) { closeTray(); return; }
  }
  if (document.querySelector('.sheet')) return;
  if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) shutter(); }
  else if (e.key === 'ArrowLeft') stepMode(-1);
  else if (e.key === 'ArrowRight') stepMode(1);
  else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.25, true);
  else if (e.key === '-') setZoom(zoom / 1.25, true);
});

// ============ início ============
async function init() {
  wireWindow();
  body.classList.remove('mode-foto');
  body.classList.add(`mode-${prefs.mode}`);
  $('#b-flip').append(icon('flip'));
  $('#b-pause').append(icon('pause'));
  $('#b-flash').onclick = cycleFlash;
  $('#b-live').onclick = toggleLive;
  $('#b-tray').onclick = toggleTray;
  $('#b-format').onclick = cycleFormat;
  $('#b-flip').onclick = flip;
  $('#b-snap').onclick = snapDuringVideo;
  $('#b-pause').onclick = togglePause;
  $('#shutter').onclick = shutter;
  $('#thumb').onclick = () => !rec && !tl && openViewer();
  renderTop();
  renderModes();
  renderZoom();
  applyLook();
  layout();
  wireFinder();
  // numeração continua de onde as fotos do rolo pararam
  try {
    const list = await api.list();
    const max = list.reduce((m, x) => Math.max(m, +(/^IMG_(\d{4})/i.exec(x.name)?.[1] || 0)), 0);
    if (max > prefs.counter) { prefs.counter = max; save(); }
  } catch {}
  latest();
  await startCamera(true);
  requestAnimationFrame(syncModes);
  navigator.mediaDevices?.addEventListener?.('devicechange', async () => {
    await listDevices();
    if (finder.querySelector('.nocam')) startCamera(true);
  });
  // a câmera para quando a janela é minimizada, como no celular, e volta ao reabrir
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !rec && !tl) { stopStream(); currentKey = ''; }
    else if (!document.hidden && !stream) startCamera(true);
  });
}
addEventListener('resize', () => requestAnimationFrame(syncModes));
init();

export { toast };

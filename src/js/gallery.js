// Miniatura do rolo e visualizador (o "Fotos" que abre ao tocar na miniatura).

import { api, mediaUrl } from './api.js';
import { icon, svg } from './icons.js';

const $ = s => document.querySelector(s);
const stem = n => n.replace(/\.[^.]+$/, '').toLowerCase();

// fotos com vídeo de mesmo nome são Live Photos: o vídeo não aparece sozinho
function group(list) {
  const imgs = new Map(list.filter(m => !m.video).map(m => [stem(m.name), m]));
  const out = [];
  for (const m of list) {
    if (m.video && imgs.has(stem(m.name))) { imgs.get(stem(m.name)).live = m; continue; }
    out.push(m);
  }
  return out;
}

// ---------- miniatura ----------
export function refreshThumb({ url, video, pop }) {
  const t = $('#thumb'), img = t.querySelector('img'), v = t.querySelector('video');
  if (video) {
    img.src = ''; img.style.display = 'none';
    v.style.display = 'block'; v.src = url;
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.1, v.duration || 0); } catch {} };
  } else {
    v.style.display = 'none'; v.removeAttribute('src');
    img.style.display = ''; img.src = url || '';
  }
  if (pop) { t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
}
export async function latest() {
  const items = group(await api.list());
  const m = items[0];
  if (!m) return refreshThumb({ url: '', video: false });
  refreshThumb({ url: mediaUrl(m), video: m.video });
}

// ---------- visualizador ----------
let items = [], idx = 0;
export async function openViewer() {
  items = group(await api.list());
  if (!items.length) return;
  idx = 0;
  const v = $('#viewer');
  v.classList.remove('hidden', 'out');
  wire();
  render();
}
function close() {
  const v = $('#viewer');
  v.querySelector('video')?.pause();
  v.classList.add('out');
  setTimeout(() => { v.classList.add('hidden'); v.querySelector('.v-media').innerHTML = ''; }, 300);
  latest();
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  $('#v-back').append(icon('chevLeft'));
  $('#v-folder').append(icon('folder'));
  $('#v-del').append(icon('trash'));
  $('.v-nav.prev').append(icon('chevLeft'));
  $('.v-nav.next').append(icon('chevRight'));
  $('#v-back').onclick = close;
  $('.v-nav.prev').onclick = () => go(idx + 1);
  $('.v-nav.next').onclick = () => go(idx - 1);
  $('#v-folder').onclick = () => api.reveal(items[idx]?.name);
  $('#v-open').onclick = () => api.open(items[idx]?.name);
  $('#v-del').onclick = askDelete;
  addEventListener('keydown', e => {
    if ($('#viewer').classList.contains('hidden')) return;
    if (document.querySelector('.v-alert')) { if (e.key === 'Escape') document.querySelector('.v-alert')?.dispatchEvent(new Event('cancel')); return; }
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(idx + 1);
    else if (e.key === 'ArrowRight') go(idx - 1);
    else if (e.key === 'Delete') askDelete();
  });
  $('.v-media').addEventListener('wheel', e => { if (Math.abs(e.deltaX) > 30) go(idx + (e.deltaX > 0 ? -1 : 1)); }, { passive: true });
}
function go(i) {
  if (i < 0 || i >= items.length || i === idx) return;
  idx = i;
  render();
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function dayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return `${d.getDate()} de ${MESES[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ` de ${d.getFullYear()}` : ''}`;
}

function render() {
  const m = items[idx];
  const box = $('.v-media');
  box.querySelector('video')?.pause();
  box.innerHTML = '';
  document.querySelector('.live-badge')?.remove();
  box.classList.toggle('is-video', !!m.video);
  if (m.video) {
    const v = document.createElement('video');
    v.src = mediaUrl(m); v.controls = true; v.autoplay = true; v.playsInline = true;
    box.append(v);
  } else {
    const img = document.createElement('img');
    img.src = mediaUrl(m); img.alt = m.name;
    box.append(img);
    if (m.live) {
      // passar o mouse em "AO VIVO" toca o movimento da Live Photo
      const b = document.createElement('button');
      b.className = 'live-badge gl capsule';
      b.innerHTML = `${svg('live')}AO VIVO`;
      const lv = document.createElement('video');
      lv.src = mediaUrl(m.live); lv.muted = true; lv.playsInline = true;
      lv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .25s';
      box.append(lv);
      const play = () => { lv.currentTime = 0; lv.style.opacity = 1; lv.play().catch(() => {}); };
      const stop = () => { lv.style.opacity = 0; lv.pause(); };
      b.onmouseenter = play; b.onmouseleave = stop;
      lv.onended = stop;
      $('#viewer').append(b);
      setTimeout(play, 250);
    }
  }
  const d = new Date(m.mtime);
  $('.v-title b').textContent = dayLabel(d);
  $('.v-title span').textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('.v-nav.prev').disabled = idx >= items.length - 1;
  $('.v-nav.next').disabled = idx <= 0;
  renderStrip();
}

function renderStrip() {
  const s = $('.v-strip');
  // mais antigas à esquerda, como no iPhone
  const order = items.map((m, i) => [m, i]).reverse();
  s.replaceChildren(...order.map(([m, i]) => {
    const b = document.createElement('button');
    b.classList.toggle('sel', i === idx);
    if (m.video) {
      const v = document.createElement('video');
      v.src = mediaUrl(m) + '#t=0.1'; v.muted = true; v.preload = 'metadata';
      v.style.cssText = 'width:100%;height:100%;object-fit:cover';
      b.append(v);
    } else {
      const img = document.createElement('img');
      img.loading = 'lazy'; img.src = mediaUrl(m);
      b.append(img);
    }
    b.onclick = () => go(i);
    return b;
  }));
  s.querySelector('.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function askDelete() {
  const m = items[idx];
  if (!m) return;
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  scrim.style.zIndex = 320;
  const a = document.createElement('div');
  a.className = 'sheet gl v-alert';
  a.style.cssText = 'width:300px;text-align:center;z-index:330;padding:22px 18px 16px';
  a.innerHTML = `<h2 style="justify-content:center;font-size:17px;margin:0 0 6px">${m.video ? 'Apagar Vídeo' : 'Apagar Foto'}</h2>
    <p style="margin:0 0 16px;color:var(--label-2);font-size:13.5px">O arquivo vai para a Lixeira do Windows.</p>
    <div style="display:flex;gap:10px">
      <button data-a="no" style="flex:1;height:44px;border-radius:999px;background:var(--fill-2);font-weight:600">Cancelar</button>
      <button data-a="yes" style="flex:1;height:44px;border-radius:999px;background:var(--red);font-weight:600">Apagar</button>
    </div>`;
  const done = () => { scrim.remove(); a.remove(); };
  scrim.onclick = done;
  a.addEventListener('cancel', done);
  a.onclick = async e => {
    const act = e.target.closest('[data-a]')?.dataset.a;
    if (act === 'no') done();
    if (act === 'yes') {
      done();
      $('.v-media video')?.pause();
      await api.remove(m.name);
      if (m.live) await api.remove(m.live.name);
      items.splice(idx, 1);
      if (!items.length) { close(); return; }
      idx = Math.min(idx, items.length - 1);
      render();
    }
  };
  document.body.append(scrim, a);
  a.querySelector('[data-a="yes"]').focus();
}

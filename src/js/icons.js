// Ícones desenhados no traço dos SF Symbols (24×24, linha 1,8).

const P = {
  bolt: '<path class="f" d="M13.4 2.2 5.6 13.1c-.3.4 0 .9.5.9h5l-1.4 7.4c-.1.6.6.9 1 .4l7.7-10.8c.3-.4 0-.9-.5-.9h-5.1l1.5-7.5c.1-.5-.6-.9-.9-.4Z"/>',
  boltSlash: '<path class="f" d="M13.4 2.2 9.6 7.5l7.3 7.3 1.9-2.6c.3-.4 0-.9-.5-.9h-5.1l1.5-7.5c.1-.5-.6-.9-.9-.4ZM7.8 10 5.6 13.1c-.3.4 0 .9.5.9h5l-1.4 7.4c-.1.6.6.9 1 .4l3.6-5Z"/><path d="M3.5 3.5l17 17"/>',
  boltA: '<path class="f" d="M11.4 2.2 4.6 11.8c-.3.4 0 .9.5.9h4.3L8.2 19.2c-.1.6.6.9 1 .4l6.6-9.3c.3-.4 0-.9-.5-.9h-4.3l1.3-6.8c.1-.5-.6-.8-.9-.4Z"/><path d="M16.2 22l2.3-6.4 2.3 6.4M17 20h3"/>',
  live: '<circle cx="12" cy="12" r="2.6" class="f"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="9.2" stroke-dasharray="1.2 2.4" stroke-width="1.6"/>',
  liveSlash: '<circle cx="12" cy="12" r="2.6" class="f"/><circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="9.2" stroke-dasharray="1.2 2.4" stroke-width="1.6"/><path d="M3.5 3.5l17 17" stroke-width="2"/>',
  chevUp: '<path d="M5.5 15 12 8.5l6.5 6.5" stroke-width="2.2"/>',
  chevLeft: '<path d="M15 4.5 7.5 12l7.5 7.5" stroke-width="2.2"/>',
  chevRight: '<path d="m9 4.5 7.5 7.5L9 19.5" stroke-width="2.2"/>',
  flip: '<path d="M4.5 9.5a8 8 0 0 1 14.2-3M19.5 14.5a8 8 0 0 1-14.2 3"/><path d="M18.9 2.8v3.9H15M5.1 21.2v-3.9H9"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4.2l2.6 1.6M9.5 2.5h5"/>',
  exposure: '<circle cx="12" cy="12" r="9"/><path d="M8.6 9.5h4M10.6 7.5v4M11.5 15.5h4"/>',
  styles: '<rect x="3" y="3" width="10.5" height="10.5" rx="2.6"/><rect x="10.5" y="10.5" width="10.5" height="10.5" rx="2.6" class="f" opacity=".9"/>',
  aspect: '<rect x="4" y="6" width="16" height="12" rx="2.4"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.8"/>',
  sun: '<circle cx="12" cy="12" r="4.2" class="f"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2h7.4A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/>',
  trash: '<path d="M4 6.5h16M9.5 6.5V4.8c0-.7.5-1.3 1.3-1.3h2.4c.8 0 1.3.6 1.3 1.3v1.7M6 6.5l.9 12.6c.1 1.3 1.1 2.4 2.4 2.4h5.4c1.3 0 2.3-1.1 2.4-2.4L18 6.5M10 10.5v7M14 10.5v7"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.2" class="f"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" class="f"/>',
  play: '<path class="f" d="M7.5 4.8v14.4c0 .8.9 1.3 1.6.8l11-7.2c.6-.4.6-1.2 0-1.6l-11-7.2c-.7-.5-1.6 0-1.6.8Z"/>',
  camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2l1.6-2.2c.3-.4.7-.6 1.2-.6h3.4c.5 0 .9.2 1.2.6L16.5 6h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/><circle cx="12" cy="12.8" r="3.8"/>',
  cameraSlash: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2l1.6-2.2c.3-.4.7-.6 1.2-.6h3.4c.5 0 .9.2 1.2.6L16.5 6h2A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/><path d="M2.5 2.5l19 19"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="2 2.2"/><path d="M9 7 3.5 17H9ZM15 7l5.5 10H15Z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke-width="2.2"/>',
  ellipsis: '<circle cx="5.5" cy="12" r="1.6" class="f"/><circle cx="12" cy="12" r="1.6" class="f"/><circle cx="18.5" cy="12" r="1.6" class="f"/>',
};

export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `ic ${cls}`.trim());
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || '';
  return s;
}
export const svg = (name, cls) => icon(name, cls).outerHTML;

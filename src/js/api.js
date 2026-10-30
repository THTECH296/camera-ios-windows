// Ponte com o Rust. No navegador comum o rolo da câmera fica só na memória (modo demonstração).

const T = window.__TAURI__;
export const native = !!T;
const invoke = (cmd, args, opts) => T.core.invoke(cmd, args, opts);

const mem = []; // demonstração: { name, video, mtime, url }

export const api = {
  async list() {
    if (native) return invoke('list_media');
    return mem.slice().sort((a, b) => b.mtime - a.mtime);
  },
  async save(name, blob) {
    if (native) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return invoke('save_media', bytes, { headers: { 'x-name': name } });
    }
    mem.push({ name, video: /\.(mp4|webm)$/i.test(name), size: blob.size, mtime: Date.now(), url: URL.createObjectURL(blob) });
    return name;
  },
  async remove(name) {
    if (native) return invoke('delete_media', { name });
    const i = mem.findIndex(m => m.name === name);
    if (i >= 0) { URL.revokeObjectURL(mem[i].url); mem.splice(i, 1); }
  },
  reveal: name => native && invoke('reveal', { name: name || null }),
  open: name => native && invoke('open_media', { name }),
  privacy: () => native && invoke('open_privacy'),
  rollDir: () => (native ? invoke('roll_dir') : Promise.resolve('Imagens\\Camera Roll')),
  win: native ? T.window.getCurrentWindow() : null,
};

export const mediaUrl = m => (native ? `http://midia.localhost/${encodeURIComponent(m.name)}?v=${m.mtime}` : m.url);

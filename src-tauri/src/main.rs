#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Câmera: a interface (webcam, captura e gravação) roda no WebView; aqui ficam só o rolo da câmera
// (Imagens\Camera Roll, a mesma pasta do app Câmera do Windows), a liberação da webcam e o protocolo
// que serve as fotos e vídeos para a galeria.

use serde::Serialize;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::OnceLock,
    time::UNIX_EPOCH,
};
use tauri::{
    http::{Request, Response},
    ipc::{InvokeBody, Request as IpcRequest},
    Manager, UriSchemeResponder,
};

const MEDIA_EXT: &[&str] = &["jpg", "jpeg", "png", "heic", "mp4", "webm", "mov"];
static ROLL: OnceLock<PathBuf> = OnceLock::new();

#[derive(Serialize)]
struct Media {
    name: String,
    video: bool,
    size: u64,
    mtime: i64,
}

fn roll() -> &'static PathBuf {
    ROLL.get_or_init(|| {
        let pics = std::env::var_os("USERPROFILE")
            .map(|h| PathBuf::from(h).join("Pictures"))
            .unwrap_or_else(|| PathBuf::from("."));
        let dir = pics.join("Camera Roll");
        let _ = fs::create_dir_all(&dir);
        dir
    })
}

fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}
fn is_video(ext: &str) -> bool {
    matches!(ext, "mp4" | "webm" | "mov")
}

/// Só nomes simples dentro do rolo: nada de "..", barras ou caminhos absolutos.
fn safe_path(name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.contains(['/', '\\', ':']) || name.contains("..") {
        return Err("Nome inválido".into());
    }
    if !MEDIA_EXT.contains(&ext_of(Path::new(name)).as_str()) {
        return Err("Tipo de arquivo não aceito".into());
    }
    Ok(roll().join(name))
}

#[tauri::command]
fn roll_dir() -> String {
    roll().to_string_lossy().to_string()
}

#[tauri::command]
fn list_media() -> Vec<Media> {
    let mut out: Vec<Media> = fs::read_dir(roll())
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let ext = ext_of(&p);
            if !MEDIA_EXT.contains(&ext.as_str()) {
                return None;
            }
            let md = e.metadata().ok()?;
            if !md.is_file() {
                return None;
            }
            let mtime = md.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as i64;
            Some(Media { name: e.file_name().to_string_lossy().to_string(), video: is_video(&ext), size: md.len(), mtime })
        })
        .collect();
    out.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    out
}

/// Recebe o arquivo cru (sem JSON) e o nome no cabeçalho "x-name".
#[tauri::command]
fn save_media(request: IpcRequest<'_>) -> Result<String, String> {
    let name = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or("Falta o nome")?;
    let InvokeBody::Raw(bytes) = request.body() else { return Err("Corpo inválido".into()) };
    let mut path = safe_path(&name)?;
    // nunca sobrescreve: IMG_0001 (2).jpg
    let mut n = 2;
    while path.exists() {
        let p = Path::new(&name);
        let stem = p.file_stem().unwrap().to_string_lossy();
        path = roll().join(format!("{stem} ({n}).{}", ext_of(p)));
        n += 1;
    }
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.file_name().unwrap().to_string_lossy().to_string())
}

#[tauri::command]
fn delete_media(name: String) -> Result<(), String> {
    trash::delete(safe_path(&name)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal(name: Option<String>) {
    let mut cmd = std::process::Command::new("explorer");
    match name.and_then(|n| safe_path(&n).ok()) {
        Some(p) => cmd.arg(format!("/select,{}", p.display())),
        None => cmd.arg(roll()),
    };
    let _ = cmd.spawn();
}

#[tauri::command]
fn open_media(name: String) -> Result<(), String> {
    let p = safe_path(&name)?;
    std::process::Command::new("cmd")
        .args(["/c", "start", ""])
        .arg(p)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_privacy() {
    let _ = std::process::Command::new("cmd").args(["/c", "start", "", "ms-settings:privacy-webcam"]).spawn();
}

fn mime(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "heic" => "image/heic",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

/// http://midia.localhost/<nome> — com Range, para o vídeo poder avançar.
fn media_protocol(req: Request<Vec<u8>>, r: UriSchemeResponder) {
    std::thread::spawn(move || {
        let fail = |code: u16| Response::builder().status(code).body(Vec::new()).unwrap();
        let raw = req.uri().path().trim_start_matches('/').to_string();
        let name = percent_decode(&raw);
        let Ok(path) = safe_path(&name) else { return r.respond(fail(400)) };
        let Ok(mut f) = fs::File::open(&path) else { return r.respond(fail(404)) };
        let len = f.metadata().map(|m| m.len()).unwrap_or(0);
        let ct = mime(&ext_of(&path));
        let range = req
            .headers()
            .get("range")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("bytes="))
            .and_then(|v| {
                let (a, b) = v.split_once('-')?;
                let start: u64 = a.parse().ok()?;
                let end: u64 = if b.is_empty() { (start + 4 * 1024 * 1024).min(len) - 1 } else { b.parse().ok()? };
                Some((start, end.min(len.saturating_sub(1))))
            });
        let resp = match range {
            Some((s, e)) if s <= e && len > 0 => {
                let mut buf = vec![0; (e - s + 1) as usize];
                if f.seek(SeekFrom::Start(s)).is_err() || f.read_exact(&mut buf).is_err() {
                    return r.respond(fail(416));
                }
                Response::builder()
                    .status(206)
                    .header("Content-Type", ct)
                    .header("Accept-Ranges", "bytes")
                    .header("Content-Range", format!("bytes {s}-{e}/{len}"))
                    .header("Access-Control-Allow-Origin", "*")
                    .body(buf)
            }
            _ => {
                let mut buf = Vec::with_capacity(len as usize);
                let _ = f.read_to_end(&mut buf);
                Response::builder()
                    .header("Content-Type", ct)
                    .header("Accept-Ranges", "bytes")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(buf)
            }
        };
        r.respond(resp.unwrap());
    });
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// O WebView2 pergunta toda vez se pode usar a câmera e o microfone; no nosso próprio app, sempre pode.
#[cfg(windows)]
fn allow_camera(w: &tauri::WebviewWindow) {
    let _ = w.with_webview(|wv| unsafe {
        use webview2_com::{Microsoft::Web::WebView2::Win32::*, PermissionRequestedEventHandler};
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let mut token = 0i64;
        let _ = core.add_PermissionRequested(
            &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
                Ok(())
            })),
            &mut token,
        );
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .register_asynchronous_uri_scheme_protocol("midia", |_c, req, r| media_protocol(req, r))
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                #[cfg(windows)]
                allow_camera(&w);
            }
            let h = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(2500));
                if let Some(w) = h.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![roll_dir, list_media, save_media, delete_media, reveal, open_media, open_privacy])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a Câmera");
}

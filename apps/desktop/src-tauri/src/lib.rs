use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::WebviewWindowBuilder,
    Manager, WebviewUrl,
};
use tauri_plugin_deep_link::DeepLinkExt;

/// Port the embedded Next.js server listens on.
const SERVER_PORT: u16 = 19283;

/// Maximum time to wait for the server to become ready.
const SERVER_STARTUP_TIMEOUT: Duration = Duration::from_secs(15);

/// Holds the child process handle so we can kill it on exit.
struct ServerProcess(Option<Child>);

impl Drop for ServerProcess {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.0 {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Resolve the path to the bundled Node.js binary.
///
/// Production layout (current): node lives inside `resources/server/NodeSidecar.app/Contents/MacOS/node`
/// on macOS (so `LSUIElement=1` in the wrapper's Info.plist suppresses the Dock icon),
/// or `resources/server/bin/node[.exe]` on Linux/Windows.
///
/// Legacy fallback: older builds placed it at `Contents/MacOS/node` next to the
/// app executable via Tauri `externalBin`. Kept for backwards compatibility with
/// installs that haven't been replaced yet.
///
/// In development, falls back to `src-tauri/binaries/` or system node.
fn resolve_node_binary(app: &tauri::App) -> Result<std::path::PathBuf, String> {
    // Production (current layout): wrapped sidecar inside the resources tree
    if let Ok(resource_dir) = app.path().resource_dir() {
        let wrapped_macos = resource_dir
            .join("resources/server/NodeSidecar.app/Contents/MacOS/node");
        if wrapped_macos.exists() {
            return Ok(wrapped_macos);
        }
        let bin_unix = resource_dir.join("resources/server/bin/node");
        if bin_unix.exists() {
            return Ok(bin_unix);
        }
        let bin_win = resource_dir.join("resources/server/bin/node.exe");
        if bin_win.exists() {
            return Ok(bin_win);
        }
    }

    // Legacy fallback: pre-wrapper builds placed node at Contents/MacOS/ via externalBin.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let candidates = [exe_dir.join("node"), exe_dir.join("node.exe")];
            for candidate in &candidates {
                if candidate.exists() {
                    return Ok(candidate.clone());
                }
            }
        }
    }

    // Try resource dir root (some Tauri versions place it there)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [resource_dir.join("node"), resource_dir.join("node.exe")];
        for candidate in &candidates {
            if candidate.exists() {
                return Ok(candidate.clone());
            }
        }

        // Development: look in src-tauri/binaries/
        let bin_dir = resource_dir.join("binaries");
        if bin_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&bin_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with("node-") {
                        return Ok(entry.path());
                    }
                }
            }
        }
    }

    // Last resort: use system node (for development)
    let which_cmd = if cfg!(windows) { "where" } else { "which" };
    if let Ok(output) = Command::new(which_cmd).arg("node").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() {
                return Ok(std::path::PathBuf::from(path));
            }
        }
    }

    Err("Node.js binary not found. Run: node scripts/download-node-binary.mjs".into())
}

/// Resolve the path to the bundled Next.js standalone server.
/// Tauri bundles resources at Contents/Resources/ on macOS. When configured as
/// `"resources": ["resources/"]`, files end up at Contents/Resources/resources/.
fn resolve_server_dir(app: &tauri::App) -> Result<std::path::PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource dir: {e}"))?;

    // Tauri nests our "resources/" folder under the app resource dir
    let candidates = [
        resource_dir.join("resources/server"),
        resource_dir.join("server"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    // Development: not bundled, the web dev server should be running separately
    Err(format!(
        "Server resources not found (checked: {}). In development, run `pnpm dev:web` separately.",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

/// Find the server.js entry point within the standalone output.
/// Next.js standalone places it at: standalone/apps/web/server.js (monorepo)
/// or standalone/server.js (single app).
fn find_server_js(server_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    // Monorepo standalone output structure: standalone/apps/web/server.js
    let monorepo_path = server_dir.join("apps/web/server.js");
    if monorepo_path.exists() {
        return Ok(monorepo_path);
    }

    // Single-app structure: standalone/server.js
    let root_path = server_dir.join("server.js");
    if root_path.exists() {
        return Ok(root_path);
    }

    Err(format!(
        "server.js not found in {}. Expected at apps/web/server.js or server.js",
        server_dir.display()
    ))
}

/// Spawn the Next.js standalone server as a child process.
fn spawn_server(app: &tauri::App) -> Result<Child, String> {
    let node_bin = resolve_node_binary(app)?;
    let server_dir = resolve_server_dir(app)?;
    let server_js = find_server_js(&server_dir)?;

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource dir: {e}"))?;

    println!(
        "[omnitool] Starting server: {} {}",
        node_bin.display(),
        server_js.display()
    );
    println!("[omnitool] Server port: {SERVER_PORT}");

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&server_js)
        // Set working directory to the standalone root (required for module resolution)
        .current_dir(&server_dir)
        .env("PORT", SERVER_PORT.to_string())
        .env("HOSTNAME", "localhost")
        .env("NODE_ENV", "production")
        // Prevent Next.js telemetry in desktop app
        .env("NEXT_TELEMETRY_DISABLED", "1");

    // Load server.env from the resources directory (may be nested under resources/)
    let env_file_candidates = [
        resource_dir.join("resources/server.env"),
        resource_dir.join("server.env"),
    ];
    let env_file = env_file_candidates.iter().find(|p| p.exists());
    if let Some(env_file) = env_file {
        if let Ok(contents) = std::fs::read_to_string(&env_file) {
            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    let key = key.trim();
                    let value = value.trim();
                    // Strip matching outer quotes only
                    let value = if (value.starts_with('"') && value.ends_with('"'))
                        || (value.starts_with('\'') && value.ends_with('\''))
                    {
                        &value[1..value.len() - 1]
                    } else {
                        value
                    };
                    cmd.env(key, value);
                }
            }
        }
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to spawn server: {e}"))
}

/// Wait for the server to respond to health checks.
fn wait_for_server_ready() -> bool {
    let url = format!("http://localhost:{SERVER_PORT}/api/ready");
    let start = Instant::now();

    while start.elapsed() < SERVER_STARTUP_TIMEOUT {
        if let Ok(response) = ureq::get(&url).call() {
            if response.status() == 200 {
                println!("[omnitool] Server ready in {:?}", start.elapsed());
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    eprintln!(
        "[omnitool] Server failed to become ready within {:?}",
        SERVER_STARTUP_TIMEOUT
    );
    false
}

// ─── Tests ──────────────────────────────────────────────────────────────
//
// Lightweight Rust-side unit tests. We don't spin up a real Tauri runtime
// here — that requires a windowing display and is reserved for full E2E.
// These tests cover pure helper logic and string contracts that don't
// depend on the runtime.
#[cfg(test)]
mod tests {
    use super::SERVER_PORT;

    /// The sidecar port is hard-coded throughout the codebase (CSP allowlist,
    /// app-shell splash JS, ship:desktop script, capabilities/default.json
    /// remote-urls). Bump this constant only when you also update those.
    #[test]
    fn server_port_is_19283() {
        assert_eq!(SERVER_PORT, 19283);
    }

    /// `omnitool://` must be in CFBundleURLSchemes (Info.plist) for deep
    /// links to land on the app. The deep-link plugin config in
    /// tauri.conf.json drives this — guard against accidental rename.
    #[test]
    fn deep_link_scheme_exists_in_config() {
        let config = include_str!("../tauri.conf.json");
        assert!(
            config.contains("\"omnitool\""),
            "tauri.conf.json must register the `omnitool` deep-link scheme"
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Focus existing window when a second instance is attempted
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // ── Spawn the Next.js sidecar server ────────────
            let server_result = spawn_server(app);
            match server_result {
                Ok(child) => {
                    app.manage(Mutex::new(ServerProcess(Some(child))));
                    // Don't block the UI — the splash screen polls for readiness.
                    // But do a quick background check so we can log timing.
                    std::thread::spawn(|| {
                        wait_for_server_ready();
                    });
                }
                Err(err) => {
                    eprintln!("[omnitool] Server spawn failed: {err}");
                    eprintln!("[omnitool] App will load splash screen (server unavailable).");
                    // Still manage a None process so the type is satisfied
                    app.manage(Mutex::new(ServerProcess(None)));
                }
            }

            // ── Create main window with navigation interception ──────
            // External URLs (OAuth providers like GitHub, Notion) open in the
            // system browser so users can use their existing sessions.
            //
            // Dev: load from the web dev server (already running on :3000)
            // Production: load the embedded splash page (polls server, navigates when ready)
            let frontend_url = if cfg!(debug_assertions) {
                WebviewUrl::External("http://localhost:3000".parse().unwrap())
            } else {
                // Embedded splash HTML from frontendDist (app-shell/index.html)
                WebviewUrl::App("index.html".into())
            };

            let _main_window = WebviewWindowBuilder::new(app, "main", frontend_url)
                .title("OmniTool")
                .inner_size(1120.0, 740.0)
                .min_inner_size(860.0, 600.0)
                .center()
                .resizable(true)
                // Disable Tauri's native file-drop handler so HTML5
                // drag-and-drop events (dragstart/dragover/drop) reach the
                // webview. Without this, ProseMirror / BlockNote drag is
                // intercepted at the OS level — blocks highlight when
                // grabbed but never move.
                .disable_drag_drop_handler()
                .on_navigation(move |url| {
                    let host = url.host_str().unwrap_or("");
                    let scheme = url.scheme();

                    println!("[omnitool] Navigation: {url}");

                    // Allow: local app server, tauri internal, about:blank, data:
                    if scheme == "tauri" || scheme == "about" || scheme == "data" {
                        return true;
                    }
                    if host == "localhost" || host == "127.0.0.1" {
                        return true;
                    }
                    // Allow Supabase auth domains (needed for session)
                    if host.ends_with(".supabase.co") {
                        return true;
                    }

                    // External URL (GitHub, Notion, etc.) — open in system browser
                    println!("[omnitool] Opening external URL in browser: {url}");
                    let _ = open::that(url.as_str());
                    false // Cancel webview navigation
                })
                .build()?;

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                println!("[omnitool] Deep link opened: {:?}", event.urls());
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

            // ── System Tray ──────────────────────────────
            let show_item = MenuItem::with_id(app, "show", "Show OmniTool", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        // Kill the server process before exiting
                        if let Some(state) = app.try_state::<Mutex<ServerProcess>>() {
                            if let Ok(mut guard) = state.lock() {
                                if let Some(ref mut child) = guard.0 {
                                    let _ = child.kill();
                                }
                            }
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OmniTool desktop shell");
}

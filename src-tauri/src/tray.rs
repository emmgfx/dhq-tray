use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, LogicalPosition, Manager, Monitor, WebviewWindow};

use std::sync::atomic::Ordering;

use crate::running_deployments_poller;
use crate::state::AppState;

pub const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "main";
const QUIT_MENU_ID: &str = "quit";

pub fn setup(app: &App) -> tauri::Result<()> {
    let quit_item = MenuItem::with_id(app, QUIT_MENU_ID, "Quit DHQ Tray", true, Some("Cmd+Q"))?;
    let menu = Menu::with_items(app, &[&quit_item])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(idle_icon())
        .icon_as_template(true)
        .tooltip("DHQ Tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id() == QUIT_MENU_ID {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn idle_icon() -> Image<'static> {
    tauri::include_image!("icons/tray-icon.png")
}

fn deploying_icon() -> Image<'static> {
    tauri::include_image!("icons/tray-icon-deploying.png")
}

fn failed_icon() -> Image<'static> {
    tauri::include_image!("icons/tray-icon-failed.png")
}

/// Shows whether a deployment failed unseen, one is running, or all is quiet.
/// Call whenever tracked deployments or the unseen-failure flag change.
pub fn refresh_icon(app: &AppHandle) {
    let state = app.state::<AppState>();
    let has_unseen_failure = state.has_unseen_failure.load(Ordering::SeqCst);
    // The lock is released before touching the tray, which waits on the main thread.
    let is_deploying = state
        .tracked_deployments
        .lock()
        .unwrap()
        .values()
        .any(|watched| !watched.deployment.is_finished());
    let icon = if has_unseen_failure {
        failed_icon()
    } else if is_deploying {
        deploying_icon()
    } else {
        idle_icon()
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        // Setting icon and template flag separately renders twice and flickers on macOS.
        let _ = tray.set_icon_with_as_template(Some(icon), true);
    }
}

struct TrayIconBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    monitor: Monitor,
}

impl TrayIconBounds {
    fn contains(&self, point: LogicalPosition<f64>) -> bool {
        (self.x..=self.x + self.width).contains(&point.x)
            && (self.y..=self.y + self.height).contains(&point.y)
    }
}

/// Cursor in global logical coordinates. Tauri reports it as logical points
/// scaled by the primary monitor's factor, so that factor undoes it exactly.
fn cursor_logical_position(app: &AppHandle) -> Option<LogicalPosition<f64>> {
    let scale_factor = app.primary_monitor().ok()??.scale_factor();
    Some(app.cursor_position().ok()?.to_logical(scale_factor))
}

/// Tray icon bounds in global logical coordinates.
///
/// tray-icon reports the icon rect as logical points scaled by the factor of
/// the screen the icon is on, which is not known. With displays of different
/// scale (e.g. Retina + external 1x) each screen's factor yields a candidate;
/// the right one is the candidate under the cursor, as the cursor is on the
/// icon when it is clicked.
fn tray_icon_bounds(
    app: &AppHandle,
    cursor: Option<LogicalPosition<f64>>,
) -> Option<TrayIconBounds> {
    let rect = app.tray_by_id(TRAY_ID)?.rect().ok()??;
    // Values are already physical; the scale passed here is ignored.
    let position = rect.position.to_physical::<f64>(1.0);
    let size = rect.size.to_physical::<f64>(1.0);

    let candidates: Vec<TrayIconBounds> = app
        .available_monitors()
        .ok()?
        .into_iter()
        .filter_map(|monitor| {
            let scale_factor = monitor.scale_factor();
            let icon_position = position.to_logical::<f64>(scale_factor);
            let icon_size = size.to_logical::<f64>(scale_factor);
            let screen_origin = monitor.position().to_logical::<f64>(scale_factor);
            let screen_size = monitor.size().to_logical::<f64>(scale_factor);
            let is_on_screen = (screen_origin.x..screen_origin.x + screen_size.width)
                .contains(&icon_position.x)
                && (screen_origin.y..screen_origin.y + screen_size.height)
                    .contains(&icon_position.y);
            is_on_screen.then_some(TrayIconBounds {
                x: icon_position.x,
                y: icon_position.y,
                width: icon_size.width,
                height: icon_size.height,
                monitor,
            })
        })
        .collect();

    let under_cursor =
        cursor.and_then(|cursor| candidates.iter().position(|icon| icon.contains(cursor)));
    candidates.into_iter().nth(under_cursor.unwrap_or(0))
}

pub fn is_cursor_over_tray_icon(app: &AppHandle) -> bool {
    let Some(cursor) = cursor_logical_position(app) else {
        return false;
    };
    tray_icon_bounds(app, Some(cursor)).is_some_and(|icon| icon.contains(cursor))
}

/// Places the window centered under the tray icon, kept inside the icon's screen.
fn move_window_below_tray_icon(app: &AppHandle, window: &WebviewWindow) {
    const SCREEN_EDGE_MARGIN: f64 = 8.0;
    let Some(icon) = tray_icon_bounds(app, cursor_logical_position(app)) else {
        return;
    };
    let (Ok(window_size), Ok(window_scale_factor)) = (window.outer_size(), window.scale_factor())
    else {
        return;
    };
    let window_size = window_size.to_logical::<f64>(window_scale_factor);
    let screen_scale_factor = icon.monitor.scale_factor();
    let screen_origin = icon.monitor.position().to_logical::<f64>(screen_scale_factor);
    let screen_size = icon.monitor.size().to_logical::<f64>(screen_scale_factor);

    let min_x = screen_origin.x + SCREEN_EDGE_MARGIN;
    let max_x = screen_origin.x + screen_size.width - window_size.width - SCREEN_EDGE_MARGIN;
    let x = (icon.x + icon.width / 2.0 - window_size.width / 2.0).clamp(min_x, max_x.max(min_x));
    let y = icon.y + icon.height;
    let _ = window.set_position(LogicalPosition::new(x, y));
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide_panel(&window);
        return;
    }
    show_main_window(app);
}

/// Opens the panel under the tray icon (also when a notification is clicked).
pub fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    // Opening the panel counts as seeing any failure.
    app.state::<AppState>()
        .has_unseen_failure
        .store(false, Ordering::SeqCst);
    refresh_icon(app);
    if window.is_visible().unwrap_or(false) {
        return;
    }
    running_deployments_poller::mark_active(app);
    move_window_below_tray_icon(app, &window);
    show_with_fade_in(&window);
}

pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        hide_panel(&window);
    }
}

/// Hides the panel and the app with it. Hiding only the window would leave
/// the app active, so macOS would treat it as frontmost: notification banners
/// get suppressed and the previous app does not get the keyboard back.
pub fn hide_panel(window: &WebviewWindow) {
    let _ = window.hide();
    #[cfg(target_os = "macos")]
    let _ = window.run_on_main_thread(|| {
        use objc2::{class, msg_send, runtime::AnyObject};
        // SAFETY: NSApplication is used on the main thread, as AppKit requires.
        unsafe {
            let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![&*ns_app, hide: std::ptr::null::<AnyObject>()];
        }
    });
}

/// Shows the window fading it in like native menu bar panels. Animating the
/// NSWindow alpha (not the page) also fades the vibrancy material.
fn show_with_fade_in(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    if let Ok(ns_window) = window.ns_window() {
        use objc2::{msg_send, runtime::AnyObject};
        // SAFETY: `ns_window` is this window's live NSWindow, and tray events run
        // on the main thread, where AppKit must be used.
        unsafe {
            // The app may have been hidden along with the panel (see `hide_panel`).
            let ns_app: *mut AnyObject = msg_send![objc2::class!(NSApplication), sharedApplication];
            let _: () = msg_send![&*ns_app, unhide: std::ptr::null::<AnyObject>()];
            let ns_window = &*(ns_window as *mut AnyObject);
            let _: () = msg_send![ns_window, setAlphaValue: 0.0_f64];
            let _ = window.show();
            let _ = window.set_focus();
            let animator: *mut AnyObject = msg_send![ns_window, animator];
            let _: () = msg_send![&*animator, setAlphaValue: 1.0_f64];
        }
        return;
    }
    let _ = window.show();
    let _ = window.set_focus();
}

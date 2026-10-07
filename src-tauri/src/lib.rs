mod api_activity;
mod commands;
mod config_store;
mod credentials;
mod deployhq;
mod deployment_watcher;
mod error;
mod notifications;
mod preferences;
mod running_deployments_poller;
mod state;
mod tray;
mod user_activity;
mod watched_projects;

use tauri::{Manager, RunEvent, WindowEvent};

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(AppState::new())
        .setup(|app| {
            // Menu bar only: no Dock icon, no app menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let state = app.state::<AppState>();
            state.set_watched_projects(watched_projects::load(app.handle()).unwrap_or_else(
                |error| {
                    eprintln!("Could not load watched projects: {error}");
                    Vec::new()
                },
            ));
            state.set_preferences(preferences::load(app.handle()).unwrap_or_else(|error| {
                eprintln!("Could not load preferences: {error}");
                Default::default()
            }));
            state.api_activity.attach(app.handle().clone());
            tray::setup(app)?;
            running_deployments_poller::start(app.handle());
            notifications::request_permission();
            notifications::run_self_test_if_requested();
            Ok(())
        })
        .on_window_event(|window, event| {
            // Behave like a popover: close when clicking anywhere else.
            // Clicks on the tray icon also blur the window before the click event
            // arrives; those are left to the tray click handler so it can toggle.
            if window.label() == tray::MAIN_WINDOW_LABEL {
                if let WindowEvent::Focused(false) = event {
                    if !tray::is_cursor_over_tray_icon(window.app_handle()) {
                        let app = window.app_handle();
                        if let Some(window) = app.get_webview_window(window.label()) {
                            tray::hide_panel(&window);
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_credentials,
            commands::clear_credentials,
            commands::list_projects,
            commands::list_deploy_targets,
            commands::trigger_deployment,
            commands::list_watched_projects,
            commands::set_project_watched,
            commands::list_tracked_deployments,
            commands::get_preferences,
            commands::set_preferences,
            commands::quit_app,
            commands::hide_window,
            commands::notification_permission,
            commands::send_test_notification,
            commands::open_notification_settings,
            commands::list_recent_commits,
            commands::list_recent_deployments,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Keep running in the menu bar when the window is closed.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

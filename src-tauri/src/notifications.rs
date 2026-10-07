//! Native notifications through UNUserNotificationCenter (via notify-rust).
//!
//! macOS only authorizes that API for properly signed apps; ad-hoc signed
//! builds get UNErrorDomain error 1 (and the legacy NSUserNotificationCenter
//! accepts notifications but never shows them). Those builds fall back to
//! AppleScript's `display notification`, shown under Script Editor's name.
//! Delivery happens off the calling thread and failures are logged, since
//! nothing upstream would surface them.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

/// Set once macOS grants UNUserNotificationCenter authorization.
static IS_MODERN_API_AUTHORIZED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationPermission {
    Authorized,
    Denied,
    NotDetermined,
    Unknown,
}

/// Asks macOS for permission once; later calls return the stored decision.
/// Called directly (not through notify-rust) to log the NSError macOS gives
/// when it refuses, which the library drops.
pub fn request_permission() {
    #[cfg(target_os = "macos")]
    {
        use block2::RcBlock;
        use objc2::runtime::Bool;
        use objc2_foundation::NSError;
        use objc2_user_notifications::{UNAuthorizationOptions, UNUserNotificationCenter};

        let center = UNUserNotificationCenter::currentNotificationCenter();
        let completion = RcBlock::new(|granted: Bool, error: *mut NSError| {
            // SAFETY: macOS passes either null or a valid NSError.
            let error = unsafe { error.as_ref() };
            IS_MODERN_API_AUTHORIZED.store(granted.as_bool(), Ordering::SeqCst);
            match error {
                Some(error) => eprintln!(
                    "Notification permission granted: {}, error: {} ({} {})",
                    granted.as_bool(),
                    error.localizedDescription(),
                    error.domain(),
                    error.code(),
                ),
                None => eprintln!("Notification permission granted: {}", granted.as_bool()),
            }
        });
        center.requestAuthorizationWithOptions_completionHandler(
            UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
            &completion,
        );
    }
}

pub fn permission() -> NotificationPermission {
    #[cfg(target_os = "macos")]
    {
        use mac_usernotifications::AuthorizationStatus;
        return match notify_rust::get_notification_settings_blocking() {
            Ok(settings) => match settings.authorization_status {
                AuthorizationStatus::Authorized
                | AuthorizationStatus::Provisional
                | AuthorizationStatus::Ephemeral => NotificationPermission::Authorized,
                AuthorizationStatus::Denied => NotificationPermission::Denied,
                AuthorizationStatus::NotDetermined => NotificationPermission::NotDetermined,
                _ => NotificationPermission::Unknown,
            },
            Err(error) => {
                eprintln!("Could not read notification settings: {error}");
                NotificationPermission::Unknown
            }
        };
    }
    #[allow(unreachable_code)]
    NotificationPermission::Unknown
}

/// Shows a notification; `sound` is a macOS system sound name (e.g. "Glass").
pub fn show(title: &str, body: &str, sound: Option<&str>) {
    #[cfg(target_os = "macos")]
    if !IS_MODERN_API_AUTHORIZED.load(Ordering::SeqCst) {
        show_with_apple_script(title, body, sound);
        return;
    }
    let mut notification = notify_rust::Notification::new();
    notification.summary(title).body(body);
    if let Some(sound) = sound {
        notification.sound_name(sound);
    }
    std::thread::spawn(move || {
        if let Err(error) = notification.show() {
            eprintln!("Could not show notification: {error}");
        }
    });
}

#[cfg(target_os = "macos")]
fn show_with_apple_script(title: &str, body: &str, sound: Option<&str>) {
    // Texts go in as arguments, never into the script source, so quotes in
    // project or server names cannot break it.
    let display = match sound {
        Some(_) => concat!(
            "display notification (item 2 of argv) with title (item 1 of argv)",
            " sound name (item 3 of argv)"
        ),
        None => "display notification (item 2 of argv) with title (item 1 of argv)",
    };
    let mut command = std::process::Command::new("osascript");
    command
        .args(["-e", "on run argv", "-e", display, "-e", "end run"])
        .args([title, body]);
    if let Some(sound) = sound {
        command.arg(sound);
    }
    std::thread::spawn(move || match command.output() {
        Ok(output) if !output.status.success() => eprintln!(
            "Could not show notification (AppleScript): {}",
            String::from_utf8_lossy(&output.stderr)
        ),
        Ok(_) => {}
        Err(error) => eprintln!("Could not run osascript: {error}"),
    });
}

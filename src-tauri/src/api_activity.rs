//! Counts in-flight DeployHQ requests and reflects them in the tray icon.

use std::sync::{Mutex, OnceLock};

use tauri::AppHandle;

use crate::tray;

#[derive(Default)]
pub struct ApiActivity {
    // A mutex rather than an atomic so tray updates are dispatched in the same
    // order as the counter changes; otherwise a late "busy" could stick.
    in_flight_requests: Mutex<usize>,
    app: OnceLock<AppHandle>,
}

impl ApiActivity {
    pub fn attach(&self, app: AppHandle) {
        let _ = self.app.set(app);
    }

    /// Marks a request as in flight until the returned guard is dropped.
    pub fn track(&self) -> ApiActivityGuard<'_> {
        let mut in_flight_requests = self.in_flight_requests.lock().unwrap();
        *in_flight_requests += 1;
        if *in_flight_requests == 1 {
            self.update_tray(true);
        }
        ApiActivityGuard { activity: self }
    }

    fn update_tray(&self, is_busy: bool) {
        if let Some(app) = self.app.get() {
            tray::set_busy(app, is_busy);
        }
    }
}

pub struct ApiActivityGuard<'a> {
    activity: &'a ApiActivity,
}

impl Drop for ApiActivityGuard<'_> {
    fn drop(&mut self) {
        let mut in_flight_requests = self.activity.in_flight_requests.lock().unwrap();
        *in_flight_requests -= 1;
        if *in_flight_requests == 0 {
            self.activity.update_tray(false);
        }
    }
}

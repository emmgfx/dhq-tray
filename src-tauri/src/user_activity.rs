//! Detects when the user is away, so background polling can stop.

use std::time::Duration;

/// No keyboard/mouse input for this long counts as away.
const AWAY_THRESHOLD: Duration = Duration::from_secs(5 * 60);

#[cfg(target_os = "macos")]
fn time_since_last_input() -> Duration {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
    }
    const COMBINED_SESSION_STATE: i32 = 0; // kCGEventSourceStateCombinedSessionState
    const ANY_INPUT_EVENT_TYPE: u32 = u32::MAX; // kCGAnyInputEventType

    // SAFETY: plain C function with value arguments and no side effects.
    let seconds =
        unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT_TYPE) };
    Duration::from_secs_f64(seconds.max(0.0))
}

#[cfg(not(target_os = "macos"))]
fn time_since_last_input() -> Duration {
    Duration::ZERO
}

pub fn is_user_away() -> bool {
    time_since_last_input() >= AWAY_THRESHOLD
}

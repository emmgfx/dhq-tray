//! Shared view of how DeployHQ is coping: when it answers 429/503 (rate limit
//! or busy), background polling pauses for a while, doubling the pause on
//! repeated throttling. User-initiated requests still go through.

use std::sync::Mutex;
use std::time::{Duration, SystemTime};

const FIRST_BACKOFF: Duration = Duration::from_secs(30);
const MAX_BACKOFF: Duration = Duration::from_secs(15 * 60);

#[derive(Default)]
pub struct ApiHealth {
    backoff: Mutex<Backoff>,
}

#[derive(Default)]
struct Backoff {
    until: Option<SystemTime>,
    consecutive_throttles: u32,
}

impl ApiHealth {
    /// DeployHQ throttled a request; `retry_after` is its `Retry-After`, if any.
    pub fn record_throttled(&self, retry_after: Option<Duration>) {
        let mut backoff = self.backoff.lock().unwrap();
        backoff.consecutive_throttles += 1;
        let delay = backoff_delay(backoff.consecutive_throttles).max(retry_after.unwrap_or_default());
        backoff.until = Some(SystemTime::now() + delay);
        eprintln!("DeployHQ is throttling; pausing background polling for {delay:?}");
    }

    pub fn record_success(&self) {
        let mut backoff = self.backoff.lock().unwrap();
        backoff.consecutive_throttles = 0;
        backoff.until = None;
    }

    /// Whether background polling should skip DeployHQ for now.
    pub fn is_backing_off(&self) -> bool {
        self.backoff
            .lock()
            .unwrap()
            .until
            .is_some_and(|until| SystemTime::now() < until)
    }
}

/// 30 s, 1 min, 2 min… up to 15 min for the n-th consecutive throttle (n ≥ 1).
fn backoff_delay(consecutive_throttles: u32) -> Duration {
    let doublings = consecutive_throttles.saturating_sub(1).min(10);
    (FIRST_BACKOFF * 2u32.pow(doublings)).min(MAX_BACKOFF)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_and_caps() {
        assert_eq!(backoff_delay(1), Duration::from_secs(30));
        assert_eq!(backoff_delay(2), Duration::from_secs(60));
        assert_eq!(backoff_delay(3), Duration::from_secs(120));
        assert_eq!(backoff_delay(6), MAX_BACKOFF);
        assert_eq!(backoff_delay(40), MAX_BACKOFF);
    }

    #[test]
    fn success_clears_backoff_and_retry_after_wins_when_longer() {
        let health = ApiHealth::default();
        health.record_throttled(Some(Duration::from_secs(600)));
        assert!(health.is_backing_off());
        let until = health.backoff.lock().unwrap().until.unwrap();
        assert!(until >= SystemTime::now() + Duration::from_secs(590));
        health.record_success();
        assert!(!health.is_backing_off());
    }
}

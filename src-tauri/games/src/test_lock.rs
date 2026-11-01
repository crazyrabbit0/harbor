use std::sync::{Mutex, MutexGuard};

static ENGINES: Mutex<()> = Mutex::new(());

/// Archive, transfer-storage, Sims and save engines admit one job per process, so tests driving them take turns.
pub(crate) fn hold() -> MutexGuard<'static, ()> {
    ENGINES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

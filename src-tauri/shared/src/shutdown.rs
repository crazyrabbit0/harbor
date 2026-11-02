//! Bounded waits for work that runs while the app shuts down.

// Shutdown runs on the event-loop thread, so each wait is capped: a worker holding a lock can't freeze closing the app.
pub fn block_on_bounded<F>(label: &str, budget: std::time::Duration, fut: F)
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        fut.await;
        let _ = tx.send(());
    });
    if rx.recv_timeout(budget).is_err() {
        eprintln!("[harbor::shutdown] {label} did not finish within {budget:?}, continuing");
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    #[test]
    fn bounded_shutdown_returns_when_the_task_hangs() {
        let started = Instant::now();
        super::block_on_bounded("test", Duration::from_millis(200), std::future::pending());
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn bounded_shutdown_waits_for_a_task_that_finishes() {
        let (tx, rx) = std::sync::mpsc::channel();
        super::block_on_bounded("test", Duration::from_secs(5), async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let _ = tx.send(());
        });
        assert!(rx.try_recv().is_ok());
    }
}

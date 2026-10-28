use std::sync::mpsc::Receiver;
use std::time::{Duration, Instant};

/// Minimum time between two output events of a session while it keeps
/// producing output; the first chunk after a pause is sent at once.
pub const OUTPUT_FLUSH_INTERVAL: Duration = Duration::from_millis(4);
/// A batch is sent as soon as it reaches this size.
pub const MAX_OUTPUT_BATCH_BYTES: usize = 128 * 1024;

/// Joins the chunks read from a PTY into fewer, larger events: each IPC
/// message to the webview has a fixed cost, so `cat` of a big file must not
/// become thousands of messages. Returns when the reader side is closed.
pub fn forward_output(
    chunks: &Receiver<Vec<u8>>,
    interval: Duration,
    max_bytes: usize,
    mut emit: impl FnMut(Vec<u8>),
) {
    let mut next_flush = Instant::now();
    while let Ok(mut batch) = chunks.recv() {
        // A zero wait still takes what is already queued.
        while batch.len() < max_bytes {
            let wait = next_flush.saturating_duration_since(Instant::now());
            match chunks.recv_timeout(wait) {
                Ok(more) => batch.extend_from_slice(&more),
                Err(_) => break,
            }
        }
        emit(batch);
        next_flush = Instant::now() + interval;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::thread;
    use std::time::Instant;

    fn run(
        interval: Duration,
        max_bytes: usize,
    ) -> (mpsc::SyncSender<Vec<u8>>, mpsc::Receiver<Vec<u8>>, thread::JoinHandle<()>) {
        let (chunks_tx, chunks) = mpsc::sync_channel(256);
        let (events_tx, events) = mpsc::channel();
        let handle = thread::spawn(move || {
            forward_output(&chunks, interval, max_bytes, |batch| {
                let _ = events_tx.send(batch);
            });
        });
        (chunks_tx, events, handle)
    }

    #[test]
    fn joins_queued_chunks_into_one_event_in_order() {
        let (chunks_tx, chunks) = mpsc::sync_channel(256);
        for i in 0..100u8 {
            chunks_tx.send(vec![i]).expect("queue");
        }
        drop(chunks_tx);
        let mut batches = Vec::new();
        forward_output(&chunks, Duration::from_secs(10), MAX_OUTPUT_BATCH_BYTES, |batch| {
            batches.push(batch);
        });
        assert_eq!(batches, vec![(0..100u8).collect::<Vec<_>>()]);
    }

    #[test]
    fn sends_the_first_chunk_after_a_pause_without_waiting() {
        let (chunks, events, handle) = run(Duration::from_secs(10), MAX_OUTPUT_BATCH_BYTES);
        let started = Instant::now();
        chunks.send(b"$ ".to_vec()).expect("queue");
        assert_eq!(events.recv_timeout(Duration::from_secs(2)).expect("event"), b"$ ");
        assert!(started.elapsed() < Duration::from_secs(2));
        drop(chunks);
        handle.join().expect("forwarder");
    }

    #[test]
    fn holds_output_that_follows_a_flush_until_the_interval_ends() {
        let (chunks, events, handle) = run(Duration::from_secs(10), MAX_OUTPUT_BATCH_BYTES);
        chunks.send(b"a".to_vec()).expect("queue");
        assert_eq!(events.recv_timeout(Duration::from_secs(2)).expect("event"), b"a");
        chunks.send(b"b".to_vec()).expect("queue");
        chunks.send(b"c".to_vec()).expect("queue");
        assert!(
            events.recv_timeout(Duration::from_millis(200)).is_err(),
            "sent before the interval"
        );
        // Closing the reader flushes what is pending.
        drop(chunks);
        handle.join().expect("forwarder");
        assert_eq!(events.recv().expect("event"), b"bc");
    }

    #[test]
    fn sends_a_batch_as_soon_as_it_reaches_the_size_limit() {
        let (chunks, events, handle) = run(Duration::from_secs(10), 8);
        chunks.send(b"0".to_vec()).expect("queue");
        assert_eq!(events.recv_timeout(Duration::from_secs(2)).expect("event"), b"0");
        chunks.send(b"12345".to_vec()).expect("queue");
        chunks.send(b"6789".to_vec()).expect("queue");
        assert_eq!(events.recv_timeout(Duration::from_secs(2)).expect("event"), b"123456789");
        drop(chunks);
        handle.join().expect("forwarder");
    }
}

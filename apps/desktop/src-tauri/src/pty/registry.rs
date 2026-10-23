use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{self, SyncSender, TrySendError};
use std::sync::{Mutex, MutexGuard};
use std::thread;

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;

use super::options::validate_size;
use super::utf8::Utf8Stream;

pub const MAX_WRITE_BYTES: usize = 1 << 20;
/// Pending input chunks per session; a full queue rejects writes instead of
/// blocking the caller (Tauri runs sync commands on the main thread).
pub const MAX_QUEUED_WRITES: usize = 16;
const READ_BUFFER_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum PtyEvent {
    Output(String),
    Exit(Option<u32>),
}

struct Session {
    owner: String,
    master: Box<dyn MasterPty + Send>,
    input: SyncSender<Vec<u8>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.killer.kill();
    }
}

/// Live PTY sessions by id, each owned by the window that spawned it.
/// Dropping a session kills its process.
#[derive(Default)]
pub struct PtyRegistry {
    next_id: AtomicU32,
    sessions: Mutex<HashMap<u32, Session>>,
}

fn pty_size(cols: u16, rows: u16) -> Result<PtySize, String> {
    let (cols, rows) = validate_size(cols, rows)?;
    Ok(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
}

/// Forwards queued input from a dedicated thread, so a process that stops
/// reading only stalls its own queue.
fn spawn_input_writer(
    id: u32,
    mut writer: Box<dyn Write + Send>,
) -> Result<SyncSender<Vec<u8>>, String> {
    let (input, queue) = mpsc::sync_channel::<Vec<u8>>(MAX_QUEUED_WRITES);
    thread::Builder::new()
        .name(format!("pty-{id}-input"))
        .spawn(move || {
            for data in queue {
                if writer.write_all(&data).and_then(|()| writer.flush()).is_err() {
                    break;
                }
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(input)
}

impl PtyRegistry {
    fn sessions(&self) -> Result<MutexGuard<'_, HashMap<u32, Session>>, String> {
        self.sessions.lock().map_err(|_| "pty registry poisoned".to_string())
    }

    /// Starts `command` in a new PTY; output and exit are reported to `sink`
    /// from a dedicated reader thread.
    pub fn spawn(
        &self,
        owner: &str,
        command: CommandBuilder,
        cols: u16,
        rows: u16,
        sink: impl Fn(PtyEvent) + Send + 'static,
    ) -> Result<u32, String> {
        let pair = native_pty_system().openpty(pty_size(cols, rows)?).map_err(|e| e.to_string())?;
        let mut child = pair.slave.spawn_command(command).map_err(|e| e.to_string())?;
        // Close our copy of the slave so reads end when the child exits.
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let killer = child.clone_killer();

        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let input = spawn_input_writer(id, writer)?;
        self.sessions()?
            .insert(id, Session { owner: owner.to_owned(), master: pair.master, input, killer });

        thread::Builder::new()
            .name(format!("pty-{id}"))
            .spawn(move || {
                let mut decoder = Utf8Stream::default();
                let mut buffer = [0u8; READ_BUFFER_BYTES];
                while let Ok(read @ 1..) = reader.read(&mut buffer) {
                    let text = decoder.push(&buffer[..read]);
                    if !text.is_empty() {
                        sink(PtyEvent::Output(text));
                    }
                }
                sink(PtyEvent::Exit(child.wait().ok().map(|status| status.exit_code())));
            })
            .map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn write(&self, owner: &str, id: u32, data: &str) -> Result<(), String> {
        if data.len() > MAX_WRITE_BYTES {
            return Err("input too large".into());
        }
        let sessions = self.sessions()?;
        let session = owned(&sessions, owner, id)?;
        session.input.try_send(data.as_bytes().to_vec()).map_err(|error| match error {
            TrySendError::Full(_) => "pty input queue is full".to_string(),
            TrySendError::Disconnected(_) => "pty is closed".to_string(),
        })
    }

    pub fn resize(&self, owner: &str, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions()?;
        let session = owned(&sessions, owner, id)?;
        session.master.resize(pty_size(cols, rows)?).map_err(|e| e.to_string())
    }

    pub fn kill(&self, owner: &str, id: u32) {
        if let Ok(mut sessions) = self.sessions()
            && sessions.get(&id).is_some_and(|session| session.owner == owner)
        {
            sessions.remove(&id);
        }
    }

    /// Kills every session of a window, e.g. when it is destroyed.
    pub fn kill_owned_by(&self, owner: &str) {
        if let Ok(mut sessions) = self.sessions() {
            sessions.retain(|_, session| session.owner != owner);
        }
    }
}

fn owned<'a>(
    sessions: &'a HashMap<u32, Session>,
    owner: &str,
    id: u32,
) -> Result<&'a Session, String> {
    sessions.get(&id).filter(|session| session.owner == owner).ok_or_else(|| "unknown pty".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    fn sh(script: &str) -> CommandBuilder {
        let mut command = CommandBuilder::new("/bin/sh");
        command.args(["-c", script]);
        command
    }

    fn collect(rx: &mpsc::Receiver<PtyEvent>) -> (String, Option<u32>) {
        let mut output = String::new();
        loop {
            match rx.recv_timeout(Duration::from_secs(5)).expect("pty event") {
                PtyEvent::Output(text) => output.push_str(&text),
                PtyEvent::Exit(code) => return (output, code),
            }
        }
    }

    const OWNER: &str = "main";

    #[test]
    fn streams_output_then_exit_code() {
        let registry = PtyRegistry::default();
        let (tx, rx) = mpsc::channel();
        registry
            .spawn(OWNER, sh("printf 'hola ñ'; exit 3"), 80, 24, move |event| {
                let _ = tx.send(event);
            })
            .expect("spawn");
        let (output, code) = collect(&rx);
        assert!(output.contains("hola ñ"), "output was {output:?}");
        assert_eq!(code, Some(3));
    }

    #[test]
    fn forwards_input_to_the_process() {
        let registry = PtyRegistry::default();
        let (tx, rx) = mpsc::channel();
        let id = registry
            .spawn(OWNER, sh("read line; echo \"got:$line\""), 80, 24, move |event| {
                let _ = tx.send(event);
            })
            .expect("spawn");
        registry.write(OWNER, id, "ping\n").expect("write");
        let (output, _) = collect(&rx);
        assert!(output.contains("got:ping"), "output was {output:?}");
    }

    #[test]
    fn rejects_unknown_ids_invalid_sizes_and_huge_writes() {
        let registry = PtyRegistry::default();
        assert!(registry.write(OWNER, 99, "x").is_err());
        assert!(registry.resize(OWNER, 99, 80, 24).is_err());
        assert!(registry.spawn(OWNER, sh("true"), 0, 24, |_| {}).is_err());

        let id = registry.spawn(OWNER, sh("sleep 5"), 80, 24, |_| {}).expect("spawn");
        assert!(registry.resize(OWNER, id, 0, 24).is_err());
        assert!(registry.write(OWNER, id, &"x".repeat(MAX_WRITE_BYTES + 1)).is_err());
        registry.kill(OWNER, id);
        assert!(registry.write(OWNER, id, "x").is_err());
    }

    #[test]
    fn a_process_that_never_reads_does_not_block_writes_or_other_sessions() {
        let registry = PtyRegistry::default();
        let stuck = registry.spawn(OWNER, sh("sleep 30"), 80, 24, |_| {}).expect("spawn");
        let (tx, rx) = mpsc::channel();
        let other = registry
            .spawn(OWNER, sh("read line; echo \"got:$line\""), 80, 24, move |event| {
                let _ = tx.send(event);
            })
            .expect("spawn");

        let chunk = "x".repeat(MAX_WRITE_BYTES);
        let started = Instant::now();
        let rejected = (0..MAX_QUEUED_WRITES + 4)
            .map(|_| registry.write(OWNER, stuck, &chunk))
            .filter(Result::is_err)
            .count();
        assert!(rejected > 0, "a full input queue must reject writes instead of blocking");
        assert!(started.elapsed() < Duration::from_secs(2), "writes blocked the caller");

        registry.write(OWNER, other, "ping\n").expect("write to the other session");
        let (output, _) = collect(&rx);
        assert!(output.contains("got:ping"), "output was {output:?}");
        registry.kill(OWNER, stuck);
    }

    #[test]
    fn sessions_belong_to_the_window_that_spawned_them() {
        let registry = PtyRegistry::default();
        let (tx, rx) = mpsc::channel();
        let id = registry
            .spawn(OWNER, sh("sleep 30"), 80, 24, move |event| {
                let _ = tx.send(event);
            })
            .expect("spawn");

        assert!(registry.write("other-window", id, "x").is_err());
        assert!(registry.resize("other-window", id, 100, 30).is_err());
        registry.kill("other-window", id);
        assert!(registry.write(OWNER, id, "x").is_ok());

        registry.kill_owned_by(OWNER);
        assert!(registry.write(OWNER, id, "x").is_err());
        let (_, code) = collect(&rx);
        assert_ne!(code, Some(0), "the shell must be terminated");
    }
}

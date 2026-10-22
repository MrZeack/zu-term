use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::thread;

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;

use super::options::validate_size;
use super::utf8::Utf8Stream;

pub const MAX_WRITE_BYTES: usize = 1 << 20;
const READ_BUFFER_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum PtyEvent {
    Output(String),
    Exit(Option<u32>),
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.killer.kill();
    }
}

/// Live PTY sessions by id. Dropping a session kills its process.
#[derive(Default)]
pub struct PtyRegistry {
    next_id: AtomicU32,
    sessions: Mutex<HashMap<u32, Session>>,
}

fn pty_size(cols: u16, rows: u16) -> Result<PtySize, String> {
    let (cols, rows) = validate_size(cols, rows)?;
    Ok(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
}

impl PtyRegistry {
    fn sessions(&self) -> Result<MutexGuard<'_, HashMap<u32, Session>>, String> {
        self.sessions.lock().map_err(|_| "pty registry poisoned".to_string())
    }

    /// Starts `command` in a new PTY; output and exit are reported to `sink`
    /// from a dedicated reader thread.
    pub fn spawn(
        &self,
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
        self.sessions()?.insert(id, Session { master: pair.master, writer, killer });

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

    pub fn write(&self, id: u32, data: &str) -> Result<(), String> {
        if data.len() > MAX_WRITE_BYTES {
            return Err("input too large".into());
        }
        let mut sessions = self.sessions()?;
        let session = sessions.get_mut(&id).ok_or("unknown pty")?;
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions()?;
        let session = sessions.get(&id).ok_or("unknown pty")?;
        session.master.resize(pty_size(cols, rows)?).map_err(|e| e.to_string())
    }

    pub fn kill(&self, id: u32) {
        if let Ok(mut sessions) = self.sessions() {
            sessions.remove(&id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

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

    #[test]
    fn streams_output_then_exit_code() {
        let registry = PtyRegistry::default();
        let (tx, rx) = mpsc::channel();
        registry
            .spawn(sh("printf 'hola ñ'; exit 3"), 80, 24, move |event| {
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
            .spawn(sh("read line; echo \"got:$line\""), 80, 24, move |event| {
                let _ = tx.send(event);
            })
            .expect("spawn");
        registry.write(id, "ping\n").expect("write");
        let (output, _) = collect(&rx);
        assert!(output.contains("got:ping"), "output was {output:?}");
    }

    #[test]
    fn rejects_unknown_ids_invalid_sizes_and_huge_writes() {
        let registry = PtyRegistry::default();
        assert!(registry.write(99, "x").is_err());
        assert!(registry.resize(99, 80, 24).is_err());
        assert!(registry.spawn(sh("true"), 0, 24, |_| {}).is_err());

        let id = registry.spawn(sh("sleep 5"), 80, 24, |_| {}).expect("spawn");
        assert!(registry.resize(id, 0, 24).is_err());
        assert!(registry.write(id, &"x".repeat(MAX_WRITE_BYTES + 1)).is_err());
        registry.kill(id);
        assert!(registry.write(id, "x").is_err());
    }
}

pub mod commands;
mod options;
mod registry;
#[cfg(unix)]
mod shell_integration;
mod utf8;

pub use registry::PtyRegistry;

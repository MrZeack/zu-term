pub mod commands;
mod options;
mod output;
mod registry;
#[cfg(unix)]
mod shell_integration;

pub use registry::PtyRegistry;

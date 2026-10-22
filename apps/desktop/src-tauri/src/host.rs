/// This machine's hostname, as zsh reports it in `$HOST` (used to trust OSC 7).
#[tauri::command]
pub fn local_hostname() -> String {
    gethostname::gethostname().to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::local_hostname;

    #[test]
    fn matches_the_system_hostname() {
        let output = std::process::Command::new("hostname").output().expect("hostname");
        let expected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        assert!(!expected.is_empty());
        assert_eq!(local_hostname(), expected);
    }
}

use std::ffi::{OsStr, OsString};
use std::path::PathBuf;

/// This machine's hostname, as zsh reports it in `$HOST` (used to trust OSC 7).
#[tauri::command]
pub fn local_hostname() -> String {
    gethostname::gethostname().to_string_lossy().into_owned()
}

fn valid_cwd(value: OsString) -> Option<PathBuf> {
    let path = PathBuf::from(value);
    (path.is_absolute() && path.is_dir()).then_some(path)
}

pub fn initial_cwd_from_args<I>(args: I) -> Option<PathBuf>
where
    I: IntoIterator<Item = OsString>,
{
    let mut args = args.into_iter();
    while let Some(argument) = args.next() {
        if argument == OsStr::new("--working-directory") {
            return args.next().and_then(valid_cwd);
        }
        if let Some(value) =
            argument.to_str().and_then(|argument| argument.strip_prefix("--working-directory="))
        {
            return valid_cwd(OsString::from(value));
        }
    }
    None
}

#[tauri::command]
pub fn initial_cwd() -> Option<String> {
    initial_cwd_from_args(std::env::args_os()).and_then(|path| path.to_str().map(str::to_owned))
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;

    use super::{initial_cwd_from_args, local_hostname};

    #[test]
    fn accepts_an_existing_absolute_working_directory_argument() {
        let expected = std::env::temp_dir();
        assert_eq!(
            initial_cwd_from_args([
                OsString::from("zu-term"),
                OsString::from("--working-directory"),
                expected.clone().into_os_string(),
            ]),
            Some(expected),
        );
    }

    #[test]
    fn accepts_equals_syntax_and_rejects_unsafe_directories() {
        let expected = std::env::temp_dir();
        assert_eq!(
            initial_cwd_from_args([
                OsString::from("zu-term"),
                OsString::from(format!("--working-directory={}", expected.display())),
            ]),
            Some(expected),
        );
        assert_eq!(
            initial_cwd_from_args([
                OsString::from("zu-term"),
                OsString::from("--working-directory"),
                OsString::from("relative/path"),
            ]),
            None,
        );
        assert_eq!(
            initial_cwd_from_args([
                OsString::from("zu-term"),
                OsString::from("--working-directory=/definitely/not/here"),
            ]),
            None,
        );
    }

    #[test]
    fn matches_the_system_hostname() {
        let output = std::process::Command::new("hostname").output().expect("hostname");
        let expected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        assert!(!expected.is_empty());
        assert_eq!(local_hostname(), expected);
    }
}

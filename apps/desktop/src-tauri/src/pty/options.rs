use std::path::{Path, PathBuf};

pub const MAX_DIMENSION: u16 = 1000;

/// Validates terminal dimensions coming from the UI.
pub fn validate_size(cols: u16, rows: u16) -> Result<(u16, u16), String> {
    let valid = |n: u16| (1..=MAX_DIMENSION).contains(&n);
    if valid(cols) && valid(rows) {
        Ok((cols, rows))
    } else {
        Err(format!("invalid terminal size {cols}x{rows}"))
    }
}

/// Uses the requested directory only if it is an existing absolute directory.
pub fn resolve_cwd(requested: Option<&str>, home: &Path) -> PathBuf {
    requested
        .map(PathBuf::from)
        .filter(|path| path.is_absolute() && path.is_dir())
        .unwrap_or_else(|| home.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_sizes_in_range() {
        assert_eq!(validate_size(80, 24), Ok((80, 24)));
        assert_eq!(validate_size(MAX_DIMENSION, 1), Ok((MAX_DIMENSION, 1)));
    }

    #[test]
    fn rejects_zero_or_huge_sizes() {
        assert!(validate_size(0, 24).is_err());
        assert!(validate_size(80, 0).is_err());
        assert!(validate_size(MAX_DIMENSION + 1, 24).is_err());
    }

    #[test]
    fn uses_requested_existing_directory() {
        let dir = std::env::temp_dir();
        let home = Path::new("/nonexistent-home");
        assert_eq!(resolve_cwd(dir.to_str(), home), dir);
    }

    #[test]
    fn falls_back_to_home_for_missing_relative_or_file_paths() {
        let home = std::env::temp_dir();
        assert_eq!(resolve_cwd(None, &home), home);
        assert_eq!(resolve_cwd(Some("relative/dir"), &home), home);
        assert_eq!(resolve_cwd(Some("/definitely/not/here"), &home), home);
        assert_eq!(resolve_cwd(Some(file!()), &home), home);
    }
}

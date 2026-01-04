use crate::error::AppError;
use std::path::{Component, Path, PathBuf};

pub fn normalize_path(path: &Path) -> PathBuf {
    let mut ret = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(..) => ret.push(component.as_os_str()),
            Component::RootDir => ret.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                ret.pop();
            }
            Component::Normal(c) => ret.push(c),
        }
    }
    ret
}

pub fn validate_path(base_path: &Path, user_path: &str) -> Result<PathBuf, AppError> {
    let p = Path::new(user_path);

    // WARNING: This is insecure. The user has explicitly requested this behavior,
    // which mirrors the Go implementation. It allows any absolute path to be accessed.
    if p.is_absolute() {
        let normalized = normalize_path(p);
        // If normalized is empty, return "." (current directory)
        return Ok(if normalized.as_os_str().is_empty() {
            PathBuf::from(".")
        } else {
            normalized
        });
    }

    // For relative paths, join with workspace.
    let full_path = base_path.join(p);

    // We are not calling canonicalize, so non-existent paths are allowed.
    // This allows `ensure_directory` to work later.
    // This is still not fully secure against traversal with relative paths + symlinks,
    // but it matches the user's request for less strict validation.
    let normalized = normalize_path(&full_path);
    // If normalized is empty, return "." (current directory)
    Ok(if normalized.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        normalized
    })
}

// Helper to ensure directory exists
pub async fn ensure_directory(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        tokio::fs::create_dir_all(path).await.map_err(|e| {
            AppError::InternalServerError(format!("Failed to create directory: {}", e))
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_path() {
        let cases = vec![
            // Basic cases
            ("a/b/c", "a/b/c"),
            ("a/./b", "a/b"),
            ("a/../b", "b"),
            ("a/b/../../c", "c"),
            // Root path cases
            ("/", "/"),
            ("/a/b", "/a/b"),
            ("/a/./b", "/a/b"),
            ("/a/../b", "/b"),
            // Boundary cases
            (".", ""),
            ("..", ""), // Popping from empty path results in empty path
            ("../a", "a"),
            ("/..", "/"), // Popping from root does nothing
            ("/../a", "/a"),
            // Complex cases
            ("a/./b/../c/./d", "a/c/d"),
            ("/a/b/c/../../d", "/a/d"),
        ];

        for (input, expected) in cases {
            let input_path = Path::new(input);
            let expected_path = PathBuf::from(expected);
            assert_eq!(
                normalize_path(input_path),
                expected_path,
                "Failed for input: {}",
                input
            );
        }
    }

    #[test]
    fn test_validate_path() {
        let base = Path::new("/home/devbox/project");

        // Test absolute path (allowed as per insecure policy)
        let res = validate_path(base, "/etc/passwd").unwrap();
        assert_eq!(res, PathBuf::from("/etc/passwd"));

        // Test relative path
        let res = validate_path(base, "src/main.rs").unwrap();
        assert_eq!(res, PathBuf::from("/home/devbox/project/src/main.rs"));

        // Test relative path with traversal
        let res = validate_path(base, "src/../lib.rs").unwrap();
        assert_eq!(res, PathBuf::from("/home/devbox/project/lib.rs"));

        // Test traversal escaping workspace (allowed as per insecure policy)
        let res = validate_path(base, "../../etc/passwd").unwrap();
        assert_eq!(res, PathBuf::from("/etc/passwd"));
    }
}

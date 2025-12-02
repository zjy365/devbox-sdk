use rand::Rng;
use std::borrow::Cow;
use std::path::Path;

/// NanoID alphabet (38 characters, lowercase alphanumeric + _-)
/// Compatible with URL paths: _-0123456789abcdefghijklmnopqrstuvwxyz
const NANOID_ALPHABET: &[u8] = b"_-0123456789abcdefghijklmnopqrstuvwxyz";

/// Default ID length (matches Go server)
const DEFAULT_ID_LENGTH: usize = 8;

/// Generate a NanoID (8 chars) compatible with Go server
///
/// Uses a 36-character alphabet (0-9, a-z).
///
/// # Examples
/// ```
/// let id = generate_id();
/// assert_eq!(id.len(), 8);
/// // Examples: "x3k9a2w1", "5lcgne3p"
/// ```
pub fn generate_id() -> String {
    generate_nanoid(DEFAULT_ID_LENGTH)
}

/// Generate a NanoID with custom length
///
/// # Arguments
/// * `length` - The length of the ID to generate
///
/// # Examples
/// ```
/// let short_id = generate_nanoid(4);  // 4 chars
/// let long_id = generate_nanoid(16);  // 16 chars
/// ```
pub fn generate_nanoid(length: usize) -> String {
    let mut rng = rand::rng();
    let mut id = String::with_capacity(length);
    let len = NANOID_ALPHABET.len();

    for _ in 0..length {
        let idx = rng.random_range(0..len);
        id.push(NANOID_ALPHABET[idx] as char);
    }
    id
}

/// Escape a string for use in a shell command.
/// Replaces `shell-escape` crate.
pub fn shell_escape(s: &str) -> Cow<'_, str> {
    if s.is_empty() {
        return Cow::Borrowed("''");
    }

    let mut safe = true;
    for c in s.chars() {
        if !c.is_ascii_alphanumeric() && !matches!(c, ',' | '.' | '_' | '+' | ':' | '@' | '/' | '-')
        {
            safe = false;
            break;
        }
    }

    if safe {
        return Cow::Borrowed(s);
    }

    let mut escaped = String::with_capacity(s.len() + 2);
    escaped.push('\'');
    for c in s.chars() {
        if c == '\'' {
            escaped.push_str("'\\''");
        } else {
            escaped.push(c);
        }
    }
    escaped.push('\'');
    Cow::Owned(escaped)
}

/// Guess MIME type from file path.
/// Replaces `mime_guess` crate.
pub fn mime_guess(path: &Path) -> &str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) => match ext.to_lowercase().as_str() {
            "html" | "htm" => "text/html",
            "css" => "text/css",
            "js" | "mjs" => "application/javascript",
            "json" => "application/json",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "ico" => "image/x-icon",
            "txt" => "text/plain",
            "xml" => "text/xml",
            "pdf" => "application/pdf",
            "zip" => "application/zip",
            "tar" => "application/x-tar",
            "gz" => "application/gzip",
            "mp3" => "audio/mpeg",
            "mp4" => "video/mp4",
            "wasm" => "application/wasm",
            _ => "application/octet-stream",
        },
        None => "application/octet-stream",
    }
}

/// Simple ISO 8601 UTC formatting (approximate)
/// Replaces `chrono` for basic logging/listing needs.
pub fn format_time(secs: u64) -> String {
    let days_since_epoch = secs / 86400;
    let seconds_of_day = secs % 86400;
    let hours = seconds_of_day / 3600;
    let minutes = (seconds_of_day % 3600) / 60;
    let seconds = seconds_of_day % 60;

    // Simplified leap year calculation (valid for 1970-2099)
    let mut year = 1970;
    let mut days = days_since_epoch;

    loop {
        let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if is_leap { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }

    let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let days_in_month = [
        31,
        if is_leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];

    let mut month = 0;
    for &dim in &days_in_month {
        if days < dim {
            break;
        }
        days -= dim;
        month += 1;
    }

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year,
        month + 1,
        days + 1,
        hours,
        minutes,
        seconds
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id_length() {
        let id = generate_id();
        assert_eq!(id.len(), 8, "ID should be 8 characters long");
    }

    #[test]
    fn test_generate_id_charset() {
        let id = generate_id();
        let alphabet = "_-0123456789abcdefghijklmnopqrstuvwxyz";
        for c in id.chars() {
            assert!(alphabet.contains(c), "ID contains invalid character: {}", c);
        }
    }

    #[test]
    fn test_generate_id_uniqueness() {
        let mut ids = std::collections::HashSet::new();
        for _ in 0..1000 {
            let id = generate_id();
            assert!(ids.insert(id.clone()), "Collision detected: {}", id);
        }
        assert_eq!(ids.len(), 1000, "Should generate 1000 unique IDs");
    }

    #[test]
    fn test_generate_nanoid_custom_length() {
        assert_eq!(generate_nanoid(4).len(), 4);
        assert_eq!(generate_nanoid(8).len(), 8);
        assert_eq!(generate_nanoid(16).len(), 16);
        assert_eq!(generate_nanoid(32).len(), 32);
    }

    #[test]
    fn test_nanoid_alphabet_consistency() {
        // Test that all possible byte values map correctly
        for _ in 0..100 {
            let id = generate_id();
            for c in id.chars() {
                assert!(NANOID_ALPHABET.contains(&(c as u8)));
            }
        }
    }
}

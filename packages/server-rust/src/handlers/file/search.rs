use crate::error::AppError;
use crate::response::ApiResponse;
use crate::state::AppState;
use crate::utils::path::validate_path;
use axum::{extract::Json, extract::State};
use futures::stream::{self, FuturesUnordered, StreamExt};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

// --- Constants ---

// Context lines no longer used after API simplification

/// Number of bytes to read for binary detection (256 bytes is enough for file magic + encoding check)
const BINARY_CHECK_SIZE: usize = 256;

/// Threshold for small files: use full read + in-memory search instead of streaming
const SMALL_FILE_THRESHOLD: u64 = 32 * 1024; // 32 KB

/// Default ignored directories for search
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "target",
    "dist",
    "build",
    ".cache",
    ".npm",
    ".yarn",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    "vendor",
    ".idea",
    ".vscode",
    "coverage",
    ".nyc_output",
    ".next",
    ".nuxt",
    ".output",
    "out",
    ".turbo",
    ".parcel-cache",
];

// --- Search Types (filename search) ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    dir: String,
    pattern: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    files: Vec<String>,
}

// --- Find Types (content search) ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindRequest {
    dir: String,
    keyword: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindResponse {
    files: Vec<String>,
}

// --- Replace Types ---

/// Replace request structure
///
/// **Encoding Limitation:**
/// - Only UTF-8 encoded files are supported
/// - Both `from` and `to` strings are transmitted as UTF-8 via HTTP/JSON
/// - Files with other encodings (GBK, UTF-16, Latin1, etc.) will be skipped
/// - Binary files are automatically detected and skipped
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRequest {
    files: Vec<String>,
    from: String,
    to: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    file: String,
    status: String, // "success", "error", "skipped"
    replacements: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResponse {
    results: Vec<ReplaceResult>,
}

// --- Handlers ---

/// Search for files by filename pattern (case-insensitive substring match)
pub async fn search_files(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<ApiResponse<SearchResponse>>, AppError> {
    // P0: Input validation - reject empty pattern
    if req.pattern.is_empty() {
        return Err(AppError::BadRequest("Pattern cannot be empty".to_string()));
    }

    // P0: Normalize workspace base (allow relative workspace path) and dir input
    let workspace_base = state.config.workspace_path.clone();
    let dir_trimmed = req.dir.trim();
    let dir_str = if dir_trimmed.is_empty() {
        "."
    } else {
        dir_trimmed
    };

    // P0: Path validation - use validate_path like other file operations
    let root_path = validate_path(&workspace_base, dir_str)?;

    // Check if directory exists (async)
    let metadata = fs::metadata(&root_path)
        .await
        .map_err(|_| AppError::NotFound(format!("Directory not found: {}", root_path.display())))?;

    if !metadata.is_dir() {
        return Err(AppError::BadRequest(format!(
            "Path is not a directory: {}",
            root_path.display()
        )));
    }

    let files = perform_filename_search(root_path, &req.pattern).await?;

    let response = SearchResponse { files };

    Ok(Json(ApiResponse::success(response)))
}

/// Find files by content keyword (searches inside text files)
pub async fn find_in_files(
    State(state): State<Arc<AppState>>,
    Json(req): Json<FindRequest>,
) -> Result<Json<ApiResponse<FindResponse>>, AppError> {
    // P0: Input validation - reject empty keyword
    if req.keyword.is_empty() {
        return Err(AppError::BadRequest("Keyword cannot be empty".to_string()));
    }

    // P0: Normalize workspace base (allow relative workspace path) and dir input
    let workspace_base = state.config.workspace_path.clone();
    let dir_trimmed = req.dir.trim();
    let dir_str = if dir_trimmed.is_empty() {
        "."
    } else {
        dir_trimmed
    };

    // P0: Path validation - use validate_path like other file operations
    let root_path = validate_path(&workspace_base, dir_str)?;

    // Check if directory exists (async)
    let metadata = fs::metadata(&root_path)
        .await
        .map_err(|_| AppError::NotFound(format!("Directory not found: {}", root_path.display())))?;

    if !metadata.is_dir() {
        return Err(AppError::BadRequest(format!(
            "Path is not a directory: {}",
            root_path.display()
        )));
    }

    let files = perform_content_search(
        root_path,
        &req.keyword,
        state.config.max_concurrent_reads,
        state.config.max_file_size,
    )
    .await?;

    let response = FindResponse { files };

    Ok(Json(ApiResponse::success(response)))
}

pub async fn replace_in_files(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ReplaceRequest>,
) -> Result<Json<ApiResponse<ReplaceResponse>>, AppError> {
    // P0: Input validation - reject empty 'from' string
    if req.from.is_empty() {
        return Err(AppError::BadRequest(
            "'from' string cannot be empty".to_string(),
        ));
    }

    // P0: Validate all file paths before processing
    let mut validated_paths = Vec::with_capacity(req.files.len());
    for file_path_str in &req.files {
        let valid_path = validate_path(&state.config.workspace_path, file_path_str)?;
        validated_paths.push((file_path_str.clone(), valid_path));
    }

    // P1: Concurrent processing of file replacements with bounded limit
    let from = req.from.clone();
    let to = req.to.clone();
    let max_file_size = state.config.max_file_size;

    let replace_futs =
        validated_paths
            .into_iter()
            .map(|(original_path, valid_path)| {
                let from = from.clone();
                let to = to.clone();
                async move {
                    perform_replace(valid_path, &original_path, &from, &to, max_file_size).await
                }
            });

    let mut stream = stream::iter(replace_futs).buffer_unordered(state.config.max_concurrent_reads);
    let mut results = Vec::new();

    while let Some(result) = stream.next().await {
        results.push(result);
    }

    let response = ReplaceResponse { results };

    Ok(Json(ApiResponse::success(response)))
}

// --- Helpers ---

/// Check if a directory name should be ignored
fn should_ignore_dir(name: &str) -> bool {
    // Skip hidden directories
    if name.starts_with('.') {
        return true;
    }
    // Skip known heavy directories
    IGNORED_DIRS.contains(&name)
}

/// Search files by filename pattern (case-insensitive substring)
async fn perform_filename_search(
    root: PathBuf,
    pattern: &str,
) -> Result<Vec<String>, AppError> {
    let mut matched_files: Vec<String> = Vec::new();
    let mut dirs = vec![root];
    let pattern_lower = pattern.to_lowercase();

    // Iterative DFS to avoid stack overflow
    while let Some(current_dir) = dirs.pop() {
        let mut entries = match fs::read_dir(&current_dir).await {
            Ok(e) => e,
            Err(_) => continue, // Skip unreadable dirs
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();

            // Get file name for filtering
            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name,
                None => continue,
            };

            // Use async file_type() to avoid blocking
            let file_type = match entry.file_type().await {
                Ok(ft) => ft,
                Err(_) => continue, // Skip entries we can't stat
            };

            // Skip symbolic links to avoid loops and escapes
            if file_type.is_symlink() {
                continue;
            }

            if file_type.is_dir() {
                // Check if directory should be ignored
                if should_ignore_dir(file_name) {
                    continue;
                }
                dirs.push(path);
            } else if file_type.is_file() {
                // Match filename (case-insensitive)
                if file_name.to_lowercase().contains(&pattern_lower) {
                    matched_files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(matched_files)
}

/// Search for keyword inside file contents (text files only)
async fn perform_content_search(
    root: PathBuf,
    keyword: &str,
    max_concurrent: usize,
    max_file_size: u64,
) -> Result<Vec<String>, AppError> {
    let mut matched_files: Vec<String> = Vec::new();
    let mut dirs = vec![root];
    let keyword_owned = keyword.to_string();
    let mut futs: FuturesUnordered<_> = FuturesUnordered::new();

    // Iterative DFS to avoid stack overflow
    while let Some(current_dir) = dirs.pop() {
        let mut entries = match fs::read_dir(&current_dir).await {
            Ok(e) => e,
            Err(_) => continue, // Skip unreadable dirs
        };

        // Collect files in current directory for batch processing
        let mut files_in_dir: Vec<PathBuf> = Vec::new();

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();

            // Get file name for filtering
            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(name) => name,
                None => continue,
            };

            // P1: Use async file_type() to avoid blocking
            let file_type = match entry.file_type().await {
                Ok(ft) => ft,
                Err(_) => continue, // Skip entries we can't stat
            };

            // P0: Skip symbolic links to avoid loops and escapes
            if file_type.is_symlink() {
                continue;
            }

            if file_type.is_dir() {
                // P1: Check if directory should be ignored
                if should_ignore_dir(file_name) {
                    continue;
                }
                dirs.push(path);
            } else if file_type.is_file() {
                files_in_dir.push(path);
            }
        }

        // Enqueue file checks into global unordered futures, drain to keep concurrency bounded
        let kw = keyword_owned.clone();
        for path in files_in_dir.into_iter() {
            let kw = kw.clone();
            futs.push(async move {
                let metadata = match fs::metadata(&path).await {
                    Ok(m) => m,
                    Err(_) => return None,
                };
                if metadata.len() > max_file_size || metadata.len() == 0 {
                    return None;
                }
                // Binary detection via header sniffing
                let check_size = BINARY_CHECK_SIZE.min(metadata.len() as usize);
                let mut header = vec![0u8; check_size];
                let mut f = match fs::File::open(&path).await {
                    Ok(f) => f,
                    Err(_) => return None,
                };
                if tokio::io::AsyncReadExt::read_exact(&mut f, &mut header)
                    .await
                    .is_err()
                {
                    return None;
                }
                if !is_probably_text(&header) {
                    return None;
                }
                if metadata.len() <= SMALL_FILE_THRESHOLD {
                    let content = match fs::read_to_string(&path).await {
                        Ok(c) => c,
                        Err(_) => return None,
                    };
                    if !kw.is_empty() && content.contains(&kw) {
                        Some(path.to_string_lossy().to_string())
                    } else {
                        None
                    }
                } else {
                    file_contains_keyword_streaming(&path, &kw).await
                }
            });

            // Bound concurrency
            while futs.len() >= max_concurrent {
                if let Some(res) = futs.next().await {
                    if let Some(file_path) = res {
                        matched_files.push(file_path);
                    }
                }
            }
        }
    }

    // Drain remaining
    while let Some(res) = futs.next().await {
        if let Some(file_path) = res {
            matched_files.push(file_path);
        }
    }

    Ok(matched_files)
}

async fn file_contains_keyword_streaming(path: &PathBuf, keyword: &str) -> Option<String> {
    let file = match fs::File::open(path).await {
        Ok(f) => f,
        Err(_) => return None,
    };

    let mut reader = BufReader::new(file);
    let mut line_buf = String::new();

    loop {
        line_buf.clear();
        match reader.read_line(&mut line_buf).await {
            Ok(0) => break,
            Ok(_) => {
                // Strip trailing CRLF/LF
                let mut line = line_buf.as_str();
                if line.ends_with('\n') {
                    line = &line[..line.len() - 1];
                    if line.ends_with('\r') {
                        line = &line[..line.len() - 1];
                    }
                }
                if !keyword.is_empty() && line.contains(keyword) {
                    return Some(path.to_string_lossy().to_string());
                }
            }
            Err(_) => break,
        }
    }

    None
}

async fn perform_replace(
    path: PathBuf,
    original_path: &str,
    from: &str,
    to: &str,
    max_file_size: u64,
) -> ReplaceResult {
    // P1: Use async metadata check instead of blocking exists()
    let metadata = match fs::metadata(&path).await {
        Ok(m) => m,
        Err(_) => {
            return ReplaceResult {
                file: original_path.to_string(),
                status: "error".to_string(),
                replacements: 0,
                error: Some("File not found".to_string()),
            };
        }
    };

    // P0: Skip symbolic links
    if metadata.file_type().is_symlink() {
        return ReplaceResult {
            file: original_path.to_string(),
            status: "skipped".to_string(),
            replacements: 0,
            error: Some("Symbolic links are not supported".to_string()),
        };
    }

    if !metadata.is_file() {
        return ReplaceResult {
            file: original_path.to_string(),
            status: "error".to_string(),
            replacements: 0,
            error: Some("Path is not a file".to_string()),
        };
    }

    // Skip files that are too large
    if metadata.len() > max_file_size {
        return ReplaceResult {
            file: original_path.to_string(),
            status: "skipped".to_string(),
            replacements: 0,
            error: Some(format!(
                "File too large ({} bytes, max {} bytes)",
                metadata.len(),
                max_file_size
            )),
        };
    }

    // Read first chunk to detect binary file before reading entire content
    let header = {
        let check_size = BINARY_CHECK_SIZE.min(metadata.len() as usize);
        let mut buf = vec![0u8; check_size];
        let mut file = match fs::File::open(&path).await {
            Ok(f) => f,
            Err(e) => {
                return ReplaceResult {
                    file: original_path.to_string(),
                    status: "error".to_string(),
                    replacements: 0,
                    error: Some(format!("Failed to open file: {}", e)),
                };
            }
        };

        match file.read_exact(&mut buf).await {
            Ok(_) => buf,
            Err(e) => {
                return ReplaceResult {
                    file: original_path.to_string(),
                    status: "error".to_string(),
                    replacements: 0,
                    error: Some(format!("Failed to read file: {}", e)),
                };
            }
        }
    };

    // Check for binary content (custom 256B heuristic)
    if !is_probably_text(&header) {
        return ReplaceResult {
            file: original_path.to_string(),
            status: "skipped".to_string(),
            replacements: 0,
            error: Some("Binary file".to_string()),
        };
    }

    // Now read the full content as UTF-8 text
    let content = match fs::read_to_string(&path).await {
        Ok(s) => s,
        Err(_) => {
            // Failed to read as UTF-8, likely encoding issue
            return ReplaceResult {
                file: original_path.to_string(),
                status: "skipped".to_string(),
                replacements: 0,
                error: Some("Non-UTF-8 text file".to_string()),
            };
        }
    };

    let count = content.matches(from).count();
    if count > 0 {
        let new_content = content.replace(from, to);
        match fs::write(&path, new_content).await {
            Ok(_) => ReplaceResult {
                file: original_path.to_string(),
                status: "success".to_string(),
                replacements: count,
                error: None,
            },
            Err(e) => ReplaceResult {
                file: original_path.to_string(),
                status: "error".to_string(),
                replacements: 0,
                error: Some(e.to_string()),
            },
        }
    } else {
        ReplaceResult {
            file: original_path.to_string(),
            status: "skipped".to_string(),
            replacements: 0,
            error: None,
        }
    }
}

/// Determine whether the file header likely represents a UTF-8 text file.
///
/// Heuristics on first up to 256 bytes:
/// - Early null byte detection (including UTF-16, which we treat as non-UTF-8 text and skip)
/// - Control character density (excluding TAB/CR/LF); high density suggests binary
/// - UTF-8 sequence validation allowing truncated trailing sequence
fn is_probably_text(header: &[u8]) -> bool {
    if header.is_empty() {
        return true;
    }
    let h = header;
    // Quick null-byte path: consider binary if any early null within first 256 bytes
    // (UTF-16 is treated as non-UTF-8 text and will be skipped by UTF-8 only logic)
    if h.iter().take(256).any(|&b| b == 0) {
        return false;
    }

    // Control character density (exclude common whitespace \t, \n, \r)
    let mut ctrl_count = 0usize;
    let sample_len = h.len().min(256);
    for &b in &h[..sample_len] {
        match b {
            0x09 | 0x0A | 0x0D => {} // allowed whitespace
            0x00..=0x08 | 0x0B | 0x0C | 0x0E..=0x1F | 0x7F => ctrl_count += 1,
            _ => {}
        }
    }
    let ctrl_ratio = ctrl_count as f32 / sample_len as f32;
    if ctrl_ratio > 0.10 {
        // More than 10% control chars → likely binary
        return false;
    }

    // UTF-8 validation allowing truncated trailing multi-byte sequence
    if !is_valid_utf8_prefix(&h[..sample_len]) {
        return false;
    }

    true
}

/// Validate that the slice is a valid UTF-8 prefix (all complete sequences valid;
/// an incomplete trailing sequence is tolerated).
fn is_valid_utf8_prefix(bytes: &[u8]) -> bool {
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b <= 0x7F {
            i += 1;
            continue;
        }

        // Determine sequence length
        let (seq_len, min_codepoint) = if b & 0b1110_0000 == 0b1100_0000 {
            (2, 0x80)
        } else if b & 0b1111_0000 == 0b1110_0000 {
            (3, 0x800)
        } else if b & 0b1111_1000 == 0b1111_0000 {
            (4, 0x10000)
        } else {
            return false; // invalid leading byte
        };

        // If truncated at end, accept as valid prefix
        if i + seq_len > bytes.len() {
            return true;
        }

        // Validate continuation bytes
        let mut codepoint: u32 = (b & (0xFF >> (seq_len + 1))) as u32;
        for j in 1..seq_len {
            let cb = bytes[i + j];
            if cb & 0b1100_0000 != 0b1000_0000 {
                return false;
            }
            codepoint = (codepoint << 6) | (cb & 0b0011_1111) as u32;
        }

        // Overlong sequence check
        if codepoint < min_codepoint {
            return false;
        }

        // Surrogates are invalid in UTF-8
        if (0xD800..=0xDFFF).contains(&codepoint) {
            return false;
        }

        // Maximum valid codepoint
        if codepoint > 0x10FFFF {
            return false;
        }

        i += seq_len;
    }
    true
}

//! Verified, resumable-by-skip downloads with bounded concurrency.

use crate::core::{err, Res};
use futures_util::{stream, StreamExt};
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub struct Item {
    pub url: String,
    pub path: PathBuf,
    pub sha1: Option<String>,
    pub sha512: Option<String>,
    pub size: Option<u64>,
}

fn sha1_hex(bytes: &[u8]) -> String { hex::encode(Sha1::digest(bytes)) }
fn sha512_hex(bytes: &[u8]) -> String { hex::encode(sha2::Sha512::digest(bytes)) }

/// True when the file already exists and matches the expected checksum (or size when no hash).
pub async fn is_valid(item: &Item) -> bool {
    let Ok(meta) = tokio::fs::metadata(&item.path).await else { return false };
    if let Some(size) = item.size { if meta.len() != size { return false; } }
    if item.sha1.is_none() && item.sha512.is_none() { return item.size.is_some() || meta.len() > 0; }
    let Ok(bytes) = tokio::fs::read(&item.path).await else { return false };
    check(item, &bytes)
}

fn check(item: &Item, bytes: &[u8]) -> bool {
    if let Some(h) = &item.sha512 { return sha512_hex(bytes).eq_ignore_ascii_case(h); }
    if let Some(h) = &item.sha1 { return sha1_hex(bytes).eq_ignore_ascii_case(h); }
    true
}

async fn fetch_one(http: &reqwest::Client, item: &Item, cancel: &AtomicBool) -> Res<u64> {
    if is_valid(item).await { return Ok(0); }
    if let Some(dir) = item.path.parent() { tokio::fs::create_dir_all(dir).await.map_err(err("Create folder"))?; }
    let mut last = String::new();
    for attempt in 0..3 {
        if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }
        if attempt > 0 { tokio::time::sleep(std::time::Duration::from_millis(600 * attempt)).await; }
        let resp = match http.get(&item.url).send().await { Ok(r) => r, Err(e) => { last = e.to_string(); continue; } };
        if !resp.status().is_success() { last = format!("HTTP {}", resp.status()); continue; }
        let bytes = match resp.bytes().await { Ok(b) => b, Err(e) => { last = e.to_string(); continue; } };
        if !check(item, &bytes) { last = "checksum did not match".into(); continue; }
        let tmp = item.path.with_extension("part");
        tokio::fs::write(&tmp, &bytes).await.map_err(err("Write file"))?;
        tokio::fs::rename(&tmp, &item.path).await.map_err(err("Save file"))?;
        return Ok(bytes.len() as u64);
    }
    Err(format!("{} ({})", file_label(&item.path), last))
}

pub fn file_label(p: &Path) -> String {
    p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
}

/// Downloads every item, calling `progress(done_files, total_files, bytes)` as files finish.
pub async fn download_all<F>(http: &reqwest::Client, items: Vec<Item>, concurrency: usize, cancel: Arc<AtomicBool>, progress: F) -> Res<()>
where
    F: Fn(u64, u64, u64) + Send + Sync,
{
    let total = items.len() as u64;
    let done = AtomicU64::new(0);
    let bytes = AtomicU64::new(0);
    progress(0, total, 0);
    let results = stream::iter(items.into_iter())
        .map(|it| {
            let cancel = cancel.clone();
            async move { fetch_one(http, &it, &cancel).await }
        })
        .buffer_unordered(concurrency)
        .map(|r| {
            if let Ok(n) = &r { bytes.fetch_add(*n, Ordering::Relaxed); }
            let d = done.fetch_add(1, Ordering::Relaxed) + 1;
            progress(d, total, bytes.load(Ordering::Relaxed));
            r
        })
        .collect::<Vec<_>>()
        .await;
    if cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }
    let failures: Vec<String> = results.into_iter().filter_map(|r| r.err()).collect();
    if failures.is_empty() { Ok(()) } else {
        Err(format!("{} file(s) failed. First: {}", failures.len(), failures[0]))
    }
}

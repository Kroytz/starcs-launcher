use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

static PREFETCH_CANCELLED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
static PREFETCH_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

struct PrefetchRuntime {
    running: bool,
}

fn prefetch_runtime() -> &'static Mutex<PrefetchRuntime> {
    static RUNTIME: OnceLock<Mutex<PrefetchRuntime>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(PrefetchRuntime { running: false }))
}

fn prefetch_done() -> &'static Condvar {
    static DONE: OnceLock<Condvar> = OnceLock::new();
    DONE.get_or_init(Condvar::new)
}

fn clear_steam_app_env() {
    let _ = std::env::remove_var("SteamAppId");
    let _ = std::env::remove_var("SteamGameId");
}

fn mark_prefetch_started() {
    let mut runtime = prefetch_runtime().lock().expect("prefetch runtime poisoned");
    runtime.running = true;
}

fn mark_prefetch_finished() {
    let mut runtime = prefetch_runtime().lock().expect("prefetch runtime poisoned");
    runtime.running = false;
    prefetch_done().notify_all();
}

fn is_prefetch_cancelled() -> bool {
    PREFETCH_CANCELLED.load(Ordering::SeqCst)
}

/// 立即终止子进程，不等待预下载线程收尾（进服前调用）。
fn abort_workshop_prefetch() {
    PREFETCH_CANCELLED.store(true, Ordering::SeqCst);
    kill_prefetch_child();
    clear_steam_app_env();
}

/// 主进程启动 CS2 前调用：终止子进程预下载 worker。
pub fn release_steam_for_cs2_launch() {
    abort_workshop_prefetch();
}

pub fn cancel_workshop_prefetch_and_wait() {
    abort_workshop_prefetch();

    let deadline = std::time::Instant::now() + Duration::from_secs(1);
    let mut runtime = prefetch_runtime().lock().expect("prefetch runtime poisoned");
    while runtime.running && std::time::Instant::now() < deadline {
        runtime = prefetch_done()
            .wait_timeout(runtime, Duration::from_millis(50))
            .expect("prefetch runtime poisoned")
            .0;
    }

    PREFETCH_CANCELLED.store(false, Ordering::SeqCst);
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopPackRequest {
    pub workshop_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopSyncProgress {
    pub workshop_id: String,
    pub title: String,
    pub phase: String,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopPrefetchFailure {
    pub workshop_id: String,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopPrefetchResult {
    pub ready: Vec<String>,
    pub failed: Vec<WorkshopPrefetchFailure>,
    pub cancelled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum WorkshopWorkerMessage {
    Progress(WorkshopSyncProgress),
    Done(WorkshopPrefetchResult),
    Error { message: String },
}

#[cfg(windows)]
fn kill_prefetch_child() {
    if let Ok(mut slot) = PREFETCH_CHILD.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(not(windows))]
fn kill_prefetch_child() {}

/// 子进程入口：`star-launcher.exe --workshop-prefetch`，stdin 为 packs JSON。
pub fn run_workshop_prefetch_cli() {
    #[cfg(windows)]
    {
        let stdin = std::io::stdin();
        let packs: Vec<WorkshopPackRequest> = match serde_json::from_reader(stdin.lock()) {
            Ok(packs) => packs,
            Err(error) => {
                emit_worker_message(WorkshopWorkerMessage::Error {
                    message: format!("读取预下载参数失败：{error}"),
                });
                std::process::exit(1);
            }
        };

        match run_workshop_prefetch_worker(packs, emit_worker_message, || false) {
            Ok(result) => {
                emit_worker_message(WorkshopWorkerMessage::Done(result));
                std::process::exit(0);
            }
            Err(message) => {
                emit_worker_message(WorkshopWorkerMessage::Error { message });
                std::process::exit(1);
            }
        }
    }
    #[cfg(not(windows))]
    {
        eprintln!("当前平台暂不支持 Workshop 预下载");
        std::process::exit(1);
    }
}

fn emit_worker_message(message: WorkshopWorkerMessage) {
    if let Ok(line) = serde_json::to_string(&message) {
        let mut stdout = std::io::stdout().lock();
        let _ = writeln!(stdout, "{line}");
        let _ = stdout.flush();
    }
}

#[cfg(windows)]
fn run_workshop_prefetch_worker(
    packs: Vec<WorkshopPackRequest>,
    mut emit: impl FnMut(WorkshopWorkerMessage),
    is_cancelled: impl Fn() -> bool,
) -> Result<WorkshopPrefetchResult, String> {
    use steamworks::{Client, ItemState, PublishedFileId};
    use std::time::Instant;

    const CS2_APP_ID: u32 = 730;
    const PER_ITEM_TIMEOUT: Duration = Duration::from_secs(600);
    const CALLBACK_INTERVAL: Duration = Duration::from_millis(50);

    fn parse_workshop_id(value: &str) -> Result<PublishedFileId, String> {
        let trimmed = value.trim();
        if trimmed.is_empty() || !trimmed.chars().all(|character| character.is_ascii_digit()) {
            return Err(format!("Workshop ID 无效：{value}"));
        }
        let id: u64 = trimmed
            .parse()
            .map_err(|_| format!("Workshop ID 无效：{value}"))?;
        if id == 0 {
            return Err(format!("Workshop ID 无效：{value}"));
        }
        Ok(PublishedFileId(id))
    }

    fn is_item_ready(ugc: &steamworks::UGC, item: PublishedFileId) -> bool {
        let state = ugc.item_state(item);
        state.contains(ItemState::INSTALLED)
            && !state.contains(ItemState::NEEDS_UPDATE)
            && !state.contains(ItemState::DOWNLOADING)
            && !state.contains(ItemState::DOWNLOAD_PENDING)
    }

    fn push_progress(
        emit: &mut impl FnMut(WorkshopWorkerMessage),
        progress: WorkshopSyncProgress,
    ) {
        emit(WorkshopWorkerMessage::Progress(progress));
    }

    let client = Client::init_app(CS2_APP_ID).map_err(|error| {
        format!("Steam API 初始化失败，请确认 Steam 已登录并拥有 CS2：{error}")
    })?;
    let ugc = client.ugc();

    let mut ready = Vec::new();
    let mut failed = Vec::new();
    let mut cancelled = false;

    for pack in packs {
        if is_cancelled() {
            cancelled = true;
            break;
        }

        let workshop_id = pack.workshop_id.clone();
        let title = pack.title.clone();
        let file_id = match parse_workshop_id(&workshop_id) {
            Ok(id) => id,
            Err(message) => {
                push_progress(
                    &mut emit,
                    WorkshopSyncProgress {
                        workshop_id: workshop_id.clone(),
                        title: title.clone(),
                        phase: "error".into(),
                        bytes_downloaded: 0,
                        bytes_total: 0,
                        message: Some(message.clone()),
                    },
                );
                failed.push(WorkshopPrefetchFailure {
                    workshop_id,
                    title,
                    message,
                });
                continue;
            }
        };

        push_progress(
            &mut emit,
            WorkshopSyncProgress {
                workshop_id: workshop_id.clone(),
                title: title.clone(),
                phase: "checking".into(),
                bytes_downloaded: 0,
                bytes_total: 0,
                message: None,
            },
        );

        if is_item_ready(&ugc, file_id) {
            push_progress(
                &mut emit,
                WorkshopSyncProgress {
                    workshop_id: workshop_id.clone(),
                    title: title.clone(),
                    phase: "ready".into(),
                    bytes_downloaded: 0,
                    bytes_total: 0,
                    message: None,
                },
            );
            ready.push(workshop_id);
            continue;
        }

        if is_cancelled() {
            cancelled = true;
            break;
        }

        if !ugc.download_item(file_id, true) {
            let message = "无法开始下载（Steam 未登录、无网络或 Workshop ID 无效）".to_string();
            push_progress(
                &mut emit,
                WorkshopSyncProgress {
                    workshop_id: workshop_id.clone(),
                    title: title.clone(),
                    phase: "error".into(),
                    bytes_downloaded: 0,
                    bytes_total: 0,
                    message: Some(message.clone()),
                },
            );
            failed.push(WorkshopPrefetchFailure {
                workshop_id,
                title,
                message,
            });
            continue;
        }

        let deadline = Instant::now() + PER_ITEM_TIMEOUT;
        let mut completed = false;

        while Instant::now() < deadline {
            if is_cancelled() {
                cancelled = true;
                break;
            }

            client.run_callbacks();

            let (bytes_downloaded, bytes_total) =
                ugc.item_download_info(file_id).unwrap_or((0, 0));
            push_progress(
                &mut emit,
                WorkshopSyncProgress {
                    workshop_id: workshop_id.clone(),
                    title: title.clone(),
                    phase: "downloading".into(),
                    bytes_downloaded,
                    bytes_total,
                    message: None,
                },
            );

            if is_item_ready(&ugc, file_id) {
                push_progress(
                    &mut emit,
                    WorkshopSyncProgress {
                        workshop_id: workshop_id.clone(),
                        title: title.clone(),
                        phase: "ready".into(),
                        bytes_downloaded,
                        bytes_total,
                        message: None,
                    },
                );
                ready.push(workshop_id.clone());
                completed = true;
                break;
            }

            std::thread::sleep(CALLBACK_INTERVAL);
        }

        if cancelled {
            break;
        }

        if !completed {
            let message = "下载超时".to_string();
            push_progress(
                &mut emit,
                WorkshopSyncProgress {
                    workshop_id: workshop_id.clone(),
                    title: title.clone(),
                    phase: "error".into(),
                    bytes_downloaded: 0,
                    bytes_total: 0,
                    message: Some(message.clone()),
                },
            );
            failed.push(WorkshopPrefetchFailure {
                workshop_id,
                title,
                message,
            });
        }
    }

    drop(client);
    clear_steam_app_env();

    Ok(WorkshopPrefetchResult {
        ready,
        failed,
        cancelled,
    })
}

fn cancelled_prefetch_result() -> WorkshopPrefetchResult {
    WorkshopPrefetchResult {
        ready: Vec::new(),
        failed: Vec::new(),
        cancelled: true,
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::{
        cancelled_prefetch_result, is_prefetch_cancelled, kill_prefetch_child,
        mark_prefetch_finished, mark_prefetch_started, WorkshopPackRequest, WorkshopPrefetchResult,
        WorkshopWorkerMessage,
    };
    use std::io::{BufRead, Write};
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::sync::mpsc::{self, RecvTimeoutError};
    use std::thread;
    use std::time::Duration;
    use tauri::Emitter;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const READ_POLL_INTERVAL: Duration = Duration::from_millis(100);

    pub fn prefetch_workshop_packs(
        app: &tauri::AppHandle,
        packs: Vec<WorkshopPackRequest>,
    ) -> Result<WorkshopPrefetchResult, String> {
        mark_prefetch_started();

        let result = (|| {
            let exe = std::env::current_exe()
                .map_err(|error| format!("获取登录器路径失败：{error}"))?;
            let input = serde_json::to_vec(&packs)
                .map_err(|error| format!("序列化预下载参数失败：{error}"))?;

            kill_prefetch_child();

            let mut child = Command::new(exe)
                .arg("--workshop-prefetch")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|error| format!("启动 Workshop 预下载进程失败：{error}"))?;

            if let Some(mut stdin) = child.stdin.take() {
                stdin
                    .write_all(&input)
                    .map_err(|error| format!("传递预下载参数失败：{error}"))?;
            }

            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| "读取预下载输出失败".to_string())?;

            if let Ok(mut slot) = super::PREFETCH_CHILD.lock() {
                *slot = Some(child);
            }

            let (line_tx, line_rx) = mpsc::channel();
            let reader = thread::spawn(move || {
                let mut reader = std::io::BufReader::new(stdout);
                let mut line = String::new();
                loop {
                    line.clear();
                    match reader.read_line(&mut line) {
                        Ok(0) => break,
                        Ok(_) => {
                            if line_tx.send(line.clone()).is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            });

            let mut final_result: Option<WorkshopPrefetchResult> = None;
            let mut fatal_error: Option<String> = None;
            let mut reader_finished = false;

            loop {
                if is_prefetch_cancelled() {
                    kill_prefetch_child();
                    let _ = reader.join();
                    return Ok(cancelled_prefetch_result());
                }

                match line_rx.recv_timeout(READ_POLL_INTERVAL) {
                    Ok(line) => {
                        let message: WorkshopWorkerMessage = match serde_json::from_str(line.trim()) {
                            Ok(message) => message,
                            Err(_) => continue,
                        };

                        match message {
                            WorkshopWorkerMessage::Progress(progress) => {
                                let _ = app.emit("workshop-sync-progress", &progress);
                            }
                            WorkshopWorkerMessage::Done(result) => {
                                final_result = Some(result);
                            }
                            WorkshopWorkerMessage::Error { message } => {
                                fatal_error = Some(message);
                            }
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => continue,
                    Err(RecvTimeoutError::Disconnected) => {
                        reader_finished = true;
                        break;
                    }
                }
            }

            kill_prefetch_child();
            let _ = reader.join();

            if is_prefetch_cancelled() || (reader_finished && final_result.is_none()) {
                return Ok(cancelled_prefetch_result());
            }

            if let Some(message) = fatal_error {
                return Err(message);
            }

            final_result.ok_or_else(|| "预下载进程未返回结果".to_string())
        })();

        mark_prefetch_finished();
        result
    }
}

#[tauri::command]
pub fn stop_workshop_prefetch() {
    abort_workshop_prefetch();
}

#[tauri::command]
pub fn cancel_workshop_prefetch() {
    cancel_workshop_prefetch_and_wait();
}

#[tauri::command]
pub async fn prefetch_workshop_packs(
    app: tauri::AppHandle,
    packs: Vec<WorkshopPackRequest>,
) -> Result<WorkshopPrefetchResult, String> {
    #[cfg(windows)]
    {
        cancel_workshop_prefetch_and_wait();
        PREFETCH_CANCELLED.store(false, Ordering::SeqCst);
        tauri::async_runtime::spawn_blocking(move || {
            windows_impl::prefetch_workshop_packs(&app, packs)
        })
        .await
        .map_err(|error| format!("Workshop 预下载任务异常结束：{error}"))?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, packs);
        Err("当前平台暂不支持 Workshop 预下载".to_string())
    }
}

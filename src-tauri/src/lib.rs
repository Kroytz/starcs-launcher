use serde::{Deserialize, Serialize};
use std::{
    net::{ToSocketAddrs, UdpSocket},
    time::{Duration, Instant},
};

mod steam;

// Tauri embeds the current frontend dist into the release binary during compilation.

const STAR_SERVERS_URL: &str = "https://api.starcs.cn/api/v1/servers";
const DEFAULT_LAUNCHER_BACKEND_URL: &str = "http://127.0.0.1:8080";
const A2S_TIMEOUT: Duration = Duration::from_millis(1_500);
const A2S_INFO_QUERY: &[u8] = b"\xFF\xFF\xFF\xFFTSource Engine Query\x00";

#[derive(Debug, Deserialize)]
struct ApiEnvelope<T> {
    code: i32,
    msg: String,
    data: T,
}

#[derive(Debug, Deserialize)]
struct OptionalApiEnvelope<T> {
    code: i32,
    msg: String,
    data: Option<T>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StarServer {
    title: String,
    ip: String,
    port: u16,
    player_number: PlayerNumber,
    map: ServerMap,
    mode: String,
    #[serde(default)]
    ping: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerNumber {
    cur_number: u32,
    max_number: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerMap {
    name: String,
    short_name: String,
    win_round_ct: u32,
    win_round_t: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherBootstrap {
    app: LauncherAppConfig,
    announcements: Vec<LauncherAnnouncement>,
    account: LauncherAccount,
    store_items: Vec<LauncherStoreItem>,
    inventory: Vec<LauncherInventoryItem>,
    maps: Vec<LauncherMapResource>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherAppConfig {
    name: String,
    website_url: String,
    recharge_enabled: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherAnnouncement {
    id: String,
    title: String,
    content: String,
    level: String,
    dismissible: bool,
    display_date: String,
    published_at: String,
    cover_image_url: String,
    detail_image_url: String,
    render_payload: Option<LauncherAnnouncementPayload>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherAnnouncementPayload {
    sections: Option<Vec<LauncherAnnouncementSection>>,
    footer_message: Option<String>,
    footer_team_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherAnnouncementSection {
    title: Option<String>,
    section_type: Option<i32>,
    blocks: Option<Vec<LauncherAnnouncementBlock>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherAnnouncementBlock {
    kind: i32,
    text: Option<String>,
    image_id: Option<u64>,
    image_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherAccount {
    profile: LauncherProfile,
    wallet: LauncherWallet,
    exchange_rates: Vec<LauncherExchangeRate>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherProfile {
    user_id: String,
    display_name: String,
    verified: bool,
    member_level: u32,
    community_level: u32,
    play_hours: u32,
    achievements: u32,
    steam_connected: bool,
    avatar_url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherWallet {
    star_coin: i64,
    starlight: i64,
    stardust: i64,
    star_coin_available: bool,
    starlight_available: bool,
    stardust_available: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherExchangeRate {
    from: String,
    to: String,
    rate: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherStoreItem {
    id: String,
    external_id: String,
    currency: String,
    category: String,
    purchase_backend: String,
    #[serde(default)]
    purchase_url: String,
    title: String,
    description: String,
    price: i64,
    icon: String,
    tone: String,
    tag: String,
    enabled: bool,
    sort: i32,
    image_url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherInventoryItem {
    product_id: Option<i64>,
    id: String,
    source: String,
    unique_id: String,
    name: String,
    r#type: String,
    rarity: String,
    quantity: i64,
    icon: String,
    tone: String,
    acquired_at: String,
    #[serde(default)]
    mode: String,
    #[serde(default)]
    use_limit: i32,
    #[serde(default)]
    use_limit_info: String,
    #[serde(default)]
    weapon_prefab: String,
    #[serde(default)]
    weapon_type: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherLoginSession {
    token: String,
    expires_at: String,
    account: LauncherAccount,
    inventory: Vec<LauncherInventoryItem>,
    purchase_history: Vec<LauncherPurchaseHistoryItem>,
    season_pass: LauncherSeasonPass,
    penalties: Vec<LauncherPenalty>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherMapResource {
    id: u64,
    name: String,
    short_name: String,
    workshop_id: String,
    difficulty: String,
    description: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherPurchaseHistoryItem {
    id: u64,
    product_name: String,
    currency_type: String,
    quantity: u64,
    days: i32,
    total_price: i64,
    state: i32,
    description: String,
    created_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherSeasonPass {
    available: bool,
    season_id: i32,
    pass_type: i32,
    level: i32,
    experience: i32,
    claimed_reward_count: i32,
    star_source_chest_opened: i32,
    daily_games: i32,
    daily_online_minutes: i32,
    weekly_games: i32,
    weekly_completed_modes: i32,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherPenalty {
    r#type: String,
    reason: String,
    mode: String,
    permanent: bool,
    expires_at: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherLoginRequest {
    steam_id: String,
    password: String,
}

#[derive(Serialize)]
struct LauncherPasswordVerificationRequest {
    password: String,
}

#[derive(Deserialize, Serialize)]
struct LauncherPasswordVerification {
    valid: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherEquipmentMutationRequest {
    product_id: i64,
    modes: Vec<String>,
    team: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherEquipmentCommandResult {
    authenticated: bool,
    equipment: Option<serde_json::Value>,
}

fn query_a2s_latency(ip: &str, port: u16) -> Option<u64> {
    let server_addr = format!("{ip}:{port}").to_socket_addrs().ok()?.next()?;
    let bind_addr = if server_addr.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    };
    let socket = UdpSocket::bind(bind_addr).ok()?;
    socket.set_read_timeout(Some(A2S_TIMEOUT)).ok()?;
    socket.set_write_timeout(Some(A2S_TIMEOUT)).ok()?;
    socket.connect(server_addr).ok()?;

    let started_at = Instant::now();
    socket.send(A2S_INFO_QUERY).ok()?;

    let mut response = [0_u8; 2_048];
    let mut received = socket.recv(&mut response).ok()?;

    // Some Source servers require a challenge before answering A2S_INFO.
    if received >= 9 && response[..4] == [0xFF; 4] && response[4] == 0x41 {
        let mut challenged_query = Vec::with_capacity(A2S_INFO_QUERY.len() + 4);
        challenged_query.extend_from_slice(A2S_INFO_QUERY);
        challenged_query.extend_from_slice(&response[5..9]);
        socket.send(&challenged_query).ok()?;
        received = socket.recv(&mut response).ok()?;
    }

    (received >= 5).then(|| started_at.elapsed().as_millis() as u64)
}

#[tauri::command]
async fn fetch_star_servers() -> Result<Vec<StarServer>, String> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败：{error}"))?
        .get(STAR_SERVERS_URL)
        .send()
        .await
        .map_err(|error| format!("获取服务器列表失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("服务器列表接口返回错误：{error}"))?
        .json::<ApiEnvelope<Vec<StarServer>>>()
        .await
        .map_err(|error| format!("解析服务器列表失败：{error}"))?;

    if response.code != 2000 {
        return Err(format!("服务器列表接口错误：{}", response.msg));
    }

    let ping_tasks = response
        .data
        .into_iter()
        .map(|mut server| {
            tauri::async_runtime::spawn_blocking(move || {
                server.ping = query_a2s_latency(&server.ip, server.port);
                server
            })
        })
        .collect::<Vec<_>>();

    let mut servers = Vec::with_capacity(ping_tasks.len());
    for task in ping_tasks {
        servers.push(
            task.await
                .map_err(|error| format!("A2S 查询任务失败：{error}"))?,
        );
    }

    Ok(servers)
}

#[tauri::command]
async fn fetch_launcher_bootstrap() -> Result<LauncherBootstrap, String> {
    let backend_url = std::env::var("STAR_LAUNCHER_BACKEND_URL")
        .unwrap_or_else(|_| DEFAULT_LAUNCHER_BACKEND_URL.to_string());
    let request_url = format!("{}/api/v1/bootstrap", backend_url.trim_end_matches('/'));
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("创建登录器后端 HTTP 客户端失败：{error}"))?
        .get(&request_url)
        .send()
        .await
        .map_err(|error| format!("连接登录器后端失败（{request_url}）：{error}"))?
        .error_for_status()
        .map_err(|error| format!("登录器后端返回 HTTP 错误：{error}"))?
        .json::<ApiEnvelope<LauncherBootstrap>>()
        .await
        .map_err(|error| format!("解析登录器后端数据失败：{error}"))?;

    if response.code != 2000 {
        return Err(format!("登录器后端接口错误：{}", response.msg));
    }

    Ok(response.data)
}

#[tauri::command]
async fn login_launcher_account(
    steam_id: String,
    password: String,
) -> Result<LauncherLoginSession, String> {
    let backend_url = std::env::var("STAR_LAUNCHER_BACKEND_URL")
        .unwrap_or_else(|_| DEFAULT_LAUNCHER_BACKEND_URL.to_string());
    let request_url = format!("{}/api/v1/auth/login", backend_url.trim_end_matches('/'));
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| format!("创建登录请求客户端失败：{error}"))?
        .post(&request_url)
        .json(&LauncherLoginRequest { steam_id, password })
        .send()
        .await
        .map_err(|error| format!("连接登录器后端失败（{request_url}）：{error}"))?;
    let status = response.status();
    let payload = response
        .json::<OptionalApiEnvelope<LauncherLoginSession>>()
        .await
        .map_err(|error| format!("解析登录响应失败：{error}"))?;
    if !status.is_success() || payload.code != 2000 {
        return Err(payload.msg);
    }
    payload.data.ok_or_else(|| "登录响应缺少会话数据".to_string())
}

#[tauri::command]
async fn verify_launcher_password(token: String, password: String) -> Result<bool, String> {
    let backend_url = std::env::var("STAR_LAUNCHER_BACKEND_URL")
        .unwrap_or_else(|_| DEFAULT_LAUNCHER_BACKEND_URL.to_string());
    let request_url = format!("{}/api/v1/auth/verify", backend_url.trim_end_matches('/'));
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| format!("创建密码复验客户端失败：{error}"))?
        .post(&request_url)
        .bearer_auth(token)
        .json(&LauncherPasswordVerificationRequest { password })
        .send()
        .await
        .map_err(|error| format!("连接登录器后端失败（{request_url}）：{error}"))?;
    let status = response.status();
    let payload = response
        .json::<OptionalApiEnvelope<LauncherPasswordVerification>>()
        .await
        .map_err(|error| format!("解析密码复验响应失败：{error}"))?;
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Ok(false);
    }
    if !status.is_success() || payload.code != 2000 {
        return Err(payload.msg);
    }
    Ok(payload.data.is_some_and(|data| data.valid))
}

#[tauri::command]
async fn fetch_launcher_equipment(
    token: String,
    password: String,
) -> Result<LauncherEquipmentCommandResult, String> {
    let backend_url = std::env::var("STAR_LAUNCHER_BACKEND_URL")
        .unwrap_or_else(|_| DEFAULT_LAUNCHER_BACKEND_URL.to_string());
    let request_url = format!("{}/api/v1/me/equipment", backend_url.trim_end_matches('/'));
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("创建装备请求客户端失败：{error}"))?
        .get(&request_url)
        .bearer_auth(token)
        .header("X-StarCS-Reauth", password)
        .send()
        .await
        .map_err(|error| format!("连接装备配置服务失败（{request_url}）：{error}"))?;
    parse_equipment_response(response).await
}

#[tauri::command]
async fn update_launcher_equipment(
    token: String,
    password: String,
    product_id: i64,
    modes: Vec<String>,
    team: String,
    equip: bool,
) -> Result<LauncherEquipmentCommandResult, String> {
    let backend_url = std::env::var("STAR_LAUNCHER_BACKEND_URL")
        .unwrap_or_else(|_| DEFAULT_LAUNCHER_BACKEND_URL.to_string());
    let action = if equip { "equip" } else { "unequip" };
    let request_url = format!(
        "{}/api/v1/me/equipment/{action}",
        backend_url.trim_end_matches('/')
    );
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("创建装备请求客户端失败：{error}"))?
        .post(&request_url)
        .bearer_auth(token)
        .header("X-StarCS-Reauth", password)
        .json(&LauncherEquipmentMutationRequest {
            product_id,
            modes,
            team,
        })
        .send()
        .await
        .map_err(|error| format!("连接装备配置服务失败（{request_url}）：{error}"))?;
    parse_equipment_response(response).await
}

async fn parse_equipment_response(
    response: reqwest::Response,
) -> Result<LauncherEquipmentCommandResult, String> {
    let status = response.status();
    let payload = response
        .json::<OptionalApiEnvelope<serde_json::Value>>()
        .await
        .map_err(|error| format!("解析装备配置响应失败：{error}"))?;
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Ok(LauncherEquipmentCommandResult {
            authenticated: false,
            equipment: None,
        });
    }
    if !status.is_success() || payload.code != 2000 {
        return Err(payload.msg);
    }
    let equipment = payload
        .data
        .ok_or_else(|| "装备配置响应缺少数据".to_string())?;
    Ok(LauncherEquipmentCommandResult {
        authenticated: true,
        equipment: Some(equipment),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_star_servers,
            fetch_launcher_bootstrap,
            login_launcher_account,
            verify_launcher_password,
            fetch_launcher_equipment,
            update_launcher_equipment,
            steam::get_local_steam_account,
            steam::load_remembered_password,
            steam::update_remembered_password,
            steam::launch_cs2_and_connect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

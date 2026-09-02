use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSteamAccount {
    pub steam_id: String,
    pub account_name: String,
    pub persona_name: String,
    pub avatar_data_url: Option<String>,
}

#[cfg(windows)]
mod windows_impl {
    use super::LocalSteamAccount;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::{
        env, fs, io,
        net::SocketAddr,
        path::{Path, PathBuf},
        process::Command,
        slice,
        thread,
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, LocalFree, HWND, LPARAM, INVALID_HANDLE_VALUE},
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
            CRYPTPROTECT_UI_FORBIDDEN,
        },
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowThreadProcessId, IsHungAppWindow, IsWindowVisible,
        },
    };
    use winreg::{
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY},
        RegKey,
    };

    const CREDENTIAL_ENTROPY: &[u8] = b"STAR Launcher Steam Password v1";
    const CS2_READY_TIMEOUT: Duration = Duration::from_secs(180);
    const CS2_INITIALIZATION_GRACE: Duration = Duration::from_secs(8);

    #[derive(Default)]
    struct SteamCandidate {
        steam_id: String,
        account_name: String,
        persona_name: String,
        most_recent: bool,
        timestamp: u64,
    }

    pub fn get_local_steam_account() -> Result<Option<LocalSteamAccount>, String> {
        let Some(steam_path) = find_steam_path() else {
            return Ok(None);
        };
        let login_users_path = steam_path.join("config").join("loginusers.vdf");
        let contents = fs::read(&login_users_path)
            .map_err(|error| format!("读取 Steam 登录信息失败：{error}"))?;
        let contents = String::from_utf8_lossy(&contents);
        let mut candidates = parse_login_users(&contents);
        if candidates.is_empty() {
            return Ok(None);
        }
        candidates.sort_by_key(|candidate| (candidate.most_recent, candidate.timestamp));
        let candidate = candidates.pop().expect("candidate list is not empty");
        let persona_name = if candidate.persona_name.trim().is_empty() {
            candidate.account_name.clone()
        } else {
            candidate.persona_name
        };
        let avatar_path = steam_path
            .join("config")
            .join("avatarcache")
            .join(format!("{}.png", candidate.steam_id));
        let avatar_data_url = read_avatar_data_url(&avatar_path);

        Ok(Some(LocalSteamAccount {
            steam_id: candidate.steam_id,
            account_name: candidate.account_name,
            persona_name,
            avatar_data_url,
        }))
    }

    pub fn launch_cs2_and_connect(address: &str) -> Result<(), String> {
        crate::workshop::release_steam_for_cs2_launch();

        address
            .parse::<SocketAddr>()
            .map_err(|_| "服务器地址格式无效".to_string())?;

        let steam_path = find_steam_path().ok_or_else(|| "未找到 Steam 安装目录".to_string())?;
        let steam_exe = steam_path.join("steam.exe");
        if !steam_exe.is_file() {
            return Err("Steam 安装目录中不存在 steam.exe".to_string());
        }

        let process_ids = cs2_process_ids().map_err(|error| format!("检测 CS2 进程失败：{error}"))?;
        let already_ready = process_ids.iter().copied().any(cs2_has_ready_window);

        if !already_ready && process_ids.is_empty() {
            Command::new(&steam_exe)
                .args(["-applaunch", "730", "-worldwide"])
                .spawn()
                .map_err(|error| format!("通过 Steam 启动 CS2 失败：{error}"))?;
        }

        if !already_ready {
            let deadline = Instant::now() + CS2_READY_TIMEOUT;
            loop {
                let ready = cs2_process_ids()
                    .map_err(|error| format!("检测 CS2 进程失败：{error}"))?
                    .into_iter()
                    .any(cs2_has_ready_window);
                if ready {
                    break;
                }
                if Instant::now() >= deadline {
                    return Err("等待 CS2 初始化超时，请确认游戏和 Steam 没有弹出错误窗口".to_string());
                }
                thread::sleep(Duration::from_secs(1));
            }

            // CS2 的主窗口出现时控制台命令队列仍可能尚未就绪，留出短暂缓冲后再连接。
            thread::sleep(CS2_INITIALIZATION_GRACE);
        }

        Command::new(&steam_exe)
            .arg(format!("steam://connect/{address}"))
            .spawn()
            .map_err(|error| format!("向 Steam 发送服务器连接请求失败：{error}"))?;
        Ok(())
    }

    pub fn load_remembered_password(
        app_data_dir: &Path,
        steam_id: &str,
    ) -> Result<Option<String>, String> {
        validate_steam_id(steam_id)?;
        let path = credential_path(app_data_dir, steam_id);
        if !path.is_file() {
            return Ok(None);
        }
        let encrypted = fs::read(path).map_err(|error| format!("读取 App 密码数据失败：{error}"))?;
        let decrypted = unprotect_data(&encrypted)
            .map_err(|error| format!("解密 App 密码数据失败：{error}"))?;
        String::from_utf8(decrypted)
            .map(Some)
            .map_err(|error| format!("App 密码数据格式无效：{error}"))
    }

    pub fn update_remembered_password(
        app_data_dir: &Path,
        steam_id: &str,
        password: Option<&str>,
    ) -> Result<(), String> {
        validate_steam_id(steam_id)?;
        let path = credential_path(app_data_dir, steam_id);
        match password {
            Some(password) if !password.is_empty() => {
                if password.len() > 256 {
                    return Err("密码长度不能超过 256 字节".to_string());
                }
                let encrypted = protect_data(password.as_bytes())
                    .map_err(|error| format!("加密 App 密码数据失败：{error}"))?;
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("创建 App 密码目录失败：{error}"))?;
                }
                fs::write(path, encrypted)
                    .map_err(|error| format!("保存 App 密码数据失败：{error}"))
            }
            _ => match fs::remove_file(path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(format!("删除 App 密码数据失败：{error}")),
            },
        }
    }

    fn find_steam_path() -> Option<PathBuf> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey_with_flags("Software\\Valve\\Steam", KEY_READ) {
            if let Ok(path) = key.get_value::<String, _>("SteamPath") {
                let path = PathBuf::from(path);
                if is_steam_root(&path) {
                    return Some(path);
                }
            }
            if let Ok(executable) = key.get_value::<String, _>("SteamExe") {
                if let Some(parent) = Path::new(&executable).parent() {
                    if is_steam_root(parent) {
                        return Some(parent.to_path_buf());
                    }
                }
            }
        }

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        for flags in [KEY_READ | KEY_WOW64_32KEY, KEY_READ] {
            if let Ok(key) = hklm.open_subkey_with_flags("SOFTWARE\\Valve\\Steam", flags) {
                if let Ok(path) = key.get_value::<String, _>("InstallPath") {
                    let path = PathBuf::from(path);
                    if is_steam_root(&path) {
                        return Some(path);
                    }
                }
            }
        }

        let common_path = [env::var_os("ProgramFiles(x86)"), env::var_os("ProgramFiles")]
            .into_iter()
            .flatten()
            .map(PathBuf::from)
            .map(|path| path.join("Steam"))
            .find(|path| is_steam_root(path));
        if common_path.is_some() {
            return common_path;
        }

        for drive in b'C'..=b'Z' {
            let root = format!("{}:\\", drive as char);
            for relative in [
                "Steam",
                "Games\\Steam",
                "Program Files\\Steam",
                "Program Files (x86)\\Steam",
            ] {
                let candidate = PathBuf::from(&root).join(relative);
                if is_steam_root(&candidate) {
                    return Some(candidate);
                }
            }
        }
        None
    }

    fn cs2_process_ids() -> io::Result<Vec<u32>> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }

        let mut process_ids = Vec::new();
        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut has_entry = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
        while has_entry {
            let name_end = entry
                .szExeFile
                .iter()
                .position(|character| *character == 0)
                .unwrap_or(entry.szExeFile.len());
            if String::from_utf16_lossy(&entry.szExeFile[..name_end]).eq_ignore_ascii_case("cs2.exe") {
                process_ids.push(entry.th32ProcessID);
            }
            has_entry = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
        }
        unsafe { CloseHandle(snapshot) };
        Ok(process_ids)
    }

    struct WindowSearch {
        process_id: u32,
        found: bool,
    }

    unsafe extern "system" fn find_ready_window(window: HWND, parameter: LPARAM) -> i32 {
        let search = &mut *(parameter as *mut WindowSearch);
        let mut process_id = 0;
        GetWindowThreadProcessId(window, &mut process_id);
        if process_id == search.process_id
            && IsWindowVisible(window) != 0
            && IsHungAppWindow(window) == 0
        {
            search.found = true;
            return 0;
        }
        1
    }

    fn cs2_has_ready_window(process_id: u32) -> bool {
        let mut search = WindowSearch {
            process_id,
            found: false,
        };
        unsafe {
            EnumWindows(
                Some(find_ready_window),
                (&mut search as *mut WindowSearch) as LPARAM,
            )
        };
        search.found
    }

    fn is_steam_root(path: &Path) -> bool {
        path.join("config").join("loginusers.vdf").is_file()
    }

    fn parse_login_users(contents: &str) -> Vec<SteamCandidate> {
        let mut candidates = Vec::new();
        let mut pending_steam_id: Option<String> = None;
        let mut current: Option<SteamCandidate> = None;

        for line in contents.lines() {
            let trimmed = line.trim();
            let values = quoted_values(trimmed);

            if let Some(candidate) = current.as_mut() {
                if trimmed == "}" {
                    candidates.push(current.take().expect("current candidate exists"));
                    continue;
                }
                if values.len() >= 2 {
                    match values[0].as_str() {
                        "AccountName" => candidate.account_name = values[1].clone(),
                        "PersonaName" => candidate.persona_name = values[1].clone(),
                        "MostRecent" => candidate.most_recent = values[1] == "1",
                        "Timestamp" => candidate.timestamp = values[1].parse().unwrap_or_default(),
                        _ => {}
                    }
                }
                continue;
            }

            if trimmed == "{" {
                if let Some(steam_id) = pending_steam_id.take() {
                    current = Some(SteamCandidate {
                        steam_id,
                        ..SteamCandidate::default()
                    });
                }
                continue;
            }

            if values.len() == 1 && is_steam_id(&values[0]) {
                pending_steam_id = Some(values[0].clone());
            }
        }

        candidates
    }

    fn quoted_values(line: &str) -> Vec<String> {
        let mut values = Vec::new();
        let mut chars = line.chars().peekable();
        while let Some(character) = chars.next() {
            if character != '"' {
                continue;
            }
            let mut value = String::new();
            while let Some(character) = chars.next() {
                match character {
                    '\\' => {
                        if let Some(escaped) = chars.next() {
                            value.push(escaped);
                        }
                    }
                    '"' => break,
                    _ => value.push(character),
                }
            }
            values.push(value);
        }
        values
    }

    fn read_avatar_data_url(path: &Path) -> Option<String> {
        let bytes = fs::read(path).ok()?;
        Some(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
    }

    fn is_steam_id(value: &str) -> bool {
        value.len() == 17 && value.starts_with("7656119") && value.bytes().all(|byte| byte.is_ascii_digit())
    }

    fn validate_steam_id(value: &str) -> Result<(), String> {
        if is_steam_id(value) {
            Ok(())
        } else {
            Err("Steam64 格式无效".to_string())
        }
    }

    fn credential_path(app_data_dir: &Path, steam_id: &str) -> PathBuf {
        app_data_dir
            .join("credentials")
            .join(format!("steam-{steam_id}.bin"))
    }

    fn protect_data(data: &[u8]) -> io::Result<Vec<u8>> {
        let mut input = data.to_vec();
        let mut entropy = CREDENTIAL_ENTROPY.to_vec();
        let input_blob = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_mut_ptr(),
        };
        let entropy_blob = CRYPT_INTEGER_BLOB {
            cbData: entropy.len() as u32,
            pbData: entropy.as_mut_ptr(),
        };
        let mut output_blob = CRYPT_INTEGER_BLOB::default();
        if unsafe {
            CryptProtectData(
                &input_blob,
                std::ptr::null(),
                &entropy_blob,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output_blob,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let encrypted = unsafe {
            slice::from_raw_parts(output_blob.pbData, output_blob.cbData as usize).to_vec()
        };
        unsafe { LocalFree(output_blob.pbData.cast()) };
        Ok(encrypted)
    }

    fn unprotect_data(data: &[u8]) -> io::Result<Vec<u8>> {
        let mut input = data.to_vec();
        let mut entropy = CREDENTIAL_ENTROPY.to_vec();
        let input_blob = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_mut_ptr(),
        };
        let entropy_blob = CRYPT_INTEGER_BLOB {
            cbData: entropy.len() as u32,
            pbData: entropy.as_mut_ptr(),
        };
        let mut output_blob = CRYPT_INTEGER_BLOB::default();
        if unsafe {
            CryptUnprotectData(
                &input_blob,
                std::ptr::null_mut(),
                &entropy_blob,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output_blob,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let decrypted = unsafe {
            slice::from_raw_parts(output_blob.pbData, output_blob.cbData as usize).to_vec()
        };
        unsafe { LocalFree(output_blob.pbData.cast()) };
        Ok(decrypted)
    }

    #[cfg(test)]
    mod tests {
        use super::{parse_login_users, protect_data, unprotect_data};

        #[test]
        fn parses_steam_login_users() {
            let contents = r#"
                "users"
                {
                    "76561198000000001"
                    {
                        "AccountName" "first"
                        "PersonaName" "First Player"
                        "Timestamp" "100"
                    }
                    "76561198000000002"
                    {
                        "AccountName" "second"
                        "PersonaName" "Second Player"
                        "MostRecent" "1"
                        "Timestamp" "200"
                    }
                }
            "#;
            let accounts = parse_login_users(contents);
            assert_eq!(accounts.len(), 2);
            assert_eq!(accounts[1].steam_id, "76561198000000002");
            assert_eq!(accounts[1].persona_name, "Second Player");
            assert!(accounts[1].most_recent);
        }

        #[test]
        fn protects_and_unprotects_app_password() {
            let password = b"local-demo-password";
            let encrypted = protect_data(password).expect("password should encrypt");
            assert_ne!(encrypted, password);
            let decrypted = unprotect_data(&encrypted).expect("password should decrypt");
            assert_eq!(decrypted, password);
        }
    }
}

#[tauri::command]
pub fn get_local_steam_account() -> Result<Option<LocalSteamAccount>, String> {
    #[cfg(windows)]
    {
        windows_impl::get_local_steam_account()
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub fn load_remembered_password(
    app: tauri::AppHandle,
    steam_id: String,
) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let app_data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("获取 App 数据目录失败：{error}"))?;
        windows_impl::load_remembered_password(&app_data_dir, &steam_id)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, steam_id);
        Ok(None)
    }
}

#[tauri::command]
pub fn update_remembered_password(
    app: tauri::AppHandle,
    steam_id: String,
    password: Option<String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let app_data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("获取 App 数据目录失败：{error}"))?;
        windows_impl::update_remembered_password(
            &app_data_dir,
            &steam_id,
            password.as_deref(),
        )
    }
    #[cfg(not(windows))]
    {
        let _ = (app, steam_id, password);
        Err("当前平台暂不支持安全保存密码".to_string())
    }
}

#[tauri::command]
pub async fn launch_cs2_and_connect(address: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || {
            windows_impl::launch_cs2_and_connect(&address)
        })
        .await
        .map_err(|error| format!("CS2 启动任务异常结束：{error}"))?
    }
    #[cfg(not(windows))]
    {
        let _ = address;
        Err("当前平台暂不支持自动启动并连接 CS2".to_string())
    }
}

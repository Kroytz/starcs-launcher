fn main() {
    #[cfg(target_os = "windows")]
    copy_steam_api_dll();

    tauri_build::build();
}

#[cfg(target_os = "windows")]
fn steam_api64_source(manifest_dir: &std::path::Path) -> std::path::PathBuf {
    use std::path::PathBuf;

    let vendored = manifest_dir.join("vendor").join("steam_api64.dll");
    if vendored.is_file() {
        return vendored;
    }

    find_steam_api64_in_registry().unwrap_or_else(|| {
        panic!(
            "steam_api64.dll not found. Place it at {} or install the steamworks-sys crate.",
            vendored.display()
        )
    })
}

#[cfg(target_os = "windows")]
fn copy_steam_api_dll() {
    use std::collections::BTreeSet;
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let profile = env::var("PROFILE").expect("PROFILE");
    let dll_src = steam_api64_source(&manifest_dir);

    let mut destinations = BTreeSet::new();
    destinations.insert(manifest_dir.join("target").join(&profile).join("steam_api64.dll"));

    if let Ok(out_dir) = env::var("OUT_DIR") {
        if let Some(target_dir) = PathBuf::from(out_dir).ancestors().nth(3) {
            destinations.insert(target_dir.join("steam_api64.dll"));
        }
    }

    if let Ok(target_dir) = env::var("CARGO_TARGET_DIR") {
        destinations.insert(PathBuf::from(target_dir).join(&profile).join("steam_api64.dll"));
    }

    for dll_dst in destinations {
        if let Some(parent) = dll_dst.parent() {
            fs::create_dir_all(parent).expect("create target profile directory");
        }

        fs::copy(&dll_src, &dll_dst).unwrap_or_else(|error| {
            panic!(
                "failed to copy steam_api64.dll from {} to {}: {error}",
                dll_src.display(),
                dll_dst.display()
            );
        });
    }

    println!("cargo:rerun-if-changed={}", dll_src.display());
}

#[cfg(target_os = "windows")]
fn find_steam_api64_in_registry() -> Option<std::path::PathBuf> {
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    let cargo_home = env::var("CARGO_HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(|| {
            env::var("USERPROFILE")
                .ok()
                .map(|home| PathBuf::from(home).join(".cargo"))
        })?;

    let registry = cargo_home.join("registry/src/index.crates.io-1949cf8c6b5b557f");
    let entries = fs::read_dir(&registry).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("steamworks-sys-") {
            continue;
        }
        let dll = entry
            .path()
            .join("lib/steam/redistributable_bin/win64/steam_api64.dll");
        if dll.is_file() {
            return Some(dll);
        }
    }

    None
}

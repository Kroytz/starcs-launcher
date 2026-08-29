import { invoke } from "@tauri-apps/api/core"

export type LocalSteamAccount = {
  steamId: string
  accountName: string
  personaName: string
  avatarDataUrl: string | null
}

export async function getLocalSteamAccount() {
  return invoke<LocalSteamAccount | null>("get_local_steam_account")
}

export async function loadRememberedPassword(steamId: string) {
  return invoke<string | null>("load_remembered_password", { steamId })
}

export async function updateRememberedPassword(steamId: string, password: string | null) {
  return invoke<void>("update_remembered_password", { steamId, password })
}

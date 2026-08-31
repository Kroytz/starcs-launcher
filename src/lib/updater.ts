import { getVersion } from "@tauri-apps/api/app"
import { invoke } from "@tauri-apps/api/core"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"

export type LauncherUpdatePolicy = {
  currentVersion: string
  latestVersion: string
  mandatory: boolean
  changelog: string
  pubDate: string
}

const PENDING_UPDATE_KEY = "starcs.pending-update-changelog"

export function fetchLauncherUpdatePolicy() {
  return invoke<LauncherUpdatePolicy>("fetch_launcher_update_policy")
}

/** 检查更新；dev 模式下永远返回 null（updater 在 dev 下不可用）。 */
export async function checkLauncherUpdate(): Promise<Update | null> {
  if (import.meta.env.DEV) return null
  return check()
}

/**
 * 下载并安装更新。onProgress 收到 0-100 的百分比；
 * 服务端未返回 contentLength 时回调 null，调用方应展示不确定进度。
 */
export async function downloadAndInstallUpdate(update: Update, onProgress: (percent: number | null) => void) {
  let downloaded = 0
  let contentLength: number | undefined
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength
        onProgress(contentLength ? 0 : null)
        break
      case "Progress":
        downloaded += event.data.chunkLength
        onProgress(contentLength ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : null)
        break
      case "Finished":
        onProgress(100)
        break
    }
  })
}

/** 重启前记录即将进入的版本号，供下次启动判断"刚更新完成"并展示 changelog。 */
export function markPendingUpdateChangelog(version: string) {
  try {
    window.localStorage.setItem(PENDING_UPDATE_KEY, version)
  } catch {
    // localStorage 不可用时仅丢失更新完成提示，不影响更新本身
  }
}

/** 返回 true 表示本次启动是刚更新完成后的首次启动，并清除标记。 */
export async function consumePendingUpdateChangelog() {
  try {
    const pending = window.localStorage.getItem(PENDING_UPDATE_KEY)
    if (!pending) return false
    window.localStorage.removeItem(PENDING_UPDATE_KEY)
    return pending === (await getVersion())
  } catch {
    return false
  }
}

export { relaunch }

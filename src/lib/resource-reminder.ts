const STORAGE_KEY = "starcs.resource-reminder.dismissed-modes"

function normalizeMode(mode: string) {
  return mode.trim().toUpperCase()
}

function loadDismissedModes() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return new Set<string>()
    const modes = JSON.parse(stored)
    if (!Array.isArray(modes)) return new Set<string>()
    return new Set(modes.filter((mode): mode is string => typeof mode === "string").map(normalizeMode))
  } catch (error) {
    console.error("[StarCS Launcher] 读取资源提醒偏好失败", error)
    return new Set<string>()
  }
}

export function isResourceReminderDismissed(mode: string) {
  return loadDismissedModes().has(normalizeMode(mode))
}

export function dismissResourceReminder(mode: string) {
  const modes = loadDismissedModes()
  modes.add(normalizeMode(mode))
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...modes].sort()))
  } catch (error) {
    console.error("[StarCS Launcher] 保存资源提醒偏好失败", error)
  }
}

export type ThemePreference = "system" | "light" | "dark"
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "star-launcher-theme"

export function getThemePreference(): ThemePreference {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === "light" || stored === "dark" ? stored : "system"
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference)
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.dataset.theme = resolved
  root.dataset.themePreference = preference
  root.style.colorScheme = resolved
  return resolved
}

export function saveThemePreference(preference: ThemePreference) {
  if (preference === "system") {
    window.localStorage.removeItem(STORAGE_KEY)
  } else {
    window.localStorage.setItem(STORAGE_KEY, preference)
  }
}

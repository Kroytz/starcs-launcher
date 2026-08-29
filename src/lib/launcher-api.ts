import { invoke } from "@tauri-apps/api/core"

export type LauncherAnnouncement = {
  id: string
  title: string
  content: string
  level: string
  dismissible: boolean
  displayDate: string
  publishedAt: string
}

export type LauncherWallet = {
  starCoin: number
  starlight: number
  stardust: number
}

export type LauncherExchangeRate = {
  from: string
  to: string
  rate: number
}

export type LauncherStoreItem = {
  id: string
  currency: "starlight" | "stardust"
  title: string
  description: string
  price: number
  icon: string
  tone: string
  tag: string
  enabled: boolean
  sort: number
}

export type LauncherInventoryItem = {
  productId?: number
  id: string
  name: string
  type: string
  rarity: string
  quantity: number
  icon: string
  tone: string
  acquiredAt: string
}

export type LauncherLoginSession = {
  token: string
  expiresAt: string
  inventory: LauncherInventoryItem[]
}

export type LauncherProfile = {
  userId: string
  displayName: string
  verified: boolean
  memberLevel: number
  communityLevel: number
  playHours: number
  achievements: number
  steamConnected: boolean
  avatarUrl: string
}

export type LauncherBootstrap = {
  app: {
    name: string
    websiteUrl: string
    rechargeEnabled: boolean
  }
  announcements: LauncherAnnouncement[]
  account: {
    profile: LauncherProfile
    wallet: LauncherWallet
    exchangeRates: LauncherExchangeRate[]
  }
  storeItems: LauncherStoreItem[]
  inventory: LauncherInventoryItem[]
}

export async function fetchLauncherBootstrap() {
  return invoke<LauncherBootstrap>("fetch_launcher_bootstrap")
}

export async function loginLauncherAccount(steamId: string, password: string) {
  return invoke<LauncherLoginSession>("login_launcher_account", { steamId, password })
}

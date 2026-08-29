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
  starCoinAvailable: boolean
  starlightAvailable: boolean
  stardustAvailable: boolean
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
  imageUrl: string
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
  account: LauncherAccount
  inventory: LauncherInventoryItem[]
  purchaseHistory: LauncherPurchaseHistoryItem[]
  seasonPass: LauncherSeasonPass
  penalties: LauncherPenalty[]
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

export type LauncherAccount = {
  profile: LauncherProfile
  wallet: LauncherWallet
  exchangeRates: LauncherExchangeRate[]
}

export type LauncherMapResource = {
  id: number
  name: string
  shortName: string
  workshopId: string
  difficulty: string
  description: string
}

export type LauncherPurchaseHistoryItem = {
  id: number
  productName: string
  currencyType: string
  quantity: number
  days: number
  totalPrice: number
  state: number
  description: string
  createdAt: string
}

export type LauncherSeasonPass = {
  available: boolean
  seasonId: number
  passType: number
  level: number
  experience: number
  claimedRewardCount: number
  starSourceChestOpened: number
  dailyGames: number
  dailyOnlineMinutes: number
  weeklyGames: number
  weeklyCompletedModes: number
  updatedAt: string
}

export type LauncherPenalty = {
  type: string
  reason: string
  mode: string
  permanent: boolean
  expiresAt: string
  createdAt: string
}

export type LauncherBootstrap = {
  app: {
    name: string
    websiteUrl: string
    rechargeEnabled: boolean
  }
  announcements: LauncherAnnouncement[]
  account: LauncherAccount
  storeItems: LauncherStoreItem[]
  inventory: LauncherInventoryItem[]
  maps: LauncherMapResource[]
}

export async function fetchLauncherBootstrap() {
  return invoke<LauncherBootstrap>("fetch_launcher_bootstrap")
}

export async function loginLauncherAccount(steamId: string, password: string) {
  return invoke<LauncherLoginSession>("login_launcher_account", { steamId, password })
}

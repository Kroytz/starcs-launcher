import { invoke } from "@tauri-apps/api/core"

export type LauncherAnnouncement = {
  id: string
  title: string
  content: string
  level: string
  dismissible: boolean
  displayDate: string
  publishedAt: string
  coverImageUrl: string
  detailImageUrl: string
  renderPayload: LauncherAnnouncementPayload | null
}

export type LauncherAnnouncementPayload = {
  sections?: LauncherAnnouncementSection[]
  footerMessage?: string
  footerTeamName?: string
}

export type LauncherAnnouncementSection = {
  title?: string
  sectionType?: number
  blocks?: LauncherAnnouncementBlock[]
}

export type LauncherAnnouncementBlock = {
  kind: number
  text?: string
  imageId?: number
  imageUrl?: string
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
  externalId: string
  currency: "starlight" | "stardust" | "afdian"
  category: string
  purchaseBackend: "star-product" | "challenge-stardust" | "afdian-cdk"
  purchaseUrl: string
  title: string
  description: string
  price: number
  days: number
  quantity: number
  icon: string
  tone: string
  tag: string
  enabled: boolean
  sort: number
  imageUrl: string
  stardustType?: string
}

export type LauncherInventoryItem = {
  productId?: number
  id: string
  source: "starlight" | "stardust"
  uniqueId: string
  name: string
  type: string
  rarity: string
  quantity: number
  icon: string
  tone: string
  acquiredAt: string
  expiresAt: string
  description: string
  mode: string
  useLimit: number
  useLimitInfo: string
  weaponPrefab: string
  weaponType: string
  equipped: boolean
  stardustType: string
}

export type StarLightPlayerSkinPreference = {
  ct: number
  t: number
}

export type StarLightWeaponSkinPreference = {
  player_skin_exclusive: Record<string, Record<string, number>>
  weapons: Record<string, Record<string, number>>
}

export type StarLightModeEquipment = {
  p_s: StarLightPlayerSkinPreference
  w_s: StarLightWeaponSkinPreference
}

export type StarLightEquipmentProfile = {
  version: 2
  plugin: "star_light_store"
  modes: Record<string, StarLightModeEquipment>
  unavailableModes: Record<string, string>
}

export type LauncherEquipmentCommandResult = {
  authenticated: boolean
  equipment: StarLightEquipmentProfile | null
}

export type LauncherLoginSession = {
  token: string
  expiresAt: string
  account: LauncherAccount
  inventory: LauncherInventoryItem[]
  purchaseHistory: LauncherPurchaseHistoryItem[]
  seasonPass: LauncherSeasonPass
  penalties: LauncherPenalty[]
  storeItems: LauncherStoreItem[]
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

export type LauncherWorkshopPack = {
  id: number
  kind: "base" | "mode"
  mode: string
  title: string
  description: string
  workshopId: string
  workshopUrl: string
  steamUrl: string
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

export async function fetchLauncherWorkshopPacks(mode: string) {
  return invoke<LauncherWorkshopPack[]>("fetch_launcher_workshop_packs", { mode })
}

export async function loginLauncherAccount(steamId: string, password: string) {
  return invoke<LauncherLoginSession>("login_launcher_account", { steamId, password })
}

export async function verifyLauncherPassword(token: string, password: string) {
  return invoke<boolean>("verify_launcher_password", { token, password })
}

export async function fetchLauncherEquipment(token: string, password: string) {
  return invoke<LauncherEquipmentCommandResult>("fetch_launcher_equipment", { token, password })
}

export async function updateLauncherEquipment(token: string, password: string, productId: number, modes: string[], team: "all" | "ct" | "t", equip: boolean) {
  return invoke<LauncherEquipmentCommandResult>("update_launcher_equipment", { token, password, productId, modes, team, equip })
}

export type StardustEquipment = {
  type: string
  uniqueId: string
  slot: number
}

export type StardustEquipmentCommandResult = {
  authenticated: boolean
  equipments: StardustEquipment[]
}

export async function updateStardustEquipment(token: string, password: string, itemType: string, uniqueId: string, equip: boolean) {
  return invoke<StardustEquipmentCommandResult>("update_stardust_equipment", { token, password, itemType, uniqueId, equip })
}

export type PurchaseCommandResult = {
  authenticated: boolean
  starlight: number
  inventory: LauncherInventoryItem[]
  purchaseHistory: LauncherPurchaseHistoryItem[]
  storeItems: LauncherStoreItem[]
}

export async function purchaseStoreItem(token: string, password: string, pricingId: number) {
  return invoke<PurchaseCommandResult>("purchase_store_item", { token, password, pricingId })
}

export type StardustPurchaseCommandResult = {
  authenticated: boolean
  stardust: number
  inventory: LauncherInventoryItem[]
  storeItems: LauncherStoreItem[]
}

export async function purchaseStardustItem(token: string, password: string, itemType: string, uniqueId: string) {
  return invoke<StardustPurchaseCommandResult>("purchase_stardust_item", { token, password, itemType, uniqueId })
}

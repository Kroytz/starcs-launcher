import type { LauncherInventoryItem } from "@/lib/launcher-api"

export type EquipmentTeam = "ct" | "t"
export type EquipmentTargetTeam = EquipmentTeam | "all"
export type CosmeticSlot = "weapon" | "player"

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
}

const storagePrefix = "star-launcher-starlight-equipment"
const legacyStorageKey = "star-launcher-equipment"

function createProfile(): StarLightEquipmentProfile {
  return { version: 2, plugin: "star_light_store", modes: {} }
}

function createModeEquipment(): StarLightModeEquipment {
  return {
    p_s: { ct: 0, t: 0 },
    w_s: { player_skin_exclusive: {}, weapons: {} },
  }
}

function cloneProfile(profile: StarLightEquipmentProfile): StarLightEquipmentProfile {
  return JSON.parse(JSON.stringify(profile)) as StarLightEquipmentProfile
}

function getStorageKey(steamId: string) {
  return `${storagePrefix}:${steamId}`
}

function isEquipmentProfile(value: unknown): value is StarLightEquipmentProfile {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<StarLightEquipmentProfile>
  return candidate.version === 2 && candidate.plugin === "star_light_store" && !!candidate.modes && typeof candidate.modes === "object"
}

export function getCosmeticSlot(item: LauncherInventoryItem): CosmeticSlot | null {
  if (item.type === "武器外观") return "weapon"
  if (item.type === "角色外观" || item.type === "玩家外观") return "player"
  return null
}

export function getStarLightProductId(item: LauncherInventoryItem): number | null {
  return item.source === "starlight" && Number.isInteger(item.productId) && Number(item.productId) > 0
    ? Number(item.productId)
    : null
}

export function productModeIsAllowed(modeExpression: string, mode: string) {
  const [allowed = "ALL", disallowed = ""] = (modeExpression || "ALL").split("#", 2)
  if (disallowed.length === 0) return allowed.includes("ALL") || allowed.includes(mode)
  return !disallowed.includes(mode)
}

export function getEquipmentValidationError(item: LauncherInventoryItem): string | null {
  const slot = getCosmeticSlot(item)
  if (!slot) return "该物品不属于可装备外观。"
  if (getStarLightProductId(item) === null) return "该外观不属于 StarLightStore 库存，暂时无法配置。"
  if (item.useLimit === 0) return "该外观已在 StarLightStore 中禁用。"
  if (slot === "weapon" && (!item.weaponType || !item.weaponPrefab)) return "该武器外观缺少 weapon_type 或 prefab 配置。"
  if (slot === "weapon" && item.useLimit === 7 && !Number.parseInt(item.useLimitInfo, 10)) return "该角色专属武器缺少关联角色商品 ID。"
  return null
}

function ensureMode(profile: StarLightEquipmentProfile, mode: string) {
  profile.modes[mode] ??= createModeEquipment()
  return profile.modes[mode]
}

function setWeaponPreference(modePrefs: StarLightModeEquipment, item: LauncherInventoryItem, productId: number) {
  if (item.useLimit === 7) {
    const ownerProductId = String(Number.parseInt(item.useLimitInfo, 10))
    modePrefs.w_s.player_skin_exclusive[ownerProductId] ??= {}
    modePrefs.w_s.player_skin_exclusive[ownerProductId][item.weaponType] = productId
    return
  }
  modePrefs.w_s.weapons[item.weaponType] ??= {}
  modePrefs.w_s.weapons[item.weaponType][item.weaponPrefab] = productId
}

function getWeaponPreference(modePrefs: StarLightModeEquipment | undefined, item: LauncherInventoryItem) {
  if (!modePrefs) return 0
  if (item.useLimit === 7) {
    const ownerProductId = String(Number.parseInt(item.useLimitInfo, 10))
    return modePrefs.w_s.player_skin_exclusive[ownerProductId]?.[item.weaponType] ?? 0
  }
  return modePrefs.w_s.weapons[item.weaponType]?.[item.weaponPrefab] ?? 0
}

export function equipStarLightItem(profile: StarLightEquipmentProfile, item: LauncherInventoryItem, modes: string[], targetTeam: EquipmentTargetTeam) {
  const productId = getStarLightProductId(item)
  const slot = getCosmeticSlot(item)
  if (productId === null || !slot) return profile
  const next = cloneProfile(profile)
  const teams: EquipmentTeam[] = targetTeam === "all" ? ["ct", "t"] : [targetTeam]
  for (const mode of modes) {
    const modePrefs = ensureMode(next, mode)
    if (slot === "player") {
      for (const team of teams) modePrefs.p_s[team] = productId
    } else {
      setWeaponPreference(modePrefs, item, productId)
    }
  }
  return next
}

export function unequipStarLightItem(profile: StarLightEquipmentProfile, item: LauncherInventoryItem, modes: string[], targetTeam: EquipmentTargetTeam) {
  const productId = getStarLightProductId(item)
  const slot = getCosmeticSlot(item)
  if (productId === null || !slot) return profile
  const next = cloneProfile(profile)
  const teams: EquipmentTeam[] = targetTeam === "all" ? ["ct", "t"] : [targetTeam]
  for (const mode of modes) {
    const modePrefs = next.modes[mode]
    if (!modePrefs) continue
    if (slot === "player") {
      for (const team of teams) {
        if (modePrefs.p_s[team] === productId) modePrefs.p_s[team] = 0
      }
    } else if (item.useLimit === 7) {
      const ownerProductId = String(Number.parseInt(item.useLimitInfo, 10))
      const exclusive = modePrefs.w_s.player_skin_exclusive[ownerProductId]
      if (exclusive?.[item.weaponType] === productId) delete exclusive[item.weaponType]
    } else {
      const weapons = modePrefs.w_s.weapons[item.weaponType]
      if (weapons?.[item.weaponPrefab] === productId) delete weapons[item.weaponPrefab]
    }
  }
  return next
}

export function getConfiguredProductIds(profile: StarLightEquipmentProfile, item: LauncherInventoryItem, modes: string[], targetTeam: EquipmentTargetTeam) {
  const slot = getCosmeticSlot(item)
  if (!slot) return []
  const teams: EquipmentTeam[] = targetTeam === "all" ? ["ct", "t"] : [targetTeam]
  return modes.flatMap((mode) => {
    const modePrefs = profile.modes[mode]
    if (!modePrefs) return []
    if (slot === "player") return teams.map((team) => modePrefs.p_s[team]).filter((id) => id > 0)
    const productId = getWeaponPreference(modePrefs, item)
    return productId > 0 ? [productId] : []
  })
}

export function isStarLightItemEquipped(profile: StarLightEquipmentProfile, item: LauncherInventoryItem) {
  const productId = getStarLightProductId(item)
  const slot = getCosmeticSlot(item)
  if (productId === null || !slot) return false
  return Object.values(profile.modes).some((modePrefs) => {
    if (slot === "player") return modePrefs.p_s.ct === productId || modePrefs.p_s.t === productId
    return Object.values(modePrefs.w_s.weapons).some((prefabs) => Object.values(prefabs).includes(productId))
      || Object.values(modePrefs.w_s.player_skin_exclusive).some((types) => Object.values(types).includes(productId))
  })
}

function migrateLegacyEquipment(items: LauncherInventoryItem[]) {
  let profile = createProfile()
  try {
    const saved = localStorage.getItem(legacyStorageKey)
    if (!saved) return profile
    const assignments = JSON.parse(saved) as Record<string, string>
    for (const [key, itemId] of Object.entries(assignments)) {
      const match = /^([^:]+):(ct|t):(weapon|player)$/.exec(key)
      if (!match) continue
      const item = items.find((candidate) => candidate.id === itemId)
      if (!item || getEquipmentValidationError(item)) continue
      profile = equipStarLightItem(profile, item, [match[1]], match[2] as EquipmentTeam)
    }
  } catch {
    return createProfile()
  }
  return profile
}

export function loadStarLightEquipment(steamId: string, items: LauncherInventoryItem[]) {
  if (!steamId) return createProfile()
  try {
    const saved = localStorage.getItem(getStorageKey(steamId))
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (isEquipmentProfile(parsed)) return parsed
    }
  } catch {
    return createProfile()
  }
  return migrateLegacyEquipment(items)
}

export function saveStarLightEquipment(steamId: string, profile: StarLightEquipmentProfile) {
  if (!steamId) return
  localStorage.setItem(getStorageKey(steamId), JSON.stringify(profile))
}

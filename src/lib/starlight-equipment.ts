import type { LauncherInventoryItem, StarLightEquipmentProfile, StarLightModeEquipment } from "@/lib/launcher-api"

export type EquipmentTeam = "ct" | "t"
export type EquipmentTargetTeam = EquipmentTeam | "all"
export type CosmeticSlot = "weapon" | "player"


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

function getWeaponPreference(modePrefs: StarLightModeEquipment | undefined, item: LauncherInventoryItem) {
  if (!modePrefs) return 0
  if (item.useLimit === 7) {
    const ownerProductId = String(Number.parseInt(item.useLimitInfo, 10))
    return modePrefs.w_s.player_skin_exclusive[ownerProductId]?.[item.weaponType] ?? 0
  }
  return modePrefs.w_s.weapons[item.weaponType]?.[item.weaponPrefab] ?? 0
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

// 返回物品装备的阵营；武器外观对两个阵营同时生效，角色外观按 ct/t 分别判断。
export function getEquippedTeams(profile: StarLightEquipmentProfile, item: LauncherInventoryItem): { ct: boolean; t: boolean } {
  const none = { ct: false, t: false }
  const productId = getStarLightProductId(item)
  const slot = getCosmeticSlot(item)
  if (productId === null || !slot) return none
  if (slot === "weapon") {
    const equipped = Object.values(profile.modes).some((modePrefs) =>
      Object.values(modePrefs.w_s.weapons).some((prefabs) => Object.values(prefabs).includes(productId))
      || Object.values(modePrefs.w_s.player_skin_exclusive).some((types) => Object.values(types).includes(productId)))
    return equipped ? { ct: true, t: true } : none
  }
  let ct = false
  let t = false
  for (const modePrefs of Object.values(profile.modes)) {
    if (modePrefs.p_s.ct === productId) ct = true
    if (modePrefs.p_s.t === productId) t = true
    if (ct && t) break
  }
  return { ct, t }
}

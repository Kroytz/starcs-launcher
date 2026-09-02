import { useCallback, useEffect, useRef, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { LucideIcon } from "lucide-react"
import {
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  Backpack,
  Bell,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  ExternalLink,
  Gamepad2,
  Gem,
  Gift,
  Home,
  Info,
  KeyRound,
  LogIn,
  Map,
  Minus,
  Monitor,
  Moon,
  Package,
  Palette,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Signal,
  Sparkles,
  Star,
  Square,
  Sun,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react"

import starLogo from "@/assets/starcs-logo.png"
import afkModeIcon from "@/assets/modes/AFK.png"
import jbModeIcon from "@/assets/modes/JB.png"
import scpModeIcon from "@/assets/modes/SCP.png"
import tttModeIcon from "@/assets/modes/TTT.png"
import zeModeIcon from "@/assets/modes/ZE.png"
import zmModeIcon from "@/assets/modes/ZM.png"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { UpdateDialog, type UpdateDialogState } from "@/components/UpdateDialog"
import { cn } from "@/lib/utils"
import {
  applyTheme,
  getThemePreference,
  resolveTheme,
  saveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme"
import {
  getConfiguredProductIds,
  getCosmeticSlot,
  getEquipmentValidationError,
  getEquippedTeams,
  isProductModeAllowedInAllModes,
  isStarLightItemEquipped,
  isStoreItemAvailableInAnyMode,
  normalizeProductModeExpression,
  productModeIsAllowed,
  type EquipmentTargetTeam,
} from "@/lib/starlight-equipment"
import {
  fetchStarServers,
  isServerJoinable,
  launchAndConnectServer,
  modeLabels,
  type Server,
  type ServerStatus,
} from "@/lib/servers"
import { dismissResourceReminder, isResourceReminderDismissed } from "@/lib/resource-reminder"
import {
  checkLauncherUpdate,
  consumePendingUpdateChangelog,
  fetchLauncherUpdatePolicy,
  type LauncherUpdatePolicy,
} from "@/lib/updater"
import {
  fetchLauncherBootstrap,
  fetchLauncherEquipment,
  fetchLauncherWorkshopPacks,
  listenWorkshopSyncProgress,
  loginLauncherAccount,
  prefetchWorkshopPacks,
  stopWorkshopPrefetch,
  purchaseStardustItem,
  purchaseStoreItem,
  updateLauncherEquipment,
  updateStardustEquipment,
  type LauncherAccount,
  type LauncherAnnouncement,
  type AuthFailureReason,
  type LauncherBootstrap,
  type LauncherInventoryItem,
  type LauncherMapResource,
  type LauncherPenalty,
  type LauncherPurchaseHistoryItem,
  type LauncherSeasonPass,
  type LauncherStoreItem,
  type LauncherWorkshopPack,
  type WorkshopSyncProgress,
  type StarLightEquipmentProfile,
} from "@/lib/launcher-api"
import {
  getLocalSteamAccount,
  loadRememberedPassword,
  updateRememberedPassword,
  type LocalSteamAccount,
} from "@/lib/steam"
import "./App.css"

function workshopSyncLabel(progress?: WorkshopSyncProgress) {
  if (!progress) return "等待预下载"
  switch (progress.phase) {
    case "checking":
      return "检查本地缓存…"
    case "downloading":
      if (progress.bytesTotal > 0) {
        const percent = Math.min(100, Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100))
        return `下载中 ${percent}%`
      }
      return "下载中…"
    case "ready":
      return "已缓存"
    case "error":
      return progress.message ?? "下载失败"
    default:
      return "处理中…"
  }
}

function workshopSyncPercent(progress?: WorkshopSyncProgress) {
  if (!progress || progress.phase !== "downloading" || progress.bytesTotal <= 0) return 0
  return Math.min(100, Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100))
}

function presentError(context: string, error: unknown, message: string) {
  console.error(`[StarCS Launcher] ${context}`, error)
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const trimmed = detail.trim()
  return trimmed || message
}

function isInvalidCredentialsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return message.includes("invalid_credentials:")
}

function authFailureReason(result: { authFailure?: AuthFailureReason | null }): AuthFailureReason {
  return result.authFailure === "credentials" ? "credentials" : "session"
}

type AppTab = "home" | "store" | "inventory" | "profile"
type ServerSort = "players" | "mode"

const tabs: Array<{ id: AppTab; label: string; icon: LucideIcon }> = [
  { id: "home", label: "首页", icon: Home },
  { id: "store", label: "商城", icon: ShoppingBag },
  { id: "inventory", label: "库存", icon: Backpack },
  { id: "profile", label: "我", icon: UserRound },
]

const appWindow = getCurrentWindow()

const themeOptions: Array<{ id: ThemePreference; label: string; icon: LucideIcon }> = [
  { id: "system", label: "跟随系统", icon: Monitor },
  { id: "light", label: "浅色", icon: Sun },
  { id: "dark", label: "深色", icon: Moon },
]

const statusMeta: Record<ServerStatus, { label: string; dot: string }> = {
  online: { label: "在线", dot: "bg-emerald-500" },
  busy: { label: "拥挤", dot: "bg-amber-500" },
  full: { label: "满员", dot: "bg-red-500" },
}

const modeIcons: Record<string, string> = {
  AFK: afkModeIcon,
  JB: jbModeIcon,
  SCP: scpModeIcon,
  TTT: tttModeIcon,
  ZE: zeModeIcon,
  ZM: zmModeIcon,
}

const displayIcons: Record<string, LucideIcon> = {
  gem: Gem,
  gift: Gift,
  package: Package,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  "shopping-bag": ShoppingBag,
  trophy: Trophy,
  "user-round": UserRound,
  zap: Zap,
}

function rarityBadgeClass(rarity: string) {
  switch (rarity.trim().toUpperCase()) {
    case "R":
      return "border-emerald-200/50 bg-emerald-600/85 text-white"
    case "SR":
      return "border-blue-200/50 bg-blue-600/85 text-white"
    case "SSR":
      return "border-fuchsia-200/50 bg-gradient-to-r from-violet-600/90 to-fuchsia-600/90 text-white"
    case "UR":
      return "border-amber-100/60 bg-gradient-to-r from-amber-400/95 to-orange-600/95 text-white"
    case "CRYSTAL":
    case "水晶":
      return "border-cyan-100/60 bg-gradient-to-r from-cyan-400/90 to-blue-600/90 text-white"
    default:
      return ""
  }
}

function rarityToneClass(rarity: string) {
  switch (rarity.trim().toUpperCase()) {
    case "R":
      return "from-emerald-500 to-cyan-500"
    case "SR":
      return "from-primary to-secondary"
    case "SSR":
      return "from-violet-500 to-fuchsia-600"
    case "UR":
      return "from-amber-400 to-orange-600"
    case "CRYSTAL":
    case "水晶":
      return "from-cyan-400 to-blue-600"
    default:
      return ""
  }
}

function afdianCategoryTone(category: string) {
  switch (category) {
    case "会员":
      return "from-amber-500 to-orange-600"
    case "星光":
      return "from-sky-500 to-indigo-600"
    case "武器外观":
      return "from-slate-700 to-red-600"
    case "礼包":
      return "from-pink-500 to-rose-600"
    case "道具卡":
      return "from-violet-500 to-fuchsia-600"
    default:
      return "from-cyan-500 to-blue-600"
  }
}

function ServerModeIcon({ server, large = false }: { server: Server; large?: boolean }) {
  const icon = modeIcons[server.mode.toUpperCase()]
  const className = cn("server-mode-icon", large && "server-mode-icon-large")

  if (icon) {
    return <img src={icon} alt={`${server.modeLabel}模式图标`} className={className} draggable={false} />
  }

  return (
    <div className={cn(className, "server-mode-icon-fallback bg-gradient-to-br", server.color)} aria-label={`${server.modeLabel}模式`}>
      {server.mode.slice(0, 3).toUpperCase() || "?"}
    </div>
  )
}

function ThemeSwitcher({ value, onChange }: { value: ThemePreference; onChange: (theme: ThemePreference) => void }) {
  return (
    <div className="theme-switcher" aria-label="主题设置">
      {themeOptions.map((option) => {
        const Icon = option.icon
        return (
          <Button
            key={option.id}
            size="sm"
            variant={value === option.id ? "secondary" : "ghost"}
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
          >
            <Icon />{option.label}
          </Button>
        )
      })}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary"><Zap className="size-3.5" />{eyebrow}</div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

function LoginDialog({ open, onOpenChange, account, isLoading, isSubmitting, accountError, password, rememberPassword, loginError, onPasswordChange, onRememberPasswordChange, onRetry, onLogin }: { open: boolean; onOpenChange: (open: boolean) => void; account: LocalSteamAccount | null; isLoading: boolean; isSubmitting: boolean; accountError: string | null; password: string; rememberPassword: boolean; loginError: string | null; onPasswordChange: (password: string) => void; onRememberPasswordChange: (remember: boolean) => void; onRetry: () => void; onLogin: () => void }) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSubmitting) onOpenChange(nextOpen) }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-2 grid size-11 place-items-center rounded-xl bg-primary/12 text-primary"><LogIn /></div>
          <DialogTitle className="text-2xl">登录 STAR Launcher</DialogTitle>
          <DialogDescription>使用当前 Steam 账号与游戏内密码完成登录。</DialogDescription>
        </DialogHeader>
        <div className="mt-1 text-xs font-medium text-muted-foreground">当前 Steam Session</div>
          {isLoading ? (
            <div className="flex min-h-24 items-center justify-center rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground"><RefreshCw className="mr-2 size-4 animate-spin" />正在识别 Steam 账号…</div>
          ) : account ? (
            <div className="flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
              <img src={account.avatarDataUrl || starLogo} alt={account.personaName} className="size-14 rounded-xl border border-border bg-background object-cover" />
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{account.personaName}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">@{account.accountName}</div><div className="mt-2 font-mono text-[11px] text-muted-foreground">Steam64 · {account.steamId}</div></div>
              <Badge variant="success"><Check />已识别</Badge>
            </div>
          ) : (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm"><div className="font-medium text-red-600 dark:text-red-300">未找到可用的 Steam Session</div><div className="mt-1 text-xs text-muted-foreground">{accountError || "请先启动并登录 Steam 客户端。"}</div><Button variant="outline" size="sm" className="mt-3" onClick={onRetry}><RefreshCw />重新识别</Button></div>
          )}

          <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); onLogin() }}>
            <div><label className="mb-2 block text-sm font-medium" htmlFor="launcher-password">游戏内密码</label><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="launcher-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} disabled={!account} onChange={(event) => onPasswordChange(event.target.value)} placeholder="输入你在游戏内设置的密码" className="px-10" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/15 px-3 py-2.5"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={rememberPassword} onChange={(event) => onRememberPasswordChange(event.target.checked)} /><span><span className="block text-sm font-medium">记住密码</span></span></label>
            {loginError && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{loginError}</div>}
            <Button type="submit" size="lg" className="w-full" disabled={!account || !password.trim() || isSubmitting}>{isSubmitting ? <RefreshCw className="animate-spin" /> : <LogIn />}{isSubmitting ? "正在校验并读取库存…" : "登录"}</Button>
          </form>
      </DialogContent>
    </Dialog>
  )
}

function announcementHeroImage(announcement: LauncherAnnouncement | null) {
  if (!announcement) return ""
  if (announcement.coverImageUrl) return announcement.coverImageUrl
  for (const section of announcement.renderPayload?.sections ?? []) {
    for (const block of section.blocks ?? []) {
      if (block.imageUrl) return block.imageUrl
    }
  }
  return ""
}

function AnnouncementDetailDialog({ announcement, onOpenChange }: { announcement: LauncherAnnouncement | null; onOpenChange: (open: boolean) => void }) {
  const sections = announcement?.renderPayload?.sections ?? []
  const [detailImageFailed, setDetailImageFailed] = useState(false)
  const showDetailImage = Boolean(announcement?.detailImageUrl && !detailImageFailed)

  useEffect(() => setDetailImageFailed(false), [announcement?.id])

  return (
    <Dialog open={announcement !== null} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[86vh] overflow-y-auto sm:max-w-[720px]", showDetailImage && "p-2")}>
        {announcement && (showDetailImage ? <>
          <DialogHeader className="sr-only"><DialogTitle>{announcement.title}</DialogTitle><DialogDescription>完整公告内容</DialogDescription></DialogHeader>
          <img src={announcement.detailImageUrl} alt={announcement.title} className="w-full rounded-xl bg-muted/20 object-contain" onError={() => setDetailImageFailed(true)} />
        </> : <>
            <DialogHeader><div className="mb-1 flex items-center gap-2"><Badge className="bg-accent text-white">公告</Badge><span className="text-xs text-muted-foreground">{announcement.displayDate}</span></div><DialogTitle className="text-2xl">{announcement.title}</DialogTitle><DialogDescription>完整公告内容</DialogDescription></DialogHeader>
            <div className="space-y-6">
              {sections.length === 0 && <p className="whitespace-pre-line text-sm leading-7 text-foreground/90">{announcement.content}</p>}
              {sections.map((section, sectionIndex) => <section key={`${section.title ?? "section"}-${sectionIndex}`} className="space-y-3"><h3 className="text-base font-semibold">{section.title || `公告内容 ${sectionIndex + 1}`}</h3>{(section.blocks ?? []).map((block, blockIndex) => block.kind === 2 && block.imageUrl ? <img key={`image-${blockIndex}`} src={block.imageUrl} alt={`${announcement.title}配图`} className="max-h-[440px] w-full rounded-xl border border-border bg-muted/20 object-contain" /> : block.text ? <p key={`text-${blockIndex}`} className="whitespace-pre-line text-sm leading-7 text-foreground/90">{block.text}</p> : null)}</section>)}
              {(announcement.renderPayload?.footerMessage || announcement.renderPayload?.footerTeamName) && <div className="border-t border-border pt-4 text-right text-sm text-muted-foreground">{announcement.renderPayload.footerMessage && <div>{announcement.renderPayload.footerMessage}</div>}{announcement.renderPayload.footerTeamName && <div className="mt-1 font-medium text-foreground">{announcement.renderPayload.footerTeamName}</div>}</div>}
            </div>
          </>)}
      </DialogContent>
    </Dialog>
  )
}

function AnnouncementCenter({ announcements, isLoading, onSelect }: { announcements: LauncherAnnouncement[]; isLoading: boolean; onSelect: (announcement: LauncherAnnouncement) => void }) {
  const slides = announcements.slice(0, 5)
  const latestAnnouncements = [...announcements]
    .sort((left, right) => (Date.parse(right.publishedAt) || 0) - (Date.parse(left.publishedAt) || 0))
    .slice(0, 3)
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const activeAnnouncement = slides[activeIndex] ?? null
  const heroImage = announcementHeroImage(activeAnnouncement)

  useEffect(() => {
    setActiveIndex((current) => slides.length === 0 ? 0 : Math.min(current, slides.length - 1))
  }, [slides.length])

  useEffect(() => {
    if (paused || slides.length < 2) return
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % slides.length), 6500)
    return () => window.clearInterval(timer)
  }, [paused, slides.length])

  function move(direction: -1 | 1) {
    if (slides.length < 2) return
    setActiveIndex((current) => (current + direction + slides.length) % slides.length)
  }

  if (isLoading && announcements.length === 0) {
    return (
      <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]" aria-label="正在加载社区公告" aria-busy="true">
        <Card className="relative h-[200px] overflow-hidden p-5">
          <Skeleton className="absolute inset-0 rounded-none bg-muted/70" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between"><Skeleton className="h-6 w-20 bg-background/55" /><Skeleton className="h-3 w-16 bg-background/45" /></div>
            <div className="space-y-3"><Skeleton className="h-6 w-2/3 bg-background/55" /><Skeleton className="h-4 w-5/6 bg-background/45" /><Skeleton className="h-3 w-20 bg-background/45" /></div>
          </div>
        </Card>
        <Card className="h-[200px] overflow-hidden p-4">
          <div className="mb-4 flex items-start justify-between"><div className="space-y-2"><Skeleton className="h-5 w-20" /><Skeleton className="h-3 w-36" /></div><Skeleton className="size-8 rounded-lg" /></div>
          <div className="space-y-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="flex items-center gap-3"><Skeleton className="size-7 shrink-0 rounded-lg" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-3 w-12" /></div>)}</div>
        </Card>
      </section>
    )
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]" aria-label="社区公告">
      <Card className="group relative h-[200px] overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        {activeAnnouncement ? <>
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-accent" />{heroImage && <img src={heroImage} alt="" className="absolute inset-0 size-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/65 to-slate-950/20" />
          <button type="button" className="absolute inset-0 z-[1] flex flex-col items-start justify-end p-5 text-left text-white" onClick={() => onSelect(activeAnnouncement)}>
            <div className="mb-auto flex w-full items-center justify-between"><Badge className="bg-white/15 text-white backdrop-blur-sm">社区公告</Badge><span className="text-xs text-white/65">{activeAnnouncement.displayDate}</span></div>
            <h2 className="max-w-2xl text-xl font-semibold tracking-tight">{activeAnnouncement.title}</h2>
            <p className="mt-1.5 line-clamp-1 max-w-2xl text-sm leading-6 text-white/75">{activeAnnouncement.content}</p>
            <span className="mt-2.5 flex items-center gap-1 text-xs font-medium text-white/90">查看详情<ChevronRight className="size-3.5" /></span>
          </button>
          {slides.length > 1 && <><button type="button" className="absolute left-3 top-1/2 z-[2] grid size-8 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/25 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/45 focus-visible:opacity-100 group-hover:opacity-100" onClick={() => move(-1)} aria-label="上一条公告"><ChevronLeft className="size-4" /></button><button type="button" className="absolute right-3 top-1/2 z-[2] grid size-8 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/25 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/45 focus-visible:opacity-100 group-hover:opacity-100" onClick={() => move(1)} aria-label="下一条公告"><ChevronRight className="size-4" /></button><div className="absolute bottom-4 right-5 z-[2] flex gap-1.5">{slides.map((slide, index) => <button key={slide.id} type="button" className={cn("h-1.5 rounded-full bg-white/45 transition-all", index === activeIndex ? "w-5 bg-white" : "w-1.5")} onClick={() => setActiveIndex(index)} aria-label={`切换到公告 ${index + 1}`} />)}</div></>}
        </> : <div className="grid h-[200px] place-items-center text-sm text-muted-foreground">{isLoading ? <span className="flex items-center gap-2"><RefreshCw className="size-4 animate-spin" />正在加载公告…</span> : "暂无公告"}</div>}
      </Card>

      <Card className="h-[200px] overflow-hidden"><CardHeader className="p-4 pb-2"><div className="flex items-center justify-between"><div><CardTitle className="text-base">最新公告</CardTitle><CardDescription>最近发布的 3 条社区动态</CardDescription></div><Bell className="size-5 text-primary" /></div></CardHeader><CardContent className="px-2 pb-2"><div className="divide-y divide-border">{latestAnnouncements.map((announcement) => <button key={announcement.id} type="button" className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-muted/45" onClick={() => onSelect(announcement)}><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Bell className="size-3.5" /></span><span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">{announcement.title}</span><span className="shrink-0 text-[10px] text-muted-foreground">{announcement.displayDate}</span></button>)}{!isLoading && latestAnnouncements.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">暂无最新公告</div>}</div></CardContent></Card>
    </section>
  )
}

function HomePage({ announcements, maps, backendError, isBackendLoading, onRetryBackend }: { announcements: LauncherAnnouncement[]; maps: LauncherMapResource[]; backendError: string | null; isBackendLoading: boolean; onRetryBackend: () => void }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "online">("all")
  const [sort, setSort] = useState<ServerSort>("players")
  const [servers, setServers] = useState<Server[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [favorites, setFavorites] = useState<string[]>([])
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<LauncherAnnouncement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [joiningServerId, setJoiningServerId] = useState<string | null>(null)
  const [resourceDialogServer, setResourceDialogServer] = useState<Server | null>(null)
  const [resourcePacks, setResourcePacks] = useState<LauncherWorkshopPack[]>([])
  const [isResourceLoading, setIsResourceLoading] = useState(false)
  const [resourceDialogError, setResourceDialogError] = useState<string | null>(null)
  const [workshopSync, setWorkshopSync] = useState<Record<string, WorkshopSyncProgress>>({})
  const [isPrefetching, setIsPrefetching] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const initialFetchStarted = useRef(false)

  const loadServers = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const nextServers = await fetchStarServers()
      setServers(nextServers)
      setSelectedId((current) =>
        nextServers.some((server) => server.id === current)
          ? current
          : ([...nextServers].sort((a, b) => b.players - a.players)[0]?.id ?? ""),
      )
    } catch (error) {
      setLoadError(presentError("获取服务器列表失败", error, "服务器列表暂时无法获取，请稍后重试。"))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialFetchStarted.current) return
    initialFetchStarted.current = true
    void loadServers()
  }, [loadServers])

  const filteredServers = servers
    .filter((server) => {
      const matchesQuery = `${server.name} ${server.map} ${server.mapName} ${server.mode} ${server.modeLabel}`.toLowerCase().includes(query.toLowerCase())
      const matchesStatus = filter === "all" || isServerJoinable(server)
      return matchesQuery && matchesStatus
    })
    .sort((a, b) => {
      if (sort === "mode") {
        return a.mode.localeCompare(b.mode, "en", { sensitivity: "base" })
          || b.players - a.players
          || a.name.localeCompare(b.name, "zh-CN")
      }

      return b.players - a.players || a.name.localeCompare(b.name, "zh-CN")
    })
  const selected = servers.find((server) => server.id === selectedId)
  const selectedMap = selected ? maps.find((map) => {
    const serverMapNames = [selected.map, selected.mapName].map((value) => value.trim().toLowerCase())
    return serverMapNames.includes(map.name.trim().toLowerCase()) || serverMapNames.includes(map.shortName.trim().toLowerCase())
  }) : undefined
  const joinableCount = servers.filter(isServerJoinable).length

  function toggleFavorite(id: string) {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  useEffect(() => {
    if (!resourceDialogServer) return

    let unlisten: (() => void) | undefined
    void listenWorkshopSyncProgress((progress) => {
      setWorkshopSync((current) => ({
        ...current,
        [progress.workshopId]: progress,
      }))
    }).then((dispose) => {
      unlisten = dispose
    })

    return () => {
      unlisten?.()
    }
  }, [resourceDialogServer])

  async function startWorkshopPrefetch(packs: LauncherWorkshopPack[]) {
    if (isPrefetching || packs.length === 0) return
    setIsPrefetching(true)
    setWorkshopSync({})
    setResourceDialogError(null)
    try {
      const result = await prefetchWorkshopPacks(packs.map((pack) => ({
        workshopId: pack.workshopId,
        title: pack.title,
      })))
      if (result.cancelled) return
      if (result.failed.length > 0 && result.ready.length === 0) {
        setResourceDialogError(`资源预下载失败：${result.failed[0]?.message ?? "未知错误"}`)
      }
    } catch (error) {
      setResourceDialogError(presentError("Workshop 资源预下载失败", error, "无法通过 Steam 预下载资源，可直接进服由服务器同步。"))
    } finally {
      setIsPrefetching(false)
    }
  }

  async function loadResourcePacks(server: Server) {
    setIsResourceLoading(true)
    setResourceDialogError(null)
    setWorkshopSync({})
    try {
      const nextPacks = await fetchLauncherWorkshopPacks(server.mode)
      setResourcePacks(nextPacks)
      if (nextPacks.length > 0) {
        void startWorkshopPrefetch(nextPacks)
      }
    } catch (error) {
      setResourcePacks([])
      setResourceDialogError(presentError("读取创意工坊资源包失败", error, "资源包列表暂时无法获取，可重试或直接启动游戏。"))
    } finally {
      setIsResourceLoading(false)
    }
  }

  function prepareJoin(server: Server) {
    setJoinError(null)
    if (isResourceReminderDismissed(server.mode)) {
      void joinServer(server)
      return
    }
    setResourceDialogServer(server)
    setResourcePacks([])
    void loadResourcePacks(server)
  }

  async function openWorkshopPack(pack: LauncherWorkshopPack) {
    setResourceDialogError(null)
    try {
      await openUrl(pack.steamUrl)
    } catch (error) {
      setResourceDialogError(presentError("通过 Steam 打开资源包失败", error, "无法通过 Steam 打开资源链接，请确认 Steam 正在运行。"))
    }
  }

  function closeResourceDialogUI() {
    setResourceDialogServer(null)
    setIsPrefetching(false)
    setResourceDialogError(null)
  }

  function dismissResourceDialog() {
    closeResourceDialogUI()
    void stopWorkshopPrefetch()
  }

  async function joinServer(server: Server) {
    if (joiningServerId) return
    closeResourceDialogUI()
    await stopWorkshopPrefetch()
    setJoiningServerId(server.id)
    setJoinError(null)
    try {
      await launchAndConnectServer(server.address)
    } catch (error) {
      setJoinError(presentError("启动或连接 CS2 失败", error, "游戏启动或连接请求未能完成，请稍后重试。"))
    } finally {
      setJoiningServerId(null)
    }
  }

  return (
    <main className="page-shell home-page-shell">
      <AnnouncementCenter announcements={announcements} isLoading={isBackendLoading} onSelect={setSelectedAnnouncement} />

      <div className="mt-5 grid grid-cols-12 gap-5">
        {backendError && (
          <div className="col-span-12 flex items-center justify-between gap-3 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm">
            <span className="min-w-0 truncate text-red-600 dark:text-red-300">公告服务暂不可用：{backendError}</span>
            <Button variant="outline" size="sm" disabled={isBackendLoading} onClick={onRetryBackend}><RefreshCw className={cn(isBackendLoading && "animate-spin")} />重试</Button>
          </div>
        )}
        <div className="col-span-12 grid grid-cols-12 gap-3">
          <div className="relative col-span-12 md:col-span-6 lg:col-span-5">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服务器、地图或模式..." className="pl-9" />
          </div>
          <div className="col-span-12 flex justify-end gap-2 md:col-span-6 lg:col-span-7">
            <div className="flex h-9 rounded-md border border-border bg-card p-px">
              <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => setFilter("all")}>全部 {servers.length}</Button>
              <Button size="sm" variant={filter === "online" ? "secondary" : "ghost"} onClick={() => setFilter("online")}>可加入 {joinableCount}</Button>
            </div>
            <Button variant="outline" size="sm" className="h-9" disabled={isLoading} onClick={() => void loadServers()}><RefreshCw className={cn(isLoading && "animate-spin")} />刷新</Button>
          </div>
        </div>

        <section className="col-span-12 min-w-0 lg:col-span-8">
        <div className="server-table">
          <div className="server-table-head">
            <span>服务器</span>
            <button type="button" className={cn("server-sort-button", sort === "mode" && "server-sort-button-active")} aria-pressed={sort === "mode"} onClick={() => setSort("mode")}>地图 / 模式{sort === "mode" && <ArrowUp />}</button>
            <button type="button" className={cn("server-sort-button server-sort-button-players", sort === "players" && "server-sort-button-active")} aria-pressed={sort === "players"} onClick={() => setSort("players")}>玩家{sort === "players" && <ArrowDown />}</button>
            <span>延迟</span>
            <span />
          </div>
          <div className="divide-y divide-border/70">
            {filteredServers.map((server) => {
              const isSelected = selected?.id === server.id
              const isFavorite = favorites.includes(server.id)
              const meta = statusMeta[server.status]
              return (
                <button key={server.id} className={cn("server-row", isSelected && "server-row-selected")} onClick={() => setSelectedId(server.id)} onDoubleClick={() => { if (joiningServerId !== null) return; prepareJoin(server) }}>
                  <div className="flex min-w-0 items-center gap-3">
                    <ServerModeIcon server={server} />
                    <div className="min-w-0 text-left">
                      <div className="flex items-center gap-2"><span className="truncate font-medium">{server.name}</span><span className={cn("size-1.5 rounded-full", meta.dot)} /></div>
                      <div className="mt-1 text-xs text-muted-foreground">{meta.label}</div>
                    </div>
                  </div>
                  <div className="hidden min-w-0 text-left sm:block"><div className="truncate text-sm">{server.map}</div><div className="mt-1 text-xs text-muted-foreground">{server.modeLabel}</div></div>
                  <div><div className="mb-1.5 flex items-center justify-end gap-1 text-xs"><span>{server.players}</span><span className="text-muted-foreground">/ {server.capacity}</span></div><Progress value={server.capacity > 0 ? (server.players / server.capacity) * 100 : 0} /></div>
                  <div className="hidden items-center gap-1.5 text-sm md:flex"><Signal className={cn("size-3.5", server.ping === null ? "text-muted-foreground" : server.ping < 60 ? "text-emerald-500" : server.ping < 120 ? "text-amber-500" : "text-red-500")} />{server.ping !== null ? `${server.ping} ms` : "—"}</div>
                  <div className="flex items-center justify-end gap-1">
                    <span role="button" tabIndex={0} aria-label="收藏" className="rounded-md p-2 hover:bg-accent/15" onClick={(event) => { event.stopPropagation(); toggleFavorite(server.id) }} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={() => undefined}><Star className={cn("size-4", isFavorite && "fill-amber-400 text-amber-500")} /></span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              )
            })}
          </div>
          {isLoading && servers.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">正在获取服务器状态并测量 A2S 延迟…</div>}
          {!isLoading && loadError && servers.length === 0 && <div className="px-6 py-16 text-center"><p className="text-sm text-red-500">{loadError}</p><Button variant="outline" className="mt-4" onClick={() => void loadServers()}><RefreshCw />重新加载</Button></div>}
          {!isLoading && !loadError && filteredServers.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">没有找到匹配的服务器</div>}
        </div>
      </section>

      <aside className="col-span-12 space-y-4 lg:col-span-4">
        {selected ? (
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-b from-primary/[0.08] to-card">
            <div className={cn("h-1 bg-gradient-to-r", selected.color)} />
            <CardHeader>
              <div className="mb-3 flex items-center justify-between">
                <Badge variant={selected.status === "full" ? "outline" : "success"}><span className={cn("size-1.5 rounded-full", statusMeta[selected.status].dot)} />{statusMeta[selected.status].label}</Badge>
                <Button variant="ghost" size="icon" onClick={() => toggleFavorite(selected.id)} aria-label="收藏服务器"><Star className={cn(favorites.includes(selected.id) && "fill-amber-400 text-amber-500")} /></Button>
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <ServerModeIcon server={selected} large />
                <div className="min-w-0">
                  <CardTitle className="truncate text-xl">{selected.name}</CardTitle>
                  <CardDescription>{selected.modeLabel}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="detail-map"><div className={cn("absolute inset-0 bg-gradient-to-br opacity-30", selected.color)} /><Map className="relative size-8 text-white/80" /><div className="relative min-w-0 text-center"><div className="text-xs text-white/60">当前地图</div><div className="mt-0.5 truncate font-medium text-white">{selected.map}</div>{selectedMap && <div className="mt-1 flex flex-wrap justify-center gap-x-2 text-[10px] text-white/60"><span>难度 {selectedMap.difficulty || "未标注"}</span>{selectedMap.workshopId && <span>Workshop {selectedMap.workshopId}</span>}</div>}</div></div>
              <div className="my-4 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-background/50 py-3 text-center">
                <div><Users className="mx-auto mb-1 size-4 text-muted-foreground" /><div className="text-sm font-medium">{selected.players}/{selected.capacity}</div><div className="text-[10px] text-muted-foreground">玩家</div></div>
                <div><Signal className="mx-auto mb-1 size-4 text-muted-foreground" /><div className="text-sm font-medium">{selected.ping !== null ? `${selected.ping}ms` : "—"}</div><div className="text-[10px] text-muted-foreground">A2S 延迟</div></div>
                <div><Trophy className="mx-auto mb-1 size-4 text-muted-foreground" /><div className="text-sm font-medium">{selected.scoreCt}:{selected.scoreT}</div><div className="text-[10px] text-muted-foreground">CT / T</div></div>
              </div>
              <div className="mb-5 flex flex-wrap gap-2">{selected.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>
              <Button size="lg" className="w-full" disabled={joiningServerId !== null} onClick={() => prepareJoin(selected)}><Gamepad2 />{joiningServerId ? "正在启动并等待 CS2…" : selected.status === "full" ? "尝试加入服务器" : "加入服务器"}</Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">从登录器启动时将尝试从 Steam 平台启动，并在 CS2 初始化完成后连接。</p>
              {joinError && <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">{joinError}</div>}
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{isLoading ? "正在加载服务器详情…" : "暂无可显示的服务器"}</CardContent></Card>
        )}
      </aside>
      </div>
      <Dialog open={resourceDialogServer !== null} onOpenChange={(open) => { if (!open) dismissResourceDialog() }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="size-5 text-primary" />启动前准备资源</DialogTitle>
            <DialogDescription>建议在 Steam 中订阅下方资源包：进服更快、版本自动更新。点击「Steam 打开」进入 Workshop 页面订阅即可。</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isResourceLoading && <>{[0, 1].map((item) => <div key={item} className="flex items-center gap-3 rounded-xl border border-border p-4"><Skeleton className="size-10 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-56" /></div><Skeleton className="h-9 w-28" /></div>)}</>}
            {!isResourceLoading && resourcePacks.map((pack) => {
              const sync = workshopSync[pack.workshopId]
              const syncPercent = workshopSyncPercent(sync)
              return (
              <div key={pack.id} className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Package className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{pack.title}</span><Badge variant={pack.kind === "base" ? "secondary" : "outline"}>{pack.kind === "base" ? "基础资源" : `${modeLabels[pack.mode] ?? pack.mode}`}</Badge>{sync?.phase === "ready" && <Badge variant="success">已缓存</Badge>}{sync?.phase === "error" && <Badge variant="outline">失败</Badge>}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{pack.description || `Workshop ${pack.workshopId}`}</p>
                  {(isPrefetching || sync) && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{workshopSyncLabel(sync)}</span>
                        {sync?.phase === "downloading" && sync.bytesTotal > 0 && <span>{sync.bytesDownloaded}/{sync.bytesTotal}</span>}
                      </div>
                      <Progress value={sync?.phase === "ready" ? 100 : syncPercent} />
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" disabled={isPrefetching} onClick={() => void openWorkshopPack(pack)}><ExternalLink />Steam 打开</Button>
              </div>
            )})}
            {!isResourceLoading && resourcePacks.length === 0 && !resourceDialogError && <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">当前模式暂未配置资源包，可直接启动游戏。</div>}
            {resourceDialogError && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">{resourceDialogError}</div>}
          </div>

          <DialogFooter>
            {resourceDialogServer && (
              <Button variant="ghost" className="sm:mr-auto text-muted-foreground" onClick={() => { dismissResourceReminder(resourceDialogServer.mode); void joinServer(resourceDialogServer) }}>
                本模式不再提醒
              </Button>
            )}
            <Button variant="outline" onClick={() => { if (resourceDialogServer) void joinServer(resourceDialogServer) }}>稍后再说</Button>
            {resourceDialogError && resourcePacks.length === 0 && resourceDialogServer && <Button variant="outline" disabled={isResourceLoading} onClick={() => void loadResourcePacks(resourceDialogServer)}><RefreshCw className={cn(isResourceLoading && "animate-spin")} />重试加载</Button>}
            {resourcePacks.length > 0 && <Button variant="outline" disabled={isPrefetching} onClick={() => void startWorkshopPrefetch(resourcePacks)}><RefreshCw className={cn(isPrefetching && "animate-spin")} />{isPrefetching ? "预下载中…" : "重新预下载"}</Button>}
            <Button disabled={!resourceDialogServer} onClick={() => { if (!resourceDialogServer) return; void joinServer(resourceDialogServer) }}><Gamepad2 />继续启动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AnnouncementDetailDialog announcement={selectedAnnouncement} onOpenChange={(open) => { if (!open) setSelectedAnnouncement(null) }} />
    </main>
  )
}

type ExchangeCurrency = "starlight" | "stardust"
type StoreKind = ExchangeCurrency | "afdian"
type CurrencyPopup = "recharge" | ExchangeCurrency
type StoreItemGroup = { key: string; tiers: LauncherStoreItem[] }

// 期限/数量档位的展示标签：x5（数量型）、30 天（期限型）、永久
function storeTierLabel(item: LauncherStoreItem) {
  if (item.quantity > 1) return `x${item.quantity}`
  if (item.days > 0) return `${item.days} 天`
  return "长期"
}

const equipmentModes = Object.entries(modeLabels)
const storeModeCodes = Object.keys(modeLabels)

function isVisibleStoreItem(item: LauncherStoreItem) {
  if (item.purchaseBackend !== "star-product") return true
  return isStoreItemAvailableInAnyMode(item.mode, storeModeCodes)
}

function StoreProductModeBadges({ mode, className }: { mode?: string; className?: string }) {
  const expression = normalizeProductModeExpression(mode)
  const allAllowed = isProductModeAllowedInAllModes(mode, storeModeCodes)
  if (allAllowed) {
    return <div className={cn("flex flex-wrap gap-1", className)}><Badge variant="secondary" className="text-[10px]">全模式</Badge></div>
  }
  const allowedModes = equipmentModes.filter(([code]) => productModeIsAllowed(expression, code))
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {allowedModes.map(([code, label]) => (
        <Badge key={code} variant="secondary" className="text-[10px]">{label}</Badge>
      ))}
    </div>
  )
}

function StorePage({ data, isAuthenticated, onRequireLogin, onPurchase }: { data: LauncherBootstrap; isAuthenticated: boolean; onRequireLogin: () => void; onPurchase: (item: LauncherStoreItem) => Promise<boolean> }) {
  const [activeStore, setActiveStore] = useState<StoreKind>("afdian")
  const [activeCategory, setActiveCategory] = useState("all")
  const [currencyPopup, setCurrencyPopup] = useState<CurrencyPopup | null>(null)
  const [exchangeAmount, setExchangeAmount] = useState("1")
  const [storeNotice, setStoreNotice] = useState<string | null>(null)
  const [purchaseTarget, setPurchaseTarget] = useState<LauncherStoreItem[] | null>(null)
  const [purchaseTierId, setPurchaseTierId] = useState<string | null>(null)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const categoryScrollRef = useRef<HTMLDivElement>(null)
  const [categoryScrollEdges, setCategoryScrollEdges] = useState({ left: false, right: false })

  const currencyItems = data.storeItems.filter((item) => item.enabled && item.currency === activeStore && isVisibleStoreItem(item))
  const categories = [...new Set(currencyItems.map((item) => item.category || "其他"))]
  const activeItems = currencyItems.filter((item) => activeCategory === "all" || (item.category || "其他") === activeCategory)
  // 同一星光商品的多个价格档位（7 天/30 天/永久等）合并成一张卡片，购买时在弹窗内选档位
  const groupedItems: StoreItemGroup[] = []
  const groupIndex: Record<string, number> = {}
  for (const item of activeItems) {
    const key = item.purchaseBackend === "star-product" ? `star-product-${item.externalId}` : item.id
    const existing = groupIndex[key]
    if (existing === undefined) {
      groupIndex[key] = groupedItems.length
      groupedItems.push({ key, tiers: [item] })
    } else {
      groupedItems[existing].tiers.push(item)
    }
  }
  for (const group of groupedItems) {
    group.tiers.sort((a, b) => a.price - b.price || a.days - b.days || a.quantity - b.quantity)
  }
  const selectedTier = purchaseTarget?.find((tier) => tier.id === purchaseTierId) ?? purchaseTarget?.[0] ?? null
  const purchaseIsStardust = selectedTier?.purchaseBackend === "challenge-stardust"
  const purchaseCurrencyLabel = purchaseIsStardust ? "星尘" : "星光"
  const purchaseBalance = purchaseIsStardust ? data.account.wallet.stardust : data.account.wallet.starlight
  const purchaseBalanceAvailable = purchaseIsStardust ? data.account.wallet.stardustAvailable : data.account.wallet.starlightAvailable
  const wallet = data.account.wallet
  const activeBalance = activeStore === "starlight" ? wallet.starlight : activeStore === "stardust" ? wallet.stardust : 0
  const activeBalanceAvailable = activeStore === "starlight" ? wallet.starlightAvailable : activeStore === "stardust" ? wallet.stardustAvailable : false
  const parsedExchangeAmount = Math.max(0, Math.floor(Number(exchangeAmount) || 0))
  const exchangeRate = (target: ExchangeCurrency) => data.account.exchangeRates.find((item) => item.from === "starCoin" && item.to === target)?.rate ?? 0
  const balanceLabel = (value: number, available: boolean) => !isAuthenticated ? "—" : available ? value.toLocaleString() : "暂无数据"

  const updateCategoryScrollEdges = useCallback(() => {
    const container = categoryScrollRef.current
    if (!container) return
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    setCategoryScrollEdges({
      left: container.scrollLeft > 2,
      right: container.scrollLeft < maxScrollLeft - 2,
    })
  }, [])

  useEffect(() => {
    setActiveCategory("all")
  }, [activeStore])

  useEffect(() => {
    const container = categoryScrollRef.current
    if (!container) return
    container.scrollTo({ left: 0 })
    const frame = requestAnimationFrame(updateCategoryScrollEdges)
    const observer = new ResizeObserver(updateCategoryScrollEdges)
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [activeStore, currencyItems.length, updateCategoryScrollEdges])

  function scrollCategories(direction: -1 | 1) {
    const container = categoryScrollRef.current
    if (!container) return
    const distance = Math.max(240, Math.round(container.clientWidth * 0.65))
    container.scrollBy({ left: direction * distance, behavior: "smooth" })
  }

  function exchange(target: ExchangeCurrency) {
    if (!isAuthenticated) {
      onRequireLogin()
      return
    }
    setStoreNotice(`当前数据库账号仅有读取权限，暂不能执行星币兑换${target === "starlight" ? "星光" : "星尘"}。`)
    setCurrencyPopup(null)
  }

  async function purchase(group: StoreItemGroup) {
    const item = group.tiers[0]
    if (item.purchaseBackend === "afdian-cdk") {
      if (!item.purchaseUrl) {
        setStoreNotice(`「${item.title}」暂时没有可用的爱发电购买链接。`)
        return
      }
      try {
        await openUrl(item.purchaseUrl)
      } catch (error) {
        setStoreNotice(presentError("打开爱发电购买页失败", error, "暂时无法打开购买页面，请稍后重试。"))
      }
      return
    }
    if (!isAuthenticated) {
      onRequireLogin()
      return
    }
    setPurchaseError(null)
    setPurchaseTierId(null)
    setPurchaseTarget(group.tiers)
  }

  async function confirmPurchase() {
    if (!purchaseTarget || !selectedTier || isPurchasing) return
    setIsPurchasing(true)
    setPurchaseError(null)
    try {
      const purchased = await onPurchase(selectedTier)
      if (purchased) {
        setStoreNotice(`已购买「${purchaseTarget[0].title}」（${storeTierLabel(selectedTier)}），可在库存页查看。`)
        setPurchaseTarget(null)
      }
    } catch (error) {
      console.error("[StarCS Launcher] 购买星光商品失败", error)
      // Tauri invoke 拒绝时抛出的是字符串（后端 msg），不是 Error 实例
      const message = typeof error === "string" && error.trim() ? error : error instanceof Error && error.message.trim() ? error.message : "购买失败，请稍后重试。"
      setPurchaseError(message)
    } finally {
      setIsPurchasing(false)
    }
  }

  return (
    <main className="page-shell">
      <PageHeading eyebrow="STAR 商城" title="星社区兑换中心" description={isAuthenticated ? "管理三种货币，并在星光、星尘与发电商店选购物品。" : "浏览发电商店商品，无需登录即可前往购买。"} />

      {!isAuthenticated && activeStore !== "afdian" && <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center"><span>登录后可查看真实余额，并进行星光与星尘商城操作。</span><Button size="sm" onClick={onRequireLogin}><LogIn />登录</Button></div>}

      {isAuthenticated && <div className="currency-grid">
        <Card className="currency-card currency-card-coin">
          <CardContent className="relative flex items-center gap-4 p-5">
            <div className="currency-icon bg-accent/15 text-accent"><Coins /></div>
            <div className="min-w-0 flex-1"><div className="text-xs font-medium text-muted-foreground">星币</div><div className="mt-1 flex items-center gap-2"><span className="text-2xl font-semibold tabular-nums">{balanceLabel(wallet.starCoin, wallet.starCoinAvailable)}</span><Button variant="outline" size="icon" className="size-7 rounded-full" aria-label="充值星币" title={isAuthenticated ? "查看充值入口" : "登录后充值"} onClick={() => isAuthenticated ? setCurrencyPopup("recharge") : onRequireLogin()}><Plus /></Button></div></div>
          </CardContent>
        </Card>
        <Card className="currency-card currency-card-starlight">
          <CardContent className="relative flex items-center gap-4 p-5"><div className="currency-icon bg-primary/15 text-primary"><Sparkles /></div><div><div className="text-xs font-medium text-muted-foreground">星光</div><div className="mt-1 flex items-center gap-2"><span className="text-2xl font-semibold tabular-nums">{balanceLabel(wallet.starlight, wallet.starlightAvailable)}</span><Button variant="outline" size="icon" className="size-7 rounded-full" aria-label="兑换星光" title={isAuthenticated ? "查看星光兑换" : "登录后兑换"} onClick={() => isAuthenticated ? setCurrencyPopup("starlight") : onRequireLogin()}><Plus /></Button></div></div></CardContent>
        </Card>
        <Card className="currency-card currency-card-stardust">
          <CardContent className="relative flex items-center gap-4 p-5"><div className="currency-icon bg-secondary/15 text-secondary"><Gem /></div><div><div className="text-xs font-medium text-muted-foreground">星尘</div><div className="mt-1 flex items-center gap-2"><span className="text-2xl font-semibold tabular-nums">{balanceLabel(wallet.stardust, wallet.stardustAvailable)}</span><Button variant="outline" size="icon" className="size-7 rounded-full" aria-label="兑换星尘" title={isAuthenticated ? "查看星尘兑换" : "登录后兑换"} onClick={() => isAuthenticated ? setCurrencyPopup("stardust") : onRequireLogin()}><Plus /></Button></div></div></CardContent>
        </Card>
      </div>}

      <Dialog open={currencyPopup !== null} onOpenChange={(open) => { if (!open) setCurrencyPopup(null) }}>
        <DialogContent>
          {currencyPopup === "recharge" ? (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Coins className="size-5 text-accent" />充值星币</DialogTitle><DialogDescription>{data.app.rechargeEnabled ? "请选择充值档位。" : "充值入口已预留，后续可在此接入支付渠道和充值档位。"}</DialogDescription></DialogHeader>
              <div className="rounded-xl border border-dashed border-accent/30 bg-accent/10 px-5 py-8 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-accent/15 text-accent"><Plus /></div><div className="font-medium">充值功能暂未开放</div><div className="mt-1 text-xs text-muted-foreground">当前星币余额：{balanceLabel(wallet.starCoin, wallet.starCoinAvailable)}</div></div>
              <DialogFooter><DialogClose asChild><Button variant="outline">关闭</Button></DialogClose><Button disabled={!data.app.rechargeEnabled}>立即充值</Button></DialogFooter>
            </>
          ) : currencyPopup ? (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2">{currencyPopup === "starlight" ? <Sparkles className="size-5 text-primary" /> : <Gem className="size-5 text-secondary" />}星币兑换{currencyPopup === "starlight" ? "星光" : "星尘"}</DialogTitle><DialogDescription>{exchangeRate(currencyPopup) > 0 ? `当前展示比例为 1:${exchangeRate(currencyPopup)}；数据库连接为只读，暂不能提交兑换。` : "当前数据库没有可用的兑换比例，兑换暂未开放。"}</DialogDescription></DialogHeader>
              <div className="space-y-4"><div><label className="mb-2 block text-sm font-medium" htmlFor="exchange-amount">兑换星币数量</label><Input id="exchange-amount" type="number" min="1" value={exchangeAmount} onChange={(event) => setExchangeAmount(event.target.value)} /></div><div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm"><span className="text-muted-foreground">预计获得</span><span className="flex items-center gap-1.5 font-semibold">{currencyPopup === "starlight" ? <Sparkles className="size-4 text-primary" /> : <Gem className="size-4 text-secondary" />}{parsedExchangeAmount * exchangeRate(currencyPopup)} {currencyPopup === "starlight" ? "星光" : "星尘"}</span></div></div>
              <DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button variant={currencyPopup === "starlight" ? "default" : "secondary"} onClick={() => exchange(currencyPopup)}><ArrowRightLeft />确认兑换</Button></DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={purchaseTarget !== null} onOpenChange={(open) => { if (!open && !isPurchasing) setPurchaseTarget(null) }}>
        <DialogContent showCloseButton={!isPurchasing}>
          {purchaseTarget && selectedTier && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2">{purchaseIsStardust ? <Gem className="size-5 text-secondary" /> : <Sparkles className="size-5 text-primary" />}确认购买</DialogTitle><DialogDescription>购买后立即发放到游戏内库存，可在库存页查看。</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3"><span className="min-w-0 truncate font-medium">{purchaseTarget[0].title}</span><Badge variant="secondary">{purchaseTarget[0].category || "其他"}</Badge></div>
                {purchaseTarget[0].purchaseBackend === "star-product" && (
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">适用模式</div>
                    <StoreProductModeBadges mode={purchaseTarget[0].mode} />
                  </div>
                )}
                {purchaseTarget.length > 1 && (
                  <div className="grid gap-2">
                    {purchaseTarget.map((tier) => (
                      <button key={tier.id} type="button" aria-pressed={selectedTier.id === tier.id} onClick={() => setPurchaseTierId(tier.id)} className={cn("flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm transition-colors", selectedTier.id === tier.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40")}>
                        <span className="flex items-center gap-2">{selectedTier.id === tier.id && <Check className="size-4 text-primary" />}{storeTierLabel(tier)}</span>
                        <span className="flex items-center gap-1.5 font-semibold">{purchaseIsStardust ? <Gem className="size-4 text-secondary" /> : <Sparkles className="size-4 text-primary" />}{tier.price}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2 rounded-xl border border-border px-4 py-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">期限</span><span className="font-medium">{storeTierLabel(selectedTier)}{selectedTier.days > 0 && selectedTier.quantity <= 1 ? "（重复购买时长累加）" : ""}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">价格</span><span className="flex items-center gap-1.5 font-semibold">{purchaseIsStardust ? <Gem className="size-4 text-secondary" /> : <Sparkles className="size-4 text-primary" />}{selectedTier.price} {purchaseCurrencyLabel}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">当前余额</span><span className="tabular-nums">{purchaseBalanceAvailable ? `${purchaseBalance.toLocaleString()} ${purchaseCurrencyLabel}` : "暂无数据"}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">购买后余额</span><span className={cn("tabular-nums font-semibold", purchaseBalance - selectedTier.price < 0 && "text-red-600 dark:text-red-300")}>{purchaseBalanceAvailable ? `${(purchaseBalance - selectedTier.price).toLocaleString()} ${purchaseCurrencyLabel}` : "—"}</span></div>
                </div>
                {purchaseBalanceAvailable && purchaseBalance < selectedTier.price && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">{purchaseCurrencyLabel}余额不足，还差 {(selectedTier.price - purchaseBalance).toLocaleString()} {purchaseCurrencyLabel}。</div>}
                {purchaseError && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">{purchaseError}</div>}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline" disabled={isPurchasing}>取消</Button></DialogClose>
                <Button disabled={isPurchasing || (purchaseBalanceAvailable && purchaseBalance < selectedTier.price)} onClick={() => void confirmPurchase()}><ShoppingBag />{isPurchasing ? "购买中…" : "确认购买"}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="mt-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="store-tabs">
          <Button variant={activeStore === "afdian" ? "secondary" : "ghost"} onClick={() => setActiveStore("afdian")}><Zap />发电商店</Button>
          <Button variant={activeStore === "starlight" ? "secondary" : "ghost"} onClick={() => setActiveStore("starlight")}><Sparkles />星光商店</Button>
          <Button variant={activeStore === "stardust" ? "secondary" : "ghost"} onClick={() => setActiveStore("stardust")}><Gem />星尘商店</Button>
        </div>
        {isAuthenticated && activeStore !== "afdian" && <div className="text-sm text-muted-foreground">当前余额：<span className="font-semibold text-foreground">{activeBalanceAvailable ? `${activeBalance.toLocaleString()} ${activeStore === "starlight" ? "星光" : "星尘"}` : "当前数据库暂无数据"}</span></div>}
      </div>

      <div className="relative mt-4">
        {categoryScrollEdges.left && <button type="button" className="group absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-start bg-gradient-to-r from-background via-background/85 to-transparent opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100" onClick={() => scrollCategories(-1)} aria-label="向左查看更多分类"><span className="grid size-7 place-items-center rounded-full border border-border bg-card text-foreground shadow-md"><ChevronLeft className="size-4" /></span></button>}
        <div ref={categoryScrollRef} className="store-category-scroll flex items-center gap-2 overflow-x-auto pb-1" aria-label="商品分类" onScroll={updateCategoryScrollEdges}>
          <Button size="sm" className="shrink-0" variant={activeCategory === "all" ? "secondary" : "outline"} onClick={() => setActiveCategory("all")}>全部 {currencyItems.length}</Button>
          {categories.map((category) => <Button key={category} size="sm" className="shrink-0" variant={activeCategory === category ? "secondary" : "outline"} onClick={() => setActiveCategory(category)}>{category} {currencyItems.filter((item) => (item.category || "其他") === category).length}</Button>)}
        </div>
        {categoryScrollEdges.right && <button type="button" className="group absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end bg-gradient-to-l from-background via-background/85 to-transparent opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100" onClick={() => scrollCategories(1)} aria-label="向右查看更多分类"><span className="grid size-7 place-items-center rounded-full border border-border bg-card text-foreground shadow-md"><ChevronRight className="size-4" /></span></button>}
      </div>

      {storeNotice && <div className="mt-4 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-foreground">{storeNotice}</div>}

      {activeItems.length === 0 && <Card className="mt-4"><CardContent className="py-12 text-center text-sm text-muted-foreground">{currencyItems.length === 0 && activeStore === "stardust" ? "星尘商品目录尚未导入 DB_CHALLENGE。" : currencyItems.length === 0 && activeStore === "afdian" ? "暂无可购买的爱发电商品。" : "当前分类没有可展示的商品。"}</CardContent></Card>}
      <div className="store-grid mt-4">
        {groupedItems.map((group) => {
          const item = group.tiers[0]
          const Icon = displayIcons[item.icon] ?? Package
          const isAfdianItem = item.purchaseBackend === "afdian-cdk"
          const minPrice = group.tiers[0].price
          return (
            <Card key={group.key} className="store-card overflow-hidden">
              <div className={cn("relative grid h-32 place-items-center overflow-hidden bg-gradient-to-br", item.tone, isAfdianItem ? afdianCategoryTone(item.category) : rarityToneClass(item.tag))}>
                {isAfdianItem && <><div className="absolute -right-5 -top-8 size-24 rounded-full bg-white/20 blur-2xl" /><div className="absolute -bottom-10 -left-6 size-24 rounded-full bg-black/20 blur-xl" /><div className="absolute inset-x-4 bottom-3 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-white/65"><span>STARCS</span><span>{item.category || "其他"}</span></div><div className="relative grid size-16 place-items-center rounded-2xl border border-white/25 bg-white/15 shadow-xl backdrop-blur-sm"><Icon className="size-8 text-white" /></div></>}
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} /> : null}
                {!isAfdianItem && <Icon className="size-12 text-white/90" />}
              </div>
              <CardHeader><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 gap-1"><Badge variant="secondary">{item.category || "其他"}</Badge>{item.tag && item.tag !== item.category && <Badge variant="outline" className={rarityBadgeClass(item.tag)}>{item.tag}</Badge>}{item.purchaseBackend === "star-product" && (group.tiers.length > 1 ? <Badge variant="outline">{group.tiers.length} 档位</Badge> : <Badge variant="outline">{storeTierLabel(item)}</Badge>)}</div><span className="flex items-center gap-1 font-semibold text-primary">{activeStore === "afdian" ? <>¥{minPrice}</> : <>{activeStore === "starlight" ? <Sparkles className="size-3.5" /> : <Gem className="size-3.5" />}{minPrice}{group.tiers.length > 1 && <span className="text-xs font-normal text-muted-foreground"> 起</span>}</>}</span></div><CardTitle className="pt-3 text-base">{item.title}</CardTitle><CardDescription>{item.description}</CardDescription>{item.purchaseBackend === "star-product" && <StoreProductModeBadges mode={item.mode} className="pt-2" />}</CardHeader>
              <CardContent><Button className="w-full" variant="outline" onClick={() => void purchase(group)}>{item.purchaseBackend === "afdian-cdk" ? "前往爱发电购买" : !isAuthenticated ? "登录后购买" : item.purchaseBackend === "challenge-stardust" ? "星尘购买" : "星光购买"}</Button></CardContent>
            </Card>
          )
        })}
      </div>
    </main>
  )
}

function BackendDataPage({ isLoading, error, onRetry }: { isLoading: boolean; error: string | null; onRetry: () => void }) {
  if (isLoading) {
    return (
      <main className="page-shell" aria-label="正在同步登录器数据" aria-busy="true">
        <div className="mb-8 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-72 max-w-[72vw]" />
          <Skeleton className="h-4 w-[430px] max-w-[88vw]" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index} className="overflow-hidden">
              <Skeleton className="h-32 w-full rounded-none" />
              <CardHeader className="space-y-3"><div className="flex items-center justify-between gap-4"><Skeleton className="h-5 w-16" /><Skeleton className="h-4 w-12" /></div><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-full" /></CardHeader>
              <CardContent><Skeleton className="h-9 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <PageHeading eyebrow="STAR 服务" title="暂时无法读取展示数据" description="请确认 star-launcher-backend 已经启动。" />
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <RefreshCw className="mb-4 size-8 text-primary" />
          <p className="max-w-xl text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-5" onClick={onRetry}><RefreshCw />重新获取</Button>
        </CardContent>
      </Card>
    </main>
  )
}

function InventoryPage({ items, purchaseHistory, equipment, isAuthenticated, isEquipmentLoading, equipmentUnavailableReason, onRequireLogin, onRetryEquipment, onEquipmentOperation, onStardustOperation }: { items: LauncherInventoryItem[]; purchaseHistory: LauncherPurchaseHistoryItem[]; equipment: StarLightEquipmentProfile; isAuthenticated: boolean; isEquipmentLoading: boolean; equipmentUnavailableReason: string | null; onRequireLogin: () => void; onRetryEquipment: () => void; onEquipmentOperation: (equip: boolean, productId: number, modes: string[], team: EquipmentTargetTeam) => Promise<boolean>; onStardustOperation: (equip: boolean, itemType: string, uniqueId: string) => Promise<boolean> }) {
  const [inventory, setInventory] = useState(items)
  const [purchaseHistoryOpen, setPurchaseHistoryOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ itemId: string; x: number; y: number } | null>(null)
  const [equippingItem, setEquippingItem] = useState<LauncherInventoryItem | null>(null)
  const [selectedEquipmentModes, setSelectedEquipmentModes] = useState<string[]>(["ZM"])
  const [equipmentTeam, setEquipmentTeam] = useState<EquipmentTargetTeam>("all")
  const [inventoryNotice, setInventoryNotice] = useState<string | null>(null)
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  const [isEquipmentSubmitting, setIsEquipmentSubmitting] = useState(false)
  const [stardustPendingId, setStardustPendingId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState("all")
  const categoryScrollRef = useRef<HTMLDivElement>(null)
  const [categoryScrollEdges, setCategoryScrollEdges] = useState({ left: false, right: false })

  const inventoryCategories = [...new Set(inventory.map((item) => item.type || "其他"))]
  const filteredInventory = activeCategory === "all" ? inventory : inventory.filter((item) => (item.type || "其他") === activeCategory)

  const updateCategoryScrollEdges = useCallback(() => {
    const container = categoryScrollRef.current
    if (!container) return
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    setCategoryScrollEdges({
      left: container.scrollLeft > 2,
      right: container.scrollLeft < maxScrollLeft - 2,
    })
  }, [])

  useEffect(() => {
    setInventory(items)
    // 仅当当前筛选的分类在新数据中已不存在时才回到“全部”，保留用户的筛选
    setActiveCategory((current) => {
      if (current === "all") return current
      return items.some((item) => (item.type || "其他") === current) ? current : "all"
    })
  }, [items])

  useEffect(() => {
    if (!isAuthenticated) return
    const container = categoryScrollRef.current
    if (!container) return
    const frame = requestAnimationFrame(updateCategoryScrollEdges)
    const observer = new ResizeObserver(updateCategoryScrollEdges)
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [isAuthenticated, inventory.length, inventoryCategories.length, updateCategoryScrollEdges])

  function scrollCategories(direction: -1 | 1) {
    const container = categoryScrollRef.current
    if (!container) return
    const distance = Math.max(240, Math.round(container.clientWidth * 0.65))
    container.scrollBy({ left: direction * distance, behavior: "smooth" })
  }

  useEffect(() => {
    const closeMenu = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu()
    }
    window.addEventListener("click", closeMenu)
    window.addEventListener("blur", closeMenu)
    window.addEventListener("resize", closeMenu)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("click", closeMenu)
      window.removeEventListener("blur", closeMenu)
      window.removeEventListener("resize", closeMenu)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [])

  function openContextMenu(event: React.MouseEvent, item: LauncherInventoryItem) {
    event.preventDefault()
    if (!isAuthenticated) {
      onRequireLogin()
      return
    }
    setContextMenu({
      itemId: item.id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 208)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 86)),
    })
  }

  async function handleStardustToggle(item: LauncherInventoryItem) {
    if (stardustPendingId) return
    setStardustPendingId(item.id)
    setInventoryNotice(null)
    try {
      const ok = await onStardustOperation(!item.equipped, item.stardustType, item.uniqueId)
      if (ok) setInventoryNotice(item.equipped ? `已卸下「${item.name}」。` : `已装备「${item.name}」，同类型物品已自动替换。`)
    } catch (error) {
      setInventoryNotice(presentError("星尘装备失败", error, "星尘装备同步失败，请稍后重试。"))
    } finally {
      setStardustPendingId(null)
    }
  }

  function handleInventoryAction(item: LauncherInventoryItem) {
    if (!isAuthenticated) {
      setContextMenu(null)
      onRequireLogin()
      return
    }
    setContextMenu(null)
    if (item.source === "stardust" && item.stardustType) {
      if (item.quantity <= 0) {
        setInventoryNotice(`「${item.name}」数量不足。`)
        return
      }
      void handleStardustToggle(item)
      return
    }
    const slot = getCosmeticSlot(item)
    if (slot) {
      if (isEquipmentLoading || equipmentUnavailableReason) {
        setInventoryNotice(isEquipmentLoading ? "游戏内装备配置仍在加载，稍后即可使用装备功能。" : `装备功能暂不可用：${equipmentUnavailableReason}`)
        return
      }
      const validationError = getEquipmentValidationError(item)
      if (validationError) {
        console.warn(`[StarCS Launcher] 「${item.name}」装备校验失败：${validationError}`)
        setInventoryNotice(`「${item.name}」的装备数据不完整，暂时无法配置。`)
        return
      }
      const allowedModes = getSelectableEquipmentModes(item)
      if (allowedModes.length === 0) {
        setInventoryNotice(`「${item.name}」没有可用的服务器模式。`)
        return
      }
      setSelectedEquipmentModes((current) => {
        const retained = current.filter((mode) => allowedModes.includes(mode))
        return retained.length > 0 ? retained : [allowedModes[0]]
      })
      setEquipmentError(null)
      setEquippingItem(item)
      return
    }
    if (item.quantity <= 0) {
      setInventoryNotice(`「${item.name}」数量不足。`)
      return
    }

    const detail = item.description.trim()
    setInventoryNotice(detail ? `「${item.name}」${detail}` : `「${item.name}」暂未开放使用。`)
  }

  function toggleEquipmentMode(mode: string) {
    if (equipment.unavailableModes?.[mode]) return
    setSelectedEquipmentModes((current) => current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode])
  }

  function getSelectableEquipmentModes(item: LauncherInventoryItem) {
    return equipmentModes
      .filter(([mode]) => productModeIsAllowed(item.mode, mode) && !equipment.unavailableModes?.[mode])
      .map(([mode]) => mode)
  }

  async function confirmEquipment() {
    if (!equippingItem) return
    const slot = getCosmeticSlot(equippingItem)
    const productId = equippingItem.productId
    const modes = selectedEquipmentModes.filter((mode) => getSelectableEquipmentModes(equippingItem).includes(mode))
    if (!slot || !productId || modes.length === 0) return
    setEquipmentError(null)
    setIsEquipmentSubmitting(true)
    try {
      if (!await onEquipmentOperation(true, productId, modes, equipmentTeam)) return
      const teamLabel = slot === "weapon" ? "全阵营" : equipmentTeam === "all" ? "所有阵营" : equipmentTeam.toUpperCase()
      setInventoryNotice(`已将「${equippingItem.name}」装配到游戏内配置：${modes.length} 个模式 · ${teamLabel}。`)
      setEquippingItem(null)
    } catch (error) {
      setEquipmentError(presentError("装备物品失败", error, "装备同步未能完成，请稍后重试。"))
    } finally {
      setIsEquipmentSubmitting(false)
    }
  }

  async function clearEquipment() {
    if (!equippingItem) return
    const slot = getCosmeticSlot(equippingItem)
    const productId = equippingItem.productId
    const modes = selectedEquipmentModes.filter((mode) => getSelectableEquipmentModes(equippingItem).includes(mode))
    if (!slot || !productId || modes.length === 0) return
    setEquipmentError(null)
    setIsEquipmentSubmitting(true)
    try {
      if (!await onEquipmentOperation(false, productId, modes, equipmentTeam)) return
      const teamLabel = slot === "weapon" ? "全阵营" : equipmentTeam === "all" ? "所有阵营" : equipmentTeam.toUpperCase()
      setInventoryNotice(`已将「${equippingItem.name}」从游戏内配置卸载：${modes.length} 个模式 · ${teamLabel}。`)
      setEquippingItem(null)
    } catch (error) {
      setEquipmentError(presentError("卸下物品失败", error, "卸下操作未能完成，请稍后重试。"))
    } finally {
      setIsEquipmentSubmitting(false)
    }
  }

  const menuItem = contextMenu ? inventory.find((item) => item.id === contextMenu.itemId) ?? null : null
  const equippingSlot = equippingItem ? getCosmeticSlot(equippingItem) : null
  const selectedConfigurationCount = selectedEquipmentModes.length * (equippingSlot === "player" && equipmentTeam === "all" ? 2 : 1)
  const currentEquipmentIDs = equippingItem ? getConfiguredProductIds(equipment, equippingItem, selectedEquipmentModes, equipmentTeam) : []
  const currentEquipmentNames = [...new Set(currentEquipmentIDs.map((productId) => inventory.find((item) => item.productId === productId)?.name).filter(Boolean))]
  const selectableEquipmentModes = equippingItem ? getSelectableEquipmentModes(equippingItem) : []
  const unavailableModeEntries = Object.entries(equipment.unavailableModes ?? {})

  return (
    <main className="page-shell inventory-page-shell">
      <PageHeading eyebrow="我的库存" title={isAuthenticated ? "已拥有的物品" : "登录并解锁装备库"} description={isAuthenticated ? "展示当前账号可用的全部物品；装备配置会同步到各模式游戏服务器。" : "连接当前 Steam 账号，立即查看真实库存并管理外观配置。"} action={isAuthenticated ? <Button variant="outline" onClick={() => setPurchaseHistoryOpen(true)}><ShoppingBag />最近购买 {purchaseHistory.length}</Button> : undefined} />
      {!isAuthenticated && <section className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]" aria-label="登录后解锁库存">
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.14] via-card to-secondary/[0.12]">
          <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 right-4 size-72 rounded-full bg-accent/15 blur-3xl" />
          <div className="pointer-events-none absolute right-8 top-8 hidden grid-cols-2 gap-3 opacity-35 sm:grid" aria-hidden="true"><div className="grid size-20 place-items-center rounded-2xl border border-primary/25 bg-card/60 text-primary backdrop-blur-sm"><Zap className="size-8" /></div><div className="grid size-20 place-items-center rounded-2xl border border-secondary/25 bg-card/60 text-secondary backdrop-blur-sm"><UserRound className="size-8" /></div><div className="col-span-2 grid h-16 place-items-center rounded-2xl border border-accent/20 bg-card/60 text-accent backdrop-blur-sm"><Gamepad2 className="size-7" /></div></div>
          <CardContent className="relative flex min-h-[360px] flex-col justify-between p-8 sm:p-10">
            <div className="max-w-xl"><Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary"><KeyRound />登录后立即解锁</Badge><div className="mt-6 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-xl"><Backpack className="size-8" /></div><h2 className="mt-6 text-3xl font-semibold tracking-tight">登录 STARCS，带上你的装备</h2><p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">自动读取当前 Steam 账号的真实库存；角色外观支持按模式与阵营配置，武器外观按模式和对应武器配置。</p></div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"><Button size="lg" className="min-w-48 shadow-lg shadow-primary/20" onClick={onRequireLogin}><LogIn />立即登录</Button></div>
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card><CardContent className="flex min-h-[104px] items-center gap-4 p-5"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Boxes /></div><div><CardTitle className="text-base">真实库存同步</CardTitle><CardDescription className="mt-1 leading-5">只展示当前账号实际持有且仍然有效的物品。</CardDescription></div></CardContent></Card>
          <Card><CardContent className="flex min-h-[104px] items-center gap-4 p-5"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary/15 text-secondary"><Gamepad2 /></div><div><CardTitle className="text-base">配好就开打</CardTitle><CardDescription className="mt-1 leading-5">阵营外观分开搭，武器皮肤对号入座，进图就长你配的那样。</CardDescription></div></CardContent></Card>
          <Card><CardContent className="flex min-h-[104px] items-center gap-4 p-5"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><ShieldCheck /></div><div><CardTitle className="text-base">换着玩不打架</CardTitle><CardDescription className="mt-1 leading-5">不同玩法互不干扰，在这改完，服务器那边马上就好。</CardDescription></div></CardContent></Card>
        </div>
      </section>}
      {isAuthenticated && inventoryNotice && <div className="pointer-events-none fixed inset-x-0 top-[76px] z-30 flex justify-center px-4"><div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm shadow-lg shadow-black/5 backdrop-blur-md"><Info className="mt-0.5 size-4 shrink-0 text-primary" /><span className="leading-5">{inventoryNotice}</span><button type="button" aria-label="关闭提示" className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground" onClick={() => setInventoryNotice(null)}><X className="size-4" /></button></div></div>}
      {isAuthenticated && (isEquipmentLoading || equipmentUnavailableReason) && <div className="mb-4 flex flex-col justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center"><div><div className="font-medium text-amber-700 dark:text-amber-200">{isEquipmentLoading ? "正在同步游戏内装备配置" : "装备功能暂不可用"}</div><div className="mt-1 text-xs text-muted-foreground">{isEquipmentLoading ? "库存和其他登录功能可以正常使用。" : equipmentUnavailableReason}</div></div>{equipmentUnavailableReason && <Button variant="outline" size="sm" onClick={onRetryEquipment}><RefreshCw />重新读取</Button>}</div>}
      {isAuthenticated && !isEquipmentLoading && !equipmentUnavailableReason && unavailableModeEntries.length > 0 && <div className="mb-4 flex flex-col justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center"><div><div className="font-medium text-amber-700 dark:text-amber-200">部分模式的装备配置暂不可用</div><div className="mt-1 text-xs text-muted-foreground">暂不可用：{unavailableModeEntries.map(([mode]) => modeLabels[mode] ?? mode).join("、")}。其他模式可以正常配置。</div></div><Button variant="outline" size="sm" onClick={onRetryEquipment}><RefreshCw />重新读取</Button></div>}
      {isAuthenticated && <div className="relative mb-4">
        {categoryScrollEdges.left && <button type="button" className="group absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-start bg-gradient-to-r from-background via-background/85 to-transparent opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100" onClick={() => scrollCategories(-1)} aria-label="向左查看更多分类"><span className="grid size-7 place-items-center rounded-full border border-border bg-card text-foreground shadow-md"><ChevronLeft className="size-4" /></span></button>}
        <div ref={categoryScrollRef} className="store-category-scroll flex items-center gap-2 overflow-x-auto pb-1" aria-label="库存分类" onScroll={updateCategoryScrollEdges}>
          <Button size="sm" className="shrink-0" variant={activeCategory === "all" ? "secondary" : "outline"} onClick={() => setActiveCategory("all")}>全部 {inventory.length}</Button>
          {inventoryCategories.map((category) => <Button key={category} size="sm" className="shrink-0" variant={activeCategory === category ? "secondary" : "outline"} onClick={() => setActiveCategory(category)}>{category} {inventory.filter((item) => (item.type || "其他") === category).length}</Button>)}
        </div>
        {categoryScrollEdges.right && <button type="button" className="group absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end bg-gradient-to-l from-background via-background/85 to-transparent opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100" onClick={() => scrollCategories(1)} aria-label="向右查看更多分类"><span className="grid size-7 place-items-center rounded-full border border-border bg-card text-foreground shadow-md"><ChevronRight className="size-4" /></span></button>}
      </div>}
      {isAuthenticated && <div className="inventory-grid">
        {filteredInventory.map((item) => {
          const Icon = displayIcons[item.icon] ?? Package
          const itemName = item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name
          const isStardust = item.source === "stardust" && Boolean(item.stardustType)
          const slot = getCosmeticSlot(item)
          const hasSelectableEquipmentMode = !slot || getSelectableEquipmentModes(item).length > 0
          const isEquipped = isStardust ? item.equipped : isStarLightItemEquipped(equipment, item)
          const equippedTeams = getEquippedTeams(equipment, item)
          const equippedAllTeams = equippedTeams.ct && equippedTeams.t
          const remainingLabel = formatRemainingTime(item.expiresAt)
          return (
            <Card key={item.id} className={cn("inventory-card overflow-hidden", item.quantity <= 0 && "opacity-60")} onContextMenu={(event) => openContextMenu(event, item)}>
              <div className={cn("relative grid aspect-[4/3] place-items-center bg-gradient-to-br", item.tone, rarityToneClass(item.rarity))}><Badge variant="outline" className={cn("absolute left-2 top-2 border-white/20 bg-black/35 text-white backdrop-blur-sm", rarityBadgeClass(item.rarity))}>{item.rarity}</Badge>{isEquipped && (isStardust || equippedAllTeams ? <Badge variant="success" className="absolute bottom-2 right-2 !px-1.5" aria-label="已装备" title="已装备"><Check /><span className="sr-only">已装备</span></Badge> : <span className="absolute bottom-2 right-2 flex items-center gap-1" role="img" aria-label={`已装备（${equippedTeams.ct ? "CT" : "T"} 阵营）`} title={`已装备（${equippedTeams.ct ? "CT" : "T"} 阵营）`}><span className={cn("size-2.5 rounded-full ring-1 ring-black/30", equippedTeams.ct ? "bg-blue-500" : "bg-white/25")} /><span className={cn("size-2.5 rounded-full ring-1 ring-black/30", equippedTeams.t ? "bg-red-500" : "bg-white/25")} /></span>)}<Icon className="size-12 text-white/90" /></div>
              <CardHeader><Badge variant="secondary" className="w-fit">{item.type}</Badge><CardTitle className="pt-3 text-base">{itemName}</CardTitle><p className={cn("pt-1 text-xs", remainingLabel === "已过期" ? "text-red-600 dark:text-red-300" : "text-muted-foreground")}>{remainingLabel === "长期" || remainingLabel === "已过期" ? remainingLabel : `剩余 ${remainingLabel}`}</p></CardHeader>
              <CardContent><Button variant="secondary" className="w-full" disabled={isAuthenticated && (item.quantity <= 0 || stardustPendingId === item.id || Boolean(slot && (isEquipmentLoading || equipmentUnavailableReason || !hasSelectableEquipmentMode)))} onClick={() => handleInventoryAction(item)}>{!isAuthenticated ? "登录后操作" : isStardust ? (stardustPendingId === item.id ? "同步中…" : item.equipped ? "卸下" : "装备") : slot && isEquipmentLoading ? "正在读取配置" : slot && (equipmentUnavailableReason || !hasSelectableEquipmentMode) ? "模式暂不可用" : slot ? "配置装备" : "使用物品"}</Button></CardContent>
            </Card>
          )
        })}
      </div>}

      {contextMenu && menuItem && (
        <div role="menu" className="fixed z-[100] w-48 overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
          <button role="menuitem" type="button" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50" disabled={menuItem.quantity <= 0 || stardustPendingId === menuItem.id || Boolean(getCosmeticSlot(menuItem) && (isEquipmentLoading || equipmentUnavailableReason || getSelectableEquipmentModes(menuItem).length === 0))} onClick={() => handleInventoryAction(menuItem)}>
            {getCosmeticSlot(menuItem) ? <Gamepad2 className="size-4 text-primary" /> : menuItem.source === "stardust" ? <Gem className="size-4 text-secondary" /> : <Zap className="size-4 text-accent" />}
            <span><span className="block font-medium">{getCosmeticSlot(menuItem) ? "配置装备" : menuItem.source === "stardust" ? (menuItem.equipped ? "卸下" : "装备") : "使用"}</span><span className="block text-[10px] text-muted-foreground">{menuItem.name}</span></span>
          </button>
        </div>
      )}

      <Dialog open={purchaseHistoryOpen} onOpenChange={setPurchaseHistoryOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingBag className="size-5 text-primary" />最近购买记录</DialogTitle><DialogDescription>展示当前账号从数据库读取到的购买记录。</DialogDescription></DialogHeader>
          {purchaseHistory.length === 0 ? <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">暂无购买记录</div> : <div className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">{purchaseHistory.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{item.productName}</div><div className="mt-1 text-xs text-muted-foreground">{item.description || `${item.quantity} 件${item.days > 0 ? ` · ${item.days} 天` : ""}`} · {formatLauncherDate(item.createdAt)}</div></div><div className="shrink-0 text-right"><div className="text-sm font-semibold">{item.totalPrice.toLocaleString()}</div><div className="text-[10px] text-muted-foreground">{item.currencyType || "货币"}</div></div></div>)}</div>}
          <DialogFooter><DialogClose asChild><Button variant="outline">关闭</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={equippingItem !== null} onOpenChange={(open) => { if (!open && !isEquipmentSubmitting) { setEquippingItem(null); setEquipmentError(null) } }}>
        <DialogContent>
          {equippingItem && (
            <>
              <DialogHeader><DialogTitle>配置「{equippingItem.name}」</DialogTitle><DialogDescription>{equippingSlot === "weapon" ? "勾选一个或多个模式；武器外观会按 StarLightStore 的武器类型与 prefab 配置，并对两个阵营生效。" : "勾选一个或多个模式，并为所有阵营或指定阵营装备角色外观。"}</DialogDescription></DialogHeader>
              <div className="space-y-5">
                <div><div className="mb-2 flex items-center justify-between"><div className="text-sm font-medium">服务器模式</div><button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedEquipmentModes(selectedEquipmentModes.length === selectableEquipmentModes.length ? [] : selectableEquipmentModes)}>{selectedEquipmentModes.length === selectableEquipmentModes.length ? "清空" : "全选可用"}</button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{equipmentModes.map(([mode, label]) => { const unavailableReason = equipment.unavailableModes?.[mode]; const allowed = productModeIsAllowed(equippingItem.mode, mode) && !unavailableReason; return <label key={mode} title={unavailableReason ? "该模式的装备配置暂不可用" : undefined} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors", allowed ? "cursor-pointer" : "cursor-not-allowed opacity-45", selectedEquipmentModes.includes(mode) ? "border-primary/40 bg-primary/10 text-foreground" : "border-border", allowed && "hover:bg-muted/40")}><input type="checkbox" className="size-4 accent-[var(--color-primary)]" disabled={!allowed} checked={selectedEquipmentModes.includes(mode)} onChange={() => toggleEquipmentMode(mode)} /><span>{label}{unavailableReason && <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-300">不可用</span>}</span></label> })}</div></div>
                {equippingSlot === "player" ? <div><div className="mb-2 text-sm font-medium">阵营</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Button type="button" variant={equipmentTeam === "all" ? "secondary" : "outline"} onClick={() => setEquipmentTeam("all")}>所有阵营</Button><Button type="button" variant={equipmentTeam === "ct" ? "secondary" : "outline"} onClick={() => setEquipmentTeam("ct")}>CT 反恐精英</Button><Button type="button" variant={equipmentTeam === "t" ? "secondary" : "outline"} onClick={() => setEquipmentTeam("t")}>T 恐怖分子</Button></div></div> : <div className="rounded-lg border border-secondary/20 bg-secondary/10 px-4 py-3 text-sm"><div className="font-medium">全阵营武器配置</div><div className="mt-1 text-xs text-muted-foreground">{equippingItem.weaponPrefab} · {equippingItem.weaponType}</div></div>}
                <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm"><div className="text-xs text-muted-foreground">将覆盖 {selectedConfigurationCount} 个配置</div><div className="mt-1 font-medium">{currentEquipmentNames.length > 0 ? `当前包含：${currentEquipmentNames.join("、")}` : "当前均未装备"}</div></div>
                {equipmentError && <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300"><div className="font-medium">操作失败</div><div className="mt-1 text-xs leading-5">{equipmentError}</div></div>}
              </div>
              <DialogFooter><Button variant="ghost" disabled={isEquipmentSubmitting || !currentEquipmentIDs.includes(equippingItem.productId ?? 0)} onClick={() => void clearEquipment()}>卸下此物品</Button><DialogClose asChild><Button variant="outline" disabled={isEquipmentSubmitting}>取消</Button></DialogClose><Button disabled={isEquipmentSubmitting || selectedEquipmentModes.length === 0} onClick={() => void confirmEquipment()}>{isEquipmentSubmitting ? <RefreshCw className="animate-spin" /> : <Check />}{isEquipmentSubmitting ? "正在校验…" : "确认装备"}</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}

function formatLauncherDate(value: string) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
}

// 只保留最大时间单位：1 天、3 小时、30 分钟……
// 无到期时间（永久）或剩余超过 1 年的，统一显示“长期”。
function formatRemainingTime(expiresAt: string) {
  if (!expiresAt) return "长期"
  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return "长期"
  const remainingMs = expiry.getTime() - Date.now()
  if (remainingMs <= 0) return "已过期"
  if (remainingMs > 365 * 86_400_000) return "长期"
  const minutes = Math.floor(remainingMs / 60_000)
  if (minutes < 1) return "不足 1 分钟"
  const hours = Math.floor(minutes / 60)
  if (hours < 1) return `${minutes} 分钟`
  const days = Math.floor(hours / 24)
  if (days < 1) return `${hours} 小时`
  return `${days} 天`
}

function SeasonPassTask({ title, current, milestones, unit, statuses }: { title: string; current: number; milestones: number[]; unit: string; statuses?: number[] }) {
  const max = milestones[milestones.length - 1] ?? 1
  const clamped = Math.min(Math.max(current, 0), max)
  const nextMilestone = milestones.find((milestone) => current < milestone)
  // 有任务状态（statuses）时按 quest_status 打勾（>=2 为已完成）；否则退回按进度判断
  const milestoneStatus = (index: number, milestone: number) => statuses ? (statuses[index] ?? 0) : current >= milestone ? 2 : 0
  const milestoneDone = (index: number, milestone: number) => milestoneStatus(index, milestone) >= 2
  const milestoneHint = (index: number, milestone: number) => {
    const status = milestoneStatus(index, milestone)
    if (statuses) {
      if (status >= 2) return "奖励已领取"
    } else if (status === 2) {
      return "已完成"
    }
    if (current >= milestone) return "进度已达成，可在游戏内完成任务"
    return `还差 ${milestone - current} ${unit}`
  }
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{clamped}</span>/{max} {unit}
          {nextMilestone !== undefined && <span className="ml-1.5">· {nextMilestone} {unit}</span>}
        </span>
      </div>
      <div className="relative mt-2.5">
        <Progress value={(clamped / max) * 100} />
        {milestones.map((milestone, index) => (
          <span
            key={milestone}
            className={cn(
              "absolute top-1/2 size-2 -translate-y-1/2 rounded-full border",
              milestone === max ? "-translate-x-full" : "-translate-x-1/2",
              milestoneDone(index, milestone) ? "border-primary bg-primary" : "border-border bg-background",
            )}
            style={{ left: `${(milestone / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {milestones.map((milestone, index) => (
          <span key={milestone} className={cn("group relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]", milestoneDone(index, milestone) ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
            {milestoneDone(index, milestone) && <Check className="size-2.5" />}
            {milestone} {unit}
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1 text-[10px] whitespace-nowrap text-card-foreground shadow-lg group-hover:block">
              {milestoneHint(index, milestone)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function ProfilePage({ account, purchaseHistory, seasonPass, penalties, steamAccount, isAuthenticated, theme, onThemeChange, onLogin, onLogout, onCheckUpdate }: { account: LauncherAccount | null; purchaseHistory: LauncherPurchaseHistoryItem[]; seasonPass: LauncherSeasonPass | null; penalties: LauncherPenalty[]; steamAccount: LocalSteamAccount | null; isAuthenticated: boolean; theme: ThemePreference; onThemeChange: (theme: ThemePreference) => void; onLogin: () => void; onLogout: () => void; onCheckUpdate: () => Promise<"found" | "latest" | "error"> }) {
  const profile = account?.profile ?? null
  const displayName = isAuthenticated ? steamAccount?.personaName || profile?.displayName || "StarCS 玩家" : "未登录"
  const avatarUrl = steamAccount?.avatarDataUrl || profile?.avatarUrl || starLogo
  const wallet = account?.wallet
  const dailyQuestStatus = seasonPass?.dailyQuestStatus ?? {}
  const weeklyQuestStatus = seasonPass?.weeklyQuestStatus ?? {}
  const [appVersion, setAppVersion] = useState("")
  const [updateCheckState, setUpdateCheckState] = useState<"idle" | "checking" | "latest" | "error">("idle")

  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => {})
  }, [])

  const handleCheckUpdate = async () => {
    setUpdateCheckState("checking")
    const result = await onCheckUpdate()
    // "found" 时更新弹窗已接管，这里不需要额外提示
    setUpdateCheckState(result === "found" ? "idle" : result === "latest" ? "latest" : "error")
  }

  return (
    <main className="page-shell">
      <PageHeading eyebrow="个人中心" title={isAuthenticated ? `欢迎回来，${displayName}` : "当前未登录"} description={isAuthenticated ? "查看社区资料、游戏统计与应用偏好。" : "登录可以享受登录器福利，更方便地进行库存管理和装备配置。"} />
      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="profile-card overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-primary via-secondary to-accent" />
          <CardContent className="relative pt-0">
            <div className="profile-avatar">{isAuthenticated ? <img src={avatarUrl} alt={displayName} onError={(event) => { event.currentTarget.src = starLogo }} /> : <UserRound className="size-10 text-white/70" aria-label="默认头像" />}</div>
            <div className="pt-14"><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">{displayName}</h2>{isAuthenticated && profile?.verified && <Badge variant="success"><Check />已验证</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{isAuthenticated ? `StarCS 社区成员 · Lv. ${profile?.memberLevel ?? "—"}` : "登录后解锁账户福利与便捷管理功能"}</p></div>
            {isAuthenticated && profile ? <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-lg border border-border py-3 text-center"><div><div className="font-semibold">{profile.playHours}</div><div className="text-[11px] text-muted-foreground">游戏时长</div></div><div><div className="font-semibold">{wallet?.starlightAvailable ? wallet.starlight.toLocaleString() : "—"}</div><div className="text-[11px] text-muted-foreground">星光</div></div><div><div className="font-semibold">{purchaseHistory.length}</div><div className="text-[11px] text-muted-foreground">购买记录</div></div></div> : <div className="mt-5 rounded-lg border border-border bg-muted/25 p-4 text-sm text-muted-foreground">登录可以享受登录器专属福利，同时更方便地管理库存、使用物品，并为不同模式和阵营配置装备。</div>}
            <Button className="mt-4 w-full" variant={isAuthenticated ? "outline" : "default"} onClick={isAuthenticated ? onLogout : onLogin}>{isAuthenticated ? "退出登录" : <><LogIn />登录</>}</Button>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><div className="flex items-center gap-3"><div className="setting-icon"><Palette /></div><div><CardTitle>外观与主题</CardTitle><CardDescription>跟随系统，或为此应用单独选择主题。</CardDescription></div></div></CardHeader>
            <CardContent><ThemeSwitcher value={theme} onChange={onThemeChange} /></CardContent>
          </Card>
          <Card>
            <CardHeader><div className="flex items-center gap-3"><div className="setting-icon"><ShieldCheck /></div><div><CardTitle>账户安全</CardTitle><CardDescription>{isAuthenticated ? penalties.length > 0 ? `当前有 ${penalties.length} 条生效中的处罚记录。` : "没有查询到生效中的处罚记录。" : "登录时会自动识别当前 Steam 账号。"}</CardDescription></div></div></CardHeader>
            <CardContent className="space-y-3"><div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4"><div><div className="text-sm font-medium">{isAuthenticated ? `Steam ${profile?.steamConnected ? "已连接" : "未连接"}` : "尚未登录 StarCS"}</div><div className="mt-1 text-xs text-muted-foreground">{isAuthenticated && steamAccount ? `${steamAccount.personaName} · ${steamAccount.steamId}` : "点击登录后识别当前 Steam Session"}</div></div><Badge variant={isAuthenticated && profile?.steamConnected && penalties.length === 0 ? "success" : "outline"}>{isAuthenticated && profile?.steamConnected && penalties.length === 0 && <Check />}{!isAuthenticated ? "未登录" : penalties.length > 0 ? `${penalties.length} 条处罚` : profile?.steamConnected ? "正常" : "待连接"}</Badge></div>{penalties.map((penalty, index) => <div key={`${penalty.type}-${penalty.createdAt}-${index}`} className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium text-red-600 dark:text-red-300">{penalty.type || "账户处罚"}</span><span className="text-xs text-muted-foreground">{penalty.permanent ? "永久" : `至 ${formatLauncherDate(penalty.expiresAt)}`}</span></div><div className="mt-1 text-xs text-muted-foreground">{penalty.reason || "未提供原因"}{penalty.mode ? ` · ${penalty.mode}` : ""}</div></div>)}</CardContent>
          </Card>

          {isAuthenticated && seasonPass?.available && <Card><CardHeader><div className="flex items-center gap-3"><div className="setting-icon"><Trophy /></div><div><CardTitle>赛季通行证 · 第 {seasonPass.seasonId} 赛季</CardTitle><CardDescription>赛季进度最近更新于 {formatLauncherDate(seasonPass.updatedAt)}。</CardDescription></div></div></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-lg border border-border bg-muted/25 p-3"><div className="text-xl font-semibold">Lv. {seasonPass.level}</div><div className="text-xs text-muted-foreground">通行证等级</div></div><div className="rounded-lg border border-border bg-muted/25 p-3"><div className="text-xl font-semibold">{seasonPass.experience}</div><div className="text-xs text-muted-foreground">经验</div></div><div className="rounded-lg border border-border bg-muted/25 p-3"><div className="text-xl font-semibold">{seasonPass.claimedRewardCount}</div><div className="text-xs text-muted-foreground">已领礼包</div></div><div className="rounded-lg border border-border bg-muted/25 p-3"><div className="text-xl font-semibold">{seasonPass.starSourceChestOpened}</div><div className="text-xs text-muted-foreground">已开宝箱</div></div></div><div className="mt-4 space-y-4"><div><div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">每日任务</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><SeasonPassTask title="每日登录" current={seasonPass.dailyLoggedIn ? 1 : 0} milestones={[1]} unit="次" statuses={[dailyQuestStatus["1"] ?? 0]} /><SeasonPassTask title="游玩对局" current={seasonPass.dailyGames} milestones={[1, 3, 5]} unit="局" statuses={["2", "3", "4"].map((id) => dailyQuestStatus[id] ?? 0)} /><SeasonPassTask title="在线时长" current={seasonPass.dailyOnlineMinutes} milestones={[10, 30, 60]} unit="分钟" statuses={["5", "6", "7"].map((id) => dailyQuestStatus[id] ?? 0)} /></div></div><div><div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">每周任务</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><SeasonPassTask title="每周登录" current={seasonPass.weeklyLoggedIn ? 1 : 0} milestones={[1]} unit="次" statuses={[weeklyQuestStatus["101"] ?? 0]} /><SeasonPassTask title="游玩对局" current={seasonPass.weeklyGames} milestones={[1, 5, 10]} unit="局" statuses={["102", "103", "104"].map((id) => weeklyQuestStatus[id] ?? 0)} /><SeasonPassTask title="不同模式" current={seasonPass.weeklyCompletedModes} milestones={[3]} unit="种模式" statuses={[weeklyQuestStatus["105"] ?? 0]} /></div></div></div></CardContent></Card>}

          <Card>
            <CardHeader><div className="flex items-center gap-3"><div className="setting-icon"><Info /></div><div><CardTitle>关于 STAR Launcher</CardTitle><CardDescription>查看当前版本，或手动检查更新。</CardDescription></div></div></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                <div>
                  <div className="text-sm font-medium">当前版本 v{appVersion || "—"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{updateCheckState === "checking" ? "正在检查更新…" : updateCheckState === "latest" ? "已是最新版本。" : updateCheckState === "error" ? "检查失败，请稍后重试。" : "有更新时会在这里提示，也可手动检查。"}</div>
                </div>
                <Button variant="outline" size="sm" disabled={updateCheckState === "checking"} onClick={() => void handleCheckUpdate()}><RefreshCw className={updateCheckState === "checking" ? "animate-spin" : undefined} />检查更新</Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </main>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("home")
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getThemePreference()))
  const [steamAccount, setSteamAccount] = useState<LocalSteamAccount | null>(null)
  const [isSteamAccountLoading, setIsSteamAccountLoading] = useState(false)
  const [steamAccountError, setSteamAccountError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [rememberPassword, setRememberPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [authenticatedAccount, setAuthenticatedAccount] = useState<LauncherAccount | null>(null)
  const [authenticatedInventory, setAuthenticatedInventory] = useState<LauncherInventoryItem[] | null>(null)
  const [authenticatedStoreItems, setAuthenticatedStoreItems] = useState<LauncherStoreItem[] | null>(null)
  const [authenticatedEquipment, setAuthenticatedEquipment] = useState<StarLightEquipmentProfile | null>(null)
  const [isEquipmentLoading, setIsEquipmentLoading] = useState(false)
  const [equipmentUnavailableReason, setEquipmentUnavailableReason] = useState<string | null>(null)
  const [purchaseHistory, setPurchaseHistory] = useState<LauncherPurchaseHistoryItem[]>([])
  const [seasonPass, setSeasonPass] = useState<LauncherSeasonPass | null>(null)
  const [penalties, setPenalties] = useState<LauncherPenalty[]>([])
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [bootstrap, setBootstrap] = useState<LauncherBootstrap | null>(null)
  const [isBootstrapLoading, setIsBootstrapLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const bootstrapFetchStarted = useRef(false)
  const updateCheckStarted = useRef(false)
  const autoLoginStarted = useRef(false)
  const [updateDialog, setUpdateDialog] = useState<UpdateDialogState | null>(null)
  const activeAuthToken = useRef<string | null>(null)
  const isAuthenticated = authToken !== null
  const effectiveAccount = isAuthenticated ? authenticatedAccount : bootstrap?.account ?? null
  const effectiveStoreItems = isAuthenticated && authenticatedStoreItems ? authenticatedStoreItems : bootstrap?.storeItems ?? []
  const effectiveBootstrap = bootstrap && effectiveAccount ? { ...bootstrap, account: effectiveAccount, storeItems: effectiveStoreItems } : bootstrap

  const loadSteamSession = useCallback(async () => {
    setIsSteamAccountLoading(true)
    setSteamAccount(null)
    setSteamAccountError(null)
    setLoginError(null)
    setPassword("")
    setRememberPassword(false)
    try {
      const account = await getLocalSteamAccount()
      setSteamAccount(account)
      if (!account) {
        setPassword("")
        setRememberPassword(false)
        setSteamAccountError("未找到 Steam 登录记录，请确认 Steam 已安装并至少登录过一次。")
        return
      }
      const remembered = await loadRememberedPassword(account.steamId)
      setPassword(remembered ?? "")
      setRememberPassword(Boolean(remembered))
    } catch (error) {
      setSteamAccount(null)
      setSteamAccountError(presentError("读取本机 Steam Session 失败", error, "暂时无法读取本机 Steam 登录信息，请确认 Steam 已安装并正在运行。"))
    } finally {
      setIsSteamAccountLoading(false)
    }
  }, [])

  const loadLauncherData = useCallback(async () => {
    setIsBootstrapLoading(true)
    setBootstrapError(null)
    try {
      setBootstrap(await fetchLauncherBootstrap())
    } catch (error) {
      setBootstrapError(presentError("读取登录器基础数据失败", error, "暂时无法连接登录器服务，请稍后重试。"))
    } finally {
      setIsBootstrapLoading(false)
    }
  }, [])

  useEffect(() => {
    if (bootstrapFetchStarted.current) return
    bootstrapFetchStarted.current = true
    void loadLauncherData()
  }, [loadLauncherData])

  // 启动时若本机有记住的密码，则静默自动登录，避免每次打开登录器都手动点登录。
  useEffect(() => {
    if (autoLoginStarted.current) return
    autoLoginStarted.current = true
    void (async () => {
      setIsSteamAccountLoading(true)
      setSteamAccountError(null)
      try {
        const account = await getLocalSteamAccount()
        setSteamAccount(account)
        if (!account) return
        const remembered = await loadRememberedPassword(account.steamId)
        if (!remembered) {
          setPassword("")
          setRememberPassword(false)
          return
        }
        setPassword(remembered)
        setRememberPassword(true)
        await performLogin(account, remembered, true, { silent: true })
      } catch (error) {
        console.error("[StarCS Launcher] 启动自动登录失败", error)
      } finally {
        setIsSteamAccountLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 启动时检查更新：刚更新完 → 展示本次 changelog；发现新版本 → 按策略弹普通/强制更新。
  // 任何环节失败都只记录日志，绝不阻塞启动。
  useEffect(() => {
    if (updateCheckStarted.current) return
    updateCheckStarted.current = true
    void (async () => {
      try {
        if (await consumePendingUpdateChangelog()) {
          const policy = await fetchLauncherUpdatePolicy()
          setUpdateDialog({ mode: "completed", changelog: policy.changelog, version: policy.currentVersion })
          return
        }
      } catch (error) {
        console.error("[StarCS Launcher] 读取更新完成状态失败", error)
      }
      void runUpdateCheck()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 返回 "found"（弹窗）/"latest"（已是最新）/"error"；策略接口失败时降级为普通更新并用 manifest 自带说明。
  async function runUpdateCheck(): Promise<"found" | "latest" | "error"> {
    try {
      const update = await checkLauncherUpdate()
      if (!update) return "latest"
      let policy: LauncherUpdatePolicy
      try {
        policy = await fetchLauncherUpdatePolicy()
      } catch {
        policy = {
          currentVersion: update.currentVersion,
          latestVersion: update.version,
          mandatory: false,
          changelog: update.body ?? "",
          pubDate: update.date ?? "",
        }
      }
      setUpdateDialog({ mode: policy.mandatory ? "mandatory" : "optional", policy, update })
      return "found"
    } catch (error) {
      console.error("[StarCS Launcher] 检查更新失败", error)
      return "error"
    }
  }

  useEffect(() => {
    saveThemePreference(theme)
    setResolvedTheme(applyTheme(theme))

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const syncSystemTheme = () => setResolvedTheme(applyTheme(theme))
    if (theme === "system") media.addEventListener("change", syncSystemTheme)
    return () => media.removeEventListener("change", syncSystemTheme)
  }, [theme])

  const currentTheme = themeOptions.find((item) => item.id === theme) ?? themeOptions[0]
  const CurrentThemeIcon = currentTheme.icon

  function cycleTheme() {
    setTheme((current) => current === "system" ? "light" : current === "light" ? "dark" : "system")
  }

  function openLogin() {
    setLoginOpen(true)
    void loadSteamSession()
  }

  async function performLogin(
    account: LocalSteamAccount,
    currentPassword: string,
    remember: boolean,
    options?: { silent?: boolean },
  ) {
    const silent = options?.silent === true
    if (!currentPassword.trim()) {
      if (!silent) setLoginError("请输入游戏内密码。")
      return false
    }
    setLoginError(null)
    setIsLoginSubmitting(true)
    try {
      const session = await loginLauncherAccount(account.steamId, currentPassword)
      let remembered = remember
      // 本地记住密码失败不应把已成功的后端登录当成失败。
      try {
        await updateRememberedPassword(account.steamId, remember ? currentPassword : null)
      } catch (error) {
        console.error("[StarCS Launcher] 保存记住密码失败", error)
        remembered = false
      }
      activeAuthToken.current = session.token
      setAuthenticatedAccount(session.account)
      setAuthenticatedInventory(session.inventory)
      setAuthenticatedStoreItems(session.storeItems)
      setAuthenticatedEquipment(null)
      setEquipmentUnavailableReason(null)
      setPurchaseHistory(session.purchaseHistory)
      setSeasonPass(session.seasonPass)
      setPenalties(session.penalties)
      setAuthToken(session.token)
      setRememberPassword(remembered)
      setPassword(currentPassword)
      setLoginOpen(false)
      void loadAuthenticatedEquipment(session.token, currentPassword)
      return true
    } catch (error) {
      const fallback = "登录失败，请检查游戏内密码后重试。"
      if (isInvalidCredentialsError(error)) {
        const raw = error instanceof Error ? error.message : String(error ?? "")
        const detail = raw.replace(/^invalid_credentials:/, "").trim()
        const message = presentError("账号登录失败", error, detail || fallback)
        if (silent) {
          try {
            await updateRememberedPassword(account.steamId, null)
          } catch {
            // 忽略清理失败，仍引导用户重输密码。
          }
          setPassword("")
          setRememberPassword(false)
        }
        setLoginError(message)
        setLoginOpen(true)
      } else if (silent) {
        // 网络/服务异常：保留记住的密码，不打断浏览；用户可稍后手动登录。
        console.error("[StarCS Launcher] 自动登录失败", error)
      } else {
        setLoginError(presentError("账号登录失败", error, fallback))
      }
      return false
    } finally {
      setIsLoginSubmitting(false)
    }
  }

  async function login() {
    if (!steamAccount) {
      setLoginError("未识别到 Steam 账号。")
      return
    }
    await performLogin(steamAccount, password, rememberPassword)
  }

  function logout() {
    activeAuthToken.current = null
    setAuthToken(null)
    setAuthenticatedAccount(null)
    setAuthenticatedInventory(null)
    setAuthenticatedStoreItems(null)
    setAuthenticatedEquipment(null)
    setIsEquipmentLoading(false)
    setEquipmentUnavailableReason(null)
    setPurchaseHistory([])
    setSeasonPass(null)
    setPenalties([])
  }

  function endSession() {
    logout()
  }

  async function rejectCredentials(message = "密码不正确或已变更，请使用当前密码重新登录。") {
    if (steamAccount?.steamId) {
      try {
        await updateRememberedPassword(steamAccount.steamId, null)
      } catch {
        // 会话仍应失效；本地密文清理失败会在下次登录时被新密码覆盖。
      }
    }
    logout()
    setPassword("")
    setRememberPassword(false)
    setLoginError(message)
    setLoginOpen(true)
  }

  async function promptSessionRelogin() {
    endSession()
    setLoginError("登录会话已失效，请重新登录。")
    setLoginOpen(true)
    if (steamAccount?.steamId && !password.trim()) {
      try {
        const remembered = await loadRememberedPassword(steamAccount.steamId)
        if (remembered) {
          setPassword(remembered)
          setRememberPassword(true)
        }
      } catch {
        // 保留空密码输入框即可。
      }
    }
  }

  async function recoverSession(): Promise<string | null> {
    if (!steamAccount) {
      await promptSessionRelogin()
      return null
    }
    const currentPassword = password.trim()
    if (!currentPassword) {
      await promptSessionRelogin()
      return null
    }
    try {
      const session = await loginLauncherAccount(steamAccount.steamId, currentPassword)
      activeAuthToken.current = session.token
      setAuthenticatedAccount(session.account)
      setAuthenticatedInventory(session.inventory)
      setAuthenticatedStoreItems(session.storeItems)
      setPurchaseHistory(session.purchaseHistory)
      setSeasonPass(session.seasonPass)
      setPenalties(session.penalties)
      setAuthToken(session.token)
      return session.token
    } catch (error) {
      if (isInvalidCredentialsError(error)) {
        await rejectCredentials()
        return null
      }
      console.error("[StarCS Launcher] 静默重登失败", error)
      await promptSessionRelogin()
      return null
    }
  }

  async function handleAuthFailure<T extends { authenticated: boolean; authFailure?: AuthFailureReason | null }>(
    result: T,
    retry: (token: string) => Promise<T>,
    alreadyRetried = false,
  ): Promise<T | null> {
    if (result.authenticated) return result
    if (authFailureReason(result) === "credentials") {
      await rejectCredentials()
      return null
    }
    if (alreadyRetried) {
      await promptSessionRelogin()
      return null
    }
    const recoveredToken = await recoverSession()
    if (!recoveredToken) return null
    const retried = await retry(recoveredToken)
    if (!retried.authenticated) {
      return handleAuthFailure(retried, retry, true)
    }
    return retried
  }

  async function loadAuthenticatedEquipment(token: string, currentPassword: string) {
    if (activeAuthToken.current !== token) return
    setIsEquipmentLoading(true)
    setEquipmentUnavailableReason(null)
    try {
      let result = await fetchLauncherEquipment(token, currentPassword)
      if (!result.authenticated) {
        const recovered = await handleAuthFailure(result, (nextToken) => fetchLauncherEquipment(nextToken, currentPassword))
        if (!recovered || !activeAuthToken.current) return
        result = recovered
      }
      if (!activeAuthToken.current) return
      if (!result.equipment) {
        throw new Error("后端未返回游戏内装备配置。")
      }
      const unavailableModes = result.equipment.unavailableModes ?? {}
      const unavailableEntries = Object.entries(unavailableModes)
      if (unavailableEntries.length > 0) {
        console.warn("[StarCS Launcher] 部分模式装备配置读取失败", unavailableModes)
      }
      const allModesUnavailable = Object.keys(modeLabels).every((mode) => Boolean(unavailableModes[mode]))
      if (allModesUnavailable) {
        setAuthenticatedEquipment(null)
        setEquipmentUnavailableReason("装备配置服务暂时不可用，请稍后重新读取。")
        return
      }
      setAuthenticatedEquipment(result.equipment)
    } catch (error) {
      if (activeAuthToken.current) {
        setAuthenticatedEquipment(null)
        setEquipmentUnavailableReason(presentError("读取游戏内装备配置失败", error, "装备配置服务暂时不可用，请稍后重新读取。"))
      }
    } finally {
      if (activeAuthToken.current) setIsEquipmentLoading(false)
    }
  }

  async function applyEquipmentOperation(equip: boolean, productId: number, modes: string[], team: EquipmentTargetTeam) {
    if (!authToken) {
      openLogin()
      return false
    }
    if (!authenticatedEquipment) {
      throw new Error(equipmentUnavailableReason ?? "游戏内装备配置尚未加载完成。")
    }
    let result = await updateLauncherEquipment(authToken, password, productId, modes, team, equip)
    if (!result.authenticated) {
      const recovered = await handleAuthFailure(result, (nextToken) => updateLauncherEquipment(nextToken, password, productId, modes, team, equip))
      if (!recovered) return false
      result = recovered
    }
    if (!result.equipment) {
      throw new Error("后端未返回更新后的装备配置。")
    }
    setAuthenticatedEquipment(result.equipment)
    return true
  }

  async function applyStardustOperation(equip: boolean, itemType: string, uniqueId: string) {
    if (!authToken) {
      openLogin()
      return false
    }
    let result = await updateStardustEquipment(authToken, password, itemType, uniqueId, equip)
    if (!result.authenticated) {
      const recovered = await handleAuthFailure(result, (nextToken) => updateStardustEquipment(nextToken, password, itemType, uniqueId, equip))
      if (!recovered) return false
      result = recovered
    }
    // 用返回的最新装备列表刷新本地库存的同 Type 互斥状态
    setAuthenticatedInventory((current) => (current ?? []).map((item) => {
      if (item.source !== "stardust" || item.stardustType !== itemType) return item
      const isEquipped = result.equipments.some((entry) => entry.type === itemType && entry.uniqueId === item.uniqueId)
      return { ...item, equipped: isEquipped }
    }))
    return true
  }

  async function applyStorePurchase(item: LauncherStoreItem) {
    if (!authToken) {
      openLogin()
      return false
    }
    if (item.purchaseBackend === "challenge-stardust") {
      if (!item.stardustType || !item.externalId) {
        throw new Error("商品标识无效，暂时无法购买。")
      }
      let result = await purchaseStardustItem(authToken, password, item.stardustType, item.externalId)
      if (!result.authenticated) {
        const recovered = await handleAuthFailure(result, (nextToken) => purchaseStardustItem(nextToken, password, item.stardustType!, item.externalId!))
        if (!recovered) return false
        result = recovered
      }
      // 星尘购买成功后同步最新余额；展示列表仅在刷新完整时覆盖，避免半成功响应清空本地库存。
      setAuthenticatedAccount((current) => current ? { ...current, wallet: { ...current.wallet, stardust: result.stardust, stardustAvailable: true } } : current)
      if (result.refreshComplete !== false) {
        setAuthenticatedInventory(result.inventory)
        setAuthenticatedStoreItems(result.storeItems)
      }
      return true
    }
    const pricingId = Number(item.id.replace(/^pricing-/, ""))
    if (!Number.isFinite(pricingId) || pricingId <= 0) {
      throw new Error("商品标识无效，暂时无法购买。")
    }
    let result = await purchaseStoreItem(authToken, password, pricingId)
    if (!result.authenticated) {
      const recovered = await handleAuthFailure(result, (nextToken) => purchaseStoreItem(nextToken, password, pricingId))
      if (!recovered) return false
      result = recovered
    }
    // 购买成功后同步最新余额；展示列表仅在刷新完整时覆盖，避免半成功响应清空本地库存。
    setAuthenticatedAccount((current) => current ? { ...current, wallet: { ...current.wallet, starlight: result.starlight, starlightAvailable: true } } : current)
    if (result.refreshComplete !== false) {
      setAuthenticatedInventory(result.inventory)
      setPurchaseHistory(result.purchaseHistory)
      setAuthenticatedStoreItems(result.storeItems)
    }
    return true
  }

  return (
    <div className="app-root text-foreground">
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} account={steamAccount} isLoading={isSteamAccountLoading} isSubmitting={isLoginSubmitting} accountError={steamAccountError} password={password} rememberPassword={rememberPassword} loginError={loginError} onPasswordChange={setPassword} onRememberPasswordChange={setRememberPassword} onRetry={() => void loadSteamSession()} onLogin={() => void login()} />
      <UpdateDialog state={updateDialog} onClose={() => setUpdateDialog(null)} />
      <header className="app-header" data-tauri-drag-region>
        <button className="brand" onClick={() => setActiveTab("home")} aria-label="返回首页">
          <img src={starLogo} alt="StarCS" className="brand-logo" />
          <div className="text-left"><div className="text-sm font-bold tracking-[0.2em]">STARCS</div><div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Launcher</div></div>
        </button>

        <nav className="app-tabs" aria-label="主导航">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return <Button key={tab.id} variant={activeTab === tab.id ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}><Icon />{tab.label}</Button>
          })}
        </nav>

        <div className="header-actions flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="通知"><Bell /></Button>
          <Button variant="ghost" className="theme-cycle" onClick={cycleTheme} title={`当前：${currentTheme.label}（系统为${resolvedTheme === "dark" ? "深色" : "浅色"}）`}><CurrentThemeIcon /><span>{currentTheme.label}</span></Button>
          <div className="window-controls" aria-label="窗口控制">
            <button type="button" className="window-control" aria-label="最小化" title="最小化" onClick={() => void appWindow.minimize()}><Minus /></button>
            <button type="button" className="window-control" aria-label="最大化或还原" title="最大化或还原" onClick={() => void appWindow.toggleMaximize()}><Square /></button>
            <button type="button" className="window-control window-control-close" aria-label="关闭" title="关闭" onClick={() => void appWindow.close()}><X /></button>
          </div>
        </div>
      </header>

      <div className="app-content">
        {activeTab === "home" && <HomePage announcements={bootstrap?.announcements ?? []} maps={bootstrap?.maps ?? []} backendError={bootstrapError} isBackendLoading={isBootstrapLoading} onRetryBackend={() => void loadLauncherData()} />}
        {activeTab === "store" && (effectiveBootstrap ? <StorePage data={effectiveBootstrap} isAuthenticated={isAuthenticated} onRequireLogin={openLogin} onPurchase={applyStorePurchase} /> : <BackendDataPage isLoading={isBootstrapLoading} error={bootstrapError} onRetry={() => void loadLauncherData()} />)}
        {activeTab === "inventory" && (bootstrap ? <InventoryPage key={isAuthenticated ? effectiveAccount?.profile.userId ?? "authenticated" : "guest"} items={isAuthenticated ? authenticatedInventory ?? [] : []} purchaseHistory={purchaseHistory} equipment={authenticatedEquipment ?? { version: 2, plugin: "star_light_store", modes: {}, unavailableModes: {} }} isAuthenticated={isAuthenticated} isEquipmentLoading={isEquipmentLoading} equipmentUnavailableReason={equipmentUnavailableReason} onRequireLogin={openLogin} onRetryEquipment={() => { if (authToken) void loadAuthenticatedEquipment(authToken, password) }} onEquipmentOperation={applyEquipmentOperation} onStardustOperation={applyStardustOperation} /> : <BackendDataPage isLoading={isBootstrapLoading} error={bootstrapError} onRetry={() => void loadLauncherData()} />)}
        {activeTab === "profile" && <ProfilePage account={effectiveAccount} purchaseHistory={purchaseHistory} seasonPass={seasonPass} penalties={penalties} steamAccount={steamAccount} isAuthenticated={isAuthenticated} theme={theme} onThemeChange={setTheme} onLogin={openLogin} onLogout={logout} onCheckUpdate={runUpdateCheck} />}
      </div>
    </div>
  )
}

export default App

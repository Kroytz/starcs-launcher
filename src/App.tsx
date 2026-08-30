import { useCallback, useEffect, useRef, useState } from "react"
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
  Gamepad2,
  Gem,
  Gift,
  Home,
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
  fetchStarServers,
  isServerJoinable,
  launchAndConnectServer,
  modeLabels,
  type Server,
  type ServerStatus,
} from "@/lib/servers"
import {
  fetchLauncherBootstrap,
  loginLauncherAccount,
  type LauncherAccount,
  type LauncherAnnouncement,
  type LauncherBootstrap,
  type LauncherInventoryItem,
  type LauncherMapResource,
  type LauncherPenalty,
  type LauncherPurchaseHistoryItem,
  type LauncherSeasonPass,
  type LauncherStoreItem,
} from "@/lib/launcher-api"
import {
  getLocalSteamAccount,
  loadRememberedPassword,
  updateRememberedPassword,
  type LocalSteamAccount,
} from "@/lib/steam"
import "./App.css"

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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/15 px-3 py-2.5"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={rememberPassword} onChange={(event) => onRememberPasswordChange(event.target.checked)} /><span><span className="block text-sm font-medium">记住密码</span><span className="block text-[11px] text-muted-foreground">密码加密保存在 STAR Launcher 私有 AppData 中，不写入系统凭据列表。</span></span></label>
            {loginError && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{loginError}</div>}
            <Button type="submit" size="lg" className="w-full" disabled={!account || !password.trim() || isSubmitting}>{isSubmitting ? <RefreshCw className="animate-spin" /> : <LogIn />}{isSubmitting ? "正在校验并读取库存…" : "登录"}</Button>
          </form>
        <p className="text-center text-[11px] text-muted-foreground">密码由本机 STAR 后端校验，登录成功后读取该 Steam64 的真实库存。</p>
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
      setLoadError(error instanceof Error ? error.message : String(error))
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

  async function joinServer(server: Server) {
    if (joiningServerId) return
    setJoiningServerId(server.id)
    setJoinError(null)
    try {
      await launchAndConnectServer(server.address)
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : String(error))
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
                <button key={server.id} className={cn("server-row", isSelected && "server-row-selected")} onClick={() => setSelectedId(server.id)}>
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
                    <span role="button" tabIndex={0} aria-label="收藏" className="rounded-md p-2 hover:bg-accent/15" onClick={(event) => { event.stopPropagation(); toggleFavorite(server.id) }} onKeyDown={() => undefined}><Star className={cn("size-4", isFavorite && "fill-amber-400 text-amber-500")} /></span>
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
              <Button size="lg" className="w-full" disabled={!isServerJoinable(selected) || joiningServerId !== null} onClick={() => void joinServer(selected)}><Gamepad2 />{joiningServerId ? "正在启动并等待 CS2…" : isServerJoinable(selected) ? "加入服务器" : "服务器已满"}</Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">从登录器启动时将强制使用 -worldwide，并在 CS2 初始化完成后连接。</p>
              {joinError && <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">{joinError}</div>}
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{isLoading ? "正在加载服务器详情…" : "暂无可显示的服务器"}</CardContent></Card>
        )}
      </aside>
      </div>
      <AnnouncementDetailDialog announcement={selectedAnnouncement} onOpenChange={(open) => { if (!open) setSelectedAnnouncement(null) }} />
    </main>
  )
}

type ExchangeCurrency = "starlight" | "stardust"
type StoreKind = ExchangeCurrency | "afdian"
type CurrencyPopup = "recharge" | ExchangeCurrency

function StorePage({ data, isAuthenticated, onRequireLogin }: { data: LauncherBootstrap; isAuthenticated: boolean; onRequireLogin: () => void }) {
  const [activeStore, setActiveStore] = useState<StoreKind>("afdian")
  const [activeCategory, setActiveCategory] = useState("all")
  const [currencyPopup, setCurrencyPopup] = useState<CurrencyPopup | null>(null)
  const [exchangeAmount, setExchangeAmount] = useState("1")
  const [storeNotice, setStoreNotice] = useState<string | null>(null)
  const categoryScrollRef = useRef<HTMLDivElement>(null)
  const [categoryScrollEdges, setCategoryScrollEdges] = useState({ left: false, right: false })

  const currencyItems = data.storeItems.filter((item) => item.enabled && item.currency === activeStore)
  const categories = [...new Set(currencyItems.map((item) => item.category || "其他"))]
  const activeItems = currencyItems.filter((item) => activeCategory === "all" || (item.category || "其他") === activeCategory)
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

  async function purchase(item: LauncherStoreItem) {
    if (!isAuthenticated) {
      onRequireLogin()
      return
    }
    if (item.purchaseBackend === "afdian-cdk") {
      if (!item.purchaseUrl) {
        setStoreNotice(`「${item.title}」暂时没有可用的爱发电购买链接。`)
        return
      }
      try {
        await openUrl(item.purchaseUrl)
      } catch (error) {
        setStoreNotice(`无法打开爱发电购买页：${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    const backendName = item.purchaseBackend === "challenge-stardust" ? "DB_CHALLENGE 星尘商店" : "DB_STAR 星光商店"
    setStoreNotice(`「${item.title}」将通过 ${backendName} 的独立购买流程处理；当前后端只读，购买暂未开放。`)
  }

  return (
    <main className="page-shell">
      <PageHeading eyebrow="STAR 商城" title="星社区兑换中心" description="管理三种货币，并在星光、星尘与发电商店选购物品。" />

      {!isAuthenticated && <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center"><span>登录后可查看真实余额、购买记录与商城数据；交易功能暂未开放。</span><Button size="sm" onClick={onRequireLogin}><LogIn />登录</Button></div>}

      <div className="currency-grid">
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
      </div>

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

      <div className="mt-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="store-tabs">
          <Button variant={activeStore === "afdian" ? "secondary" : "ghost"} onClick={() => setActiveStore("afdian")}><Zap />发电商店</Button>
          <Button variant={activeStore === "starlight" ? "secondary" : "ghost"} onClick={() => setActiveStore("starlight")}><Sparkles />星光商店</Button>
          <Button variant={activeStore === "stardust" ? "secondary" : "ghost"} onClick={() => setActiveStore("stardust")}><Gem />星尘商店</Button>
        </div>
        {activeStore !== "afdian" && <div className="text-sm text-muted-foreground">当前余额：<span className="font-semibold text-foreground">{!isAuthenticated ? "登录后查看" : activeBalanceAvailable ? `${activeBalance.toLocaleString()} ${activeStore === "starlight" ? "星光" : "星尘"}` : "当前数据库暂无数据"}</span></div>}
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
        {activeItems.map((item) => {
          const Icon = displayIcons[item.icon] ?? Package
          const isAfdianItem = item.purchaseBackend === "afdian-cdk"
          return (
            <Card key={item.id} className="store-card overflow-hidden">
              <div className={cn("relative grid h-32 place-items-center overflow-hidden bg-gradient-to-br", item.tone, isAfdianItem ? afdianCategoryTone(item.category) : rarityToneClass(item.tag))}>
                {isAfdianItem && <><div className="absolute -right-5 -top-8 size-24 rounded-full bg-white/20 blur-2xl" /><div className="absolute -bottom-10 -left-6 size-24 rounded-full bg-black/20 blur-xl" /><div className="absolute inset-x-4 bottom-3 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-white/65"><span>STARCS</span><span>{item.category || "其他"}</span></div><div className="relative grid size-16 place-items-center rounded-2xl border border-white/25 bg-white/15 shadow-xl backdrop-blur-sm"><Icon className="size-8 text-white" /></div></>}
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none" }} /> : null}
                {!isAfdianItem && <Icon className="size-12 text-white/90" />}
              </div>
              <CardHeader><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 gap-1"><Badge variant="secondary">{item.category || "其他"}</Badge>{item.tag && item.tag !== item.category && <Badge variant="outline" className={rarityBadgeClass(item.tag)}>{item.tag}</Badge>}</div><span className="flex items-center gap-1 font-semibold text-primary">{activeStore === "afdian" ? <>¥{item.price}</> : <>{activeStore === "starlight" ? <Sparkles className="size-3.5" /> : <Gem className="size-3.5" />}{item.price}</>}</span></div><CardTitle className="pt-3 text-base">{item.title}</CardTitle><CardDescription>{item.description}</CardDescription></CardHeader>
              <CardContent><Button className="w-full" variant="outline" onClick={() => void purchase(item)}>{!isAuthenticated ? "登录后购买" : item.purchaseBackend === "afdian-cdk" ? "前往爱发电购买" : item.purchaseBackend === "challenge-stardust" ? "星尘购买（只读）" : "星光购买（只读）"}</Button></CardContent>
            </Card>
          )
        })}
      </div>
    </main>
  )
}

function BackendDataPage({ isLoading, error, onRetry }: { isLoading: boolean; error: string | null; onRetry: () => void }) {
  return (
    <main className="page-shell">
      <PageHeading eyebrow="STAR 服务" title={isLoading ? "正在同步登录器数据" : "暂时无法读取展示数据"} description={isLoading ? "正在从本地 Go 后端获取商城、库存与个人资料。" : "请确认 star-launcher-backend 已经启动。"} />
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <RefreshCw className={cn("mb-4 size-8 text-primary", isLoading && "animate-spin")} />
          <p className="max-w-xl text-sm text-muted-foreground">{isLoading ? "连接 http://127.0.0.1:8080…" : error}</p>
          {!isLoading && <Button variant="outline" className="mt-5" onClick={onRetry}><RefreshCw />重新获取</Button>}
        </CardContent>
      </Card>
    </main>
  )
}

type EquipmentTeam = "ct" | "t"
type EquipmentTargetTeam = EquipmentTeam | "all"
type CosmeticSlot = "weapon" | "player"
type EquipmentAssignments = Record<string, string>

const equipmentModes = Object.entries(modeLabels).filter(([mode]) => mode !== "AFK")
const equipmentStorageKey = "star-launcher-equipment"

function getCosmeticSlot(item: LauncherInventoryItem): CosmeticSlot | null {
  if (item.type === "武器外观") return "weapon"
  if (item.type === "角色外观" || item.type === "玩家外观") return "player"
  return null
}

function getEquipmentKey(mode: string, team: EquipmentTeam, slot: CosmeticSlot) {
  return `${mode}:${team}:${slot}`
}

function getSavedEquipment(): EquipmentAssignments {
  try {
    const saved = localStorage.getItem(equipmentStorageKey)
    return saved ? JSON.parse(saved) as EquipmentAssignments : {}
  } catch {
    return {}
  }
}

function InventoryPage({ items, purchaseHistory, isAuthenticated, onRequireLogin }: { items: LauncherInventoryItem[]; purchaseHistory: LauncherPurchaseHistoryItem[]; isAuthenticated: boolean; onRequireLogin: () => void }) {
  const [inventory, setInventory] = useState(items)
  const [purchaseHistoryOpen, setPurchaseHistoryOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ itemId: string; x: number; y: number } | null>(null)
  const [equippingItem, setEquippingItem] = useState<LauncherInventoryItem | null>(null)
  const [selectedEquipmentModes, setSelectedEquipmentModes] = useState<string[]>([equipmentModes[0]?.[0] ?? "ZM"])
  const [equipmentTeam, setEquipmentTeam] = useState<EquipmentTargetTeam>("all")
  const [equipment, setEquipment] = useState<EquipmentAssignments>(getSavedEquipment)
  const [inventoryNotice, setInventoryNotice] = useState<string | null>(null)

  useEffect(() => {
    setInventory(items)
  }, [items])

  useEffect(() => {
    localStorage.setItem(equipmentStorageKey, JSON.stringify(equipment))
  }, [equipment])

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

  function handleInventoryAction(item: LauncherInventoryItem) {
    if (!isAuthenticated) {
      setContextMenu(null)
      onRequireLogin()
      return
    }
    const slot = getCosmeticSlot(item)
    setContextMenu(null)
    if (slot) {
      setEquippingItem(item)
      return
    }
    if (item.quantity <= 0) {
      setInventoryNotice(`「${item.name}」数量不足。`)
      return
    }

    setInventoryNotice(`「${item.name}」来自真实库存；当前后端只读，使用物品暂未开放。`)
  }

  function toggleEquipmentMode(mode: string) {
    setSelectedEquipmentModes((current) => current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode])
  }

  function confirmEquipment() {
    if (!equippingItem) return
    const slot = getCosmeticSlot(equippingItem)
    if (!slot || selectedEquipmentModes.length === 0) return
    const targetTeams: EquipmentTeam[] = equipmentTeam === "all" ? ["ct", "t"] : [equipmentTeam]
    setEquipment((current) => {
      const next = { ...current }
      for (const mode of selectedEquipmentModes) {
        for (const team of targetTeams) {
          next[getEquipmentKey(mode, team, slot)] = equippingItem.id
        }
      }
      return next
    })
    const teamLabel = equipmentTeam === "all" ? "所有阵营" : equipmentTeam.toUpperCase()
    setInventoryNotice(`已将「${equippingItem.name}」保存到本机配置：${selectedEquipmentModes.length} 个模式 · ${teamLabel}（尚未同步服务器）。`)
    setEquippingItem(null)
  }

  function clearEquipment() {
    if (!equippingItem) return
    const slot = getCosmeticSlot(equippingItem)
    if (!slot || selectedEquipmentModes.length === 0) return
    const targetTeams: EquipmentTeam[] = equipmentTeam === "all" ? ["ct", "t"] : [equipmentTeam]
    setEquipment((current) => {
      const next = { ...current }
      for (const mode of selectedEquipmentModes) {
        for (const team of targetTeams) {
          delete next[getEquipmentKey(mode, team, slot)]
        }
      }
      return next
    })
    setInventoryNotice(`已从本机清除 ${selectedEquipmentModes.length * targetTeams.length} 个外观配置（尚未同步服务器）。`)
    setEquippingItem(null)
  }

  const menuItem = contextMenu ? inventory.find((item) => item.id === contextMenu.itemId) ?? null : null
  const equippingSlot = equippingItem ? getCosmeticSlot(equippingItem) : null
  const targetEquipmentTeams: EquipmentTeam[] = equipmentTeam === "all" ? ["ct", "t"] : [equipmentTeam]
  const selectedConfigurationCount = selectedEquipmentModes.length * targetEquipmentTeams.length
  const currentEquipmentIDs = equippingSlot ? selectedEquipmentModes.flatMap((mode) => targetEquipmentTeams.map((team) => equipment[getEquipmentKey(mode, team, equippingSlot)])).filter(Boolean) : []
  const currentEquipmentNames = [...new Set(currentEquipmentIDs.map((itemID) => inventory.find((item) => item.id === itemID)?.name).filter(Boolean))]

  return (
    <main className="page-shell inventory-page-shell">
      <PageHeading eyebrow="我的库存" title="已拥有的物品" description="展示当前账号可用的全部物品；外观配置仅保存在本机，使用与同步暂未开放。" action={isAuthenticated ? <div className="flex flex-col gap-2 sm:items-end"><Button variant="outline" onClick={() => setPurchaseHistoryOpen(true)}><ShoppingBag />最近购买 {purchaseHistory.length}</Button><Button variant="outline"><Boxes />全部物品 {inventory.length}</Button></div> : undefined} />
      {!isAuthenticated && <Card><CardContent className="flex flex-col items-center py-20 text-center"><div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Backpack className="size-7" /></div><CardTitle>登录后查看真实库存</CardTitle><CardDescription className="mt-2 max-w-md leading-6">登录可以管理已拥有的道具，并为不同模式和阵营配置武器与角色外观。</CardDescription><Button className="mt-6" onClick={onRequireLogin}><LogIn />登录并读取库存</Button></CardContent></Card>}
      {isAuthenticated && inventoryNotice && <div className="mb-4 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm">{inventoryNotice}</div>}
      {isAuthenticated && <div className="inventory-grid">
        {inventory.map((item) => {
          const Icon = displayIcons[item.icon] ?? Package
          const itemName = item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name
          const slot = getCosmeticSlot(item)
          const isEquipped = Object.values(equipment).includes(item.id)
          return (
            <Card key={item.id} className={cn("inventory-card overflow-hidden", item.quantity <= 0 && "opacity-60")} onContextMenu={(event) => openContextMenu(event, item)}>
              <div className={cn("relative grid aspect-[4/3] place-items-center bg-gradient-to-br", item.tone, rarityToneClass(item.rarity))}><div className="absolute right-2 top-2 flex items-center gap-1"><Badge variant="outline" className={cn("border-white/20 bg-black/35 text-white backdrop-blur-sm", rarityBadgeClass(item.rarity))}>{item.rarity}</Badge>{isEquipped && <Badge variant="success"><Check />已装备</Badge>}</div><Icon className="size-12 text-white/90" /></div>
              <CardHeader><Badge variant="secondary" className="w-fit">{item.type}</Badge><CardTitle className="pt-3 text-base">{itemName}</CardTitle></CardHeader>
              <CardContent><Button variant="secondary" className="w-full" disabled={isAuthenticated && item.quantity <= 0} onClick={() => handleInventoryAction(item)}>{!isAuthenticated ? "登录后操作" : slot ? "配置装备" : "使用物品"}</Button></CardContent>
            </Card>
          )
        })}
      </div>}

      {contextMenu && menuItem && (
        <div role="menu" className="fixed z-[100] w-48 overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
          <button role="menuitem" type="button" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50" disabled={menuItem.quantity <= 0} onClick={() => handleInventoryAction(menuItem)}>
            {getCosmeticSlot(menuItem) ? <Gamepad2 className="size-4 text-primary" /> : <Zap className="size-4 text-accent" />}
            <span><span className="block font-medium">{getCosmeticSlot(menuItem) ? "配置装备" : "使用"}</span><span className="block text-[10px] text-muted-foreground">{menuItem.name}</span></span>
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

      <Dialog open={equippingItem !== null} onOpenChange={(open) => { if (!open) setEquippingItem(null) }}>
        <DialogContent>
          {equippingItem && (
            <>
              <DialogHeader><DialogTitle>配置「{equippingItem.name}」</DialogTitle><DialogDescription>勾选一个或多个模式，并为所有阵营或指定阵营装备{equippingSlot === "weapon" ? "武器" : "玩家"}外观。</DialogDescription></DialogHeader>
              <div className="space-y-5">
                <div><div className="mb-2 flex items-center justify-between"><div className="text-sm font-medium">服务器模式</div><button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedEquipmentModes(selectedEquipmentModes.length === equipmentModes.length ? [] : equipmentModes.map(([mode]) => mode))}>{selectedEquipmentModes.length === equipmentModes.length ? "清空" : "全选"}</button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{equipmentModes.map(([mode, label]) => <label key={mode} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors", selectedEquipmentModes.includes(mode) ? "border-primary/40 bg-primary/10 text-foreground" : "border-border hover:bg-muted/40")}><input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={selectedEquipmentModes.includes(mode)} onChange={() => toggleEquipmentMode(mode)} /><span>{label}</span></label>)}</div></div>
                <div><div className="mb-2 text-sm font-medium">阵营</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Button type="button" variant={equipmentTeam === "all" ? "secondary" : "outline"} onClick={() => setEquipmentTeam("all")}>所有阵营</Button><Button type="button" variant={equipmentTeam === "ct" ? "secondary" : "outline"} onClick={() => setEquipmentTeam("ct")}>CT 反恐精英</Button><Button type="button" variant={equipmentTeam === "t" ? "secondary" : "outline"} onClick={() => setEquipmentTeam("t")}>T 恐怖分子</Button></div></div>
                <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm"><div className="text-xs text-muted-foreground">将覆盖 {selectedConfigurationCount} 个配置</div><div className="mt-1 font-medium">{currentEquipmentNames.length > 0 ? `当前包含：${currentEquipmentNames.join("、")}` : "当前均未装备"}</div></div>
              </div>
              <DialogFooter><Button variant="ghost" disabled={currentEquipmentIDs.length === 0} onClick={clearEquipment}>清除所选配置</Button><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button disabled={selectedEquipmentModes.length === 0} onClick={confirmEquipment}><Check />确认装备</Button></DialogFooter>
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

function ProfilePage({ account, purchaseHistory, seasonPass, penalties, steamAccount, isAuthenticated, theme, onThemeChange, onLogin, onLogout }: { account: LauncherAccount | null; purchaseHistory: LauncherPurchaseHistoryItem[]; seasonPass: LauncherSeasonPass | null; penalties: LauncherPenalty[]; steamAccount: LocalSteamAccount | null; isAuthenticated: boolean; theme: ThemePreference; onThemeChange: (theme: ThemePreference) => void; onLogin: () => void; onLogout: () => void }) {
  const profile = account?.profile ?? null
  const displayName = isAuthenticated ? steamAccount?.personaName || profile?.displayName || "StarCS 玩家" : "未登录"
  const avatarUrl = steamAccount?.avatarDataUrl || profile?.avatarUrl || starLogo
  const wallet = account?.wallet

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

          {isAuthenticated && seasonPass?.available && <Card><CardHeader><div className="flex items-center gap-3"><div className="setting-icon"><Trophy /></div><div><CardTitle>赛季通行证 · 第 {seasonPass.seasonId} 赛季</CardTitle><CardDescription>真实赛季进度，最近更新于 {formatLauncherDate(seasonPass.updatedAt)}。</CardDescription></div></div></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-lg border border-border bg-muted/25 p-3"><div className="text-xl font-semibold">Lv. {seasonPass.level}</div><div className="text-xs text-muted-foreground">通行证等级</div></div><div className="rounded-lg border border-border bg-muted/25 p-3"><div className="text-xl font-semibold">{seasonPass.experience}</div><div className="text-xs text-muted-foreground">经验</div></div><div className="rounded-lg border border-border bg-muted/25 p-3"><div className="text-xl font-semibold">{seasonPass.claimedRewardCount}</div><div className="text-xs text-muted-foreground">已领礼包</div></div><div className="rounded-lg border border-border bg-muted/25 p-3"><div className="text-xl font-semibold">{seasonPass.starSourceChestOpened}</div><div className="text-xs text-muted-foreground">已开宝箱</div></div></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg border border-border px-3 py-2"><span className="text-muted-foreground">今日游戏</span><span className="float-right font-medium">{seasonPass.dailyGames} 局 / {seasonPass.dailyOnlineMinutes} 分钟</span></div><div className="rounded-lg border border-border px-3 py-2"><span className="text-muted-foreground">本周进度</span><span className="float-right font-medium">{seasonPass.weeklyGames} 局 / {seasonPass.weeklyCompletedModes} 模式</span></div></div></CardContent></Card>}

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
  const [purchaseHistory, setPurchaseHistory] = useState<LauncherPurchaseHistoryItem[]>([])
  const [seasonPass, setSeasonPass] = useState<LauncherSeasonPass | null>(null)
  const [penalties, setPenalties] = useState<LauncherPenalty[]>([])
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [bootstrap, setBootstrap] = useState<LauncherBootstrap | null>(null)
  const [isBootstrapLoading, setIsBootstrapLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const bootstrapFetchStarted = useRef(false)
  const isAuthenticated = authToken !== null
  const effectiveAccount = isAuthenticated ? authenticatedAccount : bootstrap?.account ?? null
  const effectiveBootstrap = bootstrap && effectiveAccount ? { ...bootstrap, account: effectiveAccount } : bootstrap

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
      setSteamAccountError(error instanceof Error ? error.message : String(error))
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
      setBootstrapError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsBootstrapLoading(false)
    }
  }, [])

  useEffect(() => {
    if (bootstrapFetchStarted.current) return
    bootstrapFetchStarted.current = true
    void loadLauncherData()
  }, [loadLauncherData])

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

  async function login() {
    if (!steamAccount) {
      setLoginError("未识别到 Steam 账号。")
      return
    }
    if (!password.trim()) {
      setLoginError("请输入游戏内密码。")
      return
    }
    setLoginError(null)
    setIsLoginSubmitting(true)
    try {
      const session = await loginLauncherAccount(steamAccount.steamId, password)
      await updateRememberedPassword(steamAccount.steamId, rememberPassword ? password : null)
      setAuthenticatedAccount(session.account)
      setAuthenticatedInventory(session.inventory)
      setPurchaseHistory(session.purchaseHistory)
      setSeasonPass(session.seasonPass)
      setPenalties(session.penalties)
      setAuthToken(session.token)
      setLoginOpen(false)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoginSubmitting(false)
    }
  }

  function logout() {
    setAuthToken(null)
    setAuthenticatedAccount(null)
    setAuthenticatedInventory(null)
    setPurchaseHistory([])
    setSeasonPass(null)
    setPenalties([])
  }

  return (
    <div className="min-h-screen text-foreground">
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} account={steamAccount} isLoading={isSteamAccountLoading} isSubmitting={isLoginSubmitting} accountError={steamAccountError} password={password} rememberPassword={rememberPassword} loginError={loginError} onPasswordChange={setPassword} onRememberPasswordChange={setRememberPassword} onRetry={() => void loadSteamSession()} onLogin={() => void login()} />
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

      {activeTab === "home" && <HomePage announcements={bootstrap?.announcements ?? []} maps={bootstrap?.maps ?? []} backendError={bootstrapError} isBackendLoading={isBootstrapLoading} onRetryBackend={() => void loadLauncherData()} />}
      {activeTab === "store" && (effectiveBootstrap ? <StorePage data={effectiveBootstrap} isAuthenticated={isAuthenticated} onRequireLogin={openLogin} /> : <BackendDataPage isLoading={isBootstrapLoading} error={bootstrapError} onRetry={() => void loadLauncherData()} />)}
      {activeTab === "inventory" && (bootstrap ? <InventoryPage items={isAuthenticated ? authenticatedInventory ?? [] : []} purchaseHistory={purchaseHistory} isAuthenticated={isAuthenticated} onRequireLogin={openLogin} /> : <BackendDataPage isLoading={isBootstrapLoading} error={bootstrapError} onRetry={() => void loadLauncherData()} />)}
      {activeTab === "profile" && <ProfilePage account={effectiveAccount} purchaseHistory={purchaseHistory} seasonPass={seasonPass} penalties={penalties} steamAccount={steamAccount} isAuthenticated={isAuthenticated} theme={theme} onThemeChange={setTheme} onLogin={openLogin} onLogout={logout} />}
    </div>
  )
}

export default App

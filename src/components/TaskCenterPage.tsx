import { useEffect, useMemo, useRef, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gamepad2,
  Gem,
  Gift,
  ListChecks,
  LockKeyhole,
  MapPinned,
  Medal,
  RefreshCw,
  Sparkles,
  Target,
  TimerReset,
  Trophy,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  LauncherTaskCampaign,
  LauncherTaskCenter,
  LauncherTaskGroup,
  LauncherTaskItem,
  LauncherTaskReward,
} from "@/lib/launcher-api"
import { cn } from "@/lib/utils"

type TaskCategory = "onboarding" | "daily" | "weekly" | "event" | "season"

const categoryOptions: Array<{ id: TaskCategory; label: string; description: string }> = [
  { id: "onboarding", label: "新手旅程", description: "熟悉 STARCS 的基础功能" },
  { id: "daily", label: "每日任务", description: "每天刷新" },
  { id: "weekly", label: "每周任务", description: "每周刷新" },
  { id: "event", label: "活动任务", description: "限时小任务组" },
  { id: "season", label: "赛季任务", description: "本赛季长期目标" },
]

const categoryVisuals: Record<TaskCategory, { icon: LucideIcon; accent: string }> = {
  onboarding: { icon: Sparkles, accent: "from-blue-500 to-indigo-600" },
  daily: { icon: CalendarDays, accent: "from-sky-500 to-blue-600" },
  weekly: { icon: ListChecks, accent: "from-violet-500 to-indigo-600" },
  event: { icon: MapPinned, accent: "from-cyan-500 to-blue-600" },
  season: { icon: Trophy, accent: "from-amber-400 to-orange-600" },
}

function normalizeCategory(category: string): TaskCategory {
  return categoryOptions.some((option) => option.id === category)
    ? category as TaskCategory
    : "event"
}

function taskProgress(task: LauncherTaskItem) {
  if (task.target <= 0) return task.status === "in_progress" ? 0 : 100
  return Math.min(100, (task.current / task.target) * 100)
}

function progressLabel(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value)
}

function metadataLabel(reward: LauncherTaskReward) {
  if (!reward.metadata || typeof reward.metadata !== "object" || Array.isArray(reward.metadata)) return null
  const metadata = reward.metadata as Record<string, unknown>
  const label = metadata.displayName ?? metadata.name
  return typeof label === "string" && label.trim() ? label : null
}

function rewardPresentation(reward: LauncherTaskReward): { label: string; icon: LucideIcon; tone: string } {
  switch (reward.type) {
    case "starlight":
      return { label: "星光", icon: Sparkles, tone: "border-blue-400/20 bg-blue-500/10 text-blue-600 dark:text-blue-300" }
    case "stardust":
      return { label: "星尘", icon: Gem, tone: "border-violet-400/20 bg-violet-500/10 text-violet-600 dark:text-violet-300" }
    case "season_exp":
      return { label: "赛季经验", icon: Zap, tone: "border-amber-400/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" }
    default:
      return { label: metadataLabel(reward) ?? "物品奖励", icon: Gift, tone: "border-emerald-400/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" }
  }
}

function RewardChip({ reward, compact = false }: { reward: LauncherTaskReward; compact?: boolean }) {
  const presentation = rewardPresentation(reward)
  const Icon = presentation.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border font-medium", presentation.tone, compact ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-xs")}>
      <Icon className={compact ? "size-3" : "size-3.5"} />
      {reward.amount > 0 ? `${progressLabel(reward.amount)} ` : ""}{presentation.label}
    </span>
  )
}

function taskStatus(task: LauncherTaskItem) {
  if (task.status === "claimed") return { label: "已领取", icon: Check, tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" }
  if (task.status === "completed") {
    if (task.claimPolicy === "external") return { label: "游戏内领取", icon: Gamepad2, tone: "border-primary/25 bg-primary/10 text-primary" }
    if (task.claimPolicy === "automatic") return { label: "已完成", icon: CheckCircle2, tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" }
    return { label: "待领取", icon: Gift, tone: "border-primary/25 bg-primary/10 text-primary" }
  }
  if (task.locked) return { label: "未解锁", icon: LockKeyhole, tone: "" }
  return { label: "进行中", icon: Clock3, tone: "" }
}

function taskActionLabel(task: LauncherTaskItem) {
  if (task.status === "claimed") return "奖励已领取"
  if (task.status !== "completed") return task.locked ? "完成前置任务后解锁" : "前往服务器"
  if (task.claimPolicy === "external") return "请在游戏内领取"
  if (task.claimPolicy === "automatic") return "奖励自动发放"
  return "领取功能即将开放"
}

function campaignDeadline(campaign: LauncherTaskCampaign) {
  if (!campaign.endsAt) return null
  const endsAt = new Date(campaign.endsAt)
  if (Number.isNaN(endsAt.getTime())) return null
  const remainingDays = Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000)
  if (remainingDays < 0) return "已结束"
  if (remainingDays === 0) return "今日结束"
  return `剩余 ${remainingDays} 天`
}

function TaskPageSkeleton() {
  return (
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.72fr)]" aria-label="正在读取任务">
      <div className="space-y-3">
        {[0, 1, 2].map((index) => <Skeleton key={index} className="h-28 w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}

export function TaskCenterPage({
  tasks,
  isLoading,
  error,
  isAuthenticated,
  onRequireLogin,
  onRetry,
  onNavigateHome,
}: {
  tasks: LauncherTaskCenter | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
  onRequireLogin: () => void
  onRetry: () => void
  onNavigateHome: () => void
}) {
  const [activeCategory, setActiveCategory] = useState<TaskCategory>("onboarding")
  const [expandedGroupIDs, setExpandedGroupIDs] = useState<Set<string>>(() => new Set())
  const [selectedTaskID, setSelectedTaskID] = useState<string | null>(null)
  const initializedSnapshot = useRef("")

  const groups = useMemo(() => (tasks?.campaigns ?? []).flatMap((campaign) =>
    campaign.groups.map((group) => ({ campaign, group, category: normalizeCategory(group.category) })),
  ), [tasks])
  const visibleGroups = useMemo(() => groups.filter((entry) => entry.category === activeCategory), [activeCategory, groups])
  const selectedTask = selectedTaskID
    ? groups.flatMap((entry) => entry.group.tasks).find((task) => task.id === selectedTaskID) ?? null
    : null
  const selectedTaskCategory = selectedTask
    ? groups.find((entry) => entry.group.tasks.some((task) => task.id === selectedTask.id))?.category ?? "event"
    : "event"

  useEffect(() => {
    if (!tasks) return
    const snapshot = groups.map((entry) => entry.group.id).join("|")
    if (snapshot === initializedSnapshot.current) return
    initializedSnapshot.current = snapshot
    const preferredCategory = categoryOptions.find((option) => groups.some((entry) => entry.category === option.id))?.id ?? "onboarding"
    setActiveCategory(preferredCategory)
    const firstGroup = groups.find((entry) => entry.category === preferredCategory)?.group
    setExpandedGroupIDs(firstGroup ? new Set([firstGroup.id]) : new Set())
    setSelectedTaskID(null)
  }, [groups, tasks])

  function toggleTaskGroup(groupID: string) {
    setExpandedGroupIDs((current) => {
      const next = new Set(current)
      if (next.has(groupID)) next.delete(groupID)
      else next.add(groupID)
      return next
    })
  }

  function categoryCount(category: TaskCategory) {
    return groups.filter((entry) => entry.category === category).length
  }

  const allTasks = groups.flatMap((entry) => entry.group.tasks)
  const completedCount = allTasks.filter((task) => task.status === "completed" || task.status === "claimed").length
  const waitingCount = allTasks.filter((task) => task.status === "completed" && task.claimPolicy !== "automatic").length

  function renderTaskGroup(campaign: LauncherTaskCampaign, group: LauncherTaskGroup, category: TaskCategory) {
    const completedInGroup = group.tasks.filter((task) => task.status === "completed" || task.status === "claimed").length
    const waitingTasks = group.tasks.filter((task) => task.status === "completed" && task.claimPolicy !== "automatic")
    const currentTask = group.tasks.find((task) => task.id === group.currentTaskId)
      ?? group.tasks.find((task) => task.status === "in_progress" && !task.locked)
      ?? null
    const expanded = expandedGroupIDs.has(group.id)
    const panelID = `task-group-panel-${group.id}`
    const sequential = group.unlockPolicy === "sequential"
    const visual = categoryVisuals[category]
    const Icon = category === "event" && group.code.toLowerCase().includes("time") ? TimerReset : visual.icon
    const deadline = campaignDeadline(campaign)

    return (
      <article key={group.id} className={cn("task-collapsible-group", category === "onboarding" ? "task-onboarding-group" : "task-event-group")}>
        <div className="task-collapsible-header">
          <button type="button" className={cn("task-group-toggle", waitingTasks.length > 0 && "task-group-toggle-has-claim")} aria-expanded={expanded} aria-controls={panelID} onClick={() => toggleTaskGroup(group.id)}>
            <span className={cn("task-event-icon bg-gradient-to-br", visual.accent)}><Icon /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{group.title}</span>
                <Badge variant="outline">{campaign.title}</Badge>
                <Badge variant="outline">{sequential ? "按顺序" : "自由完成"}</Badge>
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{group.description}{deadline ? ` · ${deadline}` : ""}</span>
            </span>
            <span className="task-group-fold-summary">
              {sequential ? currentTask ? <>
                <span className="task-group-summary-label">当前任务</span>
                <span className="task-group-summary-title">{currentTask.title}</span>
                <span className="task-group-summary-progress"><Progress value={taskProgress(currentTask)} /><span>{progressLabel(currentTask.current)}/{progressLabel(currentTask.target)} {currentTask.unit}</span></span>
              </> : <>
                <span className="task-group-summary-label">任务进度</span>
                <span className="task-group-summary-title">全部目标已完成</span>
                <span className="text-xs text-emerald-600 dark:text-emerald-300">{completedInGroup}/{group.tasks.length}</span>
              </> : <>
                <span className="task-group-summary-label">任务完成</span>
                <span className="task-group-summary-count">{completedInGroup}<small>/{group.tasks.length}</small></span>
              </>}
            </span>
            {waitingTasks.length > 0 && <span className="task-group-claim-space" aria-hidden="true" />}
            <ChevronDown className={cn("task-group-chevron", expanded && "task-group-chevron-open")} />
          </button>
          {waitingTasks.length > 0 && (
            <Button size="sm" className="task-group-claim" variant="secondary" onClick={() => setSelectedTaskID(waitingTasks[0].id)}>
              <Gift />{waitingTasks.some((task) => task.claimPolicy === "manual") ? "待领取" : "游戏内领取"}{waitingTasks.length > 1 ? ` ${waitingTasks.length}` : ""}
            </Button>
          )}
        </div>

        {expanded && (
          <div id={panelID} className="task-group-panel">
            <div className="task-event-milestones">
              {group.tasks.map((task, index) => {
                const status = taskStatus(task)
                const StatusIcon = status.icon
                return (
                  <button key={task.id} type="button" className={cn("task-event-milestone group", task.status === "completed" && "task-event-milestone-ready", task.status === "claimed" && "task-event-milestone-claimed", task.locked && "task-event-milestone-locked")} onClick={() => setSelectedTaskID(task.id)}>
                    <span className={cn("task-event-step", task.status !== "in_progress" && "task-event-step-complete")}>{task.status === "claimed" ? <Check /> : index + 1}</span>
                    <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-medium">{task.title}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{task.description}</span></span>
                    <span className="hidden flex-wrap justify-end gap-1.5 md:flex">{task.rewards.map((reward, rewardIndex) => <RewardChip key={`${reward.type}-${reward.ref ?? rewardIndex}`} reward={reward} compact />)}</span>
                    <Badge variant="outline" className={cn("shrink-0", status.tone)}><StatusIcon />{status.label}</Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                )
              })}
            </div>
            {group.rewards.length > 0 && <div className="task-guide-footer"><Gift />完成任务组奖励：<span className="inline-flex flex-wrap gap-1.5">{group.rewards.map((reward, index) => <RewardChip key={`${reward.type}-${reward.ref ?? index}`} reward={reward} compact />)}</span></div>}
          </div>
        )}
      </article>
    )
  }

  return (
    <main className="page-shell task-page-shell">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary"><Zap className="size-3.5" />STAR 行动</div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">任务中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">先看清现在能做什么，再按自己的节奏推进长期目标。</p>
        </div>
        {isAuthenticated && tasks && (error
          ? <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-300"><RefreshCw />显示上次进度</Badge>
          : <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:text-emerald-300"><CheckCircle2 />进度已同步</Badge>)}
      </div>

      {!isAuthenticated ? (
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="relative grid min-h-[420px] place-items-center p-8 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,hsl(var(--primary)/.16),transparent_42%)]" />
            <div className="relative max-w-md">
              <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm"><ListChecks className="size-7" /></div>
              <h2 className="mt-5 text-xl font-semibold">登录后开启你的任务旅程</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">同步新手引导、活动任务和赛季进度。任务数据与账号绑定，不会用演示内容代替你的真实记录。</p>
              <Button className="mt-6" onClick={onRequireLogin}><LockKeyhole />登录并查看任务</Button>
            </div>
          </CardContent>
        </Card>
      ) : isLoading && !tasks ? (
        <TaskPageSkeleton />
      ) : error && !tasks ? (
        <Card className="border-destructive/20">
          <CardContent className="grid min-h-[320px] place-items-center p-8 text-center">
            <div><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><RefreshCw className="size-6" /></div><h2 className="mt-4 font-semibold">暂时无法读取任务</h2><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button variant="outline" className="mt-5" onClick={onRetry}><RefreshCw />重新读取</Button></div>
          </CardContent>
        </Card>
      ) : tasks ? <>
        <section className="task-overview-bar" aria-label="当前任务概览">
          <div className="task-overview-icon"><ListChecks /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">现在有 {waitingCount} 项已完成任务等待处理</div>
            <div className="mt-1 text-xs text-muted-foreground">已完成 {completedCount}/{allTasks.length} 项 · 共 {groups.length} 个任务组</div>
          </div>
          {isLoading ? <Badge variant="outline"><RefreshCw className="animate-spin" />正在同步</Badge> : <Button variant="ghost" size="sm" onClick={onRetry}><RefreshCw />刷新进度</Button>}
        </section>

        <div className="mt-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="task-category-tabs" aria-label="任务分类">
            {categoryOptions.map((option) => (
              <button key={option.id} type="button" className={cn("task-category-tab", activeCategory === option.id && "task-category-tab-active")} onClick={() => setActiveCategory(option.id)} aria-pressed={activeCategory === option.id} title={option.description}>
                <span>{option.label}</span><span>{categoryCount(option.id)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.72fr)]">
          <section className="space-y-3" aria-label={categoryOptions.find((option) => option.id === activeCategory)?.label}>
            {visibleGroups.length > 0 ? visibleGroups.map(({ campaign, group, category }) => renderTaskGroup(campaign, group, category)) : (
              <Card><CardContent className="grid min-h-52 place-items-center p-8 text-center"><div><Target className="mx-auto size-7 text-muted-foreground" /><div className="mt-3 font-medium">当前没有这类任务</div><div className="mt-1 text-xs text-muted-foreground">有新任务发布时会自动出现在这里。</div></div></CardContent></Card>
            )}
          </section>

          <aside className="space-y-4">
            <Card className="task-pass-card overflow-hidden">
              <CardContent className="relative p-5">
                {tasks.seasonPass?.available ? <>
                  <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-medium text-primary">当前赛季通行证</div><div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight">Lv. {tasks.seasonPass.level}</span><span className="text-xs text-muted-foreground">{progressLabel(tasks.seasonPass.experience)} EXP</span></div></div><div className="task-pass-medal"><Medal /></div></div>
                  <div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl bg-muted/25 p-3"><div className="text-[11px] text-muted-foreground">已领等级奖励</div><div className="mt-1 text-lg font-semibold">{tasks.seasonPass.claimedRewardCount}</div></div><div className="rounded-xl bg-muted/25 p-3"><div className="text-[11px] text-muted-foreground">星源箱已开启</div><div className="mt-1 text-lg font-semibold">{tasks.seasonPass.starSourceChestOpened}</div></div></div>
                  <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setActiveCategory("season")}><Trophy />查看赛季任务<ChevronRight /></Button>
                </> : <div className="py-5 text-center"><Medal className="mx-auto size-8 text-muted-foreground" /><div className="mt-3 font-medium">当前没有可用赛季</div><div className="mt-1 text-xs text-muted-foreground">赛季开启后，进度会在这里同步。</div></div>}
              </CardContent>
            </Card>

            <Card className="overflow-hidden"><CardContent className="p-5"><div className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary" />任务说明</div><div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground"><p>“待领取”代表任务已完成，但登陆器领奖接口尚未开放。</p><p>旧通行证任务仍由游戏内系统发放，登陆器只同步展示进度。</p></div></CardContent></Card>
          </aside>
        </div>
      </> : null}

      <Dialog open={selectedTask !== null} onOpenChange={(open) => { if (!open) setSelectedTaskID(null) }}>
        <DialogContent className="sm:max-w-[540px]">
          {selectedTask && (() => {
            const category = selectedTaskCategory
            const visual = categoryVisuals[category]
            const Icon = visual.icon
            const status = taskStatus(selectedTask)
            const StatusIcon = status.icon
            const canNavigate = selectedTask.status === "in_progress" && !selectedTask.locked
            return <>
              <DialogHeader><div className="mb-2 flex items-center gap-2"><div className={cn("grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm", visual.accent)}><Icon className="size-5" /></div><Badge variant="outline">{categoryOptions.find((option) => option.id === category)?.label}</Badge><Badge variant="outline" className={status.tone}><StatusIcon />{status.label}</Badge></div><DialogTitle className="text-xl">{selectedTask.title}</DialogTitle><DialogDescription>{selectedTask.description}</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-center justify-between text-sm"><span className="font-medium">任务进度</span><span className="tabular-nums text-muted-foreground">{progressLabel(selectedTask.current)} / {progressLabel(selectedTask.target)} {selectedTask.unit}</span></div><Progress value={taskProgress(selectedTask)} className={cn("mt-3 h-2", selectedTask.status !== "in_progress" && "[&>div]:bg-emerald-500")} /></div>
                <div><div className="mb-2 text-sm font-medium">任务奖励</div><div className="flex flex-wrap gap-2">{selectedTask.rewards.length > 0 ? selectedTask.rewards.map((reward, index) => <RewardChip key={`${reward.type}-${reward.ref ?? index}`} reward={reward} />) : <span className="text-xs text-muted-foreground">此任务没有单独奖励。</span>}</div></div>
                {selectedTask.status === "completed" && <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{selectedTask.claimPolicy === "external" ? "这项任务沿用现有通行证逻辑，请在游戏内完成领奖。" : selectedTask.claimPolicy === "manual" ? "进度已由后端确认；登陆器领奖接口开放后即可在这里领取。" : "奖励由任务系统自动发放，无需手动领取。"}</div>}
              </div>
              <DialogFooter><DialogClose asChild><Button variant="outline">关闭</Button></DialogClose>{canNavigate ? <Button onClick={() => { setSelectedTaskID(null); onNavigateHome() }}><Gamepad2 />前往服务器</Button> : <Button disabled>{selectedTask.status === "claimed" ? <CheckCircle2 /> : selectedTask.locked ? <LockKeyhole /> : <Gift />}{taskActionLabel(selectedTask)}</Button>}</DialogFooter>
            </>
          })()}
        </DialogContent>
      </Dialog>
    </main>
  )
}

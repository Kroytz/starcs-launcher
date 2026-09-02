import { useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Flame,
  Gamepad2,
  Gem,
  Gift,
  ListChecks,
  LockKeyhole,
  MapPinned,
  Medal,
  RotateCcw,
  Sparkles,
  Star,
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
import { cn } from "@/lib/utils"

type TaskCategory = "onboarding" | "daily" | "weekly" | "event" | "season"
type RewardKind = "starlight" | "stardust" | "experience" | "item"

type DemoReward = {
  kind: RewardKind
  amount?: number
  label: string
}

type DemoTask = {
  id: string
  category: TaskCategory
  title: string
  description: string
  current: number
  target: number
  unit: string
  icon: LucideIcon
  accent: string
  rewards: DemoReward[]
  groupId?: string
  claimedByDefault?: boolean
  hint: string
}

type DemoTaskGroup = {
  id: string
  title: string
  subtitle: string
  tag: string
  deadline?: string
  order: "sequential" | "parallel"
  icon: LucideIcon
  accent: string
  footer?: string
}

const categoryOptions: Array<{ id: TaskCategory; label: string; description: string }> = [
  { id: "onboarding", label: "新手旅程", description: "熟悉 STARCS 的基础功能" },
  { id: "daily", label: "每日任务", description: "每天 04:00 刷新" },
  { id: "weekly", label: "每周任务", description: "每周一 04:00 刷新" },
  { id: "event", label: "活动任务", description: "限时小任务组" },
  { id: "season", label: "赛季任务", description: "本赛季长期目标" },
]

const demoOnboardingGroups: DemoTaskGroup[] = [
  {
    id: "launcher-basics",
    title: "初来乍到",
    subtitle: "熟悉登录、进服、库存和装备配置。",
    tag: "基础引导",
    order: "sequential",
    icon: Sparkles,
    accent: "from-blue-500 to-indigo-600",
    footer: "完成全部基础任务后，再获得新手名片与 25 星尘。",
  },
  {
    id: "zm-rookie",
    title: "ZM · 求生手册",
    subtitle: "从第一次感染到独立完成一轮生存。",
    tag: "生化感染",
    order: "sequential",
    icon: Gamepad2,
    accent: "from-emerald-500 to-teal-600",
    footer: "按顺序解锁；前置任务完成后自动开放下一步。",
  },
  {
    id: "ttt-rookie",
    title: "TTT · 见习探员",
    subtitle: "自由完成身份推理、调查和阵营目标。",
    tag: "匪镇谍影",
    order: "parallel",
    icon: Target,
    accent: "from-violet-500 to-fuchsia-600",
    footer: "组内任务没有先后顺序，可以选择喜欢的目标推进。",
  },
]

const demoEventGroups: DemoTaskGroup[] = [
  {
    id: "map-conquest",
    title: "地图征服计划 · 雾都篇",
    subtitle: "完成指定地图的阶段挑战，逐步解锁整组奖励。",
    tag: "ZM / ZE",
    deadline: "剩余 6 天",
    order: "sequential",
    icon: MapPinned,
    accent: "from-cyan-500 to-blue-600",
  },
  {
    id: "containment-week",
    title: "SCP 收容行动周",
    subtitle: "参与收容行动并完成阶段目标。",
    tag: "SCP",
    deadline: "剩余 3 天",
    order: "parallel",
    icon: TimerReset,
    accent: "from-violet-500 to-fuchsia-600",
  },
]

const demoTasks: DemoTask[] = [
  {
    id: "onboarding-account",
    category: "onboarding",
    groupId: "launcher-basics",
    title: "确认你的身份",
    description: "识别当前 Steam 账号并完成登陆器登录。",
    current: 1,
    target: 1,
    unit: "项",
    icon: CheckCircle2,
    accent: "from-sky-500 to-blue-600",
    rewards: [{ kind: "starlight", amount: 100, label: "星光" }],
    claimedByDefault: true,
    hint: "正式接入后，将在玩家首次完成登陆器登录时自动记录。",
  },
  {
    id: "onboarding-server",
    category: "onboarding",
    groupId: "launcher-basics",
    title: "选择第一片战场",
    description: "从服务器列表进入任意 STARCS 服务器。",
    current: 1,
    target: 1,
    unit: "次",
    icon: Gamepad2,
    accent: "from-indigo-500 to-violet-600",
    rewards: [
      { kind: "starlight", amount: 120, label: "星光" },
      { kind: "experience", amount: 100, label: "赛季经验" },
    ],
    hint: "点击首页中的服务器并成功进入游戏后完成。",
  },
  {
    id: "onboarding-match",
    category: "onboarding",
    groupId: "launcher-basics",
    title: "完成第一局游戏",
    description: "留在服务器中，直到一局游戏正常结算。",
    current: 0,
    target: 1,
    unit: "局",
    icon: Trophy,
    accent: "from-amber-400 to-orange-600",
    rewards: [{ kind: "item", amount: 1, label: "新手补给箱" }],
    hint: "这是当前推荐目标；中途退出不会记录完成进度。",
  },
  {
    id: "onboarding-inventory",
    category: "onboarding",
    groupId: "launcher-basics",
    title: "整理你的库存",
    description: "打开库存并查看任意一件物品的详情。",
    current: 0,
    target: 1,
    unit: "次",
    icon: Gift,
    accent: "from-emerald-500 to-teal-600",
    rewards: [{ kind: "starlight", amount: 150, label: "星光" }],
    hint: "库存功能需要登录；领取的新手物品也会在这里展示。",
  },
  {
    id: "onboarding-loadout",
    category: "onboarding",
    groupId: "launcher-basics",
    title: "保存第一套配置",
    description: "为任意模式装备一件武器或角色外观。",
    current: 0,
    target: 1,
    unit: "套",
    icon: Sparkles,
    accent: "from-fuchsia-500 to-pink-600",
    rewards: [
      { kind: "stardust", amount: 25, label: "星尘" },
      { kind: "item", amount: 1, label: "新手名片" },
    ],
    hint: "完成整组新手旅程后获得最终奖励，不影响每日和赛季任务进度。",
  },
  {
    id: "onboarding-zm-enter",
    category: "onboarding",
    groupId: "zm-rookie",
    title: "进入生化战场",
    description: "首次进入任意 ZM 生化感染服务器。",
    current: 1,
    target: 1,
    unit: "次",
    icon: Gamepad2,
    accent: "from-emerald-500 to-teal-600",
    rewards: [{ kind: "starlight", amount: 60, label: "星光" }],
    hint: "这是模式新手旅程的第一步，完成后可以直接在折叠状态领取。",
  },
  {
    id: "onboarding-zm-survive",
    category: "onboarding",
    groupId: "zm-rookie",
    title: "完成一次生存",
    description: "以人类阵营存活到本回合结束。",
    current: 0,
    target: 1,
    unit: "回合",
    icon: Trophy,
    accent: "from-lime-500 to-emerald-600",
    rewards: [{ kind: "experience", amount: 120, label: "赛季经验" }],
    hint: "第一步完成后解锁，以服务器正常回合结算为准。",
  },
  {
    id: "onboarding-zm-shop",
    category: "onboarding",
    groupId: "zm-rookie",
    title: "使用模式商店",
    description: "在 ZM 对局中购买并使用一次模式道具。",
    current: 0,
    target: 1,
    unit: "次",
    icon: Gift,
    accent: "from-teal-500 to-cyan-600",
    rewards: [{ kind: "item", amount: 1, label: "ZM 新手卡" }],
    hint: "完成一次生存后解锁，具体道具不限。",
  },
  {
    id: "onboarding-ttt-rounds",
    category: "onboarding",
    groupId: "ttt-rookie",
    title: "参与身份对局",
    description: "完整参与 3 局 TTT 模式。",
    current: 1,
    target: 3,
    unit: "局",
    icon: Gamepad2,
    accent: "from-violet-500 to-fuchsia-600",
    rewards: [{ kind: "starlight", amount: 80, label: "星光" }],
    hint: "无顺序任务可以与组内其他目标同时推进。",
  },
  {
    id: "onboarding-ttt-investigate",
    category: "onboarding",
    groupId: "ttt-rookie",
    title: "协助调查",
    description: "作为侦探或好人调查 2 次尸体。",
    current: 0,
    target: 2,
    unit: "次",
    icon: Target,
    accent: "from-indigo-500 to-violet-600",
    rewards: [{ kind: "experience", amount: 100, label: "赛季经验" }],
    hint: "该目标没有前置任务，可以立即开始推进。",
  },
  {
    id: "onboarding-ttt-roles",
    category: "onboarding",
    groupId: "ttt-rookie",
    title: "认识不同阵营",
    description: "分别以两个不同阵营完成一局游戏。",
    current: 1,
    target: 2,
    unit: "种阵营",
    icon: Medal,
    accent: "from-fuchsia-500 to-pink-600",
    rewards: [{ kind: "item", amount: 1, label: "见习探员名片" }],
    hint: "阵营可以任意选择，不要求按固定顺序完成。",
  },
  {
    id: "daily-check-in",
    category: "daily",
    title: "今日签到",
    description: "打开 STAR Launcher 并完成一次签到。",
    current: 1,
    target: 1,
    unit: "次",
    icon: CalendarDays,
    accent: "from-sky-500 to-blue-600",
    rewards: [{ kind: "starlight", amount: 50, label: "星光" }],
    hint: "每天打开登陆器即可完成，未来会与账号签到记录同步。",
  },
  {
    id: "daily-matches",
    category: "daily",
    title: "热身完毕",
    description: "在任意 STARCS 服务器完成 2 局游戏。",
    current: 1,
    target: 2,
    unit: "局",
    icon: Gamepad2,
    accent: "from-violet-500 to-indigo-600",
    rewards: [
      { kind: "starlight", amount: 80, label: "星光" },
      { kind: "experience", amount: 120, label: "赛季经验" },
    ],
    hint: "完整参与一局并结算后计入进度，中途退出不会记录。",
  },
  {
    id: "daily-online",
    category: "daily",
    title: "保持活跃",
    description: "今日在服务器中累计在线 30 分钟。",
    current: 18,
    target: 30,
    unit: "分钟",
    icon: Clock3,
    accent: "from-cyan-500 to-teal-600",
    rewards: [{ kind: "starlight", amount: 60, label: "星光" }],
    hint: "挂机模式不计入活跃时长，游戏内有效时长将自动累计。",
  },
  {
    id: "daily-squad",
    category: "daily",
    title: "并肩作战",
    description: "与社区玩家共同完成一局团队模式。",
    current: 1,
    target: 1,
    unit: "局",
    icon: Target,
    accent: "from-emerald-500 to-green-600",
    rewards: [{ kind: "experience", amount: 100, label: "赛季经验" }],
    claimedByDefault: true,
    hint: "ZE、ZM、JB 等团队玩法都可以推进这项任务。",
  },
  {
    id: "weekly-modes",
    category: "weekly",
    title: "战场探索者",
    description: "本周体验 5 种不同的服务器模式。",
    current: 3,
    target: 5,
    unit: "种",
    icon: ListChecks,
    accent: "from-blue-500 to-indigo-600",
    rewards: [
      { kind: "starlight", amount: 240, label: "星光" },
      { kind: "experience", amount: 400, label: "赛季经验" },
    ],
    hint: "同一种模式重复游玩只记录一次，尝试新战场推进更快。",
  },
  {
    id: "weekly-wins",
    category: "weekly",
    title: "稳定发挥",
    description: "在支持胜负结算的模式中赢得 8 场对局。",
    current: 5,
    target: 8,
    unit: "场",
    icon: Trophy,
    accent: "from-amber-400 to-orange-600",
    rewards: [{ kind: "stardust", amount: 35, label: "星尘" }],
    hint: "只有正常结算且被服务器认定为胜利的对局才会计数。",
  },
  {
    id: "weekly-attendance",
    category: "weekly",
    title: "社区常客",
    description: "本周累计登录 5 天。",
    current: 5,
    target: 5,
    unit: "天",
    icon: Flame,
    accent: "from-orange-500 to-rose-600",
    rewards: [
      { kind: "starlight", amount: 300, label: "星光" },
      { kind: "item", amount: 1, label: "随机道具卡" },
    ],
    hint: "每天完成一次有效登录即可记录，不要求连续登录。",
  },
  {
    id: "event-map-1",
    category: "event",
    groupId: "map-conquest",
    title: "初探雾都",
    description: "通关活动指定地图 1 次。",
    current: 1,
    target: 1,
    unit: "次",
    icon: MapPinned,
    accent: "from-cyan-500 to-blue-600",
    rewards: [{ kind: "starlight", amount: 80, label: "星光" }],
    claimedByDefault: true,
    hint: "完成任意一张本期活动指定地图即可推进；阶段奖励可分别领取。",
  },
  {
    id: "event-map-3",
    category: "event",
    groupId: "map-conquest",
    title: "熟悉路线",
    description: "通关活动指定地图 3 次。",
    current: 2,
    target: 3,
    unit: "次",
    icon: MapPinned,
    accent: "from-cyan-500 to-blue-600",
    rewards: [
      { kind: "starlight", amount: 160, label: "星光" },
      { kind: "experience", amount: 200, label: "赛季经验" },
    ],
    hint: "同一张指定地图可重复计数，以服务器正常结算为准。",
  },
  {
    id: "event-map-5",
    category: "event",
    groupId: "map-conquest",
    title: "征服雾都",
    description: "通关活动指定地图 5 次。",
    current: 2,
    target: 5,
    unit: "次",
    icon: Trophy,
    accent: "from-sky-500 to-indigo-600",
    rewards: [
      { kind: "stardust", amount: 30, label: "星尘" },
      { kind: "item", amount: 1, label: "活动纪念章" },
    ],
    hint: "这是任务组的最终阶段，完成后仍需手动领取本阶段奖励。",
  },
  {
    id: "event-scp-3",
    category: "event",
    groupId: "containment-week",
    title: "快速响应",
    description: "参与并完整结算 3 局 SCP 模式。",
    current: 3,
    target: 3,
    unit: "局",
    icon: Gamepad2,
    accent: "from-violet-500 to-fuchsia-600",
    rewards: [{ kind: "experience", amount: 240, label: "赛季经验" }],
    hint: "进入中途对局也可以计数，但需要停留到该局正常结算。",
  },
  {
    id: "event-scp-8",
    category: "event",
    groupId: "containment-week",
    title: "收容专家",
    description: "本期活动累计完成 8 局 SCP 模式。",
    current: 3,
    target: 8,
    unit: "局",
    icon: Medal,
    accent: "from-violet-500 to-fuchsia-600",
    rewards: [
      { kind: "starlight", amount: 300, label: "星光" },
      { kind: "item", amount: 1, label: "收容行动名片" },
    ],
    hint: "活动结束后未领取的奖励将过期，接入后端时会在结束前增加提醒。",
  },
  {
    id: "season-online",
    category: "season",
    title: "星海漫游",
    description: "本赛季累计有效游戏时长达到 20 小时。",
    current: 14.5,
    target: 20,
    unit: "小时",
    icon: Star,
    accent: "from-fuchsia-500 to-violet-600",
    rewards: [
      { kind: "stardust", amount: 120, label: "星尘" },
      { kind: "experience", amount: 900, label: "赛季经验" },
    ],
    hint: "赛季任务不会每周清空，可以按照自己的节奏完成。",
  },
  {
    id: "season-collector",
    category: "season",
    title: "外观收藏家",
    description: "本赛季获得 6 件不同的角色或武器外观。",
    current: 6,
    target: 6,
    unit: "件",
    icon: Gift,
    accent: "from-pink-500 to-rose-600",
    rewards: [{ kind: "item", amount: 1, label: "赛季纪念徽章" }],
    hint: "商城、活动和赛季奖励获得的外观都可以计入。",
  },
  {
    id: "season-level",
    category: "season",
    title: "行动专家",
    description: "赛季行动等级达到 15 级。",
    current: 7,
    target: 15,
    unit: "级",
    icon: Medal,
    accent: "from-yellow-400 to-amber-600",
    rewards: [
      { kind: "starlight", amount: 800, label: "星光" },
      { kind: "item", amount: 1, label: "限定名片" },
    ],
    hint: "完成每日、每周和赛季任务都能获得行动经验。",
  },
]

function taskProgress(task: DemoTask) {
  return Math.min(100, Math.round((task.current / task.target) * 100))
}

function progressLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function rewardIcon(kind: RewardKind) {
  switch (kind) {
    case "starlight":
      return Sparkles
    case "stardust":
      return Gem
    case "experience":
      return Zap
    default:
      return Gift
  }
}

function rewardTone(kind: RewardKind) {
  switch (kind) {
    case "starlight":
      return "border-primary/20 bg-primary/10 text-primary"
    case "stardust":
      return "border-violet-400/20 bg-violet-500/10 text-violet-600 dark:text-violet-300"
    case "experience":
      return "border-amber-400/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    default:
      return "border-rose-400/20 bg-rose-500/10 text-rose-600 dark:text-rose-300"
  }
}

function RewardChip({ reward, compact = false }: { reward: DemoReward; compact?: boolean }) {
  const Icon = rewardIcon(reward.kind)
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border font-medium", rewardTone(reward.kind), compact ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-xs")}>
      <Icon className={compact ? "size-3" : "size-3.5"} />
      {reward.amount ? `${reward.amount} ` : ""}{reward.label}
    </span>
  )
}

export function TaskCenterPage({
  isAuthenticated,
  onRequireLogin,
  onNavigateHome,
}: {
  isAuthenticated: boolean
  onRequireLogin: () => void
  onNavigateHome: () => void
}) {
  const [activeCategory, setActiveCategory] = useState<TaskCategory>("onboarding")
  const [expandedGroupIDs, setExpandedGroupIDs] = useState<Set<string>>(() => new Set(["launcher-basics"]))
  const [claimedTaskIDs, setClaimedTaskIDs] = useState<Set<string>>(
    () => new Set(demoTasks.filter((task) => task.claimedByDefault).map((task) => task.id)),
  )
  const [selectedTaskID, setSelectedTaskID] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const visibleTasks = useMemo(() => demoTasks.filter((task) => task.category === activeCategory), [activeCategory])
  const selectedTask = selectedTaskID ? demoTasks.find((task) => task.id === selectedTaskID) ?? null : null
  const isCompleted = (task: DemoTask) => task.current >= task.target
  const isClaimed = (task: DemoTask) => claimedTaskIDs.has(task.id)
  const claimableTasks = visibleTasks.filter((task) => isCompleted(task) && !isClaimed(task))
  const dailyCompleted = demoTasks.filter((task) => task.category === "daily" && isCompleted(task)).length
  const onboardingTasks = demoTasks.filter((task) => task.category === "onboarding")
  const onboardingCompleted = onboardingTasks.filter((task) => isCompleted(task)).length
  const totalClaimed = claimedTaskIDs.size
  const totalClaimable = demoTasks.filter((task) => isCompleted(task) && !isClaimed(task)).length
  const categoryCount = (category: TaskCategory) => {
    if (category === "onboarding") return demoOnboardingGroups.length
    if (category === "event") return demoEventGroups.length
    return demoTasks.filter((task) => task.category === category).length
  }

  function claimTask(task: DemoTask) {
    if (!isCompleted(task) || isClaimed(task)) return
    setClaimedTaskIDs((current) => new Set(current).add(task.id))
    setNotice(`已模拟领取「${task.title}」奖励；真实货币与库存不会发生变化。`)
  }

  function claimVisibleTasks() {
    if (claimableTasks.length === 0) return
    setClaimedTaskIDs((current) => {
      const next = new Set(current)
      claimableTasks.forEach((task) => next.add(task.id))
      return next
    })
    setNotice(`已模拟领取 ${claimableTasks.length} 项奖励；接入后端后将改为真实发放。`)
  }

  function claimTaskGroup(group: DemoTaskGroup) {
    const tasks = demoTasks.filter((task) => task.groupId === group.id && isCompleted(task) && !isClaimed(task))
    if (tasks.length === 0) return
    setClaimedTaskIDs((current) => {
      const next = new Set(current)
      tasks.forEach((task) => next.add(task.id))
      return next
    })
    setNotice(`已模拟完成「${group.title}」中的 ${tasks.length} 项任务并领取奖励。`)
  }

  function toggleTaskGroup(groupID: string) {
    setExpandedGroupIDs((current) => {
      const next = new Set(current)
      if (next.has(groupID)) next.delete(groupID)
      else next.add(groupID)
      return next
    })
  }

  function resetDemo() {
    setClaimedTaskIDs(new Set(demoTasks.filter((task) => task.claimedByDefault).map((task) => task.id)))
    setExpandedGroupIDs(new Set(["launcher-basics"]))
    setSelectedTaskID(null)
    setNotice("演示状态已重置。")
  }

  function renderTaskGroup(group: DemoTaskGroup, kind: "onboarding" | "event") {
    const groupTasks = demoTasks.filter((task) => task.groupId === group.id)
    const completedCount = groupTasks.filter((task) => isCompleted(task)).length
    const claimableCount = groupTasks.filter((task) => isCompleted(task) && !isClaimed(task)).length
    const currentTaskIndex = group.order === "sequential" ? groupTasks.findIndex((task) => !isCompleted(task)) : -1
    const currentTask = currentTaskIndex >= 0 ? groupTasks[currentTaskIndex] : null
    const expanded = expandedGroupIDs.has(group.id)
    const panelID = `task-group-panel-${group.id}`
    const Icon = group.icon

    return (
      <article key={group.id} className={cn("task-collapsible-group", kind === "onboarding" ? "task-onboarding-group" : "task-event-group")}>
        <div className="task-collapsible-header">
          <button type="button" className="task-group-toggle" aria-expanded={expanded} aria-controls={panelID} onClick={() => toggleTaskGroup(group.id)}>
            <span className={cn("task-event-icon bg-gradient-to-br", group.accent)}><Icon /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{group.title}</span><Badge variant="outline">{group.tag}</Badge><Badge variant="outline">{group.order === "sequential" ? "按顺序" : "自由完成"}</Badge></span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{group.subtitle}{group.deadline ? ` · ${group.deadline}` : ""}</span>
            </span>
            <span className="task-group-fold-summary">
              {group.order === "sequential" ? currentTask ? <>
                <span className="task-group-summary-label">当前任务</span>
                <span className="task-group-summary-title">{currentTask.title}</span>
                <span className="task-group-summary-progress"><Progress value={taskProgress(currentTask)} /><span>{progressLabel(currentTask.current)}/{progressLabel(currentTask.target)} {currentTask.unit}</span></span>
              </> : <><span className="task-group-summary-label">任务进度</span><span className="task-group-summary-title">全部目标已完成</span><span className="text-xs text-emerald-600 dark:text-emerald-300">{completedCount}/{groupTasks.length}</span></> : <>
                <span className="task-group-summary-label">任务完成</span>
                <span className="task-group-summary-count">{completedCount}<small>/{groupTasks.length}</small></span>
              </>}
            </span>
            <ChevronDown className={cn("task-group-chevron", expanded && "task-group-chevron-open")} />
          </button>
          {claimableCount > 0 && <Button size="sm" className="task-group-claim" onClick={() => claimTaskGroup(group)}><Gift />完成任务{claimableCount > 1 ? ` ${claimableCount}` : ""}</Button>}
        </div>

        {expanded && (
          <div id={panelID} className="task-group-panel">
            <div className="task-event-milestones">
              {groupTasks.map((task, index) => {
                const completed = isCompleted(task)
                const claimed = isClaimed(task)
                const locked = !completed && group.order === "sequential" && currentTaskIndex >= 0 && index > currentTaskIndex
                const status = claimed ? "已领取" : completed ? "可领取" : locked ? "未解锁" : "进行中"
                return (
                  <button key={task.id} type="button" className={cn("task-event-milestone group", completed && !claimed && "task-event-milestone-ready", claimed && "task-event-milestone-claimed", locked && "task-event-milestone-locked")} onClick={() => setSelectedTaskID(task.id)}>
                    <span className={cn("task-event-step", completed && "task-event-step-complete")}>{claimed ? <Check /> : index + 1}</span>
                    <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-medium">{task.title}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{task.description}</span></span>
                    <span className="hidden flex-wrap justify-end gap-1.5 md:flex">{task.rewards.map((reward, rewardIndex) => <RewardChip key={`${reward.kind}-${rewardIndex}`} reward={reward} compact />)}</span>
                    <Badge variant="outline" className={cn("shrink-0", claimed ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : completed ? "border-primary/25 bg-primary/10 text-primary" : "")}>
                      {locked && <LockKeyhole />}{status}
                    </Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                )
              })}
            </div>
            {group.footer && <div className="task-guide-footer"><Gift />{group.footer}</div>}
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
        <Badge variant="outline" className="border-primary/25 bg-primary/10 px-3 py-1 text-primary"><Sparkles />UI DEMO · 本地数据</Badge>
      </div>

      {!isAuthenticated && (
        <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><div><div className="font-medium">登录后同步真实任务进度</div><div className="mt-0.5 text-xs text-muted-foreground">当前页面允许直接体验；展示的进度与奖励领取均为本地模拟。</div></div></div>
          <Button size="sm" onClick={onRequireLogin}>登录账号</Button>
        </div>
      )}

      {notice && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          <span className="flex items-center gap-2"><CheckCircle2 className="size-4" />{notice}</span>
          <button type="button" className="shrink-0 text-xs opacity-70 hover:opacity-100" onClick={() => setNotice(null)}>知道了</button>
        </div>
      )}

      <section className="task-overview-bar" aria-label="当前任务概览">
        <div className="task-overview-icon"><ListChecks /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">现在有 {totalClaimable} 项奖励可以领取</div>
          <div className="mt-1 text-xs text-muted-foreground">新手任务 {onboardingCompleted}/{onboardingTasks.length} · 今日任务 {dailyCompleted}/4 · 已领取 {totalClaimed} 项</div>
        </div>
        <div className="hidden items-center gap-2 sm:flex"><Badge variant="outline"><Flame />连续活跃 5 天</Badge><Badge variant="outline"><Clock3 />每日 04:00 刷新</Badge></div>
      </section>

      <div className="mt-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="task-category-tabs" aria-label="任务分类">
          {categoryOptions.map((option) => (
            <button key={option.id} type="button" className={cn("task-category-tab", activeCategory === option.id && "task-category-tab-active")} onClick={() => setActiveCategory(option.id)} aria-pressed={activeCategory === option.id}>
              <span>{option.label}</span><span>{categoryCount(option.id)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 self-end lg:self-auto"><Button variant="ghost" size="sm" onClick={resetDemo}><RotateCcw />重置演示</Button><Button size="sm" disabled={claimableTasks.length === 0} onClick={claimVisibleTasks}><Gift />领取全部 {claimableTasks.length || ""}</Button></div>
      </div>

      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.72fr)]">
        <section className="space-y-3" aria-label={categoryOptions.find((option) => option.id === activeCategory)?.label}>
          {activeCategory === "onboarding"
            ? demoOnboardingGroups.map((group) => renderTaskGroup(group, "onboarding"))
            : activeCategory === "event"
              ? demoEventGroups.map((group) => renderTaskGroup(group, "event"))
              : visibleTasks.map((task) => {
            const Icon = task.icon
            const claimed = isClaimed(task)
            const completed = isCompleted(task)
            const status = claimed ? "已领取" : completed ? "可领取" : "进行中"
            return (
              <button key={task.id} type="button" className={cn("task-card group", completed && !claimed && "task-card-claimable", claimed && "task-card-claimed")} onClick={() => setSelectedTaskID(task.id)}>
                <div className={cn("task-card-icon bg-gradient-to-br", task.accent)}><Icon /></div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{task.title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{task.description}</div></div><Badge variant="outline" className={cn("shrink-0", claimed ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : completed ? "border-primary/25 bg-primary/10 text-primary" : "")}>{claimed ? <Check /> : completed ? <Gift /> : <Clock3 />}{status}</Badge></div>
                  <div className="mt-3 flex items-center gap-3"><Progress value={taskProgress(task)} className={cn("h-1.5 flex-1", completed && "[&>div]:bg-emerald-500")} /><span className="min-w-20 text-right text-xs tabular-nums text-muted-foreground">{progressLabel(task.current)} / {progressLabel(task.target)} {task.unit}</span></div>
                  <div className="mt-3 flex flex-wrap gap-2">{task.rewards.map((reward, index) => <RewardChip key={`${reward.kind}-${index}`} reward={reward} compact />)}</div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            )
          })}
        </section>

        <aside className="space-y-4">
          <Card className="task-pass-card overflow-hidden">
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-medium text-primary">第一赛季 · 星海行动</div><div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight">Lv. 7</span><span className="text-xs text-muted-foreground">剩余 42 天</span></div></div><div className="task-pass-medal"><Medal /></div></div>
              <div className="mt-5"><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">1,350 / 2,000 EXP</span><span className="font-medium">67.5%</span></div><Progress value={67.5} className="h-1.5" /></div>
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/25 p-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Gift className="size-4" /></div><div className="min-w-0 flex-1"><div className="text-xs font-medium">下一级：先锋补给</div><div className="mt-0.5 text-[11px] text-muted-foreground">120 星光 · 补给箱</div></div></div>
              <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setActiveCategory("season")}><Trophy />查看赛季任务<ChevronRight /></Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden"><CardContent className="p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Flame className="size-4 text-orange-500" />连续活跃</div><span className="text-xs text-muted-foreground">本周</span></div><div className="mt-5 grid grid-cols-7 gap-1.5">{[true, true, true, true, true, false, false].map((done, index) => <div key={index} className="text-center"><div className={cn("mx-auto grid size-8 place-items-center rounded-lg border text-xs", done ? "border-orange-400/25 bg-orange-500/12 text-orange-600 dark:text-orange-300" : "border-border bg-muted/20 text-muted-foreground")}>{done ? <Check className="size-3.5" /> : index + 1}</div><div className="mt-1.5 text-[10px] text-muted-foreground">{["一", "二", "三", "四", "五", "六", "日"][index]}</div></div>)}</div><div className="mt-4 rounded-lg bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">再活跃 2 天即可获得周末加成：<span className="font-medium text-foreground">100 星光</span></div></CardContent></Card>
        </aside>
      </div>

      <Dialog open={selectedTask !== null} onOpenChange={(open) => { if (!open) setSelectedTaskID(null) }}>
        <DialogContent className="sm:max-w-[540px]">
          {selectedTask && (() => {
            const Icon = selectedTask.icon
            const completed = isCompleted(selectedTask)
            const claimed = isClaimed(selectedTask)
            return <>
              <DialogHeader><div className="mb-2 flex items-center gap-2"><div className={cn("grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm", selectedTask.accent)}><Icon className="size-5" /></div><Badge variant="outline">{categoryOptions.find((option) => option.id === selectedTask.category)?.label}</Badge></div><DialogTitle className="text-xl">{selectedTask.title}</DialogTitle><DialogDescription>{selectedTask.description}</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-center justify-between text-sm"><span className="font-medium">任务进度</span><span className="tabular-nums text-muted-foreground">{progressLabel(selectedTask.current)} / {progressLabel(selectedTask.target)} {selectedTask.unit}</span></div><Progress value={taskProgress(selectedTask)} className={cn("mt-3 h-2", completed && "[&>div]:bg-emerald-500")} /><div className="mt-3 text-xs leading-5 text-muted-foreground">{selectedTask.hint}</div></div>
                <div><div className="mb-2 text-sm font-medium">任务奖励</div><div className="flex flex-wrap gap-2">{selectedTask.rewards.map((reward, index) => <RewardChip key={`${reward.kind}-${index}`} reward={reward} />)}</div></div>
                <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">这是 UI 演示。领取操作只改变本地展示状态，不会修改账号余额或库存。</div>
              </div>
              <DialogFooter><DialogClose asChild><Button variant="outline">关闭</Button></DialogClose>{claimed ? <Button disabled><CheckCircle2 />奖励已领取</Button> : completed ? <Button onClick={() => claimTask(selectedTask)}><Gift />领取奖励</Button> : <Button onClick={() => { setSelectedTaskID(null); onNavigateHome() }}><Gamepad2 />前往服务器</Button>}</DialogFooter>
            </>
          })()}
        </DialogContent>
      </Dialog>
    </main>
  )
}

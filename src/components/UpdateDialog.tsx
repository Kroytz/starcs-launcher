import { useEffect, useRef, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import type { Update } from "@tauri-apps/plugin-updater"
import { Download, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import {
  checkLauncherUpdate,
  downloadAndInstallUpdate,
  markPendingUpdateChangelog,
  relaunch,
  type LauncherUpdatePolicy,
} from "@/lib/updater"

export type UpdateDialogState =
  | { mode: "optional"; policy: LauncherUpdatePolicy; update: Update }
  | { mode: "mandatory"; policy: LauncherUpdatePolicy; update: Update }
  | { mode: "completed"; changelog: string; version: string }

type UpdatePhase = "prompt" | "downloading" | "error"

const changelogComponents: Components = {
  h1: ({ children }) => <p className="text-sm font-semibold">{children}</p>,
  h2: ({ children }) => <p className="text-sm font-semibold">{children}</p>,
  h3: ({ children }) => <p className="text-sm font-semibold">{children}</p>,
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-1.5 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1.5 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
  a: ({ children, href }) => <span className="text-primary underline" title={href}>{children}</span>,
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>,
}

function ChangelogBody({ markdown }: { markdown: string }) {
  return (
    <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-border bg-muted/25 px-3.5 py-3 text-sm leading-6 text-foreground/90">
      <ReactMarkdown components={changelogComponents}>{markdown.trim() || "暂无更新说明。"}</ReactMarkdown>
    </div>
  )
}

function updateErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) return error
  if (error instanceof Error && error.message.trim()) return error.message
  return "更新失败，请稍后重试。"
}

export function UpdateDialog({ state, onClose }: { state: UpdateDialogState | null; onClose: () => void }) {
  const [phase, setPhase] = useState<UpdatePhase>("prompt")
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoStartedFor = useRef<UpdateDialogState | null>(null)

  const runDownload = async (policy: LauncherUpdatePolicy, update?: Update) => {
    setPhase("downloading")
    setError(null)
    setPercent(null)
    try {
      // 重试时原 Update 对象可能已失效，重新 check 一次拿新句柄
      const target = update ?? (await checkLauncherUpdate())
      if (!target) {
        onClose()
        return
      }
      await downloadAndInstallUpdate(target, setPercent)
      markPendingUpdateChangelog(policy.latestVersion)
      await relaunch()
    } catch (cause) {
      setPhase("error")
      setError(updateErrorMessage(cause))
    }
  }

  // 强制更新：对话框一出现即自动开始下载，且不允许关闭
  useEffect(() => {
    setError(null)
    setPercent(null)
    if (state?.mode === "mandatory") {
      if (autoStartedFor.current === state) return
      autoStartedFor.current = state
      void runDownload(state.policy, state.update)
    } else {
      setPhase("prompt")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (!state) return null

  if (state.mode === "completed") {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>已更新至 v{state.version}</DialogTitle>
            <DialogDescription>本次更新内容如下。</DialogDescription>
          </DialogHeader>
          <ChangelogBody markdown={state.changelog} />
          <DialogFooter>
            <Button onClick={onClose}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const { policy } = state
  const dismissable = state.mode === "optional" && phase !== "downloading"

  return (
    <Dialog open onOpenChange={(open) => { if (!open && dismissable) onClose() }}>
      <DialogContent
        showCloseButton={dismissable}
        onEscapeKeyDown={dismissable ? undefined : (event) => event.preventDefault()}
        onPointerDownOutside={dismissable ? undefined : (event) => event.preventDefault()}
        onInteractOutside={dismissable ? undefined : (event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {phase === "error" ? "更新失败" : state.mode === "mandatory" ? "发现强制更新" : `发现新版本 v${policy.latestVersion}`}
          </DialogTitle>
          <DialogDescription>
            当前版本 v{policy.currentVersion} → v{policy.latestVersion}
            {state.mode === "mandatory" && phase !== "error" ? "，本次为强制更新，完成后才能继续使用。" : ""}
          </DialogDescription>
        </DialogHeader>

        {phase !== "error" && <ChangelogBody markdown={policy.changelog} />}

        {phase === "downloading" && (
          <div className="space-y-2">
            {percent === null ? <Progress value={100} className="animate-pulse" /> : <Progress value={percent} />}
            <p className="text-xs text-muted-foreground">{percent === null ? "正在下载更新包…" : `正在下载更新包… ${percent}%`}</p>
            <p className="text-xs text-muted-foreground">下载完成后将自动安装并重启启动器，请勿关闭窗口。</p>
          </div>
        )}

        {phase === "error" && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-sm text-red-600 dark:text-red-300">{error}</p>
        )}

        {(phase === "prompt" || phase === "error") && (
          <DialogFooter>
            {state.mode === "optional" && <Button variant="outline" onClick={onClose}>暂不更新</Button>}
            {phase === "prompt" ? (
              <Button onClick={() => void runDownload(policy, state.update)}><Download />立即更新</Button>
            ) : (
              <Button onClick={() => void runDownload(policy)}><RefreshCw />重试</Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

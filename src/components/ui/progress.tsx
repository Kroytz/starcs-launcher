import { cn } from "@/lib/utils"

function Progress({ value = 0, className }: { value?: number; className?: string }) {
  const normalized = Math.min(100, Math.max(0, value))
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${normalized}%` }} />
    </div>
  )
}

export { Progress }

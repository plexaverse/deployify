import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
    onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <label className="relative inline-flex items-center cursor-pointer group">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        ref={ref}
        {...props}
      />
      <div className={cn(
        "w-11 h-6 bg-[var(--border)] peer-focus:outline-none rounded-full peer transition-colors peer-checked:bg-[var(--primary)] after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white peer-checked:after:bg-[var(--primary-foreground)] after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full",
        className
      )}></div>
    </label>
  )
)
Switch.displayName = "Switch"

export { Switch }

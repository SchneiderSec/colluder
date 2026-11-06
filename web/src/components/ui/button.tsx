import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[3px] text-body font-[550] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-[1.5px] focus-visible:outline-offset-2 focus-visible:outline-bone disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        // Colluder: bone primary is the one loud action on a screen
        default: "bg-primary text-primary-foreground font-[650] border border-primary hover:bg-bone-glow disabled:border-rule disabled:bg-soot-2 disabled:text-smoke disabled:opacity-100",
        secondary: "bg-soot-2 text-bone border border-rule hover:border-ash hover:bg-accent",
        quiet: "bg-transparent text-bone border border-rule hover:border-ash hover:bg-accent",
        ghost: "bg-transparent text-smoke hover:text-bone hover:bg-accent",
        destructive: "bg-transparent text-alarm-ink border border-alarm-border hover:bg-alarm-ground",
        link: "text-bone underline underline-offset-4 decoration-ash hover:decoration-bone",
      },
      size: {
        default: "h-7 px-2.5",
        sm: "h-6 px-2",
        lg: "h-9 px-5 text-title",
        icon: "size-7",
        "icon-sm": "size-6",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

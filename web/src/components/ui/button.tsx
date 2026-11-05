import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[3px] text-[12.5px] font-[550] whitespace-nowrap transition-colors outline-none cursor-pointer disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        // Colluder: bone primary is the one loud action on a screen
        default: "bg-primary text-primary-foreground font-[650] border border-primary hover:bg-[#fff8ea]",
        secondary: "bg-soot-2 text-bone border border-rule hover:border-ash hover:bg-accent",
        quiet: "bg-transparent text-bone border border-rule hover:border-ash hover:bg-accent",
        ghost: "bg-transparent text-smoke hover:text-bone hover:bg-accent",
        destructive: "bg-transparent text-[#f3b4a3] border border-[#7a3a2a] hover:bg-[#2a1914]",
        link: "text-bone underline underline-offset-4 decoration-ash hover:decoration-bone",
      },
      size: {
        default: "h-7 px-2.5",
        sm: "h-6 px-2",
        lg: "h-9 px-5 text-[13.5px]",
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

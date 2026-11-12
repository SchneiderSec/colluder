import * as React from "react"
import { DropdownMenu as MenuPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

// A small action menu (the probe header's "⋯"), styled like the select popover.
const DropdownMenu = (props: React.ComponentProps<typeof MenuPrimitive.Root>) => <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
const DropdownMenuTrigger = (props: React.ComponentProps<typeof MenuPrimitive.Trigger>) => <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />

function DropdownMenuContent({ className, sideOffset = 4, align = "end", ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-[11rem] overflow-hidden rounded-md border border-rule bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-hidden select-none focus:bg-accent focus:text-bone data-[disabled]:pointer-events-none data-[disabled]:opacity-60 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
        destructive ? "text-alarm-ink focus:bg-alarm-ground focus:text-alarm-ink" : "text-bone [&_svg]:text-smoke",
        className
      )}
      {...props}
    />
  )
}

const DropdownMenuSeparator = ({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) =>
  <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("-mx-1 my-1 h-px bg-rule-2", className)} {...props} />

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator }

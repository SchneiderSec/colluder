import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

// A floating panel anchored to a control (the probe tabs' "All probes" switcher), styled like the menus.
const Popover = (props: React.ComponentProps<typeof PopoverPrimitive.Root>) => <PopoverPrimitive.Root data-slot="popover" {...props} />
const PopoverTrigger = (props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) => <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />

function PopoverContent({ className, align = "start", sideOffset = 4, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-md border border-rule bg-popover text-popover-foreground shadow-md outline-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }

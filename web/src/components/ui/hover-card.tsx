import * as React from "react"
import { HoverCard as CardPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

// A card that opens on hover after a pause (the probe tabs' details). Pointer only: everything in it
// is also reachable another way (the tab's accessible name, the pane).
const HoverCard = ({ openDelay = 550, closeDelay = 80, ...props }: React.ComponentProps<typeof CardPrimitive.Root>) =>
  <CardPrimitive.Root data-slot="hover-card" openDelay={openDelay} closeDelay={closeDelay} {...props} />
const HoverCardTrigger = (props: React.ComponentProps<typeof CardPrimitive.Trigger>) => <CardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />

function HoverCardContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof CardPrimitive.Content>) {
  return (
    <CardPrimitive.Portal>
      <CardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-[320px] rounded-md border border-rule bg-popover p-3 text-body text-popover-foreground shadow-md outline-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className
        )}
        {...props}
      />
    </CardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }

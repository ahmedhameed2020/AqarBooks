"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs(props: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // A finance screen routinely carries 5-8 tabs. At 320px that rail is
        // wider than the viewport, and without an explicit scroll container
        // the overflow escapes to the document and scrolls the whole page
        // sideways. Scrolling it here keeps every tab reachable and the page
        // itself fixed. `scrollbar-none` because a visible bar under a tab
        // rail reads as a broken border.
        "relative flex gap-1 border-b overflow-x-auto scrollbar-none [&>*]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors touch:min-h-11 hover:text-foreground data-active:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        "absolute bottom-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-full bg-primary transition-all duration-200",
        className
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-panel" className={cn("pt-4 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsIndicator, TabsPanel }

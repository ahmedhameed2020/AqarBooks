"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  // No hardcoded `data-slot="dialog-trigger"` here on purpose: when this is
  // composed via `render={<Button>}` (see app/[locale]/(app)/members/
  // send-reminder-dialog.tsx), base-ui's render-prop merge resolves the
  // two elements' own `data-slot` attributes differently between the SSR
  // pass and the client hydration pass -- server output kept this
  // component's "dialog-trigger" value, the client re-render picked the
  // rendered Button's own "button" value instead, producing a hydration
  // mismatch. Nothing in this codebase selects on `[data-slot="dialog-trigger"]`
  // (confirmed via a repo-wide search), so dropping it removes the
  // conflicting source of truth instead of trying to force one value to
  // consistently win.
  return <DialogPrimitive.Trigger {...props} />
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: DialogPrimitive.Popup.Props & { showClose?: boolean }) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // >= sm: the centred dialog this app has always used. Every caller
          // passes its own `max-w-*` / `rounded-*` / `p-*` here and those
          // still win, because the mobile rules below are all `max-sm:`
          // prefixed and therefore live in a different tailwind-merge group.
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl outline-none",
          // < sm: a full-width bottom sheet anchored to the bottom edge. A
          // centred 85vh box on a 320px screen wastes the margins and puts
          // the primary action in the middle of the screen, out of thumb
          // reach; a sheet uses the full width and keeps the footer at the
          // bottom where the thumb already is. `svh` not `vh` so the mobile
          // browser chrome collapsing does not clip the footer.
          "max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:w-full max-sm:max-w-none",
          "max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-h-[92svh]",
          "max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:duration-200",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-150",
          // Sheets slide, they do not zoom out of the middle of the screen.
          "max-sm:data-open:slide-in-from-bottom max-sm:data-open:zoom-in-100",
          "max-sm:data-closed:slide-out-to-bottom max-sm:data-closed:zoom-out-100",
          className
        )}
        {...props}
      >
        {/* Grab handle -- the standard signal that this surface is a sheet.
            Presentational only; dismissal is the close button and backdrop. */}
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute top-4 end-4 rounded-md p-1.5 text-muted-foreground opacity-70 outline-none transition-opacity hover:bg-muted hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex items-start gap-3 border-b p-5 pe-10", className)} {...props} />
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("min-h-0 flex-1 overflow-y-auto p-5", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Mobile: actions stack full-width, primary on top
        // (flex-col-reverse keeps the confirm button -- always last
        // in source order -- as the topmost, largest target), and the
        // iOS home indicator is padded around rather than under.
        "flex items-center justify-end gap-2 border-t bg-muted/30 p-4",
        "max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-2.5 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
        "max-sm:[&>*]:w-full max-sm:[&>*]:justify-center",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-base font-semibold text-foreground", className)} {...props} />
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogBackdrop,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

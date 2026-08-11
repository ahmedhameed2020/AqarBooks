"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CheckCircle2, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed bottom-4 end-4 z-100 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            toast={toast}
            className={cn(
              "relative rounded-lg border bg-popover p-3 pe-8 text-popover-foreground shadow-lg",
              "data-[type=success]:border-emerald-500/30",
              "data-[type=error]:border-destructive/30",
              "data-open:animate-in data-open:slide-in-from-bottom-2 data-open:fade-in-0 data-open:duration-200",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:duration-150",
            )}
          >
            <div className="flex items-start gap-2">
              {toast.type === "success" && (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              {toast.type === "error" && <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
              <div className="min-w-0">
                <ToastPrimitive.Title className="text-sm font-medium" />
                <ToastPrimitive.Description className="text-xs text-muted-foreground" />
              </div>
            </div>
            <ToastPrimitive.Close className="absolute top-2 end-2 rounded-md p-1 text-muted-foreground opacity-70 outline-none transition-opacity hover:bg-muted hover:opacity-100">
              <X className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

export function Toaster({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider>
      {children}
      <ToastList />
    </ToastPrimitive.Provider>
  );
}

export const useToast = ToastPrimitive.useToastManager;

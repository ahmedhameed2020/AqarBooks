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
              "relative rounded-xl border bg-white dark:bg-slate-900 p-3.5 pe-8 text-slate-900 dark:text-slate-100 shadow-xl",
              "data-[type=success]:border-emerald-500/40 data-[type=success]:bg-emerald-50/90 dark:data-[type=success]:bg-emerald-950/60",
              "data-[type=error]:border-rose-500/40 data-[type=error]:bg-rose-50/90 dark:data-[type=error]:bg-rose-950/60",
              "data-open:animate-in data-open:slide-in-from-bottom-2 data-open:fade-in-0 data-open:duration-200",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:duration-150",
            )}
          >
            <div className="flex items-start gap-2.5">
              {toast.type === "success" && (
                <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              {toast.type === "error" && <XCircle className="mt-0.5 size-4.5 shrink-0 text-rose-600 dark:text-rose-400" />}
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-xs font-bold text-slate-900 dark:text-white" />
                <ToastPrimitive.Description className="text-xs text-slate-600 dark:text-slate-300 mt-0.5" />
                {toast.actionProps && (
                  <ToastPrimitive.Action
                    {...toast.actionProps}
                    className="mt-1.5 text-xs font-bold text-indigo-600 outline-none hover:underline focus-visible:underline"
                  />
                )}
              </div>
            </div>
            <ToastPrimitive.Close className="absolute top-2.5 end-2.5 rounded-lg p-1 text-slate-400 opacity-70 outline-none transition-opacity hover:bg-slate-100 dark:hover:bg-slate-800 hover:opacity-100">
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

export function useToast() {
  const manager = ToastPrimitive.useToastManager();

  const add = React.useCallback(
    (options: {
      title?: React.ReactNode;
      description?: React.ReactNode;
      type?: "success" | "error" | "info" | "warning" | "default";
      variant?: "success" | "error" | "default";
      actionProps?: any;
    }) => {
      const resolvedType =
        options.type ??
        (options.variant === "error"
          ? "error"
          : options.variant === "success"
          ? "success"
          : "default");

      return manager.add({
        title: options.title,
        description: options.description,
        type: resolvedType as any,
        actionProps: options.actionProps,
      });
    },
    [manager]
  );

  return React.useMemo(
    () => ({
      ...manager,
      add,
      show: add,
      toast: add,
    }),
    [manager, add]
  );
}

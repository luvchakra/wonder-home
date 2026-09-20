"use client";

import { Toast as RadixToast } from "radix-ui";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * Brief confirmations — "Saved", "Order prepared" — that never carry
 * information the person could not get elsewhere. Anything that needs a
 * decision is a sheet, not a toast.
 */
export type ToastTone = "handled" | "info" | "attention";
type ToastRecord = { id: number; title: string; description?: string; tone: ToastTone };

const ToastContext = createContext<((toast: Omit<ToastRecord, "id">) => void) | null>(null);

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used within <ToastProvider>");
  return push;
}

const ICON: Record<ToastTone, typeof Info> = { handled: CircleCheck, info: Info, attention: TriangleAlert };
const TONE: Record<ToastTone, string> = {
  handled: "text-[var(--wh-handled)]",
  info: "text-[var(--wh-info)]",
  attention: "text-[var(--wh-attention)]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const push = useCallback((toast: Omit<ToastRecord, "id">) => {
    setToasts((current) => [...current, { ...toast, id: Date.now() + Math.random() }]);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="down" duration={4000}>
        {children}
        {toasts.map((toast) => {
          const Icon = ICON[toast.tone];
          return (
            <RadixToast.Root
              key={toast.id}
              onOpenChange={(open) => {
                if (!open) setToasts((current) => current.filter((entry) => entry.id !== toast.id));
              }}
              className="flex items-start gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3.5 shadow-[var(--wh-shadow-raised)] data-[state=open]:animate-[wh-rise_var(--wh-duration)_var(--wh-ease)]"
            >
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", TONE[toast.tone])} />
              <div className="min-w-0 flex-1">
                <RadixToast.Title className="text-sm font-semibold">{toast.title}</RadixToast.Title>
                {toast.description ? (
                  <RadixToast.Description className="text-xs text-[var(--wh-foreground-muted)]">
                    {toast.description}
                  </RadixToast.Description>
                ) : null}
              </div>
              <RadixToast.Close aria-label="Dismiss" className="-m-1 grid size-8 place-items-center rounded-full text-[var(--wh-foreground-subtle)] hover:bg-[var(--wh-surface-muted)]">
                <X className="size-4" />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport className="fixed inset-x-4 bottom-[calc(var(--wh-tabbar-height)+var(--wh-tabbar-raised-clearance))] z-50 mx-auto flex max-w-sm flex-col gap-2 outline-none lg:right-6 lg:bottom-6 lg:left-auto" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

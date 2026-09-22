import { useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";
import clsx from "clsx";
import { ToastContext, type Toast } from "./toast-context";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, variant: Toast["variant"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "glass flex items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-lg animate-[fadeIn_0.2s_ease]",
              t.variant === "success" && "border-emerald-400/30",
              t.variant === "error" && "border-red-400/30"
            )}
          >
            {t.variant === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
            {t.variant === "error" && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
            <span className="text-[var(--color-text)]">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-2 text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

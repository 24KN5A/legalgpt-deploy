import { createContext, useContext } from "react";

export interface Toast {
  id: number;
  message: string;
  variant: "success" | "error" | "info";
}

export interface ToastContextValue {
  showToast: (message: string, variant?: Toast["variant"]) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

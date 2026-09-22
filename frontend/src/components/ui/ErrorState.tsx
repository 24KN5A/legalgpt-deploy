import { AlertTriangle } from "lucide-react";
import Button from "./Button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-400/20 bg-red-400/5 px-8 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-red-400" />
      <h3 className="font-display text-lg text-[var(--color-text)]">{title}</h3>
      <p className="max-w-sm text-sm text-[var(--color-text-muted)]">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

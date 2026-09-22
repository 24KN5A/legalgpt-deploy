import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  labelRight?: ReactNode;
}

export default function TextField({ label, error, type, id, labelRight, ...rest }: TextFieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={fieldId} className="block text-xs font-medium text-[var(--color-text-muted)]">
          {label}
        </label>
        {labelRight}
      </div>
      <div className="relative">
        <input
          id={fieldId}
          type={isPassword && show ? "text" : type}
          className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{
            borderColor: error ? "var(--color-risk-critical)" : "var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
          }}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            aria-label={show ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-[var(--color-risk-critical)]">{error}</p>}
    </div>
  );
}

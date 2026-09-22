import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn, ShieldCheck } from "lucide-react";
import AuthLayout from "../components/auth/AuthLayout";
import TextField from "../components/auth/TextField";
import Button from "../components/ui/Button";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to pick up where you left off with your documents and conversations."
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium text-[var(--color-accent-strong)] hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          labelRight={
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-[var(--color-accent-strong)] hover:underline"
            >
              Forgot password?
            </Link>
          }
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {error && (
          <div
            className="rounded-xl border px-3.5 py-2.5 text-sm"
            style={{ borderColor: "var(--color-risk-critical)", color: "var(--color-risk-critical)" }}
          >
            {error}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          <LogIn className="h-4 w-4" /> Log in
        </Button>
      </form>

      <div
        className="mt-6 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs text-[var(--color-text-faint)]"
        style={{ borderColor: "var(--color-border)" }}
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        Passwords are hashed with bcrypt and never stored in plain text.
      </div>
    </AuthLayout>
  );
}

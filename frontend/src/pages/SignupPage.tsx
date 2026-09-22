import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, UserPlus } from "lucide-react";
import AuthLayout from "../components/auth/AuthLayout";
import TextField from "../components/auth/TextField";
import Button from "../components/ui/Button";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await signup(fullName, email, password);
      navigate("/dashboard", { replace: true });
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
      title="Create your account"
      subtitle="Get your own private workspace for documents, chats, and AI insights."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-[var(--color-accent-strong)] hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Full name"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jordan Avery"
        />
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
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
          <UserPlus className="h-4 w-4" /> Create account
        </Button>
      </form>

      <div
        className="mt-6 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs text-[var(--color-text-faint)]"
        style={{ borderColor: "var(--color-border)" }}
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        Your password is hashed with bcrypt before it's stored — LegalGPT never keeps the plain text.
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--color-text-faint)]">
        By creating an account you agree this is informational tooling, not legal advice.
      </p>
    </AuthLayout>
  );
}

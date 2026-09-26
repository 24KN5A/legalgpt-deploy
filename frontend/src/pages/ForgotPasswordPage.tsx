import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import AuthLayout from "../components/auth/AuthLayout";
import TextField from "../components/auth/TextField";
import Button from "../components/ui/Button";
import {
  ApiError,
  sendForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPasswordWithOTP,
} from "../lib/api";

type Step = "identifier" | "otp" | "password" | "success";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [copiedOtp, setCopiedOtp] = useState(false);

  // Resend OTP countdown timer
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (step === "otp" && countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    } else if (countdown === 0) {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  async function handleSendOtp(e?: FormEvent) {
    if (e) e.preventDefault();
    const cleanId = identifier.trim();
    if (!cleanId) {
      setError("Please enter your registered email address or phone number.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await sendForgotPasswordOTP(cleanId);
      if (res.debug_otp) {
        setDebugOtp(res.debug_otp);
      }
      setStep("otp");
      setCountdown(60);
      setCanResend(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not send verification code. Please verify your email/phone and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await verifyForgotPasswordOTP(identifier, cleanOtp);
      setResetToken(res.reset_token);
      setStep("password");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Invalid or expired verification code. Please check the code or request a new one."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await resetPasswordWithOTP(resetToken, newPassword);
      setStep("success");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reset password. Your session may have expired — please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleAutoFillOtp() {
    if (debugOtp) {
      setOtp(debugOtp);
      setError(null);
    }
  }

  function handleCopyOtp() {
    if (debugOtp) {
      navigator.clipboard.writeText(debugOtp);
      setCopiedOtp(true);
      setTimeout(() => setCopiedOtp(false), 2000);
    }
  }

  // Step progress bar
  const stepIndex = step === "identifier" ? 1 : step === "otp" ? 2 : step === "password" ? 3 : 4;

  return (
    <AuthLayout
      title={
        step === "identifier"
          ? "Reset your password"
          : step === "otp"
          ? "Enter verification code"
          : step === "password"
          ? "Create new password"
          : "Password updated"
      }
      subtitle={
        step === "identifier"
          ? "Enter your registered email address to receive a secure 6-digit verification code."
          : step === "otp"
          ? `We sent a 6-digit code to ${identifier}.`
          : step === "password"
          ? "Choose a strong new password with at least 8 characters."
          : "Your password has been successfully reset."
      }
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-medium text-[var(--color-accent-strong)] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </Link>
      }
    >
      {/* Progress step dots */}
      <div className="mb-6 flex items-center justify-between px-1">
        {[
          { idx: 1, label: "Account" },
          { idx: 2, label: "Verify" },
          { idx: 3, label: "Password" },
          { idx: 4, label: "Done" },
        ].map((s) => (
          <div key={s.idx} className="flex flex-col items-center gap-1.5 flex-1">
            <div className="flex items-center w-full">
              {s.idx > 1 && (
                <div
                  className={`h-0.5 flex-1 transition-colors ${
                    stepIndex >= s.idx ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                  }`}
                />
              )}
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                  stepIndex === s.idx
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)] ring-4 ring-[var(--color-accent-soft)]"
                    : stepIndex > s.idx
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                    : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-faint)]"
                }`}
              >
                {stepIndex > s.idx ? "✓" : s.idx}
              </div>
              {s.idx < 4 && (
                <div
                  className={`h-0.5 flex-1 transition-colors ${
                    stepIndex > s.idx ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                  }`}
                />
              )}
            </div>
            <span
              className={`text-[10px] font-medium hidden xs:inline-block ${
                stepIndex === s.idx
                  ? "text-[var(--color-text)] font-semibold"
                  : "text-[var(--color-text-faint)]"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Account Identifier */}
        {step === "identifier" && (
          <motion.form
            key="step-identifier"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            onSubmit={handleSendOtp}
            className="space-y-4"
          >
            <TextField
              label="Registered Email or Phone"
              type="text"
              autoComplete="email"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com or phone"
            />

            {error && (
              <div
                className="rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm"
                style={{
                  borderColor: "var(--color-risk-critical)",
                  color: "var(--color-risk-critical)",
                  background: "rgba(239, 68, 68, 0.08)",
                }}
              >
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full btn-tactile" loading={loading}>
              <Mail className="h-4 w-4" /> Send Verification Code
            </Button>
          </motion.form>
        )}

        {/* Step 2: OTP Verification */}
        {step === "otp" && (
          <motion.form
            key="step-otp"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            onSubmit={handleVerifyOtp}
            className="space-y-4"
          >
            {/* Demo / Mock OTP Helper Banner if active */}
            {debugOtp && (
              <div
                className="rounded-xl border p-3.5 space-y-2.5 text-xs"
                style={{
                  borderColor: "var(--color-accent-soft)",
                  background: "linear-gradient(135deg, rgba(212, 175, 106, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-semibold text-[var(--color-accent-strong)]">
                    <Sparkles className="h-3.5 w-3.5" /> Instant Test OTP Available
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
                    Dev / Demo Mode
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-text-muted)]">Code:</span>
                    <span className="font-mono text-base font-bold tracking-widest text-[var(--color-accent-strong)]">
                      {debugOtp}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyOtp}
                      className="p-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                      title="Copy code"
                    >
                      {copiedOtp ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleAutoFillOtp}
                      className="px-2 py-1 rounded bg-[var(--color-accent)] text-[var(--color-accent-contrast)] text-[11px] font-semibold hover:opacity-90 transition-opacity"
                    >
                      Auto-fill
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--color-text-faint)] leading-relaxed">
                  💡 Note: To deliver live emails to real inboxes, configure <code className="font-mono text-[10px] text-[var(--color-accent)]">SMTP_USERNAME</code> and <code className="font-mono text-[10px] text-[var(--color-accent)]">SMTP_PASSWORD</code> in your backend .env file.
                </p>
              </div>
            )}

            <div>
              <label
                htmlFor="otp-input"
                className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]"
              >
                6-Digit Verification Code
              </label>
              <input
                id="otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full rounded-xl border px-3.5 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none transition-colors focus:border-[var(--color-accent)]"
                style={{
                  borderColor: error ? "var(--color-risk-critical)" : "var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              />
            </div>

            {error && (
              <div className="space-y-2">
                <div
                  className="rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm"
                  style={{
                    borderColor: "var(--color-risk-critical)",
                    color: "var(--color-risk-critical)",
                    background: "rgba(239, 68, 68, 0.08)",
                  }}
                >
                  {error}
                </div>
                {(error.includes("expired") || error.includes("request a new")) && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => handleSendOtp()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Request New Code Now
                  </Button>
                )}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full btn-tactile" loading={loading}>
              <KeyRound className="h-4 w-4" /> Verify Code
            </Button>

            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep("identifier");
                  setError(null);
                  setOtp("");
                }}
                className="hover:underline text-[var(--color-text-faint)]"
              >
                Change account
              </button>

              {canResend ? (
                <button
                  type="button"
                  onClick={() => handleSendOtp()}
                  className="inline-flex items-center gap-1 font-medium text-[var(--color-accent-strong)] hover:underline"
                >
                  <RefreshCw className="h-3 w-3" /> Resend OTP
                </button>
              ) : (
                <span className="text-[var(--color-text-faint)]">
                  Resend in {countdown}s
                </span>
              )}
            </div>
          </motion.form>
        )}

        {/* Step 3: Set New Password */}
        {step === "password" && (
          <motion.form
            key="step-password"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            onSubmit={handleResetPassword}
            className="space-y-4"
          >
            <TextField
              label="New Password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />

            <TextField
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />

            {/* Password Match / Length Hint */}
            <div className="text-[11px] text-[var(--color-text-faint)] space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={newPassword.length >= 8 ? "text-emerald-400" : "text-[var(--color-text-faint)]"}>
                  {newPassword.length >= 8 ? "✓" : "○"} At least 8 characters
                </span>
              </div>
              {confirmPassword && (
                <div className="flex items-center gap-1.5">
                  <span className={newPassword === confirmPassword ? "text-emerald-400" : "text-amber-400"}>
                    {newPassword === confirmPassword ? "✓ Passwords match" : "○ Passwords must match"}
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div
                className="rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm"
                style={{
                  borderColor: "var(--color-risk-critical)",
                  color: "var(--color-risk-critical)",
                  background: "rgba(239, 68, 68, 0.08)",
                }}
              >
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full btn-tactile" loading={loading}>
              <Lock className="h-4 w-4" /> Save New Password
            </Button>
          </motion.form>
        )}

        {/* Step 4: Success State */}
        {step === "success" && (
          <motion.div
            key="step-success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-5 text-center py-3"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] glow-accent">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <h3 className="font-display text-lg font-bold">Password Reset Complete!</h3>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)]">
                Your credentials have been securely updated. You can now log into your workspace with your new password.
              </p>
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full btn-tactile"
              onClick={() => navigate("/login", { replace: true })}
            >
              Go to Login
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="mt-6 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11px] text-[var(--color-text-faint)]"
        style={{ borderColor: "var(--color-border)" }}
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        Verification codes are time-limited, encrypted, and single-use.
      </div>
    </AuthLayout>
  );
}

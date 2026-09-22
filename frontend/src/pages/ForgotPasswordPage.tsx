import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
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

type Step = "phone" | "otp" | "password" | "success";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    if (!phoneNumber.trim()) {
      setError("Please enter your registered email address.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await sendForgotPasswordOTP(phoneNumber);
      setStep("otp");
      setCountdown(60);
      setCanResend(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not send verification code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!otp.trim() || otp.length < 4) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await verifyForgotPasswordOTP(phoneNumber, otp);
      setResetToken(res.reset_token);
      setStep("password");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Invalid code. Please try again."
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
          : "Could not reset password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={
        step === "phone"
          ? "Reset your password"
          : step === "otp"
          ? "Check your email"
          : step === "password"
          ? "Create new password"
          : "Password updated"
      }
      subtitle={
        step === "phone"
          ? "Enter your registered email address to receive a 6-digit verification code."
          : step === "otp"
          ? `Enter the 6-digit code sent to ${phoneNumber}.`
          : step === "password"
          ? "Choose a strong password with at least 8 characters."
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
      {/* Step 1: Email address */}
      {step === "phone" && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <TextField
            label="Registered Email Address"
            type="email"
            autoComplete="email"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="you@example.com"
          />

          {error && (
            <div
              className="rounded-xl border px-3.5 py-2.5 text-sm"
              style={{
                borderColor: "var(--color-risk-critical)",
                color: "var(--color-risk-critical)",
              }}
            >
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            <Mail className="h-4 w-4" /> Send Verification Code
          </Button>
        </form>
      )}

      {/* Step 2: OTP Verification */}
      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
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
              maxLength={6}
              autoFocus
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-xl border px-3.5 py-3 text-center font-mono text-xl tracking-[0.4em] outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                borderColor: error
                  ? "var(--color-risk-critical)"
                  : "var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            />
          </div>

          {error && (
            <div className="space-y-2">
              <div
                className="rounded-xl border px-3.5 py-2.5 text-sm"
                style={{
                  borderColor: "var(--color-risk-critical)",
                  color: "var(--color-risk-critical)",
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

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            <KeyRound className="h-4 w-4" /> Verify Code
          </Button>

          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pt-1">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setError(null);
                setOtp("");
              }}
              className="hover:underline text-[var(--color-text-faint)]"
            >
              Change email
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
        </form>
      )}

      {/* Step 3: Set New Password */}
      {step === "password" && (
        <form onSubmit={handleResetPassword} className="space-y-4">
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
            placeholder="Re-enter password"
          />

          {error && (
            <div
              className="rounded-xl border px-3.5 py-2.5 text-sm"
              style={{
                borderColor: "var(--color-risk-critical)",
                color: "var(--color-risk-critical)",
              }}
            >
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            <Lock className="h-4 w-4" /> Reset Password
          </Button>
        </form>
      )}

      {/* Step 4: Success State */}
      {step === "success" && (
        <div className="space-y-5 text-center py-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <p className="text-sm text-[var(--color-text-muted)]">
            Your password has been reset successfully. You can now log in with your new credentials.
          </p>

          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => navigate("/login", { replace: true })}
          >
            Go to Login
          </Button>
        </div>
      )}

      <div
        className="mt-6 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs text-[var(--color-text-faint)]"
        style={{ borderColor: "var(--color-border)" }}
      >
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        Verification codes are encrypted, time-limited, and single-use.
      </div>
    </AuthLayout>
  );
}

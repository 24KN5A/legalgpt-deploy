import { CircleUser, LogOut, Mail, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import { useAuth } from "../lib/auth-context";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <AppShell title="Profile">
      <div className="mx-auto max-w-2xl">
        <GlassCard className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
            <CircleUser className="h-8 w-8" />
          </div>
          <div>
            <h2 className="font-display text-xl">{user?.full_name ?? "Your account"}</h2>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-[var(--color-text-muted)]">
              <Mail className="h-3.5 w-3.5" /> {user?.email}
            </p>
          </div>

          <div
            className="flex w-full max-w-sm items-center gap-2 rounded-xl border px-4 py-3 text-left text-xs text-[var(--color-text-faint)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Documents, conversations, and insights in this workspace are private to your
            account — signed in with a session token stored only on this device.
          </div>

          <Button variant="danger" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </GlassCard>
      </div>
    </AppShell>
  );
}

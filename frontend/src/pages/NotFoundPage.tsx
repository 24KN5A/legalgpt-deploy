import { Link } from "react-router-dom";
import { Scale } from "lucide-react";
import Button from "../components/ui/Button";

export default function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
      <Scale className="h-10 w-10 text-[var(--color-accent)]" />
      <h1 className="font-display text-3xl">Page not found</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        The page you're looking for doesn't exist.
      </p>
      <Link to="/dashboard">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { MobileDrawer, MobileBottomNav } from "./MobileNav";

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Collapsible Sidebar */}
      <Sidebar />

      {/* Mobile Slide-over Drawer */}
      <MobileDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top Header Bar */}
        <TopBar
          title={title}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 pb-24 md:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Dock Navigation */}
        <MobileBottomNav />
      </div>
    </div>
  );
}

import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { Loader2, Menu } from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

export function DashboardLayout() {
  const { user, loading, isApproved, profile } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (profile && !isApproved) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full max-w-full bg-background overflow-hidden overflow-x-clip">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw] bg-sidebar border-sidebar-border overflow-y-auto">
          <Sidebar onNavigate={() => setMobileOpen(false)} hideCollapse />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden overflow-x-clip">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-sidebar-border bg-sidebar flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-display font-bold text-sidebar-foreground">SOBRE MÍDIA</span>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-clip">
          <div className="p-4 sm:p-6 lg:p-8 w-full max-w-full min-w-0 box-border">
            <div key={location.pathname} className="animate-slide-up-fade w-full max-w-full min-w-0">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

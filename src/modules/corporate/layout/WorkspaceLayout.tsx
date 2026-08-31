import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CrmSidebar } from "@/modules/crm/components/Sidebar";
import { CrmHeader } from "@/modules/crm/components/Header";
import { CrmSessionProvider } from "@/modules/crm/contexts/CrmSessionContext";
import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export default function WorkspaceLayout() {
  const { isAuthenticated, isApproved, loading } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background text-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse">Autenticando Workspace...</p>
      </div>
    );
  }

  // If not authenticated, send to unified corporate login
  if (!isAuthenticated || !isApproved) {
    return <Navigate to="/auth/corporate" state={{ from: location }} replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full max-w-full bg-background text-foreground overflow-hidden overflow-x-clip">
        <div className="hidden md:block flex-shrink-0">
          <CrmSidebar />
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-72 max-w-[85vw] bg-slate-950 border-white/10 overflow-y-auto">
            <CrmSidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="flex-1 flex flex-col min-w-0 max-w-full min-h-screen overflow-x-clip">
          <CrmHeader onMenuClick={() => setMobileOpen(true)} />
          <div className="flex-1 overflow-y-auto overflow-x-clip w-full max-w-full min-w-0 p-4 sm:p-6 lg:p-8 bg-background animate-in fade-in duration-300 box-border">
            <div className="w-full max-w-full min-w-0">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

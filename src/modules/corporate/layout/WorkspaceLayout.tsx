import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CrmSidebar } from "@/modules/crm/components/Sidebar";
import { CrmHeader } from "@/modules/crm/components/Header";
import { CrmSessionProvider } from "@/modules/crm/contexts/CrmSessionContext";

export default function WorkspaceLayout() {
  const { isAuthenticated, isApproved, loading } = useAuth();
  const location = useLocation();

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
      <div className="min-h-screen flex w-full bg-background text-foreground overflow-hidden">
        <div className="hidden md:block">
          <CrmSidebar />
        </div>
        <main className="flex-1 flex flex-col min-w-0 min-h-screen">
          <CrmHeader />
          <div className="flex-1 overflow-y-auto w-full p-4 md:p-6 lg:p-8 bg-background animate-in fade-in duration-300">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

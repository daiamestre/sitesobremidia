import { Suspense, lazy, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
// import { PWAProvider } from "@/components/pwa/PWAProvider"; // CRASH CAUSE: KEEP DISABLED
import { Loader2 } from "lucide-react";
import { BootSequence } from "@/components/player/BootSequence";
import { Sidebar } from "@/components/dashboard/Sidebar";

// LAZY LOADS
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Install = lazy(() => import("./pages/Install"));
const Player = lazy(() => import("./pages/Player"));
const PlayerEntry = lazy(() => import("./pages/PlayerEntry"));
const NotFound = lazy(() => import("./pages/NotFound"));

// DASHBOARD PAGES
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const Medias = lazy(() => import("./pages/dashboard/Medias"));
const Playlists = lazy(() => import("./pages/dashboard/Playlists"));
const Screens = lazy(() => import("./pages/dashboard/Screens"));
const Widgets = lazy(() => import("./pages/dashboard/Widgets"));
const Schedule = lazy(() => import("./pages/dashboard/Schedule"));
const ExternalLinks = lazy(() => import("./pages/dashboard/ExternalLinks"));
const Analytics = lazy(() => import("./pages/dashboard/Analytics"));
const History = lazy(() => import("./pages/dashboard/History"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const AdminUsers = lazy(() => import("./pages/dashboard/AdminUsers"));


const queryClient = new QueryClient();

// Loading Fallback
const PageLoader = () => (
  <div className="h-screen w-full flex items-center justify-center bg-background text-foreground">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

// DASHBOARD LAYOUT WRAPPER
const DashboardLayout = () => {
  return (
    <div className="flex min-h-screen bg-background w-full">
      <Sidebar />
      <main className="flex-1 overflow-auto h-screen w-full bg-muted/10 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
};

const App = () => {
  // v2.24: DASHBOARD RESTORED + NATIVE PLAYER FIXED

  const [isBootComplete, setIsBootComplete] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <AuthProvider>
          {/* <PWAProvider> <-- DISABLED TO PREVENT CRASH */}

          <BrowserRouter>

            {!isBootComplete && (
              <BootSequence onComplete={(isNative) => {
                console.log("Boot Complete. Native:", isNative);
                setIsBootComplete(true);
              }} />
            )}

            {isBootComplete && (
              <div className="animate-in fade-in duration-300">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* PUBLIC ROUTES */}
                    <Route path="/" element={<Index />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/install" element={<Install />} />

                    {/* WEB PLAYER ROUTE */}
                    <Route path="/player/:screenId" element={<Player />} />

                    {/* NATIVE TV ROUTES */}
                    <Route path="/tv" element={<PlayerEntry basePath="/tv" />} />
                    <Route path="/tv/:screenId" element={<Player />} />

                    {/* DASHBOARD ROUTES (RESTORED) */}
                    <Route path="/dashboard" element={<DashboardLayout />}>
                      <Route index element={<DashboardHome />} />
                      <Route path="medias" element={<Medias />} />
                      <Route path="playlists" element={<Playlists />} />
                      <Route path="screens" element={<Screens />} />
                      <Route path="widgets" element={<Widgets />} />
                      <Route path="schedule" element={<Schedule />} />
                      <Route path="links" element={<ExternalLinks />} />
                      <Route path="analytics" element={<Analytics />} />
                      <Route path="history" element={<History />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="admin/users" element={<AdminUsers />} />
                    </Route>

                    {/* CATCH ALL */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </div>
            )}

          </BrowserRouter>

          {/* </PWAProvider> */}
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

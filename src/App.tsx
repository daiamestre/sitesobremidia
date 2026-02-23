import { Suspense, lazy, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
// import { PWAProvider } from "@/components/pwa/PWAProvider"; // CRASH CAUSE: KEEP DISABLED
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
// LAZY LOADS
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Install = lazy(() => import("./pages/Install"));
const NotFound = lazy(() => import("./pages/NotFound"));

// DASHBOARD PAGES
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const Medias = lazy(() => import("./pages/dashboard/Medias"));
const Playlists = lazy(() => import("./pages/dashboard/Playlists"));
const Screens = lazy(() => import("./pages/dashboard/Screens"));
const ScreenDetails = lazy(() => import("./pages/dashboard/ScreenDetails"));
const Widgets = lazy(() => import("./pages/dashboard/Widgets"));
const Schedule = lazy(() => import("./pages/dashboard/Schedule"));
const ExternalLinks = lazy(() => import("./pages/dashboard/ExternalLinks"));
const Analytics = lazy(() => import("./pages/dashboard/Analytics"));
const History = lazy(() => import("./pages/dashboard/History"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const AdminUsers = lazy(() => import("./pages/dashboard/AdminUsers"));
const Player = lazy(() => import("./pages/Player"));
const WidgetPlayer = lazy(() => import("./pages/WidgetPlayer"));
const LinkPlayer = lazy(() => import("./pages/LinkPlayer"));
const WebPlayerDemo = lazy(() => import("./components/player/WebPlayerDemo"));

const queryClient = new QueryClient();

// Loading Fallback
const PageLoader = () => (
  <div className="h-screen w-full flex items-center justify-center bg-background text-foreground">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

import { DashboardLayout } from "@/layouts/DashboardLayout";

const App = () => {
  // v3.0: CLEAN SLATE - PLAYER REMOVED

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <AuthProvider>
          <BrowserRouter>
            <div className="animate-in fade-in duration-300">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* PUBLIC ROUTES */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/install" element={<Install />} />
                  <Route path="/player" element={<Player />} />
                  <Route path="/player/:screenId" element={<Player />} />
                  <Route path="/player/widget/:id" element={<WidgetPlayer />} />
                  <Route path="/player/link/:id" element={<LinkPlayer />} />
                  <Route path="/player/*" element={<Player />} />
                  <Route path="/player-demo" element={<WebPlayerDemo />} />

                  {/* DASHBOARD ROUTES (RESTORED) */}
                  <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route index element={<DashboardHome />} />
                    <Route path="medias" element={<Medias />} />
                    <Route path="playlists" element={<Playlists />} />
                    <Route path="screens" element={<Screens />} />
                    <Route path="screens/:id" element={<ScreenDetails />} />
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
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

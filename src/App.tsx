import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Loader2 } from "lucide-react";
import { NativeStatus } from "./components/native/NativeStatus";

// ----------------------------------------------------------------------
// LAZY LOADS (Code Splitting)
// ----------------------------------------------------------------------

// Public
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Install = lazy(() => import("./pages/Install"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Player Engine (Separate Chunk)
const Player = lazy(() => import("./pages/Player"));
const PlayerEntry = lazy(() => import("./pages/PlayerEntry"));

// Dashboard (Admin Bundle)
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const Medias = lazy(() => import("./pages/dashboard/Medias"));
const Playlists = lazy(() => import("./pages/dashboard/Playlists"));
const Screens = lazy(() => import("./pages/dashboard/Screens"));
const Widgets = lazy(() => import("./pages/dashboard/Widgets"));
const Schedule = lazy(() => import("./pages/dashboard/Schedule"));
const ExternalLinks = lazy(() => import("./pages/dashboard/ExternalLinks"));
const History = lazy(() => import("./pages/dashboard/History"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const AdminUsers = lazy(() => import("./pages/dashboard/AdminUsers"));
const Analytics = lazy(() => import("./pages/dashboard/Analytics"));

const queryClient = new QueryClient();

// Loading Fallback
const PageLoader = () => (
  <div className="h-screen w-full flex items-center justify-center bg-background text-foreground">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

import { BootSequence } from "@/components/player/BootSequence";
import { useState } from "react";

const App = () => {
  const [isBootComplete, setIsBootComplete] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {/* Boot Sequence has been moved inside Router to prevent crash */}

          <NativeStatus />
          <BrowserRouter>
            {/* Boot Sequence Handler - Now inside Router */}
            {!isBootComplete && (
              <BootSequence onComplete={() => setIsBootComplete(true)} />
            )}

            <div className={!isBootComplete ? "opacity-0 absolute -z-50" : "opacity-100 transition-opacity duration-1000"}>
              <PWAProvider>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/install" element={<Install />} />

                    {/* Player (dashboard preview) */}
                    <Route path="/player" element={<PlayerEntry basePath="/player" />} />
                    <Route path="/player/:screenId" element={<Player />} />

                    {/* Endereço dedicado (TV/Kiosk) */}
                    <Route path="/tv" element={<PlayerEntry basePath="/tv" />} />
                    <Route path="/tv/:screenId" element={<Player />} />

                    <Route path="/dashboard" element={<DashboardLayout />}>
                      <Route index element={<DashboardHome />} />
                      <Route path="medias" element={<Medias />} />
                      <Route path="playlists" element={<Playlists />} />
                      <Route path="screens" element={<Screens />} />
                      <Route path="widgets" element={<Widgets />} />
                      <Route path="schedule" element={<Schedule />} />
                      <Route path="links" element={<ExternalLinks />} />
                      <Route path="history" element={<History />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="admin/users" element={<AdminUsers />} />
                      <Route path="analytics" element={<Analytics />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </PWAProvider>
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;

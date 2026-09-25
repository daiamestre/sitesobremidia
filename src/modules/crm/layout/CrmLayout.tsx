import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { CrmSidebar } from '../components/Sidebar';
import { CrmHeader } from '../components/Header';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';

export default function CrmLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed('crm');

  return (
    <div className="min-h-screen w-full max-w-full bg-background text-foreground flex overflow-hidden overflow-x-clip">
      {/* Menu fixo só a partir de 1280 px (recolhível); abaixo disso abre por cima do conteúdo pelo botão do topo */}
      <div className="hidden xl:block flex-shrink-0">
        <CrmSidebar collapsed={sidebarCollapsed} />
      </div>

      {/* Mobile Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw] bg-slate-950 border-white/10 overflow-y-auto">
          <CrmSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Área Principal de Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 max-w-full min-h-screen overflow-x-clip">
        <CrmHeader onMenuClick={() => setMobileOpen(true)} onToggleSidebar={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <main className="flex-1 overflow-y-auto overflow-x-clip p-4 sm:p-6 lg:p-8 bg-background w-full max-w-full min-w-0 box-border">
          <div className="w-full max-w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

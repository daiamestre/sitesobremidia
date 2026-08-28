import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { CrmSidebar } from '../components/Sidebar';
import { CrmHeader } from '../components/Header';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export default function CrmLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      {/* Sidebar Fixo na Esquerda para Desktop */}
      <div className="hidden md:block">
        <CrmSidebar />
      </div>

      {/* Mobile Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-slate-950 border-white/10 overflow-y-auto">
          <CrmSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Área Principal de Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <CrmHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

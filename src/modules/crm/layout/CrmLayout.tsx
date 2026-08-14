import { Outlet } from 'react-router-dom';
import { CrmSidebar } from '../components/Sidebar';
import { CrmHeader } from '../components/Header';

export default function CrmLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
      {/* Sidebar Fixo na Esquerda para Desktop */}
      <div className="hidden md:block">
        <CrmSidebar />
      </div>

      {/* Área Principal de Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <CrmHeader />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

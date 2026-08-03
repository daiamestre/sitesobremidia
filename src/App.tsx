import { useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

// LAZY LOADED PAGES
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Install = lazy(() => import("./pages/Install"));
const RepresentantesAuth = lazy(() => import("./pages/representantes/RepresentantesAuth"));
const CrmLayout = lazy(() => import("./modules/crm/layout/CrmLayout"));
const CrmDashboardHome = lazy(() => import("./modules/crm/pages/CrmDashboardHome"));
const ClientesListPage = lazy(() => import("./modules/crm/pages/ClientesListPage"));
const NovoClientePage = lazy(() => import("./modules/crm/pages/NovoClientePage"));
const PropostasListPage = lazy(() => import("./modules/crm/pages/PropostasListPage"));
const ContratoSelectionPage = lazy(() => import("./modules/crm/pages/ContratoSelectionPage"));
const PedidoInsercaoPage = lazy(() => import("./modules/crm/pages/PedidoInsercaoPage"));
const ProductionListPage = lazy(() => import("./modules/crm/pages/ProductionListPage"));
const ProductionDetailsPage = lazy(() => import("./modules/crm/pages/ProductionDetailsPage"));
const ScheduleListPage = lazy(() => import("./modules/crm/pages/ScheduleListPage"));
const ScheduleDetailsPage = lazy(() => import("./modules/crm/pages/ScheduleDetailsPage"));
const ScheduleCalendarPage = lazy(() => import("./modules/crm/pages/ScheduleCalendarPage"));
const OperationDashboard = lazy(() => import("./modules/crm/pages/OperationDashboard"));
const FinanceDashboard = lazy(() => import("./modules/crm/pages/FinanceDashboard"));
const ContasReceberPage = lazy(() => import("./modules/crm/pages/ContasReceberPage"));
const CommissionPage = lazy(() => import("./modules/crm/pages/CommissionPage"));
const CommissionsDashboard = lazy(() => import("./modules/crm/pages/CommissionsDashboard"));
const CashFlowPage = lazy(() => import("./modules/crm/pages/CashFlowPage"));
const CashFlowDashboard = lazy(() => import("./modules/crm/pages/CashFlowDashboard"));
const GeneralLedgerPage = lazy(() => import("./modules/crm/pages/GeneralLedgerPage"));
const CostCenterPage = lazy(() => import("./modules/crm/pages/CostCenterPage"));
const InvoicesPage = lazy(() => import("./modules/crm/pages/InvoicesPage"));
const FinanceExecutiveDashboard = lazy(() => import("./modules/crm/pages/FinanceExecutiveDashboard"));
const BillingDashboard = lazy(() => import("./modules/crm/pages/BillingDashboard"));
const CommissionRulesPage = lazy(() => import("./modules/crm/pages/CommissionRulesPage"));
const DREPage = lazy(() => import("./modules/crm/pages/DREPage"));
const ExecutiveDashboard = lazy(() => import("./modules/crm/pages/ExecutiveDashboard"));
const CommercialDashboard = lazy(() => import("./modules/crm/pages/CommercialDashboard"));
const FinanceDashboardEnterprise = lazy(() => import("./modules/crm/pages/FinanceDashboardEnterprise"));
const OperationDashboardEnterprise = lazy(() => import("./modules/crm/pages/OperationDashboardEnterprise"));
const OccupancyDashboard = lazy(() => import("./modules/crm/pages/OccupancyDashboard"));
const BIExecutiveDashboard = lazy(() => import("./modules/crm/pages/BIExecutiveDashboard"));
const CommercialAnalytics = lazy(() => import("./modules/crm/pages/CommercialAnalytics"));
const FinancialAnalytics = lazy(() => import("./modules/crm/pages/FinancialAnalytics"));
const OperationalAnalytics = lazy(() => import("./modules/crm/pages/OperationalAnalytics"));
const OccupancyAnalytics = lazy(() => import("./modules/crm/pages/OccupancyAnalytics"));
const ExecutiveScorecard = lazy(() => import("./modules/crm/pages/ExecutiveScorecard"));
const ContractsSignaturePage = lazy(() => import("./modules/crm/pages/ContractsSignaturePage"));
const CustomerPortalDashboard = lazy(() => import("./modules/crm/pages/CustomerPortalDashboard"));
const MobileDashboard = lazy(() => import("./modules/crm/pages/MobileDashboard"));
const AIDashboard = lazy(() => import("./modules/crm/pages/AIDashboard"));
const PlaceholderPage = lazy(() => import("./modules/crm/pages/PlaceholderPage"));
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
const Reports = lazy(() => import("./pages/dashboard/Reports"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const AdminUsers = lazy(() => import("./pages/dashboard/AdminUsers"));
const Player = lazy(() => import("./pages/Player"));
const WidgetPlayer = lazy(() => import("./pages/WidgetPlayer"));
const LinkPlayer = lazy(() => import("./pages/LinkPlayer"));
const WebPlayerDemo = lazy(() => import("./components/player/WebPlayerDemo"));
const AdminSolicitacaoAprovacao = lazy(() => import("./pages/admin/AdminSolicitacaoAprovacao"));

const queryClient = new QueryClient();

// Loading Fallback
const PageLoader = () => (
  <div className="h-screen w-full flex items-center justify-center bg-background text-foreground">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

import { DashboardLayout } from "@/layouts/DashboardLayout";
import { RequireApproval } from "@/components/auth/RouteGuards";

const App = () => {
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
                  {/* REPRESENTANTES LOGIN & CRM MODULE */}
                  <Route path="/representantes/login" element={<RepresentantesAuth />} />

                  <Route path="/representantes" element={<RequireApproval><CrmLayout /></RequireApproval>}>
                    <Route index element={<CrmDashboardHome />} />
                    <Route path="dashboard" element={<CrmDashboardHome />} />
                    <Route path="clientes" element={<ClientesListPage />} />
                    <Route path="clientes/novo" element={<NovoClientePage />} />
                    <Route path="propostas" element={<PropostasListPage />} />
                    <Route path="contratos" element={<ContratoSelectionPage />} />
                    <Route path="contratos/selecionar/:propostaId" element={<ContratoSelectionPage />} />
                    <Route path="campanhas" element={<ProductionListPage />} />
                    <Route path="pontos" element={<OccupancyDashboard />} />
                    <Route path="agenda" element={<ScheduleCalendarPage />} />
                    <Route path="relatorios" element={<CommercialDashboard />} />
                    <Route path="configuracoes" element={<PlaceholderPage title="Configurações e Metas" description="Parâmetros de comissão, dados bancários e preferências de notificação do Representante." />} />
                    <Route path="pi" element={<PedidoInsercaoPage />} />
                    <Route path="pi/novo/:contratoId" element={<PedidoInsercaoPage />} />
                    <Route path="pi/:piId" element={<PedidoInsercaoPage />} />
                    <Route path="producao" element={<ProductionListPage />} />
                    <Route path="producao/:producaoId" element={<ProductionDetailsPage />} />
                    <Route path="agendamento" element={<ScheduleListPage />} />
                    <Route path="agendamento/calendario" element={<ScheduleCalendarPage />} />
                    <Route path="agendamento/:agendamentoId" element={<ScheduleDetailsPage />} />
                    <Route path="operacao" element={<OperationDashboard />} />
                    <Route path="financeiro" element={<FinanceDashboard />} />
                    <Route path="financeiro/recebiveis" element={<ContasReceberPage />} />
                    <Route path="financeiro/comissoes" element={<CommissionPage />} />
                    <Route path="financeiro/comissoes-dashboard" element={<CommissionsDashboard />} />
                    <Route path="financeiro/fluxo-caixa" element={<CashFlowPage />} />
                    <Route path="financeiro/fluxo-caixa-dashboard" element={<CashFlowDashboard />} />
                    <Route path="financeiro/livro-razao" element={<GeneralLedgerPage />} />
                    <Route path="financeiro/centros-custo" element={<CostCenterPage />} />
                    <Route path="financeiro/notas-fiscais" element={<InvoicesPage />} />
                    <Route path="financeiro/executivo" element={<FinanceExecutiveDashboard />} />
                    <Route path="financeiro/cobrancas" element={<BillingDashboard />} />
                    <Route path="financeiro/regras-comissao" element={<CommissionRulesPage />} />
                    <Route path="financeiro/dre" element={<DREPage />} />
                    <Route path="analytics" element={<ExecutiveDashboard />} />
                    <Route path="analytics/comercial" element={<CommercialDashboard />} />
                    <Route path="analytics/financeiro" element={<FinanceDashboardEnterprise />} />
                    <Route path="analytics/operacional" element={<OperationDashboardEnterprise />} />
                    <Route path="analytics/ocupacao" element={<OccupancyDashboard />} />
                    <Route path="bi" element={<BIExecutiveDashboard />} />
                    <Route path="bi/comercial" element={<CommercialAnalytics />} />
                    <Route path="bi/financeiro" element={<FinancialAnalytics />} />
                    <Route path="bi/operacional" element={<OperationalAnalytics />} />
                    <Route path="bi/ocupacao" element={<OccupancyAnalytics />} />
                    <Route path="bi/scorecard" element={<ExecutiveScorecard />} />
                    <Route path="assinaturas" element={<ContractsSignaturePage />} />
                    <Route path="portal-cliente" element={<CustomerPortalDashboard />} />
                    <Route path="mobile" element={<MobileDashboard />} />
                    <Route path="ia" element={<AIDashboard />} />
                    <Route path="campanhas" element={<PlaceholderPage title="Campanhas Ativas" description="Campanhas de anúncio veiculadas nas telas da rede." />} />
                    <Route path="pontos" element={<PlaceholderPage title="Pontos de Exibição" description="Mapeamento de TVs corporativas e painéis de LED." />} />
                    <Route path="agenda" element={<PlaceholderPage title="Agenda de Visitas" description="Compromissos, reuniões e visitas comerciais agendadas." />} />
                    <Route path="relatorios" element={<PlaceholderPage title="Relatórios Comerciais" description="Desempenho de vendas, taxa de conversão e relatórios." />} />
                    <Route path="configuracoes" element={<PlaceholderPage title="Configurações do CRM" description="Preferências da conta e configurações gerais." />} />
                    <Route path="perfil" element={<PlaceholderPage title="Meu Perfil" description="Dados do representante comercial e preferências." />} />
                  </Route>
                  <Route path="/player" element={<Player />} />
                  <Route path="/player/:screenId" element={<Player />} />
                  <Route path="/player/widget/:id" element={<WidgetPlayer />} />
                  <Route path="/player/link/:id" element={<LinkPlayer />} />
                  <Route path="/player/*" element={<Player />} />
                  <Route path="/player-demo" element={<WebPlayerDemo />} />
                  <Route path="/admin/solicitacoes/:id" element={<AdminSolicitacaoAprovacao />} />

                  {/* DASHBOARD ROUTES (RESTORED) */}
                  <Route path="/dashboard" element={<RequireApproval><DashboardLayout /></RequireApproval>}>
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
                    <Route path="reports" element={<Reports />} />
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

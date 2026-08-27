import { useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

// LAZY LOADED PAGES
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Install = lazy(() => import("./pages/Install"));
const DevicePairingScreen = lazy(() => import("./pages/DevicePairingScreen"));
const RepresentantesAuth = lazy(() => import("./pages/representantes/RepresentantesAuth"));
const WorkspaceLayout = lazy(() => import("./modules/corporate/layout/WorkspaceLayout"));
const CorporateCommandCenter = lazy(() => import("./modules/corporate/pages/CorporateCommandCenter"));
const UsuariosAcessosPage = lazy(() => import("./modules/corporate/pages/UsuariosAcessosPage"));
const PontosParceirosPage = lazy(() => import("./modules/corporate/pages/PontosParceirosPage"));
const CrmLayout = lazy(() => import("./modules/crm/layout/CrmLayout"));
const CrmDashboardHome = lazy(() => import("./modules/crm/pages/CrmDashboardHome"));
const RepresentativeDashboard = lazy(() => import("./modules/crm/pages/RepresentativeDashboard"));
const NovaProspeccaoPage = lazy(() => import("./modules/crm/pages/NovaProspeccaoPage"));
const PontoParceiroWizardPage = lazy(() => import("./modules/crm/pages/prospeccao/PontoParceiroWizardPage"));
const GestorMidiiasProspeccaoPage = lazy(() => import("./modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage"));
const RepresentantesPage = lazy(() => import("./modules/crm/pages/RepresentantesPage"));
const DesempenhoRepresentantesPage = lazy(() => import("./modules/crm/pages/DesempenhoRepresentantesPage"));
const RepresentanteDetalhePage = lazy(() => import("./modules/crm/pages/RepresentanteDetalhePage"));
const ClientesListPage = lazy(() => import("./modules/crm/pages/ClientesListPage"));
const NovoClientePage = lazy(() => import("./modules/crm/pages/NovoClientePage"));
const ClienteDetalhePage = lazy(() => import("./modules/crm/pages/ClienteDetalhePage"));
const EditarClientePage = lazy(() => import("./modules/crm/pages/EditarClientePage"));
const PropostasListPage = lazy(() => import("./modules/crm/pages/PropostasListPage"));
const ContratoSelectionPage = lazy(() => import("./modules/crm/pages/ContratoSelectionPage"));
const ContratosListPage = lazy(() => import("./modules/crm/pages/ContratosListPage"));
const PedidoInsercaoPage = lazy(() => import("./modules/crm/pages/PedidoInsercaoPage"));
const PedidoInsercaoListPage = lazy(() => import("./modules/crm/pages/PedidoInsercaoListPage"));
const ProductionListPage = lazy(() => import("./modules/crm/pages/ProductionListPage"));
const ProductionDetailsPage = lazy(() => import("./modules/crm/pages/ProductionDetailsPage"));
const ScheduleListPage = lazy(() => import("./modules/crm/pages/ScheduleListPage"));
const ScheduleDetailsPage = lazy(() => import("./modules/crm/pages/ScheduleDetailsPage"));
const ScheduleCalendarPage = lazy(() => import("./modules/crm/pages/ScheduleCalendarPage"));
const OperationDashboard = lazy(() => import("./modules/crm/pages/OperationDashboard"));
const NocDashboardPage = lazy(() => import("./modules/crm/pages/NocDashboardPage"));
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
const BillingDetailPage = lazy(() => import("./modules/crm/pages/BillingDetailPage"));
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
const AcoesCentraisPage = lazy(() => import("./modules/crm/pages/AcoesCentraisPage"));
const AIDashboard = lazy(() => import("./modules/crm/pages/AIDashboard"));

// CUSTOMER PORTAL PAGES
const CustomerPortalLayout = lazy(() => import("./modules/crm/layout/CustomerPortalLayout"));
const MeusPontosPage = lazy(() => import("./modules/crm/pages/portal/MeusPontosPage"));
const MinhasCampanhasPage = lazy(() => import("./modules/crm/pages/portal/MinhasCampanhasPage"));
const NovaCampanhaPage = lazy(() => import("./modules/crm/pages/portal/NovaCampanhaPage"));
const MinhaRedePage = lazy(() => import("./modules/crm/pages/portal/MinhaRedePage"));
const ReceitaHostPage = lazy(() => import("./modules/crm/pages/portal/ReceitaHostPage"));
const FinanceiroClientePage = lazy(() => import("./modules/crm/pages/portal/FinanceiroClientePage"));
const ContratoVigentePage = lazy(() => import("./modules/crm/pages/portal/ContratoVigentePage"));
const InsercoesPorDiaPage = lazy(() => import("./modules/crm/pages/portal/InsercoesPorDiaPage"));
const OcupacaoRedePage = lazy(() => import("./modules/crm/pages/portal/OcupacaoRedePage"));
const ProdutosPage = lazy(() => import("./modules/crm/pages/portal/ProdutosPage"));
const OfertasPage = lazy(() => import("./modules/crm/pages/portal/OfertasPage"));
const OnboardingPage = lazy(() => import("./modules/crm/pages/portal/OnboardingPage"));
const ExpansaoPage = lazy(() => import("./modules/crm/pages/portal/ExpansaoPage"));
const BrandKitPage = lazy(() => import("./modules/crm/pages/portal/BrandKitPage"));
const AssetLibraryPage = lazy(() => import("./modules/crm/pages/portal/AssetLibraryPage"));
const EncartePage = lazy(() => import("./modules/crm/pages/portal/EncartePage"));
const BibliotecaIA = lazy(() => import("./modules/crm/pages/portal/BibliotecaIA"));
const PlaylistsClientePage = lazy(() => import("./modules/crm/pages/portal/PlaylistsClientePage"));
const MinhaEquipePage = lazy(() => import("./modules/crm/pages/portal/MinhaEquipePage"));
const ConfiguracoesPortalPage = lazy(() => import("./modules/crm/pages/portal/ConfiguracoesPortalPage"));

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
const CentralDashboard = lazy(() => import("./pages/Central/CentralDashboard"));

const queryClient = new QueryClient();

// Loading Fallback
const PageLoader = () => (
  <div className="h-screen w-full flex items-center justify-center bg-background text-foreground">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

import { DashboardLayout } from "@/layouts/DashboardLayout";
import { RequireApproval } from "@/components/auth/RouteGuards";
import { CrmSessionProvider } from "@/modules/crm/contexts/CrmSessionContext";

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <AuthProvider>
          <BrowserRouter>
            <CrmSessionProvider>
              <div className="animate-in fade-in duration-300">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                  {/* PUBLIC ROUTES */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/corporate" element={<Auth />} />
                  <Route path="/auth/forgot-password" element={<ForgotPassword />} />
                  <Route path="/auth/reset-password" element={<ResetPassword />} />
                  <Route path="/auth/change-password" element={<ChangePassword />} />
                  <Route path="/install" element={<Install />} />
                  {/* REPRESENTANTES LOGIN & CRM MODULE */}
                  <Route path="/representantes/login" element={<RepresentantesAuth />} />

                  <Route path="/representantes" element={<RequireApproval><CrmLayout /></RequireApproval>}>
                    <Route index element={<RepresentativeDashboard />} />
                    <Route path="dashboard" element={<RepresentativeDashboard />} />
                    <Route path="prospeccao" element={<NovaProspeccaoPage />} />
                    <Route path="prospeccao/ponto-parceiro" element={<PontoParceiroWizardPage />} />
                    <Route path="prospeccao/gestor" element={<GestorMidiiasProspeccaoPage />} />
                    <Route path="clientes" element={<ClientesListPage />} />
                    <Route path="clientes/novo" element={<NovoClientePage />} />
                    <Route path="clientes/editar/:id" element={<EditarClientePage />} />
                    <Route path="clientes/:id" element={<ClienteDetalhePage />} />
                    <Route path="propostas" element={<PropostasListPage />} />
                    <Route path="contratos" element={<ContratosListPage />} />
                    <Route path="contratos/selecionar/:propostaId" element={<ContratoSelectionPage />} />
                    <Route path="campanhas" element={<ProductionListPage />} />
                    <Route path="pontos" element={<OccupancyDashboard />} />
                    <Route path="agenda" element={<ScheduleCalendarPage />} />
                    <Route path="relatorios" element={<CommercialDashboard />} />
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
                    <Route path="financeiro/cobrancas/:id" element={<BillingDetailPage />} />
                    <Route path="acoes-centrais" element={<AcoesCentraisPage />} />
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
                    <Route path="central" element={<CentralDashboard />} />
                    <Route path="configuracoes" element={<Settings />} />
                    <Route path="perfil" element={<AdminUsers />} />
                    <Route path="assinaturas" element={<ContractsSignaturePage />} />
                    <Route path="portal-cliente" element={<CustomerPortalDashboard />} />
                    <Route path="mobile" element={<MobileDashboard />} />
                    <Route path="ia" element={<AIDashboard />} />
                  </Route>


                  {/* CUSTOMER PORTAL DEDICATED LAYER */}
                  <Route path="/portal" element={<RequireApproval><CustomerPortalLayout /></RequireApproval>}>
                    <Route index element={<CustomerPortalDashboard />} />
                    <Route path="contrato" element={<ContratoVigentePage />} />
                    <Route path="pontos" element={<MeusPontosPage />} />
                    <Route path="minha-rede" element={<MinhaRedePage />} />
                    <Route path="campanhas" element={<MinhasCampanhasPage />} />
                    <Route path="nova-campanha" element={<NovaCampanhaPage />} />
                    <Route path="insercoes" element={<InsercoesPorDiaPage />} />
                    <Route path="ocupacao" element={<OcupacaoRedePage />} />
                    <Route path="receita" element={<ReceitaHostPage />} />
                    <Route path="financeiro" element={<FinanceiroClientePage />} />
                    <Route path="produtos" element={<ProdutosPage />} />
                    <Route path="ofertas" element={<OfertasPage />} />
                    <Route path="expansao" element={<ExpansaoPage />} />
                    <Route path="brand-kit" element={<BrandKitPage />} />
                    <Route path="assets" element={<AssetLibraryPage />} />
                    <Route path="encarte" element={<EncartePage />} />
                    <Route path="biblioteca-ia" element={<BibliotecaIA />} />
                    <Route path="onboarding" element={<OnboardingPage />} />
                    <Route path="central" element={<CentralDashboard />} />
                    <Route path="playlists" element={<PlaylistsClientePage />} />
                    <Route path="equipe" element={<MinhaEquipePage />} />
                    <Route path="configuracoes" element={<ConfiguracoesPortalPage />} />
                  </Route>

                  <Route path="/device-pairing" element={<DevicePairingScreen />} />
                  <Route path="/player" element={<Player />} />
                  <Route path="/player/:screenId" element={<Player />} />
                  <Route path="/player/widget/:id" element={<WidgetPlayer />} />
                  <Route path="/player/link/:id" element={<LinkPlayer />} />
                  <Route path="/player/*" element={<Player />} />
                  <Route path="/player-demo" element={<WebPlayerDemo />} />
                  <Route path="/admin/solicitacoes/:id" element={<RequireApproval><AdminSolicitacaoAprovacao /></RequireApproval>} />

                  {/* FINANCEIRO STANDALONE (deep-linkable: /financeiro/cobrancas) */}
                  <Route path="/financeiro" element={<RequireApproval><CrmLayout /></RequireApproval>}>
                    <Route index element={<Navigate to="/financeiro/cobrancas" replace />} />
                    <Route path="cobrancas" element={<BillingDashboard />} />
                    <Route path="cobrancas/:id" element={<BillingDetailPage />} />
                  </Route>

                  {/* DASHBOARD ROUTES */}
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
                    <Route path="central" element={<CentralDashboard />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="admin/users" element={<AdminUsers />} />
                  </Route>

                  {/* UNIFIED CORPORATE WORKSPACE ROUTES */}
                  <Route path="/workspace" element={<RequireApproval><WorkspaceLayout /></RequireApproval>}>
                    <Route index element={<CorporateCommandCenter />} />
                    <Route path="corporate" element={<CorporateCommandCenter />} />
                    <Route path="representantes" element={<RepresentantesPage />} />
                    <Route path="representantes/desempenho" element={<DesempenhoRepresentantesPage />} />
                    <Route path="representantes/:id" element={<RepresentanteDetalhePage />} />
                    <Route path="clientes" element={<ClientesListPage />} />
                    <Route path="clientes/novo" element={<NovoClientePage />} />
                    <Route path="clientes/editar/:id" element={<EditarClientePage />} />
                    <Route path="clientes/:id" element={<ClienteDetalhePage />} />
                    <Route path="propostas" element={<PropostasListPage />} />
                     <Route path="contratos" element={<ContratosListPage />} />
                    <Route path="contratos/selecionar/:propostaId" element={<ContratoSelectionPage />} />
                    <Route path="pi" element={<PedidoInsercaoListPage />} />
                    <Route path="pi/novo/:contratoId" element={<PedidoInsercaoPage />} />
                    <Route path="pi/:piId" element={<PedidoInsercaoPage />} />
                    <Route path="campanhas" element={<ProductionListPage />} />
                    <Route path="campanhas/:producaoId" element={<ProductionDetailsPage />} />
                    <Route path="screens" element={<Screens />} />
                    <Route path="screens/:id" element={<ScreenDetails />} />
                    <Route path="agenda" element={<ScheduleCalendarPage />} />
                    <Route path="agenda/lista" element={<ScheduleListPage />} />
                    <Route path="agenda/:scheduleId" element={<ScheduleDetailsPage />} />
                    <Route path="playlists" element={<Playlists />} />
                    <Route path="financeiro" element={<FinanceExecutiveDashboard />} />
                    <Route path="financeiro/dre" element={<DREPage />} />
                    <Route path="financeiro/cobrancas" element={<BillingDashboard />} />
                    <Route path="financeiro/cobrancas/:id" element={<BillingDetailPage />} />
                    <Route path="financeiro/comissoes" element={<CommissionPage />} />
                    <Route path="bi" element={<BIExecutiveDashboard />} />
                    <Route path="noc" element={<NocDashboardPage />} />
                    <Route path="central" element={<CentralDashboard />} />
                    <Route path="media" element={<Medias />} />
                    <Route path="usuarios" element={<UsuariosAcessosPage />} />
                    <Route path="pontos-parceiros" element={<PontosParceirosPage />} />
                    <Route path="configuracoes" element={<Settings />} />
                    <Route path="perfil" element={<AdminUsers />} />
                    <Route path="marketing" element={<CommercialDashboard />} />
                    <Route path="operations" element={<OperationDashboard />} />
                  </Route>

                  {/* CATCH ALL */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </div>
          </CrmSessionProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;

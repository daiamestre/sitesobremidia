import { useState, lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

// ============================================================
// CHUNK RECOVERY — CAMADA B (P0 Repair)
// Detecta exclusivamente falhas de carregamento de chunk/módulo.
// Proteção anti-loop via sessionStorage 'sm_chunk_recovery'.
// Não altera localStorage, auth tokens, cookies ou estado de sessão.
// Erros lógicos/runtime NÃO ativam o reload — vão para ErrorBoundary.
// ============================================================
const SM_CHUNK_RECOVERY_KEY = 'sm_chunk_recovery';

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ChunkLoadError' ||
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Importing a module script failed') ||
    error.message.includes('Unable to preload CSS for') ||
    error.message.includes('error loading dynamically imported module')
  );
}

async function attemptSwUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.race([
      Promise.all(regs.map((r) => r.update())),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Timeout ou falha no update: prossegue para reload controlado.
  }
}

function lazyWithRetry(componentImport: () => Promise<any>) {
  return lazy(async () => {
    try {
      const component = await componentImport();
      sessionStorage.removeItem(SM_CHUNK_RECOVERY_KEY);
      return component;
    } catch (error: unknown) {
      if (!isChunkLoadError(error)) {
        throw error; // Erros não-chunk sobem direto para o ErrorBoundary.
      }
      const alreadyRetried = sessionStorage.getItem(SM_CHUNK_RECOVERY_KEY);
      if (alreadyRetried) {
        // Segunda falha consecutiva: propaga para ErrorBoundary sem reload.
        sessionStorage.removeItem(SM_CHUNK_RECOVERY_KEY);
        throw error;
      }
      // Primeira falha de chunk: marcar, atualizar SW e recarregar (1x por sessão).
      sessionStorage.setItem(SM_CHUNK_RECOVERY_KEY, '1');
      await attemptSwUpdate();
      window.location.reload();
      return new Promise<never>(() => {}); // Never resolves — reload acima ocorre primeiro.
    }
  });
}


// LAZY LOADED PAGES
const Index = lazyWithRetry(() => import("./pages/Index"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const ForgotPassword = lazyWithRetry(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const ChangePassword = lazyWithRetry(() => import("./pages/ChangePassword"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const DevicePairingScreen = lazyWithRetry(() => import("./pages/DevicePairingScreen"));
const PaginaCobranca = lazyWithRetry(() => import("./pages/PaginaCobranca"));
const RepresentantesAuth = lazyWithRetry(() => import("./pages/representantes/RepresentantesAuth"));
const WorkspaceLayout = lazyWithRetry(() => import("./modules/corporate/layout/WorkspaceLayout"));
const CorporateCommandCenter = lazyWithRetry(() => import("./modules/corporate/pages/CorporateCommandCenter"));
const UsuariosAcessosPage = lazyWithRetry(() => import("./modules/corporate/pages/UsuariosAcessosPage"));
const PontosParceirosPage = lazyWithRetry(() => import("./modules/corporate/pages/PontosParceirosPage"));
const CrmLayout = lazyWithRetry(() => import("./modules/crm/layout/CrmLayout"));
const CrmDashboardHome = lazyWithRetry(() => import("./modules/crm/pages/CrmDashboardHome"));
const RepresentativeDashboard = lazyWithRetry(() => import("./modules/crm/pages/RepresentativeDashboard"));
const NovaProspeccaoPage = lazyWithRetry(() => import("./modules/crm/pages/NovaProspeccaoPage"));
const PontoParceiroWizardPage = lazyWithRetry(() => import("./modules/crm/pages/prospeccao/PontoParceiroWizardPage"));
const GestorMidiiasProspeccaoPage = lazyWithRetry(() => import("./modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage"));
const RepresentantesPage = lazyWithRetry(() => import("./modules/crm/pages/RepresentantesPage"));
const DesempenhoRepresentantesPage = lazyWithRetry(() => import("./modules/crm/pages/DesempenhoRepresentantesPage"));
const RepresentanteDetalhePage = lazyWithRetry(() => import("./modules/crm/pages/RepresentanteDetalhePage"));
const ClientesListPage = lazyWithRetry(() => import("./modules/crm/pages/ClientesListPage"));
const NovoClientePage = lazyWithRetry(() => import("./modules/crm/pages/NovoClientePage"));
const NovoClienteWizardPage = lazyWithRetry(() => import("./modules/crm/pages/NovoClienteWizardPage"));
const ClienteDetalhePage = lazyWithRetry(() => import("./modules/crm/pages/ClienteDetalhePage"));
const EditarClientePage = lazyWithRetry(() => import("./modules/crm/pages/EditarClientePage"));
const PropostasListPage = lazyWithRetry(() => import("./modules/crm/pages/PropostasListPage"));
const ContratoSelectionPage = lazyWithRetry(() => import("./modules/crm/pages/ContratoSelectionPage"));
const ContratosListPage = lazyWithRetry(() => import("./modules/crm/pages/ContratosListPage"));
const PedidoInsercaoPage = lazyWithRetry(() => import("./modules/crm/pages/PedidoInsercaoPage"));
const PedidoInsercaoListPage = lazyWithRetry(() => import("./modules/crm/pages/PedidoInsercaoListPage"));
const ProductionListPage = lazyWithRetry(() => import("./modules/crm/pages/ProductionListPage"));
const ProductionDetailsPage = lazyWithRetry(() => import("./modules/crm/pages/ProductionDetailsPage"));
const ScheduleListPage = lazyWithRetry(() => import("./modules/crm/pages/ScheduleListPage"));
const ScheduleDetailsPage = lazyWithRetry(() => import("./modules/crm/pages/ScheduleDetailsPage"));
const ScheduleCalendarPage = lazyWithRetry(() => import("./modules/crm/pages/ScheduleCalendarPage"));
const OperationDashboard = lazyWithRetry(() => import("./modules/crm/pages/OperationDashboard"));
const NocDashboardPage = lazyWithRetry(() => import("./modules/crm/pages/NocDashboardPage"));
const FinanceDashboard = lazyWithRetry(() => import("./modules/crm/pages/FinanceDashboard"));
const ContasReceberPage = lazyWithRetry(() => import("./modules/crm/pages/ContasReceberPage"));
const CommissionPage = lazyWithRetry(() => import("./modules/crm/pages/CommissionPage"));
const CommissionsDashboard = lazyWithRetry(() => import("./modules/crm/pages/CommissionsDashboard"));
const CashFlowPage = lazyWithRetry(() => import("./modules/crm/pages/CashFlowPage"));
const CashFlowDashboard = lazyWithRetry(() => import("./modules/crm/pages/CashFlowDashboard"));
const GeneralLedgerPage = lazyWithRetry(() => import("./modules/crm/pages/GeneralLedgerPage"));
const CostCenterPage = lazyWithRetry(() => import("./modules/crm/pages/CostCenterPage"));
const InvoicesPage = lazyWithRetry(() => import("./modules/crm/pages/InvoicesPage"));
const FinanceExecutiveDashboard = lazyWithRetry(() => import("./modules/crm/pages/FinanceExecutiveDashboard"));
const BillingDashboard = lazyWithRetry(() => import("./modules/crm/pages/BillingDashboard"));
const BillingDetailPage = lazyWithRetry(() => import("./modules/crm/pages/BillingDetailPage"));
const CommissionRulesPage = lazyWithRetry(() => import("./modules/crm/pages/CommissionRulesPage"));
const DREPage = lazyWithRetry(() => import("./modules/crm/pages/DREPage"));
const ExecutiveDashboard = lazyWithRetry(() => import("./modules/crm/pages/ExecutiveDashboard"));
const CommercialDashboard = lazyWithRetry(() => import("./modules/crm/pages/CommercialDashboard"));
const FinanceDashboardEnterprise = lazyWithRetry(() => import("./modules/crm/pages/FinanceDashboardEnterprise"));
const OperationDashboardEnterprise = lazyWithRetry(() => import("./modules/crm/pages/OperationDashboardEnterprise"));
const OccupancyDashboard = lazyWithRetry(() => import("./modules/crm/pages/OccupancyDashboard"));
const BIExecutiveDashboard = lazyWithRetry(() => import("./modules/crm/pages/BIExecutiveDashboard"));
const CommercialAnalytics = lazyWithRetry(() => import("./modules/crm/pages/CommercialAnalytics"));
const FinancialAnalytics = lazyWithRetry(() => import("./modules/crm/pages/FinancialAnalytics"));
const OperationalAnalytics = lazyWithRetry(() => import("./modules/crm/pages/OperationalAnalytics"));
const OccupancyAnalytics = lazyWithRetry(() => import("./modules/crm/pages/OccupancyAnalytics"));
const ExecutiveScorecard = lazyWithRetry(() => import("./modules/crm/pages/ExecutiveScorecard"));
const ContractsSignaturePage = lazyWithRetry(() => import("./modules/crm/pages/ContractsSignaturePage"));
const ContratosAdminPage = lazyWithRetry(() => import("./modules/crm/pages/admin/ContratosAdminPage").then((m) => ({ default: m.ContratosAdminPage })));
const CustomerPortalDashboard = lazyWithRetry(() => import("./modules/crm/pages/CustomerPortalDashboard"));
const MobileDashboard = lazyWithRetry(() => import("./modules/crm/pages/MobileDashboard"));
const AcoesCentraisPage = lazyWithRetry(() => import("./modules/crm/pages/AcoesCentraisPage"));
const AIDashboard = lazyWithRetry(() => import("./modules/crm/pages/AIDashboard"));

// CUSTOMER PORTAL PAGES
const CustomerPortalLayout = lazyWithRetry(() => import("./modules/crm/layout/CustomerPortalLayout"));
const MeusPontosPage = lazyWithRetry(() => import("./modules/crm/pages/portal/MeusPontosPage"));
const MinhasCampanhasPage = lazyWithRetry(() => import("./modules/crm/pages/portal/MinhasCampanhasPage"));
const NovaCampanhaPage = lazyWithRetry(() => import("./modules/crm/pages/portal/NovaCampanhaPage"));
const MinhaRedePage = lazyWithRetry(() => import("./modules/crm/pages/portal/MinhaRedePage"));
const ReceitaHostPage = lazyWithRetry(() => import("./modules/crm/pages/portal/ReceitaHostPage"));
const FinanceiroClientePage = lazyWithRetry(() => import("./modules/crm/pages/portal/FinanceiroClientePage"));
const ContratoVigentePage = lazyWithRetry(() => import("./modules/crm/pages/portal/ContratoVigentePage"));
const InsercoesPorDiaPage = lazyWithRetry(() => import("./modules/crm/pages/portal/InsercoesPorDiaPage"));
const OcupacaoRedePage = lazyWithRetry(() => import("./modules/crm/pages/portal/OcupacaoRedePage"));
const ProdutosPage = lazyWithRetry(() => import("./modules/crm/pages/portal/ProdutosPage"));
const OfertasPage = lazyWithRetry(() => import("./modules/crm/pages/portal/OfertasPage"));
const OnboardingPage = lazyWithRetry(() => import("./modules/crm/pages/portal/OnboardingPage"));
const ExpansaoPage = lazyWithRetry(() => import("./modules/crm/pages/portal/ExpansaoPage"));
const BrandKitPage = lazyWithRetry(() => import("./modules/crm/pages/portal/BrandKitPage"));
const AssetLibraryPage = lazyWithRetry(() => import("./modules/crm/pages/portal/AssetLibraryPage"));
const EncartePage = lazyWithRetry(() => import("./modules/crm/pages/portal/EncartePage"));
const BibliotecaIA = lazyWithRetry(() => import("./modules/crm/pages/portal/BibliotecaIA"));
const PlaylistsClientePage = lazyWithRetry(() => import("./modules/crm/pages/portal/PlaylistsClientePage"));
const MinhaEquipePage = lazyWithRetry(() => import("./modules/crm/pages/portal/MinhaEquipePage"));
const ConfiguracoesPortalPage = lazyWithRetry(() => import("./modules/crm/pages/portal/ConfiguracoesPortalPage"));

const DashboardHome = lazyWithRetry(() => import("./pages/dashboard/DashboardHome"));
const Medias = lazyWithRetry(() => import("./pages/dashboard/Medias"));
const Playlists = lazyWithRetry(() => import("./pages/dashboard/Playlists"));
const Screens = lazyWithRetry(() => import("./pages/dashboard/Screens"));
const ScreenDetails = lazyWithRetry(() => import("./pages/dashboard/ScreenDetails"));
const Widgets = lazyWithRetry(() => import("./pages/dashboard/Widgets"));
const Schedule = lazyWithRetry(() => import("./pages/dashboard/Schedule"));
const ExternalLinks = lazyWithRetry(() => import("./pages/dashboard/ExternalLinks"));
const Analytics = lazyWithRetry(() => import("./pages/dashboard/Analytics"));
const History = lazyWithRetry(() => import("./pages/dashboard/History"));
const Reports = lazyWithRetry(() => import("./pages/dashboard/Reports"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Settings = lazyWithRetry(() => import("./pages/dashboard/Settings"));
const AdminUsers = lazyWithRetry(() => import("./pages/dashboard/AdminUsers"));
const MeuPerfilOwnerPage = lazyWithRetry(() => import("./pages/perfil/MeuPerfilOwnerPage"));
const MeuPerfilRepresentantePage = lazyWithRetry(() => import("./pages/perfil/MeuPerfilRepresentantePage"));
const MeuPerfilGestorPage = lazyWithRetry(() => import("./pages/perfil/MeuPerfilGestorPage"));
const MeuPerfilAnunciantePage = lazyWithRetry(() => import("./pages/perfil/MeuPerfilAnunciantePage"));
const Player = lazyWithRetry(() => import("./pages/Player"));
const WidgetPlayer = lazyWithRetry(() => import("./pages/WidgetPlayer"));
const LinkPlayer = lazyWithRetry(() => import("./pages/LinkPlayer"));
const WebPlayerDemo = lazyWithRetry(() => import("./components/player/WebPlayerDemo"));
const AdminSolicitacaoAprovacao = lazyWithRetry(() => import("./pages/admin/AdminSolicitacaoAprovacao"));
const CentralDashboard = lazyWithRetry(() => import("./pages/Central/CentralDashboard"));

const queryClient = new QueryClient();

// Loading Fallback
const PageLoader = () => (
  <div className="h-screen w-full flex items-center justify-center bg-background text-foreground">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

import { DashboardLayout } from "@/layouts/DashboardLayout";
import { RequireApproval, RequireRole } from "@/components/auth/RouteGuards";
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
              <div className="animate-in fade-in duration-300 w-full max-w-full min-w-0 overflow-x-clip box-border">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                  {/* PUBLIC ROUTES */}
                  <Route path="/" element={<Index />} />
                  {/* PUBLIC BILLING ROUTES (Humanized & Legacy Compatible) */}
                  <Route path="/cobranca/:estabelecimentoSlug/:faturaSlug/:codigo" element={<PaginaCobranca />} />
                  <Route path="/cobranca/:codigo/:identificador" element={<PaginaCobranca />} />
                  <Route path="/cobranca/:codigo" element={<PaginaCobranca />} />
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
                    <Route path="clientes/novo/anunciante" element={<NovoClienteWizardPage />} />
                    <Route path="clientes/editar/:id" element={<EditarClientePage />} />
                    <Route path="clientes/:id" element={<ClienteDetalhePage />} />
                    <Route path="propostas" element={<PropostasListPage />} />
                    <Route path="contratos" element={<ContratosListPage />} />
                    <Route path="admin/contratos" element={<RequireRole roles={['OWNER', 'ADMIN']}><ContratosAdminPage /></RequireRole>} />
                    <Route path="contratos/selecionar/:propostaId" element={<ContratoSelectionPage />} />
                    <Route path="contratos/selecionar/direto" element={<ContratoSelectionPage />} />

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
                    <Route path="perfil" element={<MeuPerfilRepresentantePage />} />
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
                    <Route path="perfil" element={<MeuPerfilAnunciantePage />} />
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
                    <Route path="perfil" element={<MeuPerfilGestorPage />} />
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
                    <Route path="clientes/novo/anunciante" element={<NovoClienteWizardPage />} />
                    <Route path="prospeccao" element={<NovaProspeccaoPage />} />
                    <Route path="prospeccao/ponto-parceiro" element={<PontoParceiroWizardPage />} />
                    <Route path="prospeccao/gestor" element={<GestorMidiiasProspeccaoPage />} />
                    <Route path="clientes/editar/:id" element={<EditarClientePage />} />
                    <Route path="clientes/:id" element={<ClienteDetalhePage />} />
                    <Route path="propostas" element={<PropostasListPage />} />
                     <Route path="contratos" element={<ContratosListPage />} />
                     <Route path="admin/contratos" element={<RequireRole roles={['OWNER', 'ADMIN']}><ContratosAdminPage /></RequireRole>} />
                     <Route path="assinaturas" element={<ContractsSignaturePage />} />
                    <Route path="contratos/selecionar/:propostaId" element={<ContratoSelectionPage />} />
                    <Route path="contratos/selecionar/direto" element={<ContratoSelectionPage />} />
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
                    <Route path="perfil" element={<MeuPerfilOwnerPage />} />
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

/**
 * F-230 — o menu de cada painel num lugar só: o painel (gestor/equipe e portal do anunciante) e o menu lateral do
 * SOBRE MÍDIA Studio leem daqui. Item novo no painel aparece no Studio sozinho, com as mesmas regras de perfil.
 */
import { useEffect, useState, type ComponentType } from 'react';
import {
  BadgePercent, Banknote, BarChart3, Bell, BookOpen, Bot, Briefcase, Building2, Calendar, Clapperboard, FileText, History,
  Home, Image, ImagePlus, Inbox, LayoutDashboard, LayoutGrid, Library, LifeBuoy, Link2, ListVideo, MapPin, Megaphone,
  MessageSquare, Monitor, Palette, Rocket, Settings, Shield, ShoppingBasket, Smartphone, Sparkles, Store, TrendingUp, UserCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCentralUnread } from '@/hooks/useCentral';
import { supabase } from '@/integrations/supabase/client';

export interface ItemDoMenu { icon: ComponentType<{ className?: string }>; label: string; path: string; badge?: number }

/** Itens fixos do painel do gestor (mesma ordem de sempre). */
export const ITENS_DO_GESTOR: ItemDoMenu[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  // F-219: SOBRE MÍDIA Studio para todos os perfis
  { icon: Clapperboard, label: 'Sobre Mídia Studio', path: '/studio' },
  // F-223: agente com IA grátis (relatórios, cobranças com confirmação, oportunidades)
  { icon: Bot, label: 'Trabalhar com IA', path: '/dashboard/ia' },
  { icon: Inbox, label: 'Central', path: '/dashboard/central' },
  { icon: Image, label: 'Minhas Mídias', path: '/dashboard/medias' },
  { icon: Library, label: 'Biblioteca de Mídias', path: '/dashboard/biblioteca' },
  { icon: Sparkles, label: 'Cartaz Digital', path: '/dashboard/tabloide' },
  { icon: ListVideo, label: 'Playlists', path: '/dashboard/playlists' },
  { icon: Monitor, label: 'Telas', path: '/dashboard/screens' },
  { icon: LayoutGrid, label: 'Widgets', path: '/dashboard/widgets' },
  { icon: Palette, label: 'Minha Marca', path: '/dashboard/marca' },
  { icon: Calendar, label: 'Agendamento', path: '/dashboard/schedule' },
  { icon: Link2, label: 'Links Externos', path: '/dashboard/links' },
  { icon: BarChart3, label: 'Analytics', path: '/dashboard/analytics' },
  { icon: History, label: 'Histórico', path: '/dashboard/history' },
  { icon: Calendar, label: 'Relatórios', path: '/dashboard/reports' },
];

/** Menu do gestor conforme o perfil: principal (com os extras de dono/ADM e Mensagens) e rodapé (Admin, Perfil, Configurações). */
export function menuDoGestor(o: { isAdmin: boolean; isOwner: boolean; perfilNome?: string | null; naoLidas: number }): { principal: ItemDoMenu[]; rodape: ItemDoMenu[] } {
  // F-109: telas de pontos parceiros — OWNER/ADMIN (perfil ou papel antigo)
  const donoOuAdm = o.isAdmin || o.isOwner || o.perfilNome === 'OWNER' || o.perfilNome === 'ADMIN';
  return {
    principal: [
      // F-170: Owner/ADM voltam ao painel principal (o mesmo que abre quando fazem login) acima do Dashboard do gestor
      ...(donoOuAdm ? [{ icon: Building2, label: 'Painel Principal', path: '/workspace/corporate' }] : []),
      ...ITENS_DO_GESTOR,
      // Central de Cobranças restrita a ADMIN/OWNER (mesma regra do módulo financeiro)
      ...(o.isAdmin || o.isOwner ? [{ icon: Banknote, label: 'Central de Cobranças', path: '/workspace/financeiro/cobrancas' }] : []),
      // F-116: estrutura de pontos parceiros só para OWNER/ADMIN (gestor não vê); abre a página nova de Telas
      ...(donoOuAdm
        ? [
            { icon: Store, label: 'Telas de pontos parceiros', path: '/dashboard/screens?secao=parceiros' },
            // F-119: a sala de pontos parceiros (cartões, edição completa, telas; "Novo Ponto Parceiro" = cadastro completo)
            { icon: Store, label: 'Pontos parceiros', path: '/dashboard/pontos-parceiros' },
            // F-200: launcher Sobre Mídia dos aparelhos (dono/ADM)
            { icon: Smartphone, label: 'Launcher', path: '/workspace/launcher' },
          ]
        : []),
      // MENSAGENS: entrada logo abaixo de BI & Relatórios (Relatórios) em todos os painéis
      { icon: Bell, label: 'Mensagens', path: '/dashboard/central', badge: o.naoLidas },
    ],
    rodape: [
      ...(o.isAdmin || o.isOwner ? [{ icon: Briefcase, label: 'Área Corporativa', path: '/workspace/corporate' }] : []),
      ...(o.isAdmin ? [{ icon: Shield, label: 'Admin', path: '/dashboard/admin/users' }] : []),
      { icon: UserCircle, label: 'Meu Perfil', path: '/dashboard/perfil' },
      { icon: Settings, label: 'Configurações', path: '/dashboard/settings' },
    ],
  };
}

/** Papel antigo "admin" (user_roles). */
export function useEhAdmin(): boolean {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    void supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle()
      .then(({ data }) => { if (vivo) setIsAdmin(!!data); });
    return () => { vivo = false; };
  }, [user]);
  return isAdmin;
}

/** Menu do painel do gestor/equipe para a pessoa logada. */
export function useMenuDoGestor() {
  const { isOwner, perfilNome } = useAuth();
  const isAdmin = useEhAdmin();
  const { total } = useCentralUnread();
  return { ...menuDoGestor({ isAdmin, isOwner, perfilNome, naoLidas: total }), isAdmin };
}

// ───────────────────────────── portal do anunciante / host
export type ModalidadeDoMenu = 'ANUNCIANTE' | 'HOST' | 'HIBRIDO';
export interface ItemDoPortal { name: string; path: string; icon: ComponentType<{ className?: string }>; badge?: number; somente?: ModalidadeDoMenu[] }
export interface GrupoDoPortal { label: string; items: ItemDoPortal[]; somente?: ModalidadeDoMenu[] }

/** Navegação do Portal (F-164: Início → Minhas Mídias → Publicidade → Meus Pontos → Comércio → Rede → Mensagens → Conta). */
export function gruposDoPortal(naoLidas: number): GrupoDoPortal[] {
  return [
    {
      label: 'Principal',
      items: [
        { name: 'Início', path: '/portal', icon: Home },
        // F-219: SOBRE MÍDIA Studio para todos (modelos prontos, edição, criação com IA e publicação)
        { name: 'Sobre Mídia Studio', path: '/studio', icon: Sparkles },
      ],
    },
    { label: 'Minhas Mídias', somente: ['ANUNCIANTE', 'HIBRIDO'], items: [{ name: 'Minhas Mídias', path: '/portal/assets', icon: ImagePlus }] },
    {
      label: 'Publicidade',
      somente: ['ANUNCIANTE', 'HIBRIDO'],
      items: [
        { name: 'Minhas Campanhas', path: '/portal/campanhas', icon: Megaphone },
        { name: 'Nova Campanha', path: '/portal/nova-campanha', icon: Rocket },
        { name: 'Inserções por Dia', path: '/portal/insercoes', icon: Calendar },
        { name: 'Playlists', path: '/portal/playlists', icon: ListVideo },
      ],
    },
    {
      label: 'Meus Pontos',
      somente: ['ANUNCIANTE', 'HIBRIDO'],
      items: [
        { name: 'Meus Pontos', path: '/portal/pontos', icon: MapPin },
        { name: 'Pontos para Anunciar', path: '/portal/pontos-parceiros', icon: TrendingUp },
      ],
    },
    {
      label: 'Comércio',
      somente: ['ANUNCIANTE', 'HIBRIDO'],
      items: [
        { name: 'Produtos', path: '/portal/produtos', icon: ShoppingBasket },
        { name: 'Ofertas', path: '/portal/ofertas', icon: BadgePercent },
        { name: 'Encarte Digital', path: '/portal/encarte', icon: BookOpen },
        { name: 'Cartaz Digital', path: '/portal/tabloide', icon: Sparkles },
      ],
    },
    {
      label: 'Rede (Host)',
      somente: ['HOST', 'HIBRIDO'],
      items: [
        { name: 'Minha Rede', path: '/portal/minha-rede', icon: MapPin },
        { name: 'Ocupação da Rede', path: '/portal/ocupacao', icon: LayoutDashboard },
        { name: 'Receita', path: '/portal/receita', icon: FileText },
      ],
    },
    {
      label: 'Mensagens e Contratos',
      items: [
        { name: 'Mensagens', path: '/portal/central', icon: MessageSquare, badge: naoLidas },
        { name: 'Contratos e Faturas', path: '/portal/financeiro', icon: FileText },
      ],
    },
    {
      label: 'Conta',
      items: [
        { name: 'Meu Perfil', path: '/portal/perfil', icon: Briefcase },
        { name: 'Suporte', path: '/portal/central?aba=suporte', icon: LifeBuoy },
        { name: 'Configurações', path: '/portal/configuracoes', icon: Settings },
      ],
    },
  ];
}

/** Grupos e itens que a modalidade do cliente pode ver (sem modalidade conhecida, mostra tudo — igual ao portal). */
export function gruposPermitidos(grupos: GrupoDoPortal[], modalidade: string | null | undefined): GrupoDoPortal[] {
  const pode = (s?: ModalidadeDoMenu[]) => !s || !modalidade || s.includes(modalidade as ModalidadeDoMenu);
  return grupos.filter((g) => pode(g.somente)).map((g) => ({ ...g, items: g.items.filter((i) => pode(i.somente)) })).filter((g) => g.items.length > 0);
}

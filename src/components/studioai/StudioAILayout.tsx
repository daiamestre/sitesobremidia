import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, Clapperboard, Coins, FolderKanban, Home, ImagePlay, LogOut, Menu, MonitorPlay, Play, Search, Settings, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { meuSaldo } from '@/lib/studioai/api';

/** Identidade SOBRE MÍDIA (roxos, amarelo e verde oficiais). */
export const COR = { escuro: '#22004A', roxo: '#5D1BFF', vibrante: '#8A2EFF', claro: '#B04DFF', amarelo: '#FFD400', verde: '#25D366' };

export function LogoStudio() {
  return (
    <Link to="/studio" className="flex shrink-0 items-center gap-2.5" aria-label="SOBRE MÍDIA Studio — início">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#B04DFF] via-[#8A2EFF] to-[#5D1BFF] shadow-[0_0_24px_rgba(138,46,255,0.55)]">
        <span className="text-2xl font-black italic leading-none text-white">S</span>
      </span>
      <span className="whitespace-nowrap leading-none">
        <span className="block text-lg font-black tracking-tight text-white">SOBRE MÍDIA</span>
        <span className="block text-[11px] font-bold tracking-[0.42em] text-[#B04DFF]">STUDIO</span>
      </span>
    </Link>
  );
}

/** Menu lateral do Studio (igual à referência): as entradas externas levam às páginas oficiais de cada perfil. */
function MenuLateral({ anunciante, onNavegar }: { anunciante: boolean; onNavegar?: () => void }) {
  const itens = [
    { nome: 'Início', to: '/studio', icone: Home, fim: true },
    { nome: 'Editor de vídeo', to: '/studio/video', icone: Clapperboard },
    { nome: 'Meus Projetos', to: '/studio/projetos', icone: FolderKanban },
    { nome: 'Criar com IA', to: '/studio/ia', icone: Sparkles },
    { nome: 'Minhas Mídias', to: anunciante ? '/portal/assets' : '/dashboard/medias', icone: ImagePlay },
    { nome: 'Telas Autorizadas', to: anunciante ? '/portal/pontos' : '/dashboard/screens', icone: MonitorPlay },
    { nome: 'Configurações', to: '/studio/configuracoes', icone: Settings },
  ];
  return (
    <nav className="flex h-full flex-col gap-1 p-4" aria-label="Menu do Studio">
      {itens.map((i) => (
        <NavLink key={i.nome} to={i.to} end={i.fim} onClick={onNavegar}
          className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition',
            isActive ? 'bg-gradient-to-r from-[#5D1BFF]/60 to-[#8A2EFF]/30 text-white shadow-[inset_0_0_0_1px_rgba(176,77,255,0.35)]' : 'text-slate-300 hover:bg-white/5 hover:text-white')}>
          <i.icone className="h-5 w-5" />{i.nome}
        </NavLink>
      ))}
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-[#8A2EFF]/40 bg-gradient-to-br from-[#5D1BFF]/50 via-[#22004A] to-[#22004A] p-5">
        <div aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rotate-45 bg-gradient-to-b from-[#B04DFF]/40 to-transparent" />
        <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#8A2EFF] text-white"><ImagePlay className="h-5 w-5" /></span>
        <p className="text-lg font-extrabold leading-tight text-white">Sua marca em todos os lugares</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">Crie, edite e publique suas artes em poucos cliques.</p>
        <Link to="/studio/configuracoes#tutorial" onClick={onNavegar} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#B04DFF]/70 px-4 py-2 text-sm font-semibold text-white hover:bg-[#8A2EFF]/30">
          <Play className="h-3.5 w-3.5" /> Ver tutorial
        </Link>
      </div>
    </nav>
  );
}

export function StudioAILayout() {
  const { usuario, signOut } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [params] = useSearchParams();
  const [busca, setBusca] = useState(params.get('busca') ?? '');
  const [menuAberto, setMenuAberto] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  const anunciante = !!saldo.data?.cliente;
  const primeiroNome = (usuario?.nome ?? 'Cliente').split(' ')[0];

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    navegar(`/studio${busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : ''}`);
  };

  return (
    <div className="min-h-screen bg-[#0B0420] text-slate-100" style={{ backgroundImage: 'radial-gradient(ellipse at 10% 0%, rgba(93,27,255,0.22), transparent 45%), radial-gradient(ellipse at 90% 100%, rgba(138,46,255,0.16), transparent 50%)' }}>
      <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-white/5 bg-[#0B0420]/85 px-4 backdrop-blur md:px-6">
        <button type="button" className="rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}><Menu className="h-5 w-5" /></button>
        <LogoStudio />
        <form onSubmit={buscar} className="mx-auto hidden min-w-0 w-full max-w-xl md:block" role="search">
          <label className="flex items-center rounded-full border border-[#8A2EFF]/50 bg-[#22004A]/60 px-5 py-2.5 shadow-[0_0_20px_rgba(93,27,255,0.25)] focus-within:border-[#B04DFF]">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busque por nome, categoria ou segmento..." aria-label="Buscar modelos"
              className="w-full bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none" />
            <button type="submit" aria-label="Buscar"><Search className="h-4 w-4 text-slate-300" /></button>
          </label>
        </form>
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <Link to="/studio/configuracoes" title="Créditos de criação com IA"
            className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#FFD400]/40 bg-[#FFD400]/10 px-3 py-1.5 text-xs font-bold text-[#FFD400] sm:flex">
            <Coins className="h-3.5 w-3.5" />{saldo.data ? (saldo.data.paga ? `${saldo.data.saldo} crédito${saldo.data.saldo === 1 ? '' : 's'}` : 'Uso interno') : '—'}
          </Link>
          <button type="button" className="rounded-full p-2 text-slate-300 hover:bg-white/5" aria-label="Notificações"><Bell className="h-5 w-5" /></button>
          <div className="relative">
            <button type="button" onClick={() => setContaAberta((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/5" aria-expanded={contaAberta}>
              {usuario?.avatar_url
                ? <img src={usuario.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#8A2EFF] to-[#5D1BFF] text-sm font-bold">{primeiroNome.slice(0, 1)}</span>}
              <span className="hidden whitespace-nowrap text-left text-xs leading-tight xl:block"><span className="block text-slate-200">Olá, {primeiroNome}</span><span className="text-slate-400">Minha Conta</span></span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 xl:block" />
            </button>
            {contaAberta && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#1a0b3d] py-1 text-sm shadow-xl" onMouseLeave={() => setContaAberta(false)}>
                <Link to={anunciante ? '/portal' : '/dashboard'} className="block px-4 py-2 text-slate-200 hover:bg-white/5">Voltar ao painel</Link>
                <Link to="/studio/configuracoes" className="block px-4 py-2 text-slate-200 hover:bg-white/5">Créditos e configurações</Link>
                <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-2 px-4 py-2 text-left text-rose-300 hover:bg-white/5"><LogOut className="h-4 w-4" />Sair</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[230px] shrink-0 overflow-y-auto border-r border-white/5 lg:block">
          <MenuLateral anunciante={anunciante} />
        </aside>
        {menuAberto && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" className="absolute inset-0 bg-black/60" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />
            <div className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-[#12062e]">
              <div className="flex items-center justify-between border-b border-white/5 p-4"><LogoStudio /><button type="button" aria-label="Fechar" onClick={() => setMenuAberto(false)}><X className="h-5 w-5" /></button></div>
              <form onSubmit={(e) => { buscar(e); setMenuAberto(false); }} className="p-4 pb-0" role="search">
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar modelos..." aria-label="Buscar modelos" className="w-full rounded-full border border-[#8A2EFF]/50 bg-[#22004A]/60 px-4 py-2 text-sm text-white placeholder:text-slate-400" />
              </form>
              <MenuLateral anunciante={anunciante} onNavegar={() => setMenuAberto(false)} />
            </div>
          </div>
        )}
        <main className="min-w-0 flex-1 p-4 md:p-5" key={local.pathname.split('/')[2] ?? 'inicio'}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

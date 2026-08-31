// ──────────────────────────────────────────────────────────────────────
// CLIENT TYPE GATE — GATE 6.7
// Porta ÚNICA de entrada para criação de cadastros.
// Todos os perfis (OWNER, ADM, REPRESENTANTE) devem obrigatoriamente
// passar por esta triagem antes de qualquer wizard.
// Não concede autorização — apenas determina O QUE cadastrar.
// Autorização continua no RBAC/capabilities.
// Tipos explícitos: ANUNCIANTE | PONTO_PARCEIRO | GESTOR_MIDIAS
// ──────────────────────────────────────────────────────────────────────
import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Store, MonitorPlay, ChevronRight } from 'lucide-react';

export type ClientType = 'ANUNCIANTE' | 'PONTO_PARCEIRO' | 'GESTOR_MIDIAS';

interface GateOption {
  tipo: ClientType;
  titulo: string;
  descricao: string;
  detalhe: string;
  cta: string;
  icone: React.ComponentType<{ className?: string }>;
  corIcone: string;
  corBotao: string;
}

const OPCOES: GateOption[] = [
  {
    tipo: 'ANUNCIANTE',
    titulo: 'ANUNCIANTE',
    descricao: 'Cliente que deseja anunciar na rede SOBRE MÍDIA.',
    detalhe: 'Wizard completo: empresa, contato, negociação e seleção de pontos parceiros.',
    cta: 'Cadastrar anunciante',
    icone: User,
    corIcone: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
    corBotao: 'bg-purple-600 hover:bg-purple-700',
  },
  {
    tipo: 'PONTO_PARCEIRO',
    titulo: 'PONTO PARCEIRO',
    descricao: 'Estabelecimento que poderá receber nossas telas.',
    detalhe: 'Identificação, endereço, telas, público, fotos e modelo comercial (permuta/comissionado).',
    cta: 'Cadastrar ponto parceiro',
    icone: Store,
    corIcone: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
    corBotao: 'bg-emerald-600 hover:bg-emerald-700',
  },
  {
    tipo: 'GESTOR_MIDIAS',
    titulo: 'GESTOR DE MÍDIAS',
    descricao: 'Pessoa ou empresa ligada à gestão de mídia.',
    detalhe: 'Cria acesso oficial com senha inicial automática e troca obrigatória no primeiro login.',
    cta: 'Cadastrar gestor',
    icone: MonitorPlay,
    corIcone: 'text-sky-400 bg-sky-500/20 border-sky-500/30',
    corBotao: 'bg-sky-600 hover:bg-sky-700',
  },
];

function resolveBasePath(pathname: string): string {
  return pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
}

function destinationFor(tipo: ClientType, basePath: string): string {
  switch (tipo) {
    case 'ANUNCIANTE':
      return `${basePath}/clientes/novo/anunciante`;
    case 'PONTO_PARCEIRO':
      return `${basePath}/prospeccao/ponto-parceiro`;
    case 'GESTOR_MIDIAS':
      return `${basePath}/prospeccao/gestor`;
    default:
      return `${basePath}/clientes/novo`;
  }
}

export function ClientTypeGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = resolveBasePath(location.pathname);
  const [pending, setPending] = useState<ClientType | null>(null);

  const handleSelect = useCallback((tipo: ClientType) => {
    if (pending) return; // double-click guard
    setPending(tipo);
    const dest = destinationFor(tipo, basePath);
    // Persiste tipo explícito no state de navegação + query para refresh consistency
    navigate(dest, { state: { clientType: tipo } });
    // release guard after navigation; timeout fallback in case navigation fails
    setTimeout(() => setPending(null), 1500);
  }, [pending, basePath, navigate]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <h1 className="text-2xl font-bold text-white">NOVO CADASTRO</h1>
        <p className="text-slate-400 text-sm mt-1">
          O que você deseja cadastrar? Escolha o tipo de prospecção para iniciar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OPCOES.map((op) => {
          const Icon = op.icone;
          const isPending = pending === op.tipo;
          const disabled = pending !== null;
          return (
            <div
              key={op.tipo}
              className="rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6 flex flex-col gap-4 hover:border-primary/30 transition-all"
            >
              <div className={`h-14 w-14 rounded-2xl border flex items-center justify-center ${op.corIcone}`}>
                <Icon className="h-7 w-7" />
              </div>
              <div className="flex-1 space-y-2">
                <h2 className="text-lg font-bold text-white tracking-wide">{op.titulo}</h2>
                <p className="text-sm text-slate-300">{op.descricao}</p>
                <p className="text-xs text-slate-500">{op.detalhe}</p>
              </div>
              <button
                onClick={() => handleSelect(op.tipo)}
                disabled={disabled}
                aria-label={op.cta}
                className={`w-full py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors ${op.corBotao} disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {isPending ? 'Abrindo...' : op.cta} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ClientTypeGate;

import { useNavigate } from 'react-router-dom';
import { User, Store, MonitorPlay, ChevronRight } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────
// NOVO CADASTRO — Central de Prospecção do REPRESENTANTE (missão §5)
// Três tipos de prospecção. Cada card direciona ao fluxo correto:
//   ANUNCIANTE      → wizard comercial existente (preservado)
//   PONTO PARCEIRO  → wizard próprio da tabela central `pontos`
//   GESTOR DE MÍDIAS→ provisionamento oficial (senha automática)
// ──────────────────────────────────────────────────────────────────────

const OPCOES = [
  {
    tipo: 'anunciante' as const,
    icone: User,
    titulo: 'ANUNCIANTE',
    descricao: 'Cliente que deseja anunciar na rede SOBRE MÍDIA',
    detalhe: 'Wizard completo: empresa, contato, negociação e seleção de pontos parceiros.',
    cta: 'Cadastrar anunciante',
    destino: '/representantes/clientes/novo',
    corIcone: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
    corBotao: 'bg-purple-600 hover:bg-purple-700',
  },
  {
    tipo: 'ponto' as const,
    icone: Store,
    titulo: 'PONTO PARCEIRO',
    descricao: 'Estabelecimento que poderá receber nossas telas',
    detalhe: 'Identificação, endereço, telas, público, fotos e modelo comercial (permuta/comissionado).',
    cta: 'Cadastrar ponto parceiro',
    destino: '/representantes/prospeccao/ponto-parceiro',
    corIcone: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
    corBotao: 'bg-emerald-600 hover:bg-emerald-700',
  },
  {
    tipo: 'gestor' as const,
    icone: MonitorPlay,
    titulo: 'GESTOR DE MÍDIAS',
    descricao: 'Pessoa ou empresa ligada à gestão de mídia',
    detalhe: 'Cria acesso oficial com senha inicial automática e troca obrigatória no primeiro login.',
    cta: 'Cadastrar gestor',
    destino: '/representantes/prospeccao/gestor',
    corIcone: 'text-sky-400 bg-sky-500/20 border-sky-500/30',
    corBotao: 'bg-sky-600 hover:bg-sky-700',
  },
];

export default function NovaProspeccaoPage() {
  const navigate = useNavigate();

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
                onClick={() => navigate(op.destino)}
                className={`w-full py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors ${op.corBotao}`}
              >
                {op.cta} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

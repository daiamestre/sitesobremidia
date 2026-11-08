// SOBRE MÍDIA — REGISTRO CENTRAL DOS AGENTES DO PRODUTO (MG-AUT-03/04, F-265).
// Fonte única e VERIFICÁVEL: src/tests/unit/registroDeAgentes265.test.ts confere que cada agente aqui existe de verdade
// no código (tipo RegistroAgente do Studio, ferramentas do agente-ia, etapas do orquestrador), e que nenhum agente do
// código fica fora daqui. Agentes do produto ≠ skills do Claude Code (.claude/skills) ≠ governança Antigravity (.agents/).
// Regras (dono): nenhum agente cria outro agente nem muda as próprias regras; o acesso é sempre o do LOGIN de quem pediu
// (o banco decide); ação com efeito só com confirmação humana; pago nunca em silêncio.
import { VERSAO_DNA } from '../studio/core/dna.ts';
import { VERSAO_BIBLIA } from '../studio/biblia.ts';

export type Nivel = 1 | 2 | 3; // 1 automático · 2 confirmação humana · 3 autorização especial (fora dos agentes)
export type Motor = 'agente-ia' | 'studio-orquestrador' | 'studio-ai' | 'montagem-actions';

export interface ContratoDeExecucao {
  /** onde a tarefa é registrada (estado, retomada e auditoria) */
  tarefa: string;
  estados: string[];
  /** como a mesma tarefa não roda duas vezes nem cobra duas vezes */
  idempotencia: string;
  retomada: string;
  aprovacao: string;
  custo: string;
}

export interface Agente {
  id: string;
  nome: string;
  motor: Motor;
  versao: string;
  finalidade: string;
  ferramentas: string[];
  proibido: string[];
  escopo: string;
  provedores: string[]; // ids de supabase/functions/_shared/ia/provedores.ts ('local' = sem IA)
  limites: string;
  nivel: Nivel;
  qualidade: string;
  falha: string;
  auditoria: string;
}

const V_STUDIO = `${VERSAO_BIBLIA}+${VERSAO_DNA}`;
const TEXTO_GRATIS = ['groq-texto', 'gemini-texto', 'openrouter-texto', 'cf-llama4-scout'];

export const CONTRATOS: Record<'agente-ia' | 'studio-orquestrador', ContratoDeExecucao> = {
  'agente-ia': {
    tarefa: 'agente_ia_registros (pergunta, provedor, ferramentas, ms) + agente_ia_acoes (ação proposta)',
    estados: ['PENDENTE', 'EXECUTADA', 'CANCELADA', 'FALHA', 'EXPIRADA'], // agente_ia_acoes.status (CHECK do banco)
    idempotencia: 'ação proposta tem id; confirmar duas vezes executa uma vez (só PENDENTE executa)',
    retomada: 'conversa sem estado no servidor; o histórico vem do navegador (últimas 10 mensagens)',
    aprovacao: 'toda ação com efeito vira PROPOSTA e só executa no botão Confirmar do próprio usuário',
    custo: 'só IA de texto grátis (Groq → Gemini → OpenRouter); sem fallback pago',
  },
  'studio-orquestrador': {
    tarefa: 'studio_producoes (pedido e estado) + studio_etapas (cada agente: modelo, versão, custo, tentativas)',
    // studio_producoes.estado (CHECK do banco). Equivalência com o Projeto Mestre: RECEIVED=recebido, PLANNING=planejando,
    // WAITING_APPROVAL=aguardando_*, RUNNING=gerando_imagens/montando, QUALITY_CHECK=conferindo, COMPLETED=pronto/entregue,
    // FAILED=erro/reprovado, CANCELLED=cancelado; VALIDATING/QUEUED acontecem dentro de studio_criar_producao e do lease.
    estados: ['recebido', 'planejando', 'aguardando_aprovacao_plano', 'gerando_imagens', 'aguardando_aprovacao_imagens',
      'montando', 'conferindo', 'pronto', 'entregue', 'reprovado', 'erro', 'cancelado'],
    idempotencia: 'studio_etapas.idempotencia = producao:versao_do_plano:chave (etapa feita não repete nem cobra de novo)',
    retomada: 'lease de 4 min (processando_ate); o cron a cada minuto retoma de onde parou',
    aprovacao: 'plano, imagens e montagem só avançam com o clique do dono da produção (funções studio_* do banco)',
    custo: 'neurons da cota grátis da Cloudflare; imagem paga só com STUDIO_PERMITIR_IMAGEM_PAGA=1; cota diária por empresa (studio_minha_cota)',
  },
};

export const AGENTES: Agente[] = [
  {
    id: 'agente-ia', nome: 'Central de Comando ("Trabalhar com IA")', motor: 'agente-ia', versao: 'agente-ia.v2',
    finalidade: 'conversa em linguagem natural: consulta telas, cobranças e clientes; propõe cobrança; pede produções ao Studio; monta o encarte/palco oficial; transforma arte em vídeo',
    ferramentas: ['relatorio_telas', 'resumo_financeiro', 'listar_cobrancas', 'buscar_cliente', 'oportunidades', 'propor_cobranca',
      'criar_producao', 'listar_producoes', 'situacao_da_producao', 'montar_encarte', 'listar_minhas_artes', 'animar_arte'],
    proibido: ['marcar pagamento como pago', 'assinar contrato', 'mudar permissão', 'publicar em tela', 'promover Player', 'usar chave mestra para ler dados'],
    escopo: 'login do usuário (RLS) + agente_ia_escopo(): cobrança só OWNER/ADMIN/FINANCEIRO; produção pela regra do Studio (studio_ai_escopo)',
    provedores: ['groq-texto', 'gemini-texto', 'openrouter-texto'], limites: 'até 6 rodadas de ferramenta por pergunta; 110 s; 14 kB por resposta de ferramenta',
    nivel: 2, qualidade: 'responde só com dados das ferramentas; sem dado, diz que não há', falha: 'provedor cai → próximo grátis; todos caem → mensagem de indisponível',
    auditoria: 'agente_ia_registros; financeiro_auditoria na cobrança; studio_etapas (usuario:criar) na produção',
  },
  { id: 'core', nome: 'Creative Core', motor: 'studio-orquestrador', versao: VERSAO_DNA,
    finalidade: 'segmento, briefing, direção de arte, roteamento, prompts e conferência do plano',
    ferramentas: ['reconhecerSegmento', 'direcaoLocal', 'refino por IA de texto', 'conferir'], proibido: ['escrever preço em prompt', 'termos de outro segmento', 'marca não informada'],
    escopo: 'produção do próprio usuário', provedores: TEXTO_GRATIS, limites: 'refino só entra se passar nas regras', nivel: 1,
    qualidade: 'conferir() do Core', falha: 'IA fora → core-local', auditoria: 'studio_etapas (agente core)' },
  { id: 'core-local', nome: 'Creative Core sem IA', motor: 'studio-orquestrador', versao: VERSAO_DNA,
    finalidade: 'plano completo quando as IAs não respondem', ferramentas: ['planoLocal'], proibido: ['chamar provedor'],
    escopo: 'produção do próprio usuário', provedores: ['local'], limites: 'determinístico', nivel: 1, qualidade: 'mesmo conferir()',
    falha: 'não depende de rede', auditoria: 'studio_etapas (agente core-local)' },
  { id: 'produtos', nome: 'Analista de produto (visão)', motor: 'studio-orquestrador', versao: V_STUDIO,
    finalidade: 'lê a foto do produto enviada', ferramentas: ['analisarProduto'], proibido: ['inventar marca ou embalagem'],
    escopo: 'fotos da própria produção', provedores: ['cf-llama4-scout-visao'], limites: '3 tentativas', nivel: 1,
    qualidade: 'validação do JSON de saída', falha: 'FalhaDoAgente → produção falha com motivo', auditoria: 'studio_etapas' },
  { id: 'diretor', nome: 'Diretor criativo', motor: 'studio-orquestrador', versao: V_STUDIO, finalidade: 'direção de arte',
    ferramentas: ['diretorCriativo'], proibido: ['estilo fora do segmento'], escopo: 'produção', provedores: TEXTO_GRATIS, limites: '3 tentativas',
    nivel: 1, qualidade: 'estilos do segmento', falha: 'FalhaDoAgente', auditoria: 'studio_etapas' },
  { id: 'roteirista', nome: 'Roteirista', motor: 'studio-orquestrador', versao: V_STUDIO, finalidade: 'cenas, textos e duração',
    ferramentas: ['roteirista', 'normalizarDuracoes'], proibido: ['inventar preço ou condição'], escopo: 'produção', provedores: TEXTO_GRATIS,
    limites: 'duração exata do pedido', nivel: 1, qualidade: 'soma das cenas = duração', falha: 'FalhaDoAgente', auditoria: 'studio_etapas' },
  { id: 'fotografia', nome: 'Diretor de fotografia', motor: 'studio-orquestrador', versao: V_STUDIO, finalidade: 'câmera, lente e luz',
    ferramentas: ['diretorFotografia'], proibido: [], escopo: 'produção', provedores: TEXTO_GRATIS, limites: '3 tentativas', nivel: 1,
    qualidade: 'câmeras do contrato (CAMERAS)', falha: 'FalhaDoAgente', auditoria: 'studio_etapas' },
  { id: 'prompts', nome: 'Especialista em prompts', motor: 'studio-orquestrador', versao: V_STUDIO, finalidade: 'prompt do gerador de imagem',
    ferramentas: ['especialistaPrompts', 'ajustarPrompt'], proibido: ['texto, logos ou preço na imagem'], escopo: 'produção', provedores: TEXTO_GRATIS,
    limites: '3 tentativas', nivel: 1, qualidade: 'conferir() exige "no logos"', falha: 'FalhaDoAgente', auditoria: 'studio_etapas' },
  { id: 'imagem', nome: 'Gerador de cenários', motor: 'studio-orquestrador', versao: 'flux-1-schnell', finalidade: 'cenário sem produto, sem texto',
    ferramentas: ['gerarCenario', 'enviarAoR2'], proibido: ['modelo pago sem STUDIO_PERMITIR_IMAGEM_PAGA=1'], escopo: 'produção',
    provedores: ['cf-flux-schnell'], limites: 'cota diária de imagens (studio_minha_cota)', nivel: 1, qualidade: 'aprovação humana por cena',
    falha: 'cota acabou → aguarda; sem fallback pago', auditoria: 'studio_etapas (neurons, custo)' },
  { id: 'montagem', nome: 'Montagem (FFmpeg + Playwright)', motor: 'montagem-actions', versao: 'montar.v1',
    finalidade: 'MP4 H.264 ou artes PNG com preço por código', ferramentas: ['scripts/studio/montar.mjs', 'studio-montar.yml'],
    proibido: ['alterar preço', 'WebM para o Player'], escopo: 'x-studio-segredo + dados da produção', provedores: ['gh-actions-ffmpeg'],
    limites: '30 min por execução; 40 min sem resposta = falha', nivel: 2, qualidade: 'conferência: codec, resolução, duração, pixel, tamanho',
    falha: 'montagem_falhou → produção falha com motivo', auditoria: 'studio_etapas (montagem)' },
  { id: 'qualidade', nome: 'Controle de qualidade', motor: 'montagem-actions', versao: 'montar.v1', finalidade: 'aprova ou reprova o arquivo final',
    ferramentas: ['ffprobe', 'conferência do preço'], proibido: ['aprovar sem conferir'], escopo: 'produção', provedores: ['local'],
    limites: 'determinístico', nivel: 1, qualidade: 'reprovado nunca é entregue', falha: 'reprova com motivo', auditoria: 'studio_etapas (qualidade)' },
  { id: 'analista-referencias', nome: 'Analista de referências (Criar com IA)', motor: 'studio-ai', versao: 'studio_agentes (banco, versionado)',
    finalidade: 'lê uma imagem de referência e escreve o prompt', ferramentas: ['analisar_referencia'], proibido: ['gerar sem crédito'],
    escopo: 'login do usuário (studio_ai_escopo)', provedores: ['cf-llama4-scout-visao'], limites: '1 crédito por geração (R$ 4,99), devolvido se falhar',
    nivel: 2, qualidade: 'validarAnalise', falha: 'crédito devolvido (varrer)', auditoria: 'studio_ai_jobs, studio_ai_movimentos' },
];

/** Agentes planejados no Projeto Mestre que NÃO existem (não declarar como implementados). */
export const PLANEJADOS = ['personagens', 'marketing (calendário de campanhas)', 'logos 3D por agente', 'operações com escrita', 'JARVIS'];

export const agentePorId = (id: string) => AGENTES.find((a) => a.id === id) ?? null;

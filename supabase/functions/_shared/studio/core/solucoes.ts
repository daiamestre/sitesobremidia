// SOBRE MÍDIA — LIVRO DE SOLUÇÕES (F-276). Regra do dono (09/11/2026): tudo o que já foi resolvido vira referência de aprendizado
// do sistema e dos agentes, com a ORDEM DAS ALTERNATIVAS para que a tarefa sempre dê certo.
// Fonte da verdade: este arquivo (Git). Vai para a memória dos agentes (studio_conhecimento, escopo global, tipo 'referencia',
// chave 'livro-de-solucoes') pela semente: node scripts/studio/semear-conhecimento.mjs. Ao resolver algo novo: acrescente aqui,
// suba VERSAO_LIVRO e rode a semente. Detalhes técnicos de cada caso: docs/engineering/FINDINGS_LEDGER.md (F-NN).

export const VERSAO_LIVRO = 'LS-1 (09/11/2026)';

export interface Solucao {
  id: string;
  /** o que a pessoa ou o sistema quer conseguir */
  objetivo: string;
  /** como se percebe que o caminho principal falhou */
  sinais: string[];
  /** caminhos em ordem: se um falhar, vai para o próximo; o último nunca deixa a tarefa sem resultado */
  alternativas: string[];
  /** o que NUNCA fazer (limites do dono e da lei) */
  nunca?: string[];
  /** onde está no código / no histórico */
  referencia: string;
}

export const LIVRO_DE_SOLUCOES: Solucao[] = [
  {
    id: 'foto-do-produto',
    objetivo: 'Todo produto do encarte com a foto OFICIAL da embalagem, sem fundo, no padrão profissional.',
    sinais: ['produto sem foto', 'foto de outro produto', 'foto com fundo'],
    alternativas: [
      '1) código de barras (EAN) no catálogo da empresa: produto exato, instantâneo',
      '2) catálogo de fotos oficiais por nome, marca e peso (site oficial da marca, servido por LINK pelo passa-foto, sem cópia)',
      '3) 2ª fonte oficial: a mesma foto do fabricante publicada pelas grandes lojas (farmácias, supermercados, adegas) — marca-varejo.mjs',
      '4) busca aberta: Open Food Facts e família pelo código, Wikimedia, Openverse, bancos de imagens (conferidos pela IA de visão)',
      '5) imagem criada pela IA (o cliente sempre pode trocar a foto)',
      'Há várias opções parecidas e o texto não diz qual: perguntar sabor/peso (nunca chutar)',
    ],
    nunca: ['contornar robots.txt ou bloqueio de site', 'usar foto de remédio que pede receita no encarte de farmácia'],
    referencia: 'src/lib/tabloide/imagens.ts (completarImagens); F-231, F-256, F-272, F-274, F-275',
  },
  {
    id: 'tirar-o-fundo',
    objetivo: 'Tirar o fundo de qualquer foto de produto com qualidade profissional (padrão remove.bg/Canva), sempre.',
    sinais: ['cota da Cloudflare Images acabou (5.000 transformações/mês)', 'link s=1 chegou com fundo', 'recorte reprovado'],
    alternativas: [
      '1) foto já transparente: só corta as sobras (pngSemSobras)',
      '2) Cloudflare Images (BiRefNet) pelo passa-foto ou pela ação recortar',
      '3) fundo liso (foto de loja): recorte instantâneo no navegador (recortarFundo), mesma inspeção',
      '4) REMOVEDOR DE FUNDO SOBRE MÍDIA: IA BiRefNet (MIT) no navegador, para qualquer fundo (removedorDeFundo.ts)',
      'Todo recorte passa por finalizarRecorte (inspeção + acabamento) e pela IA de visão; reprovado nunca é entregue',
      'Selo de propaganda solto acima/abaixo da embalagem sai do recorte (apagarSelosSoltos)',
    ],
    referencia: 'src/lib/tabloide/imagens.ts (prepararImagem), recorte.ts, removedorDeFundo.ts; F-252, F-253, F-275, F-276',
  },
  {
    id: 'espaco-e-custo-das-fotos',
    objetivo: 'Ter dezenas de milhares de fotos sem passar dos 10 GB grátis do R2 e sem custo.',
    sinais: ['R2 perto de 10 GB', 'cópias de fotos de marca no armazenamento'],
    alternativas: [
      '1) foto POR LINK: o catálogo guarda só o endereço do passa-foto (Worker /foto), nada é copiado',
      '2) fotos da pesquisa ficam só no PC (pastas ../marcas*), nunca no R2',
      '3) cota de transformações: o pipeline recorta e confere NO PC (marca-recortar-local.mjs) e não gasta a cota; a cota fica para o uso real',
    ],
    nunca: ['apagar cópia antiga do R2 sem conferir que nenhum projeto usa'],
    referencia: 'scripts/ops/catalogo-por-link.mjs, passa-foto.mjs, marca-recortar-local.mjs; F-272, F-273, F-275',
  },
  {
    id: 'site-bloqueia-leitura',
    objetivo: 'Conseguir a foto oficial quando o site do fabricante/laboratório recusa leitura automática.',
    sinais: ['robots.txt proíbe', 'resposta 403', 'loja estruturada não abre'],
    alternativas: [
      '1) loja oficial da marca em outra plataforma (Shopify/VTEX/WooCommerce) — marca-loja.mjs',
      '2) a mesma foto oficial publicada por farmácias e supermercados que permitem leitura — marca-varejo.mjs',
      '3) site de grupo/fabricante com várias marcas — marca-gravar-grupo.mjs',
      '4) no encarte: código de barras na base aberta; por último imagem criada pela IA',
    ],
    nunca: ['burlar robots.txt, CAPTCHA ou bloqueio — é ilegal/indevido e expõe a empresa; sempre a próxima alternativa'],
    referencia: 'scripts/ops/marca-loja.mjs, marca-varejo.mjs; F-274, F-275',
  },
  {
    id: 'qualidade-do-catalogo',
    objetivo: 'Catálogo só com embalagem certa: sem kit, combo, brinde, foto genérica ou remédio com receita.',
    sinais: ['mesma foto em vários produtos', 'kit/combo/fardo no nome', '"venda sob prescrição" na foto'],
    alternativas: [
      'filtro de nome (kit, combo, fardo, brinde, roupa) antes de baixar',
      'remédio com receita (campo da loja) fica de fora',
      'foto igual em 3+ produtos diferentes = foto genérica da loja, recusada',
      'folha de conferência visual (marca-conferir.mjs) por amostra',
    ],
    referencia: 'scripts/ops/marca-varejo.mjs, marca-varejo-lote.mjs; F-274, F-275',
  },
  {
    id: 'balao-e-edicao',
    objetivo: 'Encarte no padrão do dono.',
    sinais: ['balão com texto desalinhado', 'elemento que não dá para editar'],
    alternativas: ['balão só por ESTILOS_DE_BALAO, texto e valor centralizados', 'todo elemento editável (mover, girar, trocar, cor, fonte, movimento, logo, produto)'],
    referencia: 'src/lib/studio/palco.ts; components/studio/editor; regraBaloesCentralizados.test.ts, studioEdicaoCompleta249.test.ts',
  },
  {
    id: 'player-e-telas',
    objetivo: 'Telas sempre exibindo, sem quebrar o Player comercial.',
    sinais: ['tela preta', 'não sincroniza', 'login não funciona'],
    alternativas: [
      'Player 5.7.10 é o comercial; APK novo só como teste; contrato-player.mjs antes e depois de mexer no banco',
      'tela preta: provar por captura; reiniciar motor só por reiniciarMotorDeVideo()',
      'reproduzir no emulador (TVBox_API25 para Android 7.1) antes de publicar',
    ],
    referencia: 'docs/PLAYER_REFERENCIA.md, docs/OPERACAO_DO_SISTEMA.md',
  },
  {
    id: 'publicar-sem-custo',
    objetivo: 'Publicar correções sem passar do plano grátis.',
    sinais: ['muitos envios no dia', 'função nova em api/'],
    alternativas: ['juntar correções num envio só', 'publicar só com scripts/ops/publicar-main.mjs (teto diário)', 'nunca criar função nova em api/'],
    referencia: 'CLAUDE.md, scripts/ops/README.md',
  },
];

/** Texto curto para o contexto dos agentes (cada solução em uma linha, alternativas na ordem). */
export function resumoDoLivro(): string {
  return `Livro de soluções SOBRE MÍDIA ${VERSAO_LIVRO} — se o caminho principal falhar, siga a próxima alternativa; nunca deixe a tarefa sem resultado e nunca faça o que está em "nunca":\n`
    + LIVRO_DE_SOLUCOES.map((s) => `- ${s.objetivo} Alternativas: ${s.alternativas.join(' → ')}${s.nunca?.length ? ` Nunca: ${s.nunca.join('; ')}.` : ''}`).join('\n');
}

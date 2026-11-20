# Decisões permanentes do dono — SOBRE MÍDIA

> Regras que o dono já decidiu e **não devem ser perguntadas de novo**, venha a IA ou ferramenta que vier. Antes estavam só na memória de uma IA; agora ficam no repositório.
>
> Para mudar uma regra é preciso pedido novo do dono; anote aqui com a data.
>
> Este repositório é **público**: aqui não entram chaves, senhas, e-mails pessoais nem dados de clientes.

## 1. Forma de trabalhar

- **Idioma:** tudo em **português do Brasil**: respostas, avisos de progresso, tabelas e mensagens de commit. Evite jargão em inglês ("publicar" em vez de deploy, "regra de acesso do banco" em vez de RLS, "dono" em vez de owner). Termo inevitável (APK, Vercel, Supabase) vai com explicação ao lado.
- **Explique o que está fazendo** em linguagem simples, passo a passo, com avisos curtos durante trabalhos longos. O dono se irrita quando fica sem notícia ou quando o trabalho para.
- **Autonomia total (31/10/2026 e 02/11/2026):** fazer tudo o que precisar (comandos, testes, migrações, publicar) **sem pedir licença**.
  - Se uma trava da ferramenta de IA negar, não contornar: seguir com o resto e relatar o que ficou parado.
  - Continuam proibidos: criar contas de terceiros, digitar senhas, fazer pagamento ou PIX real, expor ou commitar chaves.
- **Sempre terminar o ciclo:** corrigir → testar → commitar → publicar (Vercel + Supabase; OTA só quando for Player e com a aprovação dele).
- **Testes** só com a conta de teste (`scripts/ops/sessao-teste.mjs`). Nunca usar as contas pessoais do dono.
- **Prova antes de dizer "pronto":** teste automático + conferência no navegador. No Player, prova por captura de tela; o registro de exibição não basta.

## 2. Publicação e custos
- **Vercel no plano GRÁTIS** (10 GB de funções):
  - publicar só com `node scripts/ops/publicar-main.mjs` (teto de 12 por dia) e juntar correções num envio só;
  - nunca criar função nova em `api/`;
  - nunca pôr APK ou vídeo em `public/` (limite de 2 MB por arquivo);
  - só o ramo `main` publica. Docs, testes, Android, banco e scripts não publicam.
- **Ramos:** `release/player-5.2.4` e `main` andam juntos. Se o `main` do GitHub estiver na frente, junte com `git merge origin/main` (nunca force push).
- **Créditos de IA:** o dono acompanha o gasto. Se ele reclamar, pare na hora. Use as opções grátis (Cloudflare para imagem; Groq → Gemini → OpenRouter para texto). A OpenAI só funciona com saldo posto por ele.
- **Segredos:** ficam só em `~/.sobremidia-secrets/tokens.env`, fora do repositório. Nunca imprimir nem commitar. Antes de commitar, procure no diff os começos das chaves de Groq, OpenRouter, Google, Supabase e OpenAI (os mesmos que `src/tests/unit/memoriaDoSistema.test.ts` barra).

## 3. Player Android
- O **5.7.10 é a versão comercial** (canal estável).
  - APK novo sai SEMPRE como teste (`publicar-player.mjs`); promover só com aprovação do dono (`--promover`).
  - Painel e servidor nunca quebram o 5.7.10: rode `node scripts/ops/contrato-player.mjs` antes e depois de toda mudança no banco.
- **TV Box real = Android 7.1:** ensaie sempre no emulador `TVBox_API25` (sem `java.time`; usa desugaring).
- **Posição física da TV** é a autoridade única (F-212). Em pé, tudo fica em 9:16. Mídia mantém a orientação dela.
- **Login em qualquer aparelho.** Só é recusada a tela de um aparelho VIVO (sinal nos últimos 10 min).
- **Atualização (OTA):** sem nenhum toque só em Device Owner; nos demais aparelhos o Android pede um toque. Ensaie a instalação real no emulador.
- O APK é feito sempre em `native-android-player/` (saída padrão do Android Studio). Nunca em pastas paralelas.
- **Launcher Sobre Mídia:** opcional, sem apps de streaming, logo da empresa logada. O login continua obrigatório para escolher a tela. Regra do Home: 1º e 2º toque voltam ao Player em 3 s; o 3º libera por 60 s.

## 4. Painel, perfis e anunciante
- **Cada conta vê só o que é seu** (trava restritiva no banco, F-195). Só o dono e o ADM veem tudo.
- **Login por função:** cada perfil entra só pela sua porta. Quem usa a porta errada é levado sozinho à porta certa (`src/lib/portalAccess.ts`, F-204).
- **Anunciante:** não vê a Biblioteca. Ganha 1 mídia grátis só na 1ª playlist; depois paga o valor dele (padrão R$ 19,99) por PIX. Dono e ADM mudam o valor e liberam mídias grátis, sempre com motivo.
  - Aviso "excluído" = só dispensado, nunca apagado.
  - Inserções vêm das exibições reais do Player.
- **Duração de mídia:** anunciante até 20 s; gestor até 30 s; dono e ADM sem limite. A moderação usa análise própria (modelos abertos), sem chave paga.
- **Prévia de widget = tela do Player, só que menor.** Use só `cqmin`, nunca `clamp` em px.
- **Escolher uma TELA** = a mídia entra na playlist que essa tela já está passando (F-229).

## 5. Studio, encartes e palco
Padrão completo em `docs/studio/PADRAO_DE_ENCARTES_E_PALCOS.md`. Em resumo:
- **"Sobre Mídia Studio"** fica no menu de todos os usuários. Só o dono e o ADM criam ou arquivam modelos. Os demais pagam R$ 4,99 por criação com IA, por PIX.
- **Agente SOBRE MÍDIA próprio:** roda na Cloudflare e segue o Creative Core (`supabase/functions/_shared/studio/core/`). Sem arquitetura paralela, uma só cota e uma só biblioteca. Nunca dizer "gerado por IA" para plano ou modelo.
- **Balões e botões** sempre com texto e valor centralizados, só por `ESTILOS_DE_BALAO`.
- **Edição completa** ao toque em toda tela de encarte e modelo.
- **Capas das pastas** passam todas as mídias, 8 s cada. Se a pasta tem vídeo, a capa é animada.
- **Fundo novo enviado pelo dono** é para ADICIONAR como oficial, não para criar outro palco ou encarte do zero.
- **Logos oficiais do dono:** nunca redesenhar nem trocar o botão ou o fundo; só deixar nítidas e idênticas às originais.
- **Farmácia (08/11/2026):** saúde e remédios são prioridade, junto com Pernambuco. O aviso legal é obrigatório. Só remédio isento de prescrição. No Creative Core (vídeo por agentes) a farmácia é segmento PRÓPRIO, com ambiente de farmácia e nunca cenário de supermercado (F-261).
- **Segmentos (09/11/2026, F-277):** todo segmento que expõe produto tem ENCARTE e PALCO DE OFERTAS próprios, no padrão do mercado e da farmácia: padaria, adega, açougue, suplementos, quitanda e hortifrúti, pet shop, beleza e perfumaria, eletrônicos e moda. Ficam SEPARADOS das pastas de modelos de arte (anúncio/chamada para ação). Adega leva "BEBA COM MODERAÇÃO. VENDA PROIBIDA PARA MENORES DE 18 ANOS".
- **Logo e redes no encarte (F-278):** "SUA LOGO AQUI" é um botão que se arrasta; ao tocar abre a pasta Logos e o envio do aparelho; com a logo escolhida o quadrado some e fica só a logo (que também se move). As redes sociais (Instagram, Facebook, YouTube, loja, TikTok, WhatsApp) são UMA linha separada que se arrasta junta; ao tocar, escolhe quais aparecem e escreve o nome de cada uma embaixo do ícone. Nada disso fica gravado no fundo.
- **Logo criada por nós é 100% editável (F-288):** em todo encarte e palco, a logo que o SOBRE MÍDIA criou (farmácia e todos os segmentos) se edita inteira: cada texto (trocar, separar palavras, cor, borda, tamanho), textos novos, os ícones soltos dos lados, o círculo (ícone da galeria por segmento ou a logo do cliente) e as cores. Logo enviada pelo cliente fica como veio (imagem única). A edição fica SEMPRE na lateral direita (também no tablet em pé) e abre o que foi tocado: logo, produto, balão ou botão.
- **Cada encarte e cada palco é dono de si (10/11/2026, F-296):** os MODELOS DE ANTES ficam EXATAMENTE como eram (o dono não pediu para redesenhá-los). Nada do encarte/palco de MERCADO pode aparecer na edição dos outros: cor de fundo do documento, fundo do vídeo, trocas de cena, dados salvos e projeto têm de ser do próprio modelo. Flash, clarão, luz e brilho saem na COR DO ENCARTE, girada pelo tom que o cliente escolheu (rosa → flash rosa). Desenho novo entra como MODELO COMPLEMENTAR (nunca no lugar do original), na GALERIA DE MODELOS (pastas) do segmento, para o cliente escolher qual editar.
- **Edição de vídeo como mesa de edição (10/11/2026, F-297):** na edição do palco (encarte animado) há UMA visualização só — a arte animada é a primeira coisa que se vê e, ao mexer na linha do tempo, o mesmo lugar mostra o vídeo naquele instante. A lateral direita de botões rola só na altura da arte; a LINHA DO TEMPO fica embaixo, de largura inteira, sempre à vista junto com a arte (sem rolar a tela); a arte diminui o quanto for preciso para caber. Nunca voltar a ter uma segunda prévia do vídeo embaixo.
- **Modelo antes da edição (11/11/2026, F-298):** ao abrir uma pasta do Studio (encartes ou palco) a pessoa vê primeiro os MODELOS para escolher; só depois vai para a edição. A tela de edição NUNCA mostra a galeria de modelos nem frases de dica como "toque no modelo que quer editar" ou o cartão "Editar elemento". A lateral de edição é um painel só, legível no celular: nenhum texto passando de botão nem quebrando linha torto.
- **Uma pasta por segmento (11/11/2026, F-299):** no Studio, cada segmento (Mercado, Farmácia, Padaria, Adega, Suplementos…) é UMA pasta com as pastas "Encartes" e "Palco de Ofertas" dentro. Todas as capas passam em loop e em movimento, como na tela inicial: o cartão do segmento alterna um encarte e um palco; cada subpasta passa os modelos dela; na escolha, os modelos se mexem. "Editar este modelo" vai direto para a tela de edição (encarte → editor do encarte; palco → mesa do palco).
- **Locutor da casa = voz do próprio dono (11/11/2026, P-33):** o dono autorizou, por escrito nesta conversa, que a voz DELE seja copiada e usada como locutor do SOBRE MÍDIA (amostras tiradas das ofertas da loja dele). Não há termo a assinar para a voz do dono. Vozes de OUTRAS pessoas continuam exigindo o termo `docs/juridico/TERMO_DE_AUTORIZACAO_DE_VOZ.md` assinado. Vozes inventadas por IA (VoiceDesign) foram REPROVADAS pelo dono. Nenhuma voz entra no sistema sem o dono ouvir a prévia e aprovar.
- **Locutor com ElevenLabs (11/11/2026, F-300):** 5 vozes no sistema — a voz do dono (clone, `eleven_v4_turbo`), Leonardo, Carlos, Aline (farmácia é sempre voz feminina) e Diego. Vozes de modelos abertos reprovadas. Economizar créditos: cada frase gerada uma vez e guardada; ouvir amostra não gasta. Locução é OPCIONAL (interruptor). Exportação padrão do vídeo: quadro a quadro em qualidade máxima (F-301).
- **Vídeos criados (12/11/2026, F-304):** a Biblioteca de Loop (capas em vídeo do sistema) é só de owner/ADM. Os outros usuários criam os próprios vídeos; depois de criar, ELE decide: só salvar em Meus Projetos, salvar e publicar numa tela (escolhe a tela) ou baixar no aparelho.
- **Produto nunca com fundo (20/11/2026, F-351, reforço):** nenhuma arte, capa, prévia ou vídeo mostra produto com fundo. Se a nuvem não tirar o fundo, o próprio aparelho tira antes de desenhar.
- **Sistema de vídeo blindado (20/11/2026, F-350):** o sistema de criação não pode ter falhas. Toda mudança no Studio passa pela blindagem do vídeo antes de publicar (o envio é bloqueado se falhar) e pela prova em Chrome e Safari/iPhone (`scripts/ops/testar-fundo-do-video.mjs`). O fundo escolhido aparece SEMPRE, em todo aparelho.
- **Passo a passo do vídeo com locução (19/11/2026, F-349):** a ordem é 1) logo da PROMOÇÃO e fundo; 2) informações da empresa (nome e a logo DA EMPRESA, nunca a da promoção); 3) produtos; 4) edição do vídeo só com música de fundo, frases de abertura e fechamento e efeitos; 5) locução. O vídeo é criado sozinho no padrão do concorrente e, depois de criado, a pessoa pode mudar qualquer coisa.
- **Edição profissional da voz (19/11/2026, F-348):** o dono REPROVOU a voz acelerada, com palavras cortadas e frases atropeladas.
  - NUNCA acelerar a fala e NUNCA cortar palavra.
  - Só as pausas longas são editadas: o respiro e o ruído viram silêncio, e a pausa fica natural (fim de frase 0,30 s, vírgula 0,20 s).
  - Nunca colar uma frase na outra.
  - A base aprovada é o "Teste 1" (conversão direta), limpo, sem os respiros (TESTE 3).
- **REGRA ABSOLUTA — voz tratada antes de copiar (19/11/2026, F-346):** nenhuma gravação do dono é convertida ou usada para clonar sem antes passar por `scripts/studio/tratar-voz.mjs`:
  - limpar barulho de fundo, chiado e estalos;
  - tirar TODA respiração e espaço entre as falas;
  - acertar o ritmo do locutor do outro projeto (o "concorrente", 7,97 sílabas/s enquanto fala), sem ficar lento;
  - só então converter para o timbre do locutor (clone B).
  O dono grava do jeito dele, com respiro e pausas, e o sistema corrige.
- **Voz Eletro por conversão (19/11/2026, F-344):** a voz editada do dono (do outro projeto) entra como 6ª voz, "Sérgio Vaz — Eletro". Por texto o clone fala "morto"; o dono aprovou a CONVERSÃO (energia gerada numa voz expressiva → convertida para o timbre dele). Não baixar vídeos do Instagram em massa (termos da plataforma): áudios novos para treino só pelo Histórico da ElevenLabs da outra conta ou por "Baixar suas informações" do Instagram.
- **Criar no Studio (12/11/2026, F-306/F-307):** ao escolher o modelo, a pessoa decide: **"Passo a passo"** (assistente guiado, fácil no celular: produtos → loja/logo → locução opcional → revisar) ou **"Editar direto"** (vai à tela de edição de sempre, para quem já sabe). Os dois terminam na MESMA tela de edição, que não muda; nela, "Visualizar vídeo e salvar" monta o vídeo e oferece salvar, publicar ou baixar.
- **Modelo é só o começo (12/11/2026, F-308):** em qualquer modelo (encarte, palco, arte), a pessoa troca TUDO: fundo (outro da galeria, imagem dela ou só cor), logo, produtos, textos, cores e o movimento de cada elemento, inclusive o MOVIMENTO DO FUNDO. Fundo novo nunca mostra borda ao se mexer.
- **Acervo (12/11/2026, F-310):** fundos, logos e imagens enviados e os vídeos/artes salvos pelos usuários ficam no SOBRE MÍDIA, por segmento, sem interromper o usuário; só dono/ADM veem e transformam em modelo do sistema, SEM a marca, a logo, os contatos e os preços do cliente. Os Termos de Uso devem ter a cláusula (rascunho em docs/juridico/CLAUSULA_CRIACOES_E_ARQUIVOS.md).
- **Código de barras (12/11/2026, F-311):** câmera do aparelho, pistola USB/Bluetooth de qualquer ramo (mesmo sem o campo selecionado) e digitação à mão; cada leitura gravada faz o bipe de pistola, e repetido ou inválido faz o bipe de erro.
- **Vídeo pelo passo a passo (15/11/2026, F-312):** 1) empresa · 2) produtos · 3) edição do vídeo (fundo, logo, elementos) · 4) locução criada pelo locutor com tudo o que foi informado, sincronizada com cada produto. Na edição, a PRÉVIA em tamanho real fica embaixo da linha do tempo, com tocar/pausar no meio, e mostra as edições na hora, antes de salvar.
- **Vídeo com impacto (16/11/2026, F-316):** o vídeo de ofertas segue o concorrente que gera vídeos com IA (não o de modelos do Canva). Ele já sai com trilha, sirene, whoosh e impacto, chamas e estrelas na frente do fundo, fundo balançando, preço estourando, abertura e fechamento com a logo, e é entregue pronto. As trilhas e os sons são nossos, nunca os do concorrente.
- **Editor de Áudio no celular: regras de toque FIXAS (19/11/2026, F-331/F-332):**
  - Toque num clipe = escolhe e põe a linha amarela ali.
  - **PASSAR O DEDO no clipe = rola a linha do tempo**, como a régua; o clipe não vem junto (F-333).
  - **SEGURAR o clipe ~0,4 s e arrastar = move** (outra faixa, ou a área de baixo cria faixa nova; em cima de áudio, entra no meio).
  - Segurar a borda do clipe = apara.
  - Vazio ou régua = rola.
  - "Marcar trecho" ligado = arrastar marca.
  - "Desmarcar" limpa.
  - ▼/linha amarela = cursor; na borda, o áudio acompanha.
  - **ANTES de publicar qualquer mudança no editor:** `node scripts/ops/testar-editor-audio.mjs` (18 passos em tamanho de celular). Se algum falhar, não publica.
- **Cortar e arrastar (18/11/2026, F-325):**
  - "Cortar" sem trecho marcado = cortar o clipe na linha amarela.
  - A parte cortada pode ser apagada ou arrastada para o meio, para o fim, para a faixa de baixo ou para uma faixa nova.
  - Soltar em cima de áudio INSERE: empurra o resto.
- **Dedo no Editor de Áudio (18/11/2026, F-324):**
  - Deslizar na faixa NUNCA marca trecho: rola o áudio.
  - Marcar só segurando e arrastando.
  - O cursor tem um triângulo ▼ para arrastar, e na borda da tela o áudio rola sozinho.
- **Marca de edição (18/11/2026, F-323):**
  - Todo áudio salvo ou baixado pelo editor sai marcado como "Editado no SOBRE MÍDIA Studio", e o editor reconhece a marca.
  - A marca registra a EDIÇÃO; não transforma material de terceiros em obra própria.
- **Editor de Áudio no celular (18/11/2026, F-323):** tela de app profissional, com os botões grandes e com nome sempre visíveis embaixo.
- **Pasta de Áudios (18/11/2026, F-322):**
  - Todo áudio salvo fica numa pasta, com nome e versão, para rever, reeditar e salvar por cima.
  - **Não se faz:** camuflar áudio de Instagram, YouTube ou outros para não ser reconhecido, nem marcá-lo como original da SOBRE MÍDIA. Isso infringe direitos autorais.
- **Editor de Áudio (18/11/2026, F-321):**
  - Só owner/ADM veem e usam.
  - Ferramentas de corte com nome escrito em cada botão, setinhas Voltar/Avançar, enviar áudio do aparelho e baixar o áudio editado.
  - Tudo roda no navegador; nada é enviado a servidor.
- **Vídeo de impacto igual ao do concorrente (16/11/2026, F-320):**
  - Só UMA fita "Alerta de Oferta" em cada um dos 3 lugares, passando para a direita.
  - Nunca botão em cima de botão, nem fita em cima de fita: o fundo não tem nada gravado que o nosso desenho repita.
  - A logo batendo no centro tem um som; o texto importante e o preço têm o som de bater numa parede de concreto.
  - A sirene é um único "uóóó-uuu" de 3,5 s.
  - Nada de listra de rachadura desenhada.
  - O padrão vale para TODO vídeo criado.
- **Efeitos de impacto REAIS (16/11/2026, F-319):** o fogo, as explosões, a fumaça e as brasas dos vídeos são filmagens reais de efeitos (gratuitas, Pixabay, autorizadas pelo dono), como nas do concorrente; nunca só desenho. Cada efeito é um elemento que o usuário move, troca, muda a hora ou apaga. Trilhas e efeitos só gratuitos com licença; créditos da ElevenLabs só com ordem do dono.
- **Cartaz Digital** (nome para o usuário; o código usa `tabloide`): funciona como a QR Ofertas, mas sem copiar arte, tema ou texto deles. Tudo o que o usuário envia é aceito na hora.

## 6. Catálogo de produtos (fotos)
- **Foto vem da MARCA**, produto por produto, com o código de barras no nome do arquivo e nos dados da imagem. O dono decidiu seguir assim, ciente do risco.
  - Nunca chute código de barras.
  - Lado maior de no mínimo 350 px.
  - Confira em tamanho GRANDE antes de gravar.
- **Pernambuco primeiro:** marcas populares em Recife, Caruaru e região. Depois as de saúde e farmácia.
- **Embalagem vendida no Brasil:** site estrangeiro é recusado.
- **Lotes do Open Food Facts estão PARADOS:** o dono reprovou ("falhas grotescas"). Não retome sem pedido dele.
- Foto escolhida ou enviada pelo cliente: sai sem fundo, inspecionada, e vira a oficial do produto pelo nome. Reprovada nunca é entregue.
- **Recorte sem defeito (09/11/2026, F-276):** só entra foto em que o recorte e a IA (BiRefNet) CONCORDAM: parte do produto comida, sombra, reflexo ou sobra = recusada. Nunca trazer foto que precise "consertar".
- **Ordem das fontes da foto (F-275):** 1) site oficial da marca → 2) a mesma foto do fabricante nas grandes lojas que permitem leitura → 3) busca aberta no encarte → 4) imagem criada por IA. Bloqueio de site (robots.txt, CAPTCHA) NUNCA é contornado: passa para a próxima fonte.
- **Pedido de foto (F-284, ORDEM):** produto sem foto no encarte = os agentes procuram na hora (oficial → lojas que vendem a marca, mesma qualidade); o dono não precisa pedir de novo.
- **Produto certo (F-282/F-283):** sem variante escrita vale o TRADICIONAL da marca, do mesmo tipo e da mesma medida; nunca outro tipo da marca (arroz ≠ feijão), nunca foto de banco de imagens em produto embalado (estátua, campo, prato).
- **Sem PC e sem Claude (10/11/2026, F-295):** o cliente descreve o produto e o PRÓPRIO sistema procura (Worker /procurar nas lojas que vendem a marca + agentes na nuvem a cada 2 h). Só imagem OFICIAL ou a da loja que vende a marca, recortada e aprovada (nítida, sem sombra/reflexo forte; brilho pequeno passa). Produto EMBALADO nunca recebe imagem inventada pela IA nem foto com fundo: fica procurando e vira pedido.
- **Busca contínua (F-277):** a busca de fotos roda em ciclo no PC (`scripts/ops/catalogo-ciclo.mjs`), enquanto o resto do trabalho segue.
- **Removedor de fundo próprio (F-276):** quando a cota da Cloudflare acaba, o navegador tira o fundo (liso na hora; outro fundo pela IA da SOBRE MÍDIA, BiRefNet MIT).
- Método e comandos em `docs/MISSAO_CATALOGO_DE_PRODUTOS.md` (scripts `scripts/ops/marca-*`).

## 7. Conteúdo automático das pastas
- Notícias: a foto da própria notícia, sem alterar, com o crédito na tela.
- Memes, charadas e curiosidades: texto próprio, com graça, e sempre com uma foto que combina (Pexels/Pixabay com crédito).
- Apostas: só os jogos da rodada, nunca odds. Vídeos de esporte: encerrados.

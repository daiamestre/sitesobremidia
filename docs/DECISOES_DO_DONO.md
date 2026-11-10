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

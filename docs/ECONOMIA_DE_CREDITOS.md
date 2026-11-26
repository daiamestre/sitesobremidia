# Economia de créditos — trava obrigatória para toda conversa (ordem do dono, 26/11/2026)

> O dono reclamou: "está gastando créditos muito rápido, isso não está certo, coloque uma trava". Toda IA ou conversa que
> trabalhar neste projeto segue estas regras SEM exceção. Elas valem mais que pressa.

## Por que gasta tanto (o que acontecia)
1. **Conversa comprida:** a cada mensagem, a IA relê a conversa INTEIRA. Uma conversa de dias (resumida várias vezes)
   custa muito mais por mensagem do que uma nova.
2. **Duas conversas ao mesmo tempo, conversando entre si:** cada mensagem de uma para a outra ACORDA a outra, que relê a
   conversa inteira dela. Duas conversas longas trocando avisos = gasto em dobro, sem o dono pedir nada.
3. **Imagens:** cada captura de tela ou folha de conferência custa muito mais que texto. Repetir captura sem mudança é desperdício.
4. **Texto fixo em toda mensagem:** o "onde paramos" do início tinha 13 mil caracteres. Agora tem ≈1,5 mil (`onde-paramos.mjs --curto`).

## A trava (regras)
1. **UMA conversa por vez neste projeto.** Não trabalhar com duas sessões ao mesmo tempo. Se outra conversa estiver
   trabalhando, PARAR e avisar o dono. **Proibido mandar mensagem para outra sessão** (SendMessage/send_message) sem o dono
   pedir naquela hora.
2. **Conversa nova a cada tarefa grande.** Quando a conversa já tiver sido resumida (compactada) uma vez, terminar a etapa,
   gravar o ponto em `docs/PONTO_DE_RETOMADA.md` e PEDIR ao dono para abrir uma conversa nova.
3. **Imagem só quando precisa olhar.** Medir por código (posição, cor, transparência) sempre que der. Captura de tela
   pequena (escala 0,5). Folha de conferência com no máximo ~1.600 px de largura e no máximo 2 por entrega. Nunca repetir
   captura sem ter mudado algo.
4. **Ler só o necessário:** procurar com grep e ler trechos (offset/limit), nunca o arquivo grande inteiro.
5. **Testes:** só os do assunto enquanto trabalha; a bateria completa uma vez, antes de commitar/publicar.
6. **Tarefas em segundo plano:** esperar o aviso de que terminou; não ficar consultando o andamento.
7. **Respostas curtas ao dono:** tabela e o essencial; sem repetir o que já foi dito.
8. **Modelo:** trabalho simples (guardar logos na fila, documentação, conferência de texto) pode rodar num modelo mais
   barato (Sonnet). O dono troca no seletor de modelo do aplicativo. Opus só para tarefas difíceis.

## Onde o dono controla o gasto
- No app/site do Claude, nas configurações da conta (parte de uso), dá para ver o consumo e, se a conta tiver uso extra
  pago ligado, limitar ou desligar. A IA não consegue mudar isso pelo dono.
- Arquivar as conversas antigas e longas que não estão em uso (elas não gastam paradas, mas qualquer mensagem que chegue
  nelas faz reler tudo).

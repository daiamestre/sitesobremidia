# F-110 — Homologação no navegador (28/09/2026)

1. Anunciante de teste (usuario1anunciante) → /portal/assets → envio de imagem gerada (promo-teste.jpg) pelo fluxo real → cartão "Em análise".
2. Admin de teste (dbg.adm) → /dashboard/telas-parceiras → fila "Mídias aguardando análise (1)" → Aprovar → aviso "Mídia aprovada. O cliente já pode pagar e ir ao ar." → banco: moderacao_status=APROVADA, moderacao_por preenchido.
3. Anunciante → ficha da Farmácia Capital do Agreste → Anunciar aqui → passo 1 mostra a mídia "aprovada" → passo 2: 2 telas × R$ 149,90 = R$ 299,80, desmarcada "Fila do caixa" → R$ 149,90 → Reservar e pagar → "Seu anúncio foi reservado em 1 tela por R$ 149,90/mês" + "Pagar agora".
4. Banco: ponto_anuncios status AGUARDANDO_PAGAMENTO, valor_mensal 149.90, 1 tela; contas_receber COB-2026-002487, PENDENTE, 149.90, vencimento 2026-10-01, PIX/BOLETO, origem ANUNCIANTE.
5. "Pagar agora" → /cobranca/COB-2026-002487/COB-49Z5M5XF abre a fatura. Achado: vencimento exibido 30/09 (fuso) → corrigido em PaginaCobranca e coberto por paginaCobrancaDatas.test.tsx.
6. Limpeza: cobrança CANCELADA (nota de teste), anúncio PAUSADO (motivo "Teste de homologação F-110"), chaves de sessão removidas do navegador.

-- 20261259 — Esportes (F-89): fundos com as taças da Premier League, Champions e La Liga (enviadas pelo proprietário);
-- ?v=4 renova o cache de imagem dos aparelhos. Sem mudança de função/contrato.
UPDATE public.content_sports_competitions
   SET fundo_h_url = 'https://sitesobremidia.vercel.app/esportes/fundos/' || slug || '-h.jpg?v=4',
       fundo_v_url = 'https://sitesobremidia.vercel.app/esportes/fundos/' || slug || '-v.jpg?v=4'
 WHERE empresa_operadora_id IS NULL
   AND slug IN ('brasileirao', 'copa-do-brasil', 'premier-league', 'la-liga', 'champions-league');

-- F-276 — tira do catálogo de fotos oficiais o que NÃO é produto de encarte (roupas, bonés, sacolas, coqueteleiras, chaveiros,
-- pincéis, kits/combos, "ebooks", páginas do site lidas por engano como "Your browser is disabled"). ~140 linhas.
-- Rodar: node scripts/ops/sql.mjs @scripts/ops/limpeza-catalogo-276.sql   (a trava automática pede que o DONO rode)
-- Conferir antes: troque "delete from" por "select nome from" nas duas linhas abaixo.
delete from public.tabloide_catalogo where fonte = 'MARCA' and cliente_id is null
  and nome_norm ~ '(^|[^a-z])(shorts?|calca|camiseta|camisa|regata|cropped|legging|bermuda|jaqueta|moletom|bone|sacola|ebooks?|lojas parceiras|your browser|planeta mais limpo|o que e|touca|turbante|pincel|necessaire|coqueteleira|garrafa termica|toalha|chaveiro|brinde|vale presente|gift card|cartao presente|mochila|carteira|oculos|relogio|chinelo|tenis|catalogo|folheto|revista|cupom|assinatura|curso|consultoria|frete|embalagem presente|papel presente|kits?|combo|sacolinha|camisetas)([^a-z]|$)'
  and nome_norm !~ '(short rib|t bone|tbone|tinta de cabelo|kit paella|kit salgados)';
delete from public.tabloide_catalogo where fonte = 'MARCA' and cliente_id is null
  and nome_norm ~ '(your browser|planeta mais limpo|^o que e|lojas parceiras|ebook)';

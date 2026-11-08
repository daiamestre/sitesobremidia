---
name: encartes-e-palcos
description: Criar ou evoluir encartes oficiais, palcos de ofertas (carrossel), logos e mídias do SOBRE MÍDIA Studio no mesmo padrão aprovado pelo dono (mercado e farmácia), inclusive fundo novo enviado pelo dono ou segmento novo. Usar em qualquer pedido de encarte, palco, carrossel de produtos, balão de preço ou arte de oferta.
---

# Encartes e palcos — SOBRE MÍDIA Studio

Padrão completo, com composição, regras e receitas: `docs/studio/PADRAO_DE_ENCARTES_E_PALCOS.md`. Leia antes de começar.

## Atalho por pedido
| Pedido | Faça |
|---|---|
| Fundo de encarte enviado pelo dono | Receita "Fundo novo do dono": `tirar-titulo-dos-fundos.mjs` → `BASES` + `ADAPTACOES` (`encartesOficiais.ts` e `adaptar-encartes.mjs`) → logo em `LOGOS_OFICIAIS` |
| Fundo de palco enviado pelo dono | `public/studio/palco/<id>-{h,v}.webp` + `-st` → entrada em `FUNDOS_DO_PALCO` com as caixas medidas e o `segmento` |
| Encarte ou palco criado pelo sistema | Copie o modelo de `scripts/studio/gerar-farmacia.mjs` (HTML/SVG + Chromium), repita as caixas de um oficial que funciona e confira as imagens em tamanho grande |
| Segmento novo (açougue, pet…) | `SegmentoDoStudio` + `PASTAS_DE_ENCARTE` + rotas em `PastaPage.tsx` + cartões em `CatalogoPage.tsx` + `CESTA_<SEG>` com nomes do catálogo |
| Balão novo | Estilo novo em `ESTILOS_DE_BALAO` (`palco.ts`); nunca posicione texto de preço à mão |

## Regras que reprovam a entrega
- Balão ou botão com o texto fora do centro (`regraBaloesCentralizados.test.ts`).
- Elemento que não se edita ao toque (`studioEdicaoCompleta249.test.ts`).
- Farmácia sem "A PERSISTIREM OS SINTOMAS, O MÉDICO DEVERÁ SER CONSULTADO", ou com remédio de receita.
- Logo gravada no fundo, sem ser camada trocável.
- Arte deformada nos outros tamanhos.
- Foto de produto com fundo, cortada, de outra marca ou com embalagem de outro país.

## Conferir e publicar
1. `npx vitest run src/tests/unit/studio src/tests/unit/regra`
2. Confira no navegador (skill `conferir-painel`) nas pastas `/studio/pasta/<id>`, em pé e deitado.
3. Registre (skill `retomar-trabalho`, parte "Ao terminar") e publique com `node scripts/ops/publicar-main.mjs`.

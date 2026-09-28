# F-115 — Teste de isolamento (transações desfeitas, 29/09/2026)
Alvo: tela HOTEL MAXSUEL (TEL-2026-000002, do dono) e a playlist dela (8 itens).

| Perfil | Vê playlist | Edita itens | Salva programação (fn_save_playlist_items) | Altera tela | Apaga tela |
|---|---|---|---|---|---|
| Dono | sim | sim | — | sim | sim |
| ADMIN da empresa | sim | sim | SALVOU | sim | sim |
| GESTOR da empresa | não | não | barrado | não | não |
| REPRESENTANTE | não | não | — | não | não |
| ANUNCIANTE | não | não | barrado | não | não |
| ADMIN de outra empresa | não | não | — | não | não |

Regressão: gestor continua alterando a PRÓPRIA tela; tela nova nasce com a empresa do dono.
Player: comparar-telas antes (player_antes.txt) × depois, rodado 2 vezes (após 20261285 e após 20261286) = "resposta de todas as telas idêntica".
Mídias: as 348 que todos veem são da Biblioteca compartilhada (regra já existente); as 14 particulares do dono só dono/ADMIN.
Telas que receberam a empresa: telas_sem_empresa.antes.json (último sinal preservado).

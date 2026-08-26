# migrations_archive — reconciliação repo = cloud = ledger (missão Fase 17)

Arquivos movidos de `supabase/migrations/` em 2026-08-25 após auditoria artefato-por-artefato
contra o banco de produção (`bhwsybgsyvvhqtkdqozb`) via Management API.

## Por que foram arquivados (e não apagados)

Nenhum deles está registrado no ledger remoto (`supabase_migrations.schema_migrations`),
porém **todo o conteúdo efetivo já existe no Cloud**, aplicado manualmente ou superscrito
por migrations posteriores que ESTÃO no ledger. Deixá-los em `migrations/` fazia o
`supabase db push` tentar reaplicá-los (risco de sobrescrita de RPCs/policies corrigidas).

| Arquivo | Evidência de supersessão (estado verificado no Cloud) |
|---|---|
| 019_financeiro_core.sql | Modelo financeiro atual usa `contas_receber` com `numero_parcela/total_parcelas` (não há tabela `parcelas`; view `dw_fact_receita` operacional, 50 linhas). Policies família `cr_client_select_own/cr_internal_all`. |
| 029_epic_001_core_identity_governance.sql | Proteção OWNER feita por triggers vivos: `trigger_prevent_owner_deletion`, `trigger_prevent_owner_downgrade`, `trigger_prevent_self_escalation`, `trg_prevent_usuario_insert_forgery`. |
| 20260807_fase84_c2..d, fase85 masters | Tabelas existem (`producao_versoes`, `agendamento_telas`, `player_heartbeats`, `system_events`, DW `dw_dim_*`) com políticas mais novas (`agt_tenant_*`, `phb_*_own`, `pv_tenant_isolation`). |
| 20260810_fase91a/92/92fix | RLS de representantes/financeiro consolidada por 20260810_fase90_fase91 master (aplicada) + famílias atuais; DW vivo sob nomes `dw_fact_*`. |
| 20260813b/c, 20260813_owner_client_creation_rls | `fn_cadastrar_cliente_atomo` presente; policies `p_rep_*` presentes; consolidação posterior em 20260815/16 (aplicadas). |
| 20260814_rpc_authenticated_only, 20260814b×2 | Grants atuais definidos por 20260816_rpc_tenant_ownership_final e 20261032_provisioning_forgery_conciliacao (aplicadas); policy `p_update_assinaturas` presente. |
| 20260824_central_acessos_delegacao | RPCs vivas: `criar_usuario_corporativo`, `listar_usuarios_central`, `get_central_acessos_dashboard`, `has_admin_permission`, `enforce_admin_permission` (trigger em `usuarios` ativo). |
| 20260824_screen_operational_codes | `gerar_codigo_tela`, `buscar_tela_por_codigo`, trigger `trg_codigo_op_ins` ativos (versão final). |
| 20260825_codigos_operacionais | `gerar_codigo_conta` + trigger ativos; variante `_novo` não existente (iteração abandonada). |
| 20260825_device_fleet | Superscrito pela arquitetura atual: `devices`, `device_health`, `device_logs`, `device_pairing_codes` (20260828_device_identity, 20261004/05 — aplicadas). |
| 20260826_representantes_gestao_desempenho | RPCs de gestão/desempenho presentes; policy `p_representantes_self_or_admin` presente. |
| 20260826b_cobrancas_internas | Cobranças operam sobre `contas_receber` (ação viva `COBRANCA_VIDEO_GERADA` na constraint `auditoria_logs_acao_check`). |
| 20260916_customer_portal_commerce_foundation | Todas as tabelas/RPCs existem (`produtos`, `ofertas`, `contrato_estabelecimentos` — referenciada pela 20261035 aplicada; `aprovar_expansao` etc.). |
| 20261010_fix_player_playlist_rpc_roles_and_contract | Corpo vivo de `get_player_playlist_for_screen(text,text)` já usa `public.perfis` e evoluiu além deste arquivo (join `roles` da 20261009 nunca existiu no banco; versão 20261010 aplicada manualmente sem ledger; versão 20261009 permanece como registro histórico do ledger). |
| 20261017_anunciante_perfil_e_constraint | Constraint viva `perfis_nome_check` contém ANUNCIANTE (+11 perfis); perfil ativo; reafirmado por 20261022/20261023/20261025 (aplicadas). |
| test_enqueue_job.sql | Scratch de teste manual; não é migration (sem timestamp). |

## Regra da casa

`supabase/migrations/` deve conter EXATAMENTE o que está/aplicável ao ledger.
Conteúdo histórico preservado aqui para rastreabilidade. NADA foi apagado.

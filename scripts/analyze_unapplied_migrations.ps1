param([string]$OutFile = "$env:TEMP\opencode\artifact_report.txt")

$files = @(
  '019_financeiro_core.sql',
  '029_epic_001_core_identity_governance.sql',
  '20260807_fase84_c2_producao_midia_master.sql',
  '20260807_fase84_c3_agendamento_rede_master.sql',
  '20260807_fase84_c4_noc_telemetria_master.sql',
  '20260807_fase84_d_financeiro_bi_dw_master.sql',
  '20260807_fase85_enterprise_hardening_master.sql',
  '20260810_fase91a_red_team_ownership_rls_hardening.sql',
  '20260810_fase92_financeiro_bi_dw_master.sql',
  '20260810_fase92_fix_financial_dw_security_invoker.sql',
  '20260813b_rpc_representante_nullable.sql',
  '20260813c_final_owner_nullable.sql',
  '20260813_owner_client_creation_rls.sql',
  '20260814_rpc_authenticated_only.sql',
  '20260814b_assinaturas_update_policy.sql',
  '20260814b_rpc_tenant_ownership.sql',
  '20260824_central_acessos_delegacao.sql',
  '20260824_screen_operational_codes.sql',
  '20260825_codigos_operacionais.sql',
  '20260825_device_fleet.sql',
  '20260826_representantes_gestao_desempenho.sql',
  '20260826b_cobrancas_internas.sql',
  '20260916_customer_portal_commerce_foundation.sql',
  '20261010_fix_player_playlist_rpc_roles_and_contract.sql'
)

$report = New-Object System.Collections.Generic.List[string]
foreach ($f in $files) {
  $path = Join-Path "supabase\migrations" $f
  if (-not (Test-Path $path)) { $report.Add("MISSING_FILE`t$f"); continue }
  $sql = Get-Content $path -Raw
  $tables = [regex]::Matches($sql, '(?i)CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)') | ForEach-Object { $_.Groups[2].Value } | Select-Object -Unique
  $cols = [regex]::Matches($sql, '(?i)ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\.\s*([a-z_][a-z0-9_]*)') | ForEach-Object { "$($_.Groups[2].Value).$($_.Groups[3].Value)" } | Select-Object -Unique
  $funcs = [regex]::Matches($sql, '(?i)CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)') | ForEach-Object { $_.Groups[2].Value } | Select-Object -Unique
  $policies = [regex]::Matches($sql, '(?i)CREATE\s+POLICY\s+"?([a-z_][a-z0-9_ ]*)"?\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)') | ForEach-Object { "$($_.Groups[2].Value):$($_.Groups[1].Value)" } | Select-Object -Unique
  $report.Add(("FILE`t{0}" -f $f))
  if ($tables.Count)   { $report.Add("  TABLES`t" + ($tables -join ',')) }
  if ($cols.Count)     { $report.Add("  COLS`t" + ($cols -join ',')) }
  if ($funcs.Count)    { $report.Add("  FUNCS`t" + ($funcs -join ',')) }
  if ($policies.Count) { $report.Add("  POLICIES`t" + (($policies | ForEach-Object { $_ -replace '\s+', '~' }) -join ',')) }
}
$report | Out-File $OutFile -Encoding utf8
Write-Output "Relatorio gerado: $OutFile"
Get-Content $OutFile
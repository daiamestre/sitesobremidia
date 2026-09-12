#!/usr/bin/env node
/**
 * SOBRE MÍDIA AI Engineering System — Autonomous Operational CLI Runner
 * Executa tarefas em linguagem natural de forma autônoma de ponta a ponta.
 * 
 * Uso:
 *   node .agents/scripts/run.mjs "Sua instrução de engenharia em linguagem natural"
 * 
 * Exemplo:
 *   node .agents/scripts/run.mjs "Analise o sistema de agentes, implemente a melhoria segura e valide com testes"
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { executeAutonomousTask } from '../core/entrypoint.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..').replace(/\\/g, '/');

async function main() {
  const args = process.argv.slice(2);
  const prompt = args.join(' ').trim();

  if (!prompt || prompt === '--help' || prompt === '-h') {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║               SOBRE MÍDIA AI ENGINEERING SYSTEM — RUNNER                     ║
╚══════════════════════════════════════════════════════════════════════════════╝

USO:
  node .agents/scripts/run.mjs "<tarefa em linguagem natural>"

EXEMPLOS:
  node .agents/scripts/run.mjs "Analise a arquitetura de governança e reporte a integridade do sistema"
  node .agents/scripts/run.mjs "Verifique as políticas de RLS e migrações do banco de dados"
  node .agents/scripts/run.mjs "Audite o código contra padrões proibidos e valide diffs periciais"
  node .agents/scripts/run.mjs "Execute o ciclo completo de engenharia para validar a não-regressão"

O sistema irá automaticamente:
  1. Normalizar e classificar sua tarefa (TaskNormalizer & TaskRouter)
  2. Planejar a cadeia ótima de especialistas (ExecutionPlanner)
  3. Executar os agentes (Architect, Builder, Database, QA, Forensic)
  4. Executar as Skills e Ações correspondentes sob PreToolGuard
  5. Registrar e validar Handoffs entre agentes
  6. Selar a conclusão com evidências físicas na CompletionAuthority
`);
    process.exit(prompt ? 0 : 1);
  }

  console.log('\n🚀 =========================================================================');
  console.log('🚀 SOBRE MÍDIA AI ENGINEERING SYSTEM — AUTONOMOUS EXECUTION');
  console.log('🚀 =========================================================================');
  console.log(`📥 PROMPT DO USUÁRIO: "${prompt}"`);
  console.log(`📂 WORKSPACE: ${workspaceRoot}\n`);

  try {
    const result = await executeAutonomousTask(prompt, {
      workspace_root: workspaceRoot
    });

    console.log('-------------------------------------------------------------------------');
    console.log(`📋 TAREFA: ${result.task_id} (Tipo: ${result.task_type})`);
    console.log(`📋 PLANO:  ${result.plan_id}`);
    console.log(`📊 STATUS: ${result.status} ${result.success ? '✅' : '❌'}`);
    console.log(`🔒 COMPLETION ID: ${result.completion_id || 'NÃO SELADO'}`);
    console.log(`⏱️ DURAÇÃO TOTAL: ${result.duration_ms || 0}ms`);
    console.log('-------------------------------------------------------------------------\n');

    console.log('👥 ETAPAS EXECUTADAS PELOS AGENTES:');
    for (let i = 0; i < result.steps_executed.length; i++) {
      const step = result.steps_executed[i];
      const statusIcon = step.status === 'COMPLETED' ? '✓' : '✗';
      console.log(`   [${statusIcon}] Etapa ${i + 1} (${step.agent_id}): ${step.summary}`);
      console.log(`       Evidências: ${step.evidence_count} | Duração: ${step.duration_ms}ms`);
    }

    if (result.handoffs.length > 0) {
      console.log(`\n🔄 HANDOFFS GOVERNADOS (${result.handoffs.length}):`);
      for (const h of result.handoffs) {
        console.log(`   → [${h.from} ➔ ${h.to}] Handoff ${h.handoff_id} (Status: ${h.status})`);
      }
    }

    console.log(`\n🛡️ EVIDÊNCIAS FÍSICAS COMPROVADAS (${result.evidence.length}):`);
    for (let i = 0; i < result.evidence.length; i++) {
      const ev = result.evidence[i];
      console.log(`   [✓] Evidência #${i + 1}: ${ev.command} (exit_code=${ev.exit_code}) — ${ev.summary}`);
    }

    console.log(`\n📜 AUDIT TRAIL: ${result.audit_events_count} eventos registrados.`);
    console.log('\n=========================================================================');
    if (result.success) {
      console.log('🎉 TAREFA CONCLUÍDA COM SUCESSO ABSOLUTO (COMPLETED)');
      console.log('=========================================================================\n');
      process.exit(0);
    } else {
      console.error(`❌ TAREFA FALHOU OU BLOQUEOU: ${result.error}`);
      console.log('=========================================================================\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n🚨 EXCEÇÃO DURANTE A EXECUÇÃO AUTÔNOMA:', err.message);
    process.exit(1);
  }
}

main();

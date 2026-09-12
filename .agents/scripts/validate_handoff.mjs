import fs from 'fs';

const VALID_SPECIALISTS = [
  'Orchestrator',
  'Architect',
  'Builder',
  'UI/UX',
  'Database',
  'Mobile',
  'QA',
  'Forensic',
  'Security',
  'Release',
  'orchestrator',
  'architect',
  'builder',
  'ui_ux',
  'database',
  'mobile',
  'qa',
  'forensic',
  'security',
  'release'
];

const VALID_STATUSES = ['READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];

function validateHandoff(handoff) {
  const errors = [];

  if (!handoff || typeof handoff !== 'object') {
    return ['Payload de handoff inválido ou nulo.'];
  }

  if (!handoff.handoff_id || typeof handoff.handoff_id !== 'string') {
    errors.push("Campo obrigatório 'handoff_id' ausente ou inválido.");
  }

  if (!handoff.task_id || typeof handoff.task_id !== 'string') {
    errors.push("Campo obrigatório 'task_id' ausente ou inválido.");
  }

  if (!VALID_SPECIALISTS.includes(handoff.from)) {
    errors.push(`Especialista de origem 'from' inválido: '${handoff.from}'. Permitidos: ${VALID_SPECIALISTS.join(', ')}`);
  }

  if (!VALID_SPECIALISTS.includes(handoff.to)) {
    errors.push(`Especialista de destino 'to' inválido: '${handoff.to}'. Permitidos: ${VALID_SPECIALISTS.join(', ')}`);
  }

  if (!VALID_STATUSES.includes(handoff.status)) {
    errors.push(`Status de handoff inválido: '${handoff.status}'. Permitidos: ${VALID_STATUSES.join(', ')}`);
  }

  if (!handoff.objective || typeof handoff.objective !== 'string') {
    errors.push("Campo obrigatório 'objective' ausente ou vazio.");
  }

  if (!handoff.completed_work || typeof handoff.completed_work !== 'string') {
    errors.push("Campo obrigatório 'completed_work' ausente ou vazio.");
  }

  if (!Array.isArray(handoff.evidence) || handoff.evidence.length === 0) {
    errors.push("Campo obrigatório 'evidence' ausente ou vazio. Handoff exige pelo menos 1 evidência de execução.");
  } else {
    handoff.evidence.forEach((ev, idx) => {
      if (!ev.command || typeof ev.exit_code !== 'number' || ev.exit_code !== 0) {
        errors.push(`Evidência [${idx}] inválida: comando '${ev.command || 'N/A'}' deve ter exit_code: 0 (recebido: ${ev.exit_code}).`);
      }
    });
  }

  if (!Array.isArray(handoff.files_changed)) {
    errors.push("Campo obrigatório 'files_changed' deve ser um array.");
  }

  if (!Array.isArray(handoff.tests_run)) {
    errors.push("Campo obrigatório 'tests_run' deve ser um array.");
  }

  if (!handoff.next_action || typeof handoff.next_action !== 'string') {
    errors.push("Campo obrigatório 'next_action' ausente ou vazio.");
  }

  return errors;
}

const targetPath = process.argv[2];

if (!targetPath) {
  console.error("❌ Uso: node validate_handoff.mjs <caminho_para_arquivo_handoff.json>");
  process.exit(1);
}

try {
  const content = fs.readFileSync(targetPath, 'utf8');
  const parsed = JSON.parse(content);
  const errors = validateHandoff(parsed);

  if (errors.length > 0) {
    console.error(`🚨 [HANDOFF VALIDATION FAILED]: ${errors.length} erro(s) encontrado(s):`);
    errors.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }

  console.log(`✅ [HANDOFF VALIDATION PASS]: Handoff '${parsed.handoff_id}' de '${parsed.from}' para '${parsed.to}' validado com sucesso com ${parsed.evidence.length} evidência(s).`);
  process.exit(0);
} catch (err) {
  console.error(`❌ Erro ao ler ou parsear arquivo de handoff: ${err.message}`);
  process.exit(1);
}

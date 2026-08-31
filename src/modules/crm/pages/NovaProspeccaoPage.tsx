// GATE 6.7 — Nova Prospecção preservada como alias do CLIENT TYPE GATE
// Reutiliza o gate canônico para garantir triagem única para todos os perfis.
// Mantido por compatibilidade: /representantes/prospeccao continua exibindo NOVO CADASTRO
import { ClientTypeGate } from '../components/ClientTypeGate';

export default function NovaProspeccaoPage() {
  return <ClientTypeGate />;
}

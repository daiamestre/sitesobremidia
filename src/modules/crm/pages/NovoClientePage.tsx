// GATE 6.7 — NovoClientePage passa a ser o CLIENT TYPE GATE
// Rota canônica: /{basePath}/clientes/novo — única porta de entrada
// Wizard de anunciante foi movido para /{basePath}/clientes/novo/anunciante (NovoClienteWizardPage)
import { ClientTypeGate } from '../components/ClientTypeGate';

export default function NovoClientePage() {
  return <ClientTypeGate />;
}

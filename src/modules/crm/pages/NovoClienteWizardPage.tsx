import { IntelligentCommercialWizard } from '../components/forms/IntelligentCommercialWizard';

// Wizard explícito de ANUNCIANTE — só acessível via ClientTypeGate com tipo ANUNCIANTE
// Rota canônica: /{basePath}/clientes/novo/anunciante
export default function NovoClienteWizardPage() {
  return <IntelligentCommercialWizard />;
}

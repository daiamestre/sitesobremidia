import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { meuSaldo } from '@/lib/studioai/api';
import { StudioCentral } from '@/components/studio/StudioCentral';
import { BriefingWizard } from '@/components/studio/BriefingWizard';
import { ProducaoView } from '@/components/studio/ProducaoView';

/**
 * Studio de IA — o MESMO Studio em duas portas (sem duplicar telas):
 *  - anunciante: /portal/criar-midia (a página "Criar mídia" do portal, F-107), /novo e /:id;
 *  - equipe (owner/ADM): /dashboard/studio, /novo e /:id.
 * Quem pode o quê é decidido no banco (studio_escopo / RLS), não aqui.
 */
const PORTAL = '/portal/criar-midia';
const EQUIPE = '/dashboard/studio';

export function StudioInicioPortal() { return <StudioCentral base={PORTAL} />; }
export function StudioNovoPortal() { return <BriefingWizard base={PORTAL} />; }
export function StudioProducaoPortal() { const { id = '' } = useParams(); return <ProducaoView id={id} base={PORTAL} areaEquipe={false} />; }

export function StudioInicioEquipe() { return <StudioCentral base={EQUIPE} />; }
export function StudioNovoEquipe() { return <BriefingWizard base={EQUIPE} />; }
export function StudioProducaoEquipe() { const { id = '' } = useParams(); return <ProducaoView id={id} base={EQUIPE} areaEquipe />; }

/**
 * P-06 (08/11/2026): a mesma central dentro do /studio (menu "Vídeo por agentes"), para todos que usam o Studio.
 * Anunciante entrega em Minhas Mídias (passa pela análise); equipe entrega nas mídias da empresa.
 */
const AGENTES = '/studio/agentes';
function useAreaEquipe() {
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  return !saldo.data?.cliente;
}
export function StudioAgentesInicio() { return <StudioCentral base={AGENTES} />; }
export function StudioAgentesNovo() { return <BriefingWizard base={AGENTES} />; }
export function StudioAgentesProducao() { const { id = '' } = useParams(); const equipe = useAreaEquipe(); return <ProducaoView id={id} base={AGENTES} areaEquipe={equipe} />; }

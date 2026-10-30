import { useParams } from 'react-router-dom';
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

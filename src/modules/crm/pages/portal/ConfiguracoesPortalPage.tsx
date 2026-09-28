import MeuPerfilBase from '@/components/perfil/MeuPerfilBase';

// Brand Kit não faz parte do Portal do Anunciante (é do Gestor de Mídias) — F-101.
export default function ConfiguracoesPortalPage() {
  return (
    <div className="space-y-6">
      <MeuPerfilBase variante="ANUNCIANTE" titulo="Meu Perfil — Anunciante" subtitulo="Dados da sua empresa, contato, foto, segurança e histórico." />
    </div>
  );
}

import { Navigate } from 'react-router-dom';

/** F-107 → SOBRE MÍDIA STUDIO AI: "Criar mídia" do portal abre o Studio (catálogo de modelos, editor, IA e publicação). */
export default function CriarMidiaPage() {
  return <Navigate to="/studio" replace />;
}

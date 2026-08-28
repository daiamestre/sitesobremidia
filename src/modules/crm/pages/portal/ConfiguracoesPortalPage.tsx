import MeuPerfilBase from '@/components/perfil/MeuPerfilBase';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Palette } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ConfiguracoesPortalPage() {
  return (
    <div className="space-y-6">
      <MeuPerfilBase variante="ANUNCIANTE" titulo="Meu Perfil — Anunciante" subtitulo="Dados da sua empresa, contato, foto, segurança e histórico." />
      <Card className="border-white/10 bg-white/[0.02] max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Palette className="h-5 w-5 text-purple-400"/> Identidade visual</CardTitle>
          <CardDescription>Logo, cores e fontes usadas nos seus criativos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/portal/brand-kit"><Button variant="outline">Abrir Brand Kit</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}

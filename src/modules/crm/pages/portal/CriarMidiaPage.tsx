import { Link } from 'react-router-dom';
import { ImagePlus, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * F-107 — Criação de mídias (em construção). Por enquanto o anunciante pode enviar uma mídia
 * pronta em "Minhas Mídias"; o criador de mídias do portal vem numa próxima etapa.
 */
export default function CriarMidiaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12" data-testid="criar-midia">
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Sparkles className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold text-white">Crie sua mídia</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          O criador de mídias do portal está sendo construído: em breve você vai montar seus anúncios aqui mesmo.
          Enquanto isso, envie uma imagem ou um vídeo pronto.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Link to="/portal/assets"><Button className="w-full gap-2 sm:w-auto"><Upload className="h-4 w-4" /> Enviar mídia pronta</Button></Link>
          <Link to="/portal/pontos-parceiros"><Button variant="outline" className="w-full gap-2 border-white/10 sm:w-auto"><ImagePlus className="h-4 w-4" /> Voltar aos pontos parceiros</Button></Link>
        </div>
      </div>
    </div>
  );
}

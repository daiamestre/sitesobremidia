import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { aiService, AIResponse } from '@/modules/crm/services/ai.service';
import { anunciateAiService, GerarTituloOptions, GerarTextoAnuncioOptions, GerarCTAOptions, DadosCampanhaContexto } from '@/modules/crm/services/anuncianteAi.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Tv, Megaphone, ShieldCheck, Calendar, CreditCard, MapPin, Loader2, Sparkles, Palette, Image as ImageIcon, Mic, Headphones, Zap } from 'lucide-react';

interface IAFeature {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}

const IA_FEATURES: IAFeature[] = [
  { id: 'gerar-titulo', name: 'Gerar Título', description: 'Título de campanha impactante', icon: Tv },
  { id: 'gerar-texto', name: 'Gerar Texto', description: 'Texto de anúncio persuasivo', icon: Megaphone },
  { id: 'gerar-cta', name: 'Gerar CTA', description: 'Call-to-Action para campanha', icon: CreditCard },
  { id: 'gerar-script', name: 'Roteiro Vídeo', description: 'Script para vídeo institucional', icon: ImageIcon },
  { id: 'sugestao-campanha', name: 'Sugestão de Campanha', description: 'Campanhas baseadas no seu perfil', icon: Sparkles },
  { id: 'buscar-pontos', name: 'Buscar Pontos', description: 'Encontrar pontos de mídia por IA', icon: MapPin },
  { id: 'analisar-desempenho', name: 'Analisar Desempenho', description: 'Relatório de campanhas passadas', icon: Zap },
];

export default function AnuncianteAI() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState<IAFeature | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => setOpen(false);
  const handleFeatureSelect = (feature: IAFeature) => {
    setActiveFeature(feature);
    setOpen(true);
  };

  const handleGenerate = useCallback(async () => {
    if (!activeFeature || !usuario?.cliente_id) return;
    setLoading(true);

    try {
      let result: string
        | { titulos: string[]; objetivos: string[]; beneficios: string[]; ctas: string[] }
        | Array<{ nome?: string; cidade?: string; estado?: string }>
        | null = null;

      switch (activeFeature.id) {
        case 'gerar-titulo': {
          const titulo = await anunciateAiService.gerarTitulo({
            objetivo: 'Vendas e Ofertas',
            produto_servico: 'Digital Signage',
            publico_alvo: 'Empresas locais',
            estilo: 'profissional',
          });
          result = titulo;
          break;
        }
        case 'gerar-texto': {
          const texto = await anunciateAiService.gerarTextoAnuncio({
            descricao: 'Promoção especial para novos clientes',
            produto_servico: 'Telas digitais',
            beneficios: 'Alcance segmentado, medição precisa',
            chamado_acao: 'Saiba Mais',
            tono: 'profissional',
          });
          result = texto;
          break;
        }
        case 'gerar-cta': {
          const cta = await anunciateAiService.gerarCTA({
            estilo: 'direto',
            contexto: 'Campanha de lançamento de produto',
          });
          result = cta;
          break;
        }
        case 'gerar-script': {
          const script = await anunciateAiService.gerarScriptVideo(
            'Lançamento de nova linha de produtos para varejo'
          );
          result = script;
          break;
        }
        case 'sugestao-campanha': {
          const sugestoes = await anunciateAiService.sugerirCampanhas(usuario.empresa_operadora_id);
          result = sugestoes;
          break;
        }
        case 'buscar-pontos': {
          const pontos = await anunciateAiService.sugerirPontos(
            'pontos perto de mim',
            usuario.empresa_operadora_id
          );
          result = pontos;
          break;
        }
        case 'analisar-desempenho': {
          const relatorio = await anunciateAiService.analisarDesempenhoCampanhas(usuario.empresa_operadora_id);
          result = relatorio;
          break;
        }
        default:
          break;
      }

      if (result) {
        // Handle different result types
        if (typeof result === 'string') {
          toast({
            title: 'Resultado da IA',
            description: result,
            variant: 'default',
          });
        } else if (!Array.isArray(result) && result.titulos) {
          let msg = 'Sugestões de IA:\n\n';
          msg += 'Títulos:\n';
          result.titulos.forEach((t: string, i: number) => { msg += `${i + 1}. ${t}\n`; });
          msg += '\nObjetivos:\n';
          result.objetivos.forEach((o: string, i: number) => { msg += `${i + 1}. ${o}\n`; });
          msg += '\nBenefícios:\n';
          result.beneficios.forEach((b: string, i: number) => { msg += `${i + 1}. ${b}\n`; });
          msg += '\nCTAs:\n';
          result.ctas.forEach((c: string, i: number) => { msg += `${i + 1}. ${c}\n`; });
          toast({
            title: 'Sugestões de Campanha',
            description: msg,
            variant: 'default',
          });
        }
      }
    } catch (error: any) {
      console.error('[AnuncianteAI] Erro:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível gerar o conteúdo da IA.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }, [activeFeature, usuario, toast]);

  return (
    <>
      <div className="hidden sm:block">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 hover:text-primary"
          aria-label="Acesso à Inteligência Artificial"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-white/10">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-primary" /> Inteligência Artificial para Anunciantes
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Ferramentas de IA para gerar títulos, textos, campanhas e mais para sua mídia
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-2 justify-end pt-4">
          <Button variant="outline" onClick={handleClose} className="border-white/10 text-slate-300">
            Cancelar
          </Button>
          <Button
            disabled={loading}
            className="bg-primary hover:bg-primary/90 text-white gap-2"
            onClick={handleGenerate}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Gerar
              </>
            )}
          </Button>
        </DialogFooter>

        <div className="p-6 space-y-6">
          <p className="text-slate-400 text-sm">
            Escolha uma ferramenta de IA para gerar conteúdo para suas campanhas
          </p>

          <div className="grid grid-cols-2 gap-3">
            {IA_FEATURES.map((feature) => (
              <Button
                key={feature.id}
                variant="ghost"
                size="icon"
                onClick={() => handleFeatureSelect(feature)}
                className={cn(
                  'p-2 rounded-xl transition-all',
                  activeFeature?.id === feature.id ? 'bg-primary/20 text-primary border-primary/30' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                )}
                title={feature.description}
              >
                <feature.icon className="h-5 w-5" />
                <span className="text-[10] sm:text-xs">{feature.name}</span>
              </Button>
            ))}
          </div>

          {activeFeature && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <h3 className="text-sm text-slate-400 mb-2">Detalhes</h3>
              <p className="text-slate-500 text-xs">
                {activeFeature.description}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
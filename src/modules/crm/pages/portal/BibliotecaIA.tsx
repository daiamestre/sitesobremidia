import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { anunciateAiService } from '@/modules/crm/services/anuncianteAi.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tv, Megaphone, ShieldCheck, Calendar, CreditCard, MapPin, Loader2, Sparkles, Palette, Image as ImageIcon, Mic, Headphones, Zap } from 'lucide-react';
import { useClienteModalidade } from '../../hooks/useClienteModalidade';

export default function BibliotecaIA() {
  const { usuario, empresaOperadoraId } = useAuth();
  const navigate = useNavigate();
  const { modalidade } = useClienteModalidade();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const gerarTitulo = async () => {
    setLoading(true);
    try {
      const titulo = await anunciateAiService.gerarTitulo({
        objetivo: 'Vendas e Ofertas',
        produto_servico: 'Digital Signage',
        publico_alvo: 'Empresas locais',
        estilo: 'profissional',
      });
      toast({
        title: 'Título Gerado',
        description: `“${titulo}”`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível gerar o título.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const gerarTexto = async () => {
    setLoading(true);
    try {
      const texto = await anunciateAiService.gerarTextoAnuncio({
        descricao: 'Promoção especial para novos clientes',
        produto_servico: 'Telas digitais',
        beneficios: 'Alcance segmentado, medição precisa',
        chamado_acao: 'Saiba Mais',
        tono: 'profissional',
      });
      toast({
        title: 'Texto Gerado',
        description: texto.substring(0, 100) + (texto.length > 100 ? '...' : ''),
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível gerar o texto.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const gerarCTA = async () => {
    setLoading(true);
    try {
      const cta = await anunciateAiService.gerarCTA({
        estilo: 'direto',
        contexto: 'Campanha de lançamento',
      });
      toast({
        title: 'CTA Gerado',
        description: cta,
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível gerar o CTA.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const sugerirCampanhas = async () => {
    setLoading(true);
    try {
      const sugestoes = await anunciateAiService.sugerirCampanhas(empresaOperadoraId);
      let msg = 'Sugestões de IA:\n\n';
      msg += 'Títulos:\n';
      (sugestoes.titulos || []).forEach((t: string, i: number) => { msg += `${i + 1}. ${t}\n`; });
      msg += '\nObjetivos:\n';
      (sugestoes.objetivos || []).forEach((o: string, i: number) => { msg += `${i + 1}. ${o}\n`; });
      msg += '\nBenefícios:\n';
      (sugestoes.beneficios || []).forEach((b: string, i: number) => { msg += `${i + 1}. ${b}\n`; });
      msg += '\nCTAs:\n';
      (sugestoes.ctas || []).forEach((c: string, i: number) => { msg += `${i + 1}. ${c}\n`; });
      toast({
        title: 'Sugestões de Campanha',
        description: msg,
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível gerar sugestões.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const analisarDesempenho = async () => {
    setLoading(true);
    try {
      const relatorio = await anunciateAiService.analisarDesempenhoCampanhas(empresaOperadoraId);
      toast({
        title: 'Relatório de Desempenho',
        description: relatorio.substring(0, 500) + (relatorio.length > 500 ? '...' : ''),
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível analisar o desempenho.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const sugerirPontos = async () => {
    setLoading(true);
    try {
      const pontos = await anunciateAiService.sugerirPontos(
        'pontos perto de mim',
        empresaOperadoraId
      );
      if (!pontos || pontos.length === 0) {
        toast({
          title: 'Nenhum Ponto Encontrado',
          description: 'Tente ajustar a busca ou use filtros mais específicos.',
          variant: 'destructive',
        });
        return;
      }
      let msg = `Encontrados ${pontos.length} ponto(s):\n\n`;
      pontos.slice(0, 5).forEach((p: any, i: number) => {
        msg += `${i + 1}. ${p.nome} - ${p.cidade} - ${p.quantidade_telas} telas\n`;
      });
      if (pontos.length > 5) {
        msg += `\n+${pontos.length - 5} mais pontos disponíveis.`;
      }
      toast({
        title: 'Sugestões de Pontos',
        description: msg,
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível buscar pontos.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-slate-400">Carregando biblioteca IA...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <Card className="border border-white/10 bg-slate-900/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Biblioteca IA
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-slate-400 text-sm mb-6">
            Ferramentas de Inteligência Artificial para ajudar seu negócio a criar campanhas, textos e encontrar os melhores pontos de mídia.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Gerar Título */}
            <Button
              variant="outline"
              size="lg"
              onClick={gerarTitulo}
              className="w-full justify-start px-4 py-3 rounded-xl transition-colors hover:bg-primary/10 hover:text-primary"
              disabled={modalidade !== 'ANUNCIANTE'}
            >
              <Tv className="h-4 w-4 mr-3" />
              <span>Gerar Título de Campanha</span>
            </Button>

            {/* Gerar Texto */}
            <Button
              variant="outline"
              size="lg"
              onClick={gerarTexto}
              className="w-full justify-start px-4 py-3 rounded-xl transition-colors hover:bg-primary/10 hover:text-primary"
              disabled={modalidade !== 'ANUNCIANTE'}
            >
              <Megaphone className="h-4 w-4 mr-3" />
              <span>Gerar Texto de Anúncio</span>
            </Button>

            {/* Gerar CTA */}
            <Button
              variant="outline"
              size="lg"
              onClick={gerarCTA}
              className="w-full justify-start px-4 py-3 rounded-xl transition-colors hover:bg-primary/10 hover:text-primary"
              disabled={modalidade !== 'ANUNCIANTE'}
            >
              <CreditCard className="h-4 w-4 mr-3" />
              <span>Gerar CTA</span>
            </Button>

            {/* Sugestão de Campanha */}
            <Button
              variant="outline"
              size="lg"
              onClick={sugerirCampanhas}
              className="w-full justify-start px-4 py-3 rounded-xl transition-colors hover:bg-primary/10 hover:text-primary"
              disabled={modalidade !== 'ANUNCIANTE'}
            >
              <Sparkles className="h-4 w-4 mr-3" />
              <span>Sugestão de Campanha</span>
            </Button>

            {/* Analisar Desempenho */}
            <Button
              variant="outline"
              size="lg"
              onClick={analisarDesempenho}
              className="w-full justify-start px-4 py-3 rounded-xl transition-colors hover:bg-primary/10 hover:text-primary"
              disabled={modalidade !== 'ANUNCIANTE'}
            >
              <Zap className="h-4 w-4 mr-3" />
              <span>Analisar Desempenho</span>
            </Button>

            {/* Buscar Pontos */}
            <Button
              variant="outline"
              size="lg"
              onClick={sugerirPontos}
              className="w-full justify-start px-4 py-3 rounded-xl transition-colors hover:bg-primary/10 hover:text-primary"
              disabled={modalidade !== 'ANUNCIANTE'}
            >
              <MapPin className="h-4 w-4 mr-3" />
              <span>Buscar Pontos IA</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
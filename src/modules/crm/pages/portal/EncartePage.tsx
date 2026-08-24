import React, { useState, useEffect, useRef } from 'react';
import { useClienteModalidade } from '@/modules/crm/hooks/useClienteModalidade';
import { customerCommerceService } from '@/modules/crm/services/customerCommerce.service';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Download, Share2, Plus, Loader2, Link as LinkIcon, Save } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { EncartePreview } from '@/modules/crm/components/portal/EncartePreview';
import { formatCurrency } from '@/utils/formatters';

export default function EncartePage() {
  const { cliente, isLoading } = useClienteModalidade();
  const [ofertasDisponiveis, setOfertasDisponiveis] = useState<any[]>([]);
  const [ofertasSelecionadas, setOfertasSelecionadas] = useState<string[]>([]);
  const [titulo, setTitulo] = useState('Ofertas Especiais');
  const [descricao, setDescricao] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingOfertas, setIsLoadingOfertas] = useState(true);
  
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cliente?.id) {
      carregarOfertas();
    }
  }, [cliente]);

  const carregarOfertas = async () => {
    setIsLoadingOfertas(true);
    try {
      const data = await customerCommerceService.listarOfertasParaEncarte(cliente!.id);
      setOfertasDisponiveis(data);
    } catch (err) {
      toast.error('Erro ao carregar ofertas');
    } finally {
      setIsLoadingOfertas(false);
    }
  };

  const handleToggleOferta = (ofertaId: string) => {
    setOfertasSelecionadas(prev => 
      prev.includes(ofertaId) 
        ? prev.filter(id => id !== ofertaId)
        : [...prev, ofertaId]
    );
  };

  const handleSave = async () => {
    if (!cliente?.id) return;
    if (ofertasSelecionadas.length === 0) {
      toast.error('Selecione pelo menos uma oferta para o encarte.');
      return;
    }

    try {
      setIsSaving(true);
      const tenantId = (await supabase.rpc('get_user_tenant_id')).data;
      
      const encarteId = await customerCommerceService.criarEncarte({
        cliente_id: cliente.id,
        empresa_operadora_id: tenantId as string,
        titulo,
        descricao,
      }, ofertasSelecionadas);

      if (encarteId) {
        toast.success('Encarte salvo com sucesso!');
        // Aqui poderia gerar e copiar o link público com base na view `vw_encartes_publicos`
      } else {
        throw new Error('Falha ao salvar');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar encarte.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    if (ofertasSelecionadas.length === 0) {
      toast.error('Selecione pelo menos uma oferta para gerar o PDF.');
      return;
    }
    window.print();
  };

  if (isLoading || isLoadingOfertas) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-12 w-[300px]" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  // Mapeia os IDs selecionados para os objetos completos para o preview
  const ofertasParaPreview = ofertasSelecionadas
    .map(id => ofertasDisponiveis.find(o => o.id === id))
    .filter(Boolean);

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Encarte Digital</h1>
          <p className="text-muted-foreground mt-1">
            Selecione as ofertas ativas para gerar e compartilhar seu encarte promocional.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Download className="mr-2 h-4 w-4" /> Exportar PDF
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar Encarte
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Lado Esquerdo: Configurações e Seleção (Oculto na impressão) */}
        <div className="xl:col-span-5 space-y-6 print:hidden">
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações do Encarte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Título Principal</Label>
                <Input 
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Ofertas da Semana"
                />
              </div>
              <div className="space-y-2">
                <Label>Subtítulo / Descrição (Opcional)</Label>
                <Input 
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Aproveite os melhores preços até domingo!"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex justify-between items-center">
                <span>Selecionar Ofertas</span>
                <span className="text-sm font-normal text-muted-foreground bg-secondary px-2 py-1 rounded">
                  {ofertasSelecionadas.length} de {ofertasDisponiveis.length} selecionadas
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ofertasDisponiveis.length === 0 ? (
                <div className="text-center p-6 border border-dashed rounded-lg bg-muted/30">
                  <p className="text-muted-foreground mb-4">Você não possui ofertas ativas no momento.</p>
                  <Button variant="outline" asChild>
                    <a href="/portal/ofertas">Ir para Ofertas</a>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {ofertasDisponiveis.map(oferta => {
                    const prod = oferta.produto;
                    const isSelected = ofertasSelecionadas.includes(oferta.id);
                    
                    return (
                      <div 
                        key={oferta.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                        onClick={() => handleToggleOferta(oferta.id)}
                      >
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => handleToggleOferta(oferta.id)}
                          className="mt-1"
                        />
                        <div className="flex gap-3 flex-1 overflow-hidden">
                          {prod?.imagem_url ? (
                            <img src={prod.imagem_url} alt={prod.nome} className="w-12 h-12 object-cover rounded bg-white" />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                              Sem img
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{oferta.titulo || prod?.nome}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-primary font-bold text-sm">{formatCurrency(oferta.preco_promocional)}</span>
                              {prod?.preco_venda && (
                                <span className="text-muted-foreground line-through text-xs">{formatCurrency(prod.preco_venda)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Lado Direito: Preview (Este é o único lado impresso) */}
        <div className="xl:col-span-7 bg-muted/30 rounded-xl p-8 border border-dashed overflow-x-auto print:p-0 print:border-none print:m-0 print:bg-transparent flex justify-center">
          <EncartePreview 
            ref={printRef}
            cliente={cliente}
            ofertas={ofertasParaPreview}
            titulo={titulo}
            descricao={descricao}
          />
        </div>

      </div>
    </div>
  );
}

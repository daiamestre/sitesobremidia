import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Sparkles, MapPin, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { aiPointSearchService, PointSearchResult, PointSearchFilters } from '../../services/aiPointSearch.service';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AIPointSearchProps {
  onSelectPoint?: (point: PointSearchResult) => void;
  empresaOperadoraId?: string;
  initialFilters?: PointSearchFilters;
}

export function AIPointSearch({ 
  onSelectPoint, 
  empresaOperadoraId, 
  initialFilters 
}: AIPointSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PointSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<'ai' | 'filters'>('ai');
  const [filters, setFilters] = useState<PointSearchFilters>(initialFilters || {});
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    if (!query.trim() && searchMode === 'ai') return;
    setLoading(true);
    try {
      let data: PointSearchResult[];
      if (searchMode === 'ai') {
        data = await aiPointSearchService.searchWithAI(query, empresaOperadoraId);
      } else {
        data = await aiPointSearchService.searchWithFilters(filters, empresaOperadoraId);
      }
      setResults(data);
      if (data.length === 0) {
        toast({ title: 'Nenhum ponto encontrado', description: 'Tente ajustar sua busca ou filtros.', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      toast({ title: 'Erro', description: 'Não foi possível realizar a busca.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && searchMode === 'ai') {
        handleSearch();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchMode]);

  const handleFilterChange = (key: keyof PointSearchFilters, value: string | number | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
    setResults([]);
  };

  const handleResultClick = (point: PointSearchResult) => {
    onSelectPoint?.(point);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            ref={inputRef}
            placeholder={searchMode === 'ai' 
              ? 'Ex: "pontos perto de supermercados", "perto do meu bairro", "onde anunciar em Curitiba"' 
              : 'Buscar por nome, cidade, endereço...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-10 bg-slate-900 border-white/10 text-white"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              onClick={() => setQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button
          variant={searchMode === 'ai' ? 'default' : 'outline'}
          onClick={() => setSearchMode('ai')}
          className="gap-1"
        >
          <Sparkles className="h-4 w-4" /> IA
        </Button>
        <Button
          variant={searchMode === 'filters' ? 'default' : 'outline'}
          onClick={() => setShowFilters(true)}
          className="gap-1"
        >
          <Filter className="h-4 w-4" /> Filtros
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-slate-400">Buscando pontos inteligentes...</span>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">
            {results.length} ponto{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
            {results.map((point) => (
              <button
                key={point.unidade_id}
                onClick={() => handleResultClick(point)}
                className={cn(
                  'text-left p-4 rounded-xl border transition-all',
                  'border-white/10 bg-slate-900/50 hover:bg-slate-800/50 hover:border-primary/30'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-bold text-white text-sm truncate">{point.nome}</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                    {point.quantidade_telas} tela{point.quantidade_telas !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1 mb-1">
                  <MapPin className="h-3 w-3" /> {point.cidade} — {point.estado}
                </p>
                <p className="text-xs text-slate-500 truncate mb-2">{point.endereco}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{point.rede_nome}</span>
                  <span className="text-emerald-400 font-bold">R$ {Number(point.valor_unitario).toFixed(2).replace('.', ',')}/mês</span>
                </div>
                {point.distancia_km && (
                  <p className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> ~{point.distancia_km.toFixed(1)} km de você
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && query && (
        <div className="text-center py-8 text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
          <Sparkles className="h-8 w-8 mx-auto text-slate-600 mb-2" />
          <p className="font-medium">Nenhum ponto encontrado para: "{query}"</p>
          <p className="text-sm mt-1">Tente termos diferentes ou use os filtros avançados.</p>
        </div>
      )}

      <Dialog open={showFilters} onOpenChange={setShowFilters}>
        <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Filter className="h-5 w-5 text-primary" /> Filtros Avançados
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Refine sua busca por localização, tipo de estabelecimento e mais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs block">Cidade</Label>
              <Input
                placeholder="Ex: Curitiba"
                value={filters.cidade || ''}
                onChange={(e) => handleFilterChange('cidade', e.target.value)}
                className="bg-slate-900 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs block">Estado (UF)</Label>
              <Select value={filters.estado || ''} onValueChange={(v) => handleFilterChange('estado', v)}>
                <SelectTrigger className="bg-slate-900 border-white/10 text-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white">
                  {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs block">Bairro / Região</Label>
              <Input
                placeholder="Ex: Centro, Batel, Jardim Botânico"
                value={filters.bairro || ''}
                onChange={(e) => handleFilterChange('bairro', e.target.value)}
                className="bg-slate-900 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs block">Tipo de Estabelecimento (Rede)</Label>
              <Input
                placeholder="Ex: Supermercado, Shopping, Hotel, Farmácia"
                value={filters.tipo_estabelecimento || ''}
                onChange={(e) => handleFilterChange('tipo_estabelecimento', e.target.value)}
                className="bg-slate-900 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-xs block">Raio de busca (km)</Label>
              <Select value={filters.raio_km?.toString() || ''} onValueChange={(v) => handleFilterChange('raio_km', v ? Number(v) : undefined)}>
                <SelectTrigger className="bg-slate-900 border-white/10 text-white"><SelectValue placeholder="Qualquer distância" /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white">
                  <SelectItem value="5">5 km</SelectItem>
                  <SelectItem value="10">10 km</SelectItem>
                  <SelectItem value="25">25 km</SelectItem>
                  <SelectItem value="50">50 km</SelectItem>
                  <SelectItem value="100">100 km</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogContent className="flex gap-2 justify-end border-t border-white/10 pt-4">
            <Button variant="outline" onClick={clearFilters} className="border-white/10 text-slate-300">
              Limpar
            </Button>
            <Button onClick={() => { setSearchMode('filters'); handleSearch(); setShowFilters(false); }} className="bg-primary hover:bg-primary/90 text-white">
              Aplicar Filtros
            </Button>
          </DialogContent>
        </DialogContent>
      </Dialog>
    </div>
  );
}
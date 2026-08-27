import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MapPin, Plus, Loader2, Pencil, Search, Store,
  ToggleLeft, ToggleRight, AlertCircle,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import type { CommerceDatabase, PontoParceiroInsert } from '@/types/customerPortalDb';
import { formatCurrency } from '@/utils/formatters';

// ──────────────────────────────────────────────────────────────────────
// CADASTRO DE PONTOS PARCEIROS (missão §30–§31)
// Entidade central `pontos` alimentando TODO o sistema: marketplace do
// portal (listar_pontos_para_anunciar), Meus Pontos, KPIs, contratos e
// expansão. Escrita protegida por RLS (pontos_interno_insert/update).
// Não duplica estabelecimentos: vincula-se a `unidades` quando existir.
// ──────────────────────────────────────────────────────────────────────

interface PontoParceiroRow {
  id: string;
  nome: string;
  categoria?: string | null;
  descricao?: string | null;
  foto_url?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  quantidade_telas: number;
  valor_anuncio?: number | null;
  periodicidade: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL' | 'UNICO';
  disponibilidade: 'DISPONIVEL' | 'RESERVADO' | 'INDISPONIVEL';
  status_operacional: 'ATIVO' | 'INATIVO' | 'MANUTENCAO';
  regras_comerciais?: string | null;
  ativo: boolean;
}

interface FormPonto {
  nome: string;
  categoria: string;
  descricao: string;
  foto_url: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  quantidade_telas: number;
  valor_anuncio: string;
  periodicidade: PontoParceiroRow['periodicidade'];
  disponibilidade: PontoParceiroRow['disponibilidade'];
  regras_comerciais: string;
}

const FORM_VAZIO: FormPonto = {
  nome: '', categoria: '', descricao: '', foto_url: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '',
  cidade: '', estado: '', quantidade_telas: 1, valor_anuncio: '',
  periodicidade: 'MENSAL', disponibilidade: 'DISPONIVEL', regras_comerciais: '',
};

const DISPONIBILIDADE_BADGE: Record<string, string> = {
  DISPONIVEL: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  RESERVADO: 'bg-amber-100 text-amber-700 border-amber-200',
  INDISPONIVEL: 'bg-rose-100 text-rose-700 border-rose-200',
};

// Cliente tipado com as tabelas/RPCs do portal (padrão customerPortalDb —
// o Database gerado pelo CLI ainda não inclui `pontos`).
const db = supabase as unknown as SupabaseClient<CommerceDatabase>;

// Escritas: postgrest-js resolve `Update` como never para tabelas estendidas
// (limitação conhecida do padrão acima) — adaptador estreito e tipado.
type DbError = { message: string } | null;
const pontosWrite = () =>
  db.from('pontos') as unknown as {
    update: (v: Partial<PontoParceiroRow>) => {
      eq: (col: 'id', val: string) => Promise<{ error: DbError }>;
    };
    insert: (v: PontoParceiroInsert) => Promise<{ error: DbError }>;
  };

export default function PontosParceirosPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormPonto>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const { data: pontos = [], isLoading, error } = useQuery({
    queryKey: ['pontos-parceiros'],
    queryFn: async () => {
      const { data, error } = await db
        .from('pontos')
        .select('*')
        .is('deleted_at', null)
        .order('nome');
      if (error) throw new Error(error.message);
      return data as unknown as PontoParceiroRow[];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pontos;
    return pontos.filter((p) =>
      [p.nome, p.categoria, p.cidade, p.estado, p.bairro]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    );
  }, [pontos, busca]);

  const abrirNovo = () => {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setErroForm(null);
    setDialogAberto(true);
  };

  const abrirEdicao = (p: PontoParceiroRow) => {
    setForm({
      nome: p.nome ?? '',
      categoria: p.categoria ?? '',
      descricao: p.descricao ?? '',
      foto_url: p.foto_url ?? '',
      cep: p.cep ?? '',
      logradouro: p.logradouro ?? '',
      numero: p.numero ?? '',
      complemento: p.complemento ?? '',
      bairro: p.bairro ?? '',
      cidade: p.cidade ?? '',
      estado: p.estado ?? '',
      quantidade_telas: p.quantidade_telas ?? 1,
      valor_anuncio: p.valor_anuncio != null ? String(p.valor_anuncio) : '',
      periodicidade: p.periodicidade ?? 'MENSAL',
      disponibilidade: p.disponibilidade ?? 'DISPONIVEL',
      regras_comerciais: p.regras_comerciais ?? '',
    });
    setEditandoId(p.id);
    setErroForm(null);
    setDialogAberto(true);
  };

  const salvar = async () => {
    if (form.nome.trim().length < 2) {
      setErroForm('Informe o nome do ponto.');
      return;
    }
    setSalvando(true);
    setErroForm(null);
    try {
      const payload: PontoParceiroInsert = {
        nome: form.nome.trim(),
        categoria: form.categoria.trim() || null,
        descricao: form.descricao.trim() || null,
        foto_url: form.foto_url.trim() || null,
        cep: form.cep.trim() || null,
        logradouro: form.logradouro.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        estado: form.estado.trim().toUpperCase().slice(0, 2) || null,
        quantidade_telas: Math.max(0, Number(form.quantidade_telas) || 0),
        valor_anuncio: form.valor_anuncio.trim() ? Number(form.valor_anuncio.replace(',', '.')) : null,
        periodicidade: form.periodicidade,
        disponibilidade: form.disponibilidade,
        regras_comerciais: form.regras_comerciais.trim() || null,
      };
      if (editandoId) {
        const { error } = await pontosWrite().update(payload).eq('id', editandoId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await pontosWrite().insert(payload);
        if (error) throw new Error(error.message);
      }
      qc.invalidateQueries({ queryKey: ['pontos-parceiros'] });
      setDialogAberto(false);
    } catch (e: any) {
      setErroForm(e?.message || 'Erro ao salvar ponto.');
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (p: PontoParceiroRow) => {
    const { error } = await pontosWrite().update({ ativo: !p.ativo }).eq('id', p.id);
    if (!error) qc.invalidateQueries({ queryKey: ['pontos-parceiros'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" /> Pontos Parceiros
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inventário comercial da rede — alimenta o marketplace "Pontos para Anunciar",
            os KPIs dos anunciantes e as expansões de contrato.
          </p>
        </div>
        <Button onClick={abrirNovo} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Ponto Parceiro
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, categoria ou cidade…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-10 text-center space-y-2">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
            <p className="font-semibold">Falha ao carregar pontos</p>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ponto</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead className="text-center">Telas</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Disponibilidade</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      Nenhum ponto parceiro cadastrado{busca ? ' para esta busca' : ''}.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((p) => (
                    <TableRow key={p.id} className={!p.ativo ? 'opacity-50' : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {p.foto_url ? (
                            <img src={p.foto_url} alt={p.nome} className="h-10 w-10 rounded-lg object-cover border" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium leading-tight">{p.nome}</p>
                            {p.categoria && <p className="text-xs text-muted-foreground">{p.categoria}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[p.bairro, p.cidade, p.estado].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                      <TableCell className="text-center">{p.quantidade_telas}</TableCell>
                      <TableCell className="text-sm">
                        {p.valor_anuncio != null ? (
                          <>
                            <strong>{formatCurrency(Number(p.valor_anuncio))}</strong>
                            <span className="text-xs text-muted-foreground">
                              {p.periodicidade === 'MENSAL' ? '/mês' : `/${p.periodicidade.toLowerCase()}`}
                            </span>
                          </>
                        ) : 'sob consulta'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={DISPONIBILIDADE_BADGE[p.disponibilidade]}>
                          {p.disponibilidade}
                        </Badge>
                        {!p.ativo && <Badge variant="secondary" className="ml-1">inativo</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(p)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => alternarAtivo(p)}
                            title={p.ativo ? 'Desativar ponto' : 'Reativar ponto'}
                          >
                            {p.ativo ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogAberto} onOpenChange={(o) => !salvando && setDialogAberto(o)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId ? 'Editar Ponto Parceiro' : 'Novo Ponto Parceiro'}</DialogTitle>
            <DialogDescription>
              Identificação, localização, mídia e condições comerciais do ponto.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Padaria São José" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Padaria / Supermercado / Academia" />
            </div>
            <div className="space-y-1.5">
              <Label>Foto principal (URL)</Label>
              <Input value={form.foto_url} onChange={(e) => setForm({ ...form, foto_url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Fluxo, público e destaques do ponto." />
            </div>

            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} placeholder="00000-000" />
            </div>
            <div className="space-y-1.5">
              <Label>Logradouro</Label>
              <Input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Input value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} placeholder="PE" maxLength={2} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pp-telas" className="text-sm font-medium">Quantidade de telas/pontos internos</label>
              <Input
                id="pp-telas"
                type="number"
                min={0}
                value={form.quantidade_telas}
                onChange={(e) => setForm({ ...form, quantidade_telas: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor para anunciar (R$)</Label>
              <Input value={form.valor_anuncio} onChange={(e) => setForm({ ...form, valor_anuncio: e.target.value })} placeholder="199,90" inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Periodicidade</Label>
              <select
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background"
                value={form.periodicidade}
                onChange={(e) => setForm({ ...form, periodicidade: e.target.value as FormPonto['periodicidade'] })}
              >
                <option value="MENSAL">Mensal</option>
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="SEMESTRAL">Semestral</option>
                <option value="ANUAL">Anual</option>
                <option value="UNICO">Único</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Disponibilidade</Label>
              <select
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background"
                value={form.disponibilidade}
                onChange={(e) => setForm({ ...form, disponibilidade: e.target.value as FormPonto['disponibilidade'] })}
              >
                <option value="DISPONIVEL">Disponível</option>
                <option value="RESERVADO">Reservado</option>
                <option value="INDISPONIVEL">Indisponível</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Regras comerciais</Label>
              <Textarea rows={2} value={form.regras_comerciais} onChange={(e) => setForm({ ...form, regras_comerciais: e.target.value })} placeholder="Ex.: exclusividade por segmento, horário de veiculação…" />
            </div>
          </div>

          {erroForm && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {erroForm}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={salvando} onClick={() => setDialogAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {editandoId ? 'Salvar alterações' : 'Cadastrar ponto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

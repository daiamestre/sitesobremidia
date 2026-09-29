import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Camera, ClipboardCheck, ImagePlus, Loader2, MapPin, Monitor, Plus, Save, Store, Trash2, Tv, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { enviarImagemR2, precoTela } from '@/lib/enviarImagem';
import { montarRegrasComerciais, type NovoPontoParceiroPayload } from '@/services/prospeccao.service';
import { TelaParceiraDialog, type TelaParceiraEditavel } from '../components/TelaParceiraDialog';

/**
 * F-119 — Edição completa do ponto parceiro (OWNER/ADMIN): capa, fotos dos locais, dados, responsável, endereço,
 * estrutura & público, comercial, ativo/disponibilidade e as TELAS do ponto (criar nova, editar, valor 0 = grátis).
 * Mesmos campos do cadastro completo (7 etapas); o formulário do cadastro fica em pontos.dados_cadastro.
 * Gravação: RPC fn_atualizar_ponto_parceiro.
 */
interface Form {
  nomeFantasia: string; razaoSocial: string; cnpjCpf: string; categoria: string; descricaoPublica: string;
  responsavelNome: string; responsavelCargo: string; telefone: string; whatsapp: string; email: string; siteRedes: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; estado: string; referencia: string;
  latitude: string; longitude: string;
  horarioFuncionamento: string; fluxoDiario: string; perfilPublico: string; ambientes: string; localizacaoTelas: string; observacoes: string;
  modeloComercial: 'PERMUTA' | 'COMISSIONADO'; permutaDescricao: string; permutaContrapartida: string; permutaPeriodo: string;
  percentualComissao: number | null; baseCalculo: string; vigencia: string; contratoObservacao: string;
  disponibilidade: 'DISPONIVEL' | 'RESERVADO' | 'INDISPONIVEL'; ativo: boolean;
}
interface Foto { url: string; legenda?: string | null; credito?: string | null }
interface Ponto {
  id: string; nome: string; categoria: string | null; descricao: string | null; foto_url: string | null; galeria: Foto[] | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null;
  cidade: string | null; estado: string | null; latitude: number | null; longitude: number | null;
  horario_funcionamento: string | null; publico_estimado_dia: number | null; regras_comerciais: string | null;
  modelo_comercial: string | null; disponibilidade: Form['disponibilidade']; ativo: boolean; dados_cadastro: Record<string, unknown> | null;
}
interface TelaLinha extends TelaParceiraEditavel { status_grade: string | null; last_ping_at: string | null; playlist: { name: string } | null }

/** Lê "Chave: valor" da descrição/regras montadas pelo cadastro antigo (pontos sem dados_cadastro). */
const pegar = (texto: string | null, chave: string) => {
  const m = (texto ?? '').match(new RegExp(`${chave}:\\s*([^|\\n]+)`, 'i'));
  return m ? m[1].trim() : '';
};

export function formularioDoPonto(p: Ponto): Form {
  const d = (p.dados_cadastro ?? {}) as Partial<Form> & Record<string, unknown>;
  const desc = p.descricao ?? '';
  const regras = p.regras_comerciais ?? '';
  const resp = pegar(desc, 'Responsavel');
  const contato = pegar(desc, 'Contato').split('/').map((x) => x.trim());
  const descricaoEhInterna = /Razao social:|CPF\/CNPJ:|Responsavel:/i.test(desc);
  return {
    nomeFantasia: p.nome ?? '',
    razaoSocial: String(d.razaoSocial ?? pegar(desc, 'Razao social')),
    cnpjCpf: String(d.cnpjCpf ?? pegar(desc, 'CPF/CNPJ')),
    categoria: p.categoria ?? String(d.categoria ?? ''),
    descricaoPublica: descricaoEhInterna ? '' : desc,
    responsavelNome: String(d.responsavelNome ?? resp.replace(/\s*\(.*\)$/, '')),
    responsavelCargo: String(d.responsavelCargo ?? (resp.match(/\((.*)\)/)?.[1] ?? '')),
    telefone: String(d.telefone ?? contato[0] ?? ''),
    whatsapp: String(d.whatsapp ?? contato[1] ?? ''),
    email: String(d.email ?? pegar(desc, 'E-mail')),
    siteRedes: String(d.siteRedes ?? pegar(regras, 'Site/redes')),
    cep: p.cep ?? '', logradouro: p.logradouro ?? '', numero: p.numero ?? '', complemento: p.complemento ?? '',
    bairro: p.bairro ?? '', cidade: p.cidade ?? '', estado: p.estado ?? '',
    referencia: String(d.referencia ?? pegar(regras, 'Ponto de referencia')),
    latitude: p.latitude != null ? String(p.latitude) : '', longitude: p.longitude != null ? String(p.longitude) : '',
    horarioFuncionamento: p.horario_funcionamento ?? String(d.horarioFuncionamento ?? pegar(regras, 'Horario de funcionamento')),
    fluxoDiario: p.publico_estimado_dia != null ? String(p.publico_estimado_dia) : String(d.fluxoDiario ?? pegar(regras, 'Fluxo diario estimado')),
    perfilPublico: String(d.perfilPublico ?? pegar(regras, 'Perfil do publico')),
    ambientes: String(d.ambientes ?? pegar(regras, 'Ambientes')),
    localizacaoTelas: String(d.localizacaoTelas ?? pegar(regras, 'Localizacao das telas')),
    observacoes: String(d.observacoes ?? ''),
    modeloComercial: (String(d.modeloComercial ?? p.modelo_comercial ?? '').toUpperCase().startsWith('PERMUTA') ? 'PERMUTA' : 'COMISSIONADO'),
    permutaDescricao: String(d.permutaDescricao ?? pegar(regras, 'PERMUTA - Descricao')),
    permutaContrapartida: String(d.permutaContrapartida ?? pegar(regras, 'PERMUTA - Contrapartida')),
    permutaPeriodo: String(d.permutaPeriodo ?? pegar(regras, 'PERMUTA - Periodo')),
    percentualComissao: (d.percentualComissao as number | null) ?? null,
    baseCalculo: String(d.baseCalculo ?? pegar(regras, 'Base de calculo')),
    vigencia: String(d.vigencia ?? pegar(regras, 'Vigencia')),
    contratoObservacao: String(d.contratoObservacao ?? pegar(regras, 'Contrato')),
    disponibilidade: p.disponibilidade ?? 'DISPONIVEL',
    ativo: p.ativo ?? true,
  };
}

function Secao({ icone: Icone, titulo, children }: { icone: React.ComponentType<{ className?: string }>; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold text-white"><Icone className="h-5 w-5 text-primary" /> {titulo}</h2>
      {children}
    </section>
  );
}
function Campo({ rotulo, valor, mudar, ...resto }: { rotulo: string; valor: string; mudar: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-300">{rotulo}</Label>
      <Input value={valor} onChange={(e) => mudar(e.target.value)} className="h-11 rounded-xl border-white/10 bg-slate-950/60 text-white" {...resto} />
    </div>
  );
}
function Area({ rotulo, valor, mudar, placeholder }: { rotulo: string; valor: string; mudar: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-300">{rotulo}</Label>
      <Textarea value={valor} onChange={(e) => mudar(e.target.value)} rows={3} placeholder={placeholder} className="rounded-xl border-white/10 bg-slate-950/60 text-white" />
    </div>
  );
}

export default function PontoParceiroEdicaoPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const base = location.pathname.startsWith('/dashboard') ? '/dashboard' : '/workspace';
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [capa, setCapa] = useState('');
  const [galeria, setGaleria] = useState<Foto[]>([]);
  const [subindo, setSubindo] = useState<'capa' | 'galeria' | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [telaAberta, setTelaAberta] = useState<{ tela: TelaParceiraEditavel | null } | null>(null);
  const inputCapa = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);

  const ponto = useQuery({
    queryKey: ['ponto-edicao', id],
    enabled: !!id,
    queryFn: async (): Promise<Ponto | null> => {
      const { data, error } = await supabase.from('pontos' as never).select('*').eq('id' as never, id as never).is('deleted_at' as never, null).maybeSingle();
      if (error) throw error;
      return data as unknown as Ponto | null;
    },
  });
  const telas = useQuery({
    queryKey: ['ponto-edicao-telas', id],
    enabled: !!id,
    queryFn: async (): Promise<TelaLinha[]> => {
      const { data, error } = await supabase.from('screens')
        .select('id, name, local_instalacao, foto_local_url, orientation, tamanho_polegadas, valor_anuncio, status_grade, last_ping_at, codigo_operacional, custom_id, playlist:playlists(name)' as never)
        .eq('ponto_id' as never, id as never).eq('tipo_tela' as never, 'PARCEIRA' as never);
      if (error) throw error;
      const num = (t: TelaLinha) => Number(t.name.match(/Tela (\d+)/)?.[1] ?? 999);
      return ((data ?? []) as unknown as TelaLinha[]).sort((a, b) => num(a) - num(b));
    },
  });

  useEffect(() => {
    if (ponto.data && !form) {
      setForm(formularioDoPonto(ponto.data));
      setCapa(ponto.data.foto_url ?? '');
      setGaleria(Array.isArray(ponto.data.galeria) ? ponto.data.galeria.filter((f) => f?.url) : []);
    }
  }, [ponto.data, form]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const enviarCapa = async (f?: File) => {
    if (!f) return; setSubindo('capa');
    try { setCapa(await enviarImagemR2(f)); } catch (e) { toast.error((e as Error).message); } finally { setSubindo(null); }
  };
  const enviarGaleria = async (files: FileList | null) => {
    if (!files?.length) return; setSubindo('galeria');
    try {
      const urls: Foto[] = [];
      for (const f of Array.from(files)) urls.push({ url: await enviarImagemR2(f), legenda: '' });
      setGaleria((g) => [...g, ...urls]);
    } catch (e) { toast.error((e as Error).message); } finally { setSubindo(null); }
  };

  const atualizarTudo = () => {
    qc.invalidateQueries({ queryKey: ['ponto-edicao', id] });
    qc.invalidateQueries({ queryKey: ['ponto-edicao-telas', id] });
    qc.invalidateQueries({ queryKey: ['pontos-parceiros'] });
    qc.invalidateQueries({ queryKey: ['telas-dos-pontos-parceiros'] });
    qc.invalidateQueries({ queryKey: ['telas-parceiras'] });
  };

  const salvar = async () => {
    if (!form) return;
    if (form.nomeFantasia.trim().length < 2) return toast.error('Informe o nome do ponto parceiro.');
    setSalvando(true);
    const payload: NovoPontoParceiroPayload = { ...form, nome: form.nomeFantasia, quantidadeTelas: telas.data?.length ?? 0 } as unknown as NovoPontoParceiroPayload;
    const { error } = await supabase.rpc('fn_atualizar_ponto_parceiro' as never, {
      p_ponto: id,
      p_dados: {
        nome: form.nomeFantasia.trim(), categoria: form.categoria, descricao: form.descricaoPublica, foto_url: capa || null, galeria,
        cep: form.cep, logradouro: form.logradouro, numero: form.numero, complemento: form.complemento, bairro: form.bairro,
        cidade: form.cidade, estado: form.estado, latitude: form.latitude.replace(',', '.'), longitude: form.longitude.replace(',', '.'),
        horario_funcionamento: form.horarioFuncionamento, publico_estimado_dia: form.fluxoDiario,
        regras_comerciais: montarRegrasComerciais(payload).join('\n'), modelo_comercial: form.modeloComercial,
        disponibilidade: form.disponibilidade, ativo: form.ativo,
        dados_cadastro: { ...form, fotoCapa: capa, fotos: galeria.map((f) => f.url) },
      },
    } as never);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success('Ponto parceiro atualizado.');
    atualizarTudo();
  };

  if (ponto.isLoading || (ponto.data && !form)) return <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-primary" />;
  if (!ponto.data || !form) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-12 text-center">
        <p className="text-slate-400">Ponto parceiro não encontrado.</p>
        <Link to={`${base}/pontos-parceiros`} className="text-primary hover:underline">Voltar aos pontos parceiros</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28" data-testid="edicao-ponto-parceiro">
      <Link to={`${base}/pontos-parceiros`} className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Pontos parceiros
      </Link>

      {/* Capa */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-800">
        {capa ? <img src={capa} alt={form.nomeFantasia} className="aspect-[21/9] w-full object-cover" /> : <div className="flex aspect-[21/9] items-center justify-center"><Store className="h-12 w-12 text-slate-600" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {form.categoria && <Badge className="mb-1 border-0 bg-primary/90 text-white">{form.categoria}</Badge>}
            <h1 className="text-xl font-extrabold leading-tight text-white sm:text-2xl">{form.nomeFantasia || 'Ponto parceiro'}</h1>
          </div>
          <Button size="sm" variant="secondary" className="gap-1 self-start sm:self-auto" disabled={subindo === 'capa'} onClick={() => inputCapa.current?.click()} data-testid="trocar-capa">
            {subindo === 'capa' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Trocar foto de capa
          </Button>
          <input ref={inputCapa} type="file" accept="image/*" className="hidden" onChange={(e) => { enviarCapa(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      {/* Situação */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-3 text-sm text-slate-200">
          <Switch checked={form.ativo} onCheckedChange={(v) => set('ativo', v)} /> {form.ativo ? 'Ponto ativo' : 'Ponto inativo (não aparece para anunciar)'}
        </label>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 p-1 text-xs">
          {(['DISPONIVEL', 'RESERVADO', 'INDISPONIVEL'] as const).map((d) => (
            <button key={d} type="button" onClick={() => set('disponibilidade', d)}
              className={`rounded-md px-2 py-1.5 font-medium ${form.disponibilidade === d ? 'bg-primary text-primary-foreground' : 'text-slate-400'}`}>
              {d === 'DISPONIVEL' ? 'Disponível' : d === 'RESERVADO' ? 'Reservado' : 'Indisponível'}
            </button>
          ))}
        </div>
      </div>

      {/* Telas do ponto */}
      <Secao icone={Monitor} titulo={`Telas do estabelecimento (${telas.data?.length ?? 0})`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="telas-do-ponto-edicao">
          {(telas.data ?? []).map((t) => (
            <button key={t.id} type="button" onClick={() => setTelaAberta({ tela: t })} data-testid="tela-editar"
              className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/60 text-left transition-colors hover:border-primary/50">
              {t.foto_local_url ? <img src={t.foto_local_url} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-slate-800"><Monitor className="h-8 w-8 text-slate-600" /></div>}
              <div className="space-y-1 p-3">
                <p className="text-sm font-semibold text-white">Tela {t.name.match(/Tela (\d+)/)?.[1] ?? ''} · {t.local_instalacao ?? '—'}</p>
                <p className="text-xs text-slate-400">{t.orientation === 'portrait' ? 'Em pé' : 'Deitada'}{t.tamanho_polegadas ? ` · ${t.tamanho_polegadas}"` : ''}</p>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Badge className={Number(t.valor_anuncio) === 0 ? 'border-0 bg-emerald-500/20 text-emerald-300' : 'border-0 bg-primary/20 text-primary'}>{precoTela(t.valor_anuncio)}{Number(t.valor_anuncio) > 0 ? '/mês' : ''}</Badge>
                  <Badge variant="outline" className="border-white/10 text-slate-300">{t.playlist ? 'Com grade' : 'Aguardando grade'}</Badge>
                </div>
              </div>
            </button>
          ))}
          <button type="button" onClick={() => setTelaAberta({ tela: null })} data-testid="adicionar-tela"
            className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 text-primary hover:bg-primary/5">
            <Plus className="h-6 w-6" /> <span className="text-sm font-semibold">Adicionar tela</span>
          </button>
        </div>
      </Secao>

      {/* Fotos dos locais */}
      <Secao icone={ImagePlus} titulo="Fotos de onde as telas estão">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="galeria-edicao">
          {galeria.map((f, i) => (
            <div key={f.url + i} className="space-y-1">
              <div className="relative overflow-hidden rounded-lg">
                <img src={f.url} alt={f.legenda ?? ''} className="aspect-square w-full object-cover" />
                <button type="button" aria-label="Remover foto" onClick={() => setGaleria((g) => g.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-md bg-black/70 p-1 text-white hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <Input value={f.legenda ?? ''} onChange={(e) => setGaleria((g) => g.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)))}
                placeholder="Legenda" className="h-8 border-white/10 bg-slate-950/60 text-xs text-white" />
            </div>
          ))}
          <button type="button" disabled={subindo === 'galeria'} onClick={() => inputGaleria.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-slate-400 hover:border-primary/50 hover:text-primary">
            {subindo === 'galeria' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}<span className="text-xs">Adicionar fotos</span>
          </button>
          <input ref={inputGaleria} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { enviarGaleria(e.target.files); e.target.value = ''; }} />
        </div>
      </Secao>

      <Secao icone={Store} titulo="Identificação">
        <Campo rotulo="Nome fantasia *" valor={form.nomeFantasia} mudar={(v) => set('nomeFantasia', v)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Razão social" valor={form.razaoSocial} mudar={(v) => set('razaoSocial', v)} />
          <Campo rotulo="CPF/CNPJ" valor={form.cnpjCpf} mudar={(v) => set('cnpjCpf', v)} />
        </div>
        <Campo rotulo="Categoria" valor={form.categoria} mudar={(v) => set('categoria', v)} placeholder="Supermercado / Padaria / Academia" />
        <Area rotulo="Descrição para os anunciantes" valor={form.descricaoPublica} mudar={(v) => set('descricaoPublica', v)} placeholder="Ex.: Farmácia de bairro com grande movimento no Centro." />
      </Secao>

      <Secao icone={User} titulo="Responsável">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome" valor={form.responsavelNome} mudar={(v) => set('responsavelNome', v)} />
          <Campo rotulo="Cargo" valor={form.responsavelCargo} mudar={(v) => set('responsavelCargo', v)} />
          <Campo rotulo="Telefone" valor={form.telefone} mudar={(v) => set('telefone', v)} inputMode="tel" />
          <Campo rotulo="WhatsApp" valor={form.whatsapp} mudar={(v) => set('whatsapp', v)} inputMode="tel" />
          <Campo rotulo="E-mail" valor={form.email} mudar={(v) => set('email', v)} type="email" />
          <Campo rotulo="Site / redes" valor={form.siteRedes} mudar={(v) => set('siteRedes', v)} />
        </div>
      </Secao>

      <Secao icone={MapPin} titulo="Endereço">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="CEP" valor={form.cep} mudar={(v) => set('cep', v)} inputMode="numeric" />
          <Campo rotulo="Logradouro" valor={form.logradouro} mudar={(v) => set('logradouro', v)} />
          <Campo rotulo="Número" valor={form.numero} mudar={(v) => set('numero', v)} />
          <Campo rotulo="Complemento" valor={form.complemento} mudar={(v) => set('complemento', v)} />
          <Campo rotulo="Bairro" valor={form.bairro} mudar={(v) => set('bairro', v)} />
          <Campo rotulo="Cidade" valor={form.cidade} mudar={(v) => set('cidade', v)} />
          <Campo rotulo="UF" valor={form.estado} mudar={(v) => set('estado', v.toUpperCase().slice(0, 2))} />
          <Campo rotulo="Ponto de referência" valor={form.referencia} mudar={(v) => set('referencia', v)} />
          <Campo rotulo="Latitude (mapa)" valor={form.latitude} mudar={(v) => set('latitude', v)} inputMode="decimal" placeholder="-8.28307" />
          <Campo rotulo="Longitude (mapa)" valor={form.longitude} mudar={(v) => set('longitude', v)} inputMode="decimal" placeholder="-35.97571" />
        </div>
      </Secao>

      <Secao icone={Tv} titulo="Estrutura & Público">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Horário de funcionamento" valor={form.horarioFuncionamento} mudar={(v) => set('horarioFuncionamento', v)} placeholder="Seg a sáb, 7h às 22h" />
          <Campo rotulo="Público por dia (pessoas)" valor={form.fluxoDiario} mudar={(v) => set('fluxoDiario', v)} inputMode="numeric" placeholder="900" />
        </div>
        <Area rotulo="Perfil do público" valor={form.perfilPublico} mudar={(v) => set('perfilPublico', v)} />
        <Area rotulo="Ambientes" valor={form.ambientes} mudar={(v) => set('ambientes', v)} />
        <Area rotulo="Observações" valor={form.observacoes} mudar={(v) => set('observacoes', v)} />
      </Secao>

      <Secao icone={ClipboardCheck} titulo="Comercial">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 p-1 text-sm">
          {(['COMISSIONADO', 'PERMUTA'] as const).map((m) => (
            <button key={m} type="button" onClick={() => set('modeloComercial', m)}
              className={`rounded-md px-2 py-2 font-medium ${form.modeloComercial === m ? 'bg-primary text-primary-foreground' : 'text-slate-400'}`}>
              {m === 'COMISSIONADO' ? 'Comissionado' : 'Permuta'}
            </button>
          ))}
        </div>
        {form.modeloComercial === 'PERMUTA' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="O que é trocado" valor={form.permutaDescricao} mudar={(v) => set('permutaDescricao', v)} />
            <Campo rotulo="Contrapartida" valor={form.permutaContrapartida} mudar={(v) => set('permutaContrapartida', v)} />
            <Campo rotulo="Período" valor={form.permutaPeriodo} mudar={(v) => set('permutaPeriodo', v)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Base de cálculo" valor={form.baseCalculo} mudar={(v) => set('baseCalculo', v)} />
            <Campo rotulo="Vigência" valor={form.vigencia} mudar={(v) => set('vigencia', v)} />
          </div>
        )}
        <Area rotulo="Observação do contrato" valor={form.contratoObservacao} mudar={(v) => set('contratoObservacao', v)} />
      </Secao>

      {/* Salvar (fixo no rodapé) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 p-3 backdrop-blur md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border">
        <Button className="w-full gap-2 md:w-auto" disabled={salvando || !!subindo} onClick={salvar} data-testid="salvar-ponto">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar alterações do ponto
        </Button>
      </div>

      <TelaParceiraDialog aberto={!!telaAberta} onFechar={() => setTelaAberta(null)} pontoId={id} tela={telaAberta?.tela ?? null} onSalvo={atualizarTudo} />
    </div>
  );
}

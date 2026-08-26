import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store, User, MapPin, Tv, Camera, ClipboardCheck,
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, Upload, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { prospeccaoService, type NovoPontoParceiroPayload } from '@/services/prospeccao.service';

// CADASTRO DE PONTO PARCEIRO pelo REPRESENTANTE (missao §11-§19).
// Entidade central `pontos` (codigo EST- automatico). Telas NAO sao
// duplicadas: quantidade_telas + detalhes em regras_comerciais; telas
// fisicas nascem pelo fluxo oficial (screens/telas). Fotos via R2.
const PASSOS = [
  { n: 1, label: 'Identificação', icon: Store },
  { n: 2, label: 'Responsável', icon: User },
  { n: 3, label: 'Endereço', icon: MapPin },
  { n: 4, label: 'Estrutura & Público', icon: Tv },
  { n: 5, label: 'Fotos', icon: Camera },
  { n: 6, label: 'Comercial & Revisão', icon: ClipboardCheck },
];

interface FormState {
  nomeFantasia: string;
  razaoSocial: string;
  cnpjCpf: string;
  categoria: string;
  responsavelNome: string;
  responsavelCargo: string;
  telefone: string;
  whatsapp: string;
  email: string;
  siteRedes: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  referencia: string;
  quantidadeTelas: number;
  ambientes: string;
  localizacaoTelas: string;
  horarioFuncionamento: string;
  fluxoDiario: string;
  perfilPublico: string;
  observacoes: string;
  modeloComercial: 'PERMUTA' | 'COMISSIONADO';
  permutaDescricao: string;
  permutaContrapartida: string;
  permutaPeriodo: string;
  percentualComissao: number | null;
  baseCalculo: string;
  vigencia: string;
  contratoObservacao: string;
}

const VAZIO: FormState = {
  nomeFantasia: '', razaoSocial: '', cnpjCpf: '', categoria: '',
  responsavelNome: '', responsavelCargo: '', telefone: '', whatsapp: '', email: '', siteRedes: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', referencia: '',
  quantidadeTelas: 1, ambientes: '', localizacaoTelas: '', horarioFuncionamento: '',
  fluxoDiario: '', perfilPublico: '', observacoes: '',
  modeloComercial: 'COMISSIONADO',
  permutaDescricao: '', permutaContrapartida: '', permutaPeriodo: '',
  percentualComissao: null, baseCalculo: '', vigencia: '', contratoObservacao: '',
};

function Campo({ label, value, onChange, placeholder, type, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; maxLength?: number;
}) {
  const campoId = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={campoId} className="text-slate-300 text-xs">{label}</Label>
      <Input
        id={campoId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        maxLength={maxLength}
        className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
      />
    </div>
  );
}

function Area({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-300 text-xs">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="bg-slate-950/60 border-white/10 text-white rounded-xl"
      />
    </div>
  );
}

export default function PontoParceiroWizardPage() {
  const navigate = useNavigate();
  const [passo, setPasso] = useState(1);
  const [form, setForm] = useState<FormState>(VAZIO);
  const [fotoCapa, setFotoCapa] = useState<string>('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [subindo, setSubindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<{ codigo: string | null } | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const resumo = useMemo(
    () => [
      ['Nome fantasia', form.nomeFantasia],
      ['Razão social', form.razaoSocial],
      ['CPF/CNPJ', form.cnpjCpf],
      ['Categoria', form.categoria],
      ['Responsável', [form.responsavelNome, form.responsavelCargo].filter(Boolean).join(' - ')],
      ['Contato', [form.telefone, form.whatsapp, form.email].filter(Boolean).join(' / ')],
      ['Endereço', [form.logradouro, form.numero, form.bairro, form.cidade, form.estado].filter(Boolean).join(', ')],
      ['Telas', String(form.quantidadeTelas)],
      ['Modelo comercial', form.modeloComercial],
      [
        form.modeloComercial === 'PERMUTA' ? 'Permuta' : 'Comissão',
        form.modeloComercial === 'PERMUTA'
          ? [form.permutaDescricao, form.permutaContrapartida, form.permutaPeriodo].filter(Boolean).join(' / ')
          : [form.percentualComissao != null ? form.percentualComissao + '%' : '', form.baseCalculo, form.vigencia]
              .filter(Boolean)
              .join(' / '),
      ],
    ] as Array<[string, string]>,
    [form]
  );

  const uploadFoto = async (file: File, capa: boolean) => {
    if (!file.type.startsWith('image/')) return setErro('Apenas imagens são aceitas.');
    if (file.size > 20 * 1024 * 1024) return setErro('Imagem acima de 20MB.');
    setErro(null);
    setSubindo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = (session?.user.id ?? 'anon') + '/pontos/' + Date.now() + '.' + ext;
      const inv = await supabase.functions.invoke('get-upload-url', {
        body: { bucket: 'clientes_assets', fileName, contentType: file.type },
      });
      if (inv.error || !inv.data?.uploadUrl || !inv.data?.publicUrl) throw new Error('Falha ao autorizar upload (R2).');
      const put = await fetch(inv.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error('Falha no envio ao R2.');
      if (capa) setFotoCapa(inv.data.publicUrl);
      else setFotos((prev) => [...prev, inv.data.publicUrl]);
    } catch (e: any) {
      setErro(e?.message || 'Falha no upload da foto.');
    } finally {
      setSubindo(false);
    }
  };

  const validarPasso = (): string | null => {
    if (passo === 1 && form.nomeFantasia.trim().length < 2) return 'Informe o nome fantasia do estabelecimento.';
    if (passo === 2 && form.telefone.trim().length < 8 && form.whatsapp.trim().length < 8)
      return 'Informe ao menos um contato (telefone ou WhatsApp).';
    if (passo === 6 && form.modeloComercial === 'COMISSIONADO') {
      if (form.percentualComissao == null || form.percentualComissao <= 0 || form.percentualComissao > 100)
        return 'Informe um percentual de comissão válido (ex.: 8 a 10 conforme contrato).';
    }
    return null;
  };

  const avancar = () => {
    const v = validarPasso();
    if (v) return setErro(v);
    setErro(null);
    setPasso((p) => Math.min(6, p + 1));
  };

  const concluir = async () => {
    const v = validarPasso();
    if (v) return setErro(v);
    setSalvando(true);
    setErro(null);
    try {
      const payload: NovoPontoParceiroPayload = {
        ...form,
        nome: form.nomeFantasia,
        fotoCapaUrl: fotoCapa || undefined,
        fotosUrls: fotos,
      };
      const r = await prospeccaoService.criarPontoParceiro(payload);
      setConcluido({ codigo: r.codigo_publico });
    } catch (e: any) {
      setErro(e?.message || 'Erro ao cadastrar ponto parceiro.');
    } finally {
      setSalvando(false);
    }
  };

  if (concluido) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <Card className="border-emerald-500/30 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardContent className="py-14 text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Ponto Parceiro cadastrado!</h2>
            {concluido.codigo && (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-sm px-3 py-1">
                {concluido.codigo}
              </Badge>
            )}
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              O estabelecimento ja esta disponivel para selecao nas prospecoes de anunciantes
              e aparecera no marketplace Pontos para Anunciar.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <button
                onClick={() => { setForm(VAZIO); setFotoCapa(''); setFotos([]); setConcluido(null); setPasso(1); }}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-200 text-sm hover:bg-white/5"
              >
                Cadastrar outro ponto
              </button>
              <button
                onClick={() => navigate('/representantes/dashboard')}
                className="px-5 py-2.5 rounded-xl gradient-primary glow-primary text-white text-sm font-bold"
              >
                Voltar ao dashboard
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-fade-in pb-12">
      <div className="p-5 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Store className="h-6 w-6 text-emerald-400" /> Novo Ponto Parceiro
        </h1>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {PASSOS.map((p) => {
            const Icon = p.icon;
            const ativo = p.n === passo;
            const feito = p.n < passo;
            const cls = ativo
              ? 'bg-primary text-white border-primary'
              : feito
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-background border-white/10 text-slate-500';
            return (
              <span key={p.n} className={'px-2.5 py-1 rounded-full text-[10px] font-semibold border flex items-center gap-1 ' + cls}>
                <Icon className="h-3 w-3" /> {p.n}. {p.label}
              </span>
            );
          })}
        </div>
      </div>

      <Card className="border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
        <CardHeader className="border-b border-white/10 pb-3">
          <CardTitle className="text-base font-bold text-white">{PASSOS[passo - 1].label}</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">

          {passo === 1 && (
            <>
              <Campo label="Nome fantasia *" value={form.nomeFantasia} onChange={(v) => set('nomeFantasia', v)} placeholder="Ex.: Supermercado Exemplo" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Razão social" value={form.razaoSocial} onChange={(v) => set('razaoSocial', v)} />
                <Campo label="CPF/CNPJ" value={form.cnpjCpf} onChange={(v) => set('cnpjCpf', v)} placeholder="000.000.000-00" />
              </div>
              <Campo label="Categoria" value={form.categoria} onChange={(v) => set('categoria', v)} placeholder="Supermercado / Padaria / Academia" />
            </>
          )}

          {passo === 2 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Responsável" value={form.responsavelNome} onChange={(v) => set('responsavelNome', v)} />
                <Campo label="Cargo" value={form.responsavelCargo} onChange={(v) => set('responsavelCargo', v)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Telefone *" value={form.telefone} onChange={(v) => set('telefone', v)} placeholder="(00) 0000-0000" />
                <Campo label="WhatsApp" value={form.whatsapp} onChange={(v) => set('whatsapp', v)} placeholder="(00) 00000-0000" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="E-mail" value={form.email} onChange={(v) => set('email', v)} type="email" />
                <Campo label="Site / redes sociais" value={form.siteRedes} onChange={(v) => set('siteRedes', v)} placeholder="@perfil ou site" />
              </div>
            </>
          )}

          {passo === 3 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Campo label="CEP" value={form.cep} onChange={(v) => set('cep', v)} placeholder="00000-000" />
                <Campo label="Logradouro" value={form.logradouro} onChange={(v) => set('logradouro', v)} />
                <Campo label="Número" value={form.numero} onChange={(v) => set('numero', v)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Complemento" value={form.complemento} onChange={(v) => set('complemento', v)} />
                <Campo label="Bairro" value={form.bairro} onChange={(v) => set('bairro', v)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Campo label="Cidade" value={form.cidade} onChange={(v) => set('cidade', v)} />
                <Campo label="Estado" value={form.estado} onChange={(v) => set('estado', v)} placeholder="PE" maxLength={2} />
                <Campo label="Referência" value={form.referencia} onChange={(v) => set('referencia', v)} placeholder="Próximo a..." />
              </div>
            </>
          )}


          {passo === 4 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Quantidade de telas *" value={String(form.quantidadeTelas)} onChange={(v) => set('quantidadeTelas', Number(v.replace(/\D/g, '') || 0))} type="number" />
                <Campo label="Horário de funcionamento" value={form.horarioFuncionamento} onChange={(v) => set('horarioFuncionamento', v)} placeholder="08h às 22h" />
              </div>
              <Campo label="Ambientes (onde ficam as telas)" value={form.ambientes} onChange={(v) => set('ambientes', v)} placeholder="Ex.: caixa, entrada, frente de loja" />
              <Campo label="Localização das telas (indoor/outdoor)" value={form.localizacaoTelas} onChange={(v) => set('localizacaoTelas', v)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Fluxo diário estimado" value={form.fluxoDiario} onChange={(v) => set('fluxoDiario', v)} placeholder="Ex.: cerca de 800 pessoas/dia" />
                <Campo label="Perfil do público" value={form.perfilPublico} onChange={(v) => set('perfilPublico', v)} placeholder="Ex.: famílias, classe B/C" />
              </div>
              <Area label="Observações" value={form.observacoes} onChange={(v) => set('observacoes', v)} />
            </>
          )}

          {passo === 5 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Foto de capa</Label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 h-11 px-3 rounded-xl border border-dashed border-white/15 bg-slate-950/60 text-slate-300 text-sm flex items-center gap-2 cursor-pointer hover:bg-white/5">
                    <Upload className="h-4 w-4" /> {subindo ? 'Enviando...' : 'Enviar imagem (ate 20MB)'}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFoto(f, true); e.currentTarget.value = ''; }}
                    />
                  </label>
                  {fotoCapa && (
                    <div className="relative">
                      <img src={fotoCapa} alt="capa" className="h-11 w-16 rounded-lg object-cover border border-white/10" />
                      <button type="button" onClick={() => setFotoCapa('')} className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-rose-600 text-white flex items-center justify-center">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Galeria (internas, externas, telas, instalação)</Label>
                <label className="inline-flex h-11 px-3 rounded-xl border border-dashed border-white/15 bg-slate-950/60 text-slate-300 text-sm items-center gap-2 cursor-pointer hover:bg-white/5">
                  <Upload className="h-4 w-4" /> Adicionar fotos
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? []);
                      e.currentTarget.value = '';
                      (async () => { for (const f of fs) await uploadFoto(f, false); })();
                    }}
                  />
                </label>
                {fotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {fotos.map((url, i) => (
                      <div key={i} className="relative">
                        <img src={url} alt={'foto ' + (i + 1)} className="h-14 w-20 rounded-lg object-cover border border-white/10" />
                        <button type="button" onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-rose-600 text-white flex items-center justify-center">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {passo === 6 && (
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300 text-xs">Modelo de relacionamento *</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                  {(['PERMUTA', 'COMISSIONADO'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => set('modeloComercial', m)}
                      className={'p-3 rounded-xl border text-left transition-all ' + (form.modeloComercial === m ? 'border-primary bg-primary/10' : 'border-white/10 hover:bg-white/5')}>
                      <p className="text-sm font-bold text-white">{m}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {m === 'PERMUTA' ? 'Troca por veiculação/divulgação' : 'Percentual sobre a veiculação (8% a 10% conforme contrato)'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {form.modeloComercial === 'PERMUTA' && (
                <>
                  <Area label="Descrição da permuta" value={form.permutaDescricao} onChange={(v) => set('permutaDescricao', v)} placeholder="O que o parceiro recebe" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Campo label="Contrapartida" value={form.permutaContrapartida} onChange={(v) => set('permutaContrapartida', v)} placeholder="O que a SOBRE MÍDIA oferece" />
                    <Campo label="Período" value={form.permutaPeriodo} onChange={(v) => set('permutaPeriodo', v)} placeholder="Ex.: 12 meses" />
                  </div>
                </>
              )}

              {form.modeloComercial === 'COMISSIONADO' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Campo label="Percentual (%)" value={form.percentualComissao == null ? '' : String(form.percentualComissao)} onChange={(v) => set('percentualComissao', v === '' ? null : Number(v.replace(',', '.')))} placeholder="Ex.: 8" type="number" />
                    <Campo label="Vigência" value={form.vigencia} onChange={(v) => set('vigencia', v)} placeholder="Ex.: 12 meses" />
                  </div>
                  <Campo label="Base de cálculo" value={form.baseCalculo} onChange={(v) => set('baseCalculo', v)} placeholder="Ex.: faturamento bruto das telas do ponto" />
                </>
              )}

              <Campo label="Contrato / observações comerciais" value={form.contratoObservacao} onChange={(v) => set('contratoObservacao', v)} placeholder="Vincular ao módulo de contratos na formalização" />

              <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Revisão</p>
                {resumo.map(([k, v]) =>
                  v ? (
                    <div key={k} className="flex gap-2 text-sm">
                      <span className="text-slate-500 w-36 shrink-0">{k}</span>
                      <span className="text-slate-200">{v}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}
        </CardContent>

        <div className="px-6 pb-5 flex items-center justify-between">
          <Button variant="outline" disabled={passo === 1 || salvando} onClick={() => { setErro(null); setPasso((p) => Math.max(1, p - 1)); }} className="border-slate-700 text-slate-300 rounded-xl gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          {passo < 6 ? (
            <Button onClick={avancar} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
              Próximo: {PASSOS[passo].label} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={concluir} disabled={salvando} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Cadastrar Ponto Parceiro
            </Button>
          )}
        </div>

        {erro && (
          <p className="mx-6 mb-5 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5">{erro}</p>
        )}
      </Card>
    </div>
  );
}

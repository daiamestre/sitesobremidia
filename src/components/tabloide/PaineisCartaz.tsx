/**
 * Cartaz Digital (F-179) — os painéis do menu lateral além de Produtos e Temas:
 * Datas (período e regras da oferta), Sua Logo, Empresa, Fontes, Postar, Encarte e Portal.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, Globe, Loader2, Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CAMPOS_EMPRESA, PARTES_DA_FONTE, textoDaValidade, type CampoEmpresa, type ConfigCartaz, type FundoLogo, type ParteDaFonte, type RegrasOferta,
} from '@/lib/tabloide/cartaz';
import { carregarFonte, cssDaFonte, filtrarFontes, FONTES } from '@/lib/tabloide/fontes';
import { enderecoDoPortal, enderecoPublico, type PortalDaLoja } from '@/lib/tabloide/perfil';
import { enviarParaBiblioteca, logosDaMarca, type Selo } from '@/lib/tabloide/selos';
import { SEGMENTOS, type SegmentoId } from '@/lib/tabloide/temas';

type Mudar = (m: Partial<ConfigCartaz>) => void;

function Chave({ rotulo, ligado, aoMudar, testid, children }: { rotulo: string; ligado: boolean; aoMudar: (v: boolean) => void; testid?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Switch checked={ligado} onCheckedChange={aoMudar} data-testid={testid} aria-label={rotulo} />
        <span>{rotulo}</span>
      </label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Datas
export function PainelDatas({ cfg, mudar }: { cfg: ConfigCartaz; mudar: Mudar }) {
  const r = cfg.regras;
  const regra = (m: Partial<RegrasOferta>) => mudar({ regras: { ...r, ...m } });
  const invertida = !!r.inicio && !!r.fim && r.fim < r.inicio;
  return (
    <div className="space-y-4" data-testid="painel-datas">
      <h3 className="text-sm font-semibold">Período da oferta</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm"><span className="font-medium">Começa em</span>
          <Input type="date" value={r.inicio} onChange={(e) => regra({ inicio: e.target.value })} data-testid="datas-inicio" />
        </label>
        <label className="space-y-1 text-sm"><span className="font-medium">Termina em</span>
          <Input type="date" value={r.fim} min={r.inicio || undefined} onChange={(e) => regra({ fim: e.target.value })} data-testid="datas-fim" />
        </label>
      </div>
      {invertida && <p className="text-xs text-destructive">A data final está antes da inicial.</p>}
      <Chave rotulo="Mostrar as datas no cartaz" ligado={r.mostrarDatas} aoMudar={(v) => regra({ mostrarDatas: v })} testid="datas-mostrar" />
      <Chave rotulo="Enquanto durarem os estoques" ligado={r.enquantoDurarem} aoMudar={(v) => regra({ enquantoDurarem: v })} testid="datas-estoques" />
      <Chave rotulo="Imagens meramente ilustrativas" ligado={r.imagensIlustrativas} aoMudar={(v) => regra({ imagensIlustrativas: v })} testid="datas-ilustrativas" />
      <Chave rotulo="Advertência de medicamento" ligado={r.advertenciaMedicamento} aoMudar={(v) => regra({ advertenciaMedicamento: v })} testid="datas-medicamento" />
      <Chave rotulo="Mostrar frase promocional" ligado={r.mostrarFrase} aoMudar={(v) => regra({ mostrarFrase: v })} testid="datas-frase-chave">
        <Input aria-label="Frase promocional" placeholder="Ex.: Economize em toda a loja" maxLength={90} value={r.frase} disabled={!r.mostrarFrase} onChange={(e) => regra({ frase: e.target.value })} data-testid="datas-frase" />
      </Chave>
      <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground" data-testid="datas-resumo">
        No rodapé: <b>{textoDaValidade(r) || 'sem texto de validade'}</b>
      </p>
      <p className="text-xs text-muted-foreground">Quando o cartaz está no portal de ofertas, ele sai sozinho depois da data final.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Sua Logo
const FUNDOS: Array<{ id: FundoLogo; nome: string; cor: string }> = [
  { id: 'branco', nome: 'Fundo branco', cor: '#fff' },
  { id: 'escuro', nome: 'Fundo escuro', cor: '#111827' },
  { id: 'sem', nome: 'Sem fundo', cor: 'transparent' },
];

export function PainelLogo({ cfg, mudarPerfil, selos, usuarioId, clienteId, aoRecarregar }: {
  cfg: ConfigCartaz; mudarPerfil: Mudar; selos: Selo[] | null; usuarioId?: string; clienteId: string | null; aoRecarregar: () => Promise<void>;
}) {
  const [enviando, setEnviando] = useState(false);
  const salvas = useMemo(() => logosDaMarca(selos), [selos]);
  const enviar = async (arq: File | undefined) => {
    if (!arq) return;
    if (!usuarioId) { toast.error('Sessão expirada. Entre novamente.'); return; }
    setEnviando(true);
    try {
      const salva = await enviarParaBiblioteca({ arquivo: arq, nome: arq.name.replace(/\.[a-z0-9]+$/i, '') || 'Logo da loja', tipo: 'LOGO_MARCA', categoria: 'Logo da marca', usuarioId, clienteId, daEmpresa: false });
      mudarPerfil({ logoMarcaUrl: salva.imagem_url, mostrarLogo: true });
      await aoRecarregar();
      toast.success('Logo adicionada e salva.');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar a logo.');
    } finally { setEnviando(false); }
  };
  const fundo = FUNDOS.find((f) => f.id === cfg.fundoLogo) ?? FUNDOS[0];
  return (
    <div className="space-y-4" data-testid="painel-logo">
      <h3 className="text-sm font-semibold">Sua logo</h3>
      <div className="flex h-32 items-center justify-center rounded-lg border p-2" style={{ background: fundo.id === 'sem' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 16px 16px' : fundo.cor }}>
        {cfg.logoMarcaUrl ? <img src={cfg.logoMarcaUrl} alt="Sua logo" data-testid="logo-atual" className="max-h-full max-w-full object-contain" /> : <span className="rounded bg-white/80 px-2 text-sm text-slate-600">Nenhuma logo ainda</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" data-testid="tabloide-enviar-logo">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {cfg.logoMarcaUrl ? 'Enviar outra logo' : 'Enviar a logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={enviando} onChange={(e) => { void enviar(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {cfg.logoMarcaUrl && <Button variant="ghost" size="sm" onClick={() => mudarPerfil({ logoMarcaUrl: null })}>Tirar do cartaz</Button>}
      </div>
      <p className="text-xs text-muted-foreground">A logo entra na hora e fica guardada aqui para os próximos cartazes. PNG, JPG ou WebP até 12 MB.</p>

      {salvas.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Logos salvas</p>
          <div className="grid grid-cols-4 gap-2" data-testid="logos-salvas">
            {salvas.map((l) => (
              <button key={l.id} type="button" onClick={() => mudarPerfil({ logoMarcaUrl: l.imagem_url, mostrarLogo: true })} aria-pressed={cfg.logoMarcaUrl === l.imagem_url} title={l.nome}
                className={cn('h-16 overflow-hidden rounded-lg border-2 bg-white p-1', cfg.logoMarcaUrl === l.imagem_url ? 'border-primary' : 'border-border')}>
                <img src={l.miniatura_url || l.imagem_url} alt={l.nome} loading="lazy" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium">Fundo da logo</p>
        <div className="flex flex-wrap gap-1.5" data-testid="logo-fundos">
          {FUNDOS.map((f) => (
            <button key={f.id} type="button" onClick={() => mudarPerfil({ fundoLogo: f.id })} aria-pressed={cfg.fundoLogo === f.id}
              className={cn('rounded-md border px-2.5 py-1 text-xs', cfg.fundoLogo === f.id ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{f.nome}</button>
          ))}
        </div>
      </div>
      <Chave rotulo="Mostrar a logo no cartaz" ligado={cfg.mostrarLogo} aoMudar={(v) => mudarPerfil({ mostrarLogo: v })} testid="logo-mostrar" />
    </div>
  );
}

// ---------------------------------------------------------------- Empresa
export function PainelEmpresa({ cfg, mudarPerfil }: { cfg: ConfigCartaz; mudarPerfil: Mudar }) {
  const campo = (id: CampoEmpresa, valor: string) => mudarPerfil({ empresa: { ...cfg.empresa, [id]: valor } });
  const chave = (id: CampoEmpresa, v: boolean) => mudarPerfil({ mostrar: { ...cfg.mostrar, [id]: v } });
  return (
    <div className="space-y-3" data-testid="painel-empresa">
      <h3 className="text-sm font-semibold">Dados da empresa no cartaz</h3>
      <p className="text-xs text-muted-foreground">Ligue o que deve aparecer no rodapé. Fica salvo para os próximos cartazes.</p>
      {CAMPOS_EMPRESA.map((c) => (
        <Chave key={c.id} rotulo={c.rotulo} ligado={cfg.mostrar[c.id]} aoMudar={(v) => chave(c.id, v)} testid={`empresa-chave-${c.id}`}>
          {cfg.mostrar[c.id] && (
            <Input aria-label={c.rotulo.replace(/^Mostrar /, '')} placeholder={c.exemplo} maxLength={c.id === 'endereco' ? 120 : 80} value={cfg.empresa[c.id]}
              onChange={(e) => campo(c.id, e.target.value)} data-testid={`empresa-campo-${c.id}`} />
          )}
        </Chave>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Fontes
export function PainelFontes({ cfg, mudarPerfil }: { cfg: ConfigCartaz; mudarPerfil: Mudar }) {
  const [partes, setPartes] = useState<Record<ParteDaFonte, boolean>>({ produto: true, preco: false, frase: false, rodape: false });
  const [peso, setPeso] = useState<number | null>(null);
  const [estilo, setEstilo] = useState<'normal' | 'italic' | null>(null);
  const [nome, setNome] = useState('');
  const lista = useMemo(() => filtrarFontes({ peso, estilo, nome }), [peso, estilo, nome]);
  const pesos = useMemo(() => [...new Set(FONTES.map((f) => f.peso))].sort((a, b) => a - b), []);
  // as amostras aparecem cada uma na própria fonte
  useEffect(() => { FONTES.forEach((f) => { void carregarFonte(f.id); }); }, []);
  const marcadas = PARTES_DA_FONTE.filter((x) => partes[x.id]).map((x) => x.id);
  const aplicar = (id: string) => {
    if (!marcadas.length) { toast.error('Marque em qual parte do cartaz a fonte vai entrar.'); return; }
    void carregarFonte(id);
    mudarPerfil({ fontes: { ...cfg.fontes, ...Object.fromEntries(marcadas.map((m) => [m, id])) } });
  };
  const todasIguais = (id: string) => marcadas.length > 0 && marcadas.every((m) => cfg.fontes[m] === id);
  return (
    <div className="space-y-4" data-testid="painel-fontes">
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Onde trocar a fonte</h3>
        <div className="space-y-1.5">
          {PARTES_DA_FONTE.map((x) => (
            <label key={x.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={partes[x.id]} onChange={(e) => setPartes((a) => ({ ...a, [x.id]: e.target.checked }))} data-testid={`fonte-parte-${x.id}`} /> {x.rotulo}
              </span>
              <span className="truncate text-xs text-muted-foreground">{FONTES.find((f) => f.id === cfg.fontes[x.id])?.nome ?? 'Padrão'}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs"><span className="font-medium">Peso</span>
          <select aria-label="Peso da fonte" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={peso ?? ''} onChange={(e) => setPeso(e.target.value ? Number(e.target.value) : null)} data-testid="fonte-peso">
            <option value="">Todos</option>
            {pesos.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs"><span className="font-medium">Estilo</span>
          <select aria-label="Estilo da fonte" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={estilo ?? ''} onChange={(e) => setEstilo((e.target.value || null) as 'normal' | 'italic' | null)} data-testid="fonte-estilo">
            <option value="">Todos</option>
            <option value="normal">Normal</option>
            <option value="italic">Itálico</option>
          </select>
        </label>
        <Input aria-label="Nome da fonte" placeholder="Nome da fonte" className="col-span-2" value={nome} onChange={(e) => setNome(e.target.value)} data-testid="fonte-nome" />
      </div>
      <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1" data-testid="fonte-lista">
        {lista.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => aplicar(f.id)} data-testid={`fonte-${f.id}`} aria-pressed={todasIguais(f.id)}
              className={cn('flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left', todasIguais(f.id) ? 'border-primary bg-primary/10' : 'hover:bg-muted')}>
              <span className="min-w-0">
                <span className="block truncate text-lg leading-tight" style={cssDaFonte(f.id)}>Oferta R$ 9,99</span>
                <span className="block text-[11px] text-muted-foreground">{f.nome} · {f.peso}{f.estilo === 'italic' ? ' · itálico' : ''}</span>
              </span>
              {todasIguais(f.id) && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          </li>
        ))}
        {!lista.length && <li className="py-6 text-center text-sm text-muted-foreground">Nenhuma fonte com esse filtro.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- Postar
export function PainelPostar({ texto }: { texto: string }) {
  const [editado, setEditado] = useState<string | null>(null);
  useEffect(() => { setEditado(null); }, [texto]);
  const valor = editado ?? texto;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(valor); toast.success('Texto copiado. Cole no Instagram, Facebook ou WhatsApp.'); }
    catch { toast.error('Não foi possível copiar. Selecione o texto e copie.'); }
  };
  return (
    <div className="space-y-3" data-testid="painel-postar">
      <h3 className="text-sm font-semibold">Texto para postar nas redes</h3>
      <p className="text-xs text-muted-foreground">Já vem com os produtos, os preços e a descrição da imagem (ajuda quem usa leitor de tela). Pode ajustar antes de copiar.</p>
      <Textarea rows={16} value={valor} onChange={(e) => setEditado(e.target.value)} className="text-sm" data-testid="postar-texto" aria-label="Texto para postar" />
      <div className="flex flex-wrap gap-2">
        <Button onClick={copiar} data-testid="postar-copiar"><Copy className="mr-1 h-4 w-4" /> Copiar texto</Button>
        {editado !== null && <Button variant="ghost" onClick={() => setEditado(null)}>Voltar ao texto automático</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Baixe a imagem do cartaz (botão ao lado da prévia) e poste junto com este texto.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Encarte
export function PainelEncarte({ nome, aoNome, cfg, mudar, segmentoId, aoSegmento, aoSalvar, salvando, salvo }: {
  nome: string; aoNome: (n: string) => void; cfg: ConfigCartaz; mudar: Mudar; segmentoId: SegmentoId; aoSegmento: (id: SegmentoId) => void;
  aoSalvar: () => void; salvando: boolean; salvo: boolean;
}) {
  return (
    <div className="space-y-3" data-testid="painel-encarte">
      <h3 className="text-sm font-semibold">Dados do cartaz</h3>
      <label className="block space-y-1 text-sm"><span className="font-medium">Nome</span>
        <Input value={nome} maxLength={80} onChange={(e) => aoNome(e.target.value)} data-testid="encarte-nome" />
      </label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Observações (só você vê)</span>
        <Textarea rows={4} maxLength={2000} value={cfg.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} data-testid="encarte-observacoes" placeholder="Ex.: cartaz da promoção de fim de mês" />
      </label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Categoria</span>
        <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={segmentoId} onChange={(e) => aoSegmento(e.target.value as SegmentoId)} data-testid="encarte-categoria">
          {SEGMENTOS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </label>
      <Button onClick={aoSalvar} disabled={salvando} data-testid="encarte-salvar">
        {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} {salvo ? 'Salvar alterações' : 'Salvar em Meus cartazes'}
      </Button>
      <p className="text-xs text-muted-foreground">O cartaz salvo fica na aba <b>Meus cartazes</b>, de onde você imprime um ou vários de uma vez.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Portal
export function PainelPortal({ portal, aoSalvarPortal, aoPublicar, aoTirar, publicado, ocupado }: {
  portal: PortalDaLoja; aoSalvarPortal: (p: PortalDaLoja) => Promise<boolean>;
  aoPublicar: () => void; aoTirar: () => void; publicado: boolean; ocupado: boolean;
}) {
  const [rascunho, setRascunho] = useState<PortalDaLoja>(portal);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setRascunho(portal); }, [portal]);
  const slug = enderecoDoPortal(rascunho.slug ?? '');
  const link = portal.slug ? enderecoPublico(portal.slug) : '';
  const alternar = (id: string) => setRascunho((r) => {
    if (r.segmentos.includes(id)) return { ...r, segmentos: r.segmentos.filter((s) => s !== id) };
    if (r.segmentos.length >= 3) { toast.error('Escolha até 3 segmentos.'); return r; }
    return { ...r, segmentos: [...r.segmentos, id] };
  });
  const salvar = async () => { setSalvando(true); try { await aoSalvarPortal({ ...rascunho, slug }); } finally { setSalvando(false); } };
  return (
    <div className="space-y-4" data-testid="painel-portal">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Globe className="h-4 w-4" /> Portal de ofertas da sua loja</h3>
      <p className="text-xs text-muted-foreground">Uma página pública com os cartazes que você publicar. Seus clientes abrem pelo link, sem precisar de senha.</p>
      <label className="block space-y-1 text-sm"><span className="font-medium">Nome para o endereço</span>
        <Input value={rascunho.slug ?? ''} maxLength={40} placeholder="mercado-bom-preco" onChange={(e) => setRascunho((r) => ({ ...r, slug: e.target.value }))} data-testid="portal-endereco" />
        <span className="block break-all text-[11px] text-muted-foreground" data-testid="portal-previa">{slug.length >= 3 ? enderecoPublico(slug) : 'Use pelo menos 3 letras ou números.'}</span>
      </label>
      <label className="block space-y-1 text-sm"><span className="font-medium">CEP da loja</span>
        <Input value={rascunho.cep ?? ''} maxLength={9} inputMode="numeric" placeholder="00000-000" onChange={(e) => setRascunho((r) => ({ ...r, cep: e.target.value }))} data-testid="portal-cep" />
      </label>
      <div>
        <p className="mb-1.5 text-sm font-medium">Segmentos da loja <span className="font-normal text-muted-foreground">(até 3)</span></p>
        <div className="flex flex-wrap gap-1.5" data-testid="portal-segmentos">
          {SEGMENTOS.map((s) => (
            <button key={s.id} type="button" onClick={() => alternar(s.id)} aria-pressed={rascunho.segmentos.includes(s.id)}
              className={cn('rounded-full border px-2.5 py-1 text-xs', rascunho.segmentos.includes(s.id) ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{s.nome}</button>
          ))}
        </div>
      </div>
      <Chave rotulo="Mostrar minha loja no portal" ligado={rascunho.visivel} aoMudar={(v) => setRascunho((r) => ({ ...r, visivel: v }))} testid="portal-visivel" />
      <Button onClick={salvar} disabled={salvando} variant="outline" data-testid="portal-salvar">
        {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar dados do portal
      </Button>

      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Este cartaz</p>
        <p className="text-xs text-muted-foreground" data-testid="portal-estado">{publicado ? 'Está publicado no portal.' : 'Ainda não está no portal.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={aoPublicar} disabled={ocupado} data-testid="portal-publicar">
            {ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Globe className="mr-1 h-4 w-4" />} {publicado ? 'Publicar de novo (atualizar)' : 'Publicar este cartaz'}
          </Button>
          {publicado && <Button variant="ghost" onClick={aoTirar} disabled={ocupado} data-testid="portal-tirar">Tirar do portal</Button>}
        </div>
        {!portal.visivel && <p className="text-xs text-amber-600">A loja está oculta: ligue "Mostrar minha loja no portal" e salve para o link funcionar.</p>}
      </div>

      {link && portal.visivel && (
        <div className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs" data-testid="portal-link">
          <p className="font-medium">Link da sua página</p>
          <p className="break-all">{link}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(link).then(() => toast.success('Link copiado.')).catch(() => toast.error('Não foi possível copiar.')); }}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar link</Button>
            <Button size="sm" variant="outline" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir</a></Button>
          </div>
        </div>
      )}
    </div>
  );
}

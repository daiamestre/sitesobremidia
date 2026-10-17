import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Eye, Film, ListVideo, Loader2, MapPin, Megaphone, Monitor, Search, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  buscarContas, buscarDetalheDaConta, definirLimiteDeVideo, limitePadraoDoPerfil, nomeDoPerfil, tamanhoLegivel, type ContaResumo,
} from '@/services/visaoContas.service';

// ────────────────────────────────────────────────────────────────────────────────────────────────
// F-190 — VISÃO DAS CONTAS (OWNER/ADM)
// Cada usuário (gestor de mídia, anunciante, representante...) vê só o que é dele; aqui o dono e o ADM veem
// tudo, conta por conta: telas (online), playlists, mídias, espaço, exibições, pontos parceiros, campanhas,
// contratos e carteira de clientes. Clicar numa conta abre o detalhe.
// ────────────────────────────────────────────────────────────────────────────────────────────────

const FILTROS = [
  { id: 'TODOS', rotulo: 'Todas' },
  { id: 'GESTOR', rotulo: 'Gestores de mídia' },
  { id: 'ANUNCIANTE', rotulo: 'Anunciantes' },
  { id: 'REPRESENTANTE', rotulo: 'Representantes' },
  { id: 'OUTROS', rotulo: 'Outros' },
] as const;

const PRINCIPAIS = ['GESTOR', 'ANUNCIANTE', 'REPRESENTANTE'];

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca';

function Numero({ valor, rotulo, destaque }: { valor: number | string; rotulo: string; destaque?: string }) {
  return (
    <div className="min-w-0">
      <p className={`text-lg font-bold leading-tight ${destaque ?? ''}`}>{valor}</p>
      <p className="text-[11px] text-muted-foreground leading-tight">{rotulo}</p>
    </div>
  );
}

export default function VisaoDasContasPage() {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('TODOS');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<ContaResumo | null>(null);

  const contas = useQuery({ queryKey: ['visao-contas'], queryFn: buscarContas, refetchInterval: 60_000 });

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (contas.data ?? []).filter((c) => {
      if (filtro === 'OUTROS' ? PRINCIPAIS.includes(c.perfil) : filtro !== 'TODOS' && c.perfil !== filtro) return false;
      if (!termo) return true;
      return `${c.nome ?? ''} ${c.email ?? ''}`.toLowerCase().includes(termo);
    });
  }, [contas.data, filtro, busca]);

  const totais = useMemo(() => visiveis.reduce((t, c) => ({
    telas: t.telas + c.telas, online: t.online + c.telas_online, midias: t.midias + c.midias,
    playlists: t.playlists + c.playlists, pontos: t.pontos + c.pontos,
  }), { telas: 0, online: 0, midias: 0, playlists: 0, pontos: 0 }), [visiveis]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" /> Visão das Contas
        </h1>
        <p className="text-muted-foreground text-sm">
          Cada usuário vê só o que é dele. Aqui você vê tudo, conta por conta: telas, mídias, playlists, pontos parceiros, campanhas e contratos.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <Button key={f.id} size="sm" variant={filtro === f.id ? 'default' : 'outline'} onClick={() => setFiltro(f.id)}>
              {f.rotulo}
            </Button>
          ))}
        </div>
      </div>

      <Card className="glass">
        <CardContent className="p-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
          <Numero valor={visiveis.length} rotulo="Contas" />
          <Numero valor={totais.telas} rotulo="Telas" />
          <Numero valor={totais.online} rotulo="Telas online" destaque="text-green-400" />
          <Numero valor={totais.playlists} rotulo="Playlists" />
          <Numero valor={totais.midias} rotulo="Mídias" />
          <Numero valor={totais.pontos} rotulo="Pontos parceiros" />
        </CardContent>
      </Card>

      {contas.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando as contas…</div>
      )}
      {contas.error && (
        <div className="flex items-center gap-2 text-red-400" data-testid="visao-contas-erro">
          <AlertCircle className="h-4 w-4" /> {(contas.error as Error).message}
        </div>
      )}
      {!contas.isLoading && !contas.error && visiveis.length === 0 && (
        <p className="text-muted-foreground">Nenhuma conta encontrada com esse filtro.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="visao-contas-lista">
        {visiveis.map((c) => (
          <Card key={c.id} className="glass cursor-pointer hover:border-primary/60 transition-colors" onClick={() => setAberta(c)}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold truncate">{c.nome || 'Sem nome'}</h3>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="secondary">{nomeDoPerfil(c.perfil)}</Badge>
                  {!c.ativo && <Badge variant="destructive">Inativa</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Numero valor={`${c.telas_online}/${c.telas}`} rotulo="Telas online" destaque={c.telas > 0 && c.telas_online === 0 ? 'text-red-400' : undefined} />
                <Numero valor={c.playlists} rotulo="Playlists" />
                <Numero valor={c.midias} rotulo={`Mídias · ${tamanhoLegivel(c.espaco_bytes)}`} />
                <Numero valor={c.exibicoes_7d.toLocaleString('pt-BR')} rotulo="Exibições 7 dias" />
                <Numero valor={c.pontos} rotulo="Pontos parceiros" />
                <Numero valor={c.campanhas} rotulo="Campanhas" />
                <Numero valor={c.contratos} rotulo="Contratos" />
                <Numero valor={c.clientes_carteira} rotulo="Clientes na carteira" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Criada em {data(c.criado_em)} · Último acesso: {data(c.ultimo_acesso)} · {textoDoLimite(c)}
                {c.telas_sem_playlist > 0 ? ` · ${c.telas_sem_playlist} tela(s) sem playlist` : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Sheet open={!!aberta} onOpenChange={(v) => !v && setAberta(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {aberta && <DetalheDaConta conta={aberta} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** F-191 — "Vídeos até 60 s (definido por você)", "Vídeos até 30 s (padrão do perfil)" ou "Vídeos sem limite". */
function textoDoLimite(c: ContaResumo): string {
  if (c.limite_video_segundos) return `Vídeos até ${c.limite_video_segundos} s (definido por você)`;
  const padrao = limitePadraoDoPerfil(c.perfil);
  return padrao ? `Vídeos até ${padrao} s (padrão do perfil)` : 'Vídeos sem limite';
}

function LimiteDeVideo({ conta }: { conta: ContaResumo }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState(conta.limite_video_segundos ? String(conta.limite_video_segundos) : '');
  const [salvando, setSalvando] = useState(false);
  if (conta.perfil === 'OWNER') return null;
  const salvar = async (segundos: number | null) => {
    setSalvando(true);
    try {
      await definirLimiteDeVideo(conta.id, segundos);
      toast.success(segundos ? `Limite de ${segundos} s salvo para ${conta.nome ?? 'a conta'}.` : 'Esta conta voltou ao limite padrão do perfil.');
      if (!segundos) setValor('');
      await qc.invalidateQueries({ queryKey: ['visao-contas'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };
  const padrao = limitePadraoDoPerfil(conta.perfil);
  return (
    <section className="space-y-2 rounded-md border border-border/60 p-3" data-testid="limite-video">
      <h4 className="font-semibold text-sm">Duração máxima de vídeo e áudio</h4>
      <p className="text-xs text-muted-foreground">
        Vazio = padrão do perfil ({padrao ? `${padrao} s` : 'sem limite'}). Vale para os próximos envios desta conta.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="number" min={5} max={600} className="w-28" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={padrao ? String(padrao) : '—'} aria-label="Segundos" />
        <span className="text-sm text-muted-foreground">segundos</span>
        <Button size="sm" disabled={salvando || !valor} onClick={() => salvar(Number(valor))}>Salvar</Button>
        {conta.limite_video_segundos != null && (
          <Button size="sm" variant="outline" disabled={salvando} onClick={() => salvar(null)}>Voltar ao padrão</Button>
        )}
      </div>
    </section>
  );
}

function Secao({ titulo, icone: Icone, vazio, children, quantos }: {
  titulo: string; icone: typeof Monitor; vazio: string; quantos: number; children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="font-semibold flex items-center gap-2 text-sm"><Icone className="h-4 w-4 text-primary" /> {titulo} ({quantos})</h4>
      {quantos === 0 ? <p className="text-xs text-muted-foreground">{vazio}</p> : <div className="space-y-1.5">{children}</div>}
    </section>
  );
}

function Linha({ esquerda, direita }: { esquerda: React.ReactNode; direita?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-2 text-sm min-w-0">
      <div className="truncate">{esquerda}</div>
      {direita && <div className="text-xs text-muted-foreground break-words">{direita}</div>}
    </div>
  );
}

function DetalheDaConta({ conta }: { conta: ContaResumo }) {
  const detalhe = useQuery({ queryKey: ['visao-conta', conta.id], queryFn: () => buscarDetalheDaConta(conta.id) });
  const d = detalhe.data;
  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle>{conta.nome || 'Sem nome'}</SheetTitle>
        <SheetDescription>{nomeDoPerfil(conta.perfil)} · {conta.email} · último acesso {data(conta.ultimo_acesso)}</SheetDescription>
      </SheetHeader>
      <LimiteDeVideo conta={conta} />
      {detalhe.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}
      {detalhe.error && <p className="text-red-400 text-sm">{(detalhe.error as Error).message}</p>}
      {d && (
        <>
          <Secao titulo="Telas" icone={Monitor} quantos={d.telas.length} vazio="Esta conta ainda não criou nenhuma tela.">
            {d.telas.map((t) => (
              <Linha key={t.id}
                esquerda={<><span className={`inline-block h-2 w-2 rounded-full mr-2 ${t.online ? 'bg-green-500' : t.conectada ? 'bg-red-500' : 'bg-muted-foreground'}`} />{t.nome}</>}
                direita={`${t.online ? 'online' : t.conectada ? `sem sinal desde ${data(t.ultimo_sinal)}` : 'sem aparelho'}${t.playlist ? ` · ${t.playlist}` : ' · sem playlist'}${t.app ? ` · ${t.app}` : ''}`} />
            ))}
          </Secao>
          <Secao titulo="Playlists" icone={ListVideo} quantos={d.playlists.length} vazio="Nenhuma playlist criada.">
            {d.playlists.map((p) => (
              <Linha key={p.id} esquerda={p.nome} direita={`${p.itens} itens · ${p.telas} tela(s)${p.formato ? ` · ${p.formato}` : ''}`} />
            ))}
          </Secao>
          <Secao titulo="Mídias" icone={Film} quantos={d.midias.length} vazio="Nenhuma mídia enviada.">
            {d.midias.map((m) => (
              <Linha key={m.id} esquerda={m.nome} direita={`${m.tipo === 'video' ? 'vídeo' : m.tipo === 'image' ? 'imagem' : m.tipo} · ${tamanhoLegivel(m.bytes)} · ${data(m.criada_em)}`} />
            ))}
          </Secao>
          <Secao titulo="Pontos parceiros" icone={MapPin} quantos={d.pontos.length} vazio="Nenhum ponto parceiro.">
            {d.pontos.map((p) => (
              <Linha key={p.id} esquerda={p.nome} direita={[p.categoria, [p.cidade, p.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')} />
            ))}
          </Secao>
          <Secao titulo="Campanhas" icone={Megaphone} quantos={d.campanhas.length} vazio="Nenhuma campanha.">
            {d.campanhas.map((c) => <Linha key={c.id} esquerda={c.titulo || 'Sem título'} direita={c.status ?? ''} />)}
          </Secao>
          <Secao titulo="Contratos" icone={Users} quantos={d.contratos.length} vazio="Nenhum contrato.">
            {d.contratos.map((c) => (
              <Linha key={c.id} esquerda={c.numero || 'Contrato'}
                direita={`${c.situacao ?? ''}${c.valor_mensal ? ` · R$ ${Number(c.valor_mensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês` : ''}`} />
            ))}
          </Secao>
          <Secao titulo="Exibições nos últimos 14 dias" icone={Eye} quantos={d.exibicoes_por_dia.length} vazio="Nenhuma exibição nas telas desta conta.">
            {d.exibicoes_por_dia.map((e) => (
              <Linha key={e.dia} esquerda={new Date(`${e.dia}T12:00:00`).toLocaleDateString('pt-BR')} direita={`${e.n.toLocaleString('pt-BR')} exibições`} />
            ))}
          </Secao>
        </>
      )}
    </div>
  );
}

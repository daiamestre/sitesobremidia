import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MonitorPlay, ArrowLeft, ArrowRight, Loader2, CheckCircle2, KeyRound,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { prospeccaoService } from '@/services/prospeccao.service';

// ──────────────────────────────────────────────────────────────────────
// CADASTRO DE GESTOR DE MÍDIAS pelo REPRESENTANTE (missão §20–§22)
// Usa o provisionamento OFICIAL: auth real, senha automática forte gerada
// no backend, must_change_password no primeiro login, perfil GESTOR fixo
// (o representante NÃO escolhe role — missão §27). Endereço opcional.
// ──────────────────────────────────────────────────────────────────────

export default function GestorMidiiasProspeccaoPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nome: '', email: '', telefone: '', whatsapp: '',
    empresa: '', cpfCnpj: '', cargo: '',
    endereco: '', cidade: '', estado: '',
    observacoes: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<{ email: string; senha: string } | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const salvar = async () => {
    if (form.nome.trim().length < 3) return setErro('Informe o nome completo.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setErro('Informe um e-mail válido.');
    if (form.telefone.trim().length < 8 && form.whatsapp.trim().length < 8)
      return setErro('Informe ao menos um contato (telefone ou WhatsApp).');
    setErro(null);
    setSalvando(true);
    try {
      const r = await prospeccaoService.provisionarGestor({
        nome: form.nome.trim(),
        email: form.email.trim(),
        telefone: (form.telefone || form.whatsapp).replace(/\D/g, ''),
        empresa: form.empresa,
        cargo: form.cargo,
        cpfCnpj: form.cpfCnpj,
        cidade: form.cidade,
        estado: form.estado,
        endereco: form.endereco,
        observacoes: form.observacoes,
      });
      setCredencial({ email: r.email, senha: r.senha_inicial });
    } catch (e: any) {
      setErro(e?.message || 'Erro ao cadastrar gestor.');
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async () => {
    if (!credencial) return;
    try {
      await navigator.clipboard.writeText('Login: ' + credencial.email + '\nSenha inicial: ' + credencial.senha);
    } catch { /* clipboard bloqueado — usuário copia manualmente */ }
  };

  if (credencial) {
    return (
      <div className="max-w-xl mx-auto animate-fade-in">
        <Card className="border-emerald-500/30 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardContent className="py-12 text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Gestor de Mídias cadastrado!</h2>
            <p className="text-sm text-slate-400">
              Acesso criado com o perfil <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30">GESTOR</Badge>.
              Ele deverá trocar a senha no primeiro login.
            </p>
            <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-4 space-y-2 text-left max-w-md mx-auto">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> Credencial inicial — exibida apenas agora
              </p>
              <p className="text-sm text-slate-800"><strong>Login:</strong> {credencial.email}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm select-all border">{credencial.senha}</code>
                <button onClick={copiar} className="px-3 py-2 rounded-lg border text-sm hover:bg-slate-100">Copiar</button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Entregue por canal confiável. O sistema não exibirá esta senha novamente.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
              <button onClick={() => { setCredencial(null); setForm({ nome:'',email:'',telefone:'',whatsapp:'',empresa:'',cpfCnpj:'',cargo:'',endereco:'',cidade:'',estado:'',observacoes:'' }); }}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-200 text-sm hover:bg-white/5">
                Cadastrar outro gestor
              </button>
              <button onClick={() => navigate('/representantes/dashboard')}
                className="px-5 py-2.5 rounded-xl gradient-primary glow-primary text-white text-sm font-bold">
                Voltar ao dashboard
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-fade-in pb-12">
      <div className="p-5 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <MonitorPlay className="h-6 w-6 text-sky-400" /> Novo Gestor de Mídias
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Cadastro simplificado com criação de acesso oficial. Endereço é opcional.
        </p>
      </div>

      <Card className="border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
        <CardHeader className="border-b border-white/10 pb-3">
          <CardTitle className="text-base font-bold text-white">Dados do gestor</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Nome completo *</Label>
            <Input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Maria Silva" className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">E-mail (login) *</Label>
              <Input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" placeholder="maria@empresa.com.br" className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Telefone/WhatsApp *</Label>
              <Input value={form.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(00) 00000-0000" className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Empresa</Label>
              <Input value={form.empresa} onChange={(e) => set('empresa', e.target.value)} className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">CPF/CNPJ</Label>
              <Input value={form.cpfCnpj} onChange={(e) => set('cpfCnpj', e.target.value)} className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Cargo</Label>
              <Input value={form.cargo} onChange={(e) => set('cargo', e.target.value)} className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">WhatsApp (opcional)</Label>
              <Input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold pt-1">Endereço (opcional)</p>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Logradouro</Label>
            <Input value={form.endereco} onChange={(e) => set('endereco', e.target.value)} className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-slate-400 text-xs">Cidade</Label>
              <Input value={form.cidade} onChange={(e) => set('cidade', e.target.value)} className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Estado</Label>
              <Input value={form.estado} onChange={(e) => set('estado', e.target.value)} maxLength={2} placeholder="PE" className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-300 text-xs">Observações comerciais</Label>
            <Textarea value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} rows={3}
              placeholder="Contexto da prospecção, portfólio de telas, expectativas..." className="bg-slate-950/60 border-white/10 text-white rounded-xl" />
          </div>

          {erro && (
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5">{erro}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <button onClick={() => navigate('/representantes/prospeccao')}
              className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm hover:bg-white/5 flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <button onClick={salvar} disabled={salvando}
              className="gradient-primary glow-primary font-bold rounded-xl px-6 py-2.5 text-white text-sm flex items-center gap-2 disabled:opacity-60">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Cadastrar Gestor e Gerar Acesso
            </button>
          </div>
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <KeyRound className="h-3 w-3" /> Uma senha inicial forte será gerada automaticamente pelo sistema (exibida uma única vez).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

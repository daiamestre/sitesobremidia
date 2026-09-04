import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const basePath = location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
  
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    nome: '', email: '', telefone: '', whatsapp: '',
    empresa: '', cpfCnpj: '', cargo: '',
    endereco: '', cidade: '', estado: '',
    observacoes: '',
  });
  
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<{ email: string; senha: string; contratoId?: string } | null>(null);
  const [assinarAgoraModal, setAssinarAgoraModal] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);
  const [contratoAssinado, setContratoAssinado] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const validarEtapa1 = () => {
    if (form.nome.trim().length < 3) return setErro('Informe o nome completo.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setErro('Informe um e-mail válido.');
    if (form.telefone.trim().length < 8 && form.whatsapp.trim().length < 8)
      return setErro('Informe ao menos um contato (telefone ou WhatsApp).');
    setErro(null);
    setStep(2);
  };

  const salvar = async () => {
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
      setCredencial({ email: r.email, senha: r.senha_inicial, contratoId: r.contrato_id });
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
    } catch { /* clipboard bloqueado */ }
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
              Acesso criado com o perfil <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30">GESTOR</Badge> e Contrato de Gestão Vinculado.
              Ele deverá trocar a senha no primeiro login.
            </p>
            {credencial.contratoId && (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs py-1">
                <FileText className="h-3.5 w-3.5 mr-1" /> Contrato ID: {credencial.contratoId}
              </Badge>
            )}
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
              <button onClick={() => { setCredencial(null); setStep(1); setForm({ nome:'',email:'',telefone:'',whatsapp:'',empresa:'',cpfCnpj:'',cargo:'',endereco:'',cidade:'',estado:'',observacoes:'' }); setContratoAssinado(false); }}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-slate-200 text-sm hover:bg-white/5">
                Cadastrar outro gestor
              </button>
              <button onClick={() => navigate(`${basePath}/clientes`)}
                className="px-5 py-2.5 rounded-xl gradient-primary glow-primary text-white text-sm font-bold">
                Voltar
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto animate-fade-in pb-12">
      <div className="p-5 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <MonitorPlay className="h-6 w-6 text-sky-400" /> Novo Gestor de Mídias
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Cadastro completo de Gestor de Mídias com Contrato Operacional e Acesso.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={step === 1 ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400'}>1. Dados</Badge>
          <Badge className={step === 2 ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400'}>2. Contrato</Badge>
        </div>
      </div>

      {step === 1 && (
        <Card className="border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-3">
            <CardTitle className="text-base font-bold text-white">1. Dados do Gestor de Mídias</CardTitle>
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
              <button onClick={() => navigate(`${basePath}/clientes/novo`)}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm hover:bg-white/5 flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              <button onClick={validarEtapa1}
                className="gradient-primary glow-primary font-bold rounded-xl px-6 py-2.5 text-white text-sm flex items-center gap-2">
                Avançar para Contrato <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10 pb-3">
            <CardTitle className="text-base font-bold text-white flex items-center justify-between">
              <span>2. Contrato & Assinatura do Gestor</span>
              <Badge variant="outline" className="border-sky-500/30 text-sky-400 bg-sky-500/10">
                GESTOR DE MÍDIAS
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-sky-400" />
                  <span className="font-bold text-white text-sm">Contrato de Gestão Operacional de Displays e Signage — SOBRE MÍDIAS</span>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Vigente</Badge>
              </div>

              <div className="text-xs text-slate-300 space-y-1.5 border-t border-sky-500/20 pt-3">
                <p><strong>Gestor:</strong> {form.nome || 'Não informado'} {form.cpfCnpj ? `(CPF/CNPJ: ${form.cpfCnpj})` : ''}</p>
                <p><strong>E-mail de Acesso:</strong> {form.email}</p>
                {form.empresa && <p><strong>Empresa/Organização:</strong> {form.empresa} {form.cargo ? `(${form.cargo})` : ''}</p>}
                <p><strong>Escopo:</strong> Regulamentação de direitos, deveres, condutas permitidas e proibidas na operação técnica e comercial da plataforma de Digital Signage SOBRE MÍDIA.</p>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPreviewModal(true)}
                  className="px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-semibold hover:bg-sky-500/20 flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" /> Visualizar Contrato Completo
                </button>
                <a
                  href="/templates/contrato_gestor_oficial.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 text-xs font-semibold hover:bg-white/5 flex items-center gap-1.5"
                >
                  Baixar PDF Oficial
                </a>
                {!contratoAssinado ? (
                  <button
                    type="button"
                    onClick={() => setAssinarAgoraModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 flex items-center gap-1.5"
                  >
                    <PenTool className="h-3.5 w-3.5" /> Assinar Agora
                  </button>
                ) : (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Assinado Digitalmente
                  </Badge>
                )}
              </div>
            </div>

            {erro && (
              <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5">{erro}</p>
            )}

            <div className="flex items-center justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm hover:bg-white/5 flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar aos Dados
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="gradient-primary glow-primary font-bold rounded-xl px-6 py-2.5 text-white text-sm flex items-center gap-2 disabled:opacity-60"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {contratoAssinado ? 'Concluir & Criar Acesso' : 'Assinar Depois & Criar Acesso'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODAL DE PREVIEW DO CONTRATO DE GESTOR */}
      {previewModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-sky-400" /> Contrato de Gestão Operacional de Displays e Signage
              </h3>
              <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30">GESTOR</Badge>
            </div>
            <div className="text-xs text-slate-300 space-y-3 font-sans leading-relaxed">
              <p className="font-bold text-sm text-slate-100">CLÁUSULA 1ª — DO OBJETO</p>
              <p>O presente contrato estabelece as normas de utilização da plataforma SOBRE MÍDIA para a gestão de displays, telas, inventários e sinalização digital pelo GESTOR DE MÍDIAS registrado.</p>
              
              <p className="font-bold text-sm text-slate-100">CLÁUSULA 2ª — DAS RESPONSABILIDADES DO GESTOR</p>
              <p>O GESTOR compromete-se a manter os dados operacionais das telas atualizados, operar os dispositivos de exibição de acordo com as normas técnicas e manter a integridade dos conteúdos veiculados.</p>

              <p className="font-bold text-sm text-slate-100">CLÁUSULA 3ª — DAS CONDUTAS PERMITIDAS E PROIBIDAS</p>
              <p>É expressamente proibida a veiculação de conteúdos não autorizados, ilícitos ou em desacordo com as políticas de veiculação da SOBRE MÍDIA. É permitida a gestão diária do inventário atribuído.</p>

              <p className="font-bold text-sm text-slate-100">CLÁUSULA 4ª — DO VÍNCULO E ACESSO</p>
              <p>A criação da conta de acesso ao portal do gestor concede ao GESTOR credenciais individuais e intransferíveis para operação técnica do sistema.</p>
            </div>
            <div className="flex justify-end pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setPreviewModal(false)}
                className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ASSINATURA RÁPIDA */}
      {assinarAgoraModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PenTool className="h-5 w-5 text-emerald-400" /> Assinatura Digital do Gestor
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              Eu, <strong>{form.nome || 'Gestor'}</strong>, confirmo o aceite dos termos do Contrato de Gestão Operacional de Displays e Signage.
            </p>
            <div className="p-3 bg-slate-950 rounded-xl border border-white/10 text-center py-6 text-slate-400 text-xs">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              Assinatura registrada eletronicamente com carimbo de data ({new Date().toLocaleDateString('pt-BR')}) e IP do dispositivo.
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setAssinarAgoraModal(false)}
                className="px-4 py-2 rounded-xl border border-white/10 text-slate-300 text-xs hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setContratoAssinado(true);
                  setAssinarAgoraModal(false);
                }}
                className="px-5 py-2 rounded-xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 shadow-lg"
              >
                Confirmar Assinatura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


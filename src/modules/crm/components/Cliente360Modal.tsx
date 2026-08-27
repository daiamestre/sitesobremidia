import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ClienteCompleto } from '../services/cliente.service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Phone, Mail, MapPin, FileText, ShieldCheck, DollarSign, Tv, Layers, Calendar, UserCheck, AlertCircle } from 'lucide-react';

interface Cliente360ModalProps {
  cliente: ClienteCompleto | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PropostaRow {
  id: string;
  numero_proposta?: string | null;
  status?: string | null;
  valor_total?: number | null;
  validade_dias?: number | null;
  cliente_id?: string | null;
}

interface ContratoRow {
  id: string;
  numero_contrato?: string | null;
  status_workflow?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  cliente_id?: string | null;
}

interface CobrancaRow {
  id: string;
  valor_parcela?: number | null;
  valor?: number | null;
  data_vencimento?: string | null;
  cliente_id?: string | null;
}

export const Cliente360Modal: React.FC<Cliente360ModalProps> = ({ cliente, isOpen, onClose }) => {
  const [propostas, setPropostas] = useState<PropostaRow[]>([]);
  const [contratos, setContratos] = useState<ContratoRow[]>([]);
  const [financeiro, setFinanceiro] = useState<CobrancaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const empresa = useMemo(() => cliente?.empresas?.[0] ?? null, [cliente?.empresas]);
  const contatoPrincipal = useMemo(() => 
    empresa?.contatos?.find(c => c.is_principal) ?? empresa?.contatos?.[0] ?? null, 
    [empresa?.contatos]
  );

  useEffect(() => {
    if (cliente?.id && isOpen) {
      fetchRelatedData(cliente.id);
    }
  }, [cliente?.id, isOpen]);

  const fetchRelatedData = async (clienteId: string) => {
    setLoading(true);
    try {
      const [propRes, contRes, finRes] = await Promise.all([
        supabase.from('propostas').select('*').eq('cliente_id', clienteId),
        supabase.from('contratos').select('*').eq('cliente_id', clienteId),
        supabase.from('contas_receber').select('*').eq('cliente_id', clienteId)
      ]);

      setPropostas(propRes.data || []);
      setContratos(contRes.data || []);
      setFinanceiro(finRes.data || []);
    } catch (err) {
      console.error('Erro ao buscar dados 360º:', err);
      setPropostas([]);
      setContratos([]);
      setFinanceiro([]);
    } finally {
      setLoading(false);
    }
  };

  if (!cliente || !empresa) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl bg-slate-900 border-white/10 text-white rounded-2xl p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="border-b border-white/10 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl text-primary border border-primary/30">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-white">
                  {empresa?.razao_social || 'Cliente sem Razão Social'}
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs flex items-center gap-2 mt-1">
                  <span>Fantasia: <strong className="text-slate-200">{empresa?.nome_fantasia || '-'}</strong></span>
                  <span>•</span>
                  <span>CNPJ: <strong className="text-slate-200">{empresa?.cnpj || '-'}</strong></span>
                </DialogDescription>
              </div>
            </div>

            <Badge className={`px-3 py-1 text-xs font-bold ${
              cliente.status === 'ATIVO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
              cliente.status === 'NEGOCIACAO' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
              'bg-slate-700/50 text-slate-300'
            }`}>
              {cliente.status}
            </Badge>
          </div>
        </DialogHeader>

        {/* TABS DE VISÃO 360 DE ACORDO COM O PROTOCOLO FASE 8.4-B.1 */}
        <Tabs defaultValue="geral" className="flex-1 flex flex-col mt-4 overflow-hidden">
          <TabsList className="bg-slate-950/60 border border-white/10 p-1 rounded-xl grid grid-cols-4 sm:grid-cols-9 gap-1 text-[10px] sm:text-xs mb-4">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="contatos">Contatos</TabsTrigger>
            <TabsTrigger value="propostas">Propostas ({propostas.length})</TabsTrigger>
            <TabsTrigger value="contratos">Contratos ({contratos.length})</TabsTrigger>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            <TabsTrigger value="telas">Telas</TabsTrigger>
            <TabsTrigger value="portal">Portal</TabsTrigger>
            <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4 text-sm">
            {/* ABA 1: DADOS GERAIS */}
            <TabsContent value="geral" className="space-y-4 m-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-white/10 bg-slate-950/50 space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Informações Cadastrais
                  </h4>
                  <p className="text-slate-300"><strong>Código Cliente:</strong> #{cliente.codigo_cliente}</p>
                  <p className="text-slate-300"><strong>Segmento:</strong> {empresa?.segmento || 'Não informado'}</p>
                  <p className="text-slate-300"><strong>Cidade / UF:</strong> {empresa?.cidade || '-'} / {empresa?.estado || '-'}</p>
                  <p className="text-slate-300"><strong>Cadastro em:</strong> {new Date(cliente.created_at).toLocaleDateString('pt-BR')}</p>
                </div>

                <div className="p-4 rounded-xl border border-white/10 bg-slate-950/50 space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-2">
                    <Phone className="h-4 w-4" /> Canais de Comunicação
                  </h4>
                  <p className="text-slate-300 flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-slate-400" /> {empresa?.email || '-'}
                  </p>
                  <p className="text-slate-300 flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-slate-400" /> {empresa?.whatsapp || empresa?.telefone || '-'}
                  </p>
                  <p className="text-slate-300"><strong>Representante Responsável:</strong> {cliente.representante?.usuario?.nome || 'Atribuição Global'}</p>
                </div>
              </div>
            </TabsContent>

            {/* ABA 2: CONTATOS */}
            <TabsContent value="contatos" className="space-y-3 m-0">
              {empresa?.contatos && empresa.contatos.length > 0 ? (
                empresa.contatos.map(c => (
                  <div key={c.id} className="p-4 rounded-xl border border-white/10 bg-slate-950/50 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-white flex items-center gap-2">
                        {c.nome} {c.is_principal && <Badge className="bg-primary/20 text-primary text-[10px]">Principal</Badge>}
                      </p>
                      <p className="text-xs text-slate-400">{c.cargo} • {c.email} • {c.telefone}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-6 text-slate-400">Nenhum contato secundário cadastrado.</p>
              )}
            </TabsContent>

            {/* ABA 3: PROPOSTAS */}
            <TabsContent value="propostas" className="space-y-3 m-0">
              {propostas.length > 0 ? (
                propostas.map(p => {
                  const propostaNum = p.numero_proposta || 'N/A';
                  const status = p.status || 'DESCONHECIDO';
                  const valorTotal = Number(p.valor_total || 0);
                  return (
                    <div key={p.id} className="p-4 rounded-xl border border-white/10 bg-slate-950/50 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white">Proposta Comercial #{String(propostaNum)}</p>
                        <p className="text-xs text-slate-400">Status: {String(status)} • Validade: {p.validade_dias || 15} dias</p>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400">R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Badge>
                    </div>
                  );
                })
              ) : (
                <p className="text-center py-6 text-slate-400">Nenhuma proposta comercial gerada para este cliente.</p>
              )}
            </TabsContent>

            {/* ABA 4: CONTRATOS */}
            <TabsContent value="contratos" className="space-y-3 m-0">
              {contratos.length > 0 ? (
                contratos.map(ct => {
                  const contratoNum = ct.numero_contrato || 'N/A';
                  const statusWorkflow = ct.status_workflow || 'DESCONHECIDO';
                  const dataInicio = ct.data_inicio ? new Date(ct.data_inicio).toLocaleDateString('pt-BR') : 'N/A';
                  const dataFim = ct.data_fim ? new Date(ct.data_fim).toLocaleDateString('pt-BR') : 'N/A';
                  return (
                    <div key={ct.id} className="p-4 rounded-xl border border-white/10 bg-slate-950/50 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white">Contrato de Mídia #{String(contratoNum)}</p>
                        <p className="text-xs text-slate-400">Status: {String(statusWorkflow)} • Vigência: {dataInicio} até {dataFim}</p>
                      </div>
                      <Badge className="bg-primary/20 text-primary">Ativo</Badge>
                    </div>
                  );
                })
              ) : (
                <p className="text-center py-6 text-slate-400">Nenhum contrato ativo formalizado.</p>
              )}
            </TabsContent>

            {/* ABA 5: CAMPANHAS */}
            <TabsContent value="campanhas" className="m-0 text-center py-6 text-slate-400">
              Campanhas de anúncio veiculadas nas telas da rede para este cliente.
            </TabsContent>

            {/* ABA 6: FINANCEIRO */}
            <TabsContent value="financeiro" className="space-y-3 m-0">
              {financeiro.length > 0 ? (
                financeiro.map(f => {
                  const valorParcela = Number(f.valor_parcela || f.valor || 0);
                  const dataVenc = f.data_vencimento ? new Date(f.data_vencimento).toLocaleDateString('pt-BR') : 'N/A';
                  return (
                    <div key={f.id} className="p-4 rounded-xl border border-white/10 bg-slate-950/50 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white">Cobrança Mensal</p>
                        <p className="text-xs text-slate-400">Vencimento: {dataVenc}</p>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-400">R$ {valorParcela.toFixed(2)}</Badge>
                    </div>
                  );
                })
              ) : (
                <p className="text-center py-6 text-slate-400">Nenhum título financeiro ou cobrança pendente.</p>
              )}
            </TabsContent>

            {/* ABA 7: TELAS */}
            <TabsContent value="telas" className="m-0 text-center py-6 text-slate-400">
              Painéis e telas corporativas contratadas onde o conteúdo deste cliente é exibido.
            </TabsContent>

            {/* ABA 8: ACESSO AO PORTAL */}
            <TabsContent value="portal" className="space-y-4 m-0">
              <div className="p-4 rounded-xl border border-white/10 bg-slate-950/50 space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-2">
                  <UserCheck className="h-4 w-4" /> Gestão de Identidade e Acesso
                </h4>
                <p className="text-slate-300 text-sm">
                  A conta de acesso ao <strong>Customer Portal</strong> está vinculada ao identificador mestre deste cliente (<code>{cliente.id}</code>).
                </p>
                <div className="bg-slate-900 p-3 rounded-lg border border-white/10">
                  <p className="text-xs text-slate-400 mb-2">Para conceder acesso ao cliente, peça que ele se cadastre na página de login e aprove o vínculo abaixo:</p>
                  <Button variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 text-xs w-full">
                    Gerar Link de Convite
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ABA 9: AUDITORIA */}
            <TabsContent value="auditoria" className="space-y-2 m-0 text-xs text-slate-400">
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/10 font-mono">
                <p>[AUDIT] Registro criado em {new Date(cliente.created_at).toISOString()}</p>
                <p>[AUDIT] Versão transacional PostgreSQL: v{cliente.version || 1}</p>
                <p>[AUDIT] Tenant ID: {cliente.empresa_operadora_id}</p>
                <p>[AUDIT] Identificador Mestre (PK): {cliente.id}</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

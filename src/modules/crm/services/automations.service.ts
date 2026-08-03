import { timelineService } from './timeline.service';
import { auditService } from './audit.service';
import { ContractStateMachine } from '../workflow/stateMachine';
import { WorkflowStatus } from '../types/workflow.types';
import { CrmRole } from '../types/rbac.types';

export class CrmAutomationsEngine {
  /**
   * Automação 1: Disparada quando o Representante clica em FINALIZAR no wizard
   * Status Inicial: AGUARDANDO_PAGAMENTO
   */
  async onFinalizarCadastro(params: {
    representanteId: string;
    representanteNome: string;
    dadosEmpresa: any;
    dadosContato: any;
    dadosCampanha: any;
    dadosPlano: any;
  }) {
    const contratoId = `CTR-${Date.now()}`;
    const clienteId = `CLI-${Date.now()}`;
    const empresaId = `EMP-${Date.now()}`;

    console.log('[AutomationsEngine.onFinalizarCadastro] Executando automações de finalização de cadastro:', {
      contratoId,
      clienteId,
      empresaId,
    });

    // 1. Simula Geração de PDFs (Proposta, Contrato, Pedido de Inserção)
    const propostaPdfUrl = `/docs/proposta_${contratoId}.pdf`;
    const contratoPdfUrl = `/docs/contrato_${contratoId}.pdf`;
    const pedidoInsercaoUrl = `/docs/pi_${contratoId}.pdf`;

    // 2. Registra Entrada na Timeline
    await timelineService.addEntry({
      contratoId,
      userId: params.representanteId,
      userNome: params.representanteNome,
      userRole: 'REPRESENTANTE',
      acao: 'FINALIZAR_CADASTRO',
      descricao: 'Cadastro finalizado pelo representante. Proposta, Contrato e PI gerados automaticamente.',
      statusNovo: 'AGUARDANDO_PAGAMENTO',
      metadata: { propostaPdfUrl, contratoPdfUrl, pedidoInsercaoUrl },
    });

    // 3. Registra Auditoria
    await auditService.log({
      userId: params.representanteId,
      userEmail: 'representante@sobremidia.com',
      userRole: 'REPRESENTANTE',
      entidadeTipo: 'contrato',
      entidadeId: contratoId,
      acao: 'CRIAR_CONTRATO',
      statusNovo: 'AGUARDANDO_PAGAMENTO',
      observacoes: 'Contrato gerado via Wizard do Representante.',
    });

    return {
      success: true,
      contratoId,
      clienteId,
      empresaId,
      status: 'AGUARDANDO_PAGAMENTO' as WorkflowStatus,
      propostaPdfUrl,
      contratoPdfUrl,
      pedidoInsercaoUrl,
    };
  }

  /**
   * Automação 2: Disparada quando o Financeiro/Admin confirma o pagamento
   * Transição: AGUARDANDO_PAGAMENTO -> PAGAMENTO_CONFIRMADO
   */
  async onConfirmarPagamento(params: {
    contratoId: string;
    usuarioId: string;
    usuarioNome: string;
    usuarioRole: CrmRole;
    observacoesFinanceiras?: string;
  }) {
    // Valida State Machine
    const validation = ContractStateMachine.canTransition('AGUARDANDO_PAGAMENTO', 'PAGAMENTO_CONFIRMADO', params.usuarioRole);
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    console.log(`[AutomationsEngine.onConfirmarPagamento] Confirmando pagamento do contrato ${params.contratoId}`);

    // Criar Ordem de Produção & Notificar Designer
    const ordemProducaoId = `OP-${Date.now()}`;

    await timelineService.addEntry({
      contratoId: params.contratoId,
      userId: params.usuarioId,
      userNome: params.usuarioNome,
      userRole: params.usuarioRole,
      acao: 'PAGAMENTO_CONFIRMADO',
      descricao: `Pagamento confirmado. Ordem de produção ${ordemProducaoId} criada para a equipe de Design.`,
      statusAnterior: 'AGUARDANDO_PAGAMENTO',
      statusNovo: 'PAGAMENTO_CONFIRMADO',
      metadata: { ordemProducaoId, observacoes: params.observacoesFinanceiras },
    });

    await auditService.log({
      userId: params.usuarioId,
      userEmail: `${params.usuarioRole.toLowerCase()}@sobremidia.com`,
      userRole: params.usuarioRole,
      entidadeTipo: 'contrato',
      entidadeId: params.contratoId,
      acao: 'CONFIRMAR_PAGAMENTO',
      statusAnterior: 'AGUARDANDO_PAGAMENTO',
      statusNovo: 'PAGAMENTO_CONFIRMADO',
      observacoes: params.observacoesFinanceiras,
    });

    return {
      success: true,
      ordemProducaoId,
      status: 'PAGAMENTO_CONFIRMADO' as WorkflowStatus,
    };
  }

  /**
   * Automação 3: Disparada quando o Designer conclui a arte
   * Transição: EM_PRODUCAO -> AGUARDANDO_APROVACAO
   */
  async onFinalizarProducao(params: {
    contratoId: string;
    designerId: string;
    designerNome: string;
    arquivosArteUrls: string[];
  }) {
    console.log(`[AutomationsEngine.onFinalizarProducao] Arte enviada pelo Designer para o contrato ${params.contratoId}`);

    await timelineService.addEntry({
      contratoId: params.contratoId,
      userId: params.designerId,
      userNome: params.designerNome,
      userRole: 'DESIGNER',
      acao: 'ENVIAR_ARTE_APROVACAO',
      descricao: 'Arte da campanha desenvolvida e enviada para aprovação do cliente.',
      statusAnterior: 'EM_PRODUCAO',
      statusNovo: 'AGUARDANDO_APROVACAO',
      metadata: { arquivosArteUrls: params.arquivosArteUrls },
    });

    return {
      success: true,
      status: 'AGUARDANDO_APROVACAO' as WorkflowStatus,
    };
  }

  /**
   * Automação 4: Disparada quando o Cliente aprova a arte
   * Transição: AGUARDANDO_APROVACAO -> CAMPANHA_APROVADA
   */
  async onAprovarArte(params: {
    contratoId: string;
    clienteId: string;
    clienteNome: string;
  }) {
    console.log(`[AutomationsEngine.onAprovarArte] Cliente aprovou a arte para o contrato ${params.contratoId}`);

    await timelineService.addEntry({
      contratoId: params.contratoId,
      userId: params.clienteId,
      userNome: params.clienteNome,
      userRole: 'CLIENTE',
      acao: 'APROVAR_ARTE',
      descricao: 'Cliente aprovou a arte. Campanha agendada automaticamente no Player de Mídia.',
      statusAnterior: 'AGUARDANDO_APROVACAO',
      statusNovo: 'CAMPANHA_APROVADA',
    });

    return {
      success: true,
      status: 'CAMPANHA_APROVADA' as WorkflowStatus,
    };
  }

  /**
   * Automação 5: Disparada quando a campanha é publicada no Player
   * Transição: CAMPANHA_APROVADA -> CAMPANHA_ATIVA
   */
  async onPublicarCampanha(params: {
    contratoId: string;
    adminId: string;
    adminNome: string;
  }) {
    console.log(`[AutomationsEngine.onPublicarCampanha] Campanha em veiculação no Player para o contrato ${params.contratoId}`);

    await timelineService.addEntry({
      contratoId: params.contratoId,
      userId: params.adminId,
      userNome: params.adminNome,
      userRole: 'ADMIN',
      acao: 'PUBLICAR_CAMPANHA',
      descricao: 'Campanha em veiculação nas telas corporativas da rede.',
      statusAnterior: 'CAMPANHA_APROVADA',
      statusNovo: 'CAMPANHA_ATIVA',
    });

    return {
      success: true,
      status: 'CAMPANHA_ATIVA' as WorkflowStatus,
    };
  }
}

export const crmAutomationsEngine = new CrmAutomationsEngine();

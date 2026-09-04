-- ============================================================================
-- MIGRATION: 20261218_gate_contratos_parceiro_02_template_oficial.sql
-- MICRO-GATE CONTRATOS-PARCEIRO-02: Template Canônico Integral do Contrato de Parceria
-- Atualiza TPL-PARCEIRO-OFICIAL com o HTML integral de 7 cláusulas extraído do PDF oficial
-- Idempotente e seguro para reexecução
-- ============================================================================

DO $$
DECLARE
  v_canonical_html TEXT := '<div class="contract-container" style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5; color: #1f2937;">
  <div style="text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 20px;">
    <h2 style="margin: 0; color: #1e3a8a; font-size: 18px; text-transform: uppercase; font-weight: bold;">SOBRE MÍDIA DESIGNER</h2>
    <p style="margin: 4px 0; font-size: 12px; color: #4b5563;">Rua Barão do Triunfo, 403, 10º Andar - Centro, Campina Grande - PB</p>
    <p style="margin: 2px 0; font-size: 11px; color: #6b7280;">Contato: (83) 98119-9069 | E-mail: contato@sobremidia.com.br | www.sobremidia.com.br</p>
    <h3 style="margin: 14px 0 0; font-size: 15px; color: #111827; font-weight: bold;">CONTRATO DE PARCERIA DE MÍDIA</h3>
  </div>

  <div style="margin-bottom: 16px; background-color: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb;">
    <h4 style="margin: 0 0 8px; font-size: 13px; font-weight: bold; color: #1e3a8a;">IDENTIFICAÇÃO DAS PARTES</h4>
    <p style="margin: 4px 0;"><strong>CONTRATADA (SOBRE MÍDIA):</strong> SOBRE MÍDIA DESIGNER, inscrita no CNPJ sob o nº 00.000.000/0001-00, com sede em Campina Grande - PB, representada na forma de seus atos constitutivos.</p>
    <p style="margin: 4px 0;"><strong>CONTRATANTE (ESTABELECIMENTO PARCEIRO):</strong> {{RAZAO_SOCIAL}}, inscrita no CNPJ sob o nº {{CNPJ}}, com endereço em {{ENDERECO_UNIDADE}}, Bairro {{BAIRRO}}, {{CIDADE}} - {{UF}}, neste ato representada por {{RESPONSAVEL}}, Telefone: {{TELEFONE}}, WhatsApp: {{WHATSAPP}}, E-mail: {{EMAIL}}, Instagram: {{INSTAGRAM}}.</p>
  </div>

  <div style="margin-bottom: 14px;">
    <p style="text-align: justify; margin: 0 0 10px;">Pelo presente instrumento particular, as partes acima qualificadas têm, entre si, justo e acordado o presente Contrato de Parceria para Veiculação de Conteúdo e Mídia Indoor, que se regerá pelas seguintes cláusulas e condições:</p>
  </div>

  <div style="margin-bottom: 14px;">
    <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 01 — DO OBJETO</h4>
    <p style="text-align: justify; margin: 0;">O presente contrato tem como objeto a parceria entre a SOBRE MÍDIA e o ESTABELECIMENTO PARCEIRO para a instalação de tela(s) informativa(s) e publicitária(s) em suas dependências, visando à veiculação de conteúdos informativos, institucionais e anúncios publicitários gerenciados pela rede SOBRE MÍDIA.</p>
  </div>

  <div style="margin-bottom: 14px;">
    <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 02 — SERVIÇOS REALIZADOS PELA SOBRE MÍDIA</h4>
    <p style="text-align: justify; margin: 0;">A SOBRE MÍDIA será responsável pela criação, edição, veiculação e gerenciamento da grade de programação exibida na(s) tela(s), incluindo a inserção de conteúdos informativos (notícias, previsão do tempo, dicas e entretenimento) e anúncios de parceiros comerciais. A SOBRE MÍDIA compromete-se a não veicular anúncios de concorrentes diretos do ESTABELECIMENTO PARCEIRO no mesmo ponto físico sem sua prévia anuência.</p>
  </div>

  <div style="margin-bottom: 14px;">
    <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 03 — OBRIGAÇÕES DO ESTABELECIMENTO PARCEIRO</h4>
    <p style="text-align: justify; margin: 0 0 6px;">O ESTABELECIMENTO PARCEIRO compromete-se a manter a(s) tela(s) ligada(s) durante todo o seu horário de funcionamento comercial, vedada a alteração da programação, desligamento injustificado ou uso do equipamento para outros fins.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>03.1. Internet:</strong> O ESTABELECIMENTO PARCEIRO disponibilizará acesso contínuo e estável à rede de internet (Wi-Fi ou cabeada) para sincronização e atualização dos conteúdos pela rede SOBRE MÍDIA.</p>
    <p style="text-align: justify; margin: 0 0 6px;"><strong>03.2. Energia Elétrica:</strong> O ESTABELECIMENTO PARCEIRO fornecerá ponto de energia elétrica adequado para o funcionamento dos equipamentos instalados, como contrapartida direta pela gestão e gerenciamento gratuito da tela institucional.</p>
    
    <div style="margin: 8px 0; border: 1px solid #d1d5db; padding: 8px; border-radius: 4px; background-color: #f8fafc;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <tr>
          <td style="padding: 4px 8px; font-weight: bold; width: 25%;">Dias de Funcionamento:</td>
          <td style="padding: 4px 8px;">{{DIAS_SEMANA}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 8px; font-weight: bold;">Horário de Exibição:</td>
          <td style="padding: 4px 8px;">{{HORARIO_INICIO}} às {{HORARIO_FIM}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 8px; font-weight: bold;">Vigência Operacional:</td>
          <td style="padding: 4px 8px;">De {{DATA_INICIO}} a {{DATA_FIM}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 8px; font-weight: bold;">Quantidade de Telas:</td>
          <td style="padding: 4px 8px;">{{QUANTIDADE_TELAS}} tela(s)</td>
        </tr>
      </table>
    </div>

    <p style="text-align: justify; margin: 4px 0;"><strong>03.3. Comunicação de Problemas:</strong> O ESTABELECIMENTO PARCEIRO deverá comunicar à SOBRE MÍDIA qualquer interrupção, falha técnica, oscilação ou anormalidade no funcionamento da tela no prazo máximo de 24 (vinte e quatro) horas.</p>
    <p style="text-align: justify; margin: 4px 0 0;"><strong>03.4. Proteção dos Equipamentos:</strong> O ESTABELECIMENTO PARCEIRO zelará pela integridade física dos equipamentos instalados em seu espaço físico, proibindo a interferência de terceiros não autorizados nos dispositivos.</p>
  </div>

  <div style="margin-bottom: 14px;">
    <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 04 — OBRIGAÇÕES DO GESTOR DE MÍDIA</h4>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>4.1.</strong> A SOBRE MÍDIA e seus Gestores autorizados realizarão a comercialização exclusiva dos espaços publicitários, monitoramento remoto e suporte técnico para manter o sistema operacional e atualizado.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>4.2.</strong> O software, sistema de gerenciamento, layouts e infraestrutura digital são de propriedade exclusiva da SOBRE MÍDIA, sendo expressamente vedada sua cópia, engenharia reversa, reprodução ou cessão a qualquer título.</p>
    <p style="text-align: justify; margin: 0;"><strong>4.3.</strong> Os conteúdos veiculados respeitarão os padrões éticos, a legislação vigente e os direitos autorais, cabendo à SOBRE MÍDIA a moderação das campanhas veiculadas na rede.</p>
  </div>

  <div style="margin-bottom: 14px;">
    <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 05 — GRADE DE PROGRAMAÇÃO</h4>
    <p style="text-align: justify; margin: 0;">O ESTABELECIMENTO PARCEIRO terá direito à inserção de anúncio e conteúdo institucional próprio de até 30 (trinta) segundos na grade de exibição da tela instalada em seu ponto e/ou na rede SOBRE MÍDIA da cidade, conforme disponibilidade técnica e plano acordado, sem custo adicional de veiculação.</p>
  </div>

  <div style="margin-bottom: 14px;">
    <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 06 — VIGÊNCIA E RESCISÃO</h4>
    <p style="text-align: justify; margin: 0 0 6px;">O presente contrato vigorará pelo prazo inicial de 6 (seis) meses a contar da data de sua assinatura, sendo renovado automaticamente por períodos sucessivos de 12 (doze) meses, caso não haja manifestação formal em contrário por qualquer das partes.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>6.1.</strong> O contrato poderá ser rescindido motivadamente a qualquer tempo nas seguintes hipóteses:</p>
    <p style="text-align: justify; margin: 0 0 4px; padding-left: 14px;"><strong>A)</strong> Descumprimento reiterado das obrigações contratuais por qualquer das partes, após notificação prévia não sanada no prazo de 10 (dez) dias úteis;</p>
    <p style="text-align: justify; margin: 0 0 6px; padding-left: 14px;"><strong>B)</strong> Encerramento das atividades do estabelecimento ou inviabilidade técnica superveniente devidamente comprovada.</p>
    <p style="text-align: justify; margin: 0;">A rescisão imotivada por iniciativa de qualquer das partes deverá ser comunicada por escrito com aviso prévio mínimo de 30 (trinta) dias, procedendo-se ao encerramento ordenado das veiculações e recolhimento dos equipamentos cedidos.</p>
  </div>

  <div style="margin-bottom: 20px;">
    <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 07 — CIÊNCIA DE CONTRATO / FORO / ASSINATURAS</h4>
    <p style="text-align: justify; margin: 0 0 16px;">As partes elegem o foro da comarca de {{FORO_COMARCA}} para dirimir quaisquer controvérsias oriundas deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
    <p style="text-align: center; margin: 0 0 24px;">{{CIDADE}} - {{UF}}, {{DATA_ASSINATURA}}.</p>
    
    <div style="display: flex; justify-content: space-between; margin-top: 30px; padding-top: 20px;">
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 6px;">
        <p style="margin: 0; font-weight: bold; font-size: 12px;">SOBRE MÍDIA DESIGNER</p>
        <p style="margin: 2px 0 0; font-size: 11px; color: #4b5563;">CONTRATADA</p>
      </div>
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 6px;">
        <p style="margin: 0; font-weight: bold; font-size: 12px;">{{RAZAO_SOCIAL}}</p>
        <p style="margin: 2px 0 0; font-size: 11px; color: #4b5563;">CONTRATANTE / ESTABELECIMENTO PARCEIRO</p>
      </div>
    </div>
  </div>
</div>';

BEGIN
  -- Atualizar todos os templates TPL-PARCEIRO-OFICIAL (preservando tipo_contrato, codigo_template, ativo, is_default)
  UPDATE public.contrato_templates
  SET 
    conteudo_html = v_canonical_html,
    updated_at = NOW()
  WHERE codigo_template = 'TPL-PARCEIRO-OFICIAL';

  RAISE NOTICE 'Templates TPL-PARCEIRO-OFICIAL atualizados com sucesso.';
END $$;

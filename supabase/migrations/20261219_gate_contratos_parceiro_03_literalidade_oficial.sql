-- ============================================================================
-- MIGRATION: 20261219_gate_contratos_parceiro_03_literalidade_oficial.sql
-- MICRO-GATE CONTRATOS-PARCEIRO-03: Correção Forense de Literalidade Estrita do Contrato de Parceria
-- Alinha o template TPL-PARCEIRO-OFICIAL fiel e ipsis litteris ao PDF oficial de referência
-- Idempotente e seguro para reexecução multi-tenant
-- ============================================================================

DO $$
DECLARE
  v_canonical_html TEXT := '<div class="contract-container" style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.45; color: #111827;">
  <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 14px;">
    <p style="margin: 0; font-size: 11px; font-weight: bold; color: #1e3a8a;">SOBRE MÍDIA DESIGNER, Rua 17 de Dezembro, n°38 – CENTRO - Cachoerinha/PE, CEP 55380-000</p>
    <p style="margin: 2px 0; font-size: 11px; color: #4b5563;">Tel: (81) 94862-5948 | E-mail: sobremidiadesigner@gmail.com | Site: www.sobremidiadesigner.my.canva.site/tvcorporativa</p>
    <h3 style="margin: 8px 0 0; font-size: 14px; color: #111827; font-weight: bold; text-transform: uppercase;">CONTRATO DE PARCERIA ENTRE SOBRE MÍDIA &amp; ESTABELECIMENTO PARCEIRO</h3>
  </div>

  <div style="margin-bottom: 12px; background-color: #f9fafb; padding: 10px; border-radius: 4px; border: 1px solid #e5e7eb;">
    <h4 style="margin: 0 0 6px; font-size: 12px; font-weight: bold; color: #1e3a8a;">DADOS DO CONTRATANTE – AGÊNCIA DE MÍDIA</h4>
    <table style="width: 100%; font-size: 11px; border-collapse: collapse; margin-bottom: 8px;">
      <tr>
        <td style="padding: 2px 0; width: 50%;"><strong>Nome/Razão Social:</strong> Sobre Mídia Designer</td>
        <td style="padding: 2px 0; width: 50%;"><strong>Responsável:</strong> Jairan Santos</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>CPF/CNPJ:</strong> 18.141.748/0001-70</td>
        <td style="padding: 2px 0;"><strong>E-mail:</strong> sobremidiadesigner@gmail.com</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Endereço:</strong> Av. Agamenon Magalhães, Nº 1019</td>
        <td style="padding: 2px 0;"><strong>Bairro:</strong> Maurício de Nassau</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Cidade:</strong> Caruaru</td>
        <td style="padding: 2px 0;"><strong>UF:</strong> PE</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;" colspan="2"><strong>Website:</strong> www.sobremidiadesigner.com.br</td>
      </tr>
    </table>

    <h4 style="margin: 8px 0 6px; font-size: 12px; font-weight: bold; color: #1e3a8a; border-top: 1px solid #e5e7eb; padding-top: 6px;">DADOS DA CONTRATADA - ESTABELECIMENTO PARCEIRO</h4>
    <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
      <tr>
        <td style="padding: 2px 0; width: 50%;"><strong>Nome/Razão Social:</strong> {{RAZAO_SOCIAL}}</td>
        <td style="padding: 2px 0; width: 50%;"><strong>Responsável:</strong> {{RESPONSAVEL}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>CPF/CNPJ:</strong> {{CNPJ}}</td>
        <td style="padding: 2px 0;"><strong>Contato:</strong> {{TELEFONE}} / {{WHATSAPP}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Endereço:</strong> {{ENDERECO_UNIDADE}}</td>
        <td style="padding: 2px 0;"><strong>Bairro:</strong> {{BAIRRO}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>Cidade:</strong> {{CIDADE}}</td>
        <td style="padding: 2px 0;"><strong>UF:</strong> {{UF}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>E-mail:</strong> {{EMAIL}}</td>
        <td style="padding: 2px 0;"><strong>Instagram:</strong> {{INSTAGRAM}}</td>
      </tr>
    </table>
  </div>

  <div style="margin-bottom: 10px;">
    <p style="text-align: justify; margin: 0 0 8px; font-size: 11.5px;">As partes acima identificadas têm, entre si, justo e acertado o Presente Contrato De Parceria Entre SOBRE MÍDIA DESIGNER e EMPRESA PARCEIRA, que se regerá pelas cláusulas seguintes.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 01 – DO OBJETO</h4>
    <p style="text-align: justify; margin: 0;">O objeto do presente Contrato é a PARCERIA ENTRE A SOBRE MÍDIA E ESTABELECIMENTO COMERCIAL referente à instalação de um tela/monitor de mídia e um mini PC portátil, oferecido pela SOBRE MÍDIA ou monitor cedido pela CONTRATADA.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 02 - SERVIÇOS REALIZADOS PELA SOBRE MÍDIA:</h4>
    <p style="text-align: justify; margin: 0;">O GESTOR DE MÍDIA, prospectara no comercio local, empresas que tenham interesse em anunciar e comunicar a sua marca, serviço ou produto nas TELAS E MONITORES DE MIDIA, instalado no estabelecimento comercial PARCEIRO, desde que o mesmo não se sinta prejudicado e não passe anúncios de seus concorrentes.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 03 - OBRIGAÇÕES DO ESTABELECIMENTO PARCEIRO</h4>
    <p style="text-align: justify; margin: 0 0 4px;">O PARCEIRO deverá ceder o espaço em seu estabelecimento comercial onde será instalado as telas e monitores oferecida pelo SOBRE MÍDIA, devendo manter a tela ligada durante todo o período combinado no quadro abaixo: O PARCEIRO fica expressamente proibido de sintonizar a tela em outras programações daquela que lhe foi acordado.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>03. 1 -</strong> A internet será de responsabilidade do PARCEIRO.</p>
    <p style="text-align: justify; margin: 0 0 6px;"><strong>03. 2 -</strong> A energia elétrica é fornecida pelo PARCEIRO. Em troca, o ESTABELECIMENTO terá a gestão e o gerenciamento completo de mídias e conteúdos de comunicação visual totalmente gratuitos até o término do vigente contrato.</p>
    
    <div style="margin: 6px 0; border: 1px solid #d1d5db; padding: 6px 10px; border-radius: 4px; background-color: #f8fafc;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <tr>
          <td style="padding: 3px 6px; font-weight: bold; width: 35%;">Dias da Semana de veiculação:</td>
          <td style="padding: 3px 6px;">{{DIAS_SEMANA}}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px; font-weight: bold;">Faixa de horários diária:</td>
          <td style="padding: 3px 6px;">{{HORARIO_INICIO}} às {{HORARIO_FIM}}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px; font-weight: bold;">Dados do período de veiculação:</td>
          <td style="padding: 3px 6px;">De {{DATA_INICIO}} a {{DATA_FIM}}</td>
        </tr>
        <tr>
          <td style="padding: 3px 6px; font-weight: bold;">Quantidade de Telas / Monitores:</td>
          <td style="padding: 3px 6px;">{{QUANTIDADE_TELAS}} tela(s)</td>
        </tr>
      </table>
    </div>

    <p style="text-align: justify; margin: 4px 0;"><strong>03. 3 -</strong> É dever do ESTABELECIMENTO PARCEIRO informar a SOBRE MÍDIA sobre possíveis problemas, como: tela desligada, tela sem exibir vídeo, programações desatualizadas, dentre outros problemas que afetem a exibição da programação.</p>
    <p style="text-align: justify; margin: 4px 0 0;"><strong>03. 4 -</strong> O ESTABELECIMENTO PARCEIRO fica expressamente impedido de interferir de qualquer forma nas telas e demais equipamentos instalados pela SOBRE MÍDIA em seu estabelecimento, devendo zelar pela segurança dos equipamentos, como se fossem seus, durante a vigência do presente contrato.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 04 - OBRIGAÇÕES DO GESTOR DE MÍDIA</h4>
    <p style="text-align: justify; margin: 0 0 4px;">A comercialização de espaços publicitários é de inteira responsabilidade da SOBRE MÍDIA e/ou seus parceiros, respeitando as regras do estabelecimento bem como as cláusulas estabelecidas no presente instrumento.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>4.1 -</strong> O GESTOR DE MÍDIA monitorará o funcionamento dos equipamentos instalados nas dependências do estabelecimento comercial do PARCEIRO , verificando registros de ocorrências e SOLUCIONANDO OS PROBLEMAS e intervindo remotamente quando necessário, para correções no software e no conteúdo executado em cada MONITOR .</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>4.2 -</strong> A titularidade do software de controle de mídia, bem como todos os direitos dela decorrentes, será de responsabilidade da SOBRE MÍDIA , estando o PARCEIRO e seus colaboradores, expressamente proibidos de manusear, copiar ou fornecer a terceiros quaisquer informações relativas ao software.</p>
    <p style="text-align: justify; margin: 0;"><strong>4.3 -</strong> A comercialização de espaços de mídia será de responsabilidade da SOBRE MÍDIA, respeitando as condições previstas do estabelecimento: • É proibido apresentar conteúdo de cunho, ideológico, exploração sexual ou preconceituoso; • Não constranger os clientes com conteúdo sexual, racista ou sexista; • Respeitar a legislação vigente, seja no que diz respeito à propriedade intelectual e aos direitos autorais de conteúdos audiovisuais, seja no que diz respeito à outras normas e leis vigentes.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 05 – GRADE DE PROGRAMAÇÃO</h4>
    <p style="text-align: justify; margin: 0;">Na grade de programação a SOBRE MÍDIA cederá espaço nas telas entorno da cidade e nos pontos onde a SOBRE MÍDIA possui uma ou mais telas ou monitores, veiculando seu anúncio de até 30 seg dentro de outros estabelecimentos comerciais, aumentando a sua visibilidade em nossa região e garantindo a entrega de suas mídis e conteúdos sem custos. A inserção das mídias será de responsabilidade do GESTOR DE MÍDIA.</p>
  </div>

  <div style="margin-bottom: 10px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 06 - VIGÊNCIA E RESCISÃO</h4>
    <p style="text-align: justify; margin: 0 0 4px;">A vigência deste contrato iniciará no momento em que o operador instalar as telas no estabelecimento do PARCEIRO e vigorará pelo prazo de 6 meses com renovação automática para 12 meses se não houver comunicação ou desistência de ambas as partes. caso haja uma comunicação expressa por qualquer uma das partes para desistência ou quebra de contrato por qualquer motivo elencado nesta cláusula, ficará o ESTABELECIMENTO PARCEIRO automaticamente proibido de utilizar o software, produtos e outros equipamentos que sejam de titularidade da SOBRE MÍDIA , bem como, o GESTOR DE MÍDIA ficará automaticamente impedido de utilizar o nome do PARCEIRO no seu portfólio de clientes.</p>
    <p style="text-align: justify; margin: 0 0 4px;"><strong>6.1 -</strong> O presente contrato poderá ser rescindido mediante SOLICITAÇÃO EXPRESSA de uma das partes com o prazo mínimo de 30 (trinta) dias de antecedência. casos:</p>
    <p style="text-align: justify; margin: 0 0 4px; padding-left: 12px;"><strong>A)</strong> Quando qualquer uma das partes não tenha mais interesse na continuidade do contrato, devendo comunicar prévia e formalmente à outra parte, agendando a data e hora desejada de seu desligamento e devolução/ retirada dos equipamentos;</p>
    <p style="text-align: justify; margin: 0 0 4px; padding-left: 12px;"><strong>B)</strong> pelo descumprimento de qualquer das cláusulas previstas neste contrato; pelo ajuizamento de qualquer ação, contra uma parte, que venha a afetar a sua credibilidade ou idoneidade.</p>
  </div>

  <div style="margin-bottom: 16px;">
    <h4 style="margin: 0 0 4px; font-size: 12px; font-weight: bold; color: #1e3a8a;">CLÁUSULA 07 – CIÊNCIA DE CONTRATO</h4>
    <p style="text-align: justify; margin: 0 0 12px;">As partes elegem o Foro da Comarca da cidade de {{FORO_COMARCA}}, para dirimir qualquer demanda judicial relativa ao presente contrato, com exclusão de qualquer outro.</p>
    <p style="text-align: center; margin: 0 0 20px;">Local: {{LOCAL_ASSINATURA}}, Data: {{DATA_ASSINATURA}}</p>
    
    <div style="display: flex; justify-content: space-between; margin-top: 24px; padding-top: 16px;">
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">SOBRE MÍDIA</p>
      </div>
      <div style="width: 45%; text-align: center; border-top: 1px solid #111827; padding-top: 4px;">
        <p style="margin: 0; font-weight: bold; font-size: 11px;">{{RAZAO_SOCIAL}} (PARCEIRO)</p>
      </div>
    </div>
  </div>
</div>';

BEGIN
  -- Atualizar todos os templates TPL-PARCEIRO-OFICIAL com a transcrição literal e fiel do contrato oficial
  UPDATE public.contrato_templates
  SET 
    conteudo_html = v_canonical_html,
    updated_at = NOW()
  WHERE codigo_template = 'TPL-PARCEIRO-OFICIAL';

  RAISE NOTICE 'Templates TPL-PARCEIRO-OFICIAL alinhados com a literalidade do contrato oficial com sucesso.';
END $$;

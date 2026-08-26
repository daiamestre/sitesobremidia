-- Template Mínimo de Teste E2E

DELETE FROM public.comunicacao_templates WHERE template_key = 'COMMUNICATION_CORE_TEST';

INSERT INTO public.comunicacao_templates (
  empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, status
) VALUES (
  NULL,
  'COMMUNICATION_CORE_TEST',
  'COMMUNICATION_CORE_TEST',
  'email',
  '[SOBRE MÍDIA] Teste do Communication Core',
  '<!DOCTYPE html><html><body><div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;"><h2>Este é um teste real do Communication Core do SOBRE MÍDIA.</h2><p>A mensagem foi processada através da fila, Provider Layer e Resend.</p><p style="color: #666; font-size: 12px; margin-top: 40px;">Não responder a este e-mail.</p></div></body></html>',
  ARRAY[]::text[],
  'ACTIVE'
);

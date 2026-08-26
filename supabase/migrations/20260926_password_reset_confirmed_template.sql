-- ======================================================================
-- Template de confirmação de reset de senha
-- ======================================================================

INSERT INTO public.comunicacao_templates (
  empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, status
) VALUES (
  NULL, 'password_reset_confirmed', 'PASSWORD_RESET', 'email', '✅ Senha Alterada com Sucesso — SOBRE MÍDIA',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .success { background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0; } .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }</style></head><body><div class="container"><div class="header"><h1 style="margin: 0;">✅ Senha Alterada</h1></div><div class="content"><p>Olá <strong>{{nome_usuario}}</strong>,</p><p>Sua senha na plataforma <strong>SOBRE MÍDIA</strong> foi <strong>alterada com sucesso</strong>!</p><p>Se você não fez essa alteração, entre em contato com nossa equipe imediatamente.</p><div class="footer"><p>Equipe SOBRE MÍDIA</p></div></div></div></body></html>',
  ARRAY['nome_usuario'],
  'ACTIVE'
)
ON CONFLICT (template_key, canal, versao) DO UPDATE SET
  assunto = EXCLUDED.assunto,
  corpo = EXCLUDED.corpo,
  variaveis = EXCLUDED.variaveis,
  status = EXCLUDED.status,
  updated_at = NOW();
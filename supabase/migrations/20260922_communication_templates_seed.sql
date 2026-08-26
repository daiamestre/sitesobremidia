-- ======================================================================
-- 20260922_communication_templates_seed.sql
-- Populates default HTML templates for the Communication Core
-- ======================================================================

INSERT INTO public.comunicacao_templates (
  empresa_operadora_id, template_key, event_name, canal, assunto, corpo, variaveis, status
) VALUES

-- 1. TEST_NOTIFICATION
(
  NULL, 'test_notification', NULL, 'email', '✅ Teste de Notificação - SOBRE MÍDIA',
  '<!DOCTYPE html><html><head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .success { background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0; } .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }</style></head><body><div class="container"><div class="header"><h1 style="margin: 0;">✅ Teste de Notificação</h1></div><div class="content"><p>Olá {{full_name}},</p><div class="success"><strong>Sucesso!</strong> Suas notificações por e-mail estão funcionando corretamente.</div><p>Este é um e-mail de teste para confirmar que você receberá alertas quando suas telas ficarem offline por mais de <strong>{{offline_notification_threshold}} minutos</strong>.</p><p>Você pode alterar suas preferências de notificação a qualquer momento em Configurações.</p><div class="footer"><p>Esta é uma notificação de teste do sistema SOBRE MÍDIA.</p></div></div></div></body></html>',
  ARRAY['full_name', 'offline_notification_threshold'],
  'ACTIVE'
),

-- 2. STATUS_NOTIFICATION_APPROVED
(
  NULL, 'user_approved', 'USER_APPROVED', 'email', '✅ Sua conta foi aprovada - SOBRE MÍDIA',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { font-family: ''Segoe UI'', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px; } .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; padding: 40px; border: 1px solid #333; } .header { text-align: center; margin-bottom: 30px; } .logo { font-size: 28px; font-weight: bold; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; } .content { background: #262626; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center; } .icon { font-size: 64px; margin-bottom: 16px; } h2 { color: #fff; margin-bottom: 16px; } p { color: #aaa; line-height: 1.6; margin: 12px 0; } .cta { text-align: center; margin-top: 24px; } .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }</style></head><body><div class="container"><div class="header"><div class="logo">SOBRE MÍDIA</div></div><div class="content"><div class="icon">🎉</div><h2>Parabéns, {{nome_usuario}}!</h2><p>Sua conta na plataforma SOBRE MÍDIA foi <strong style="color: #22c55e;">aprovada</strong>!</p><p>Agora você tem acesso completo ao sistema de Digital Signage.</p></div><div class="cta"><p style="color: #888; margin-bottom: 16px;">Acesse agora e comece a criar suas campanhas:</p></div><div class="footer"><p>Obrigado por escolher a SOBRE MÍDIA!</p></div></div></body></html>',
  ARRAY['nome_usuario'],
  'ACTIVE'
),

-- 3. STATUS_NOTIFICATION_REJECTED
(
  NULL, 'user_rejected', 'USER_REJECTED', 'email', '❌ Solicitação de acesso - SOBRE MÍDIA',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { font-family: ''Segoe UI'', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a; color: #ffffff; padding: 40px; } .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; padding: 40px; border: 1px solid #333; } .header { text-align: center; margin-bottom: 30px; } .logo { font-size: 28px; font-weight: bold; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; } .content { background: #262626; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center; } .icon { font-size: 64px; margin-bottom: 16px; } h2 { color: #fff; margin-bottom: 16px; } p { color: #aaa; line-height: 1.6; margin: 12px 0; } .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }</style></head><body><div class="container"><div class="header"><div class="logo">SOBRE MÍDIA</div></div><div class="content"><div class="icon">😔</div><h2>Olá, {{nome_usuario}}</h2><p>Infelizmente sua solicitação de acesso à plataforma SOBRE MÍDIA foi <strong style="color: #ef4444;">recusada</strong>.</p><p>Se você acredita que isso foi um engano ou deseja mais informações, entre em contato com nossa equipe de suporte.</p></div><div class="footer"><p>Atenciosamente,<br>Equipe SOBRE MÍDIA</p></div></div></body></html>',
  ARRAY['nome_usuario'],
  'ACTIVE'
),

-- 4. USER_APPROVAL_REQUEST_ADMIN
(
  NULL, 'user_approval_request_admin', NULL, 'email', '🔔 Nova solicitação de acesso — {{nome_usuario}} ({{tipo_acesso}})',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:''Segoe UI'',sans-serif;background:#0a0a0a;color:#fff;padding:40px;margin:0} .wrap{max-width:600px;margin:0 auto;background:#1a1a1a;border-radius:16px;padding:40px;border:1px solid #333} .logo{font-size:24px;font-weight:bold;background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:24px} .field{margin-bottom:14px}.field-label{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px} .field-value{color:#fff;font-size:15px;margin-top:3px} .actions{display:flex;gap:12px;margin-top:28px;justify-content:center;flex-wrap:wrap} .btn{padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none;display:inline-block;font-size:14px} .btn-approve{background:#22c55e;color:#fff}.btn-reject{background:#ef4444;color:#fff} .footer{color:#555;font-size:11px;margin-top:28px;text-align:center}</style></head><body><div class="wrap"><div class="logo">SOBRE MÍDIA</div><p style="color:#aaa;margin-bottom:24px">Nova solicitação de acesso aguardando aprovação:</p><div class="field"><div class="field-label">Nome</div><div class="field-value">{{nome_usuario}}</div></div><div class="field"><div class="field-label">E-mail</div><div class="field-value">{{email_usuario}}</div></div><div class="field"><div class="field-label">Tipo de Acesso</div><div class="field-value">{{tipo_acesso}}</div></div><div class="field"><div class="field-label">Empresa</div><div class="field-value">{{empresa_nome}}</div></div><div class="actions"><a href="{{approveLink}}" class="btn btn-approve">✅ APROVAR</a> <a href="{{rejectLink}}" class="btn btn-reject">❌ RECUSAR</a></div><p style="text-align:center;color:#666;font-size:11px;margin-top:10px">Links válidos por 48 horas. Single-use.</p><div class="footer">E-mail automático do sistema SOBRE MÍDIA.</div></div></body></html>',
  ARRAY['nome_usuario', 'email_usuario', 'tipo_acesso', 'empresa_nome', 'approveLink', 'rejectLink'],
  'ACTIVE'
),

-- 5. USER_REGISTERED
(
  NULL, 'user_registered', 'USER_REGISTERED', 'email', 'Bem-vindo à SOBRE MÍDIA — Crie sua senha de acesso',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333} .container{max-width:600px;margin:0 auto;padding:20px} .header{background:#0f172a;color:#fff;padding:20px;border-radius:8px 8px 0 0} .content{background:#f8fafc;padding:20px;border-radius:0 0 8px 8px} .success{background:#ecfdf5;border-left:4px solid #10b981;padding:12px;margin:16px 0} .footer{text-align:center;color:#64748b;font-size:12px;margin-top:20px} .cta{background:#10b981;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:display;margin:20px 0} .warning{color:#f59e0b;margin:16px 0}</style></head><body><div class="container"><div class="header"><h1 style="margin:0;">Bem-vindo à SOBRE MÍDIA</h1></div><div class="content"><p>Olá <strong>{{nome_usuario}}</strong>,</p><p>Seu acesso à plataforma SOBRE MÍDIA foi criado.</p><p>Para começar, clique no botão abaixo e defina sua senha de acesso.</p><div style="text-align:center"><a href="{{reset_link}}" class="cta">CRIAR MINHA SENHA</a></div><p>Seu acesso foi criado para: <strong>{{email_usuario}}</strong></p><p>Não compartilhar este e-mail.</p><p>Se você não reconhece este convite, ignore esta mensagem.</p><div class="warning">Este link expira em 24 horas.</div><div class="footer">Equipe SOBRE MÍDIA</div></div></body></html>',
  ARRAY['nome_usuario', 'email_usuario', 'reset_link'],
  'ACTIVE'
),

-- 6. GENERIC_EMAIL
(
  NULL, 'generic_email', NULL, 'email', '{{subject}}',
  '{{{html}}}',
  ARRAY['subject', 'html'],
  'ACTIVE'
),

-- 7. USER_CONFIRMED
(
  NULL, 'user_confirmed', 'USER_CONFIRMED', 'email', '✅ Confirmação de Cadastro — SOBRE MÍDIA',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .success { background: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0; } .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }</style></head><body><div class="container"><div class="header"><h1 style="margin: 0;">✅ Confirmação de Cadastro</h1></div><div class="content"><p>Olá <strong>{{nome_usuario}}</strong>,</p><p>Seu cadastro na plataforma <strong>SOBRE MÍDIA</strong> foi <strong>confirmado</strong>!</p><p>Você já pode acessar a plataforma utilizando suas credenciais.</p><div class="footer"><p>Equipe SOBRE MÍDIA</p></div></div></div></body></html>',
  ARRAY['nome_usuario'],
  'ACTIVE'
),

-- 8. USER_INVITED
(
  NULL, 'user_invited', 'USER_INVITED', 'email', '📨 Você recebeu um convite — SOBRE MÍDIA',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } .invite-code { background: #e0e7ff; border: 1px solid #a5f3fc; padding: 16px; border-radius: 8px; margin: 20px 0; font-family: monospace; } .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }</style></head><body><div class="container"><div class="header"><h1 style="margin: 0;">📨 Você recebeu um convite</h1></div><div class="content"><p>Olá <strong>{{nome_usuario}}</strong>,</p><p>Você recebeu um convite para acessar a plataforma SOBRE MÍDIA.</p><div class="invite-code">Código: {{codigo_invite}}</div><p>Clique no botão abaixo para aceitar o convite e criar sua conta.</p>{{#if_link}}<a href="{{link_aceite}}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Aceitar Convite</a>{{/if_link}}<div class="footer"><p>Este convite expira em 7 dias. Equipe SOBRE MÍDIA</p></div></div></div></body></html>',
  ARRAY['nome_usuario', 'codigo_invite', 'link_aceite'],
  'ACTIVE'
),

-- 9. PASSWORD_RESET
(
  NULL, 'password_reset', 'PASSWORD_RESET', 'email', '🔐 Recuperação de Acesso — SOBRE MÍDIA',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #fff; padding: 20px; border-radius: 0 0 8px 8px; } .reset-link { background: #f3f4f6; border: 2px solid #e5e7eb; padding: 16px; border-radius: 8px; margin: 20px 0; } .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }</style></head><body><div class="container"><div class="header"><h1 style="margin: 0;">🔐 Recuperação de Acesso</h1></div><div class="content"><p>Olá <strong>{{nome_usuario}}</strong>,</p><p>Solicitou a recuperação de senha para a plataforma SOBRE MÍDIA.</p><div class="reset-link"><a href="{{reset_link}}" style="background-color: #f59e0b; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8; font-weight: bold;">Redefinir Minha Senha</a></div><p>Se você não solicitou isso, ignore este e-mail.</p><div class="footer"><p>Equipe SOBRE MÍDIA</p></div></div></div></body></html>',
  ARRAY['nome_usuario', 'reset_link'],
  'ACTIVE'
),

-- 7. PROPOSAL_GENERATED
(
  NULL, 'proposal_generated', NULL, 'email', 'Proposta Comercial {{numero_proposta}} - Sobre Mídia',
  '<div style="font-family: Arial, sans-serif; background: #0f172a; color: #fff; padding: 30px; border-radius: 12px;"><h2 style="color: #0284c7;">Proposta Comercial {{numero_proposta}}</h2><p>Olá <strong>{{nome_fantasia}}</strong>,</p><p>Sua proposta comercial no valor mensal de <strong>{{valor_final}}</strong> está pronta!</p><p>Clique no botão abaixo para visualizar o documento oficial completo:</p><a href="{{proposta_link}}" style="display: inline-block; padding: 12px 24px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 15px;">Visualizar Proposta</a></div>',
  ARRAY['numero_proposta', 'nome_fantasia', 'valor_final', 'proposta_link'],
  'ACTIVE'
),

-- 8. OFFLINE_SCREEN_ALERT
(
  NULL, 'offline_screen_alert', 'PLAYER_OFFLINE', 'email', '⚠️ Alerta: {{quantidade_telas}} tela(s) offline',
  '<!DOCTYPE html><html><head><style>body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; } .container { max-width: 600px; margin: 0 auto; padding: 20px; } .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0; } .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; } table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; } th { background: #f3f4f6; padding: 12px 8px; text-align: left; } .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 16px 0; } .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }</style></head><body><div class="container"><div class="header"><h1 style="margin: 0;">⚠️ Alerta de Telas Offline</h1></div><div class="content"><p>Olá {{nome_usuario}},</p><div class="alert"><strong>{{quantidade_telas}} tela(s)</strong> está(ão) offline há mais de {{minutos_offline}} minutos.</div><table><thead><tr><th>Tela</th><th>Localização</th><th>Tempo Offline</th></tr></thead><tbody>{{{screen_list_html}}}</tbody></table><p style="margin-top: 20px;">Por favor, verifique a conexão e o status das telas afetadas.</p><p style="font-size: 12px; color: #6b7280;">Você pode alterar suas preferências de notificação em Configurações.</p><div class="footer"><p>Esta é uma notificação automática do sistema SOBRE MÍDIA.</p></div></div></div></body></html>',
  ARRAY['nome_usuario', 'quantidade_telas', 'minutos_offline', 'screen_list_html'],
  'ACTIVE'
);

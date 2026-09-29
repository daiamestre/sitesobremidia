import { supabase } from '@/integrations/supabase/client';

/**
 * F-119 — Envia uma imagem para o R2 (mesmo caminho do cadastro de ponto parceiro) e devolve o endereço público.
 * Aceita só imagens de até 20 MB.
 */
export async function enviarImagemR2(file: File, pasta = 'pontos'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Apenas imagens são aceitas.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Imagem acima de 20 MB.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Sessão do usuário não encontrada.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `${session.user.id}/${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const inv = await supabase.functions.invoke('get-upload-url', { body: { bucket: 'clientes_assets', fileName, contentType: file.type } });
  if (inv.error || !inv.data?.signedUrl || !inv.data?.publicUrl) throw new Error('Falha ao autorizar o envio da foto.');
  const put = await fetch(inv.data.signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!put.ok) throw new Error('Falha no envio da foto.');
  return inv.data.publicUrl as string;
}

/** Valor da tela para exibição: R$ 0,00 = "Grátis". */
export const precoTela = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return 'Sob consulta';
  const n = Number(v);
  return n === 0 ? 'Grátis' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

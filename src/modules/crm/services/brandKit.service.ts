import { supabase } from '@/integrations/supabase/client';
import { BrandKitSettings } from '@/types/brandKit';

export class BrandKitService {
  /**
   * Atualiza as configurações de Brand Kit de um cliente
   */
  static async atualizarBrandKit(clienteId: string, payload: Partial<BrandKitSettings>): Promise<void> {
    if (!clienteId) throw new Error('clienteId é obrigatório');

    const { error } = await supabase
      .from('clientes')
      .update(payload)
      .eq('id', clienteId);

    if (error) {
      console.error('[BrandKitService] Erro ao atualizar brand kit:', error);
      throw error;
    }
  }

  /**
   * Faz o upload da logo para o R2 usando a Edge Function `get-upload-url`
   * Retorna a URL pública do arquivo recém-enviado.
   */
  static async uploadLogo(file: File, clienteId: string): Promise<string> {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${clienteId}-${Date.now()}.${fileExt}`;
      const bucket = 'clientes_assets';

      // 1. Pede a URL assinada para a Edge Function
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('get-upload-url', {
        body: { bucket, fileName, contentType: file.type }
      });

      if (uploadError) {
        console.error('[BrandKitService] Erro ao obter URL de upload:', uploadError);
        throw uploadError;
      }

      if (!uploadData?.uploadUrl || !uploadData?.publicUrl) {
        throw new Error('Retorno inválido da Edge Function get-upload-url');
      }

      // 2. Faz o upload binário direto para a URL do Cloudflare R2
      const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Erro no upload para o R2: ${uploadResponse.statusText}`);
      }

      // 3. Retorna a URL pública
      return uploadData.publicUrl;
    } catch (error) {
      console.error('[BrandKitService] Falha no processo de upload de logo:', error);
      throw error;
    }
  }
}

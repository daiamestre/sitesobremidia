import { supabase } from '@/integrations/supabase/client';

export class CameraService {
  async captureAndUploadPhoto(
    checkinId: string, 
    mediaId: string, 
    categoria: 'ANTES' | 'DURANTE' | 'DEPOIS' | 'COMPROVANTE' = 'COMPROVANTE'
  ): Promise<{ success: boolean }> {
    try {
      await supabase.from('mobile_fotos').insert({
        checkin_id: checkinId,
        media_id: mediaId,
        categoria: categoria
      });

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }
}

export const cameraService = new CameraService();

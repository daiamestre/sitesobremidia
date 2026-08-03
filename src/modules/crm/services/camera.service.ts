import { supabase } from '@/integrations/supabase/client';

export class CameraService {
  async captureAndUploadPhoto(empresaOperadoraId: string, latitude?: number, longitude?: number): Promise<{ success: boolean; photoKey?: string }> {
    const photoKey = `tenants/${empresaOperadoraId}/mobile/photos/photo_${Date.now()}.jpg`;

    await supabase.from('mobile_fotos').insert({
      empresa_operadora_id: empresaOperadoraId,
      r2_object_key: photoKey,
      latitude: latitude || -23.55052,
      longitude: longitude || -46.633308,
    });

    return { success: true, photoKey };
  }
}

export const cameraService = new CameraService();

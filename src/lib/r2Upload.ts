/**
 * Shared helper: upload a File or Blob directly to Cloudflare R2 via Presigned URL.
 * 
 * This replaces all direct s3Client.send(new PutObjectCommand(...)) calls in the browser,
 * which crash with "t.getReader is not a function" when given a Blob/File body.
 *
 * Flow:
 *  1. Browser calls `get-upload-url` Edge Function to get a temporary presigned PUT URL
 *  2. Browser does a raw PUT fetch to Cloudflare R2 using that URL
 *  3. Returns the public CDN URL for the uploaded file
 *
 * [MICRO-GATE 3.3] Suporte a preventOverwrite com cabeçalho `If-None-Match: *`.
 * Impede que uploads secundários para a mesma chave sobrescrevam o documento assinado no R2.
 */

import { supabase } from '@/integrations/supabase/client';

const R2_PUBLIC_DOMAIN = (import.meta.env?.VITE_R2_PUBLIC_DOMAIN || '') as string;

export interface PresignedUploadResult {
  publicUrl: string;
  filePath: string;
}

export interface UploadToR2Options {
  preventOverwrite?: boolean;
}

/**
 * Upload a file (or blob) to R2 via presigned URL.
 * @param file - The file or blob to upload
 * @param filePath - The destination path in R2 (e.g. `userId/temp/video.mp4`)
 * @param contentType - MIME type (e.g. 'video/mp4' or 'application/pdf')
 * @param userId - The authenticated user's ID (used to scope the path server-side)
 * @param options - Optional settings such as `preventOverwrite: true` (If-None-Match: *)
 */
export async function uploadToR2(
  file: File | Blob,
  filePath: string,
  contentType: string,
  userId: string,
  options?: UploadToR2Options
): Promise<PresignedUploadResult> {
  const preventOverwrite = options?.preventOverwrite ?? false;

  // Step 1: get presigned URL from Edge Function
  const { data, error } = await supabase.functions.invoke('get-upload-url', {
    body: {
      fileName: filePath,
      contentType,
      userId,
      preventOverwrite,
    },
  });

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to get presigned upload URL');
  }

  const shouldPreventOverwrite = Boolean(preventOverwrite || data.preventOverwrite);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };

  if (shouldPreventOverwrite) {
    headers['If-None-Match'] = '*';
  }

  // Step 2: PUT file directly to R2
  const res = await fetch(data.signedUrl, {
    method: 'PUT',
    body: file,
    headers,
  });

  if (res.status === 412 || res.status === 409) {
    throw new Error(`R2 upload rejected: File already exists at '${filePath}' (overwrite prevented).`);
  }

  if (!res.ok) {
    throw new Error(`R2 upload failed: ${res.status} ${res.statusText}`);
  }

  return {
    publicUrl: data.publicUrl,
    filePath: data.filePath,
  };
}

/**
 * Same as uploadToR2 but with XHR for real-time progress tracking.
 */
export async function uploadToR2WithProgress(
  file: File | Blob,
  filePath: string,
  contentType: string,
  userId: string,
  onProgress?: (percent: number) => void,
  options?: UploadToR2Options
): Promise<PresignedUploadResult> {
  const preventOverwrite = options?.preventOverwrite ?? false;

  const { data, error } = await supabase.functions.invoke('get-upload-url', {
    body: {
      fileName: filePath,
      contentType,
      userId,
      preventOverwrite,
    },
  });

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to get presigned upload URL');
  }

  const shouldPreventOverwrite = Boolean(preventOverwrite || data.preventOverwrite);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          publicUrl: data.publicUrl,
          filePath: data.filePath,
        });
      } else if (xhr.status === 412 || xhr.status === 409) {
        reject(new Error(`R2 upload rejected: File already exists at '${filePath}' (overwrite prevented).`));
      } else {
        reject(new Error(`R2 upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('R2 upload network error'));

    xhr.open('PUT', data.signedUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    if (shouldPreventOverwrite) {
      xhr.setRequestHeader('If-None-Match', '*');
    }
    xhr.send(file);
  });
}

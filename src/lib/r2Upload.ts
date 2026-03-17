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
 */

import { supabase } from '@/integrations/supabase/client';

const R2_PUBLIC_DOMAIN = import.meta.env.VITE_R2_PUBLIC_DOMAIN as string;

export interface PresignedUploadResult {
  publicUrl: string;
  filePath: string;
}

/**
 * Upload a file (or blob) to R2 via presigned URL.
 * @param file - The file or blob to upload
 * @param filePath - The destination path in R2 (e.g. `userId/temp/video.mp4`)
 * @param contentType - MIME type (e.g. 'video/mp4' or 'image/jpeg')
 * @param userId - The authenticated user's ID (used to scope the path server-side)
 */
export async function uploadToR2(
  file: File | Blob,
  filePath: string,
  contentType: string,
  userId: string
): Promise<PresignedUploadResult> {
  // Step 1: get presigned URL from Edge Function
  const { data, error } = await supabase.functions.invoke('get-upload-url', {
    body: {
      fileName: filePath,
      contentType,
      userId,
    },
  });

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to get presigned upload URL');
  }

  // Step 2: PUT file directly to R2
  const res = await fetch(data.signedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': contentType,
    },
  });

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
  file: File,
  filePath: string,
  contentType: string,
  userId: string,
  onProgress: (percent: number) => void
): Promise<PresignedUploadResult> {
  // Step 1: get presigned URL from Edge Function
  const { data, error } = await supabase.functions.invoke('get-upload-url', {
    body: {
      fileName: filePath,
      contentType,
      userId,
    },
  });

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to get presigned upload URL');
  }

  // Step 2: PUT file directly to R2 via XHR with progress
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.signedUrl, true);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload. Check your connection.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Try again.'));
    xhr.timeout = 600000; // 10 min

    xhr.send(file);
  });

  return {
    publicUrl: data.publicUrl,
    filePath: data.filePath,
  };
}

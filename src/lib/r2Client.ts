/**
 * [SECURITY HARDENING FASE F — P0]
 * Este módulo NÃO exporta mais S3Client com credenciais R2.
 * As credenciais de escrita/leitura/delete viveram aqui e eram
 * embutidas no bundle do browser (VITE_R2_ACCESS_KEY / VITE_R2_SECRET_KEY),
 * permitindo que qualquer visitante extraísse chaves com acesso total ao
 * bucket de mídia.
 *
 * Agora TODO acesso ao R2 é mediado por Edge Functions autenticadas:
 *   - Upload:  get-upload-url (presigned PUT, JWT + escopo validado)
 *   - Delete:  delete-media-object (presigned DELETE, JWT + escopo validado)
 * Este arquivo mantém apenas configuração pública de entrega (CDN).
 */

const bucketName = import.meta.env.VITE_R2_BUCKET_NAME;
const publicDomain = import.meta.env.VITE_R2_PUBLIC_DOMAIN;
// [FASE 1 CDN] Custom domain (ex: cdn.sobremidia.com.br) para entrega via edge
const cdnDomain = import.meta.env.VITE_R2_CDN_DOMAIN || publicDomain;

export const r2Config = {
    bucketName,
    publicDomain,
    cdnDomain,
};

/**
 * [FASE 1] Retorna a URL otimizada para entrega via CDN.
 * Se VITE_R2_CDN_DOMAIN estiver configurado, usa o dominio CDN.
 * Senao, usa o dominio publico padrao do R2.
 */
export const getCdnUrl = (filePath: string): string => {
    return `${cdnDomain}/${filePath}`;
};

/**
 * [FASE 1] Cache-Control headers otimizados para CDN Edge.
 * Midias sao imutaveis (UUID no nome), entao cache agressivo e seguro.
 */
export const CDN_CACHE_HEADERS = {
    media: 'public, max-age=31536000, immutable',     // 1 ano (arquivo UUID nunca muda)
    thumbnail: 'public, max-age=2592000, immutable',   // 30 dias
};
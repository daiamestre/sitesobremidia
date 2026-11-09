// F-285: substituto do cliente do Supabase para usar as regras do site em scripts (nunca acessa o banco)
export const supabase = new Proxy({}, { get: () => () => { throw new Error('sem supabase nos scripts'); } });

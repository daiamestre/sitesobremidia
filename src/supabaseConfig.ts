
export const getStoredConfig = () => {
    const storedUrl = localStorage.getItem('VITE_SUPABASE_URL');
    const storedKey = localStorage.getItem('VITE_SUPABASE_PUBLISHABLE_KEY');
    return {
        url: storedUrl || import.meta.env.VITE_SUPABASE_URL,
        key: storedKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    };
};

export const supabaseConfig = getStoredConfig();

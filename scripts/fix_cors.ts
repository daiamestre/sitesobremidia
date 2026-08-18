import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bhwsybgsyvvhqtkdqozb.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'COLE_A_CHAVE_ANON_AQUI'
const supabase = createClient(supabaseUrl, supabaseKey)

async function fixCors() {
    console.log('Updating "media" bucket CORS...')

    const { data, error } = await supabase
        .storage
        .updateBucket('media', {
            public: true,
            allowedMimeTypes: null,
            fileSizeLimit: null,
            cors_origins: ['*'] // CRITICAL FIX
        })

    if (error) {
        console.error('Error updating bucket:', error)
    } else {
        console.log('Success! Bucket updated:', data)
    }
}

fixCors()

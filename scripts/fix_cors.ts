import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bhwsybgsyvvhqtkdqozb.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI'
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

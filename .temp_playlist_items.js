const urlItems = 'https://bhwsybgsyvvhqtkdqozb.supabase.co/rest/v1/playlist_items?select=*';
const urlMedia = 'https://bhwsybgsyvvhqtkdqozb.supabase.co/rest/v1/media?select=*';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';

const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };

Promise.all([
    fetch(urlItems, { headers }).then(r => r.json()),
    fetch(urlMedia, { headers }).then(r => r.json())
]).then(([items, medias]) => {
    console.log("--- Items mapped to Media ---");
    items.forEach(item => {
        if (item.media_id) {
            const media = medias.find(m => m.id === item.media_id);
            if (media) {
                console.log(`Playlist: ${item.playlist_id} | Name: '${media.name}' | URL: ${media.file_url}`);
            } else {
                console.log(`Playlist: ${item.playlist_id} | Media ID: ${item.media_id} (NOT FOUND IN MEDIA TABLE)`);
            }
        }
    });
}).catch(console.error);

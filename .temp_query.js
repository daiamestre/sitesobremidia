const url = 'https://bhwsybgsyvvhqtkdqozb.supabase.co/rest/v1/media?select=name';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';

fetch(url, {
    method: 'GET',
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    }
})
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            console.error("Error:", data.error);
            return;
        }
        const names = data.map(m => m.name);
        console.log("--- All Media Names ---");
        names.forEach(n => console.log(n));
        console.log("--- Check for MIDI1, MIDI2, MIDI3 ---");
        console.log("Found MIDI1?", names.includes("MIDI1") || names.includes("MIDI1.mp4"));
        console.log("Found MIDI2?", names.includes("MIDI2") || names.includes("MIDI2.mp4"));
        console.log("Found MIDI3?", names.includes("MIDI3") || names.includes("MIDI3.mp4"));
    })
    .catch(err => console.error(err));

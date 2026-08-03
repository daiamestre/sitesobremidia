import fetch from 'node-fetch';

async function testUrl(url) {
    try {
        const res = await fetch(url, { method: 'HEAD' });
        console.log(`URL: ${url}`);
        console.log(`Status: ${res.status} ${res.statusText}`);
        console.log(`Content-Type: ${res.headers.get('content-type')}`);
        console.log(`Content-Length: ${res.headers.get('content-length')}`);
    } catch (err) {
        console.error(`Error testing ${url}:`, err);
    }
}

async function run() {
    console.log('--- TESTING HORIZONTAL 1 ---');
    await testUrl('https://bhwsybgsyvvhqtkdqozb.supabase.co/storage/v1/object/public/media/4164f657-8896-4e32-9bd4-2c253a1245fe/1773716623571-xpw9jq.mp4');
    
    console.log('\n--- TESTING HORIZONTAL 2 ---');
    await testUrl('https://pub-560b3bffe687403695c61035c8c8f7a7.r2.dev/4164f657-8896-4e32-9bd4-2c253a1245fe/temp/627bf064-b53d-447e-ae71-e60886776c4e.mp4');
}

run();

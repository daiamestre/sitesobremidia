import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const userId = "b9f91a92-d3a3-4876-b605-64c8d50f83dc"; // arbitrary UUID for test

async function run() {
  const url = `${supabaseUrl}/functions/v1/get-upload-url`;
  console.log("Fetching", url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      fileName: 'temp/teste123.mp4',
      contentType: 'video/mp4',
      userId: userId
    })
  });

  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}

run();

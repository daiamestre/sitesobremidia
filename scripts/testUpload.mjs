import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.VITE_R2_ACCESS_KEY,
    secretAccessKey: process.env.VITE_R2_SECRET_KEY,
  },
});

async function run() {
  const filePath = "c:\\Users\\Jairan Santos\\Downloads\\VIDEO 1 HOTEL MAXSUEL AFTER.mp4";
  const fileStream = fs.createReadStream(filePath);
  const command = new PutObjectCommand({
    Bucket: process.env.VITE_R2_BUCKET_NAME,
    Key: 'temp/test_60mb_upload.mp4',
    Body: fileStream,
    ContentType: 'video/mp4'
  });

  try {
    console.log("Starting upload of 60MB file...");
    await s3Client.send(command);
    console.log("Upload successful!");
  } catch (err) {
    console.error("Upload failed.", err);
  }
}
run();

import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.VITE_R2_ACCESS_KEY,
    secretAccessKey: process.env.VITE_R2_SECRET_KEY,
  },
});

const corsCommand = new PutBucketCorsCommand({
  Bucket: process.env.VITE_R2_BUCKET_NAME,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
        AllowedOrigins: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3000,
      },
    ],
  },
});

async function run() {
  try {
    const data = await s3Client.send(corsCommand);
    console.log("CORS configured successfully.");
  } catch (err) {
    console.error("CORS configuration failed.", err);
  }
}
run();

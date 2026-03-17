const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config();

const config = {
    bucketName: process.env.VITE_R2_BUCKET_NAME,
    endpoint: process.env.VITE_R2_ENDPOINT,
    accessKeyId: process.env.VITE_R2_ACCESS_KEY,
    secretAccessKey: process.env.VITE_R2_SECRET_KEY,
};

const s3Client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
    },
});

async function testUpload() {
    console.log('Testing R2 Upload...');
    const testFileName = `test-upload-${Date.now()}.txt`;
    const params = {
        Bucket: config.bucketName,
        Key: `debug/${testFileName}`,
        Body: "Hello from R2 Migration Test!",
        ContentType: "text/plain",
    };

    try {
        await s3Client.send(new PutObjectCommand(params));
        console.log(`✅ Success! File uploaded: debug/${testFileName}`);
        console.log(`Check it at: ${process.env.VITE_R2_PUBLIC_DOMAIN}/debug/${testFileName}`);
    } catch (err) {
        console.error('❌ Upload failed:', err);
    }
}

testUpload();

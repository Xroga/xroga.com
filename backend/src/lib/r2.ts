import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let s3Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!s3Client) {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKey = process.env.CLOUDFLARE_R2_ACCESS_KEY;
    const secretKey = process.env.CLOUDFLARE_R2_SECRET_KEY;

    if (!accountId || !accessKey || !secretKey) {
      throw new Error('Cloudflare R2 credentials not configured');
    }

    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
  }
  return s3Client;
}

export interface R2UploadResult {
  key: string;
  publicUrl: string;
  bucket: string;
}

export async function uploadToR2(
  key: string,
  body: Buffer | string,
  contentType: string
): Promise<R2UploadResult> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET ?? 'xroga-assets';
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL;

  const client = getR2Client();
  const buffer = typeof body === 'string' ? Buffer.from(body) : body;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const publicUrl = publicBase
    ? `${publicBase.replace(/\/$/, '')}/${key}`
    : `https://${bucket}.r2.dev/${key}`;

  return { key, publicUrl, bucket };
}

export function buildR2Key(userId: string, filename: string): string {
  const ts = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `users/${userId}/${ts}-${safe}`;
}

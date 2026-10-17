import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/** S3-compatible object storage: MinIO on the laptop, Cloudflare R2 in the alpha. */
@Injectable()
export class StorageService {
  private readonly client: S3Client
  // Pre-signed links are opened by the browser, which reaches MinIO at a different host
  // (localhost:9000) than the API container does (minio:9000). The host is part of the signature.
  private readonly signingClient: S3Client
  private readonly bucket: string

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET', 'carefusion-files')
    const endpoint = config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000')
    const publicEndpoint = config.get<string>('MINIO_PUBLIC_ENDPOINT') || endpoint
    const credentials = {
      accessKeyId: config.get<string>('MINIO_ROOT_USER', ''),
      secretAccessKey: config.get<string>('MINIO_ROOT_PASSWORD', ''),
    }
    const make = (ep: string) =>
      new S3Client({
        region: 'us-east-1', // MinIO ignores the region but the SDK needs one
        endpoint: ep,
        forcePathStyle: true, // required for MinIO
        credentials,
      })
    this.client = make(endpoint)
    this.signingClient = publicEndpoint === endpoint ? this.client : make(publicEndpoint)
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    )
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(this.signingClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn })
  }

  /** For admin cleanup only. Citizen documents are never deleted. */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}

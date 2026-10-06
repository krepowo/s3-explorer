export type Connection = {
  id: string;
  label: string;
  provider: 'r2' | 's3' | 'b2' | 'minio' | 'other';
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  bucket: string;
  publicBaseUrl: string;
  isActive: boolean;
  isPrimary: boolean;
  accessKeyMasked: string;
  createdAt: string;
  updatedAt: string;
};

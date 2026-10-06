export type UploadedFile = {
  id: string;
  filename: string;
  sizeBytes: string;
  contentType: string;
  etag: string | null;
  ownerId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  publicUrl: string;
  createdAt: string;
};

export type FileListResponse = {
  files: UploadedFile[];
  total: number;
  page: number;
  limit: number;
};

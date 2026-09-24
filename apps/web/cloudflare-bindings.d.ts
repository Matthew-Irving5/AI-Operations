declare global {
  interface CloudflareEnv {
    APP_ENV?: string;
    ARCHIVE_BUCKET?: R2Bucket;
    FINANCE_ARCHIVE_GATEWAY_SECRET?: string;
  }
}

export {};

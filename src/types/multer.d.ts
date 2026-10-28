/**
 * Minimal type augmentation for Express.Multer.File.
 * @nestjs/platform-express uses multer internally but @types/multer is not
 * installed as a direct dependency. This declaration provides the global
 * Express.Multer namespace required by NestJS FileInterceptor + @UploadedFile().
 */
declare global {
  namespace Express {
    namespace Multer {
      /** In-memory file uploaded via multipart/form-data. */
      interface File {
        /** Form field name */
        fieldname: string;
        /** Original file name from the client */
        originalname: string;
        /** Encoding (e.g. '7bit') */
        encoding: string;
        /** MIME type as reported by the client */
        mimetype: string;
        /** File size in bytes */
        size: number;
        /** File contents in memory (when using memoryStorage) */
        buffer: Buffer;
        /** Storage destination (disk storage) */
        destination?: string;
        /** Stored filename (disk storage) */
        filename?: string;
        /** Full path to stored file (disk storage) */
        path?: string;
      }
    }
  }
}

export {};

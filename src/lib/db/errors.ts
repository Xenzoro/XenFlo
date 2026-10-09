/**
 * Typed data layer errors. The API maps each code to an HTTP status
 * (see src/lib/utils/http.ts), so routes never deal with raw Postgres errors.
 */
export type DbErrorCode = "NOT_FOUND" | "CONFLICT" | "NOT_CONFIGURED" | "DB_ERROR";

export class DbError extends Error {
  constructor(
    public code: DbErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DbError";
  }
}

/** Shape of errors returned by supabase-js (PostgREST). */
interface PostgrestLikeError {
  code?: string;
  message: string;
}

/** Translate a supabase-js error into a DbError with a friendly message. */
export function fromPostgrest(err: PostgrestLikeError): DbError {
  switch (err.code) {
    case "PGRST116": // .single() found no row
    case "P0002": // raised by update_knowledge_base when the id doesn't exist
      return new DbError("NOT_FOUND", "That knowledge base doesn't exist.");
    case "40001": // raised by update_knowledge_base on a version mismatch
      return new DbError("CONFLICT", "Someone saved a newer version. Reload to see the latest changes.");
    default:
      return new DbError("DB_ERROR", `Database error: ${err.message}`);
  }
}

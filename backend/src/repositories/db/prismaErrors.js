/**
 * Normalize Prisma errors to Supabase-client-like `{ message, code }` shapes.
 * @param {unknown} err
 * @returns {{ message: string, code?: string }}
 */
export function toSupabaseStyleError(err) {
  if (!err || typeof err !== "object") {
    return { message: String(err ?? "Unknown error") };
  }
  const e = /** @type {{ code?: string; message?: string; meta?: { target?: string[] } }} */ (err);
  const message = e.message ? String(e.message) : "Database error";
  if (e.code === "P2002") {
    return { message, code: "23505" };
  }
  if (e.code === "P2025") {
    return { message, code: "PGRST116" };
  }
  return { message, code: e.code };
}

/**
 * @param {unknown} err
 * @returns {Error & { code?: string }}
 */
export function toErrorWithCode(err) {
  const styled = toSupabaseStyleError(err);
  const error = new Error(styled.message);
  if (styled.code) error.code = styled.code;
  return error;
}

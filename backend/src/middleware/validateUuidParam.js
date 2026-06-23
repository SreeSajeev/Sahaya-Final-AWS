import { z } from "zod";
import { jsonRes } from "../utils/http.js";

const uuid = z.string().uuid();

/**
 * Express param handler for `:id` route segments (tickets, etc.).
 */
export function validateUuidParam(req, res, next, id) {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) {
    return jsonRes(res, 400, { error: "Invalid id" });
  }
  next();
}

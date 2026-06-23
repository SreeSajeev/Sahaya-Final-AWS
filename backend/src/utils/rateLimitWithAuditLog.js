import rateLimit from "express-rate-limit";

/**
 * Same behavior as express-rate-limit default handler; logs one line when limit is exceeded.
 * Does not change status code, body shape, or headers beyond what the library already sets.
 */
export function createRateLimitWithAuditLog(routeName, options) {
  return rateLimit({
    ...options,
    handler: async (request, response, _next, opts) => {
      console.warn("[RATE_LIMIT]", {
        route: routeName,
        requestId: request.requestId,
        path: request.originalUrl?.split("?")[0] ?? request.path,
      });
      response.status(opts.statusCode);
      const message =
        typeof opts.message === "function"
          ? await opts.message(request, response)
          : opts.message;
      if (!response.writableEnded) {
        response.send(message);
      }
    },
  });
}

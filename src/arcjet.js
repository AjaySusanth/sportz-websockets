import arcjet, {detectBot, shield, slidingWindow} from "@arcjet/node";

const arcjetKey = process.env.ARCJET_KEY;

if (!arcjetKey) throw new Error("ARCJET_KEY environment variable is missing.");

export const httpArcjet = arcjetKey
  ? arcjet({
      key: arcjetKey,
      rules: [
        shield({ mode: "LIVE" }),
        detectBot({
          mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
          allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
        }),
        slidingWindow({ mode: "LIVE", interval: "10s", max: 50 }),
      ],
    })
  : null;

export const wsArcjet = arcjetKey
  ? arcjet({
      key: arcjetKey,
      rules: [
        shield({ mode: "LIVE" }),
        detectBot({
          mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
          allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
        }),
        slidingWindow({ mode: "LIVE", interval: "2s", max: 5 }),
      ],
    })
  : null;

export function securityMiddleware() {
    return async (req, res, next) => {
    if (!httpArcjet) return next();

    const clientIp = req.socket?.remoteAddress || req.connection?.remoteAddress;
    const isLoopback =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp === "::ffff:127.0.0.1";

    if (isLoopback) {
      return next();
    }

    try {
      const decision = await httpArcjet.protect(req);

      if (decision.isDenied()) {
        if (decision.reason.isRateLimit()) {
          return res.status(429).json({ error: "Too many requests." });
        }

        return res.status(403).json({ error: "Forbidden." });
      }
    } catch (e) {
      console.error("Arcjet middleware error", e);
      return res.status(503).json({ error: "Service Unavailable" });
    }

        next();
    }
}
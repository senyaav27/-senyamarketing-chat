import { createHash } from "node:crypto";
// Render can generate a 256-bit base64 seed. Domain-separated derived secrets
// satisfy Telegram's allowed alphabet without persisting anything on local disk.
export function webhookSecrets(env = process.env) {
  const seed = env.CHAT_SECRET_SEED;
  if (seed && (typeof seed !== "string" || seed.length < 32))
    throw new Error("Invalid CHAT_SECRET_SEED");
  const derive = (label) =>
    seed
      ? createHash("sha256")
          .update(label + "\0" + seed)
          .digest("hex")
      : undefined;
  return {
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET || derive("telegram-webhook"),
    tildaSecret: env.TILDA_WEBHOOK_SECRET || derive("tilda-webhook"),
  };
}

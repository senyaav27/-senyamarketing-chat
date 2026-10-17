export function config(env = process.env) {
  const required = [
    "DATABASE_URL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_OWNER_ID",
    "TELEGRAM_CHAT_ID",
    "TELEGRAM_WEBHOOK_SECRET",
    "TILDA_WEBHOOK_SECRET",
    "PUBLIC_URL",
    "ALLOWED_ORIGINS",
  ];
  for (const key of required) if (!env[key]) throw new Error(`Missing ${key}`);
  if (
    !/^\d+$/.test(env.TELEGRAM_OWNER_ID) ||
    !/^-?\d+$/.test(env.TELEGRAM_CHAT_ID)
  )
    throw new Error("Invalid Telegram IDs");
  for (const key of ["TELEGRAM_WEBHOOK_SECRET", "TILDA_WEBHOOK_SECRET"])
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(env[key]))
      throw new Error(`Invalid ${key}`);
  const publicUrl = new URL(env.PUBLIC_URL).origin;
  if (env.NODE_ENV === "production" && !publicUrl.startsWith("https://"))
    throw new Error("HTTPS required");
  const origins = env.ALLOWED_ORIGINS.split(",").map(
    (x) => new URL(x.trim()).origin,
  );
  const retention = Number(env.RETENTION_DAYS || 90);
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650)
    throw new Error("Invalid RETENTION_DAYS");
  const privacyUrl = env.PRIVACY_POLICY_URL || "";
  if (privacyUrl && !/^https:\/\//.test(privacyUrl))
    throw new Error("Invalid privacy URL");
  return {
    publicUrl,
    origins,
    retention,
    privacyUrl,
    token: env.TELEGRAM_BOT_TOKEN,
    ownerId: env.TELEGRAM_OWNER_ID,
    chatId: env.TELEGRAM_CHAT_ID,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    tildaSecret: env.TILDA_WEBHOOK_SECRET,
    formFields: (
      env.TILDA_ALLOWED_FIELDS || "Name,Phone,Email,Telegram,Message"
    )
      .split(",")
      .map((x) => x.trim()),
    formNames: JSON.parse(env.TILDA_FORM_NAMES || "{}"),
    trustProxy: Number(env.TRUST_PROXY || 0),
  };
}

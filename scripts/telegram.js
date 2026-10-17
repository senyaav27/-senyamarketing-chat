import { webhookSecrets } from "../src/secrets.js";
import { telegram } from "../src/telegram.js";
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in server environment");
const api = telegram(token),
  command = process.argv[2];
try {
  if (command === "identify") {
    const challenge = process.env.TELEGRAM_IDENTIFY_CODE;
    if (!challenge || challenge.length < 24)
      throw new Error(
        "Set a random TELEGRAM_IDENTIFY_CODE (24+ characters) locally/server-side, then send that exact code to your bot from your own account.",
      );
    const info = await api("getWebhookInfo", {});
    if (info.url)
      throw new Error(
        "Webhook already active. Identification is only allowed before setup; it will not delete an existing webhook.",
      );
    const updates = await api("getUpdates", {
      timeout: 0,
      allowed_updates: ["message"],
    });
    const matches = updates.filter(
      (u) =>
        (u.message?.text === challenge ||
          u.message?.text === `/start@SenyaaMarketing_chat_bot ${challenge}`) &&
        !u.message.from?.is_bot,
    );
    if (!matches.length)
      console.log(
        "No matching message. Send the code to @SenyaaMarketing_chat_bot and run again.",
      );
    for (const u of matches)
      console.log(
        JSON.stringify({
          user_id: u.message.from.id,
          chat_id: u.message.chat.id,
          chat_type: u.message.chat.type,
        }),
      );
  } else if (command === "setup") {
    const url = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL,
      secret = webhookSecrets().webhookSecret;
    if (!url?.startsWith("https://") || !secret || secret.length < 32)
      throw new Error("Set HTTPS PUBLIC_URL and TELEGRAM_WEBHOOK_SECRET");
    await api("setWebhook", {
      url: new URL("/webhooks/telegram", url).href,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
    console.log("Webhook configured");
  } else if (command === "status") {
    const info = await api("getWebhookInfo", {});
    console.log(
      JSON.stringify({
        configured: !!info.url,
        pending: info.pending_update_count,
        last_error_date: info.last_error_date,
        has_error: !!info.last_error_message,
      }),
    );
  } else throw new Error("Use identify, setup or status");
} catch (e) {
  console.error(
    e.message.startsWith("telegram_") ? "Telegram request failed" : e.message,
  );
  process.exitCode = 1;
}

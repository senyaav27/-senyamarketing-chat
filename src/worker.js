// Row lock is held through sendMessage so concurrent workers cannot send the same job.
// Telegram has no idempotency key: an ambiguous network result can still duplicate a notification.
export async function deliverOne(db, api) {
  return db.transaction(async (tx) => {
    const {
      rows: [job],
    } = await tx.query(
      "SELECT * FROM outbox WHERE sent_at IS NULL AND next_at <= now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1",
    );
    if (!job) return false;
    try {
      const sent = await api("sendMessage", job.payload);
      if (job.message_id) {
        const {
          rows: [message],
        } = await tx.query("SELECT conversation_id FROM messages WHERE id=$1", [
          job.message_id,
        ]);
        if (message)
          await tx.query(
            "INSERT INTO telegram_links VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            [job.chat_id, sent.message_id, message.conversation_id],
          );
      }
      await tx.query(
        "UPDATE outbox SET sent_at=now(),last_error=NULL WHERE id=$1",
        [job.id],
      );
    } catch (e) {
      const seconds = Math.max(
        Math.min(3600, 2 ** Math.min(job.attempts + 2, 12)),
        Number(e.retryAfter) || 0,
      );
      await tx.query(
        "UPDATE outbox SET attempts=attempts+1,last_error='telegram_unavailable',next_at=now()+($2 * interval '1 second') WHERE id=$1",
        [job.id, seconds],
      );
    }
    return true;
  });
}
export async function cleanup(db, days) {
  await db.transaction(async (tx) => {
    await tx.query(
      "DELETE FROM conversations WHERE updated_at < now()-($1 * interval '1 day')",
      [days],
    );
    await tx.query(
      "DELETE FROM form_leads WHERE created_at < now()-($1 * interval '1 day')",
      [days],
    );
    await tx.query(
      "DELETE FROM outbox WHERE message_id IS NULL AND form_id IS NULL AND created_at < now()-interval '7 days'",
    );
    await tx.query("DELETE FROM rate_limits WHERE expires_at < now()");
    // Keep update IDs at least as long as retained conversations to reject Telegram retries.
    await tx.query(
      "DELETE FROM telegram_updates WHERE created_at < now()-($1 * interval '1 day')",
      [days],
    );
  });
}
export function startWorker(db, api, days) {
  let stopping = false,
    timer,
    lastCleanup = 0,
    active = Promise.resolve();
  async function tick() {
    try {
      for (let i = 0; i < 20 && !stopping; i++)
        if (!(await deliverOne(db, api))) break;
      if (Date.now() - lastCleanup > 3600000) {
        await cleanup(db, days);
        lastCleanup = Date.now();
      }
    } catch {
      console.error("worker_error");
    }
    if (!stopping)
      timer = setTimeout(() => {
        active = tick();
      }, 1500);
  }
  active = tick();
  return async () => {
    stopping = true;
    clearTimeout(timer);
    await active;
  };
}

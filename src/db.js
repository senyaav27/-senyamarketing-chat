import pg from "pg";
import { readFile } from "node:fs/promises";
export function database(url) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 8,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  pool.on("error", () => console.error("database_connection_error"));
  return {
    query: (sql, args) => pool.query(sql, args),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
export async function migrate(db) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(81732411)");
    await tx.query(
      await readFile(new URL("../migrations/001.sql", import.meta.url), "utf8"),
    );
  });
}

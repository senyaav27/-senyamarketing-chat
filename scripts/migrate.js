import { database, migrate } from "../src/db.js";
const db = database(process.env.DATABASE_URL);
try {
  await migrate(db);
  console.log("Migration complete");
} catch {
  console.error("migration_failed: check database configuration");
  process.exitCode = 1;
} finally {
  await db.close();
}

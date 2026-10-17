// Local demonstration only. Uses in-memory PostgreSQL; never ships in Docker.
import { createDB, cfg } from "./helpers.js";
import { createApp } from "../src/app.js";
import { startWorker } from "../src/worker.js";
const db = await createDB();
let id = 100;
const stop = startWorker(db, async () => ({ message_id: ++id }), 90);
const server = createApp(db, cfg).listen(3000, "0.0.0.0", () =>
  console.log(
    "Local test demo at http://localhost:3000 (mock Telegram, temporary data)",
  ),
);
process.on("SIGINT", () =>
  server.close(async () => {
    await stop();
    await db.close();
    process.exit(0);
  }),
);

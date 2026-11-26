// Applies pending Drizzle migrations only when explicitly invoked with `npm run migrate`.
// This is intentionally not part of build, start, preview, or deploy commands.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
} catch {
  // Avoid logging driver errors: they can include connection details.
  console.error("migration failed; check database connectivity and migration files");
  process.exitCode = 1;
} finally {
  await pool.end();
}

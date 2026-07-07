import { Client } from "pg";

const PG_HOST = "localhost";
const PG_PORT = 5432;
const PG_USER = "postgres";
const PG_PASS = "34267793";
const DB_NAME = "drp_payment";

const c = new Client({
  host: PG_HOST,
  port: PG_PORT,
  user: PG_USER,
  password: PG_PASS,
  database: "postgres",
});

try {
  await c.connect();
  const r = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
  if (r.rowCount === 0) {
    await c.query(`CREATE DATABASE ${DB_NAME}`);
    console.log(`Created database ${DB_NAME}`);
  } else {
    console.log(`Database ${DB_NAME} already exists`);
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
} finally {
  await c.end();
}

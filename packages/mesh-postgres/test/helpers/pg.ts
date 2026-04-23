import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TestPostgres {
  pool: Pool;
  stop(): Promise<void>;
}

/**
 * Start a disposable Postgres container for an integration test, apply the
 * init SQL, and hand back a pg Pool connected to it.
 *
 * The caller is responsible for calling stop() in an afterAll hook.
 */
export const startTestPostgres = async (): Promise<TestPostgres> => {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  )
    .withDatabase("mesh_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const pool = new Pool({
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  });

  const schemaPath = join(__dirname, "..", "..", "sql", "001-init.sql");
  const schema = readFileSync(schemaPath, "utf8");
  await pool.query(schema);

  return {
    pool,
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
};

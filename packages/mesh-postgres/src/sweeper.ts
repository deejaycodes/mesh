import type { Pool } from "pg";

export interface SweepStaleWorkflowsConfig {
  pool: Pool;
  /**
   * Workflows whose updated_at is older than `olderThanMs` and whose status
   * is still 'running' will be marked 'failed'. Default: 5 minutes. Tune
   * against the longest legitimate run you'd expect — anything past that
   * is almost certainly a crashed pod.
   */
  olderThanMs?: number;
  /**
   * Reason stored on the workflow's error column when it is swept.
   * Default: 'Swept after crash — no progress past olderThanMs.'
   */
  reason?: string;
  /**
   * Max workflows to sweep in one call. Default 100. Sweeper is intended
   * to run on a schedule; bounding per-call work prevents one sweep from
   * hogging a connection.
   */
  limit?: number;
}

export interface SweepStaleWorkflowsResult {
  swept: number;
}

/**
 * Sweeps workflows that have been stuck in 'running' past `olderThanMs`
 * and marks them 'failed' with a descriptive error.
 *
 * Intended to be called on a schedule (cron, setInterval, Temporal, etc.).
 * The caller decides how often — typically once a minute is fine; SQL
 * cost is small because the `workflows_status_updated_idx` index is used.
 *
 * Safe to run concurrently on multiple pods — the UPDATE is atomic and
 * picks the workflow row by its primary key. Two sweepers hitting the
 * same candidate just both produce no-op updates.
 */
export const sweepStaleWorkflows = async (
  config: SweepStaleWorkflowsConfig,
): Promise<SweepStaleWorkflowsResult> => {
  const olderThanMs = config.olderThanMs ?? 5 * 60 * 1000;
  const reason = config.reason ?? "Swept after crash — no progress past olderThanMs.";
  const limit = config.limit ?? 100;
  const cutoff = Date.now() - olderThanMs;

  const { rowCount } = await config.pool.query(
    `UPDATE workflows
     SET status = 'failed', error = $1, updated_at = $2
     WHERE id IN (
       SELECT id FROM workflows
       WHERE status = 'running' AND updated_at < $3
       ORDER BY updated_at ASC
       LIMIT $4
     )`,
    [reason, Date.now(), cutoff, limit],
  );

  return { swept: rowCount ?? 0 };
};

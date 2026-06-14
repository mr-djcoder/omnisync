export type PublishResult = { connection_id: string; status: 'success' | 'failed' };

export function summarizePublish(results: PublishResult[]): {
  total: number;
  succeeded: number;
  failed: number;
} {
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'success') succeeded++;
    else failed++;
  }
  return { total: results.length, succeeded, failed };
}

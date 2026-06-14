import { describe, it, expect } from 'vitest';
import { summarizePublish } from './publish';

describe('summarizePublish', () => {
  it('counts successes and failures', () => {
    const s = summarizePublish([
      { connection_id: 'a', status: 'success' },
      { connection_id: 'b', status: 'failed' },
      { connection_id: 'c', status: 'success' },
    ]);
    expect(s).toEqual({ total: 3, succeeded: 2, failed: 1 });
  });
  it('handles empty', () => {
    expect(summarizePublish([])).toEqual({ total: 0, succeeded: 0, failed: 0 });
  });
});

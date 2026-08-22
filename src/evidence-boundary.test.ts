import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the evidence service and scheduled route have no LLM or strategy imports', async () => {
  const [service, route] = await Promise.all([
    readFile(new URL('./evidence.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/run/route.ts', import.meta.url), 'utf8'),
  ]);
  const activePath = `${service}\n${route}`;
  for (const forbidden of ['./llm', './analyse', './ledger', './strategy', 'runPipeline']) {
    assert.equal(activePath.includes(forbidden), false, `active evidence path imported ${forbidden}`);
  }
});

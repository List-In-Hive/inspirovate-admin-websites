import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getSite, dataDir } from '../lib/config';
import { assertLocal } from '../lib/http';

test('hosted Flowers source uses a server checkout even with a legacy Mac override', () => {
  const previous = { hosted: process.env.ADMIN_HOSTED, repo: process.env.FLOWERS_REPO };
  try {
    process.env.FLOWERS_REPO = '/Users/admin/Desktop/IC/flowers';
    process.env.ADMIN_HOSTED = 'true';
    assert.equal(getSite().repoPath, path.join(dataDir, 'source-flowers'));
    assert.throws(() => assertLocal(new Request('http://127.0.0.1:3100/api/projects', { headers: { host: '127.0.0.1:3100' } })), /Hosted access/);
    delete process.env.ADMIN_HOSTED;
    assert.equal(getSite().repoPath, process.env.FLOWERS_REPO);
  } finally {
    if (previous.hosted === undefined) delete process.env.ADMIN_HOSTED; else process.env.ADMIN_HOSTED = previous.hosted;
    if (previous.repo === undefined) delete process.env.FLOWERS_REPO; else process.env.FLOWERS_REPO = previous.repo;
  }
});

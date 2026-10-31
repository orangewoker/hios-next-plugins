import test from 'node:test';
import assert from 'node:assert/strict';
import { BreezeEngine } from '../service/engine.mjs';

test('late health response cannot resurrect an engine stopped during startup', async () => {
  const engine = new BreezeEngine({}); let healthResponse;
  engine.health = () => new Promise(resolve => { healthResponse = resolve; });
  const starting = engine.start(); await engine.stop(); healthResponse(true); await starting;
  assert.equal(engine.state, 'stopped'); assert.equal(engine.child, null); assert.equal(engine.url, '');
});

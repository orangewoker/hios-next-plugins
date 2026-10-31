import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_FORM, buildRequest, normalizeUrl, applyInputs, jobOutputs, MAX_HOST_AUDIO_BYTES } from '../shared/core.js';
import { wavHeader, decodeReference } from '../service/audio.mjs';
test('connection URL supports LAN and reverse proxy paths but rejects credentials/non-HTTP', () => {
  assert.equal(normalizeUrl(' http://192.168.1.20:17860/ '), 'http://192.168.1.20:17860');
  assert.equal(normalizeUrl('https://voice.example.test/breeze/'), 'https://voice.example.test/breeze');
  for (const url of ['file:///etc/passwd', 'http://user:password@localhost', 'http://localhost/?key=x', '', 'javascript:alert(1)']) assert.throws(() => normalizeUrl(url));
});
test('design/clone/direction validate references and only send effective fields', () => {
  const d = buildRequest({ text: '你好', mode: 'design' }); assert.equal(d.cfg_scale, 1); assert.equal(d.mode, 'design'); assert.equal(d.voice_id, '');
  assert.throws(() => buildRequest({ text: '你好', mode: 'clone' }), /参考/);
  const clone = buildRequest({ text: 'hello', mode: 'clone', voice_id: 'narrator', instruction: 'ignored', speed: 2 });
  assert.equal(clone.instruction, ''); assert.equal(clone.speed, undefined);
  assert.throws(() => buildRequest({ text: 'hello', mode: 'direction', voice_id: 'v', instruction: '' }), /表达/);
  for (const patch of [{ cfg_scale: 0 }, { seed: 2.2 }, { top_p: 2 }, { split_chars: 0 }, { max_new_tokens: 99999 }, { text: '' }]) assert.throws(() => buildRequest({ text: 'test', ...patch }));
});
test('canvas connected inputs override local values without accepting arbitrary options', () => {
  const x = applyInputs(DEFAULT_FORM, { text: [{ kind: 'text', value: 'connected' }], instruction: '克制', reference_text: { text: '准确转录' }, settings: { value: { seed: 7, speed: 9, text: 'wrong' } } });
  assert.equal(x.text, 'connected'); assert.equal(x.seed, 7); assert.equal(x.speed, undefined); assert.equal(x.ref_text, '准确转录');
  const out = jobOutputs({ id: 'x', text: x.text, info: { duration: 1 } }, 'data:audio/wav;base64,AA=='); assert.deepEqual(out.map(x => x.kind), ['audio', 'text', 'json', 'number']);
});
test('WAV header records real PCM size and rejects odd/truncated bytes', () => {
  const b = wavHeader(48000); assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.readUInt32LE(4), 48036); assert.equal(b.readUInt32LE(40), 48000); assert.equal(b.readUInt32LE(24), 24000);
  assert.throws(() => wavHeader(3)); assert.throws(() => wavHeader(0));
  const source = 'data:audio/wav;base64,' + Buffer.concat([b, Buffer.alloc(48000)]).toString('base64'); assert.equal(decodeReference(source).length, 48044);
  assert.throws(() => decodeReference('data:audio/mp3;base64,AAAA')); assert.throws(() => decodeReference('data:audio/wav;base64,AAAA'));
  const invalid = Buffer.from(b); invalid.writeUInt32LE(0xffffffff, 40);
  assert.throws(() => decodeReference('data:audio/wav;base64,' + invalid.toString('base64')), /有效 WAV/);
  const fake = Buffer.alloc(44); fake.write('RIFF'); fake.writeUInt32LE(36, 4); fake.write('WAVE', 8);
  assert.throws(() => decodeReference('data:audio/wav;base64,' + fake.toString('base64')), /有效 WAV/);
});

test('HIOS WAV cap accounts for base64 expansion inside the encoded source limit', () => {
  assert.ok(Math.ceil(MAX_HOST_AUDIO_BYTES / 3) * 4 + 'data:audio/wav;base64,'.length < 64 * 1024 * 1024);
});
test('manifest has real entries, app workflow and exactly four correctly typed outputs', async () => {
  const root = new URL('../', import.meta.url), manifest = JSON.parse(await readFile(new URL('plugin.json', root)));
  assert.equal(manifest.id, 'breeze-tts'); assert.equal(manifest.nodes[0].outputs.length, 4);
  for (const entry of [manifest.nodes[0].rendererEntry, manifest.contributes.apps[0].entry]) {
    const s = await readFile(new URL(entry, root), 'utf8'); assert.match(s, /hios-ui:start/);
  }
  assert.equal(manifest.mainEntry, undefined); assert.equal(manifest.install, undefined);
});

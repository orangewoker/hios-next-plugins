import { httpError } from './storage.mjs';
export function wavHeader(bytes, sampleRate = 24000) {
  if (!Number.isInteger(bytes) || bytes < 2 || bytes % 2 || bytes > 0xffffffff - 36 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw httpError('音频数据长度或采样率无效');
  const b = Buffer.alloc(44); b.write('RIFF'); b.writeUInt32LE(bytes + 36, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40); return b;
}
export function decodeReference(value) {
  if (typeof value !== 'string' || value.length > 24 * 1024 * 1024 || !/^data:audio\/(?:wav|wave|x-wav);base64,[a-zA-Z0-9+/=]+$/.test(value)) throw httpError('参考音频仅支持不超过 16 MiB 的 WAV');
  const b = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
  const invalid = () => { throw httpError('参考文件不是有效 WAV，请使用 PCM 或浮点 WAV'); };
  if (b.length < 44 || b.length > 16 * 1024 * 1024 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') invalid();
  const end = b.readUInt32LE(4) + 8; if (end > b.length || end < 44) invalid();
  let format, dataBytes = 0;
  for (let offset = 12; offset < end;) {
    if (offset + 8 > end) invalid();
    const kind = b.toString('ascii', offset, offset + 4), size = b.readUInt32LE(offset + 4), start = offset + 8;
    if (size > end - start) invalid();
    if (kind === 'fmt ') {
      if (size < 16) invalid();
      let codec = b.readUInt16LE(start);
      if (codec === 0xfffe) {
        if (size < 40 || b.readUInt16LE(start + 16) < 22 || b.toString('hex', start + 26, start + 40) !== '000000001000800000aa00389b71') invalid();
        codec = b.readUInt16LE(start + 24);
      }
      const channels = b.readUInt16LE(start + 2), rate = b.readUInt32LE(start + 4), align = b.readUInt16LE(start + 12), bits = b.readUInt16LE(start + 14);
      if (![1, 3].includes(codec) || channels < 1 || channels > 32 || rate < 8000 || rate > 384000 || !(codec === 1 ? [8, 16, 24, 32] : [32, 64]).includes(bits) || align !== channels * bits / 8 || b.readUInt32LE(start + 8) !== rate * align) invalid();
      format = { align };
    }
    if (kind === 'data') dataBytes += size;
    offset = start + size + (size % 2);
    if (offset > end) invalid();
  }
  if (!format || !dataBytes || dataBytes % format.align) invalid();
  return b;
}

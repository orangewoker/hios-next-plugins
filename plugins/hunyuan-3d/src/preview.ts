import { unzipSync } from 'fflate';

const TYPES = ['glb', 'gltf', 'obj', 'fbx', 'stl'] as const;
export type PreviewSource = { url: string; type: string; resources?: Record<string, string>; materialText?: string; release: () => void };

function extension(name: string) { return name.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase() || ''; }

export async function preparePreview(blob: Blob, fileUrl: string, declaredType: string): Promise<PreviewSource> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const zipped = extension(fileUrl) === 'zip' || blob.type.includes('zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  if (!zipped) {
    const type = declaredType.toLowerCase() || extension(fileUrl);
    if (!TYPES.includes(type as typeof TYPES[number])) throw new Error(`暂不支持预览 ${type.toUpperCase() || '此'} 格式`);
    const url = URL.createObjectURL(blob);
    return { url, type: type.toUpperCase(), release: () => URL.revokeObjectURL(url) };
  }

  const entries = unzipSync(bytes);
  const names = Object.keys(entries).filter((name) => !name.endsWith('/') && !name.startsWith('__MACOSX/'));
  const modelName = TYPES.flatMap((kind) => names.filter((name) => extension(name) === kind)).at(0);
  if (!modelName) throw new Error('ZIP 中未找到 GLB、GLTF、OBJ、FBX 或 STL 模型');
  const urls = new Map<string, string>();
  for (const name of names) {
    const bytes = entries[name];
    const type = extension(name) === 'png' ? 'image/png' : ['jpg', 'jpeg'].includes(extension(name)) ? 'image/jpeg' : 'application/octet-stream';
    urls.set(name.replaceAll('\\', '/'), URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type })));
  }
  const url = urls.get(modelName.replaceAll('\\', '/'))!;
  const resources = Object.fromEntries(urls);
  const materialName = names.find((name) => extension(name) === 'mtl');
  const materialText = materialName ? new TextDecoder().decode(entries[materialName]) : undefined;
  return { url, type: extension(modelName).toUpperCase(), resources, materialText, release: () => urls.forEach((value) => URL.revokeObjectURL(value)) };
}

// Portrait filtering is reused verbatim; costume filtering and pose grouping
// are adapted from the upstream galleries. See ../licenses and THIRD_PARTY_NOTICES.
import './vendor/portrait-core.mjs';
export const KINDS = ['portrait', 'costume', 'pose'];
export const LABELS = { portrait: '人物', costume: '服装', pose: '姿势' };
export const ANGLES = ['正面', '俯视', '仰视', '侧面', '斜侧'];
export const INDEX = { portrait: 'portrait-zh.json', costume: 'costume-zh.json', pose: 'pose-zh.json' };
export const defaults = kind => ({ q: '', category: '', hair: '', style: '', section: kind === 'portrait' ? 'face' : '', system: '', angle: '', view: 'group', singleOnly: true, favorites: false, recent: false });

export function assetPath(value) {
  if (typeof value !== 'string' || !/^(?:img|png|thumbs)\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp)$/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) throw Error('图库包含无效素材路径');
  return value;
}

export function normalizeCatalog(kind, rows) {
  if (!KINDS.includes(kind) || !Array.isArray(rows) || !rows.length || rows.length > 50000) throw Error('图库索引格式错误或为空');
  const ids = new Set();
  return rows.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(row.id) || ['__proto__','constructor','prototype'].includes(row.id) || ids.has(row.id)) throw Error('图库包含无效或重复 ID');
    ids.add(row.id);
    if (kind === 'portrait' && !['face', 'styling'].includes(row.section)) throw Error('未知人物参考类型');
    const full = assetPath(kind === 'portrait' ? row.full : row.原图);
    const thumb = assetPath(kind === 'portrait' ? row.thumb : row.缩略图);
    if (!full.endsWith('.png')) throw Error('原图必须是 PNG');
    return { ...row, kind, full, thumb,
      preview: kind === 'costume' ? assetPath(row.预览图 || full) : full,
      title: String(kind === 'portrait' ? row.title || row.section_zh : kind === 'costume' ? `${row.id} · ${row.分类}` : row.姿势名称 || row.id),
      category: String(row.分类 || row.section_zh || ''), system: String(row.体系 || ''), number: String(row.姿势编号 || row.id), angle: String(row.角度 || ''),
      search: String(row.search || row.检索 || '').toLowerCase() + ' ' + row.id.toLowerCase(),
      tags: kind === 'costume' ? (Array.isArray(row.关键词) ? row.关键词.map(String) : []) : [],
    };
  });
}

export const groupKey = item => `${item.system}|${item.number}`;
export function groupPoses(rows) {
  const map = new Map();
  for (const item of rows) { const key = groupKey(item); if (!map.has(key)) map.set(key, []); map.get(key).push(item); }
  return map;
}

export function filterCatalog(kind, rows, state, favorites = new Set(), recent = []) {
  const words = String(state.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  let result = kind === 'portrait' ? globalThis.PortraitCore.filterRecords(rows, state, favorites) : rows.filter(item =>
    (!state.category || item.category === state.category) && words.every(word => item.search.includes(word)) &&
    (!state.favorites || favorites.has(item.id)) && (kind !== 'pose' ||
      ((!state.system || item.system === state.system) && (!state.angle || item.angle === state.angle) && (!state.singleOnly || !item.system.includes('双人')))));
  if (state.recent) result = result.filter(item => recent.includes(item.id)).sort((a,b) => recent.indexOf(a.id) - recent.indexOf(b.id));
  if (kind === 'pose' && state.view !== 'single') {
    const groups = groupPoses(rows), seen = new Set();
    return result.flatMap(item => { const key = groupKey(item); if (seen.has(key)) return []; seen.add(key);
      const matching = result.filter(candidate => groupKey(candidate) === key);
      const selected = matching.find(candidate => candidate.angle === (state.angle || '正面')) || matching[0];
      return [{ ...selected, angles: groups.get(key) }];
    });
  }
  return result;
}

export function outputKinds(state) { return KINDS.filter(kind => state.enabled?.[kind] !== false && state.selections?.[kind]); }
export function canonicalUrl(source) { return String(source).replace(/^https?:\/\/(hios-(?:asset|static-site))\.localhost\//i, '$1://'); }
export function renderUrl(source, locationUrl = globalThis.location?.href || '') {
  return /^http:\/\/hios-plugin\.localhost\//i.test(locationUrl) ? String(source).replace(/^(hios-(?:asset|static-site)):\/\//, 'http://$1.localhost/') : source;
}

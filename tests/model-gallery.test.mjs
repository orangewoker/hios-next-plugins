import test from 'node:test';
import assert from 'node:assert/strict';
import { displayId, imageName, normalizeCatalog, filterCatalog, defaults, groupPoses, outputKinds, renderUrl, canonicalUrl } from '../plugins/model-gallery/runtime/gallery-core.mjs';

const portrait = (id, section = 'face') => ({ id, section, hair: 'ショート', style: '', full: `img/full/${id}.png`, thumb: `img/thumb/${id}.webp`, search: `${id} 短发 short`, title: id });
const pose = (id, system, angle) => ({ id, 体系: system, 姿势编号: 'P001', 姿势名称: '站姿', 分类: '站姿', 角度: angle, 缩略图: `thumbs/${id}.jpg`, 原图: `img/${id}.png`, 检索: `${id} 站姿 ${angle}` });
test('portrait reuses upstream section, hair and AND search filtering', () => {
  const rows = normalizeCatalog('portrait', [portrait('a'), portrait('b','styling')]);
  assert.deepEqual(filterCatalog('portrait', rows, { ...defaults('portrait'), q:'短发 short' }).map(r=>r.id), ['a']);
  assert.equal(filterCatalog('portrait', rows, { ...defaults('portrait'), q:'短发 missing' }).length, 0);
});
test('costume maps preview separately from the original and uses all keywords', () => {
  const rows = normalizeCatalog('costume', [{ id:'SPR-0001', 分类:'春装', 关键词:['白色'], 原图:'png/SPR-0001.png', 预览图:'img/SPR-0001.webp', 缩略图:'thumbs/SPR-0001.webp', 检索:'白色 white coat' }]);
  assert.equal(filterCatalog('costume', rows, {q:'WHITE 白色', category:'春装'}).length, 1);
  assert.notEqual(rows[0].full,rows[0].preview);
});
test('pose groups do not collide across systems and retain exact angles', () => {
  const rows = normalizeCatalog('pose',[pose('a','标准','正面'),pose('b','标准','侧面'),pose('c','性感','正面'),pose('d','双人缠绵','正面')]);
  assert.equal(groupPoses(rows).size,3);
  assert.equal(filterCatalog('pose',rows,defaults('pose')).length,2);
  const side = filterCatalog('pose',rows,{...defaults('pose'),angle:'侧面'});
  assert.equal(side.length,1);assert.equal(side[0].id,'b');assert.equal(side[0].angles.length,2);
  assert.equal(filterCatalog('pose',rows,{...defaults('pose'),view:'single',singleOnly:false}).length,4);
});
test('favorites/recent keep IDs and output selection is independent', () => {
  const rows=normalizeCatalog('portrait',[portrait('a'),portrait('b')]);
  assert.equal(filterCatalog('portrait',rows,{...defaults('portrait'),favorites:true},new Set(['b']))[0].id,'b');
  assert.deepEqual(filterCatalog('portrait',rows,{...defaults('portrait'),recent:true},new Set(),['b','a']).map(r=>r.id),['b','a']);
  assert.deepEqual(outputKinds({selections:{portrait:{},costume:{},pose:{}},enabled:{portrait:false,pose:false}}),['costume']);
  assert.deepEqual(outputKinds({selections:{}}),[]);
});
test('malformed IDs and traversal paths are rejected', () => {
  assert.throws(()=>normalizeCatalog('portrait',[portrait('a'),portrait('a')]));
  assert.throws(()=>normalizeCatalog('portrait',[{...portrait('a'),full:'img/../../secret.png'}]));
  assert.throws(()=>normalizeCatalog('portrait',[{...portrait('a'),thumb:'https://site/a.png'}]));
  assert.throws(()=>normalizeCatalog('portrait',[portrait('__proto__')]));
});
test('resource URLs preserve Tauri token prefix and canonical persistence', () => {
  const canonical='hios-static-site://token/';
  assert.equal(renderUrl(canonical,'http://hios-plugin.localhost/model-gallery/runtime/index.html'),'http://hios-static-site.localhost/token/');
  assert.equal(canonicalUrl('http://hios-asset.localhost/local/a.png'),'hios-asset://local/a.png');
});

test('pose display and filenames omit prefixes without changing source identity', () => {
  for (const prefix of ['full_sexy', 'upper80v2', 'couple']) {
    for (const [view, angle] of [['front','正面'], ['side','侧面'], ['diag','斜侧'], ['high','俯视'], ['low','仰视']]) {
      const id = `${prefix}_P008_${view}`;
      const [row] = normalizeCatalog('pose', [pose(id, prefix, angle)]);
      assert.equal(displayId('pose', row), `P008_${view}`);
      assert.equal(imageName('pose', row), `P008_${view}.${angle}.png`);
      assert.equal(imageName('pose', row, true, 'jpg'), `P008_${view}.${angle}-thumb.jpg`);
      assert.equal(row.id, id);
      assert.equal(row.full, `img/${id}.png`);
      // Previously saved selections contain only id and angle, not number.
      assert.equal(displayId('pose', {id, angle}), `P008_${view}`);
    }
  }
  assert.equal(imageName('portrait', {id:'abc'}), '人物-abc.png');
  assert.equal(imageName('costume', {id:'SPR-0001'}), '服装-SPR-0001.png');
  assert.equal(imageName('pose', {id:'unknown_prefix', angle:'正面'}), 'pose_front.正面.png');
});

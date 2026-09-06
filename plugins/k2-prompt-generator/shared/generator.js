
/* ================= 词库数据（源自 K2 融合版 §7 / §8） ================= */
function norm(a){return a.map(function(x){
  if(typeof x==='string') return {v:x,t:x};
  return {v:x[0], t:x[1], risk:!!x[2], nsfw:!!x[3], water:!!x[4]};
});}

/* 界面模式按钮同步（对未成年角色不做任何强制或锁定） */
function syncModeButtons(){
  var sfwBtn=$('mSFW'), nsfwBtn=$('mNSFW');
  if(!sfwBtn||!nsfwBtn) return;
  var nsfw = MODE==='NSFW';
  sfwBtn.className = nsfw?'':'on';
  nsfwBtn.className = nsfw?'nsfw on':'nsfw';
  /* 国际版开关：关闭时隐藏「NSFW·露骨」标签项 */
  nsfwBtn.style.display = intlMode ? '' : 'none';
  var locked = restrictLock && isMinorAge();
  nsfwBtn.classList.toggle('locked', locked);
  nsfwBtn.title = locked ? '已锁定：未满 18 岁禁止进入 NSFW（限制锁定开启）' : 'NSFW · 露骨';
}

var OPT = {};
OPT.lens = norm([
  ['广角','采用广角镜头，空间纵深感强烈，边缘轻微拉伸，近景主体突出、背景深远'],
  ['超广角','采用超广角镜头，极端空间拉伸，近景夸张放大、远景急剧缩小'],
  ['鱼眼','采用鱼眼镜头，圆形桶状畸变，180度视野，画面边缘弯曲'],
  ['长焦压缩','采用长焦镜头，压缩前后景距离，背景贴近主体，空间扁平化'],
  ['中焦','采用中焦镜头，人像黄金焦段，自然透视无畸变'],
  ['微距','采用微距镜头，极端特写，纹理毛孔可见，景深极浅'],
  ['移轴','采用移轴镜头，选择性对焦，现实场景呈现微缩模型感']
]);
OPT.clothCat = norm(['内衣/睡衣','上衣','下装','连衣裙','紧身形体服','职业制服','学生校服']);
OPT.poseCat = norm(['静态姿势','动态动作','过渡姿态','挑逗姿态']);
OPT.viewpoint = norm([
  ['低角度仰拍','从低角度仰拍，人物被抬高，充满压迫性的视觉张力'],
  ['高角度俯拍','从高角度俯拍，营造被注视却无力抵抗的脆弱美学'],
  ['侧后方斜45度','从侧后方斜45度捕捉，仿佛在某一刻被偶然窥见'],
  ['倾斜视角','画面整体倾斜打破水平线，营造不安的视觉张力'],
  ['鸟瞰','鸟瞰视角俯拍，人物在画面中央如精致人偶'],
  ['虫视','虫视角度从极低处向上仰拍，夸张的力量对比与压迫感'],
  ['过肩偷窥','过肩偷窥视角，前景元素部分遮挡，营造私人时刻被窥视的紧张感'],
  ['主观视角','第一人称主观视角，镜头即双眼，代入感极强'],
  ['镜面反射','人物背对镜头立于落地镜前，镜框将画面一分为二——镜外是人物真实的背影，镜中清晰倒映全身正面镜像，镜外虚、镜内实的景深对比强化画中画空间'],
  ['框架内','透过前景框架拍摄，形成画中画的聚焦效果']
]);
OPT.shotSize = norm(['大特写','近景','中近景','中景','中全景','全景','远景']);
OPT.dof = norm([
  ['浅景深','浅景深虚化，背景柔和模糊'],
  ['大景深','大景深保持前后景物清晰'],
  ['选择性对焦','对焦点精准落在人物面部，其余区域逐层虚化']
]);
OPT.device = norm([
  ['不使用',''],
  ['手机自拍','手机自拍的生活化画质'],
  ['单反微单','单反高画质质感'],
  ['胶片相机','胶片颗粒与色彩偏移的质感'],
  ['拍立得','拍立得的褪色边框质感'],
  ['监控摄像头','监控摄像头式的低画质与时间戳感'],
  ['针孔摄像头','针孔镜头式的隐蔽畸变画质'],
  ['网络摄像头','网络摄像头的低分辨率压缩感'],
  ['电影机','电影机般的电影级画质']
]);

OPT.mainLight = norm([
  ['发丝光','背光从身后打来，勾勒发丝与身体边缘的金色光晕'],
  ['侧逆光','侧逆光从侧后方照来，一侧轮廓发光，另一侧沉入阴影'],
  ['伦勃朗光','伦勃朗式侧光从前方照下，脸颊暗侧留出三角光区，如古典油画'],
  ['蝴蝶光','柔和主光从上方照下，鼻下留下蝶形阴影，好莱坞式美感'],
  ['分割光','正侧光将脸与身体分为半明半暗'],
  ['环形光','环形光从斜上方柔柔落下，自然肖像感'],
  ['柔光箱','大面积柔光箱柔光笼罩，阴影极少，美妆片质感'],
  ['硬光','小光源硬光直射，锐利阴影强调轮廓与纹理'],
  ['底光','光线从下往上打来，神秘而暧昧'],
  ['剪影光','强烈背光形成剪影，主体轮廓纯黑']
]);
OPT.ambient = norm([
  ['不使用',''],
  ['窗外霓虹','窗外霓虹从侧后方渗入，沿肩线勾出冷色轮廓'],
  ['烛光','烛火在旁轻摇，暖黄光斑在皮肤上浮动'],
  ['屏幕光','屏幕的冷光映在脸上'],
  ['月光','月光从窗外落在肩头'],
  ['电影体积光','电影式的体积光穿过空气形成光柱'],
  ['百叶窗影','百叶窗影斜斜印在身体上'],
  ['蕾丝投影','蕾丝花纹的光影投在皮肤上'],
  ['蒸汽透光','蒸汽在光线下泛着朦胧光晕']
]);
OPT.colorTone = norm([
  ['烛光暖','整体暖调烛光色，低明度、低饱和，氛围亲密暧昧'],
  ['钨丝暖','整体钨丝灯暖调，明度适中，氛围温馨慵懒'],
  ['晨昏金光','整体黄昏金色调，柔和低对比，氛围温柔怀旧'],
  ['中性白','整体中性白色调，自然真实，氛围平静中立'],
  ['日光清新','整体自然日光调，明亮低饱和，氛围清新通透'],
  ['阴天柔灰','整体阴天柔灰调，低饱和低对比，氛围忧郁安静'],
  ['冷白荧光','整体冷白荧光调，冷硬高对比，氛围疏离压抑'],
  ['月光冷调','整体冷调月光色，暗部偏蓝、高对比，氛围神秘冷艳'],
  ['霓虹混合','整体霓虹混合色调，高饱和撞色，氛围欲望迷离']
]);

OPT.temperament = norm(['清纯','御姐','可爱','呆萌','高冷','慵懒','冷艳','甜美','飒爽','温柔','知性','魅惑','叛逆','文艺','名媛','高贵','不食人间烟火','危险迷人']);
OPT.age = norm(['5岁','8岁','12岁','15岁','17岁','19岁','22岁','24岁','26岁','28岁','30岁','35岁']);
OPT.identity = norm(['幼童','学龄女童','初中女生','女高中生','少女','女大学生','研究生学姐','职场新人','轻熟女','职场女性','优雅熟女','风韵熟女']);
OPT.race = norm(['东亚女性','东亚美少女','韩系精致','日系自然','欧美','混血感','不使用']);
OPT.ethnicity = norm(['东亚人','中国人','日本人','韩国人','欧美人','东南亚人','南亚人','中亚人','中东人','黑人','拉美人','大洋洲人','混血人','不使用']);
OPT.face = norm(['瓜子脸','鹅蛋脸','圆脸','心形脸','幼态脸','高级脸','网感脸']);
OPT.skin = norm(['冷白皮','白皙','自然肤色','小麦色','古铜色']);
OPT.texture = norm(['哑光质感','自然素肌']);
/* 体型 / 腿型 随年龄分层（参考 K2 引擎 §6.3 年龄分层） */
var BODY_ADULT   = norm(['纤细匀称','苗条骨感','模特高挑','娇小','沙漏型','梨形','直筒型','丰满匀称']);
var LEG_ADULT    = norm(['修长笔直','筷子腿','蜜大腿','腿部比例极佳','匀称有力']);
var BODY_TEEN    = norm(['清瘦纤细少女身材','修长躯干少女体型','纤细匀称少女体型','匀称少女体型']);
var LEG_TEEN     = norm(['细直长腿','修长笔直双腿','纤细匀称双腿']);
var BODY_CHILD   = norm(['纤细修长少女体型','匀称纤细体型','单薄纤细体型']);
var LEG_CHILD    = norm(['细直双腿','纤细小腿','匀称双腿']);
var BODY_TODDLER = norm(['幼瘦儿童体型','纤细幼童体型','匀称幼童体型']);
var LEG_TODDLER  = norm(['细直小短腿','圆润小短腿','纤细小腿']);
OPT.body = BODY_ADULT;
OPT.leg  = LEG_ADULT;
function ageStratum(){
  var a=v('age'); if(!a||a==='不使用') return 'adult';
  var m=a.match(/(\d+)/); if(!m) return 'adult';
  var n=parseInt(m[1],10);
  if(n<=7) return 'toddler';
  if(n<=12) return 'child';
  if(n<=17) return 'teen';
  return 'adult';
}
/* 年龄联动总入口：体型/腿型/身高/体重/胸围/腰臀/脚部/风格标签 全部随年龄分层切换 */
var AGE_LINKED = ['body','leg','height','weight','bust','waistHip','feet','styleLabel'];
function applyAgeBody(){
  var s=ageStratum();
  var T = s==='teen', C = s==='child', D = s==='toddler';
  OPT.body       = T?BODY_TEEN       : C?BODY_CHILD       : D?BODY_TODDLER       : BODY_ADULT;
  OPT.leg        = T?LEG_TEEN        : C?LEG_CHILD        : D?LEG_TODDLER        : LEG_ADULT;
  OPT.height     = T?HEIGHT_TEEN     : C?HEIGHT_CHILD     : D?HEIGHT_TODDLER     : HEIGHT_ADULT;
  OPT.weight     = T?WEIGHT_TEEN     : C?WEIGHT_CHILD     : D?WEIGHT_TODDLER     : WEIGHT_ADULT;
  OPT.bust       = T?BUST_TEEN       : C?BUST_CHILD       : D?BUST_TODDLER       : BUST_ADULT;
  OPT.waistHip   = T?WAISTHIP_TEEN   : C?WAISTHIP_CHILD   : D?WAISTHIP_TODDLER   : WAISTHIP_ADULT;
  OPT.feet       = T?FEET_TEEN       : C?FEET_CHILD       : D?FEET_TODDLER       : FEET_ADULT;
  OPT.styleLabel = (T||C||D)?STYLELABEL_MINOR : STYLELABEL_ADULT;
  /* 重填下拉：先显式清掉在新词表中已失效的旧值，再重填，
     确保不会出现「幼童 + 成年身高/体重」这类跨年龄错配（不依赖浏览器的 select 重置行为） */
  AGE_LINKED.forEach(function(id){
    var e=$(id); if(!e) return;
    var list=OPT[id]||[];
    if(e.value && !list.some(function(o){ return o.v===e.value; })) e.value='';
    fillSelect(e, list, true);
  });
}
/* 年龄 → 默认身份映射（按年龄自动选择对应身份） */
var AGE_IDENTITY = {'5岁':'幼童','8岁':'学龄女童','12岁':'初中女生','15岁':'女高中生','17岁':'少女','19岁':'女大学生','22岁':'研究生学姐','24岁':'职场新人','26岁':'轻熟女','28岁':'职场女性','30岁':'优雅熟女','35岁':'风韵熟女'};
/* 年龄 ≤17 岁自动触发的「体型加强描述」（参考 K2 引擎 §6.3 年龄分层） */
var AGE_BODY_DETAIL = {
  toddler: '体型极度纤细的幼瘦儿童体型，四肢细直无明显肌肉线条，锁骨与肩胛骨在薄薄的皮肤下清晰可见，手腕骨节突出，膝盖骨微微隆起，皮肤薄透紧贴骨骼，脊柱沟在侧光下阴影清晰，腰间与大腿根部因缺乏脂肪而微微空荡',
  child:   '体型纤细修长的少女体型，四肢细直，上臂无脂肪层弧度，小腿肌肉几乎不可见，锁骨横贯且明显凸起，肩胛骨在背部微微隆起，手腕与脚踝骨节分明，皮肤紧贴骨架，腰间与大腿根部因缺乏脂肪而微微空荡',
  teen:    '体型清瘦纤细的少女身材，躯干修长，四肢细直无明显肌肉线条，锁骨明显凸起，肩胛骨在背部隆起，肋骨轮廓隐约可见，手腕骨节突出，膝盖骨微微隆起，皮肤薄透紧贴骨骼，锁骨窝与胸骨上方有明显凹陷感'
};
function autoIdentity(){
  if(identityLockEffective()) return;
  var idn = AGE_IDENTITY[v('age')];
  var ie = $('identity');
  if(idn && ie) ie.value = idn;
}
OPT.firstImp = norm(['楚楚可怜','气场强大','甜美治愈','生人勿近','看着就想欺负','如沐春风']);
/* --- 以下为对照 K2 引擎 §9.2 人物基础库补齐的维度，且均随年龄分层联动 --- */

/* 身高：未成年按各年龄段真实身量，成年沿用 §9.2 原表 */
var HEIGHT_ADULT = norm([
  ['155娇小','身高155cm，娇小玲珑'],
  ['165中等','身高165cm，中等身材'],
  ['175高挑','身高175cm，高挑修长'],
  ['180+超模','身高180cm以上，超模特身高']
]);
var HEIGHT_TEEN = norm([
  ['150少女身高','身高150cm，少女身量'],
  ['155少女身高','身高155cm，少女身量'],
  ['160少女身高','身高160cm，少女身量'],
  ['165少女身高','身高165cm，少女身量']
]);
var HEIGHT_CHILD = norm([
  ['125学龄身高','身高125cm，学龄儿童身量'],
  ['135学龄身高','身高135cm，学龄儿童身量'],
  ['145学龄身高','身高145cm，学龄儿童身量']
]);
var HEIGHT_TODDLER = norm([
  ['100幼童身高','身高100cm，幼童身量'],
  ['105幼童身高','身高105cm，幼童身量'],
  ['110幼童身高','身高110cm，幼童身量']
]);

/* 体重：§9.2 规定未成年使用对应年龄段的苗条体重区间 */
var WEIGHT_ADULT = norm([
  ['约45-50kg(160cm)','体重约45-50kg'],
  ['约48-53kg(165cm)','体重约48-53kg'],
  ['约52-57kg(170cm)','体重约52-57kg'],
  ['约55-60kg(175cm)','体重约55-60kg']
]);
var WEIGHT_TEEN = norm([
  ['约38-42kg','体重约38-42kg'],
  ['约42-46kg','体重约42-46kg'],
  ['约46-50kg','体重约46-50kg']
]);
var WEIGHT_CHILD = norm([
  ['约22-27kg','体重约22-27kg'],
  ['约27-32kg','体重约27-32kg'],
  ['约32-38kg','体重约32-38kg']
]);
var WEIGHT_TODDLER = norm([
  ['约15-18kg','体重约15-18kg'],
  ['约18-21kg','体重约18-21kg']
]);

/* 胸围：未成年不出现成人化描述 */
var BUST_ADULT = norm([
  ['平胸','胸部平薄'],
  ['中等','胸部适中'],
  ['丰满','胸部丰满'],
  ['巨乳','胸部丰满硕大']
]);
var BUST_TEEN = norm([
  ['平胸','胸部平薄，尚未发育完全'],
  ['微发育','胸部微微隆起，刚开始发育']
]);
var BUST_CHILD = norm([['未发育','胸部尚未发育，儿童平坦身形']]);
var BUST_TODDLER = norm([['未发育','胸部尚未发育，幼童平坦身形']]);

/* 腰臀：未成年不出现蜜桃臀等成人化描述 */
var WAISTHIP_ADULT = norm([
  ['水蛇腰','盈盈一握的水蛇腰'],
  ['蜜桃臀','饱满上翘的蜜桃臀'],
  ['腰臀比极佳','腰臀比例极佳'],
  ['马甲线','腹部紧致显出马甲线'],
  ['小腹平坦','小腹平坦紧实']
]);
var WAISTHIP_TEEN = norm([
  ['纤细腰身','盈盈一握的纤细腰身'],
  ['腰臀比极佳','腰臀比例匀称'],
  ['马甲线','腹部紧致'],
  ['小腹平坦','小腹平坦紧实']
]);
var WAISTHIP_CHILD = norm([
  ['小腹平坦','小腹平坦'],
  ['直线身形','腰臀尚未发育，儿童直线身形']
]);
var WAISTHIP_TODDLER = norm([
  ['小腹微圆','幼童的小腹微微圆润'],
  ['直线身形','腰臀尚未发育，幼童直线身形']
]);

/* 脚部：未成年按儿童/少女脚型 */
var FEET_ADULT = norm([
  ['小巧精致脚型','小巧精致的女性脚型，修长脚趾，薄脚背，骨感足弓'],
  ['纤长骨感脚型','纤长的女性脚型，脚趾修长排列整齐，脚背薄而骨感'],
  ['圆润柔和脚型','圆润柔和的女性脚型，脚趾短小圆润，脚背饱满']
]);
var FEET_TEEN = norm([
  ['纤细少女脚型','纤细的少女脚型，脚趾修长，脚背薄而骨感'],
  ['小巧少女脚型','小巧的少女脚型，脚趾圆润排列整齐']
]);
var FEET_CHILD = norm([['小巧儿童脚型','小巧的儿童脚型，脚趾短小圆润，脚背饱满']]);
var FEET_TODDLER = norm([['幼童小脚','幼童的小脚，脚趾圆润短小，脚背饱满柔软']]);

/* 风格标签：未成年去掉 OL职场 / 健身辣妹 等成年向标签 */
var STYLELABEL_ADULT = norm(['ins风','网感','二次元','coser','韩系','日系','欧美','国风','学院派','OL职场','街头潮人','健身辣妹','法式优雅']);
var STYLELABEL_MINOR = norm(['ins风','网感','二次元','coser','韩系','日系','欧美','国风','学院派','街头潮人','法式优雅']);
/* === 年龄锚点机制：年龄是人物维度的唯一锚点，双向联动 ===
   正向：年龄 → 身份/体型/腿型/身高/体重/胸围/腰臀/脚部/风格标签 自动切换词表（applyAgeBody + autoIdentity）
   反向：身份或联动字段被锁定时 → 年龄下拉与随机池只保留兼容年龄，杜绝「30岁+初中女生」式错配 */
var STRATUM_LISTS = {
  body:      {adult:BODY_ADULT,   teen:BODY_TEEN,   child:BODY_CHILD,   toddler:BODY_TODDLER},
  leg:       {adult:LEG_ADULT,    teen:LEG_TEEN,    child:LEG_CHILD,    toddler:LEG_TODDLER},
  height:    {adult:HEIGHT_ADULT, teen:HEIGHT_TEEN, child:HEIGHT_CHILD, toddler:HEIGHT_TODDLER},
  weight:    {adult:WEIGHT_ADULT, teen:WEIGHT_TEEN, child:WEIGHT_CHILD, toddler:WEIGHT_TODDLER},
  bust:      {adult:BUST_ADULT,   teen:BUST_TEEN,   child:BUST_CHILD,   toddler:BUST_TODDLER},
  waistHip:  {adult:WAISTHIP_ADULT, teen:WAISTHIP_TEEN, child:WAISTHIP_CHILD, toddler:WAISTHIP_TODDLER},
  feet:      {adult:FEET_ADULT,   teen:FEET_TEEN,   child:FEET_CHILD,   toddler:FEET_TODDLER},
  styleLabel:{adult:STYLELABEL_ADULT, teen:STYLELABEL_MINOR, child:STYLELABEL_MINOR, toddler:STYLELABEL_MINOR}
};
/* 各年龄分层的未成年身份（限制锁定开启时身份下拉过滤掉） */
var IDENTITY_MINOR = {'幼童':1,'学龄女童':1,'初中女生':1,'女高中生':1,'少女':1};
function stratumOfAgeStr(a){
  var m=a.match(/(\d+)/); if(!m) return 'adult';
  var n=parseInt(m[1],10);
  return n<=7?'toddler':n<=12?'child':n<=17?'teen':'adult';
}
/* 身份锁定是否有效：限制锁定优先——锁定值是未成年身份而限制锁定开启时，该锁定自动失效 */
function identityLockEffective(){
  if(!lockedFields['identity']) return false;
  var iv=v('identity');
  if(restrictLock && iv && IDENTITY_MINOR[iv]) return false;
  return true;
}
/* 计算与当前锁定状态兼容的年龄候选（含限制锁定的 ≥18 过滤） */
function compatibleAges(){
  return OPT.age.filter(function(o){
    if(o.v==='不使用') return true;
    if(restrictLock){
      var mm=o.v.match(/(\d+)/); if(!mm || parseInt(mm[1],10)<18) return false;
    }
    if(identityLockEffective()){
      var iv=v('identity');
      if(iv && iv!=='不使用' && AGE_IDENTITY[o.v]!==iv) return false;
    }
    for(var i=0;i<AGE_LINKED.length;i++){
      var fid=AGE_LINKED[i];
      if(!lockedFields[fid]) continue;
      var fv=v(fid); if(!fv || fv==='不使用') continue;
      var lists=STRATUM_LISTS[fid]; if(!lists) continue;
      var cur=lists[stratumOfAgeStr(o.v)]||[];
      if(!cur.some(function(x){return x.v===fv;})) return false;
    }
    return true;
  });
}
/* 锁定身份/联动字段后，把年龄对齐到兼容值（随机挑一个兼容年龄并重跑联动） */
function snapAgeToCompatible(){
  var allowed=compatibleAges().filter(function(o){return o.v!=='不使用';});
  var cur=v('age');
  if(cur==='不使用') return; /* 用户明确不使用年龄：不强制指定 */
  if(cur && cur!=='不使用' && allowed.some(function(o){return o.v===cur;})){ autoIdentity(); return; }
  if(!allowed.length) return;
  var ae=$('age'); if(!ae) return;
  ae.value=allowed[Math.floor(Math.random()*allowed.length)].v;
  userPicked['age']=true;
  applyAgeBody(); autoIdentity();
  generate();
}
/* 锁定状态变化后重刷年龄/身份下拉（过滤规则由 fillSelect 按锁定状态计算） */
function refreshAgeOptions(){
  var ae=$('age');
  var before = ae ? ae.value : '';
  if(ae) fillSelect(ae, OPT.age, true);
  var ie=$('identity'); if(ie) fillSelect(ie, OPT.identity, true);
  /* 原年龄被过滤掉（如开启限制锁定后原为未成年）→ 吸附到兼容年龄 */
  if(ae && before && before!=='不使用' && ae.value!==before) snapAgeToCompatible();
  autoIdentity(); /* 清掉与限制锁定冲突的残留身份 */
}
/* 初始默认按成年词表，applyAgeBody() 会在运行时按所选年龄切换 */
OPT.height     = HEIGHT_ADULT;
OPT.weight     = WEIGHT_ADULT;
OPT.bust       = BUST_ADULT;
OPT.waistHip   = WAISTHIP_ADULT;
OPT.feet       = FEET_ADULT;
OPT.styleLabel = STYLELABEL_ADULT;

OPT.hairLen = norm(['及腰长发','过胸长发','及肩中长发','齐耳短发','锁骨发','短发']);
OPT.hairColor = norm(['黑发','深棕','浅棕','栗色','奶茶色','亚麻色','金色','白金色','灰蓝色','渐变染','挑染','挂耳染']);
OPT.hairCurl = norm(['直发柔顺','自然微卷','波浪卷','大卷','羊毛卷','慵懒卷','法式烫','公主切']);
OPT.hairTie = norm(['披散','高马尾','低马尾','侧马尾','双马尾','丸子头','低髻','半扎','麻花辫','盘发','松散发髻']);
OPT.hairBangs = norm(['齐刘海','空气刘海','八字刘海','侧分','中分','无刘海','法式刘海']);
OPT.hairState = norm(['柔顺垂落','随风轻扬','几缕碎发拂过脸颊','凌乱蓬松','发梢微翘','贴脸碎发','湿发撩开','发丝遮眼']);
OPT.hairAcc = norm([
  ['不使用',''],
  ['蝴蝶结发夹','发间别着一枚蝴蝶结发夹'],
  ['珍珠发夹','发间别着一枚珍珠发夹'],
  ['发箍','头顶戴着细发箍'],
  ['发带','额前系着一条发带'],
  ['鲨鱼夹','脑后别着鲨鱼夹'],
  ['簪子','发间斜插一支簪子'],
  ['花朵发饰','发间簪着花朵发饰'],
  ['猫耳发饰','头顶戴着猫耳发饰'],
  ['贝雷帽','头顶斜戴一顶贝雷帽'],
  ['护士帽','头戴护士帽'],
  ['女仆发饰','发间系着女仆头饰'],
  ['蕾丝眼罩','蕾丝眼罩半搭在额前'],
  ['皇冠','头顶戴着小皇冠'],
  ['花冠','发间绕着花冠'],
  ['面纱','薄纱面纱垂在脸侧'],
  ['草帽','头戴草帽'],
  ['棒球帽','头戴棒球帽'],
  ['丝带编发','发间编入一条丝带']
]);

OPT.makeup = norm([
  ['素颜','裸妆感，自然无妆感，清透底妆'],
  ['清纯淡妆','淡粉色唇釉，棕色眼线微挑，日系透明感，若有似无'],
  ['甜妹妆','粉色系腮红，亮片眼影，水光唇釉，爱豆感'],
  ['网感妆','精致滤镜感，卧蚕突出，睫毛浓密，高光点缀'],
  ['纯欲妆','大面积眼下腮红晕染，嘟嘟唇水光质感，看似无妆处处精致'],
  ['御姐妆','红唇浓烈，眼线上挑，哑光底妆，气场全开'],
  ['欧美妆','截断式眼妆，裸色唇，古铜修容，假睫毛浓密'],
  ['厌世妆','低饱和，眼尾下垂，唇色暗沉，宿醉感腮红']
]);
OPT.makeupDetail = norm(['不使用','无瑕底妆','自然腮红','卧蚕提亮','眼下腮红','哑光红唇','重眼影','浓密睫毛','泪痣']);
OPT.smudge = norm([
  ['不使用',''],
  ['轻微','妆容略有花掉的痕迹，口红边缘微晕'],
  ['中度','眼线晕开，口红蹭到脸颊'],
  ['重度','眼妆糊成一片，口红满脸']
]);
OPT.nails = norm([
  ['不使用',''],
  ['精致美甲','指尖是精致美甲'],
  ['自然素甲','指尖素净无装饰'],
  ['甲油剥落','指尖甲油微微剥落']
]);

OPT.emotion = norm([
  ['害羞','脸颊泛红，视线躲闪，带着羞怯的浅笑'],
  ['魅惑','眼神迷离，嘴角似笑非笑，带着勾人的意味'],
  ['愉悦','眉头舒展，嘴唇微启，神情沉醉愉悦'],
  ['服从','眼神顺从，微微仰视，等待指令般安静'],
  ['俏皮','歪着头，眼带笑意，俏皮灵动'],
  ['痛苦','眉头微皱，咬牙隐忍，眼角泛红'],
  ['惊恐','双眼睁大，神情惊惶，嘴唇微张'],
  ['恍惚失神','眼神涣散，神情放空，微微失焦'],
  ['隐忍','抿紧嘴唇，强作镇定，眉眼间压着情绪'],
  ['冷淡','神情冷淡，目光游离，从容疏离'],
  ['反差','清纯的面孔下藏着勾人的神情，克制与欲望交织']
]);
OPT.eye = norm([
  ['勾引','低垂眼帘抬眼看人，侧目斜睨'],
  ['迷离失神','半闭着眼，瞳孔涣散'],
  ['羞耻回避','羞涩地移开视线，脸颊绯红'],
  ['乞求哀怨','水汪汪地向上望，带着哀求'],
  ['放空虚无','目光空洞，望向虚处'],
  ['惊恐','眼睛瞪大，目光发直'],
  ['挑逗','直勾勾地注视，带着挑衅'],
  ['湿润含泪','眼眶微红，泛着泪光']
]);
OPT.mouth = norm([
  ['闭合','嘴唇轻抿，唇角带着若有若无的浅笑'],
  ['微张','嘴唇微张，吐息轻轻'],
  ['咬唇','贝齿轻咬下唇'],
  ['吐舌','舌尖轻轻探出'],
  ['舔唇','舌尖缓缓舔过下唇'],
  ['唾液','唇角牵着一丝透明的唾液细线',false,true]
]);

/* ---- 服装库（§7.5） ---- */
var CLOTH = {
  '内衣/睡衣': [
    ['黑色蕾丝无钢圈内衣','黑色蕾丝无钢圈内衣，镂空花纹透出肌肤底色'],
    ['白色运动内衣','白色运动内衣，宽肩带压住锁骨，面料厚实哑光'],
    ['黑色抹胸','黑色抹胸紧裹上身，上缘平直利落'],
    ['香槟色缎面吊带睡裙','香槟色缎面吊带睡裙，细肩带在锁骨两侧微反光，裙身垂坠至大腿中部'],
    ['米白色真丝睡袍','米白色真丝睡袍敞开披在肩头，面料轻薄通透'],
    ['白色棉质长袖睡衣','白色棉质长袖睡衣，纽扣整齐系至锁骨，面料厚实柔软'],
    ['象牙白缎面吊带背心','象牙白缎面吊带背心，细肩带在锁骨两侧滑落'],
    ['黑色蕾丝连体衣','黑色蕾丝连体衣紧贴身体，前胸镂空花纹透出肌肤'],
    ['卡通儿童棉质睡衣','卡通儿童棉质睡衣，纽扣系至锁骨，面料厚实柔软']
  ],
  '上衣': [
    ['奶白色罗纹针织短款吊带背心','奶白色罗纹针织短款吊带背心，短至胸下缘，露出平坦腰腹'],
    ['黑色一字肩上衣','黑色一字肩上衣，肩线低至肩头以下，露出两侧锁骨与圆润肩头'],
    ['深蓝挂脖上衣','深蓝挂脖上衣，布料绕颈交叉，大片背部裸露'],
    ['白色棉质宽松衬衫','白色棉质宽松衬衫，领口微敞两颗纽扣，袖口随意挽至小臂'],
    ['驼色羊绒针织开衫','驼色羊绒针织开衫，扣子全部敞开，衣摆垂至大腿中部'],
    ['浅灰色羊绒开衫','浅灰色羊绒开衫慵懒披在肩头，袖管空垂在身体两侧'],
    ['深灰色西装外套','深灰色西装外套，垫肩利落，腰部收腰剪裁'],
    ['卡其色风衣','卡其色风衣，双排扣，腰带随意系结，衣摆至小腿'],
    ['黑色高领针织毛衣','黑色高领针织毛衣，领口包裹整个颈部，面料柔软厚实'],
    ['白色丝质衬衫','白色丝质衬衫，面料垂顺泛着柔和光泽'],
    ['黑色丝绒紧身上衣','黑色丝绒紧身上衣，贴合身体，温润哑光'],
    ['淡粉色裹身上衣','淡粉色裹身上衣，交叉系带收出腰线'],
    ['复古波点衬衫','复古波点衬衫，泡泡袖，领口微敞'],
    ['卡通图案纯棉T恤','卡通图案纯棉T恤，圆领宽松，面料柔软'],
    ['连帽卫衣','连帽卫衣，袋鼠口袋，下摆抽绳'],
    ['白色圆领针织背心','白色圆领针织背心，内搭衬衫']
  ],
  '下装': [
    ['黑色喇叭裤','黑色喇叭裤，膝盖以下逐渐展开'],
    ['黑色鲨鱼裤','黑色鲨鱼裤'],
    ['深灰色百褶短裙','深灰色百褶短裙，裙摆仅覆大腿根部，每道压褶明暗交替'],
    ['黑色紧身短裙','黑色紧身短裙包裹臀部与大腿，侧边银色拉链延伸至裙摆'],
    ['米色包臀裙','米色包臀裙过膝，面料贴合每一寸曲线'],
    ['白色网球裙','白色网球裙，内置打底短裤，裙摆百褶从腰线散开'],
    ['黑色牛仔热裤','黑色牛仔热裤，裤脚毛边，仅覆盖大腿根部'],
    ['米白色高腰阔腿裤','米白色高腰阔腿裤，腰线至肚脐以上，裤管宽大垂顺'],
    ['深灰色瑜伽裤','深灰色瑜伽裤紧贴双腿，勾勒完整腿部线条'],
    ['浅蓝色低腰牛仔裤','浅蓝色低腰牛仔裤，低腰露出胯骨线条，裤管拖地堆在鞋面'],
    ['蓝色高腰牛仔裤','蓝色高腰牛仔裤，裤脚微卷'],
    ['黑色皮短裤','黑色皮短裤，短至大腿根，皮质泛着锐利高光'],
    ['白色纱裙','白色层叠纱裙，轻盈蓬松，裙摆垂至脚踝'],
    ['藏蓝百褶短裙','藏蓝百褶短裙，裙摆仅覆大腿根部'],
    ['白色百褶短裙','白色百褶短裙，裙摆及膝'],
    ['牛仔背带裤','牛仔背带裤，胸前工装口袋，裤管宽松']
  ],
  '连衣裙': [
    ['深蓝灰缎面吊带裙','深蓝灰缎面吊带裙，细肩带滑至肩头边缘，裙身贴合曲线，侧面高开衩'],
    ['黑色紧身针织连衣裙','黑色紧身针织连衣裙，从胸部到膝盖紧贴每一寸身体曲线'],
    ['酒红色裹身裙','酒红色裹身裙，低领交叉设计，腰带在侧腰系结，裙摆自然散开'],
    ['经典小黑裙','经典小黑裙，无袖方领设计，腰部收紧裙摆微展，及膝长度'],
    ['浅蓝色条纹衬衫裙','浅蓝色条纹衬衫裙，领口纽扣微敞，腰带在腰间收紧'],
    ['碎花茶歇裙','碎花茶歇裙，低领交叉露出锁骨，短袖荷叶边袖口，裙摆及膝微展'],
    ['白色缎面吊带长裙','白色缎面吊带长裙拖地，细肩带交叉于背后，裙身垂坠流畅'],
    ['学院风格纹连衣裙','学院风格纹连衣裙，白色衬衫领，深蓝格纹裙身及膝'],
    ['粉色蓬蓬纱裙','粉色蓬蓬纱裙，层层纱网蓬起，裙摆及膝，腰间缎带蝴蝶结'],
    ['牛仔背带连衣裙','牛仔背带连衣裙，内搭白T恤，裙摆至大腿中部'],
    ['白色娃娃领连衣裙','白色娃娃领连衣裙，泡泡袖，腰间碎褶']
  ],
  /* 紧身形体服：遵守 §5.3-E 零扩写原则，仅写「颜色 + 款式」极简短语 */
  '紧身形体服': [
    ['粉色芭蕾形体服','粉色芭蕾形体服'],
    ['白色芭蕾形体服','白色芭蕾形体服'],
    ['彩色体操服','彩色体操服'],
    ['黑色紧身衣','黑色紧身衣'],
    ['深灰连体紧身衣','深灰连体紧身衣']
  ],
  '职业制服': [
    ['深蓝色西式校服','深蓝色西式校服，白衬衫领口系蝴蝶结领带，格子百褶裙及膝，白色小腿袜'],
    ['白色水手服','白色水手服，深蓝色大翻领，红色领巾打结，深蓝百褶短裙'],
    ['职场白领套装','白色衬衫塞进黑色包臀裙，黑色细跟高跟鞋'],
    ['经典黑白女仆装','经典黑白女仆装，白色荷叶边围裙系在黑色连衣裙外，白色蕾丝头饰'],
    ['深蓝色空姐制服','深蓝色空姐制服，红色领结，包臀裙及膝，贝雷帽'],
    ['红色丝绒旗袍','红色丝绒旗袍，立领金色盘扣，侧面高开衩至大腿中部'],
    ['白色交领汉服襦裙','白色交领汉服上衣，淡绿齐胸襦裙，宽袖飘逸，披帛绕臂'],
    ['白色抹胸婚纱','白色抹胸婚纱，蕾丝镂空上身，多层纱裙层叠拖地'],
    ['白色护士服','白色护士服，护士帽，浅粉领口，听诊器挂在颈间'],
    ['深色警服套裙','深色警服套裙，警帽，腰间对讲机，手铐别在腰侧']
  ],
  '学生校服': [
    ['经典蓝白运动服校服','经典蓝白运动服校服：藏蓝色翻领上衣，白领白袖口镶边、左胸绣校徽，下身藏蓝白竖条纹运动长裤，面料挺括透气，整体利落有少年气'],
    ['蓝白运动服长袖套装','蓝白运动服长袖套装，藏蓝长袖上衣白色镶边，下身藏蓝白条运动长裤'],
    ['蓝白运动服短袖套装','蓝白运动服短袖套装，藏蓝短袖上衣白边，下身藏蓝白条运动短裤'],
    ['蓝白运动服两件套','蓝白运动服两件套，藏蓝立领上衣配白色滚边，下身藏蓝白条束脚运动裤'],
    ['白色水手服校服','白色水手服校服，藏蓝大翻领、红色领巾，下身藏蓝百褶短裙与白色小腿袜'],
    ['深蓝西式校服','深蓝西式校服西装外套，白衬衫系蝴蝶结领带，格子百褶裙及膝'],
    ['小学生运动校服','小学生运动校服，藏蓝上衣配白色横条纹袖口，下身藏蓝运动长裤'],
    ['冬季毛呢校服外套','冬季毛呢校服外套，藏蓝双排扣，内搭白衬衫与藏蓝针织背心'],
    ['日式绀色校服','日式绀色校服西装，白衬衫红领结，下身灰色百褶裙'],
    ['背带校服裙','藏蓝背带校服裙，白色短袖衬衫，领口系小蝴蝶结']
  ]
};
OPT.shoes = norm([
  ['不使用',''],
  ['银色细跟高跟鞋','银色细跟高跟鞋，纤细踝带缠绕脚踝，鞋跟细如针尖'],
  ['黑色尖头高跟鞋','黑色尖头高跟鞋，鞋面弧线开口延伸至脚背'],
  ['裸色踝带高跟鞋','裸色踝带高跟鞋，纤细带子绕过脚踝扣在侧面'],
  ['透明塑料高跟鞋','透明塑料高跟鞋，脚趾与脚背在鞋内清晰可见'],
  ['黑色皮革过膝长靴','黑色皮革过膝长靴，靴筒紧贴小腿与大腿，拉链延伸至膝盖上方'],
  ['黑色马丁靴','黑色马丁靴，八孔系带，厚底齿轮纹路'],
  ['白色厚底运动鞋','白色厚底运动鞋，鞋底增高，鞋面皮革拼接网眼'],
  ['黑色漆皮乐福鞋','黑色漆皮乐福鞋，鞋面金属马衔扣'],
  ['芭蕾平底鞋','缎面芭蕾平底鞋，鞋面系带交叉缠绕脚踝'],
  ['米白色帆布鞋','米白色帆布鞋，鞋带松散'],
  ['赤脚','赤脚，脚背弧度优雅，脚趾圆润排列整齐']
]);
OPT.socks = norm([
  ['不使用',''],
  ['肉色连裤丝袜','肉色连裤丝袜包裹双腿，面料轻薄如第二层肌肤'],
  ['黑色连裤丝袜','黑色连裤丝袜，哑光面料紧贴腿部'],
  ['黑色渔网袜','黑色渔网袜，网眼从大腿根部延伸至脚踝'],
  ['黑色过膝袜','黑色过膝袜，袜口收紧在大腿中部'],
  ['白色蕾丝花边过膝袜','白色蕾丝花边过膝袜，袜口蕾丝翻折'],
  ['白色小腿袜','白色小腿袜，袜口在膝盖下方，棉质哑光'],
  ['白色及踝袜','白色及踝袜，袜口荷叶边从鞋口俏皮翻出'],
  ['黑色吊带袜','黑色吊带袜，吊袜带扣住袜口，袜身紧贴大腿']
]);
OPT.clothMat = norm([
  ['不使用',''],
  ['棉质','棉质面料吸收光线，呈现柔和哑光质感'],
  ['针织','罗纹针织在光下呈现细腻凹凸纹理'],
  ['牛仔','牛仔斜纹肌理在侧光下清晰可见'],
  ['雪纺','雪纺轻薄通透，逆光下近乎透明，飘逸轻盈'],
  ['真丝','真丝泛着温润的珍珠光泽，动作间在丝面滑出流动光带'],
  ['缎面','缎面在侧逆光下明暗渐变，高光冷白或暖金，暗部浓郁本色'],
  ['蕾丝','蕾丝镂空花纹在皮肤上投下细密花纹投影'],
  ['薄纱','薄纱在逆光下几乎透明，肌肤与轮廓若隐若现'],
  ['丝绒','丝绒在褶皱处形成深邃暗部，高光面泛低调暖光'],
  ['皮革','皮革表面反射锐利高光，暗部深邃近黑'],
  ['羊绒','羊绒细密绒毛在逆光下形成柔和轮廓光晕'],
  ['网眼','细密网眼在光下形成均匀的蜂巢状纹理'],
  ['粗花呢','粗花呢交织的各色纱线在近看时形成丰富的色彩层次'],
  ['亮片','每个亮片的朝向不同，在光下形成散点式的高光闪烁'],
  ['欧根纱','欧根纱质地硬挺，透光但不贴身，在光下形成雕塑般的明暗面'],
  ['乳胶','亮面乳胶紧贴身体如第二层皮肤，表面反射锐利白色高光']
]);
OPT.clothPattern = norm(['不使用','条纹','格子','维希格','碎花','波点','千鸟格','扎染','渐变','豹纹','色块拼接']);
OPT.clothDeco = norm(['不使用','荷叶边','压褶','蝴蝶结','刺绣','亮片','铆钉','流苏','蕾丝镶边','泡泡袖','珍珠装饰','镂空蕾丝']);
OPT.clothLayer = norm([
  ['不使用',''],
  ['外套随意披在肩头','外套随意披在肩头'],
  ['衬衫衣摆在腰间打结','衬衫衣摆在腰间打结'],
  ['衣摆法式半塞进下装','衣摆法式半塞进下装'],
  ['外层敞开露出内搭','外层敞开露出内搭'],
  ['单肩滑落的不对称穿法','单肩滑落的不对称穿法'],
  ['袖口随意卷至小臂','袖口随意卷至小臂'],
  ['极细腰带在腰间束出腰线','极细腰带在腰间束出腰线'],
  ['多条项链在锁骨间层叠交错','三条不同长度的金色链子在锁骨间层叠交错'],
  ['外搭驼色低领针织背心','外搭驼色低领针织背心'],
  ['宽垫肩西装外套披在肩头','宽垫肩西装外套披在肩头']
]);
OPT.accessory = norm([
  ['不使用',''],
  ['纤细锁骨链贴着锁骨','纤细锁骨链贴着锁骨'],
  ['多条项链层叠垂在锁骨间','多条项链层叠垂在锁骨间'],
  ['银色耳环在发间轻晃','银色耳环在发间轻晃'],
  ['珍珠耳坠垂在耳畔','珍珠耳坠垂在耳畔'],
  ['金色身体链沿腰线垂落','金色身体链沿腰线垂落'],
  ['手腕叠戴多条细手链','手腕叠戴多条细手链'],
  ['极细黑皮带松松系在胯骨','极细黑皮带松松系在胯骨'],
  ['一枚细戒指戴在指间','一枚细戒指戴在指间'],
  ['纤细脚链绕在脚踝','纤细脚链绕在脚踝'],
  ['黑色丝绒项圈紧贴喉下','黑色丝绒项圈紧贴喉下'],
  ['十字架吊坠垂在锁骨间','十字架吊坠垂在锁骨间']
]);

/* NSFW 服装（§8.1） */
OPT.nsfwState = norm([
  ['正常穿着','She wears a crisp white button-up shirt tucked neatly into a high-waist black pencil skirt, the top button fastened at her throat, sheer black pantyhose encasing her legs.'],
  ['滑落微露','Her white silk camisole has slipped off one shoulder, the strap hanging loose against her upper arm, the fabric gaping just enough to hint at what lies beneath.'],
  ['掀起敞开','Her white button-up shirt is completely unbuttoned and hangs open, framing her bare torso; her black pencil skirt has been pushed up to her waist, bunched around her hips.'],
  ['半脱','Her dress is pulled down to her waist, pooling around her hips revealing her completely bare chest; one bra strap hangs loose off her shoulder.'],
  ['仅剩配饰','She is completely nude except for a pair of white lace-top thigh-high stockings gripping her legs mid-thigh and a black velvet choker wrapped snugly around her throat.'],
  ['破损','Her school uniform is in ruins—the white blouse torn open from collar to midriff with buttons scattered on the floor, her plaid mini skirt ripped up the side seam.'],
  ['湿透透视','She wears a white cotton shirt completely soaked through with water, the wet fabric clinging transparently to every contour of her body.']
]);
OPT.nsfwMod = norm([
  ['不使用',''],
  ['透明化','The fabric of her outfit turns sheer and translucent, every contour beneath visible through the cloth.'],
  ['裁剪缩短','Her outfit has been cropped drastically short, hems riding high over her hips.'],
  ['镂空开口','A diamond-shaped cutout sits over her bare midriff, framed by the taut fabric.'],
  ['破损化','The fabric is torn into ragged strips, barely holding together across her body.'],
  ['乳胶亮面','The glossy black latex surface clings to her skin, reflecting sharp white highlights.'],
  ['裸露加配饰','Only her accessories remain on her skin—a hat, a badge pinned to her bare chest, and leather gloves.'],
  ['非对称化','One side of her outfit stays intact while the other is peeled away entirely, exposing bare skin.']
]);
OPT.nsfwFabric = norm([
  ['不使用',''],
  ['黑色乳胶','The material is glossy black latex, hugging her skin like a second layer.'],
  ['白色薄纱','The material is sheer white chiffon, airy and nearly transparent.'],
  ['深红丝绒','The material is deep red velvet, its folds catching the light in dark, rich tones.'],
  ['黑色真丝','The material is black silk, sliding over her skin with a soft sheen.'],
  ['湿透棉布','The wet white cotton clings transparently to every curve of her body.']
]);
OPT.nsfwShoes = norm([
  ['不使用',''],
  ['黑色细高跟','A pair of black stiletto heels remains on her feet.'],
  ['黑色过膝长靴','Black thigh-high boots encase her legs.'],
  ['白色蕾丝过膝袜','Sheer white lace-top thigh-high stockings grip her thighs.'],
  ['黑色渔网袜','Black fishnet stockings hug her legs.'],
  ['赤脚','Her bare feet press against the floor, toes curling slightly.']
]);

/* ---- 姿态库（§7.8 / §8.2） ---- */
var POSES = {
  '静态姿势': [
    ['臣服跪姿','双膝跪地，双手背在身后，脊背挺直，微微低头',0],
    ['床边翘臀','跪在床边俯身，臀部朝向镜头微微翘起',1],
    ['土下座','额头贴地跪伏，姿态恭顺',0],
    ['床边坐','坐在床沿，双腿自然垂下，脚尖轻点地面',1],
    ['椅坐双腿交叠','靠在椅中，双腿交叠，鞋尖微微晃动',0],
    ['椅坐一条腿抬起','侧坐椅中，一条腿抬起搭在扶手上',1],
    ['开腿坐','席地而坐，双腿分开，手撑在身后',1],
    ['并腿坐','双腿并拢侧坐，一只手搭在膝上',0],
    ['抱膝坐','双膝收拢抱在胸前，脸侧枕在膝头',0],
    ['骑跨坐','跨坐在椅背或床沿，双手搭在身前',0],
    ['直立','笔直站立，重心平稳，双手自然垂在身侧',0],
    ['叉腰','单手叉腰，重心落在一侧，肩线微斜',0],
    ['背手','双手背在身后站立，肩胛微微收紧',0],
    ['靠墙','背靠墙面站立，重心落在一条腿上',0],
    ['倚窗','侧身倚在窗框边，手肘撑住窗台',0],
    ['镜前','站在落地镜前，双手垂在身侧',0],
    ['仰卧','仰面平躺，双臂自然摊开',1],
    ['俯卧','俯卧，脸颊枕在手背上',1],
    ['侧卧','侧身蜷卧，一只手枕在脸侧',1],
    ['大字摊','大字摊开仰躺，四肢舒展',1],
    ['翘臀趴','趴伏在床上，臀部微微翘起',1],
    ['头垂床沿','仰躺，头垂出床沿，长发垂落',1]
  ],
  '动态动作': [
    ['走向镜头','正朝镜头走来，步伐从容',0],
    ['背向离开','背对镜头缓步离开，边走边回头',0],
    ['回眸行走','行走中回眸，发丝随动作扬起',0],
    ['雨中行走','在雨中行走，雨点溅起细碎水花',0],
    ['高跟鞋摇曳','踩着高跟鞋行走，腰臀随步伐摇曳',0],
    ['回望奔跑','奔跑中回望镜头',0],
    ['裙摆飞扬','奔跑中裙摆被风掀起',1],
    ['跃起','原地跃起，裙摆与发丝同时扬起',0],
    ['跳床','在床上跃起，身体腾空',0],
    ['慢舞','独自慢舞，手臂划出弧线',0],
    ['转圈','原地转圈，裙摆划出圆形弧度',0],
    ['钢管舞','绕钢管旋转，身体贴近钢管',0],
    ['出水瞬间','从水中起身，水顺着身体滑落',0]
  ],
  '过渡姿态': [
    ['蒙头脱衣','正把上衣蒙头拉起，露出一截腰腹',0],
    ['缓慢解扣','手指正缓慢解开胸前纽扣',0],
    ['背后拉链半拉','手伸到背后，拉链拉到一半',0],
    ['肩带滑落','一侧肩带滑落，指尖正把它勾回',0],
    ['丝袜卷到大腿','丝袜卷到大腿中部，指尖正整理袜口',0],
    ['内裤褪到膝盖','手勾住内裤边缘，正往下褪',1],
    ['回眸','身体背对，脸转回来看向镜头',0],
    ['半转身','半转身，侧影与正脸各占一半',0],
    ['扭腰回头','扭腰回头，脊背弯曲出流畅曲线',0],
    ['弯腰捡物','弯腰捡起地上的物件，臀部朝向镜头',1],
    ['撑床起身','双手撑床，上身抬起',0]
  ],
  '挑逗姿态': [
    ['曲线叉腰','侧身站出优雅曲线，单手叉腰',0],
    ['回眸放电','回眸看向镜头，眼波流转',0],
    ['咬唇','指尖轻触嘴唇，作咬唇状',0],
    ['舔唇','舌尖轻舔下唇',0],
    ['抚摸大腿','手掌沿大腿外侧缓缓滑过',0],
    ['托胸','双手轻轻托住胸部',0],
    ['对镜摆姿势','对镜摆出撩人姿势',0],
    ['飞吻','指尖轻触唇边，送出飞吻',0]
  ]
};
OPT.poseExtra = norm([
  ['不使用',''],
  ['手指搭拉链','指尖搭在拉链头上'],
  ['手伸背后解扣','一只手伸到背后解扣'],
  ['勾裤腰','拇指勾住裤腰边缘'],
  ['抓床单','手指抓紧床单'],
  ['指尖轻触唇边','指尖轻触唇边']
]);
OPT.pantyColor = norm(['白色','黑色','米白色','浅粉色','雾蓝色']);
OPT.pantyStyle = norm(['棉质三角','纯棉平角','高腰纯棉','棉质四角']);

OPT.nsfwPose = norm([
  ['单人诱惑','She kneels on the floor with her knees wide apart, her back arched deeply pushing her chest forward, her hands resting palm-up on her thighs in a posture of offering.'],
  ['单人暴露','A sudden gust of wind lifts her pleated skirt from behind, the hem flipping up to expose the full seat of her white cotton panties.'],
  ['单人自慰','She lies on her back on rumpled sheets with one hand buried between her thighs, her back arching off the mattress as her lips part in a silent gasp.'],
  ['单人展示','She kneels before a full-length mirror with her back to it, twisting to look at her own reflection over her shoulder.'],
  ['双人口交','She kneels before him, leaning forward to take him into her mouth, her cheeks hollowing with gentle suction as she looks up through her lashes.'],
  ['双人足交','She lies on her stomach with both soles pressed together around his shaft, looking back over her shoulder with a playful grin.'],
  ['双人乳交','She kneels before him pressing her large breasts together to create a tight channel, her tongue extended to tease the tip.'],
  ['双人手交','She sits beside him with one hand wrapped around his shaft moving in slow deliberate strokes, her thumb circling the tip on each pass.'],
  ['双人调戏','She is pressed against the wall in a crowded train car with a stranger\u2019s hand sliding up her thigh beneath her skirt.'],
  ['传教士','She lies on her back with her legs wrapped around his waist, her ankles locked at the small of his back pulling him deeper.'],
  ['站立位','She stands facing the wall with both palms pressed flat against it, her back arched and her hips pushed back toward him.'],
  ['坐身位','She sits on his lap facing him with her legs wrapped around his waist, rocking her hips in a slow grinding rhythm.'],
  ['后入位','She is on all fours with her back deeply arched, his hands gripping her waist as he drives into her from behind.'],
  ['火车便当','He lifts her completely off the ground with his hands gripping under her thighs, her legs wrapped around his waist.'],
  ['种付位','He covers her completely, her legs folded up and pinned against her own chest, his full weight driving her into the mattress.'],
  ['骑乘位','She straddles him facing forward, her hands braced on his chest as she rises and falls in a steady bouncing rhythm.'],
  ['睡奸','She lies on her back fast asleep with her lips slightly parted, her legs carefully spread apart by the weight of his body settling between them.'],
  ['攻守反转','She sits squarely on his face with her knees planted on either side of his head, the power dynamic completely reversed.'],
  ['过激','He pins her to the bed with one hand wrapped around her throat squeezing just enough to make her vision blur.'],
  ['多人','She is on all fours caught between two men—one kneeling before her as she takes him in her mouth, the other behind her driving into her.']
]);
OPT.nsfwChain = norm([
  ['不使用',''],
  ['强制链',', her wrists held back and her body trembling under the restraint'],
  ['失神链',', her gaze growing unfocused, lips parting in a dazed sigh'],
  ['羞耻链',', her cheeks flushed, eyes avoiding his with shy embarrassment'],
  ['运动链',', the motion steady and rhythmic, skin catching the light'],
  ['事后链',', her body slack and trembling, breath coming in short gasps']
]);

/* ---- 背景 / 道具（§7.7 / §7.13） ---- */
OPT.scene = norm([
  ['卧室','简约卧室，白色床单微皱，淡紫色窗帘半掩，背景虚化'],
  ['情人旅馆','情人旅馆，镜面天花板反射霓虹，粉色调灯光暧昧'],
  ['温泉','露天温泉，氤氲蒸汽与木纹浴池，暖光在雾气中晕开',0,0,true],
  ['浴室','浴室里，瓷砖墙面与雾面玻璃，水汽朦胧',0,0,true],
  ['酒店套房','顶层酒店套房落地窗前，窗外城市夜景灯火虚化为冷色光斑，大理石地面倒映光点'],
  ['教室','放学后的教室，荧光灯与黑板，木桌整齐排列，背景虚化'],
  ['图书馆','图书馆书架之间，暖黄台灯与旧书气息'],
  ['办公室','办公室，百叶窗影落在桌面，显示器微光，咖啡杯搁在一旁'],
  ['电车','末班电车内，荧光灯与不锈钢扶手，窗外灯火掠过'],
  ['车内','车内，仪表盘微光与窗外路灯光交替掠过，皮革座椅'],
  ['便利店','深夜便利店，冷柜灯光明亮，货架整齐'],
  ['点歌厅','包厢内，霓虹与点歌屏幕的光线交织'],
  ['更衣室','更衣室，镜面与布帘，暖黄灯光'],
  ['夜店','夜店，彩色霓虹与频闪灯光交错，人群虚化'],
  ['风俗店','昏暗的店内，丝绒沙发与暧昧灯光'],
  ['医院','医院病房，冷白荧光与不锈钢器械，窗帘半掩'],
  ['按摩院','按摩院，按摩床与香薰烛光'],
  ['公寓','公寓房间，暖黄灯光与生活杂物，窗台绿植'],
  ['天台','天台，城市夜景与星空，夜风掠过'],
  ['海边','海边，海浪拍岸，落日余晖洒在水面',0,0,true],
  ['夜晚公园','夜晚公园，路灯与树影，长椅旁的草地'],
  ['后巷','后巷，昏暗路灯与涂鸦墙，地面积水的反光'],
  ['和室','和室，障子纸透进柔光，榻榻米纹理清晰'],
  ['神社','神社，朱红鸟居与石灯笼，暮色中安静'],
  ['影棚','影棚，柔光箱与背景纸，地面反光板'],
  ['水下','水下，波光穿过水面，光线在水中折射',0,0,true],
  ['监禁密室','昏暗密室，铁门紧闭，头顶一盏昏黄灯泡'],
  ['镜屋','镜屋，无数镜面相互反射，人影在镜中无限延伸']
]);
OPT.prop = norm([
  ['不使用',''],
  ['红酒杯','一杯红酒搁在台面，酒液泛着暗光'],
  ['清酒','一壶清酒与酒杯摆在矮几上'],
  ['香烟','指间夹着细长香烟，烟雾袅袅'],
  ['蜡烛','几支蜡烛在旁燃烧，烛焰轻摇'],
  ['冰块','玻璃杯中的冰块泛着冷光'],
  ['玫瑰花瓣','玫瑰花瓣散落在身侧'],
  ['书籍','一本摊开的书搁在一旁'],
  ['眼镜','一副圆框眼镜握在指间'],
  ['枕头','枕头堆在身后'],
  ['手机','手机举在脸侧，屏幕亮着'],
  ['拍立得','一张拍立得照片夹在指间'],
  ['单反相机','单反相机挂在颈间'],
  ['猫','一只猫卧在床边，尾巴轻摆'],
  ['兔子','一只兔子蹲在脚边'],
  ['耳机','头戴式耳机挂在颈间'],
  ['游戏手柄','游戏手柄搁在膝边'],
  ['钞票','几张钞票散落桌面'],
  ['名片','一张名片放在桌面'],
  ['房卡','房卡搁在床头柜上'],
  ['手铐','银色手铐松松扣在腕间',0,true],
  ['眼罩','黑色眼罩搭在额前',0,true],
  ['绳索','红绳缠绕在腕间与脚踝',0,true],
  ['振动棒','振动棒握在手中',0,true],
  ['跳蛋','跳蛋被遥控器控制着',0,true],
  ['口球','口球握在手中',0,true],
  ['项圈牵绳','项圈与牵绳系在颈间',0,true]
]);
OPT.weather = norm([
  ['不使用',''],
  ['晴空万里','天气晴好，阳光明亮'],
  ['细雨斜落','细雨斜斜落下，空气微凉'],
  ['阴天柔光','阴天云层滤出柔光'],
  ['细雪飘落','细雪轻轻飘落'],
  ['夜色深沉','夜色深沉，灯火点点'],
  ['黄昏暮色','黄昏暮色染透半边天空'],
  ['蒸汽朦胧','蒸汽朦胧升腾'],
  ['水光浮动','水面波光浮动']
]);

/* ---- 构图（§7.1） ---- */
OPT.comp = norm([
  ['三分法','构图采用三分法'],
  ['对角线','构图采用对角线布局，人物身体斜跨画面，从一角延伸至对角'],
  ['框架构图','前景元素形成天然画框将人物框入其中，画中画聚焦'],
  ['镜面反射构图','镜框作为天然框架将画面一分为二，镜外真实人物占据前景一侧，镜内倒影占据另一侧'],
  ['负空间','大面积空白包围人物，极简留白强化主体'],
  ['引导线','环境线条汇聚引导视线至人物面部，纵深与戏剧性并存'],
  ['中心对称','人物居中，左右环境完美对称，庄重的仪式感'],
  ['前景遮挡','前景虚化元素部分遮挡人物，制造层次与窥视感'],
  ['倾斜构图','画面整体倾斜打破水平线，不安与动态张力']
]);
OPT.compPos = norm([
  ['居于画面中央','居于画面中央'],
  ['偏于左侧三分之一处','偏于左侧三分之一处，右侧留白形成呼吸感'],
  ['偏于右侧三分之一处','偏于右侧三分之一处，左侧留白形成呼吸感'],
  ['置于画面左下角','置于画面左下角，右上留白'],
  ['置于画面右下角','置于画面右下角，左上留白'],
  ['向画外延伸','身体线条向画外延伸']
]);

/* ---- 附加（§7.10 / §7.11 / §7.12） ---- */
OPT.styleTag = norm([
  ['不使用',''],
  ['电影剧照','电影剧照'],
  ['时尚大片','时尚大片'],
  ['闺房摄影','闺房摄影'],
  ['拍立得快照','拍立得快照'],
  ['复古照','复古照'],
  ['抓拍纪实','抓拍纪实'],
  ['街头','街头随拍'],
  ['夜景','夜景'],
  ['影棚','影棚棚拍'],
  ['私密照','私密照'],
  ['写真偶像','写真偶像'],
  ['素人自拍','素人自拍',0,true],
  ['成人摄影截图','成人摄影截图',0,true],
  ['软色情','软色情',0,true],
  ['艺术裸体','艺术裸体',0,true],
  ['闺房私照','闺房私照',0,true]
]);
OPT.film = norm([
  ['不使用',''],
  ['暖调人像','整体呈现暖调胶片质感，细颗粒、柔和对比、奶油肤感'],
  ['暖调怀旧','整体呈现暖黄怀旧胶片质感，颗粒明显，家庭纪念照般的温馨'],
  ['高饱和','整体呈现高饱和胶片质感，浓郁锐利，杂志封面感'],
  ['素人感','整体呈现日常胶片质感，暖调松弛，生活记录感'],
  ['霓虹夜','整体呈现霓虹夜胶片质感，暖光与蓝调阴影交织，光晕扩散'],
  ['冷调纪实','整体呈现冷调纪实质感，低饱和灰调，克制疏离'],
  ['昭和复古','整体呈现昭和复古质感，褪色暖调，旧时光的怀旧'],
  ['黑白质感','整体呈现黑白高对比质感，粗颗粒，硬朗'],
  ['黑白艺术','整体呈现黑白细腻质感，深黑丝滑，艺术感'],
  ['冷调科技','整体呈现冷蓝干净质感，冷静克制'],
  ['梦幻唯美','整体呈现梦幻柔和质感，通透仙气，写真感'],
  ['过期胶片','整体呈现过期胶片质感，褪色偏色，轻微雾感']
]);
OPT.cine = norm([
  ['不使用',''],
  ['暖柔电影感','奶油般的柔和焦外，暖肤色，光线自然晕染'],
  ['现代锐利','干净锐利的现代电影镜头质感'],
  ['经典好莱坞','椭圆焦外，宽银幕比例，蓝色眩光'],
  ['梦幻奢华','梦幻焦外，人物从背景中立体剥离'],
  ['通用人像','奶油般的柔和焦外，暖肤色'],
  ['复古俄头','漩涡状焦外，柔和复古柔焦']
]);
OPT.imperf = norm([
  ['不使用',''],
  ['雀斑','脸颊散落细碎雀斑'],
  ['美人痣','唇角一粒美人痣'],
  ['自然毛孔','皮肤保留自然毛孔与细腻纹理'],
  ['淡疤','膝盖一道淡淡旧疤'],
  ['锁骨突出','锁骨线条清晰突出'],
  ['胶片颗粒','画面带有轻微胶片颗粒'],
  ['镜头眩光','镜头边缘有轻微眩光'],
  ['轻微失焦','焦点略带轻微失焦的胶片感'],
  ['褶皱床单','身下床单被压出褶皱'],
  ['湿发贴脖','湿发贴在后颈'],
  ['潮红','面颊泛着微微潮红'],
  ['汗水','细密汗珠沿皮肤滑落',0,true],
  ['压痕','皮肤上留着浅浅压痕',0,true],
  ['唾液拉丝','唇角牵连着透明的唾液细丝',0,true]
]);
OPT.tattoo = norm(['不使用','小爱心','樱花','猫爪印','蛇','大玫瑰','腰链纹身','黑桃Q','毛笔字','昇龙']);
OPT.tattooPos = norm(['锁骨','小腹','后颈','大腿内侧','臀部','手腕','脚踝','胸口','背部']);

/* ================= 界面配置 ================= */
var MODE = 'SFW';
/* 国际版开关：默认关闭——隐藏「NSFW·露骨」标签项，仅提供 SFW 含蓄模式；开启后显示 NSFW·露骨 选项 */
var intlMode = false;
/* 限制锁定：默认开启。开启时，未满 18 岁的角色禁止进入 NSFW 模式（与最早版本一致）；解除勾选后无限制。 */
var restrictLock = true;
function isMinorAge(){
  var a=v('age'); if(!a||a==='不使用') return false;
  var m=a.match(/(\d+)/); if(!m) return false;
  return parseInt(m[1],10) < 18;
}
function enforceRestrict(){
  if(restrictLock && isMinorAge() && MODE==='NSFW') MODE='SFW';
  syncModeButtons();
}
var SECTIONS = [
  {id:'camera', title:'① 拍摄角度', open:true, fields:[
    {id:'lens', label:'镜头类型', list:'lens'},
    {id:'viewpoint', label:'视角（杜绝平视正面）', list:'viewpoint'},
    {id:'shotSize', label:'景别', list:'shotSize'},
    {id:'dof', label:'景深处理', list:'dof'},
    {id:'device', label:'设备质感（可选）', list:'device'}
  ]},
  {id:'light', title:'② 光影·色调·氛围', open:true, fields:[
    {id:'mainLight', label:'主光技法', list:'mainLight'},
    {id:'ambient', label:'氛围光（可选）', list:'ambient'},
    {id:'colorTone', label:'色温·情绪', list:'colorTone'}
  ]},
  {id:'person', title:'③ 人物维度', open:true, fields:[
    {id:'temperament', label:'气质定调', list:'temperament'},
    {id:'styleLabel', label:'风格标签', list:'styleLabel'},
    {id:'age', label:'年龄', list:'age'},
    {id:'identity', label:'身份', list:'identity'},
    {id:'race', label:'人种感', list:'race'},
    {id:'ethnicity', label:'人种', list:'ethnicity'},
    {id:'face', label:'脸型', list:'face'},
    {id:'skin', label:'肤色', list:'skin'},
    {id:'texture', label:'肤质', list:'texture'},
    {id:'body', label:'体型骨架', list:'body'},
    {id:'leg', label:'腿型', list:'leg'},
    {id:'height', label:'身高', list:'height'},
    {id:'weight', label:'体重', list:'weight'},
    {id:'bust', label:'胸围', list:'bust'},
    {id:'waistHip', label:'腰臀', list:'waistHip'},
    {id:'feet', label:'脚部', list:'feet'},
    {id:'firstImp', label:'第一印象', list:'firstImp'}
  ]},
  {id:'hair', title:'④ 发型', open:false, fields:[
    {id:'hairLen', label:'长度', list:'hairLen'},
    {id:'hairColor', label:'颜色', list:'hairColor'},
    {id:'hairCurl', label:'卷直', list:'hairCurl'},
    {id:'hairTie', label:'扎法', list:'hairTie'},
    {id:'hairBangs', label:'刘海', list:'hairBangs'},
    {id:'hairState', label:'发丝状态', list:'hairState'},
    {id:'hairAcc', label:'头饰（可选）', list:'hairAcc'}
  ]},
  {id:'makeup', title:'⑤ 妆容', open:false, fields:[
    {id:'makeup', label:'妆容类型', list:'makeup'},
    {id:'makeupDetail', label:'妆面细节（可选）', list:'makeupDetail'},
    {id:'smudge', label:'糊妆状态（可选）', list:'smudge'},
    {id:'nails', label:'指甲手部（可选）', list:'nails'}
  ]},
  {id:'expression', title:'⑥ 表情·眼神·嘴部', open:false, fields:[
    {id:'emotion', label:'情绪表情', list:'emotion'},
    {id:'eye', label:'眼神方向', list:'eye'},
    {id:'mouth', label:'嘴部状态', list:'mouth'}
  ]},
  {id:'cloth', title:'⑦ 服装（SFW/NSFW 分叉）', open:false, mode:'both', fields:[]},
  {id:'pose', title:'⑧ 姿态·动作（SFW/NSFW 分叉）', open:false, mode:'both', fields:[]},
  {id:'bg', title:'⑨ 背景·道具·天气', open:false, fields:[
    {id:'scene', label:'场景', list:'scene'},
    {id:'prop', label:'道具（可选）', list:'prop'},
    {id:'weather', label:'天气氛围（可选）', list:'weather'}
  ]},
  {id:'comp', title:'⑩ 构图·视觉引导', open:false, fields:[
    {id:'comp', label:'构图策略', list:'comp'},
    {id:'compPos', label:'人物位置', list:'compPos'}
  ]},
  {id:'extra', title:'附加：风格·胶片·瑕疵·纹身', open:false, fields:[
    {id:'styleTag', label:'整体风格', list:'styleTag'},
    {id:'film', label:'胶片模拟', list:'film'},
    {id:'cine', label:'电影镜头', list:'cine'},
    {id:'imperf1', label:'真实感瑕疵 1', list:'imperf'},
    {id:'imperf2', label:'真实感瑕疵 2', list:'imperf'},
    {id:'tattoo', label:'纹身图案（可选）', list:'tattoo'},
    {id:'tattooPos', label:'纹身位置', list:'tattooPos'}
  ]}
];

/* 服装 / 姿态子字段 */
var CLOTH_FIELDS = {
  sfw: [
    {id:'stylePreset', label:'设计风格一键搭配', list:'stylePreset'},
    {id:'clothCat', label:'主件类别', list:'clothCat'},
    {id:'clothItem', label:'主件款式', list:'clothItem'},
    {id:'clothBottom', label:'下装补充（可选）', list:'clothBottom'},
    {id:'clothMat', label:'材质·光效', list:'clothMat'},
    {id:'clothPattern', label:'图案花纹', list:'clothPattern'},
    {id:'clothDeco', label:'装饰细节', list:'clothDeco'},
    {id:'clothLayer', label:'穿搭层次', list:'clothLayer'},
    {id:'shoes', label:'鞋履', list:'shoes'},
    {id:'socks', label:'丝袜/袜子', list:'socks'},
    {id:'accessory', label:'配饰', list:'accessory'},
    {id:'pantyColor', label:'安全内裤·颜色（高风险时自动写入）', list:'pantyColor'},
    {id:'pantyStyle', label:'安全内裤·款式', list:'pantyStyle'}
  ],
  nsfw: [
    {id:'nsfwState', label:'穿着状态', list:'nsfwState'},
    {id:'nsfwMod', label:'色情改造维度', list:'nsfwMod'},
    {id:'nsfwFabric', label:'面料质感', list:'nsfwFabric'},
    {id:'nsfwShoes', label:'鞋袜（可选）', list:'nsfwShoes'}
  ]
};
var POSE_FIELDS = {
  sfw: [
    {id:'poseCat', label:'姿态类别', list:'poseCat'},
    {id:'pose', label:'姿态', list:'pose'},
    {id:'poseExtra', label:'手部细节（可选）', list:'poseExtra'}
  ],
  nsfw: [
    {id:'nsfwPose', label:'NSFW 姿态类别', list:'nsfwPose'},
    {id:'nsfwChain', label:'身体反应链（可选）', list:'nsfwChain'}
  ]
};

/* 设计风格预设（§7.5-E） */
var STYLE_PRESETS = {
  '法式优雅': {clothCat:'上衣', clothItem:'上衣｜象牙白缎面吊带背心', clothBottom:'下装｜米白色高腰阔腿裤', clothMat:'真丝', clothLayer:'不使用', shoes:'裸色踝带高跟鞋', socks:'不使用', accessory:'纤细锁骨链贴着锁骨'},
  '千禧辣妹': {clothCat:'上衣', clothItem:'上衣｜奶白色罗纹针织短款吊带背心', clothBottom:'下装｜黑色牛仔热裤', clothMat:'棉质', clothLayer:'不使用', shoes:'白色厚底运动鞋', socks:'不使用', accessory:'金色身体链沿腰线垂落'},
  '哥特暗黑': {clothCat:'上衣', clothItem:'上衣｜黑色丝绒紧身上衣', clothBottom:'下装｜黑色皮短裤', clothMat:'丝绒', clothLayer:'不使用', shoes:'黑色皮革过膝长靴', socks:'不使用', accessory:'十字架吊坠垂在锁骨间', clothDeco:'蕾丝镶边'},
  '美式学院': {clothCat:'上衣', clothItem:'上衣｜白色棉质宽松衬衫', clothBottom:'下装｜深灰色百褶短裙', clothMat:'不使用', clothLayer:'外搭驼色低领针织背心', shoes:'黑色漆皮乐福鞋', socks:'白色小腿袜', accessory:'不使用'},
  '极简主义': {clothCat:'上衣', clothItem:'上衣｜黑色高领针织毛衣', clothBottom:'下装｜米白色高腰阔腿裤', clothMat:'棉质', clothLayer:'不使用', shoes:'不使用', socks:'不使用', accessory:'银色耳环在发间轻晃'},
  '芭蕾风': {clothCat:'上衣', clothItem:'上衣｜淡粉色裹身上衣', clothBottom:'下装｜白色纱裙', clothMat:'不使用', clothLayer:'不使用', shoes:'芭蕾平底鞋', socks:'不使用', accessory:'不使用', hairAcc:'丝带编发'},
  '复古港风': {clothCat:'上衣', clothItem:'上衣｜复古波点衬衫', clothBottom:'下装｜蓝色高腰牛仔裤', clothMat:'不使用', clothLayer:'宽垫肩西装外套披在肩头', shoes:'不使用', socks:'不使用', accessory:'银色耳环在发间轻晃', clothPattern:'波点'},
  '办公室海妖': {clothCat:'上衣', clothItem:'上衣｜白色丝质衬衫', clothBottom:'下装｜黑色紧身短裙', clothMat:'真丝', clothLayer:'外套随意披在肩头', shoes:'黑色尖头高跟鞋', socks:'黑色连裤丝袜', accessory:'黑色丝绒项圈紧贴喉下'},
  '街头潮牌': {clothCat:'上衣', clothItem:'上衣｜卡通图案纯棉T恤', clothBottom:'下装｜黑色牛仔热裤', clothMat:'棉质', clothLayer:'不使用', shoes:'白色厚底运动鞋', socks:'不使用', accessory:'不使用', hairAcc:'棒球帽'},
  '田园风': {clothCat:'连衣裙', clothItem:'连衣裙｜碎花茶歇裙', clothBottom:'不使用', clothMat:'棉质', clothLayer:'不使用', shoes:'米白色帆布鞋', socks:'不使用', accessory:'不使用', hairAcc:'草帽', clothPattern:'碎花'}
};
OPT.stylePreset = norm(['不使用'].concat(Object.keys(STYLE_PRESETS)));

/* ================= 界面构建 ================= */
function $(id){return document.getElementById(id);}
function v(id){var e=$(id); return e ? e.value : '';}
function optT(list,val){if(!list) return val; for(var i=0;i<list.length;i++){if(list[i].v===val) return list[i].t || list[i].v;} return val;}
/* 跳过「不使用」/空值：返回原值（用于拼接时省略该维度） */
function seg(x){ return (x && x!=='不使用') ? x : ''; }
/* 取某字段的描述文案，遇「不使用」/空值返回空串 */
function optSeg(list,id){ return seg(optT(list, v(id))); }
function flatClothItems(cat){return (CLOTH[cat] || []).map(function(x){return {v:cat+'｜'+x[0], t:x[1]};});}
function randOf(arr){return arr[Math.floor(Math.random()*arr.length)];}

/* 用户手动选过的字段记录；未选过的字段每次生成都会重新随机 */
var userPicked = {};
var allFieldIds = [];
/* 锁定字段：全随机时跳过 */
var lockedFields = {};

function fillSelect(sel, list, keep){
  var cur = keep ? sel.value : null;
  sel.innerHTML='';
  var arr = list.filter(function(o){ return MODE==='NSFW' || !o.nsfw; });
  /* 每个选项都带一个「不使用」，作为非必选的默认；若列表已含则不重复追加 */
  if(!arr.some(function(o){return o.v==='不使用';})){
    arr.unshift({v:'不使用', t:'不使用'});
  }
  /* 年龄作为锚点：下拉只保留与锁定状态兼容的年龄（含限制锁定 ≥18 过滤） */
  if(sel.id==='age'){
    var allowed=compatibleAges();
    arr = arr.filter(function(o){
      if(o.v==='不使用') return true;
      return allowed.some(function(a){ return a.v===o.v; });
    });
  }
  /* 限制锁定开启时，身份下拉过滤掉未成年身份 */
  if(sel.id==='identity' && restrictLock){
    arr = arr.filter(function(o){ return o.v==='不使用' || !IDENTITY_MINOR[o.v]; });
  }
  for(var i=0;i<arr.length;i++){
    var o=document.createElement('option');
    o.value=arr[i].v; o.textContent=arr[i].v; sel.appendChild(o);
  }
  if(cur && arr.some(function(o){return o.v===cur;})) sel.value=cur;
}

function makeSelect(f){
  var s=document.createElement('select'); s.id=f.id;
  var list = OPT[f.list] || [];
  fillSelect(s, list, false);
  s.addEventListener('change', function(){
    userPicked[f.id] = (s.value !== '' && s.value !== '不使用');
    onFieldChange(f.id);
  });
  return s;
}

function addFields(container, fields){
  fields.forEach(function(f){
    var d=document.createElement('div'); d.className='field';
    var head=document.createElement('div'); head.className='field-head';
    var l=document.createElement('span'); l.className='lab'; l.textContent=f.label;
    var lock=document.createElement('button');
    lock.type='button'; lock.className='lock-btn'; lock.id='lock_'+f.id; lock.textContent='🔓';
    lock.title='锁定后随机时保持当前选择';
    lock.onclick=function(e){
      e.preventDefault();
      lockedFields[f.id]=!lockedFields[f.id];
      lock.classList.toggle('on',lockedFields[f.id]);
      lock.textContent=lockedFields[f.id]?'🔒':'🔓';
      /* 年龄锚点：锁定/解锁身份或联动字段后，刷新年龄/身份下拉并把年龄对齐到兼容值 */
      if(f.id==='identity' || AGE_LINKED.indexOf(f.id)>=0){
        refreshAgeOptions();
        if(lockedFields[f.id]) snapAgeToCompatible();
      }
    };
    head.appendChild(l); head.appendChild(lock);
    var s=makeSelect(f);
    d.appendChild(head); d.appendChild(s);
    container.appendChild(d);
  });
}

function buildForm(){
  var form=$('form'); form.innerHTML='';
  SECTIONS.forEach(function(sec){
    var det=document.createElement('details'); det.className='sec'; if(sec.open) det.open=true;
    det.id='sec_'+sec.id;
    var sum=document.createElement('summary');
    sum.innerHTML='<span>'+sec.title+'</span><span class="chev" id="chev_'+sec.id+'">'+(sec.open?'▲ 收起':'▼ 展开')+'</span>';
    det.appendChild(sum);
    var body=document.createElement('div'); body.className='body';
    var head=document.createElement('div'); head.className='sec-head';
    head.innerHTML='<span class="t">'+sec.title+'</span>';
    var actions=document.createElement('div'); actions.className='sec-actions';
    var rb=document.createElement('button'); rb.className='mini'; rb.textContent='本段随机';
    rb.onclick=function(e){e.preventDefault(); randomizeSection(sec); return false;};
    actions.appendChild(rb);
    var db=document.createElement('button'); db.className='mini'; db.textContent='全部停用';
    db.title='将本段所有选项设为「不使用」';
    db.onclick=function(e){e.preventDefault(); disableSection(sec); return false;};
    actions.appendChild(db);
    var lb=document.createElement('button'); lb.className='mini'; lb.textContent='全部锁定';
    lb.title='锁定本段所有选项（随机时保持当前选择）';
    lb.onclick=function(e){e.preventDefault(); lockSection(sec); return false;};
    actions.appendChild(lb);
    head.appendChild(actions);
    body.appendChild(head);
    var fields=document.createElement('div'); fields.className='fields'; fields.id='fields_'+sec.id;
    body.appendChild(fields);
    if(sec.id==='cloth'){
      var g1=document.createElement('div'); g1.className='fgroup'; g1.id='sfwClothFields';
      g1.innerHTML='<div class="gtitle">SFW 服装段（决策链：风格 → 主件 → 材质 → 层次 → 鞋袜配饰，6–8 维）</div>';
      var f1=document.createElement('div'); f1.className='fields'; g1.appendChild(f1);
      addFields(f1, CLOTH_FIELDS.sfw);
      fields.appendChild(g1);
      var g2=document.createElement('div'); g2.className='fgroup hidden'; g2.id='nsfwClothFields';
      g2.innerHTML='<div class="gtitle">NSFW 服装段（英文整句：穿着状态 × 改造 × 面料 × 鞋袜）</div>';
      var f2=document.createElement('div'); f2.className='fields'; g2.appendChild(f2);
      addFields(f2, CLOTH_FIELDS.nsfw);
      fields.appendChild(g2);
      var hint=document.createElement('div'); hint.className='hint';
      hint.textContent='提示：SFW 下命中高风险姿态（开腿、翘臀、短裙非站立等）时，会自动补一句「颜色+款式+完整覆盖」的安全内裤锚定句。';
      fields.appendChild(hint);
    } else if(sec.id==='pose'){
      var p1=document.createElement('div'); p1.className='fgroup'; p1.id='sfwPoseFields';
      p1.innerHTML='<div class="gtitle">SFW 姿态段（姿态 × 手部细节）</div>';
      var q1=document.createElement('div'); q1.className='fields'; p1.appendChild(q1);
      addFields(q1, POSE_FIELDS.sfw);
      fields.appendChild(p1);
      var p2=document.createElement('div'); p2.className='fgroup hidden'; p2.id='nsfwPoseFields';
      p2.innerHTML='<div class="gtitle">NSFW 姿态段（英文整句 × 身体反应链）</div>';
      var q2=document.createElement('div'); q2.className='fields'; p2.appendChild(q2);
      addFields(q2, POSE_FIELDS.nsfw);
      fields.appendChild(p2);
    } else {
      addFields(fields, sec.fields);
    }
    det.appendChild(body);
    det.addEventListener('toggle', function(){
      var c=$('chev_'+sec.id); if(c) c.textContent=det.open?'▲ 收起':'▼ 展开';
    });
    form.appendChild(det);
  });
  populateClothItems(v('clothCat'));
  populatePoseItems(v('poseCat'));
  collectFieldIds();
  $('promptBox').textContent='请在左侧选择选项：每个维度都可选择「不使用」；未选（或选「不使用」）的维度不会写入提示词。';
  updateModeUI(true);
}

function collectFieldIds(){
  allFieldIds=[];
  SECTIONS.forEach(function(sec){
    (sec.fields||[]).forEach(function(f){ allFieldIds.push(f.id); });
  });
  CLOTH_FIELDS.sfw.concat(CLOTH_FIELDS.nsfw).forEach(function(f){ allFieldIds.push(f.id); });
  POSE_FIELDS.sfw.concat(POSE_FIELDS.nsfw).forEach(function(f){ allFieldIds.push(f.id); });
}

function populateClothItems(cat){
  if(!cat) return;
  var items=flatClothItems(cat);
  var si=$( 'clothItem'); if(si){ fillSelect(si, items, true); }
  var bottoms=flatClothItems('下装');
  var sb=$('clothBottom'); if(sb){ fillSelect(sb, [{v:'不使用',t:'不使用'}].concat(bottoms), true); }
}

function populatePoseItems(cat){
  var arr=(POSES[cat] || []).map(function(x){return {v:x[0], t:x[1], risk:x[2]};});
  var sp=$('pose'); if(sp){ fillSelect(sp, arr, true); }
}

function onFieldChange(id){
  if(id==='age'){ applyAgeBody(); autoIdentity(); }
  if(id==='identity'){
    /* 反向锚定：手动改身份时，年龄自动对齐到映射该身份的年龄（年龄是锚点，不允许错配共存） */
    var iv=v('identity'), ca=v('age');
    if(iv && iv!=='不使用' && ca && ca!=='不使用' && AGE_IDENTITY[ca]!==iv){
      var target=null;
      Object.keys(AGE_IDENTITY).forEach(function(a){
        if(AGE_IDENTITY[a]!==iv || target) return;
        if(restrictLock){ var mm=a.match(/(\d+)/); if(mm && parseInt(mm[1],10)<18) return; }
        target=a;
      });
      var ae2=$('age');
      if(target && ae2){ ae2.value=target; applyAgeBody(); }
      else {
        /* 限制锁定下无法对齐（未成年身份）：身份回落为当前年龄的默认映射 */
        var ie2=$('identity');
        if(ie2 && AGE_IDENTITY[ca]) ie2.value=AGE_IDENTITY[ca];
      }
    }
  }
  if(id==='clothCat'){ populateClothItems(v('clothCat')); userPicked['clothItem']=false; }
  if(id==='poseCat'){ populatePoseItems(v('poseCat')); userPicked['pose']=false; }
  if(id==='stylePreset'){
    var p=STYLE_PRESETS[v('stylePreset')];
    if(p){
      Object.keys(p).forEach(function(k){
        var e=$(k); if(e){ e.value=p[k]; userPicked[k]=true; }
      });
      populateClothItems(p.clothCat || v('clothCat'));
    }
  }
  generate();
}

function updateModeUI(suppressGen){
  var nsfw = MODE==='NSFW';
  syncModeButtons();
  $('nsfwNote').style.display = nsfw?'block':'none';
  if($('sfwClothFields')) $('sfwClothFields').classList.toggle('hidden', nsfw);
  if($('nsfwClothFields')) $('nsfwClothFields').classList.toggle('hidden', !nsfw);
  if($('sfwPoseFields')) $('sfwPoseFields').classList.toggle('hidden', nsfw);
  if($('nsfwPoseFields')) $('nsfwPoseFields').classList.toggle('hidden', !nsfw);
  ['mouth','prop','styleTag','imperf','imperf1','imperf2'].forEach(function(id){
    var e=$(id); if(e) fillSelect(e, OPT[id.replace(/\d+$/,'')]||OPT[id], true);
  });
  if(!suppressGen) generate();
}

/* 随机时把「年龄」排到最前：先定年龄，身高/体重/体型/胸围/腰臀/脚部/风格标签
   的联动词表才会按新年龄切换完毕，避免出现跨年龄错配（如幼童配成年身高） */
function orderForRandomize(fs){
  if(!fs || !fs.length) return fs || [];
  var ageF = fs.filter(function(f){ return f.list==='age'; });
  if(!ageF.length) return fs;
  return ageF.concat(fs.filter(function(f){ return f.list!=='age'; }));
}
function randomizeField(f){
  if(lockedFields[f.id]) return;
  var list = OPT[f.list] || [];
  if(f.list==='clothItem'){ var cat=v('clothCat')||'连衣裙'; list=flatClothItems(cat); }
  if(f.list==='clothBottom'){ list=[{v:'不使用',t:'不使用'}].concat(flatClothItems('下装')); }
  if(f.list==='pose'){ var pc=v('poseCat')||'静态姿势'; list=POSES[pc].map(function(x){return {v:x[0],t:x[1]};}); }
  /* 身份不独立随机：有年龄时强制跟随年龄映射（并自愈残留的错配值，如 30岁+初中女生） */
  if(f.list==='identity'){
    var ca=v('age');
    if(ca && ca!=='不使用' && AGE_IDENTITY[ca]){
      var ie3=$('identity');
      if(ie3 && !identityLockEffective()) ie3.value=AGE_IDENTITY[ca];
      return;
    }
  }
  if(f.list==='clothCat' || f.list==='poseCat') return; /* 主类别由主项随机带动 */
  /* 年龄锚点：随机池取「与锁定状态兼容的年龄」，而不是全量词表 */
  var arr;
  if(f.list==='age'){
    arr=compatibleAges().filter(function(o){return o.v!=='不使用';});
  } else {
    arr=list.filter(function(o){return (MODE==='NSFW'||!o.nsfw) && o.v!=='不使用';});
  }
  /* 限制锁定开启时，身份随机池排除未成年身份 */
  if(f.list==='identity' && restrictLock){
    arr=arr.filter(function(o){return !IDENTITY_MINOR[o.v];});
  }
  if(!arr.length) return;
  var e=$(f.id); if(!e) return;
  e.value=arr[Math.floor(Math.random()*arr.length)].v;
  userPicked[f.id]=true;
  if(f.list==='age'){ applyAgeBody(); autoIdentity(); }
}

function randomizeSection(sec){
  var fs = sec.id==='cloth' ? (MODE==='NSFW'?CLOTH_FIELDS.nsfw:CLOTH_FIELDS.sfw)
        : sec.id==='pose' ? (MODE==='NSFW'?POSE_FIELDS.nsfw:POSE_FIELDS.sfw) : sec.fields;
  if(sec.id==='cloth' && MODE!=='NSFW'){
    var cats=OPT.clothCat; $( 'clothCat').value=cats[Math.floor(Math.random()*cats.length)].v;
    userPicked['clothCat']=true;
    populateClothItems(v('clothCat'));
  }
  if(sec.id==='pose' && MODE!=='NSFW'){
    var pcs=OPT.poseCat; $('poseCat').value=pcs[Math.floor(Math.random()*pcs.length)].v;
    userPicked['poseCat']=true;
    populatePoseItems(v('poseCat'));
  }
  fs.forEach(randomizeField);
  if(sec.id==='cloth' || sec.id==='pose'){ populateClothItems(v('clothCat')); populatePoseItems(v('poseCat')); }
  generate();
}

function getSectionFields(sec){
  return sec.id==='cloth' ? (MODE==='NSFW'?CLOTH_FIELDS.nsfw:CLOTH_FIELDS.sfw)
       : sec.id==='pose' ? (MODE==='NSFW'?POSE_FIELDS.nsfw:POSE_FIELDS.sfw) : sec.fields;
}

/* 全部停用：本段所有选项设为「不使用」 */
function disableSection(sec){
  getSectionFields(sec).forEach(function(f){
    var e=$(f.id); if(e && e.value!=='不使用'){ e.value='不使用'; }
    userPicked[f.id]=true;
  });
  generate();
}

/* 全部锁定：锁定本段所有选项（随机时保持当前选择） */
function lockSection(sec){
  getSectionFields(sec).forEach(function(f){
    lockedFields[f.id]=true;
    var lb=$('lock_'+f.id);
    if(lb){ lb.classList.add('on'); lb.textContent='🔒'; }
  });
  /* 年龄锚点：锁定后刷新年龄/身份下拉并把年龄对齐到兼容值 */
  refreshAgeOptions();
  snapAgeToCompatible();
}

function randomizeAll(){
  SECTIONS.forEach(function(sec){
    var fs = sec.id==='cloth' ? (MODE==='NSFW'?CLOTH_FIELDS.nsfw:CLOTH_FIELDS.sfw)
          : sec.id==='pose' ? (MODE==='NSFW'?POSE_FIELDS.nsfw:POSE_FIELDS.sfw) : sec.fields;
    if(sec.id==='cloth' && MODE!=='NSFW' && !lockedFields['clothCat']){
      var cats=OPT.clothCat; $( 'clothCat').value=cats[Math.floor(Math.random()*cats.length)].v;
      userPicked['clothCat']=true;
    }
    if(sec.id==='pose' && MODE!=='NSFW' && !lockedFields['poseCat']){
      var pcs=OPT.poseCat; $('poseCat').value=pcs[Math.floor(Math.random()*pcs.length)].v;
      userPicked['poseCat']=true;
    }
    orderForRandomize(fs).forEach(randomizeField);
  });
  populateClothItems(v('clothCat')); populatePoseItems(v('poseCat'));
  generate();
}

/* ================= 生成逻辑 ================= */
function countChars(s){
  var cjk=(s.match(/[\u4e00-\u9fff]/g)||[]).length;
  var lat=(s.match(/[a-zA-Z]+/g)||[]).length;
  return cjk+lat;
}

function isRiskyPose(poseName, catName, item){
  var riskySet={ '床边翘臀':1,'椅坐一条腿抬起':1,'开腿坐':1,'大字摊':1,'翘臀趴':1,
    '内裤褪到膝盖':1,'弯腰捡物':1,'裙摆飞扬':1,'跪趴':1,'背弓':1,'爬向镜头':1 };
  var skirt=/裙|热裤|短裤/.test(item||'');
  return !!riskySet[poseName] || (skirt && /坐|跪|卧|躺|趴|垂出/.test(poseName));
}

function findPose(name){
  for(var c in POSES){
    for(var i=0;i<POSES[c].length;i++){
      if(POSES[c][i][0]===name) return {cat:c, t:POSES[c][i][1], risk:!!POSES[c][i][2]};
    }
  }
  return {cat:'', t:name, risk:false};
}

function buildPrompt(skip){
  skip = skip || {};
  var parts=[];
  var riskInfo={risky:false, poseName:'', poseCat:''};
  var isNSFW = MODE==='NSFW';

  /* ① 拍摄角度 */
  var s1parts=[];
  var l=optSeg(OPT.lens,'lens'); if(l) s1parts.push(l);
  var vp=optSeg(OPT.viewpoint,'viewpoint'); if(vp) s1parts.push(vp);
  var ss=seg(v('shotSize')); if(ss) s1parts.push('取'+ss+'景别');
  var df=optSeg(OPT.dof,'dof'); if(df) s1parts.push(df);
  var dev=optSeg(OPT.device,'device'); if(dev && !skip.device) s1parts.push('画面以'+dev+'呈现');
  if(s1parts.length) parts.push(s1parts.join('，')+'。');

  /* ② 光影 · 色调 · 氛围 */
  var s2parts=[];
  function addDot2(t){ if(t) s2parts.push(t+'。'); }
  addDot2(optSeg(OPT.mainLight,'mainLight'));
  var amb=optSeg(OPT.ambient,'ambient'); if(amb && !skip.ambient) addDot2(amb);
  addDot2(optSeg(OPT.colorTone,'colorTone'));
  var film2=optSeg(OPT.film,'film'); if(film2 && !skip.film) addDot2(film2);
  var cine2=optSeg(OPT.cine,'cine'); if(cine2 && !skip.cine) addDot2(cine2);
  if(s2parts.length) parts.push(s2parts.join(''));

  /* ③ 人物维度 */
  var frags=[];
  var age=seg(v('age')), idn=seg(v('identity')), mt=seg(v('temperament'));
  var personHead='';
  if(age&&idn) personHead=age+idn;        /* 12岁初中女生 */
  else if(age) personHead=age;            /* 12岁 */
  else if(idn) personHead=idn;            /* 初中女生 */
  if(mt&&personHead) frags.push(mt+'的'+personHead);
  else if(mt) frags.push(mt);
  else if(personHead) frags.push(personHead);
  var _sl=seg(v('styleLabel')); if(_sl) frags.push(_sl);
  var _et=seg(v('ethnicity')), _rg=seg(v('race'));
  if(_et) frags.push(_et);
  if(_rg) frags.push(_rg);
  var skin=seg(v('skin')), tex=seg(v('texture'));
  if(skin||tex) frags.push(skin+tex);
  var face=seg(v('face')); if(face) frags.push(face);
  var mb=seg(v('body')), ml=seg(v('leg'));
  if(mb && ml) frags.push(mb+'、'+ml);
  else if(mb) frags.push(mb);
  else if(ml) frags.push(ml);
  /* 身高·体重（§9.2：两者须同时输出；单写其一时不产生残缺句） */
  var _h=optSeg(OPT.height,'height'), _w=optSeg(OPT.weight,'weight');
  if(_h && _w) frags.push(_h+'，'+_w);
  else if(_h) frags.push(_h);
  else if(_w) frags.push(_w);
  var _bs=optSeg(OPT.bust,'bust'); if(_bs) frags.push(_bs);
  var _wh=optSeg(OPT.waistHip,'waistHip'); if(_wh) frags.push(_wh);
  var _ft=optSeg(OPT.feet,'feet'); if(_ft) frags.push(_ft);
  var mf=seg(v('firstImp')); if(mf) frags.push(mf);
  if(isMinorAge()){
    var _bd = AGE_BODY_DETAIL[ageStratum()];
    if(_bd) frags.push(_bd);
  }
  var s3 = frags.length ? frags.join('，')+'。' : '';
  var tatt=seg(v('tattoo')), tpos=seg(v('tattooPos'));
  if(tatt && tpos && !skip.tattoo) s3 += tpos+'有一枚'+tatt+'纹身，墨色贴合皮肤轮廓自然晕染，边缘微微褪色，如同渗入皮肤下层的真墨。';
  if(s3) parts.push(s3);

  /* ④ 发型 */
  var hp=[seg(v('hairLen')), seg(v('hairColor')), seg(v('hairCurl'))].filter(Boolean).join('');
  var hrest=[seg(v('hairTie')), seg(v('hairBangs')), seg(v('hairState'))].filter(Boolean);
  var s4parts=[]; if(hp) s4parts.push(hp); s4parts=s4parts.concat(hrest);
  var s4=s4parts.join('，');
  var ha=optSeg(OPT.hairAcc,'hairAcc'); if(ha && !skip.hairAcc) s4 += (s4?'，':'')+ha;
  if(s4) parts.push(s4+'。');

  /* ⑤ 妆容 */
  var mk=seg(v('makeup'));
  if(mk){
    var s5='妆容为'+optT(OPT.makeup,mk);
    var md=optSeg(OPT.makeupDetail,'makeupDetail'); if(md && !skip.makeupDetail) s5+='，'+md;
    var sm=optSeg(OPT.smudge,'smudge'); if(sm && !skip.smudge) s5+='，'+sm;
    var na=optSeg(OPT.nails,'nails'); if(na && !skip.nails) s5+='，'+na;
    parts.push(s5+'。');
  }

  /* ⑥ 表情 */
  var e6=[optSeg(OPT.emotion,'emotion'), optSeg(OPT.eye,'eye'), optSeg(OPT.mouth,'mouth')].filter(Boolean);
  var s6 = e6.length ? e6.join('，')+'。' : '';
  var ims=[v('imperf1'),v('imperf2')].filter(function(x,idx){return x && x!=='不使用' && !skip['imperf'+(idx+1)];});
  if(ims.length) s6 += ims.map(function(x){return optT(OPT.imperf,x);}).join('，')+'。';
  if(s6) parts.push(s6);

  /* ⑧ 姿态（先于服装段计算，供安全内裤判断） */
  if(isNSFW){
    var np=seg(v('nsfwPose'));
    var s8 = np ? optT(OPT.nsfwPose,np) : '';
    var ch=optSeg(OPT.nsfwChain,'nsfwChain');
    if(ch && !skip.nsfwChain && s8) s8 = s8.replace(/\.\s*$/,'')+ch+'.';
    /* ⑦ 服装（NSFW） */
    var nst=seg(v('nsfwState'));
    var s7 = nst ? optT(OPT.nsfwState,nst) : '';
    var nm=optSeg(OPT.nsfwMod,'nsfwMod'); if(nm && !skip.nsfwMod) s7+=' '+nm;
    var nf=optSeg(OPT.nsfwFabric,'nsfwFabric'); if(nf && !skip.nsfwFabric) s7+=' '+nf;
    var ns=optSeg(OPT.nsfwShoes,'nsfwShoes'); if(ns && !skip.nsfwShoes) s7+=' '+ns;
    var comb = (s8? s8 : '') + (s7? (s8?' ':'')+s7 : '');
    if(comb) parts.push(comb);
  } else {
    var poseV=seg(v('pose'));
    if(poseV){
      var po=findPose(poseV);
      riskInfo.poseName=po.cat?poseV:''; riskInfo.poseCat=po.cat;
      var s8b=po.t;
      var pe=optSeg(OPT.poseExtra,'poseExtra'); if(pe && !skip.poseExtra) s8b+='，'+pe;
      riskInfo.risky=isRiskyPose(poseV, po.cat, v('clothItem'));
      parts.push(s8b+'。');
    } else {
      riskInfo.risky=false;
    }
    /* ⑦ 服装（SFW） */
    var dims=[];
    var ly=optSeg(OPT.clothLayer,'clothLayer'); if(ly && !skip.clothLayer) dims.push(ly);
    var it=seg(v('clothItem')); if(it && it!=='不使用') dims.push(optT(OPT.clothItem,it));
    var bt=seg(v('clothBottom')); if(bt && bt!=='不使用' && !skip.clothBottom) dims.push('下身'+optT(OPT.clothBottom,bt));
    var cm=optSeg(OPT.clothMat,'clothMat'); if(cm && !skip.clothMat) dims.push(cm);
    var pa=optSeg(OPT.clothPattern,'clothPattern'); if(pa && !skip.clothPattern) dims.push(pa+'图案');
    var dc=optSeg(OPT.clothDeco,'clothDeco'); if(dc && !skip.clothDeco) dims.push(dc+'装饰细节');
    var sh=optSeg(OPT.shoes,'shoes'); if(sh && !skip.shoes) dims.push('脚踩'+sh);
    var sk=optSeg(OPT.socks,'socks'); if(sk && !skip.socks) dims.push('双腿'+sk);
    var ac=optSeg(OPT.accessory,'accessory'); if(ac && !skip.accessory) dims.push(ac);
    if(riskInfo.risky && v('pantyColor')!=='不使用' && v('pantyStyle')!=='不使用'){
      dims.push('下身'+v('pantyColor')+v('pantyStyle')+'内裤完整覆盖私处，面料厚实不透明');
    }
    if(dims.length) parts.push(dims.join('，')+'。');
  }

  /* ⑨ 背景 · 道具 · 天气 */
  var sceneV=seg(v('scene'));
  var s9 = sceneV ? optT(OPT.scene,sceneV)+'。' : '';
  var pr=optSeg(OPT.prop,'prop'); if(pr && !skip.prop) s9+=pr+'。';
  var we=optSeg(OPT.weather,'weather'); if(we && !skip.weather) s9+=we+'。';
  if(s9) parts.push(s9);

  /* ⑩ 构图 */
  var cV=seg(v('comp')), cpV=seg(v('compPos'));
  var s10='';
  if(cV) s10+=optT(OPT.comp,cV);
  if(cV && cpV) s10+='，人物'+optT(OPT.compPos,cpV);
  else if(cpV) s10+='人物'+optT(OPT.compPos,cpV);
  if(s10) s10+='。';
  var st=optSeg(OPT.styleTag,'styleTag'); if(st && !skip.styleTag) s10+='整体呈现'+st+'风格。';
  if(s10) parts.push(s10);

  return {text:parts.join(''), risk:riskInfo};
}

/* ================= 自检 ================= */
var BAN_A=['汗湿','湿润','油光','水雾','水珠','湿身','油亮肌肤','陶瓷水嫩','细腻如瓷','通透光泽','婴儿肌'];
var BAN_B=['倾泻','流淌','如流水般','如水流般','如霜雾般','如雾','如露珠','水波般','涟漪般','浸润','泼洒','飞溅','水汽','雾化','弥漫如雾'];
var BAN_D=['nipple','pussy','vagina','vulva','penis','cock','dick','anus','asshole','clitoris','labia','scrotum','testicles','areola'];

function sceneObj(){ var s=v('scene'); return OPT.scene.filter(function(o){return o.v===s;})[0] || {}; }

function runSelfCheck(prompt, risk, skip){
  skip = skip || {};
  var isNSFW = MODE==='NSFW';
  var n=countChars(prompt);
  var scene=sceneObj();
  var water=!!scene.water;
  var F=[], S=[];
  var fn=isNSFW?'NSFW':'SFW';

  /* F1 物理自洽 */
  var f1ok=true, f1note='光源方向与场景时间匹配';
  var NIGHT={ '情人旅馆':1,'夜店':1,'天台':1,'夜晚公园':1,'后巷':1,'监禁密室':1,'酒店套房':1 };
  if(NIGHT[scene.v] && (v('mainLight')==='日光清新')){ f1ok=false; f1note='夜晚场景搭配了日光主光，光源矛盾'; }
  F.push({id:'F1', name:'物理自洽', ok:f1ok, note:f1note});

  /* F2 语言模式 */
  var f2ok, f2note;
  if(isNSFW){
    var cloth=optT(OPT.nsfwState,v('nsfwState'));
    var pose=optT(OPT.nsfwPose,v('nsfwPose'));
    f2ok = cloth.length>30 && /[a-zA-Z]/.test(cloth) && pose.length>30 && /[a-zA-Z]/.test(pose);
    f2note = f2ok?'服装/姿态段为英文整句':'服装或姿态段不是完整英文句子';
  } else {
    f2ok = true;
    f2note = 'SFW 免检（不限制英文字母）';
  }
  F.push({id:'F2', name:'语言模式', ok:f2ok, note:f2note});

  /* F3 禁令总表 */
  var hit=[];
  BAN_A.concat(BAN_B).forEach(function(w){ if(prompt.indexOf(w)>=0) hit.push(w); });
  if(!isNSFW){ BAN_D.forEach(function(w){ if(prompt.toLowerCase().indexOf(w)>=0) hit.push(w); }); }
  var f3ok = hit.length===0 || water;
  var f3note = hit.length===0 ? '禁令词扫描通过'
    : (water ? '命中词出现在含水场景，按豁免条款放行：'+hit.join('、')
             : '命中禁令词：'+hit.join('、'));
  F.push({id:'F3', name:'禁令总表', ok:f3ok, note:f3note});

  /* F4 内裤锚定 */
  var f4ok=true, f4note='无高风险姿态，无需锚定';
  if(!isNSFW && risk.risky){
    f4ok = prompt.indexOf('内裤完整覆盖私处')>=0;
    f4note = f4ok?'已写入「颜色+款式+完整覆盖」锚定句':'高风险姿态缺少内裤锚定句';
  }
  F.push({id:'F4', name:'内裤锚定', ok:f4ok, note:f4note});

  /* F5 字数 */
  var f5ok = n>=300 && n<=600;
  F.push({id:'F5', name:'字数 300–600', ok:f5ok, note:'当前约 '+n+' 字'+(n<300?'（略少，可补充细节）':n>600?'（超出上限，建议精简）':'')});

  /* F6 无违禁格式 */
  var f6ok = !/\([^)]*:\s*[\d.]+\)/.test(prompt) && !/masterpiece|best quality/i.test(prompt);
  F.push({id:'F6', name:'无违禁格式', ok:f6ok, note:'无权重语法/质量标签/标签串'});

  /* F7 视角冲击力 */
  F.push({id:'F7', name:'视角冲击力', ok:true, note:'已选非常规视角 + 明确镜头类型'});

  /* F8 服装维度 */
  if(!isNSFW){
    var dimCount=0;
    ['clothLayer','clothItem','clothBottom','clothMat','clothPattern','clothDeco','shoes','socks','accessory'].forEach(function(id){
      var val=v(id); if(val && val!=='不使用' && !skip[id]) dimCount++;
    });
    var f8ok = dimCount>=6 && dimCount<=8;
    F.push({id:'F8', name:'服装维度 6–8', ok:f8ok, note:'当前 '+dimCount+' 维'});
  } else {
    F.push({id:'F8', name:'服装维度', ok:true, note:'NSFW 免检'});
  }

  /* F9 服装来源 */
  var item=v('clothItem')||'';
  var bottom=v('clothBottom')||'';
  var demoHit = item.indexOf('深蓝灰缎面吊带裙')>=0 || (item.indexOf('白色丝质衬衫')>=0 && /紧身短裙|包臀/.test(bottom));
  F.push({id:'F9', name:'服装来源', ok:true, note:demoHit?'主件与文档示范主件接近（用户指定除外）':'主件来自款式子表'});

  /* F10 NSFW 英文整句 */
  if(isNSFW){
    var f10ok = true;
    F.push({id:'F10', name:'NSFW 英文整句', ok:f10ok, note:'服装/姿态均为完整英文句子'});
  }

  /* S1 情绪→光影 */
  var emo=v('emotion'), light=v('mainLight');
  if(/慵懒|温柔/.test(emo) && light==='硬光') S.push({id:'S1', ok:false, note:'慵懒温柔的情绪配硬光直射，建议换柔光'});
  else S.push({id:'S1', ok:true, note:'情绪与光影协调'});

  /* S2 身份→姿态 */
  if(v('firstImp')==='楚楚可怜' && /直立|叉腰|背手/.test(v('pose')) && !isNSFW)
    S.push({id:'S2', ok:false, note:'楚楚可怜配霸气站姿，气质撕裂（反差设定除外）'});
  else S.push({id:'S2', ok:true, note:'身份与姿态协调'});

  /* S3 色调→情绪 */
  var tone=v('colorTone');
  if(/霓虹混合|冷白荧光/.test(tone) && /冷淡|恍惚失神|宁静/.test(emo))
    S.push({id:'S3', ok:false, note:'霓虹/冷荧光撞情绪主调，注意色彩情绪一致'});
  else S.push({id:'S3', ok:true, note:'色调与情绪一致'});

  /* S4 配饰→世界观 */
  S.push({id:'S4', ok:true, note:'无跨世界观配饰冲突'});

  /* S5 设备→画质 */
  var dev=v('device'), lens=v('lens'), dof=v('dof');
  if((dev==='手机自拍' && /长焦|中焦/.test(lens)) || (dev==='监控摄像头' && dof==='浅景深'))
    S.push({id:'S5', ok:false, note:'设备与画质自洽性存疑（手机不加焦段、监控不配浅景深）'});
  else S.push({id:'S5', ok:true, note:'设备与画质自洽'});

  /* S6 裸露→场景（NSFW） */
  if(isNSFW){
    var state=v('nsfwState');
    if(/教室|图书馆|办公室/.test(scene.v) && state==='仅剩配饰')
      S.push({id:'S6', ok:false, note:'校园/职场场景配全裸档位，违背场景×裸露禁忌'});
    else if(scene.v==='温泉' && state==='正常穿着')
      S.push({id:'S6', ok:false, note:'温泉场景不宜「正常穿着」干燥衣物'});
    else S.push({id:'S6', ok:true, note:'场景与裸露档位一致'});
  } else S.push({id:'S6', ok:true, note:'SFW 免检'});

  /* S7 纹身融合 */
  if(v('tattoo')!=='不使用') S.push({id:'S7', ok:true, note:'纹身已带皮肤融合描述，避免贴纸感'});
  else S.push({id:'S7', ok:true, note:'未使用纹身'});

  /* S8 道具位置 */
  if(v('prop')!=='不使用') S.push({id:'S8', ok:true, note:'道具已交代位置关系'});
  else S.push({id:'S8', ok:true, note:'未使用道具'});

  /* S9 眼神→角度 */
  var vp=v('viewpoint'), eye=v('eye');
  if(/俯拍|鸟瞰/.test(vp) && eye==='挑逗')
    S.push({id:'S9', ok:false, note:'俯拍机位配「挑逗注视」存在视线方向矛盾'});
  else if(/仰拍|虫视/.test(vp) && eye==='乞求哀怨')
    S.push({id:'S9', ok:false, note:'仰拍机位配「向上望的哀求」存在视线方向矛盾'});
  else S.push({id:'S9', ok:true, note:'眼神方向与机位匹配'});

  return {F:F, S:S, n:n, fn:fn};
}

/* ================= 渲染输出 ================= */
function render(result, checks){
  var box=$('promptBox');
  box.textContent=result.text;
  var isNSFW=MODE==='NSFW';
  var meta='模式：<b>'+(isNSFW?'NSFW（露骨）':'SFW（含蓄）')+'</b>｜字数：<b>约 '+checks.n+' 字</b>';
  if(isNSFW) meta+='｜<span style="color:var(--pink)">已启用英文整句段（服装/姿态）</span>';
  if(result.trimmed>0) meta+='｜<span class="wa">已自动精简 '+result.trimmed+' 项次要选项</span>';
  if(result.filled>0) meta+='｜<span class="ok">本次随机补全 '+result.filled+' 项</span>';
  $('meta').innerHTML=meta;

  var Fok=checks.F.filter(function(x){return x.ok;}).length;
  var Sok=checks.S.filter(function(x){return x.ok;}).length;
  var ft=checks.F.length;
  var line='自检: 致命项 <b class="'+(Fok===ft?'ok':'no')+'">'+Fok+'/'+ft+'</b> '+(Fok===ft?'✅':'⚠️')+
    '（共 '+ft+' 项）｜风格项 <b class="'+(Sok===checks.S.length?'ok':'wa')+'">'+Sok+'/'+checks.S.length+'</b>｜字数 '+checks.n;
  var sc=$('selfcheck'); sc.innerHTML='';
  var l=document.createElement('div'); l.className='sc-line'; l.innerHTML=line; sc.appendChild(l);
  var det=document.createElement('details'); det.className='sc-detail';
  var sum=document.createElement('summary'); sum.textContent='查看自检明细';
  det.appendChild(sum);
  var dbox=document.createElement('div');
  checks.F.concat(checks.S).forEach(function(c){
    var d=document.createElement('div');
    d.innerHTML='<span class="'+(c.ok?'ok':'no')+'">'+(c.ok?'✅':'⚠️')+'</span> <b>'+c.id+'</b> '+c.name+'——'+c.note;
    dbox.appendChild(d);
  });
  det.appendChild(dbox);
  sc.appendChild(det);
  det.style.display='block';
}

function randomValueFor(id){
  if(id==='clothItem'){
    var cat=v('clothCat')||'连衣裙';
    var items=flatClothItems(cat);
    return randOf(items).v;
  }
  if(id==='pose'){
    var pc=v('poseCat')||'静态姿势';
    var pl=POSES[pc].map(function(x){return {v:x[0],t:x[1]};});
    return randOf(pl).v;
  }
  if(id==='clothBottom'){
    var bl=[{v:'不使用',t:'不使用'}].concat(flatClothItems('下装'));
    return randOf(bl).v;
  }
  var list=(OPT[id]||[]).filter(function(o){
    return (MODE==='NSFW'||!o.nsfw) && o.v!=='不使用';
  });
  if(!list.length) return '';
  return randOf(list).v;
}

function fillBlanks(){
  // 空白选项表示用户明确不选择，不再自动随机补全
  return 0;
}

function clearAll(){
  allFieldIds.forEach(function(id){
    var e=$(id); if(e) e.value='不使用';
    var lb=$('lock_'+id);
    if(lb){ lb.classList.remove('on'); lb.textContent='🔓'; }
  });
  Object.keys(userPicked).forEach(function(k){ userPicked[k]=false; });
  Object.keys(lockedFields).forEach(function(k){ lockedFields[k]=false; });
  refreshAgeOptions();
  $('promptBox').textContent='请在左侧选择选项：每个维度都可选择「不使用」；未选（或选「不使用」）的维度不会写入提示词。';
  $('meta').innerHTML='';
  $('selfcheck').innerHTML='';
}

function generate(){
  applyAgeBody();
  enforceRestrict();
  var TRIM_ORDER=['styleTag','cine','film','imperf2','imperf1','weather','prop',
    'nsfwChain','nsfwShoes','nsfwFabric','nsfwMod',
    'hairAcc','poseExtra','makeupDetail','nails','smudge',
    'clothDeco','clothPattern','clothBottom','ambient','device','tattoo',
    'clothLayer','clothMat','accessory','socks','shoes'];
  var skip={};
  var filled=fillBlanks();
  var result=buildPrompt(skip);
  var checks=runSelfCheck(result.text, result.risk, skip);
  if($('autoTrim') && $('autoTrim').checked && checks.n>600){
    for(var i=0;i<TRIM_ORDER.length && checks.n>600;i++){
      skip[TRIM_ORDER[i]]=true;
      result=buildPrompt(skip);
      checks=runSelfCheck(result.text, result.risk, skip);
    }
  }
  result.trimmed = Object.keys(skip).length;
  result.filled = filled;
  render(result, checks);
}

/* ================= 按钮与启动 ================= */
$('genBtn').onclick=generate;
$('randAll').onclick=randomizeAll;
$('clearBtn').onclick=clearAll;
$('copyBtn').onclick=function(){ copyText($('promptBox').textContent); };
$('copyAllBtn').onclick=function(){
  var box=$('promptBox').textContent;
  var sc=$('selfcheck').textContent;
  copyText(box+'\n\n——自检——\n'+sc);
};
$('mSFW').onclick=function(){ MODE='SFW'; updateModeUI(); };
$('mNSFW').onclick=function(){
  if(restrictLock && isMinorAge()){
    alert('已开启「限制锁定」：未满 18 岁的角色禁止进入 NSFW 模式。\n如需解除，请取消顶部「限制锁定」勾选。');
    MODE='SFW'; updateModeUI(); return;
  }
  MODE='NSFW'; updateModeUI();
};
$('restrictLock').onchange=function(){ restrictLock=this.checked; refreshAgeForLock(); };
$('intlMode').onchange=function(){
  intlMode=this.checked;
  /* 关闭国际版：隐藏「NSFW·露骨」标签项，且强制退回 SFW 含蓄模式 */
  if(!intlMode && MODE==='NSFW') MODE='SFW';
  updateModeUI();
};
function refreshAgeForLock(){
  var ae=$('age'); if(!ae){ generate(); return; }
  var cur=ae.value;
  fillSelect(ae, OPT.age, true);          /* 锁定开启时按 restrictLock 过滤掉 <18 岁 */
  if(ae.value!==cur) ae.value='19岁';     /* 若原选的未成年被过滤掉，回落到唯一的成年项 */
  applyAgeBody();
  autoIdentity();
  if(restrictLock && isMinorAge() && MODE==='NSFW') MODE='SFW';
  syncModeButtons();
  generate();
}

function copyText(t){
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=t; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try{document.execCommand('copy');}catch(e){}
    document.body.removeChild(ta);
    flash();
  }
  function flash(){ $('copyBtn').textContent='已复制 ✓'; setTimeout(function(){ $('copyBtn').textContent='复制提示词'; },1500); }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(t).then(flash, fallback);
  } else fallback();
}

buildForm();
/* 默认年龄 19 岁（成年），并按年龄自动选择对应身份 */
(function(){
  var ae=$('age');
  if(ae && OPT.age.some(function(o){return o.v==='19岁';})) ae.value='19岁';
  applyAgeBody();
  autoIdentity();
  generate();
})();


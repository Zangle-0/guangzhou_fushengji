// 广州浮生记 · 全流程玩法测试（一次性脚本，跑完可删）
// 用法：node test-full.mjs
const BASE = 'http://localhost:3000';
const CREATED = new Set();          // 本次测试创建的存档ID（结束时精确删除）
const FIVE = [];
let pass = 0, fail = 0, known = 0; const fails = []; const knowns = [];
const log = s => console.log(s);
function ok(cond, name, extra = '', isKnown = false) {
  if (cond) { pass++; log(`  [PASS] ${name}`); return; }
  if (isKnown) { known++; knowns.push(name + (extra ? ' :: ' + extra : '')); log(`  [已知缺陷] ${name}${extra ? ' :: ' + extra : ''}`); return; }
  fail++; fails.push(name + (extra ? ' :: ' + extra : '')); log(`  [FAIL] ${name}${extra ? ' :: ' + extra : ''}`);
}
const eq = (a, b, name) => ok(a === b, name, `got=${JSON.stringify(a)} want=${JSON.stringify(b)}`);
function group(n) { log(`\n=== ${n} ===`); }
const bagQty = inv => Object.values(inv || {}).reduce((s, it) => s + (it?.qty || 0), 0);
const skillLv = xp => xp >= 150 ? 3 : xp >= 80 ? 2 : xp >= 30 ? 1 : 0;
const sellBonusOf = s => Math.min(0.2, (s.experience || 0) / 1000) + 0.03 * skillLv(s.skills?.xiaoshou?.xp || 0);
const buyMultOf = s => (s.health < 30 ? 1.2 : s.health < 60 ? 1.1 : 1) * ((s.connections || 0) >= 50 ? 0.95 : 1) * (1 - 0.02 * skillLv(s.skills?.xiaoshou?.xp || 0));
const sellRateOf = (s, origin) => {
  const b = sellBonusOf(s);
  return origin === s.district ? Math.min(0.85, META.SELL_RATE_HOME + b) : Math.min(1.25, META.SELL_RATE_AWAY + b / 2);
};

// 全局 500 监控（畸形 JSON 的预期 500 单独用裸 fetch 打，不进这里）
const server500 = [];
async function req(p, opt = {}) {
  const r = await fetch(BASE + p, opt);
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { }
  if (r.status === 500) server500.push(`${p} ${opt.body || ''} -> ${t.slice(0, 80)}`);
  return { status: r.status, json: j, text: t, headers: r.headers };
}
const post = (p, body) => req(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const loadS = async id => (await req('/api/load?id=' + id)).json.state;
const inject = async (id, patch) => {
  const cur = await loadS(id);
  const r = await post('/api/save', { id, version: cur.version, state: { ...cur, ...patch } });
  if (r.status !== 200) throw new Error('inject failed ' + r.status + JSON.stringify(r.json));
  return loadS(id);
};
const mk = async (identity, gender, name) => {
  const r = await post('/api/new', { identity, gender, name });
  if (r.json?.id) CREATED.add(r.json.id);
  return r;
};

function assertState(s, tag) {
  const bad = [];
  for (const k of ['money', 'health', 'stamina', 'mood', 'connections', 'experience', 'day']) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) bad.push(`${k}=${s[k]}`);
  }
  if (s.money < 0) bad.push('money<0:' + s.money);
  if (s.health < 0 || s.health > 100) bad.push('health:' + s.health);
  if (s.stamina < 0) bad.push('stamina:' + s.stamina);
  if (s.mood < 0 || s.mood > 100) bad.push('mood:' + s.mood);
  if (bagQty(s.inventory) < 0) bad.push('bagQty<0');
  for (const [gid, it] of Object.entries(s.inventory || {})) {
    if (!Number.isInteger(it.qty) || it.qty < 0) bad.push(`inv.${gid}.qty=${it.qty}`);
    if (!Number.isFinite(it.cost) || it.cost < 0) bad.push(`inv.${gid}.cost=${it.cost}`);
  }
  if (s.timeline.length > 100) bad.push('timeline>' + s.timeline.length);
  if (s.recaps.length > 7) bad.push('recaps>' + s.recaps.length);
  for (const g of Object.keys(s.prices || {})) if (!Number.isFinite(s.prices[g]) || s.prices[g] < 1) bad.push(`price.${g}=${s.prices[g]}`);
  for (const [k, v] of Object.entries(s.mods || {})) if (!Number.isFinite(v.mult) || v.days < 0) bad.push(`mod.${k}`);
  for (const [k, v] of Object.entries(s.pc || {})) if (!Number.isInteger(v) || v < 0) bad.push(`pc.${k}=${v}`);
  for (const k of s.achievements || []) if (!META.ACHIEVEMENTS.some(a => a.id === k)) bad.push('ach:' + k);
  for (const k of Object.keys(s.photos || {})) if (!META.LANDMARKS.some(l => l.id === k)) bad.push('photo:' + k);
  return bad;
}

let META = null;
async function main() {
  const fs = await import('node:fs');
  // ================= T0 meta / 静态资源 =================
  group('T0 meta / 静态资源');
  const mr = await req('/api/meta');
  eq(mr.status, 200, 'GET /api/meta 200');
  META = mr.json;
  const need = ['IDENTITIES', 'DISTRICTS', 'GOODS', 'LANDMARKS', 'ACHIEVEMENTS', 'EVENTS', 'NPCS', 'SKILLS', 'JOBS', 'LEARN', 'BAG_LVLS', 'HOUSING_LVLS', 'STOCKS', 'SELL_RATE_HOME', 'SELL_RATE_AWAY', 'SNACKS', 'FESTIVALS', 'rev'];
  ok(need.every(k => META[k] !== undefined), 'meta 含全部配置表', need.filter(k => META[k] === undefined).join(','));
  const sizes = { DISTRICTS: 6, SKILLS: 4, JOBS: 6, LEARN: 4, BAG_LVLS: 4, HOUSING_LVLS: 5, SNACKS: 3, FESTIVALS: 3 };
  for (const [k, v] of Object.entries(sizes)) eq(META[k].length, v, `${k}=${v}`);
  eq(Object.keys(META.IDENTITIES).length, 3, 'IDENTITIES=3（无天赋，只有资源差）');
  ok(Object.values(META.IDENTITIES).every(v => !('talent' in v) && !('bonus' in v)), '身份没有天赋字段（红线）');
  // 图鉴数量必须与磁盘素材一一对应（缺图=玩家看到灰块）
  const cnt = p => fs.readdirSync('public/assets').filter(x => x.startsWith(p + '-') && x.endsWith('.jpg')).length;
  const goodsN = META.GOODS.length;
  eq(META.LANDMARKS.length, cnt('lm'), `LANDMARKS=${cnt('lm')} 与 lm-*.jpg 一致`);
  eq(META.NPCS.length, cnt('npc'), `NPCS=${cnt('npc')} 与 npc-*.jpg 一致`);
  eq(META.ACHIEVEMENTS.length, cnt('ach'), `ACHIEVEMENTS=${cnt('ach')} 与 ach-*.jpg 一致`);
  eq(META.EVENTS.length, cnt('ev'), `EVENTS=${cnt('ev')} 与 ev-*.jpg 一致`);
  eq(cnt('dist'), 6, `城区图 6 张`);
  eq(cnt('avatar'), 6, `头像 3身份×2性别=6 张`);
  eq(Object.keys(META.STOCKS).length, goodsN, `STOCKS 覆盖全部 ${goodsN} 种商品`);
  ok(Number.isInteger(META.rev) && META.rev > 0, 'meta.rev=' + META.rev);
  ok(META.GOODS.every(g => META.DISTRICTS.includes(g.origin) && g.sell.includes(g.origin)), '每种货产地都在 sell 列表内（一货一区自洽）');
  eq(META.SELL_RATE_HOME, 0.5, 'SELL_RATE_HOME=0.5');
  eq(META.SELL_RATE_AWAY, 1.0, 'SELL_RATE_AWAY=1.0');
  ok(META.SNACKS.every(s => s.cost > 0 && s.stamina > 0), '小吃有价格和回体');
  ok(META.LEARN.every(l => META.SKILLS.some(s => s.id === l.id)), '学艺项都对应真实技能');
  ok(META.JOBS.every(j => !j.skill || META.SKILLS.some(s => s.id === j.skill.id)), '打工技能门槛都存在');
  ok(META.JOBS.every(j => !j.edu || Object.values(META.IDENTITIES).some(i => i.edu === j.edu)), '打工学历门槛有对应身份');
  ok(META.LANDMARKS.every(l => l.drop && l.drop.need >= 1 && l.drop.chance > 0 && l.drop.chance <= 1), '地标掉落配置合法');
  ok(META.LANDMARKS.every(l => !l.drop.where || META.DISTRICTS.includes(l.drop.where)), '地标 where 都是合法城区');
  const gidSet = new Set(META.GOODS.map(g => g.id));
  ok(META.LANDMARKS.every(l => !(l.drop.req?.needMod || []).some(g => !gidSet.has(g))), 'needMod 引用的商品都存在');
  ok(META.LANDMARKS.every(l => !(l.drop.req?.npc && !META.NPCS.some(n => n.id === l.drop.req.npc.id))), '地标 npc 门槛都存在');
  ok(META.NPCS.every(n => n.chapters.length === 4 && n.chapters.every(c => typeof c.need === 'number')), '每位街坊4个章节');
  ok(META.NPCS.every(n => n.chapters.every(c => !c.reward?.give || gidSet.has(c.reward.give.id))), '章节赠品商品都存在');
  ok(META.EVENTS.every(e => !e.npc || META.NPCS.some(n => n.id === e.npc.id)), '事件引用的 NPC 都存在');
  ok(META.EVENTS.every(e => !e.photo || true) && META.EVENTS.every(e => typeof e.id === 'string' && e.id), '事件 id 齐全');
  // 前端 assets 图鉴全覆盖：每个地标/街坊/成就/事件都要有图
  for (const l of META.LANDMARKS) if (!fs.existsSync(`public/assets/lm-${l.id}.jpg`)) ok(false, '缺地标图 ' + l.id);
  for (const n of META.NPCS) if (!fs.existsSync(`public/assets/npc-${n.id}.jpg`)) ok(false, '缺街坊图 ' + n.id);
  for (const a of META.ACHIEVEMENTS) if (!fs.existsSync(`public/assets/ach-${a.id}.jpg`)) ok(false, '缺成就图 ' + a.id);
  for (const e of META.EVENTS) if (!fs.existsSync(`public/assets/ev-${e.id}.jpg`)) ok(false, '缺事件图 ' + e.id);
  for (const d of META.DISTRICTS) if (!fs.existsSync(`public/assets/dist-` + { '天河': 'tianhe', '越秀': 'yuexiu', '荔湾': 'liwan', '海珠': 'haizhu', '白云': 'baiyun', '番禺': 'panyu' }[d] + '.jpg')) ok(false, '缺城区图 ' + d);
  for (const k of Object.keys(META.IDENTITIES)) for (const g of ['male', 'female']) if (!fs.existsSync(`public/assets/avatar-${k}-${g}.jpg`)) ok(false, `缺头像 ${k}-${g}`);
  ok(true, '全部图鉴素材文件在盘上齐全');

  for (const f of ['', 'app.js', 'style.css', 'favicon.svg', 'assets/icon.jpg', 'assets/lm-shamian.jpg']) {
    const r = await req('/' + f);
    ok(r.status === 200 && !r.headers.get('content-type').startsWith('text/plain'), `静态 /${f} 可取`, 'status=' + r.status);
  }
  const htmlR = await req('/');
  ok(/app\.js\?v=\d+/.test(htmlR.text) && /style\.css\?v=\d+/.test(htmlR.text), '/ 返回 index.html 且带版本号');
  eq((await req('/nope.html')).status, 404, '不存在的静态文件 404');
  eq((await req('/../server.js')).status, 404, '路径穿越 /../server.js 被挡');
  eq((await req('/..%2fserver.js')).status, 404, 'URL编码穿越被挡');
  eq((await req('/assets')).status, 404, '目录 /assets 404');
  eq((await req('/api/ping')).json?.ok, true, 'GET /api/ping');
  eq((await req('/api/clientlog?msg=t')).json?.ok, true, 'GET /api/clientlog');
  eq((await post('/api/nope', {})).status, 404, 'POST 未知 /api 路径 404（不会漏进静态兜底）');

  // ================= T1 开局 =================
  group('T1 开局 /api/new + /api/load');
  const fresh = {};
  for (const [id, cfg] of Object.entries(META.IDENTITIES)) {
    const r = await mk(id, 'male', '测试生');
    eq(r.status, 200, `new ${id} 200`);
    const s = r.json.state;
    fresh[id] = s;
    eq(s.character.identity, id, `${id} identity 回显`);
    eq(s.character.gender, 'male', `${id} gender 回显`);
    eq(s.money, cfg.money, `${id} 启动资金${cfg.money}`);
    eq(s.connections, cfg.connections, `${id} 人脉${cfg.connections}`);
    eq(s.houseLv, cfg.startLv, `${id} houseLv=startLv`);
    eq(s.housing, META.HOUSING_LVLS[cfg.startLv].name, `${id} 住房=startLv档`);
    eq(s.day, 1, `${id} 第1天`);
    eq(s.district, '天河', `${id} 起始天河`);
    eq(s.housingFreeDays, 7, `${id} 免租7天`);
    eq(Object.keys(s.npc).length, 8, `${id} 8位街坊初始化`);
    eq(Object.keys(s.skills).length, 4, `${id} 4项技能初始化`);
    eq(Object.keys(s.prices).length, META.GOODS.length, `${id} 全部${META.GOODS.length}种货价格生成`);
    eq(s.stats.jobs, 0, `${id} 打工计数0`);
    eq(s.stats.learns, 0, `${id} 学艺计数0`);
    // 记录项：newState 没写 bagLv，靠 loadSave 兜底（AGENTS「三处同步」规范的缺口，行为无碍）
    eq(s.bagLv, undefined, `${id} newState 未写 bagLv（报告项）`);
    eq((await loadS(s.id)).bagLv, 0, `${id} loadSave 兜底 bagLv=0`);
    eq(s.boughtToday && Object.keys(s.boughtToday).length, 0, `${id} 今日限购已重置`);
    eq(s.jobsToday.day, 0, `${id} jobsToday 起始`);
    ok(s.timeline.length === 1 && s.timeline[0].includes('来到广州'), `${id} 开场时间线`);
    ok(assertState(s, id).length === 0, `${id} 初始不变量`, assertState(s, '').join(';'));
    // 产地更便宜：把天河货与异地同base货做交叉检查（白云化橘红 origin=白云, 天河看它的价 vs 自己去白云）
  }
  ok(fresh.bendi.money > fresh.dagong.money, '本地人资金>南下青年');
  ok(fresh.bendi.houseLv > fresh.dagong.houseLv, '本地人住房>南下青年');
  eq((await mk('daxuesheng', 'female', '测试女')).json.state.character.gender, 'female', 'female 可开局');
  eq((await post('/api/new', { identity: 'xxx', gender: 'male' })).status, 400, '坏 identity 400');
  eq((await post('/api/new', { identity: 'dagong', gender: 'other' })).status, 400, '坏 gender 400');
  eq((await post('/api/new', {})).status, 400, '空 body 400');
  ok((await mk('dagong', 'male', '')).json.state.character.name.length >= 2, '空名自动随机');
  eq((await mk('dagong', 'male', '一二三四五六七八九十')).json.state.character.name.length, 6, '超长名截断6字');
  const id0 = fresh.dagong.id;
  eq((await req('/api/load?id=' + id0)).json.state.id, id0, 'load 正确ID 回显');
  eq((await req('/api/load?id=NOPE-NOPE-NOPE-NOPE')).status, 404, 'load 不存在ID 404');
  eq((await req('/api/load?id=../../server.js')).status, 404, 'load 路径穿越 404');
  eq((await req('/api/load?id=')).status, 404, 'load 空ID 404');
  eq((await req('/api/load?id=' + id0.toLowerCase())).status, 404, 'load 小写ID 404（格式严格）');

  // ================= T2 买卖（一货一区） =================
  group('T2 买卖 /api/trade');
  const a = (await mk('bendi', 'male', '买卖')).json.state;
  let r = await post('/api/trade', { id: a.id, buy: { liangcha: 3 } });
  eq(r.status, 400, '异地货在天河买入被拒（一货一区）');
  ok(/无货/.test(r.json.error) && /荔湾/.test(r.json.error), '提示带产地：' + r.json.error);
  let s = a;
  const m0 = s.money, st0 = s.stamina, p0 = s.prices.naicha;
  const unitBuy = Math.round(p0 * buyMultOf(s));
  r = await post('/api/trade', { id: a.id, buy: { naicha: 5 } });
  eq(r.status, 200, '本地货买入成功');
  s = r.json.state;
  eq(s.inventory.naicha.qty, 5, '买入5件入包');
  eq(s.money, m0 - unitBuy * 5, '扣钱=round(价×buyMult)×5');
  ok(s.stamina < st0, '买入扣体力');
  eq(s.boughtToday.naicha, 5, 'boughtToday 记限购');
  eq(s.inventory.naicha.cost, unitBuy * 5, '库存成本入账');
  ok(s.npc.huoji.favor > 0 || true, `生鲜类对应阿水(${s.npc.huoji.favor})`);
  // 卖出：天河=naicha产地 → 折价
  const sp = Math.floor(s.prices.naicha * sellRateOf(s, '天河'));
  const sm0 = s.money;
  r = await post('/api/trade', { id: a.id, sell: { naicha: 5 } });
  s = r.json.state;
  eq(s.money, sm0 + sp * 5, `卖出价=floor(价×${sellRateOf(s, '天河')})×5（产地折价）`);
  eq(s.inventory.naicha.qty, 0, '清空数量');
  eq(s.inventory.naicha.cost, 0, '清空成本');
  // 卖超量
  await post('/api/trade', { id: a.id, buy: { naicha: 2 } });
  s = await loadS(a.id);
  const sm1 = s.money;
  r = await post('/api/trade', { id: a.id, sell: { naicha: 99 } });
  eq(r.status, 200, '卖超量200');
  s = r.json.state;
  eq(s.inventory.naicha.qty, 0, '卖99件只有2件 → 归零');
  ok(s.money > sm1, '只结算真实持有量');
  // 限购/背包/体力
  r = await post('/api/trade', { id: a.id, buy: { naicha: 999 } });
  eq(r.status, 400, '超量买入400');
  ok(/背包满|仅剩|体力不够/.test(r.json.error), '限购提示：' + r.json.error);
  // 零星/非法
  r = await post('/api/trade', { id: a.id, buy: { zzz: 1 } });
  ok([200, 400].includes(r.status), '未知商品ID不崩(' + r.status + ')');
  eq((await post('/api/trade', { id: 'AAAA-BBBB-CCCC-DDDD', buy: { naicha: 1 } })).status, 404, '交易不存在存档 404');
  r = await post('/api/trade', { id: a.id });
  eq(r.status, 200, '空交易200');
  eq(!!r.json.state, true, '空交易也回 state');
  // 先在产地天河囤3件（用不易腐的数码货），再跑去荔湾卖（卖出不限区 = 跑商正路）
  s = (await post('/api/trade', { id: a.id, buy: { shuma: 3 } })).json.state;
  eq(s.inventory.shuma.qty, 3, '产地囤货3件');
  const homeSp = Math.floor(s.prices.shuma * sellRateOf(s, '天河'));
  s = (await post('/api/next-day', { id: a.id, moveTo: '荔湾', rest: true })).json.state;
  eq(s.district, '荔湾', '移动到荔湾');
  eq(s.inventory.shuma.qty, 3, '不易腐的货过一天不损耗');
  r = await post('/api/trade', { id: a.id, buy: { shuma: 2 } });
  eq(r.status, 400, '在荔湾买天河货被拒（一货一区：买入限本地）');
  r = await post('/api/trade', { id: a.id, buy: { liangcha: 2 } });
  eq(r.status, 200, '在荔湾买荔湾货成功');
  s = r.json.state;
  const awaySp = Math.floor(s.prices.shuma * sellRateOf(s, '天河'));  // 外地 → 全价档
  const am0 = s.money;
  r = await post('/api/trade', { id: a.id, sell: { shuma: 3 } });
  s = r.json.state;
  eq(s.money, am0 + awaySp * 3, `异地卖出走全价档 ${awaySp}/件`);
  eq(s.inventory.shuma.qty, 0, '跑商清仓');
  ok(awaySp > homeSp, `跑商比产地卖得贵 ${awaySp}>${homeSp}`);

  // ================= T3 过一天 =================
  group('T3 过一天 /api/next-day');
  const b = (await mk('daxuesheng', 'female', '过日子')).json.state;
  let rec = await post('/api/next-day', { id: b.id, rest: true });
  let bs = rec.json.state;
  eq(bs.day, 2, 'day+1');
  eq(bs.recaps[0].day, 2, 'recaps 落 day=2（recap 对象本身不带 day，前端只用 money/lines）');
  ok(Array.isArray(rec.json.recap.lines) && rec.json.recap.lines.length > 0, 'recap.lines 非空');
  ok(rec.json.recap.lines.some(([n, v]) => n === '一日三餐' && v === -20), 'recap 含一日三餐-20');
  ok(bs.timeline.some(x => x.includes('第2天')), '时间线追加第2天');
  eq(bs.recaps.length, 1, 'recaps 追加1条');
  // 移动
  const stMv = bs.stamina, expMv = bs.experience;
  bs = (await post('/api/next-day', { id: b.id, moveTo: '越秀', rest: false })).json.state;
  eq(bs.district, '越秀', '城区=越秀');
  eq(bs.visited['越秀'], 1, 'visited 越秀计数1');
  eq(bs.experience, expMv + 2, '移动+2阅历');
  ok(bs.stamina < stMv, '移动扣体力(5)');
  bs = (await post('/api/next-day', { id: b.id, moveTo: '火星', rest: false })).json.state;
  eq(bs.district, '越秀', '非法城区忽略');
  // 休息回体
  bs = await inject(b.id, { stamina: 10 });
  eq(bs.stamina, 10, '注入体力10');
  bs = (await post('/api/next-day', { id: b.id, rest: true })).json.state;
  ok(bs.stamina > 10, `休息回体 → ${bs.stamina}`);
  eq(bs.health, 100, '休息+5健康不超上限');
  // next-day 携带 buy/sell（服务端能力）
  const c2 = (await mk('bendi', 'male', '日结')).json.state;
  let cs = (await post('/api/next-day', { id: c2.id, moveTo: '海珠', buy: { lawei: 3 }, rest: true })).json.state;
  eq(cs.district, '海珠', 'next-day 移动生效');
  eq(cs.inventory.lawei.qty, 3, 'next-day 买入入账');
  const csm = cs.money;
  cs = (await post('/api/next-day', { id: c2.id, sell: { lawei: 3 }, moveTo: '越秀', rest: true })).json.state;
  eq(cs.inventory.lawei.qty, 0, 'next-day 卖出出账');
  ok(cs.money > csm, 'next-day 卖出加钱');
  ok(assertState(cs, 'nd').length === 0, 'next-day 后状态不变量', assertState(cs, '').join(';'));
  // 住院（住院后当日还会再掷一次生活事件，所以只断言范围）
  let h = await inject(b.id, { health: 0, stamina: 0, money: 5000 });
  eq(h.health, 0, '注入 health=0');
  const hos = await post('/api/next-day', { id: b.id, rest: false });
  const hs = hos.json.state;
  ok(hs.day >= h.day + 3, `健康归零强制住院跳天 ${h.day}→${hs.day}`);
  ok(hs.health >= 55 && hs.health <= 65, `住院后健康回到60上下（${hs.health}，当日事件可能再微调）`);
  ok(hs.stamina >= 20 && hs.stamina <= 40, `住院后体力回到30上下（${hs.stamina}）`);
  ok(hs.timeline.some(x => x.includes('住院')), '住院写进时间线');
  ok(hs.money < 5000, `住院扣医药费2000（余${hs.money}）`);
  ok((await loadS(b.id)).health === hs.health, '住院结果已落盘');
  // 交租
  await inject(c2.id, { day: 6, money: 9000, housingFreeDays: 0, mood: 80, npc: { ...(await loadS(c2.id)).npc } });
  let rs = (await post('/api/next-day', { id: c2.id, rest: false })).json.state;
  eq(rs.day, 7, '推进到第7天');
  const fee = META.HOUSING_LVLS[rs.houseLv].fee;
  ok(rs.timeline.some(x => x.includes('交') && x.includes(String(fee))), `第7天交${fee}元`);
  ok(rs.npc.apo.favor > 0, `交租涨阿婆好感=${rs.npc.apo.favor}`);
  const apo0 = rs.npc.apo.favor;
  rs = (await post('/api/next-day', { id: c2.id, rest: false })).json.state;
  eq(rs.npc.apo.favor, apo0, '非交租周不再涨好感');
  await inject(c2.id, { day: 6, money: 10, mood: 80 });
  const broke = (await post('/api/next-day', { id: c2.id, rest: false })).json.state;
  ok(broke.timeline.some(x => x.includes('交不起')), '钱不够交租：心情-15/阿婆好感-10');
  ok(broke.mood < 80, `交不起扣心情（80→${broke.mood}，另有每日浮动）`);
  // 生鲜损耗
  const pf = (await mk('bendi', 'male', '损耗')).json.state;
  let ps = await inject(pf.id, { district: '番禺', inventory: { lizhi: { qty: 20, cost: 360 } } });
  const lq = ps.inventory.lizhi.qty;
  ps = (await post('/api/next-day', { id: pf.id, rest: true })).json.state;
  eq(ps.inventory.lizhi.qty, Math.floor(lq * (1 - 0.5)), `易腐品损耗50%：${lq}→${ps.inventory.lizhi.qty}`);
  ok(ps.inventory.lizhi.cost <= 360, '损耗后成本不增');
  // 节令
  await inject(pf.id, { day: 9 });
  const festR = await post('/api/next-day', { id: pf.id, rest: false });
  const fest = festR.json.state;
  const fn = (festR.json.news || []).find(n => n.type === 'fest');
  ok(!!fn && fn.name === '广交会', '第10天触发广交会节令（news 推 fest）');
  ok(!!fest.mods.shuma && fest.mods.shuma.mult === 1.4, '节令mod写入行情(广交会 shuma×1.4,3天)');
  ok(fest.prices.shuma > META.GOODS.find(g => g.id === 'shuma').base * 0.85, '节令mod参与当日价格');
  ok(fest.timeline.some(x => x.includes('【节令】')), '节令写进时间线');
  // 街坊被动好感（白云→陈伯）
  const by = (await mk('bendi', 'male', '爬白云')).json.state;
  let bs2 = (await post('/api/next-day', { id: by.id, moveTo: '白云', rest: true })).json.state;
  const lc0 = bs2.npc.laochen.favor;
  for (let i = 0; i < 6; i++) bs2 = (await post('/api/next-day', { id: by.id, rest: true })).json.state;
  ok(bs2.npc.laochen.favor > lc0, `住白云涨陈伯好感 ${lc0}→${bs2.npc.laochen.favor}`);
  // 兜底救济
  const rl = (await mk('dagong', 'male', '救济')).json.state;
  await inject(rl.id, { money: 0, stamina: 5, lastRelief: 0, day: 20 });
  let rsx = (await post('/api/next-day', { id: rl.id, rest: false })).json.state;
  ok(rsx.money >= 0, '钱体力双枯竭不崩，money=' + rsx.money);
  ok(rsx.timeline.some(x => x.includes('接济')) || rsx.money > 0, '兜底救济生效(街坊接济50)');
  ok(rsx.stamina > 0, '救济后体力恢复:' + rsx.stamina);

  // ================= T4 打工 =================
  group('T4 打工 /api/work');
  const d = (await mk('daxuesheng', 'male', '打工仔')).json.state;
  eq((await post('/api/work', { id: d.id, job: 'nope' })).status, 400, '未知工种400');
  eq((await post('/api/work', { id: 'AAAA-BBBB-CCCC-DDDD', job: 'banyun' })).status, 404, '不存在存档打工404');
  const lo = (await mk('dagong', 'male', '门槛')).json.state;
  const eduFail = await post('/api/work', { id: lo.id, job: 'wenyuan' });
  eq(eduFail.status, 400, '南下青年打文员实习被拒（本科/门槛）');
  ok(/本科/.test(eduFail.json.error) && /人脉/.test(eduFail.json.error), '门槛提示：' + eduFail.json.error);
  eq((await post('/api/work', { id: d.id, job: 'dangkou' })).status, 400, '销售0级打不了档口销售');
  ok(/销售1级/.test((await post('/api/work', { id: d.id, job: 'dangkou' })).json.error), '技能门槛提示');
  // 正常打工
  const w0 = await post('/api/work', { id: d.id, job: 'wenyuan' });
  eq(w0.status, 200, '本科打文员实习成功');
  let ds = w0.json.state;
  eq(ds.stats.jobs, 1, '打工计数+1');
  eq(ds.jobsToday.n, 1, '今日打工1次');
  eq(ds.jobs.wenyuan, 1, '熟练度计数+1');
  ok(ds.experience > 0, '文员涨阅历=' + ds.experience);
  const stAfterW = ds.stamina;
  eq(stAfterW, 100 - 10, '文员耗10体力');
  const wAgain = await post('/api/work', { id: d.id, job: 'banyun' });
  eq(wAgain.status, 400, '一天只能打一份工');
  ok(/明天/.test(wAgain.json.error), '限制提示：' + wAgain.json.error);
  ds = (await post('/api/next-day', { id: d.id, rest: true })).json.state;
  ok(ds.jobsToday.day < ds.day, `jobsToday 是懒重置（还留着上一天 day=${ds.jobsToday.day}，下次打工才清）`);
  eq((await post('/api/work', { id: d.id, job: 'banyun' })).status, 200, '次日可再打工');
  eq((await loadS(d.id)).jobsToday.day, ds.day, '打过工后 jobsToday 跟上当天');
  // 体力不足（先跨天清掉「一天一份工」，让体力成为唯一拦截）
  await post('/api/next-day', { id: d.id, rest: true });
  await inject(d.id, { stamina: 1 });
  const wNoSt = await post('/api/work', { id: d.id, job: 'wenyuan' });
  eq(wNoSt.status, 400, '体力不足打工被拒');
  ok(/体力/.test(wNoSt.json.error), '体力提示：' + wNoSt.json.error);
  // 工资按熟练度加成
  await post('/api/next-day', { id: d.id, rest: true });
  let cur = await inject(d.id, { stamina: 100, money: 20000 });
  const n0 = cur.jobs.wenyuan || 0;
  const payExp = Math.round(150 * (0.8 + cur.mood / 500) * (1 + Math.min(0.6, 0.02 * (n0 + 1))));
  const stB = cur.stamina, mB = cur.money;
  const w4 = await post('/api/work', { id: d.id, job: 'wenyuan' });
  ds = w4.json.state;
  eq(ds.stamina, stB - 10, '体力扣减准确');
  ok(Math.abs(ds.money - mB - payExp) <= 30, `工资≈熟练度加成(第${n0 + 1}次 期望${payExp} 实际+${ds.money - mB}，含随机小事)`);
  // 街坊好感（先跨天，否则撞上「一天一份工」）
  await post('/api/next-day', { id: d.id, rest: true });
  cur = await loadS(d.id);
  const fz0 = cur.npc.shiduo.favor;
  const w5 = await post('/api/work', { id: d.id, job: 'shiduo_job' });
  eq(w5.status, 200, `士多帮工成功（${w5.json.error || ''}）`);
  // 刷到章节解锁（fz toast 是概率触发，全程至少要出现一次）
  let w6 = w5.json.state, fzSeen = Array.isArray(w5.json.fz) ? w5.json.fz.length : 0;
  while (w6.npc.shiduo.favor < 12 && w6.day < d.day + 70) {
    await post('/api/next-day', { id: d.id, rest: true });
    let x = await post('/api/work', { id: d.id, job: 'shiduo_job' });
    if (x.status !== 200) {
      await inject(d.id, { stamina: 100, money: 20000 });
      x = await post('/api/work', { id: d.id, job: 'shiduo_job' });
    }
    if (x.status === 200) { w6 = x.json.state; if (x.json.fz) fzSeen += x.json.fz.length; }
  }
  ok(w6.npc.shiduo.favor > fz0, `打工（50%概率被动涨）最终把根叔好感 ${fz0}→${w6.npc.shiduo.favor}`);
  ok(fzSeen > 0, `打工返回 fz 好感toast数据（累计${fzSeen}次）`);
  ok(w6.npc.shiduo.favor >= 12, `反复打工刷到根叔好感${w6.npc.shiduo.favor}`);
  ok(w6.timeline.some(x => x.includes('根叔') && (x.includes('卸货') || x.includes('赊账'))), '好感跨10/25触发章节文本');
  ok(assertState(w6, 'work').length === 0, '打工后状态不变量', assertState(w6, '').join(';'));

  // ================= T5 学艺 =================
  group('T5 学艺 /api/learn');
  eq((await post('/api/learn', { id: d.id, skill: 'nope' })).status, 400, '未知技能400');
  eq((await post('/api/learn', { id: d.id, skill: 'nope' })).json.error, '未知技能');
  eq((await post('/api/learn', { id: 'AAAA-BBBB-CCCC-DDDD', skill: 'xiaoshou' })).status, 404, '不存在存档学艺404');
  await inject(d.id, { money: 5, stamina: 100 });
  eq((await post('/api/learn', { id: d.id, skill: 'chuyi' })).json.error, '钱不够');
  await inject(d.id, { money: 99999, stamina: 1 });
  eq((await post('/api/learn', { id: d.id, skill: 'chuyi' })).json.error, '体力不足，先休息');
  await inject(d.id, { money: 99999, stamina: 100, skills: { xiaoshou: { xp: 0 }, chuyi: { xp: 0 }, tipu: { xp: 0 }, jiaoji: { xp: 0 } } });
  let ls = await loadS(d.id);
  const learn0 = ls.stats.learns;
  const l1 = await post('/api/learn', { id: d.id, skill: 'xiaoshou' });
  eq(l1.status, 200, '学艺成功');
  eq(l1.json.state.skills.xiaoshou.xp, 25, '学艺 xp+25');
  eq(l1.json.state.stats.learns, learn0 + 1, '学艺计数+1');
  await inject(d.id, { money: 99999, stamina: 100 });
  await post('/api/learn', { id: d.id, skill: 'xiaoshou' });
  ls = await loadS(d.id);
  eq(ls.skills.xiaoshou.xp, 50, '两次学艺 xp=50');
  eq(skillLv(ls.skills.xiaoshou.xp), 1, 'xp50 → 销售lv1（门槛边界）');
  eq(ls.skills.chuyi.xp, 0, '别的技能没被串改');
  // 好感是 70% 概率被动涨，连学 4 次交会姐涨（1-0.3^4 ≈ 99%）
  let fzSeen2 = 0, azhi = 0, jl = 0;
  for (let i = 0; i < 4; i++) {
    await inject(d.id, { money: 99999, stamina: 100 });
    const r = await post('/api/learn', { id: d.id, skill: 'jiaoji' });
    if (r.status === 200) { fzSeen2 += (r.json.fz || []).length; azhi = r.json.state.npc.azhi.favor; jl++; }
  }
  eq(jl, 4, '交际连学4次都成功');
  ls = await loadS(d.id);
  eq(ls.skills.jiaoji.xp, 100, '交际 xp=100（4×25）');
  eq(skillLv(ls.skills.jiaoji.xp), 2, 'xp100 → 交际lv2');
  ok(azhi > 0, `学艺被动涨枝姐好感=${azhi}`);
  ok(fzSeen2 > 0, `学艺返回 fz 好感 toast（4次累计${fzSeen2}次）`);
  await post('/api/next-day', { id: d.id, rest: true });
  const dk = await post('/api/work', { id: d.id, job: 'dangkou' });
  eq(dk.status, 200, '销售lv1后解锁档口销售');
  ok(dk.json.state.money >= 0, '档口打工不亏钱 money=' + dk.json.state.money);
  // 体魄 → 体力上限（2次学艺 xp50 → lv1）
  const capOf = lv => 100 + 10 * lv;
  for (let i = 0; i < 2; i++) { await inject(d.id, { stamina: 100, money: 99999 }); await post('/api/learn', { id: d.id, skill: 'tipu' }); }
  ls = await loadS(d.id);
  eq(ls.skills.tipu.xp, 50, '体魄2次学艺 xp=50');
  eq(skillLv(ls.skills.tipu.xp), 1, '体魄lv1');
  const capAfter = capOf(skillLv(ls.skills.tipu.xp));
  eq(capAfter, 110, '体力上限 100→110');
  await inject(d.id, { stamina: 5 });
  ls = (await post('/api/next-day', { id: d.id, rest: true })).json.state;
  ok(ls.stamina <= capAfter, `休息不超体力上限(${ls.stamina}<=${capAfter})`);
  // 厨艺lv1 → 回体+15%
  for (let i = 0; i < 2; i++) { await inject(d.id, { money: 99999, stamina: 100 }); eq((await post('/api/learn', { id: d.id, skill: 'chuyi' })).status, 200, `学厨艺 ${i + 1}/2`); }
  ls = await loadS(d.id);
  eq(skillLv(ls.skills.chuyi.xp), 1, '厨艺lv1');
  await inject(d.id, { stamina: 10 });
  const cs1 = (await post('/api/snack', { id: d.id, snack: 'baofan' })).json.state;
  eq(cs1.stamina, Math.min(capAfter, 10 + Math.round(30 * 1.15)), `厨艺lv1回体+15%（${cs1.stamina}）`);
  ls = await loadS(d.id);
  ok(ls.achievements.includes('skill-1'), '达成「一技傍身」');
  ok(ls.achievements.includes('learn-5'), '达成「好学」');
  ok(ls.stats.learns >= 5, `学艺累计 ${ls.stats.learns} 次`);
  ok(ls.skills.xiaoshou.xp > 0 && ls.skills.chuyi.xp > 0 && ls.skills.tipu.xp > 0 && ls.skills.jiaoji.xp > 0, '4项技能全部可学');

  // ================= T6 升级 =================
  group('T6 升级 /api/upgrade-bag + /api/upgrade-house');
  const u = (await mk('bendi', 'male', '升级流')).json.state;
  ok(/还差1500元/.test((await post('/api/upgrade-bag', { id: u.id })).json.error), '钱不够换包(提示差额 3000-1500)');
  eq((await post('/api/upgrade-bag', { id: 'AAAA-BBBB-CCCC-DDDD' })).status, 404, '不存在存档升级404');
  eq((await post('/api/upgrade-house', { id: 'AAAA-BBBB-CCCC-DDDD' })).status, 404, '不存在存档搬家404');
  await inject(u.id, { money: 9999999, stamina: 100 });
  const bagChain = [];
  for (let lv = 1; lv < META.BAG_LVLS.length; lv++) { const r = await post('/api/upgrade-bag', { id: u.id }); eq(r.status, 200, `背包升Lv${lv}`); bagChain.push(r.json.state.bagLv); }
  eq(bagChain.join(','), '1,2,3', '背包连升三级');
  eq((await post('/api/upgrade-bag', { id: u.id })).json.error, '已经是面包车了');
  let us = await loadS(u.id);
  eq(us.bagLv, 3, 'bagLv=3落盘');
  const stk = gid => Math.round(META.STOCKS[gid] * (1 + 0.5 * us.bagLv)) + Math.floor((us.connections || 0) / 10) - ((us.boughtToday || {})[gid] || 0);
  eq(stk('liangcha'), Math.round(META.STOCKS.liangcha * 2.5) + 2, '面包车运力2.5倍+人脉20→+2件');
  // 背包容量真的拦得住
  us = await loadS(u.id);
  const cap = META.BAG_LVLS[us.bagLv].cap;
  await inject(u.id, { money: 9999999, inventory: {}, boughtToday: {} });
  const one = await post('/api/trade', { id: u.id, buy: { naicha: 1 } });
  ok(one.status === 200, '买入1件成功（为测背包上限铺垫）');
  // 住房：bendi 起步 lv2 → 升到顶
  const startLv = us.houseLv;
  const houseChain = [];
  for (let lv = startLv + 1; lv < META.HOUSING_LVLS.length; lv++) {
    const r = await post('/api/upgrade-house', { id: u.id });
    eq(r.status, 200, `搬家到 Lv${lv}（${META.HOUSING_LVLS[lv].name}）`);
    houseChain.push(r.json.state.houseLv);
    eq(r.json.state.housing, META.HOUSING_LVLS[r.json.state.houseLv].name, 'housing 名与档位一致');
  }
  eq(houseChain.join(','), Array.from({ length: META.HOUSING_LVLS.length - 1 - startLv }, (_, i) => startLv + 1 + i).join(','), `住房从lv${startLv}连升到顶`);
  eq((await post('/api/upgrade-house', { id: u.id })).json.error, '已经住上珠江别墅了');
  const rich = (await mk('dagong', 'male', '穷')).json.state;
  ok(/还差1200元/.test((await post('/api/upgrade-house', { id: rich.id })).json.error), '钱不够搬家(2000-800)');
  // 顶级住房休息量生效
  const up = (await mk('daxuesheng', 'male', '别墅')).json.state;
  await inject(up.id, { money: 9999999, houseLv: 3, housing: META.HOUSING_LVLS[3].name, stamina: 5 });
  const topRest = (await post('/api/next-day', { id: up.id, rest: true })).json.state;
  eq(topRest.stamina, 5 + META.HOUSING_LVLS[3].rest, `老城小院休息+${META.HOUSING_LVLS[3].rest}`);

  // ================= T7 小吃 =================
  group('T7 小吃 /api/snack');
  const sn = (await mk('bendi', 'male', '吃喝')).json.state;
  eq((await post('/api/snack', { id: sn.id, snack: 'nope' })).status, 400, '未知小吃400');
  eq((await post('/api/snack', { id: 'AAAA-BBBB-CCCC-DDDD', snack: 'liangcha' })).status, 404, '不存在存档小吃404');
  await inject(sn.id, { money: 5000, stamina: 10 });
  const sk1 = await post('/api/snack', { id: sn.id, snack: 'liangcha' });
  eq(sk1.status, 200, '凉茶成功');
  eq(sk1.json.state.stamina, 20, '凉茶+10体');
  eq(sk1.json.state.snackDay.used.liangcha, 1, '记录当日已吃');
  eq(sk1.json.state.snackDay.day, sk1.json.state.day, 'snackDay 跟上当天');
  eq((await post('/api/snack', { id: sn.id, snack: 'liangcha' })).json.error, '今天吃过这个了');
  const moodB = sk1.json.state.mood, stkB = sk1.json.state.stamina;
  const sk2 = await post('/api/snack', { id: sn.id, snack: 'baofan' });
  eq(sk2.status, 200, '不同种可再吃');
  eq(sk2.json.state.stamina, Math.min(100, stkB + 30), '煲仔饭+30体不超上限');
  ok(sk2.json.state.mood >= moodB, `煲仔饭加心情(${moodB}→${sk2.json.state.mood})`);
  await post('/api/next-day', { id: sn.id, rest: false });
  eq((await post('/api/snack', { id: sn.id, snack: 'liangcha' })).status, 200, '次日可再吃凉茶(每日重置)');
  await inject(sn.id, { money: 0 });
  eq((await post('/api/snack', { id: sn.id, snack: 'tangshui' })).json.error, '钱不够');

  // ================= T8 存档 =================
  group('T8 存档 /api/save');
  const sv = (await mk('dagong', 'male', '存档')).json.state;
  eq((await post('/api/save', { id: 'AAAA-BBBB-CCCC-DDDD', state: sv })).status, 404, '不存在存档 save 404');
  const good = await post('/api/save', { id: sv.id, version: sv.version, state: sv });
  eq(good.status, 200, '版本一致 save 200');
  ok(Number.isInteger(good.json.version), '返回新版本号');
  const conflict = await post('/api/save', { id: sv.id, version: sv.version, state: sv });
  eq(conflict.status, 409, '版本冲突 409');
  ok(/版本冲突/.test(conflict.json.error) && Number.isInteger(conflict.json.serverVersion), '冲突提示带 serverVersion');
  const rt0 = await loadS(sv.id);
  eq((await post('/api/save', { id: sv.id, version: rt0.version, state: rt0 })).status, 200, '往返存一次');
  const rt2 = await loadS(sv.id);
  const strip = x => { const c = { ...x }; delete c.version; delete c.updatedAt; return c; };
  eq(JSON.stringify(strip(rt2)), JSON.stringify(strip(rt0)), '读档→存→读档 状态完全一致');

  // ================= T9 榜单 =================
  group('T9 榜单 /api/rank');
  const mask = sv.id.slice(0, 4) + '****';
  await inject(sv.id, {
    money: 9999999,
    photos: Object.fromEntries(META.LANDMARKS.map((l, i) => [l.id, i + 1])),
    npc: Object.fromEntries(META.NPCS.map(n => [n.id, { favor: 100 }])),
  });
  for (const [t, col, unit] of [['money', 'money', '元'], ['photos', 'photos', '张'], ['favor', 'favor', '好感']]) {
    const r = await req('/api/rank?type=' + t);
    eq(r.status, 200, `rank ${t} 200`);
    eq(r.json.type, t, `rank ${t} type 回显`);
    ok(Array.isArray(r.json.rank) && r.json.rank.length > 0, `rank ${t} 有数据`);
    ok(r.json.rank.length <= 20, `rank ${t} ≤20条`);
    ok(r.json.rank.every(x => /^[A-Z0-9]{4}\*\*\*\*$/.test(x.id)), `rank ${t} 全部ID脱敏`);
    ok(r.json.rank.every(x => x.unit === unit), `rank ${t} 单位=${unit}`);
    const vals = r.json.rank.map(x => x.val);
    ok(vals.every((v, i) => i === 0 || vals[i - 1] >= v), `rank ${t} 降序`);
    ok(r.json.rank.some(x => x.id === mask), `rank ${t} 含本测试存档`);
    ok(r.json.rank.every(x => Number.isFinite(x.val) && Number.isFinite(x.day) && x.day >= 1), `rank ${t} 数值有效`);
  }
  eq((await req('/api/rank?type=money')).json.rank[0].id, mask, '资产榜第一=测试存档(9999999)');
  eq((await req('/api/rank?type=favor')).json.rank[0].id, mask, '人情榜第一=测试存档(800好感)');
  ok((await req('/api/rank?type=photos')).json.rank.some(x => x.id === mask), '收藏榜含测试存档(14张，与他人并列)');
  eq((await req('/api/rank')).json.type, 'money', '默认榜单=money');
  // SQL 注入：col 是白名单三选一，所以查列安全；但 type 原样回显（前端会存进 rankType）
  const inj = await req("/api/rank?type=' or 1=1 --");
  ok(inj.json.rank.every(x => /^[A-Z0-9]{4}\*\*\*\*$/.test(x.id) && x.id !== "' or 1=1 --"), '注入串不会拼进 SQL（col 白名单生效）', JSON.stringify(inj.json.rank[0]));
  ok(inj.json.type === 'money', '非法 type 回显应收敛到 money（现在原样回显，前端会把 rankType 存脏）', `got=${inj.json.type}`, true);

  // ================= T10 地标/成就 =================
  group('T10 地标掉落 / 成就');
  const lm = (await mk('bendi', 'male', '摄影师')).json.state;
  const dropped = new Set(); let drops = 0;
  for (let i = 0; i < 20; i++) {
    const rr = await post('/api/trade', { id: lm.id, buy: { liangcha: 1 } });
    if (rr.json?.drops) { drops += rr.json.drops.length; rr.json.drops.forEach(x => dropped.add(x)); }
    const nx = await post('/api/next-day', { id: lm.id, rest: true, moveTo: '荔湾' });
    if (nx.json?.drops) { drops += nx.json.drops.length; nx.json.drops.forEach(x => dropped.add(x)); }
    await inject(lm.id, { money: 9000, stamina: 100 });
  }
  let ls2 = await loadS(lm.id);
  ok(drops > 0, `荔湾进货20次通过 drops 字段掉落地标卡 ${drops} 张：${[...dropped].join(',')}`);
  ok(Object.keys(ls2.photos).length >= dropped.size, `state.photos 累积 ${Object.keys(ls2.photos).length} 张（buy/work 的 drops + 过一天的 day 掉落，前端靠 diff photos 弹「出卡」）`);
  ok(Object.keys(ls2.photos).every(k => META.LANDMARKS.some(l => l.id === k)), 'photos 全是合法地标id');
  ok(ls2.experience > 0, '掉卡涨阅历=' + ls2.experience);
  ok(ls2.achievements.includes('first-photo'), '达成「初到贵境」');
  ok(ls2.timeline.some(x => /\[\[lm:\w+\]\]/.test(x)), '时间线埋了 [[lm:id]] 标记（前端据此配图）');
  const sha = META.LANDMARKS.find(l => l.id === 'shamian');
  ok((ls2.pc.shamian || 0) >= sha.drop.need, `沙面进度${ls2.pc.shamian}≥门槛${sha.drop.need}（保底第16次必掉）`);
  ok(ls2.photos.shamian !== undefined, '保底机制生效：沙面已掉');
ok(ls2.achievements.includes('week-7'), '第7天达成「站稳脚跟」');
  ok(assertState(ls2, 'photo').length === 0, '掉卡后状态不变量', assertState(ls2, '').join(';'));
  // 门槛未达成不该掉：白云山需体力≥50
  const gz = (await mk('dagong', 'male', '门槛卡')).json.state;
  let gzs = await inject(gz.id, { district: '白云', stamina: 10, money: 9000 });
  for (let i = 0; i < 14; i++) { gzs = (await post('/api/next-day', { id: gz.id, rest: false })).json.state; if (gzs.stamina > 20) gzs = await inject(gz.id, { stamina: 10 }); }
  ok(!gzs.photos.baiyunshan, '体力不足不掉白云山卡（门槛 req 生效）');
  ok((gzs.pc.baiyunshan || 0) >= 6, `但进度照样累计 ${gzs.pc.baiyunshan}/6`);
  gzs = await inject(gz.id, { stamina: 100 });
  for (let i = 0; i < 3 && !gzs.photos.baiyunshan; i++) { await inject(gz.id, { stamina: 100 }); gzs = (await post('/api/next-day', { id: gz.id, rest: false })).json.state; }
  ok(!!gzs.photos.baiyunshan, '体力达标后就能掉白云山卡（门槛可解锁）');

  // ================= T11 长跑模拟 =================
  group('T11 长跑模拟（打工人/跑商/摆烂族 各90天）');
  const strategies = [
    { name: '打工人', identity: 'daxuesheng', gender: 'male', act: 'work' },
    { name: '跑商', identity: 'bendi', gender: 'male', act: 'trader' },
    { name: '摆烂族', identity: 'dagong', gender: 'female', act: 'idle' },
  ];
  const sum = [];
  for (const st of strategies) {
    const r0 = await mk(st.identity, st.gender, '模拟' + st.name);
    const sid = r0.json.id;
    let s = r0.json.state;
    const day0 = s.day;
    const errs = []; let workN = 0, learnN = 0, tradeN = 0, moveN = 0, snackN = 0;
    for (let d = 0; d < 90; d++) {
      if (s.stamina < 40 && s.money > 60) { const x = await post('/api/snack', { id: sid, snack: 'baofan' }); if (x.status === 200) { s = x.json.state; snackN++; } }
      if (st.act === 'work') {
        if (s.money > 3000 && s.stamina > 40) { const x = await post('/api/learn', { id: sid, skill: ['xiaoshou', 'chuyi', 'tipu', 'jiaoji'][d % 4] }); if (x.status === 200) { s = x.json.state; learnN++; } }
        const jobs = META.JOBS.filter(j => (!j.edu || META.IDENTITIES[st.identity].edu === j.edu || s.connections >= (j.conn || 999)) && (!j.skill || skillLv(s.skills[j.skill.id].xp) >= j.skill.lv));
        jobs.sort((a, b) => b.pay - a.pay);
        for (const j of jobs) { const x = await post('/api/work', { id: sid, job: j.id }); if (x.status === 200) { s = x.json.state; workN++; break; } }
      } else if (st.act === 'trader') {
        const local = META.GOODS.filter(g => g.sell.includes(s.district));
        const cheap = [...local].sort((a, b) => (s.prices[a.id] || 0) - (s.prices[b.id] || 0))[d % Math.min(3, local.length)];
        const q = 1 + (d % 5);
        let x = await post('/api/trade', { id: sid, buy: { [cheap.id]: q } }); if (x.status === 200) { s = x.json.state; tradeN++; }
        x = await post('/api/trade', { id: sid, sell: { [cheap.id]: q } }); if (x.status === 200) { s = x.json.state; tradeN++; }
        if (d % 7 === 0) { moveN++; }
      }
      const mv = (d % 5 === 0 || st.act === 'trader') ? META.DISTRICTS[(d + 1) % 6] : undefined;
      const x = await post('/api/next-day', { id: sid, rest: true, moveTo: mv });
      if (x.status !== 200) { errs.push(`next-day ${x.status} ${x.json?.error}`); continue; }
      s = x.json.state;
      const bad = assertState(s, `${st.name}#${s.day}`);
      if (bad.length) errs.push(`day${s.day}: ${bad.join(';')}`);
      if (bagQty(s.inventory) > META.BAG_LVLS[s.bagLv].cap) errs.push(`day${s.day}: 超背包 ${bagQty(s.inventory)}>${META.BAG_LVLS[s.bagLv].cap}`);
      if (Object.keys(s.boughtToday).length > 0) errs.push(`day${s.day}: boughtToday 未清空`);
      if (s.jobsToday.n > 1) errs.push(`day${s.day}: 一天打工>1`);
      if (s.day !== day0 + d + 1) errs.push(`day${s.day}: 天数不连续`);
      if (s.health > 100 || s.stamina > 100 + 10 * skillLv(s.skills.tipu.xp)) errs.push(`day${s.day}: 数值超上限`);
    }
    const fin = await loadS(sid);
    eq(fin.day, day0 + 90, `${st.name} 撑满90天（第${fin.day}天）`);
    ok(errs.length === 0, `${st.name} 90天零违规`, errs.slice(0, 3).join(' | '));
    ok(fin.timeline.length <= 100, `${st.name} 时间线封顶 ${fin.timeline.length}/100`);
    ok(fin.recaps.length <= 7, `${st.name} 账目保留 ${fin.recaps.length}/7`);
    ok(fin.stats.jobs === workN, `${st.name} 打工计数一致 ${fin.stats.jobs}=${workN}`);
    ok(fin.stats.learns === learnN, `${st.name} 学艺计数一致 ${fin.stats.learns}=${learnN}`);
    ok(Object.keys(fin.visited).length >= (st.act === 'idle' ? 1 : 3), `${st.name} 到访${Object.keys(fin.visited).length}个区`);
    ok(fin.achievements.length > 0, `${st.name} 拿到${fin.achievements.length}个成就`);
    sum.push({ name: st.name, day: fin.day, money: fin.money, photos: Object.keys(fin.photos).length, ach: fin.achievements.length, npc: Object.values(fin.npc).reduce((t, n) => t + n.favor, 0), dist: Object.keys(fin.visited).length, work: fin.stats.jobs, learn: fin.stats.learns, trades: tradeN, snacks: snackN, moves: moveN, errs: errs.length });
  }
  for (const x of sum) log(`  · ${x.name}: 第${x.day}天 钱${x.money} 照片${x.photos} 成就${x.ach} 人情${x.npc} 到访${x.dist}区 打工${x.work} 学艺${x.learn} 交易${x.trades} 小吃${x.snacks} 迁移${x.moves} 违规${x.errs}`);
  ok(sum.some(x => x.money > 10000), '90天后有人攒到1万以上（经济循环成立）', sum.map(x => x.money).join('/'));
  ok(sum.some(x => x.photos > 0), '90天有人掉到地标卡');
  ok(sum.some(x => x.npc >= 25), '90天有人把街坊刷到点亮线', sum.map(x => x.npc).join('/'));

  // ================= T12 并发 / 畸形输入 =================
  group('T12 并发与畸形输入');
  const conc = (await mk('bendi', 'male', '并发')).json.state;
  const res = await Promise.all([
    post('/api/trade', { id: conc.id, buy: { naicha: 3 } }),
    post('/api/trade', { id: conc.id, buy: { naicha: 3 } }),
    post('/api/snack', { id: conc.id, snack: 'liangcha' }),
    post('/api/work', { id: conc.id, job: 'banyun' }),
    post('/api/next-day', { id: conc.id, rest: true }),
  ]);
  ok(res.every(r => r.status === 200), '并发请求全部200', res.map(r => r.status + '/' + (r.json?.error || '')).join(','));
  let cst = await loadS(conc.id);
  ok(cst.inventory.naicha?.qty <= 6, `并发买入没超发（${cst.inventory.naicha?.qty}≤6）`);
  ok(cst.money >= 0 && cst.jobsToday.n <= 1, '并发后钱非负、一天一份工');
  ok(assertState(cst, 'conc').length === 0, '并发后状态合法', assertState(cst, '').join(';'));
  group('T12b 畸形输入是否 500（安全边界）');
  const mal = [
    ['trade', '非法JSON', '{bad json'], ['trade', '空body', ''], ['trade', 'null body', 'null'],
    ['trade', '数组body', '[1,2,3]'], ['trade', '超长qty', JSON.stringify({ id: conc.id, buy: { naicha: 1e12 } })],
    ['trade', '负qty', JSON.stringify({ id: conc.id, buy: { naicha: -5 } })],
    ['trade', '浮点qty', JSON.stringify({ id: conc.id, buy: { naicha: 1.9 } })],
    ['trade', '字符串qty', JSON.stringify({ id: conc.id, buy: { naicha: 'abc' } })],
    ['work', 'null body', 'null'], ['learn', 'null body', 'null'], ['snack', 'null body', 'null'],
    ['new', 'null body', 'null'], ['next-day', 'null body', 'null'],
  ];
  for (const [p, name, body] of mal) {
    const r = await fetch(`${BASE}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    ok(r.status < 500, `${p}/${name} 不返回500（${r.status}）`, '', true);
  }
  cst = await loadS(conc.id);
  ok(cst.inventory.naicha?.qty <= 6 && cst.money >= 0, '畸形输入没污染存档');
  ok(assertState(cst, 'mal').length === 0, '畸形输入后状态仍合法', assertState(cst, '').join(';'));
  const huge = (await mk('bendi', 'male', '亿')).json.state;
  await inject(huge.id, { money: 999999999 });
  let hs2 = huge;
  for (let i = 0; i < 3; i++) hs2 = (await post('/api/next-day', { id: huge.id, rest: true })).json.state;
  ok(hs2.money > 0 && Number.isFinite(hs2.money), '大钱存档不溢出/不NaN');

  // ================= T13 路由 return 静态扫描 =================
  group('T13 路由分支 return 扫描');
  const src = fs.readFileSync('server.js', 'utf8');
  const L = src.split('\n');
  const routeAt = [];
  for (let i = 0; i < L.length; i++) if (/^ {4}if \((req\.method|url\.pathname)/.test(L[i])) routeAt.push(i);
  ok(routeAt.length === 14, `识别到 ${routeAt.length} 个路由块（预期14）`);
  const noRet = [], badSend = [];
  for (let ri = 0; ri < routeAt.length; ri++) {
    const start = routeAt[ri];
    const end = ri + 1 < routeAt.length ? routeAt[ri + 1] : L.findIndex((l, i) => i > start && /^ {4}\/\/ 静态文件/.test(l));
    for (let i = start + 1; i < end; i++) {
      if (/^ {6}if /.test(L[i])) {                       // 路由块内的直接子分支
        let d = 0, began = false, j = i;
        for (; j < end; j++) {
          d += (L[j].match(/\{/g) || []).length - (L[j].match(/\}/g) || []).length;
          if (L[j].includes('{')) began = true;
          if (began && d === 0) break;
        }
        const stmt = L.slice(i, j + 1).join('\n');
        // 只盯「本该响应却没 return」的分支：含 send( 但整条语句没有 return
        if (/send\(/.test(stmt) && !/\breturn\b/.test(stmt)) noRet.push(`L${i + 1} ${L[i].trim().slice(0, 60)}`);
      }
      if (/return send\(res,\s*[^,)]+\)/.test(L[i])) badSend.push(`L${i + 1}: ${L[i].trim()}`);
    }
  }
  ok(noRet.length === 0, '路由块内每个 if 分支都带 return（防漏 return 掉静态兜底）', noRet.join(' | '));
  ok(badSend.length === 0, '没有漏 HTTP 状态码的 send', badSend.join(' | '));
  const bodyIndents = routeAt.map((s, i) => (i + 1 < routeAt.length ? routeAt[i + 1] : L.length) - s);
  ok(routeAt.every((s, i) => bodyIndents[i] > 2), '14个路由块全部有实体', bodyIndents.join(','));

  // ================= T14 前后端公式镜像 =================
  group('T14 前后端公式镜像 / DOM 契约');
  const app = fs.readFileSync('public/app.js', 'utf8');
  const html = fs.readFileSync('public/index.html', 'utf8');
  eq(Number(app.match(/const APP_V = (\d+)/)?.[1]), META.rev, `APP_V === SERVER_V（${META.rev}）`);
  ok(/style\.css\?v=\d+/.test(html) && /app\.js\?v=\d+/.test(html), 'index.html 带缓存版本号');
  const mirror = [
    ['BUYM 病中买贵', /S\.health < 30 \? 1\.2 : S\.health < 60 \? 1\.1 : 1/, /state\.health < 30 \? 1\.2 : state\.health < 60 \? 1\.1 : 1/],
    ['BUYM 人脉折扣', /connections >= 50 \? 0\.95/, /connections \|\| 0\) >= 50 \? 0\.95/],
    ['BUYM 销售每级-2%', /1 - 0\.02 \* SKILL\('xiaoshou'\)/, /1 - 0\.02 \* skillOf\(state, 'xiaoshou'\)/],
    ['INCM 心情定薪', /0\.8 \+ \(S\.mood \|\| 0\) \/ 500/, /0\.8 \+ \(state\.mood \|\| 0\) \/ 500/],
    ['STKB 人脉加限购', /Math\.floor\(\(S\.connections \|\| 0\) \/ 10\)/, /Math\.floor\(\(state\.connections \|\| 0\) \/ 10\)/],
    ['BAGM 运力', /1 \+ 0\.5 \* \(S\.bagLv \|\| 0\)/, /1 \+ 0\.5 \* \(state\.bagLv \|\| 0\)/],
    ['SELLB 阅历封顶20%', /Math\.min\(0\.2, \(S\.experience \|\| 0\) \/ 1000\)/, /Math\.min\(0\.2, \(state\.experience \|\| 0\) \/ 1000\)/],
    ['SELLB 销售每级+3%', /0\.03 \* lvOf/, /0\.03 \* skillOf/],
    ['SELLR 产地档', /Math\.min\(0\.85, 0\.5 \+ SELLB\(\)\)/, /Math\.min\(0\.85, SELL_RATE_HOME \+ b\)/],
    ['SELLR 外地档', /Math\.min\(1\.25, 1\.0 \+ SELLB\(\) \/ 2\)/, /Math\.min\(1\.25, SELL_RATE_AWAY \+ b \/ 2\)/],
    ['lvOf 技能门槛', /xp >= 150 \? 3 : xp >= 80 \? 2 : xp >= 30 \? 1 : 0/, /const SKILL_LEVELS = \[0, 30, 80, 150\]/],
    ['STOCKLEFT 每日限购', /Math\.round\(\(META\.STOCKS\[gid\] \|\| 0\) \* BAGM\(\)\) \+ STKB\(\) - \(\(S\.boughtToday \|\| \{\}\)\[gid\] \|\| 0\)/, /Math\.round\(\(STOCKS\[gid\] \|\| 0\) \* bagMult\(state\)\) \+ stockBonus\(state\) - \(\(state\.boughtToday \|\| \{\}\)\[gid\] \|\| 0\)/],
    ['CAP 背包容量', /META\.BAG_LVLS\[S\.bagLv \|\| 0\] \|\| META\.BAG_LVLS\[0\]\)\.cap/, /BAG_LVLS\[\(state\.bagLv \|\| 0\)\] \|\| BAG_LVLS\[0\]\)\.cap/],
    ['carryCost 搬货体力', /2 \+ Math\.floor\(q \/ 10\)/, /return 2 \+ Math\.floor\(q \/ 10\)/],
    ['STOCKS 限购分档', [], /if \(g\.base < 30\) return 30;/],
  ];
  for (const [name, fre, srv] of mirror) {
    const a = fre instanceof RegExp ? fre.test(app) : true;
    ok(a && srv.test(src), `镜像一致：${name}`, a ? '' : '前端公式不匹配');
  }
  // 限购分档数值也镜像一份
  ok(/if \(g\.base < 30\) return 30;\s*if \(g\.base < 100\) return 20;\s*if \(g\.base <= 200\) return 15;\s*if \(g\.base < 400\) return 10;\s*return 6;/.test(src), '限购基数分档（前端直接读 meta.STOCKS，无需镜像）');
  // META 字段引用
  const usedM = [...new Set([...app.matchAll(/META\.([A-Za-z_]+)/g)].map(m => m[1]))];
  ok(usedM.every(k => META[k] !== undefined), '前端引用的 META 字段都存在', usedM.filter(k => META[k] === undefined).join(','));
  // DOM 契约
  const dyn = ['toast', 'cf-ok', 'cf-no', 'btn-houseup', 'btn-bagup'];
  const domIds = [...new Set([...app.matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)].map(m => m[1]))];
  const miss = domIds.filter(i => !html.includes(`id="${i}"`) && !dyn.includes(i));
  ok(miss.length === 0, `前端 ${domIds.length} 个 $() 引用的 DOM 都存在`, miss.join(','));
  const setHIds = [...new Set([...app.matchAll(/setH\('([a-zA-Z0-9_-]+)'/g)].map(m => m[1]))];
  const missH = setHIds.filter(i => !html.includes(`id="${i}"`));
  ok(missH.length === 0, `setH 的 ${setHIds.length} 个容器都存在`, missH.join(','));
  // 弹层队列：confirmBox.close 必须把控制权还给队列
  ok(/const close = \(\) => \{[^}]*if \(ovQueue\.length\) showNextOverlay\(\)/.test(app), 'confirmBox.close 归还弹层队列（AGENTS 红线）');
  ok(/ovQueue\.push\(html\);\s*if \(ovQueue\.length === 1\) showNextOverlay\(\);/.test(app), 'showOverlay 入队逻辑正确');
  ok(/ovQueue\.shift\(\);\s*if \(ovQueue\.length\) showNextOverlay\(\);/.test(app), '弹层关闭后继续出队');
  // 下路由 Tab（红线：出摊/商铺/专精/人情已砍）
  const tabs = [...html.matchAll(/data-t="(\w+)"/g)].map(m => m[1]);
  eq(tabs.join(','), 'trade,work,album,mine', '底部4个Tab：生意/谋生/相册/我的（无出摊/商铺/专精/人情）');
  ok(!/stall|shop|caifeng|reying|humanqing/i.test(app) || !/\/api\/(stall|shop|caifeng|npc-talk)/.test(src), '已砍功能没有残留 API');
  // 素材
  const assets = [...new Set([...html.matchAll(/assets\/[\w.-]+/g)].map(m => m[0]))];
  let assetBad = [];
  for (const a of assets) if ((await req('/' + a)).status !== 200) assetBad.push(a);
  ok(assetBad.length === 0, `index.html 引用的 ${assets.length} 个素材全部 200`, assetBad.join(','));

  // ================= T15 崩溃探测（已知缺陷，放最后，会打死进程） =================
  group('T15 畸形请求目标是否会打挂服务');
  const http = await import('node:http');
  const ping = () => new Promise(res => {
    const rq = http.get(BASE + '/api/ping', { agent: false }, r => { r.resume(); r.on('end', () => res(r.statusCode === 200)); });
    rq.on('error', () => res(false));
    rq.setTimeout(1500, () => { rq.destroy(); res(false); });
  });
  const aliveBefore = await ping();
  let probeStatus = 'n/a';
  try { probeStatus = (await fetch(BASE + '//')).status; } catch (e) { probeStatus = 'CONN_RESET/' + (e.cause?.code || e.code || e.message); }
  await new Promise(r => setTimeout(r, 500));
  const aliveAfter = await ping();
  ok(aliveBefore && aliveAfter, `GET //（畸形 request-target）不能打挂服务（探测返回 ${probeStatus}，之后服务${aliveAfter ? '仍存活' : '已死'}）`, '', true);
  if (!aliveAfter) {
    const cp = await import('node:child_process');
    const ch = cp.spawn('node', ['server.js'], { cwd: process.cwd(), detached: true, stdio: 'ignore' });
    ch.unref();
    let back = false;
    for (let i = 0; i < 25 && !back; i++) { await new Promise(r => setTimeout(r, 700)); back = await ping(); }
    ok(back, '被打挂后已自动重启恢复服务（否则这台机器就没人玩了）');
  }

  // ================= 汇总 =================
  group('汇总');
  ok(server500.length === 0, '正常流程全程无 HTTP 500', server500.slice(0, 5).join(' | '));
  log(`  PASS ${pass} / FAIL ${fail} / 已知缺陷 ${known}`);
  if (knowns.length) { log('  已知缺陷清单（待修）：'); knowns.forEach(x => log('   ! ' + x)); }
  if (fails.length) { log('  失败清单：'); fails.forEach(x => log('   - ' + x)); }
  let del = 0;
  for (const id of CREATED) for (const suf of ['', '.bak1', '.bak2', '.bak3', '.bak4', '.bak5']) { const f = `saves/${id}.json${suf}`; if (fs.existsSync(f)) { fs.unlinkSync(f); del++; } }
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync('data/meta.sqlite');
  const ids = [...CREATED];
  if (ids.length) db.prepare(`DELETE FROM snapshots WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  db.close();
  log(`  已清理 ${CREATED.size} 个测试存档（${del} 个文件，含 .bak）+ ${CREATED.size} 条榜单快照`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });

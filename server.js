// 广州浮生记 MVP 服务端：零依赖（node:http + node:sqlite + fs）
// 存档: saves/{id}.json ｜ 榜单: data/meta.sqlite
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const SERVER_V = 36;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = path.join(__dirname, 'saves');
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.mkdirSync(SAVES_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- 榜单 sqlite ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'meta.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS snapshots(
  id TEXT PRIMARY KEY, name TEXT, identity TEXT, money INTEGER,
  day INTEGER, updatedAt INTEGER
)`);
try { db.exec('ALTER TABLE snapshots ADD COLUMN photos INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE snapshots ADD COLUMN favor INTEGER DEFAULT 0'); } catch {}

// ---------- 游戏配置（与策划总结一致，无身份天赋） ----------
const IDENTITIES = {
  dagong:    { label: '南下青年', difficulty: '难', money: 800,  connections: 0,  startLv: 0, edu: '初中' },
  daxuesheng:{ label: '毕业大学生', difficulty: '中', money: 3000, connections: 0,  startLv: 1, edu: '本科' },
  bendi:     { label: '老广本地人', difficulty: '易', money: 1500, connections: 20, startLv: 2, edu: '高中' },
};
// 住房五档：前两档租房交租，后三档买房交物业（都是每周一交）
// 正反馈只有一条：休息回体量
const HOUSING_LVLS = [
  { name: '城中村床位', rest: 40, fee: 150, feeLabel: '房租', upCost: 2000, upLabel: '搬家费' },
  { name: '天河合租单间', rest: 55, fee: 300, feeLabel: '房租', upCost: 30000, upLabel: '首付' },
  { name: '一房一厅', rest: 70, fee: 150, feeLabel: '物业费', upCost: 80000, upLabel: '房款' },
  { name: '老城小院', rest: 90, fee: 300, feeLabel: '物业费', upCost: 200000, upLabel: '房款' },
  { name: '珠江别墅', rest: 110, fee: 600, feeLabel: '物业费', upCost: 0, upLabel: '' },
];
function houseOf(state) { return HOUSING_LVLS[state.houseLv || 0] || HOUSING_LVLS[0]; }
const DISTRICTS = ['天河', '越秀', '荔湾', '海珠', '白云', '番禺'];
const GOODS = [
  // 茶药
  { id: 'liangcha', name: '凉茶', base: 8, cat: '茶药', origin: '荔湾', vol: 0.25, perish: 0, sell: ['荔湾'] },
  { id: 'chaye', name: '芳村茶叶', base: 200, cat: '茶药', origin: '荔湾', vol: 0.3, perish: 0, sell: ['荔湾'] },
  { id: 'chenpi', name: '新会陈皮', base: 110, cat: '茶药', origin: '番禺', vol: 0.3, perish: 0, sell: ['番禺'] },
  { id: 'huajuhong', name: '化橘红', base: 180, cat: '茶药', origin: '白云', vol: 0.35, perish: 0, sell: ['白云'] },
  // 生鲜食品（易腐）
  { id: 'shuichan', name: '黄沙水产', base: 90, cat: '生鲜食品', origin: '荔湾', vol: 0.35, perish: 0.3, sell: ['荔湾'] },
  { id: 'dianxin', name: '早茶点心', base: 25, cat: '生鲜食品', origin: '越秀', vol: 0.2, perish: 0.4, sell: ['越秀'] },
  { id: 'lizhi', name: '增城荔枝', base: 18, cat: '生鲜食品', origin: '番禺', vol: 0.4, perish: 0.5, sell: ['番禺'] },
  { id: 'lawei', name: '广式腊味', base: 70, cat: '生鲜食品', origin: '海珠', vol: 0.25, perish: 0.05, sell: ['海珠'] },
  // 服装织绣
  { id: 'fuzhuang', name: '十三行服装', base: 60, cat: '服装织绣', origin: '荔湾', vol: 0.3, perish: 0, sell: ['荔湾'] },
  { id: 'guangxiu', name: '广绣手信', base: 150, cat: '服装织绣', origin: '海珠', vol: 0.3, perish: 0, sell: ['海珠'] },
  { id: 'xiangyunsha', name: '香云纱', base: 320, cat: '服装织绣', origin: '番禺', vol: 0.35, perish: 0, sell: ['番禺'] },
  { id: 'piju', name: '白云皮具', base: 95, cat: '服装织绣', origin: '白云', vol: 0.3, perish: 0, sell: ['白云'] },
  // 数码日用
  { id: 'shuma', name: '岗顶数码配件', base: 120, cat: '数码日用', origin: '天河', vol: 0.3, perish: 0, sell: ['天河'] },
  { id: 'jiushouji', name: '旧手机', base: 220, cat: '数码日用', origin: '天河', vol: 0.45, perish: 0, sell: ['天河'] },
  { id: 'xiaojiadian', name: '小家电', base: 130, cat: '数码日用', origin: '番禺', vol: 0.3, perish: 0, sell: ['番禺'] },
  // 文玩收藏
  { id: 'yushi', name: '华林玉器', base: 500, cat: '文玩收藏', origin: '荔湾', vol: 0.35, perish: 0, sell: ['荔湾'] },
  { id: 'guangcai', name: '广彩瓷', base: 280, cat: '文玩收藏', origin: '海珠', vol: 0.3, perish: 0, sell: ['海珠'] },
  { id: 'duanyan', name: '端砚', base: 350, cat: '文玩收藏', origin: '越秀', vol: 0.3, perish: 0, sell: ['越秀'] },

  { id: 'naicha', name: '珍珠奶茶', base: 16, cat: '生鲜食品', origin: '天河', vol: 0.25, perish: 0.5, sell: ['天河'] },
  { id: 'youxika', name: '游戏点卡', base: 50, cat: '数码日用', origin: '天河', vol: 0.3, perish: 0, sell: ['天河'] },
  { id: 'tangshui', name: '老城糖水', base: 20, cat: '生鲜食品', origin: '越秀', vol: 0.2, perish: 0.5, sell: ['越秀'] },
  { id: 'shuhua', name: '文房书画', base: 160, cat: '文玩收藏', origin: '越秀', vol: 0.3, perish: 0, sell: ['越秀'] },
  { id: 'yundongxie', name: '运动潮鞋', base: 110, cat: '服装织绣', origin: '白云', vol: 0.3, perish: 0, sell: ['白云'] },
  { id: 'huazhuang', name: '美妆小样', base: 85, cat: '服装织绣', origin: '白云', vol: 0.35, perish: 0, sell: ['白云'] },
  { id: 'haiwei', name: '海味干货', base: 130, cat: '生鲜食品', origin: '海珠', vol: 0.3, perish: 0.05, sell: ['海珠'] },
];
const GOOD_MAP = Object.fromEntries(GOODS.map(g => [g.id, g]));
// 背包按件数限，不分体积重量；每日限购按价格分档（越贵越少）
// 背包四档：自带背包→行李箱→三轮车→面包车（容量+跑商体力减免）
const BAG_LVLS = [
  { name: '自带背包', cap: 20, cost: 0 },
  { name: '行李箱', cap: 40, cost: 3000 },
  { name: '三轮车', cap: 80, cost: 12000, move: 3 },
  { name: '面包车', cap: 150, cost: 40000, move: 0 },
];
function bagCap(state) { return (BAG_LVLS[(state.bagLv || 0)] || BAG_LVLS[0]).cap; }
function moveCost(state) {
  const m = (BAG_LVLS[(state.bagLv || 0)] || {}).move;
  return m === undefined ? 5 : m;
}
// 即时卖出：产地5折（货多压价），外地全价（跑商正路）；摆摊/专精按零售价结算
const SELL_RATE_HOME = 0.5;
const SELL_RATE_AWAY = 1.0;
function sellPrice(state, gid) {
  const g = GOOD_MAP[gid];
  const b = sellBonus(state);
  const home = Math.min(0.85, SELL_RATE_HOME + b);
  const away = Math.min(1.25, SELL_RATE_AWAY + b / 2);
  const base = g && state.district === g.origin ? home : away;
  return Math.floor((state.prices[gid] || 0) * base);
}
// 日内回体小吃（每种每日1次）
const SNACKS = [
  { id: 'liangcha', name: '一碗凉茶', cost: 10, stamina: 10 },
  { id: 'tangshui', name: '一碗糖水', cost: 20, stamina: 15, mood: 3 },
  { id: 'baofan', name: '一煲煲仔饭', cost: 40, stamina: 30, mood: 5 },
];
// 30天一轮的节令日历（确定性预告）
const FESTIVALS = [
  { id: 'guangjiao', name: '广交会', start: 10, days: 3, effects: { shuma: 1.4, guangcai: 1.3 }, desc: '外商涌入，数码广彩抢手' },
  { id: 'huashi', name: '迎春花市', start: 18, days: 2, effects: { dianxin: 1.3, lawei: 1.2, lizhi: 1.2 }, desc: '花市开市，点心腊味好卖' },
  { id: 'taifengji', name: '台风季', start: 24, days: 2, effects: { shuichan: 1.5, lizhi: 1.3 }, desc: '台风封港，水产荔枝涨价' },
];
// 每日限购基数：越便宜越好囤。实际限购 = 基数 × 背包运力(1/1.5/2/2.5倍) + 人脉加成
function stockOf(g) {
  if (g.base < 30) return 30;
  if (g.base < 100) return 20;
  if (g.base <= 200) return 15;
  if (g.base < 400) return 10;
  return 6;
}
const STOCKS = Object.fromEntries(GOODS.map(g => [g.id, stockOf(g)]));
function bagQty(inv) { return Object.values(inv || {}).reduce((s, it) => s + (it?.qty || 0), 0); }
function bagMult(state) { return 1 + 0.5 * (state.bagLv || 0); } // 背包/行李箱/三轮/面包 = 1/1.5/2/2.5倍运力
function stockLeft(state, gid) {
  return Math.round((STOCKS[gid] || 0) * bagMult(state)) + stockBonus(state) - ((state.boughtToday || {})[gid] || 0);
}
function carryCost(q) { return 2 + Math.floor(q / 10); } // 大额进货才真吃体力
// 技能效果：销售压买价抬卖价，厨艺加回体，体魄加体力上限，交际涨人情
function buyMult(state) {
  const h = state.health < 30 ? 1.2 : state.health < 60 ? 1.1 : 1;
  const c = (state.connections || 0) >= 50 ? 0.95 : 1;
  const s = 1 - 0.02 * skillOf(state, 'xiaoshou');
  return h * c * s;
}
function staminaCap(state) { return 100 + 10 * skillOf(state, 'tipu'); }
function recover(state, base) { return Math.round(base * (1 + 0.15 * skillOf(state, 'chuyi'))); }
function favorGain(state, base) { return base + skillOf(state, 'jiaoji'); }
// 心情定收入(0.8~1.0)；人脉每10点每日限购+1/种，50点买铺9折；阅历抬卖价(最高+20%)+销售加成
function incomeMult(state) { return 0.8 + (state.mood || 0) / 500; }
function stockBonus(state) { return Math.floor((state.connections || 0) / 10); }
function sellBonus(state) { return Math.min(0.2, (state.experience || 0) / 1000) + 0.03 * skillOf(state, 'xiaoshou'); }
const MARKET_EVENTS = [
  { id: 'm-guangjiaohui', text: '广交会开幕！外商涌入，数码配件、广彩瓷被扫货。', effects: { shuma: 1.4, guangcai: 1.3 }, days: 3 },
  { id: 'm-taifeng', text: '台风封港三日，黄沙水产断货，荔枝也烂在路上。', effects: { shuichan: 1.6, lizhi: 1.3 }, days: 2 },
  { id: 'm-qiuacha', text: '秋茶大量上市，芳村满街茶香，茶叶跳水。', effects: { chaye: 0.7 }, days: 2 },
  { id: 'm-qingcang', text: '十三行换季清仓，服装档口挂出“亏本走量”。', effects: { fuzhuang: 0.65, piju: 0.8 }, days: 2 },
  { id: 'm-yuqi', text: '华林玉器展销会，藏家云集，好玉不愁卖。', effects: { yushi: 1.35 }, days: 3 },
  { id: 'm-liugan', text: '流感季来袭，凉茶铺排长队，陈皮也跟着起飞。', effects: { liangcha: 1.5, chenpi: 1.3 }, days: 3 },
  { id: 'm-lizhi', text: '增城荔枝大丰收，果农开着货车沿街叫卖。', effects: { lizhi: 0.6 }, days: 2 },
  { id: 'm-duanwu', text: '端午临近，家家备腊味，珠村龙船鼓敲起来了。', effects: { lawei: 1.25, dianxin: 1.2 }, days: 2 },
  { id: 'm-wanghong', text: '网红主播直播广绣制作，订单一夜爆了十倍。', effects: { guangxiu: 1.45 }, days: 2 },
  { id: 'm-huanxin', text: '旧机换新补贴落地，二手市场旧手机掉价。', effects: { jiushouji: 0.7 }, days: 2 },
  { id: 'm-shenyi', text: '香云纱染整技艺申遗成功，收藏圈连夜询价。', effects: { xiangyunsha: 1.4 }, days: 3 },
  { id: 'm-dianshi', text: '化橘红上了养生节目，北方客商整车来拉货。', effects: { huajuhong: 1.35 }, days: 2 },
  { id: 'm-yijiuhuanxin', text: '家电以旧换新，番禺工厂订单排到下月。', effects: { xiaojiadian: 1.25 }, days: 2 },
  { id: 'm-waimao', text: '广彩拿下欧洲大订单，外贸公司高价收货。', effects: { guangcai: 1.3 }, days: 3 },
  { id: 'm-duanyan', text: '端砚大师收徒展，名家砚台身价倍增。', effects: { duanyan: 1.3 }, days: 2 },
  { id: 'm-huashi', text: '迎春花市开市，全城买花过年，点心腊味都好卖。', effects: { dianxin: 1.3, lawei: 1.2, lizhi: 1.2 }, days: 2 },
];
const RANDOM_NAMES = ['陈嘉穗', '梁浩添', '黄思齐', '林晓桐', '苏曼华', '郑建邦'];
// 地标卡不再手动采风：随核心行为累积进度，满足条件后按概率自然掉落
// drop: {act: buy|sell|stall|work|learn|npc|day, where: 城区, npc: 指定NPC, need: 累计次数, chance: 单次概率, req: 门槛}
const LANDMARKS = [
  { id: 'tianhecheng', name: '天河城', district: '天河', desc: '商圈地铁口，午后人流。', drop: { act: 'buy', where: '天河', need: 8, chance: 0.25 }, dropDesc: '在天河进货8次，之后每次25%掉落' },
  { id: 'guangzhouta', name: '广州塔', district: '海珠', desc: '小蛮腰黄昏，珠江倒影。', drop: { act: 'buy', where: '海珠', need: 12, chance: 0.2 }, dropDesc: '在海珠进货12次，之后每次20%掉落' },
  { id: 'shamian', name: '沙面', district: '荔湾', desc: '欧式老洋房，林荫大道。', drop: { act: 'buy', where: '荔湾', need: 8, chance: 0.3 }, dropDesc: '在荔湾进货8次，之后每次30%掉落' },
  { id: 'shangxiajiu', name: '上下九', district: '荔湾', desc: '骑楼商业街，早茶飘香。', drop: { act: 'sell', where: '荔湾', need: 10, chance: 0.25 }, dropDesc: '在荔湾卖出10次，之后每次25%掉落' },
  { id: 'chenjiaci', name: '陈家祠', district: '荔湾', desc: '灰塑屋脊，门前石狮。', drop: { act: 'day', where: '荔湾', need: 6, chance: 0.3, req: { npc: { id: 'apo', favor: 10 } } }, dropDesc: '陈婆婆好感≥10后，在荔湾住6天，她带你去' },
  { id: 'shisanhang', name: '十三行', district: '荔湾', desc: '服装档口，晨间忙碌。', drop: { act: 'work', need: 6, chance: 0.25, req: { skill: { id: 'xiaoshou', lv: 1 } } }, dropDesc: '销售1级后打工6次' },
  { id: 'fangcun', name: '芳村茶市', district: '荔湾', desc: '茶饼成山，茶香氤氲。', drop: { act: 'buy', where: '荔湾', need: 10, chance: 0.25, req: { npc: { id: 'xianyi', favor: 10 } } }, dropDesc: '冼姨好感≥10后，在荔湾进货10次' },
  { id: 'huangsha', name: '黄沙水产', district: '荔湾', desc: '鱼档虾蟹，清晨开市。', drop: { act: 'buy', where: '荔湾', need: 15, chance: 0.2 }, dropDesc: '在荔湾进货15次，之后每次20%掉落' },
  { id: 'baiyunshan', name: '白云山', district: '白云', desc: '摩星岭观景，云海日出。', drop: { act: 'day', where: '白云', need: 6, chance: 0.25, req: { stamina: 50 } }, dropDesc: '体力50以上时在白云过6天' },
  { id: 'zhujiang', name: '珠江夜游', district: '海珠', desc: '游船灯火，两岸霓虹。', drop: { act: 'day', where: '海珠', need: 6, chance: 0.25, req: { mood: 60 } }, dropDesc: '心情60以上时在海珠过6天' },
  { id: 'chigangta', name: '赤岗塔', district: '海珠', desc: '古塔珠江，晚霞剪影。', drop: { act: 'day', where: '海珠', need: 10, chance: 0.2, req: { mood: 80 } }, dropDesc: '心情80以上时在海珠过10天' },
  { id: 'guangjiaohui', name: '广交会馆', district: '海珠', desc: '琶洲展馆，木棉晴空。', drop: { act: 'buy', where: '海珠', need: 5, chance: 0.4, req: { needMod: ['shuma', 'guangcai'] } }, dropDesc: '广交会/外贸热期间在海珠进货，每次40%' },
  { id: 'jiniantang', name: '中山纪念堂', district: '越秀', desc: '琉璃瓦宫殿，晴空绿树。', drop: { act: 'day', where: '越秀', need: 5, chance: 0.25, req: { experience: 20 } }, dropDesc: '阅历20以上时在越秀过5天' },
  { id: 'shawan', name: '沙湾古镇', district: '番禺', desc: '青砖祠堂，蚝壳墙巷。', drop: { act: 'day', where: '番禺', need: 6, chance: 0.25, req: { experience: 40 } }, dropDesc: '阅历40以上时在番禺过6天' },
];
// 门槛校验：返回null=通过
function checkReq(state, r) {
  if (!r) return null;
  if (r.stamina && state.stamina < r.stamina) return '体力不足';
  if (r.mood && state.mood < r.mood) return '心情不足';
  if (r.connections && (state.connections || 0) < r.connections) return '人脉不足';
  if (r.experience && (state.experience || 0) < r.experience) return '阅历不足';
  if (r.npc) {
    const f = state.npc?.[r.npc.id]?.favor || 0;
    if (f < r.npc.favor) return '人情未到';
  }
  if (r.skill) {
    if (skillLv((state.skills[r.skill.id]?.xp) || 0) < r.skill.lv) return '技艺未到';
  }
  if (r.needMod && !r.needMod.some(gid => state.mods?.[gid])) return '时机未到';
  return null;
}
const ACHIEVEMENTS = [
  { id: 'first-photo', name: '初到贵境', desc: '拍下第一张地标照片' },
  { id: 'photo-6', name: '行摄半城', desc: '集齐6张地标照片' },
  { id: 'photo-12', name: '老广通', desc: '集齐12张地标照片' },
  { id: 'rich-10k', name: '第一桶金', desc: '持有资金达到10000' },
  { id: 'week-7', name: '站稳脚跟', desc: '在广州度过7天' },
  { id: 'all-dist', name: '走遍羊城', desc: '到访过6个城区' },
  { id: 'npc-25', name: '街坊认可', desc: '任一NPC好感达到25' },
  { id: 'npc-all', name: '人情练达', desc: '三位NPC好感均达到25' },
  { id: 'job-first', name: '开工大吉', desc: '完成第一次打工' },
  { id: 'skill-1', name: '一技傍身', desc: '任一技能升到1级' },
  { id: 'rich-50k', name: '小有积蓄', desc: '持有资金达到50000' },
  { id: 'rich-200k', name: '富甲一方', desc: '持有资金达到200000' },
  { id: 'work-20', name: '劳模', desc: '累计打工20次' },
  { id: 'work-50', name: '卷王', desc: '累计打工50次' },
  { id: 'learn-5', name: '好学', desc: '累计学艺5次' },
  { id: 'learn-15', name: '博学', desc: '累计学艺15次' },
  { id: 'photo-8', name: '行摄达人', desc: '集齐8张地标照片' },
  { id: 'photo-14', name: '羊城通', desc: '集齐14张地标照片' },
  { id: 'npc-100', name: '街坊之友', desc: '任一街坊好感达到100' },
  { id: 'day-100', name: '老广', desc: '在广州度过100天' },
];
const EVENTS = [
  { id: 'taifeng', text: '台风“木棉”过境，全城停市半日，你在骑楼下避雨，听阿婆讲古。', mood: -5, health: 0 },
  { id: 'zhaogong', text: '士多老板问你要不要帮忙卸货，赚了50元盒饭钱。', money: 50, connections: 2, npc: { id: 'shiduo', favor: 2 } },
  { id: 'zaocha', text: '街坊请你饮早茶，一盅两件，心情大好。', mood: 8, money: -30, npc: { id: 'huoji', favor: 2 } },
  { id: 'yushui', text: '午后暴雨，途经水产市场帮档主盖棚，获赠一条鱼。', money: 40, health: -2 },
  { id: 'ditie', text: '新地铁线开通，去番禺进货更快了，体力消耗减少。', stamina: 10 },
  { id: 'fangzu', text: '房东阿婆看你准时交租，少收你20元，还塞了个苹果。', money: 20, mood: 5 },
  { id: 'liangcha', text: '上火牙痛，老字号凉茶铺老板请你喝了碗廿四味。', health: 6, money: -10 },
  { id: 'huashi', text: '在花市帮花农搬花，认识了两位同乡。', connections: 3, stamina: -5, npc: { id: 'laochen', favor: 2 } },
  { id: 'baijiu', text: '大学群@全体：阿强下周在番禺摆酒，你转了200礼金，顺带认回一帮老同学。', money: -200, connections: 3, mood: 2 },
  { id: 'diaoyu', text: '路边“搭客”被钓鱼执法，罚300。根叔话：呢啲钱唔好赚。', money: -300, mood: -8, w: 0.5 },
  { id: 'yixian', text: '偶遇《今日一线》街拍，你怒斥黑心商人缺斤短两，播出后电视台给了100线人费。', money: 100, connections: 2, mood: 5 },
  { id: 'tingshui', text: '城中村停水，你拎桶下楼排队接水，胳膊酸了半天。', stamina: -10, mood: -5 },
  { id: 'tingdian', text: '晚上停电，点蜡烛打蚊子，顺手买了20块钱的凉茶降火。', money: -20, mood: -5 },
  { id: 'laoxiang', text: '老乡在城中村开了家湘菜馆，开业去捧场，辣出一身汗，痛快！', money: -50, mood: 8, connections: 3 },
  { id: 'mao', text: '楼下捡到只流浪猫，抱去打疫苗买猫粮，它现在是你档口的招财猫。', money: -30, mood: 10 },
  { id: 'shouji', text: '手机掉进蹲厕，捞是捞回来了，开不了机。咬牙换了台新的。', money: -800, mood: -10, w: 0.3 },
  { id: 'malasong', text: '广马封路，你挤在人群里给跑者加油，顺便跟着跑了两公里。', stamina: -5, mood: 5 },
  { id: 'huinan', text: '回南天，墙上地板全是水，衣服三天晾不干，人都要发霉了。', mood: -6, health: -2 },
  { id: 'qiangcai', text: '听说台风要来，跟着阿婆去市场抢菜，囤了一冰箱，当晚煲了锅老火汤。', money: -60, health: 3, npc: { id: 'apo', favor: 3 } },
  { id: 'zhongjiang', text: '士多买汽水开出“再来一瓶”，根叔当场兑现，周围一片起哄。', money: 10, mood: 5, npc: { id: 'shiduo', favor: 2 } },
  { id: 'shenfenzheng', text: '地铁口被查身份证，查完发现协警是隔壁县老乡，加了微信。', connections: 1, mood: -2 },
  { id: 'guangchangwu', text: '楼下大妈广场舞跳到十一点，你失眠了，早上顶着黑眼圈出门。', stamina: -5, mood: -3 },
  { id: 'xianxue', text: '路过献血车，撸起袖子献了300cc，护士话你血管靓。', health: -5, mood: 8, connections: 1 },
  { id: 'qunyan', text: '剧组在沙面招群演，你演了个茶楼伙计（本色出演），结钱150。', money: 150, mood: 5, stamina: -10 },
  { id: 'shiwu', text: '物业上门查电表，发现你家电表走得飞快，帮你申诉退回多收的80元。', money: 80, mood: 3 },
  { id: 'banshuxue', text: '下班路上买了本《浮生六记》，扉页写着“做个有钱的闲人”，你笑出声。', money: -25, mood: 6 },
  { id: 'lianpeng', text: '两台手机被同一张电话卡盗刷，报警后追回大半，折腾一天。', money: -100, mood: -6 },
  { id: 'jiaren', text: '老家寄来一箱腊味和两罐腐乳，妈妈附了张字条：“照顾自己。”', money: -0, mood: 12, health: 2 },
  { id: 'kanguan', text: '台风天不用出门，你窝在出租屋看了一整天剧，胖了两斤。', mood: 8, stamina: -3 },
  { id: 'kanbing', text: '换季咳嗽，楼下药房买了两盒感冒药花了45，医生还多问了你两句。', money: -45, health: 4 },
  { id: 'qiaodan', text: '前同事转行做保险，拉你聊了半小时年金，你听懂了但没买。', mood: 2, connections: 1 },
  { id: 'gongyong', text: '公厕改造加了第三卫生间，这个城市又细咗一分。', mood: 3 },
  { id: 'jiaming', text: '你在路边写了张求职小广告，被环卫阿姨当垃圾扫走，她又道歉帮你捡回来贴上。', mood: 4, connections: 1 },
  { id: 'kaisi', text: '跟拍档口学讲行话，第一次把“走货”讲对，客人夸你专业。', mood: 5, experience: 5 },
  { id: 'yeguan', text: '在共享单车扫码开锁，链条卡住，蹲在路边修了十分钟。', stamina: -5, mood: -3 },
];
const NPCS = [
  { id: 'apo', name: '陈婆婆', role: '房东阿婆', desc: '西关大屋的包租婆，刀子嘴豆腐心。',
    chapters: [
      { need: 0, title: '初见', text: '“后生，房租交了就有瓦遮头，广州唔会亏待肯捱嘅人。”' },
      { need: 10, title: '煲汤', text: '你帮阿婆提菜上楼，她留你喝老火汤，还讲起后生时在十三行打工的事。' },
      { need: 25, title: '旧钥匙', text: '阿婆把一间小阁楼的钥匙交给你：“得闲上来坐，呢度永远有你张凳。”阁楼免租期+3天。', reward: { housingDays: 3 } },
      { need: 50, title: '契仔契女', text: '街坊都知你是阿婆的“契仔/契女”，在荔湾一带人脉好用，人脉+10。', reward: { connections: 10 } },
    ] },
  { id: 'shiduo', name: '根叔', role: '士多老板', desc: '街口士多店主，消息灵通，赊账本上全是人情。',
    chapters: [
      { need: 0, title: '初见', text: '“要冰水自己拎，熟客先赊账。”根叔上下打量你，算是记住了。' },
      { need: 10, title: '卸货', text: '你帮根叔卸了三箱汽水，他请你吃雪糕，还透露边档口最近咩货好卖。' },
      { need: 25, title: '赊账本', text: '根叔给你开了赊账本，还教你看行情：买卖议价更准了。' },
      { need: 50, title: '老街坊', text: '根叔逢人便夸你，街坊遇到难事都来揾你，人脉+10。', reward: { connections: 10 } },
    ] },
  { id: 'huoji', name: '阿水', role: '茶楼伙计', desc: '陶陶居的年轻伙计，梦想是开自己的早茶档。',
    chapters: [
      { need: 0, title: '初见', text: '“一盅两件，慢慢叹。”阿水斟茶的手势利落，眼里有光。' },
      { need: 10, title: '搭台', text: '早茶高峰你帮阿水搭台传菜，他教你认点心：体力消耗更慢了。' },
      { need: 25, title: '梦想', text: '阿水话想开早茶档，你把打工攒的经验全话俾佢听，佢话你係贵人。心情+10。', reward: { mood: 10 } },
      { need: 50, title: '兄弟档', text: '阿水话以后开档一定留你一股，街坊们都认得你，人脉+10。', reward: { connections: 10 } },
    ] },
  { id: 'xianyi', name: '冼姨', role: '芳村茶档老板娘', desc: '芳村做了三十年茶叶，见人先闻茶香再谈价。',
    chapters: [
      { need: 0, title: '初见', text: '“后生仔，识唔识饮茶？”冼姨一开口就是行话。' },
      { need: 10, title: '闻香', text: '冼姨教你分辨普洱的新旧，从此你进货眼光毒了。' },
      { need: 25, title: '老茶客', text: '冼姨把陈年普洱匀你两饼进货（茶叶+2），还说带你入行。', reward: { give: { id: 'chaye', qty: 2 } } },
      { need: 50, title: '茶行世家', text: '冼姨引你见茶商，人脉+10 buying 茶叶便宜。', reward: { connections: 10 } },
    ] },
  { id: 'laochen', name: '陈伯', role: '白云山护林员', desc: '守了白云山三十年，认得每一条山径。',
    chapters: [
      { need: 0, title: '初见', text: '“唔好行水泥路，行山径，风景好啲。”陈伯递来一根登山杖。' },
      { need: 10, title: '带路', text: '陈伯带你抄近道登摩星岭，体力消耗-2。' },
      { need: 25, title: '半山亭', text: '半山亭泡茶，他讲了一整晚的广州旧事，心情+10。', reward: { mood: 10 } },
      { need: 50, title: '山友', text: '陈伯把你的名字报上山顶碑，阅历大涨，人脉+10。', reward: { connections: 10, experience: 30 } },
    ] },
  { id: 'shunshu', name: '顺叔', role: '珠江游船船夫', desc: '珠江上跑了二十年船，识得每一处潮涨潮落。',
    chapters: [
      { need: 0, title: '初见', text: '“后生，坐稳，珠江嘅风唔讲嘢。”顺叔一撑篙，船就出去了。' },
      { need: 10, title: '睇夜景', text: '顺叔带你看小蛮腰最好的角度，心情+5。', reward: { mood: 5 } },
      { need: 25, title: '搭把手', text: '夜游遇大雨，顺叔和你一起救落水的客人，阅历+10。', reward: { experience: 10 } },
      { need: 50, title: '珠江水客', text: '顺叔的旧水客都认得你，人脉+10。', reward: { connections: 10 } },
    ] },
  { id: 'amai', name: '阿May', role: '十三行档口老板娘', desc: '眼光毒的服装档主，讲话快、笑得多。',
    chapters: [
      { need: 0, title: '初见', text: '“靓仔睇下啦，呢批货全城最平。”阿May把布匹抖到你面前。' },
      { need: 10, title: '睇版', text: '阿May教你睇布料手感，进货眼光+1。' },
      { need: 25, title: '熟客价', text: '阿May给你批发出厂价（服装类买价-10%）。' },
      { need: 50, title: '档口联盟', text: '阿May介绍整条街的档主，人脉+10。' },
    ] },
  { id: 'azhi', name: '枝姐', role: '城中村麻将馆老板娘', desc: '城中村最消息灵通嘅人，什么八卦都知道。',
    chapters: [
      { need: 0, title: '初见', text: '“打两圈啦？”枝姐指了指那张摇着扇子的桌子。' },
      { need: 10, title: '听八卦', text: '枝姐讲了一晚城中村的故事，心情+5。' },
      { need: 25, title: '街坊面子', text: '枝姐同整栋楼的街坊打招呼，你在城中村办事顺畅（人脉+5）。', reward: { connections: 5 } },
      { need: 50, title: '自己人', text: '枝姐认你做街坊，人脉+10，心情+5。', reward: { connections: 10, mood: 5 } },
    ] },
];
// ---------- 谋生线：打工学艺（好感靠行为自然涨，不再有点按钮的互动） ----------
const SKILLS = [
  { id: 'xiaoshou', name: '销售', desc: '每级购入价-2%、售出加价+3%。' },
  { id: 'chuyi', name: '厨艺', desc: '每级休息/吃喝回体+15%。' },
  { id: 'tipu', name: '体魄', desc: '每级体力上限+10，体力活更吃香。' },
  { id: 'jiaoji', name: '交际', desc: '每级街坊互动好感+1。' },
];
const SKILL_LEVELS = [0, 30, 80, 150]; // xp门槛 -> lv0..3
function skillLv(xp) { let lv = 0; SKILL_LEVELS.forEach((t, i) => { if (xp >= t) lv = i; }); return lv; }
function skillOf(state, id) { return skillLv((state.skills?.[id]?.xp) || 0); }
const JOBS = [
  { id: 'banyun', name: '城中村搬运', pay: 120, stamina: 20, desc: '有力气就行，日结。', mood: -2, xp: { tipu: 8 } },
  { id: 'waimai', name: '外卖骑手', pay: 150, stamina: 25, desc: '跑腿全城，涨阅历。', exp: 2, xp: { tipu: 6 } },
  { id: 'shiduo_job', name: '士多帮工', pay: 90, stamina: 15, desc: '根叔照应，顺带涨好感和交际。', npc: { id: 'shiduo', favor: 2 }, xp: { xiaoshou: 6, jiaoji: 5 } },
  { id: 'chalou_job', name: '茶楼跑堂', pay: 100, stamina: 15, desc: '阿水带你，顺带涨好感和交际。', npc: { id: 'huoji', favor: 2 }, xp: { chuyi: 6, jiaoji: 5 } },
  { id: 'wenyuan', name: '文员实习', pay: 150, stamina: 10, desc: '本科可应聘，或人脉≥30走街坊介绍。', edu: '本科', conn: 30, exp: 2, xp: {} },
  { id: 'dangkou', name: '档口销售', pay: 220, stamina: 15, desc: '需销售1级，十三行档口。', skill: { id: 'xiaoshou', lv: 1 }, xp: { xiaoshou: 10 } },
];
const LEARN = [
  { id: 'xiaoshou', cost: 100, stamina: 10, xp: 25, npc: 'amai', desc: '跟阿May学档口议价，她好感+3。' },
  { id: 'chuyi', cost: 100, stamina: 10, xp: 25, npc: 'huoji', desc: '跟阿水学茶楼点心，他好感+3。' },
  { id: 'tipu', cost: 100, stamina: 10, xp: 25, npc: 'laochen', desc: '跟陈伯晨练，他好感+3。' },
  { id: 'jiaoji', cost: 100, stamina: 10, xp: 25, npc: 'azhi', desc: '跟枝姐学点做，她好感+3。' },
];
// 打工路上遇见的真事：心情低会被排挤/被嫌，人脉高有熟客介绍。这是代入感的来源
const WORK_TALES = [
  { id: 'laike', text: '街坊熟客指名要你上门送货，临走塞了20元小费。', cond: s => (s.connections || 0) >= 20, money: 20, mood: 4, exp: 1 },
  { id: 'tongshi', text: '同乡工友顺手带了你一单，分了50元。', cond: s => (s.connections || 0) >= 40, money: 50, exp: 2 },
  { id: 'laoban', text: '老板今天心情好，破天荒多结了15元。', cond: () => true, money: 15, mood: 2 },
  { id: 'xiaofei', text: '货主看你手脚麻利，当场赏了30元。', cond: s => s.mood >= 80, money: 30, mood: 2 },
  { id: 'paiwoi', text: '新来的包工头插队，你排了一下午的活被抢了。', cond: s => (s.connections || 0) < 15, money: -20, mood: -4 },
  { id: 'shouqi', text: '货主嫌你手脚慢，扣了20元。', cond: s => s.mood < 40, money: -20, mood: -3 },
  { id: 'toushu', text: '客人嫌你态度差，当面讲咗两句难听的。', cond: s => s.mood < 40, money: -30, mood: -2 },
  { id: 'fengxue', text: '工友讲你两句风凉话，你冇作声，返到屋企冇咗胃口。', cond: s => s.mood < 40, money: 0, mood: -6 },
];
function rollWorkTale(state) {
  const hit = WORK_TALES.filter(t => t.cond(state));
  if (!hit.length) return null;
  if (Math.random() > 0.4) return null;
  return hit[Math.floor(Math.random() * hit.length)];
}
function grantItem(state, gid, qty) {
  const it = state.inventory[gid] || { qty: 0, cost: 0 };
  const unit = state.prices[gid] || GOOD_MAP[gid]?.base || 0;
  it.qty += qty; it.cost += unit * qty;
  state.inventory[gid] = it;
}
// NPC章节奖励（配置驱动）
function applyReward(state, r) {
  if (!r) return;
  if (r.connections) state.connections += r.connections;
  if (r.mood) state.mood = Math.min(100, state.mood + r.mood);
  if (r.health) state.health = Math.min(100, state.health + r.health);
  if (r.experience) state.experience += r.experience;
  if (r.housingDays) state.housingFreeDays = (state.housingFreeDays || 0) + r.housingDays;
  if (r.give) grantItem(state, r.give.id, r.give.qty);
}
// 地标掉落引擎：行为累积进度，满足门槛后按 chance 自然掉卡
function tryDrop(state, act, where, npcId) {
  if (!state.pc) state.pc = {};
  const got = [];
  for (const lm of LANDMARKS) {
    if (state.photos[lm.id]) continue;
    const d = lm.drop;
    if (!d || d.act !== act) continue;
    if (d.where && d.where !== where) continue;
    if (d.npc && d.npc !== npcId) continue;
    const key = lm.id;
    state.pc[key] = (state.pc[key] || 0) + 1;
    if (state.pc[key] < d.need) continue;
    if (checkReq(state, d.req)) continue;
    // 保底：门槛满足后还连空8次，第9次必掉，不让非酋等死
    const over = state.pc[key] - d.need;
    if (over >= 8 || Math.random() < d.chance) {
      state.photos[lm.id] = state.day;
      state.experience += 5;
      state.mood = Math.min(100, state.mood + 3);
      state.timeline.push(`第${state.day}天：[[lm:${lm.id}]]路过${lm.name}，按下快门（${lm.desc}）`);
      got.push(lm);
    }
  }
  return got;
}
// 被动涨好感：买什么货、干什么活，自然跟对应街坊混熟。roll 中才涨，返回记录供前端 toast
const CAT_NPC = { '服装织绣': 'amai', '茶药': 'xianyi', '生鲜食品': 'huoji', '数码日用': 'shiduo', '文玩收藏': 'azhi' };
function favorTo(state, npcId, base, p, fz) {
  if (Math.random() >= p) return;
  if (!state.npc[npcId]) state.npc[npcId] = { favor: 0 };
  const amt = favorGain(state, base);
  state.npc[npcId].favor += amt;
  const def = NPCS.find(x => x.id === npcId);
  if (fz && def) fz.push({ name: def.name, amt });
  // 章节解锁照常
  const before = state.npc[npcId].favor - amt;
  for (const ch of def.chapters) {
    if (before < ch.need && state.npc[npcId].favor >= ch.need) {
      state.timeline.push(`第${state.day}天：${def.name} · ${ch.title}——${ch.text}`);
      applyReward(state, ch.reward);
    }
  }
}
function grant(state, aid) {
  if (!state.achievements.includes(aid)) {
    state.achievements.push(aid);
    const a = ACHIEVEMENTS.find(x => x.id === aid);
    state.timeline.push(`第${state.day}天：达成成就「${a ? a.name : aid}」！`);
  }
}
function checkAch(state) {
  const photoCount = Object.keys(state.photos || {}).length;
  if (photoCount >= 1) grant(state, 'first-photo');
  if (photoCount >= 6) grant(state, 'photo-6');
  if (photoCount >= 12) grant(state, 'photo-12');
  if (state.money >= 10000) grant(state, 'rich-10k');
  if (state.day >= 7) grant(state, 'week-7');
  if (Object.keys(state.visited || {}).length >= 6) grant(state, 'all-dist');
  const favors = Object.values(state.npc || {}).map(n => n.favor || 0);
  if (favors.some(f => f >= 25)) grant(state, 'npc-25');
  if (favors.length === NPCS.length && favors.every(f => f >= 25)) grant(state, 'npc-all');
  if ((state.stats?.jobs || 0) >= 1) grant(state, 'job-first');
  const sk = Object.values(state.skills || {}).map(s => skillLv(s.xp || 0));
  if (sk.some(l => l >= 1)) grant(state, 'skill-1');
  // 累计型（全部读现成字段）
  if (state.money >= 50000) grant(state, 'rich-50k');
  if (state.money >= 200000) grant(state, 'rich-200k');
  if ((state.stats?.jobs || 0) >= 20) grant(state, 'work-20');
  if ((state.stats?.jobs || 0) >= 50) grant(state, 'work-50');
  if ((state.stats?.learns || 0) >= 5) grant(state, 'learn-5');
  if ((state.stats?.learns || 0) >= 15) grant(state, 'learn-15');
  if (photoCount >= 8) grant(state, 'photo-8');
  if (photoCount >= 14) grant(state, 'photo-14');
  if (favors.some(f => f >= 100)) grant(state, 'npc-100');
  if (state.day >= 100) grant(state, 'day-100');
}

function nanoid16() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16);
}
function genBase() {
  const b = {};
  for (const g of GOODS) b[g.id] = 1 + (Math.random() * 2 - 1) * g.vol; // 1±vol
  return b;
}
function recompute(state) {
  const p = {};
  for (const g of GOODS) {
    const distF = state.district === g.origin ? 0.85 : 1; // 产地便宜15%
    const mod = state.mods?.[g.id]?.mult || 1;
    p[g.id] = Math.max(1, Math.round(g.base * (state.priceBase[g.id] || 1) * distF * mod));
  }
  state.prices = p;
}
function newDayPrices(state) {
  state.priceBase = genBase();
  // 行情事件效果逐天衰减
  for (const [gid, m] of Object.entries(state.mods || {})) {
    m.days -= 1;
    if (m.days <= 0) delete state.mods[gid];
  }
  recompute(state);
}
function newState(identity, gender, name) {
  const cfg = IDENTITIES[identity];
  const st = {
    id: nanoid16(), version: 1, day: 1,
    character: { identity, gender, name },
    money: cfg.money, health: 100, stamina: 100, mood: 80,
    connections: cfg.connections, experience: 0,
    housing: HOUSING_LVLS[cfg.startLv].name, houseLv: cfg.startLv, housingFreeDays: 7,
    district: '天河', inventory: {}, prices: {}, priceBase: {}, mods: {},
    visited: { '天河': 1 }, eventsSeen: [], photos: {}, achievements: [],
    npc: Object.fromEntries(NPCS.map(n => [n.id, { favor: 0 }])),
    skills: Object.fromEntries(SKILLS.map(s => [s.id, { xp: 0 }])), jobs: {}, jobsToday: { day: 0, n: 0 },
    stats: { jobs: 0, learns: 0 }, boughtToday: {}, pc: {}, recaps: [],
    timeline: [`第1天：${name}来到广州，落脚${'天河'}。`],
  };
  newDayPrices(st);
  return st;
}
function loadSave(id) {
  const safe = /^[A-Z0-9-]{19}$/.test(id) ? id : null;
  if (!safe) return null;
  const f = path.join(SAVES_DIR, safe + '.json');
  if (!fs.existsSync(f)) return null;
  const st = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!st.photos) st.photos = {};
  if (!st.achievements) st.achievements = [];
  if (!st.eventsSeen) st.eventsSeen = [];
  if (!st.npc) st.npc = {};
  for (const n of NPCS) if (!st.npc[n.id]) st.npc[n.id] = { favor: 0 };
  if (!st.skills) st.skills = {};
  for (const s of SKILLS) if (!st.skills[s.id]) st.skills[s.id] = { xp: 0 };
  if (!st.jobs) st.jobs = {};
  if (!st.jobsToday) st.jobsToday = { day: 0, n: 0 };
  if (!st.stats) st.stats = { jobs: 0, learns: 0, stalls: 0 };
  if (st.stats.stalls === undefined) st.stats.stalls = 0;
  if (st.stalledDay === undefined) st.stalledDay = 0;
  if (!st.shops) st.shops = [];
  if (!st.venues) st.venues = {};
  if (!st.boughtToday) st.boughtToday = {};
  if (!st.caifengDay) st.caifengDay = { day: 0, n: 0 };
  if (st.bagLv === undefined) st.bagLv = 0;
  if (st.houseLv === undefined) st.houseLv = (st.character.identity === 'bendi' ? 2 : st.character.identity === 'daxuesheng' ? 1 : 0);
  if (!st.housing || st.housingFreeDays > 100) { st.housing = houseOf(st).name; st.housingFreeDays = Math.min(st.housingFreeDays || 0, 7); }
  if (st.pc === undefined) st.pc = {};
  if (!st.recaps) st.recaps = [];
  if (st.snackDay === undefined) st.snackDay = { day: 0, used: {} };
  // 老档背包迁移：{gid: 数量} -> {gid: {qty, cost}}，成本按现价估
  for (const [gid, v] of Object.entries(st.inventory || {})) {
    if (typeof v === 'number') {
      st.inventory[gid] = { qty: v, cost: Math.round(((st.prices || {})[gid] || GOOD_MAP[gid]?.base || 0) * v) };
    }
  }
  if (!st.priceBase) st.priceBase = {};
  if (!st.mods) st.mods = {};
  if (!st.prices || Object.keys(st.prices).length < GOODS.length) newDayPrices(st);
  else recompute(st);
  return st;
}
function writeSave(state) {
  const f = path.join(SAVES_DIR, state.id + '.json');
  // 备份最近5次
  for (let i = 5; i >= 2; i--) {
    const a = f + '.bak' + (i - 1), b = f + '.bak' + i;
    if (fs.existsSync(a)) fs.renameSync(a, b);
  }
  if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak1');
  state.version += 1; state.updatedAt = Date.now();
  fs.writeFileSync(f, JSON.stringify(state, null, 2));
  db.prepare(`INSERT INTO snapshots(id,name,identity,money,day,updatedAt,photos,favor)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,money=excluded.money,day=excluded.day,updatedAt=excluded.updatedAt,photos=excluded.photos,favor=excluded.favor`)
    .run(state.id, state.character.name, state.character.identity, state.money, state.day, Date.now(),
      Object.keys(state.photos || {}).length, Object.values(state.npc || {}).reduce((s, n) => s + (n.favor || 0), 0));
}
function nextDay(state, { moveTo, buy, sell, rest }) {
  const m0 = state.money, s0 = state.stamina, h0 = state.health, mo0 = state.mood;
  const recap = { lines: [] };
  const fzDay = [];
  // 移动
  if (moveTo && DISTRICTS.includes(moveTo)) {
    state.district = moveTo;
    state.visited[moveTo] = (state.visited[moveTo] || 0) + 1;
    state.stamina = Math.max(0, state.stamina - moveCost(state));
    state.experience += 2;
    recompute(state); // 换区即时体现产地价
  }
  // 买卖（按当日价格结算，服务端权威；买入仅限本地有售，卖出不限）
  for (const [gid, qty] of Object.entries(buy || {})) {
    const q = Math.floor(Number(qty) || 0);
    if (q <= 0) continue;
    if (!GOOD_MAP[gid]?.sell?.includes(state.district)) continue;
    if (bagQty(state.inventory) + q > bagCap(state)) continue;
    const left = stockLeft(state, gid);
    if (q > left) continue;
    if (state.stamina < carryCost(q)) continue;
    const unit = Math.round((state.prices[gid] || 0) * buyMult(state));
    const cost = unit * q;
    if (cost <= state.money) {
      state.money -= cost;
      state.stamina -= carryCost(q);
      const it = state.inventory[gid] || { qty: 0, cost: 0 };
      it.qty += q; it.cost += cost;
      state.inventory[gid] = it;
      state.boughtToday[gid] = ((state.boughtToday || {})[gid] || 0) + q;
      const cnpc = CAT_NPC[GOOD_MAP[gid]?.cat];
      if (cnpc) favorTo(state, cnpc, 1, 0.5, fzDay);
    }
  }
  for (const [gid, qty] of Object.entries(sell || {})) {
    const q = Math.floor(Number(qty) || 0);
    const it = state.inventory[gid];
    const have = it?.qty || 0;
    const real = Math.min(q, have);
    if (real <= 0) continue;
    const avg = have ? it.cost / have : 0;
    it.qty = have - real;
    it.cost = Math.round(avg * it.qty);
    state.money += sellPrice(state, gid) * real;
  }
  if (rest) { state.stamina = Math.min(staminaCap(state), state.stamina + recover(state, houseOf(state).rest)); state.health = Math.min(100, state.health + 5); }
  // 过一天
  state.day += 1;
  state.boughtToday = {};
  // 不再固定扣体力：消耗只来自行为，休闲玩家不做事就不掉
  if (state.stamina <= 0) state.health = Math.max(0, state.health - 10);
  // 健康归零强制住院3天
  if (state.health <= 0) {
    state.money = Math.max(0, state.money - 2000);
    state.day += 2;
    state.housingFreeDays = Math.max(0, (state.housingFreeDays || 0) - 2);
    state.health = 60; state.stamina = 30;
    state.timeline.push(`第${state.day}天：累倒住院3天，医药费2000元。身体是本钱。`);
    recap.lines.push(['住院医药费', -2000]);
  }
  // 交费：免费期过后按周收（租房叫房租，买房叫物业费），交不起就欠费掉心情、掉阿婆好感
  const hl = houseOf(state);
  if (state.housingFreeDays > 0) {
    state.housingFreeDays -= 1;
    if (state.housingFreeDays === 2)
      state.timeline.push(`第${state.day}天：房东话，${hl.name}${hl.fee}元/周（${hl.feeLabel}），2天后到期。`);
  } else if (state.day % 7 === 0) {
    if (state.money >= hl.fee) {
      state.money -= hl.fee;
      const bonus = 5 + Math.floor(Math.random() * 6);
      if (!state.npc.apo) state.npc.apo = { favor: 0 };
      state.npc.apo.favor += bonus;
      fzDay.push({ name: '陈婆婆', amt: bonus });
      state.timeline.push(`第${state.day}天：交${hl.feeLabel}${hl.fee}元（${hl.name}），阿婆笑得合不拢嘴，好感+${bonus}。`);
      recap.lines.push([hl.feeLabel, -hl.fee]);
    } else {
      state.mood = Math.max(0, state.mood - 15);
      if (state.npc?.apo) state.npc.apo.favor = Math.max(0, state.npc.apo.favor - 10);
      state.timeline.push(`第${state.day}天：交不起${hl.fee}元${hl.feeLabel}，阿婆脸色难看，心情-15、阿婆好感-10。`);
    }
  }
  // 饮食开销每天20
  state.money = Math.max(0, state.money - 20);
  recap.lines.push(['一日三餐', -20]);
  state.mood = Math.max(0, Math.min(100, state.mood + (Math.random() < 0.5 ? -3 : 2)));
  newDayPrices(state);
  const news = [];
  // 生鲜易腐：按损耗率烂掉一部分
  for (const [gid, qty] of Object.entries(state.inventory || {})) {
    const g = GOOD_MAP[gid];
    const it = qty;
    if (g?.perish > 0 && it?.qty > 0) {
      const loss = Math.floor(it.qty * g.perish);
      if (loss > 0) {
        const keep = it.qty - loss;
        it.cost = Math.round(it.cost * keep / it.qty);
        it.qty = keep;
        state.timeline.push(`第${state.day}天：${g.name}坏掉了${loss}份，好心疼。`);
      }
    }
  }
  // 节令日历：30天一轮，到点自动上行情
  const cyc = state.day % 30;
  for (const f of FESTIVALS) {
    if (cyc === f.start) {
      for (const [gid, mult] of Object.entries(f.effects)) state.mods[gid] = { mult, days: f.days };
      recompute(state);
      state.timeline.push(`第${state.day}天【节令】${f.name}：${f.desc}（${f.days}天）`);
      recap.lines.push(['节令·' + f.name, 0]);
      news.push({ type: 'fest', name: f.name, days: f.days, desc: f.desc });
    }
  }
  // 行情事件 15%：影响指定商品价格N天，写入图鉴
  if (Math.random() < 0.15) {
    const unseen = MARKET_EVENTS.filter(e => !state.eventsSeen.includes(e.id));
    const pool = unseen.length ? unseen : MARKET_EVENTS;
    const mev = pool[Math.floor(Math.random() * pool.length)];
    if (!state.eventsSeen.includes(mev.id)) state.eventsSeen.push(mev.id);
    for (const [gid, mult] of Object.entries(mev.effects)) state.mods[gid] = { mult, days: mev.days };
    recompute(state);
    const names = Object.keys(mev.effects).map(gid => GOOD_MAP[gid]?.name || gid).join('、');
    state.timeline.push(`第${state.day}天【行情】${mev.text}（${names}，持续${mev.days}天）`);
    recap.lines.push(['行情·' + names, 0]);
    news.push({
      type: 'market', text: mev.text, days: mev.days, eid: mev.id,
      photo: null, district: GOOD_MAP[Object.keys(mev.effects)[0]]?.origin || state.district,
      goods: Object.entries(mev.effects).map(([gid, m]) => ({ id: gid, name: GOOD_MAP[gid]?.name || gid, mult: m, days: mev.days })),
    });
  }
  // 生活事件 18%：优先未见过的，写入图鉴
  if (Math.random() < 0.18) {
    const unseen = EVENTS.filter(e => !state.eventsSeen.includes(e.id));
    const pool = unseen.length ? unseen : EVENTS;
    let tot = pool.reduce((s, e) => s + (e.w || 1), 0), r = Math.random() * tot, ev = pool[0];
    for (const e of pool) { r -= (e.w || 1); if (r <= 0) { ev = e; break; } }
    if (!state.eventsSeen.includes(ev.id)) state.eventsSeen.push(ev.id);
    state.money = Math.max(0, state.money + (ev.money || 0));
    state.health = Math.max(0, Math.min(100, state.health + (ev.health || 0)));
    state.stamina = Math.max(0, Math.min(staminaCap(state), state.stamina + (ev.stamina || 0)));
    state.mood = Math.max(0, Math.min(100, state.mood + (ev.mood || 0)));
    state.connections += (ev.connections || 0);
    if (ev.npc) favorTo(state, ev.npc.id, ev.npc.favor, 1, fzDay);
    state.timeline.push(`第${state.day}天：${ev.text}`);
    if (ev.money) recap.lines.push(['事件·' + ev.text.slice(0, 10) + '…', ev.money]);
    const eff = {};
    for (const k of ['money', 'health', 'mood', 'stamina', 'connections']) if (ev[k]) eff[k] = ev[k];
    news.push({ type: 'life', text: ev.text, eff, eid: ev.id });
  }
  // 兜底救济：钱体力双枯竭时街坊接济，7天一次
  if (state.money <= 0 && state.stamina < 15 && state.day - (state.lastRelief || 0) >= 7) {
    state.money += 50;
    state.lastRelief = state.day;
    state.timeline.push(`第${state.day}天：街坊看你落魄，凑了50元塞给你：“后生，冇饿亲自己。”`);
    recap.lines.push(['街坊接济', 50]);
  }
  checkAch(state);
  const dayDrops = tryDrop(state, 'day', state.district);
  if (state.district === '白云') favorTo(state, 'laochen', 1, 0.5, fzDay);
  // 事件弹窗配图：掉了卡就用那张卡当主角，否则用当日所在城区的景
  for (const n of news) {
    n.photo = dayDrops.length ? dayDrops[0].id : null;
    n.district = state.district;
  }
  checkAch(state);
  recap.money = state.money - m0;
  recap.stamina = state.stamina - s0;
  recap.health = state.health - h0;
  recap.mood = state.mood - mo0;
  state.recaps.push({ day: state.day, money: recap.money, stamina: recap.stamina, mood: recap.mood, health: recap.health, lines: recap.lines });
  if (state.recaps.length > 7) state.recaps = state.recaps.slice(-7);
  state.timeline.push(`第${state.day}天：在${state.district}，余钱${state.money}。`);
  if (state.timeline.length > 100) state.timeline = state.timeline.slice(-100);
  return { state, recap, news, fz: fzDay };
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}
function readBody(req) {
  return new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(s)); });
}
// 请求体解析：空体当 {}；非法 JSON / null / 数组 一律返回 null，由路由回 400（别抛成 500 刷错误日志）
async function readJson(req) {
  const t = (await readBody(req)).trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  } catch { return null; }
}
const server = http.createServer(async (req, res) => {
  // request-target 畸形（// 、/\ 、/// 等协议相对形式）会让 new URL 直接抛错，
  // 这一句必须放在 try 外面自己兜住，否则一个请求就能打死整个服务（存档瞬间全不可达）
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { return send(res, 400, '{"error":"bad request"}'); }
  try {
    if (req.method === 'POST' && url.pathname === '/api/new') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { identity, gender, name } = body;
      if (!IDENTITIES[identity]) return send(res, 400, '{"error":"bad identity"}');
      if (!['male', 'female'].includes(gender)) return send(res, 400, '{"error":"bad gender"}');
      const nm = String(name || '').trim().slice(0, 6) || RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
      const st = newState(identity, gender, nm);
      writeSave(st);
      return send(res, 200, JSON.stringify({ id: st.id, state: st }));
    }
    if (req.method === 'GET' && url.pathname === '/api/load') {
      const st = loadSave(url.searchParams.get('id') || '');
      if (!st) return send(res, 404, '{"error":"存档不存在，检查ID"}');
      return send(res, 200, JSON.stringify({ state: st }));
    }
    if (req.method === 'POST' && url.pathname === '/api/save') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { id, version, state } = body;
      const cur = loadSave(id);
      if (!cur) return send(res, 404, '{"error":"存档不存在"}');
      if (state && state.version !== cur.version) return send(res, 409, JSON.stringify({ error: '版本冲突，存档已在别处更新，请先读档', serverVersion: cur.version }));
      Object.assign(cur, state || {}, { id: cur.id });
      writeSave(cur);
      return send(res, 200, JSON.stringify({ ok: true, version: cur.version }));
    }
    if (req.method === 'POST' && url.pathname === '/api/trade') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { id, buy, sell } = body;
      const cur = loadSave(id);
      if (!cur) return send(res, 404, '{"error":"存档不存在"}');
      let b = 0, s = 0; const noStock = []; const limitMsg = [];
      for (const [gid, qty] of Object.entries(buy || {})) {
        const q = Math.floor(Number(qty) || 0);
        if (q <= 0) continue;
        if (!GOOD_MAP[gid]?.sell?.includes(cur.district)) { noStock.push(GOOD_MAP[gid]?.name || gid); continue; }
        if (bagQty(cur.inventory) + q > bagCap(cur)) { limitMsg.push(`背包满(${bagCap(cur)}件)`); continue; }
        const left = stockLeft(cur, gid);
        if (q > left) { limitMsg.push(`${GOOD_MAP[gid].name}今日仅剩${Math.max(0, left)}件`); continue; }
        const need = carryCost(q);
        if (cur.stamina < need) { limitMsg.push(`体力不够（搬${q}件要${need}体）`); continue; }
        const unit = Math.round((cur.prices[gid] || 0) * buyMult(cur));
        const cost = unit * q;
        if (cost <= cur.money) {
          cur.money -= cost;
          cur.stamina -= need;
          const it = cur.inventory[gid] || { qty: 0, cost: 0 };
          it.qty += q; it.cost += cost;
          cur.inventory[gid] = it; b += cost;
          cur.boughtToday[gid] = ((cur.boughtToday || {})[gid] || 0) + q;
        }
      }
      for (const [gid, qty] of Object.entries(sell || {})) {
        const q = Math.floor(Number(qty) || 0);
        const it = cur.inventory[gid];
        const have = it?.qty || 0;
        const real = Math.min(q, have);
        if (real <= 0) continue;
        const avg = have ? it.cost / have : 0;
        it.qty = have - real;
        it.cost = Math.round(avg * it.qty);
        cur.money += sellPrice(cur, gid) * real; s += sellPrice(cur, gid) * real;
      }
      if (b || s) {
        const drops = [];
        const fz = [];
        if (b) {
          drops.push(...tryDrop(cur, 'buy', cur.district));
          const npcs = new Set(Object.keys(buy).map(gid => CAT_NPC[GOOD_MAP[gid]?.cat]).filter(Boolean));
          npcs.forEach(npc => favorTo(cur, npc, 1, 0.5, fz));
        }
        if (s) drops.push(...tryDrop(cur, 'sell', cur.district));
        if (cur.district === '海珠' && (b || s)) favorTo(cur, 'shunshu', 1, 0.5, fz);
        cur.timeline.push(`第${cur.day}天：买入${b} / 卖出获${s}。`);
        checkAch(cur); writeSave(cur);
        const resp = { state: cur };
        if (drops.length) resp.drops = drops.map(d => d.id);
        if (fz.length) resp.fz = fz;
        return send(res, 200, JSON.stringify(resp));
      }
      if (limitMsg.length) return send(res, 400, JSON.stringify({ error: limitMsg.join('；') }));
      if (noStock.length) {
        const hint = noStock.map(nm => {
          const g = GOODS.find(x => x.name === nm);
          return `${nm}(去${g ? g.sell.filter(d => d !== cur.district).join('/') : '产地'})`;
        }).join('、');
        return send(res, 400, JSON.stringify({ error: `${cur.district}无货：${hint}` }));
      }
      return send(res, 200, JSON.stringify({ state: cur }));
    }
    if (req.method === 'POST' && url.pathname === '/api/next-day') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { id, moveTo, buy, sell, rest } = body;
      const cur = loadSave(id);
      if (!cur) return send(res, 404, '{"error":"存档不存在"}');
      const r = nextDay(cur, { moveTo, buy, sell, rest });
      writeSave(cur);
      return send(res, 200, JSON.stringify({ state: cur, recap: r.recap, news: r.news, fz: r.fz }));
    }
    if (req.method === 'GET' && url.pathname === '/api/rank') {
      const type = url.searchParams.get('type') || 'money';
      // col 三选一白名单（拼进 SQL 的只能是这三个），回显也用收敛后的 col，别把用户串原样吐回去
      const col = type === 'photos' ? 'photos' : type === 'favor' ? 'favor' : 'money';
      const unit = type === 'photos' ? '张' : type === 'favor' ? '好感' : '元';
      const rows = db.prepare(`SELECT id,name,identity,money,day,photos,favor FROM snapshots ORDER BY ${col} DESC LIMIT 20`).all()
        .map(r => ({ ...r, id: r.id.slice(0, 4) + '****', unit, val: r[col] }));
      return send(res, 200, JSON.stringify({ rank: rows, type: col }));
    }
    if (req.method === 'POST' && url.pathname === '/api/work') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { id, job } = body;
      const cur = loadSave(id);
      if (!cur) return send(res, 404, '{"error":"存档不存在"}');
      const def = JOBS.find(x => x.id === job);
      if (!def) return send(res, 400, '{"error":"未知工作"}');
      // 一天一份工：打工即"这天花掉一天"，和摆摊/开档同为每日1次
      if (!cur.jobsToday || cur.jobsToday.day !== cur.day) cur.jobsToday = { day: cur.day, n: 0 };
      if (cur.jobsToday.n >= 1) return send(res, 400, '{"error":"一天打一份工，明天再来"}');
      const edu = IDENTITIES[cur.character.identity].edu;
      if (def.edu && edu !== def.edu) {
        if (!(def.conn && (cur.connections || 0) >= def.conn))
          return send(res, 400, JSON.stringify({ error: `需${def.edu}学历，或人脉≥${def.conn}走街坊介绍` }));
      }
      if (def.skill) {
        const lv = skillOf(cur, def.skill.id);
        if (lv < def.skill.lv) return send(res, 400, JSON.stringify({ error: `需${(SKILLS.find(x => x.id === def.skill.id) || {}).name}${def.skill.lv}级` }));
      }
      if (cur.stamina < def.stamina) return send(res, 400, '{"error":"体力不足，先休息"}');
      cur.stamina -= def.stamina;
      // 熟练度：每干1次该工种+2%工资，封顶+60%
      if (!cur.jobs) cur.jobs = {};
      const n = (cur.jobs[def.id] || 0) + 1;
      cur.jobs[def.id] = n;
      const prof = 1 + Math.min(0.6, 0.02 * n);
      const pay = Math.round(def.pay * incomeMult(cur) * prof);
      cur.money += pay;
      cur.mood = Math.max(0, Math.min(100, cur.mood + (def.mood || 0)));
      cur.experience += (def.exp || 1);
      for (const [sk, xp] of Object.entries(def.xp || {})) {
        const before = skillOf(cur, sk);
        cur.skills[sk].xp += xp;
        if (skillOf(cur, sk) > before)
          cur.timeline.push(`第${cur.day}天：${(SKILLS.find(x => x.id === sk) || {}).name}升到${skillOf(cur, sk)}级！`);
      }
      const fz = [];
      if (def.npc) favorTo(cur, def.npc.id, def.npc.favor, 0.5, fz);
      if (job === 'banyun' || job === 'waimai') favorTo(cur, 'azhi', 1, 0.5, fz);
      cur.stats.jobs += 1;
      cur.jobsToday.n += 1;
      if (n === 10) cur.timeline.push(`第${cur.day}天：「${def.name}」干满10次，熟手了，工资+20%。`);
      if (n === 30) cur.timeline.push(`第${cur.day}天：「${def.name}」干满30次，街坊都叫你老师傅。`);
      cur.timeline.push(`第${cur.day}天：打工「${def.name}」，赚${pay}元。`);
      // 打工遇见的真事：心情/人脉决定的处境
      const tale = rollWorkTale(cur);
      if (tale) {
        cur.money = Math.max(0, cur.money + (tale.money || 0));
        if (tale.mood) cur.mood = Math.max(0, Math.min(100, cur.mood + tale.mood));
        if (tale.exp) cur.experience += tale.exp;
        cur.timeline.push(`第${cur.day}天：${tale.text}`);
        cur.workTale = { day: cur.day, text: tale.text, money: tale.money || 0 };
      }
      const drops = tryDrop(cur, 'work');
      checkAch(cur); writeSave(cur);
      const resp = { state: cur };
      if (drops.length) resp.drops = drops.map(d => d.id);
      if (tale) resp.tale = cur.workTale;
      if (fz.length) resp.fz = fz;
      return send(res, 200, JSON.stringify(resp));
    }
    if (req.method === 'POST' && url.pathname === '/api/learn') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { id, skill } = body;
      const cur = loadSave(id);
      if (!cur) return send(res, 404, '{"error":"存档不存在"}');
      const def = LEARN.find(x => x.id === skill);
      if (!def || !cur.skills[skill]) return send(res, 400, '{"error":"未知技能"}');
      if (cur.money < def.cost) return send(res, 400, '{"error":"钱不够"}');
      if (cur.stamina < def.stamina) return send(res, 400, '{"error":"体力不足，先休息"}');
      const before = skillLv(cur.skills[skill].xp);
      cur.money -= def.cost; cur.stamina -= def.stamina;
      cur.skills[skill].xp += def.xp;
      cur.stats.learns += 1;
      const after = skillLv(cur.skills[skill].xp);
      const skName = (SKILLS.find(x => x.id === skill) || {}).name || skill;
      const fz = [];
      if (def.npc && cur.npc[def.npc]) favorTo(cur, def.npc, 3, 0.7, fz);
      cur.timeline.push(`第${cur.day}天：学艺${skName}+${def.xp}经验。`);
      if (after > before) cur.timeline.push(`第${cur.day}天：${skName}升到${after}级！`);
      checkAch(cur); writeSave(cur);
      const resp = { state: cur };
      if (fz.length) resp.fz = fz;
      return send(res, 200, JSON.stringify(resp));
    }
    if (req.method === 'POST' && url.pathname === '/api/upgrade-bag') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { id } = body;
      const cur = loadSave(id);
      if (!cur) return send(res, 404, '{"error":"存档不存在"}');
      const lv = cur.bagLv || 0;
      if (lv >= BAG_LVLS.length - 1) return send(res, 400, '{"error":"已经是面包车了"}');
      const next = BAG_LVLS[lv + 1];
      if (cur.money < next.cost) return send(res, 400, JSON.stringify({ error: `钱不够，还差${next.cost - cur.money}元` }));
      cur.money -= next.cost;
      cur.bagLv = lv + 1;
      cur.timeline.push(`第${cur.day}天：换上「${next.name}」（${next.cap}件），花${next.cost}元。`);
      writeSave(cur);
      return send(res, 200, JSON.stringify({ state: cur }));
    }
    if (req.method === 'POST' && url.pathname === '/api/upgrade-house') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { id } = body;
      const cur = loadSave(id);
      if (!cur) return send(res, 404, '{"error":"存档不存在"}');
      const lv = cur.houseLv || 0;
      if (lv >= HOUSING_LVLS.length - 1) return send(res, 400, '{"error":"已经住上珠江别墅了"}');
      const cost = HOUSING_LVLS[lv].upCost;
      const next = HOUSING_LVLS[lv + 1];
      if (cur.money < cost) return send(res, 400, JSON.stringify({ error: `钱不够，还差${cost - cur.money}元` }));
      cur.money -= cost;
      cur.houseLv = lv + 1;
      cur.housing = next.name;
      cur.timeline.push(`第${cur.day}天：搬进「${next.name}」（休息+${next.rest}，${next.feeLabel}${next.fee}元/周），花${cost}元${HOUSING_LVLS[lv].upLabel}。`);
      writeSave(cur);
      return send(res, 200, JSON.stringify({ state: cur }));
    }
    if (req.method === 'POST' && url.pathname === '/api/snack') {
      const body = await readJson(req);
      if (!body) return send(res, 400, '{"error":"bad json"}');
      const { id, snack } = body;
      const cur = loadSave(id);
      if (!cur) return send(res, 404, '{"error":"存档不存在"}');
      const def = SNACKS.find(x => x.id === snack);
      if (!def) return send(res, 400, '{"error":"未知小吃"}');
      if (!cur.snackDay || cur.snackDay.day !== cur.day) cur.snackDay = { day: cur.day, used: {} };
      if (cur.snackDay.used[snack]) return send(res, 400, '{"error":"今天吃过这个了"}');
      if (cur.money < def.cost) return send(res, 400, '{"error":"钱不够"}');
      cur.money -= def.cost;
      cur.stamina = Math.min(staminaCap(cur), cur.stamina + recover(cur, def.stamina));
      if (def.mood) cur.mood = Math.min(100, cur.mood + def.mood);
      cur.snackDay.used[snack] = 1;
      cur.timeline.push(`第${cur.day}天：${def.name}下肚，回${def.stamina}体力。`);
      writeSave(cur);
      return send(res, 200, JSON.stringify({ state: cur }));
    }
    if (url.pathname === '/api/ping') {
      console.log(`[ping] cv=${url.searchParams.get('cv')} ip=${req.socket.remoteAddress}`);
      return send(res, 200, '{"ok":true}');
    }
    if (url.pathname === '/api/clientlog') {
      console.log(`[clientlog] ${url.searchParams.get('msg')} ip=${req.socket.remoteAddress}`);
      return send(res, 200, '{"ok":true}');
    }
    if (req.method === 'GET' && url.pathname === '/api/meta') {
      return send(res, 200, JSON.stringify({ IDENTITIES, DISTRICTS, GOODS, LANDMARKS, ACHIEVEMENTS, EVENTS: EVENTS.concat(MARKET_EVENTS), NPCS, SKILLS, JOBS, LEARN, BAG_LVLS, HOUSING_LVLS, STOCKS, SELL_RATE_HOME, SELL_RATE_AWAY, SNACKS, FESTIVALS, rev: SERVER_V }));
    }
    // 静态文件：HTML/JS/CSS 禁缓存，玩家永远拿到最新版，不用 Ctrl+F5
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const f = path.join(PUBLIC_DIR, decodeURIComponent(p));
    if (!f.startsWith(PUBLIC_DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory())
      return send(res, 404, 'not found', 'text/plain');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(f)] || 'text/plain',
      'Cache-Control': 'no-store',
    });
    res.end(fs.readFileSync(f));
  } catch (e) {
    // 已经发过响应头就别再 send（会抛二次异常把进程带走）
    if (res.headersSent) { try { res.end(); } catch { } return; }
    send(res, 500, JSON.stringify({ error: String(e.message || e) }));
  }
});
server.listen(3000, () => console.log('广州浮生记 MVP running at http://localhost:3000'));

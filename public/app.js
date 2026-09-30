let META, S = null, selId = 'bendi', selGender = 'male';
const DIFF_ORDER = { '易': 0, '中': 1, '难': 2 };
function checkName() {
  const ok = $('pname').value.trim().length > 0;
  $('btn-new').disabled = !ok;
  return ok;
}
const APP_V = 36;
const $ = id => document.getElementById(id);
// 老版本 DOM 缺新容器时跳过，不抛异常（否则时间线之后的代码全灭、弹窗全无）
function setH(id, html) { const e = $(id); if (e) e.innerHTML = html; return !!e; }
const NAMES = ['陈嘉穗','梁浩添','黄思齐','林晓桐','苏曼华','郑建邦'];
const DIST_IMG = { '天河': 'tianhe', '越秀': 'yuexiu', '荔湾': 'liwan', '海珠': 'haizhu', '白云': 'baiyun', '番禺': 'panyu' };
const IQ = gid => (S.inventory[gid]?.qty || 0);
const AVG = gid => { const it = S.inventory[gid]; return it?.qty ? Math.round(it.cost / it.qty) : 0; };
const BUYM = () => (S.health < 30 ? 1.2 : S.health < 60 ? 1.1 : 1) * (S.connections >= 50 ? 0.95 : 1) * (1 - 0.02 * SKILL('xiaoshou'));
const INCM = () => 0.8 + (S.mood || 0) / 500;
const SELLB = () => Math.min(0.2, (S.experience || 0) / 1000) + 0.03 * lvOf((S.skills.xiaoshou || {}).xp || 0);
const SELLR = g => g.origin === S.district ? Math.min(0.85, 0.5 + SELLB()) : Math.min(1.25, 1.0 + SELLB() / 2);
const SKILL = id => lvOf(((S.skills || {})[id] || {}).xp || 0);
const STKB = () => Math.floor((S.connections || 0) / 10);
const BAGM = () => 1 + 0.5 * (S.bagLv || 0);
const STOCKLEFT = gid => Math.round((META.STOCKS[gid] || 0) * BAGM()) + STKB() - ((S.boughtToday || {})[gid] || 0);
const CAP = () => (META.BAG_LVLS[S.bagLv || 0] || META.BAG_LVLS[0]).cap;
let toastTimer = null;
function toast(msg) {
  let t = $('toast');
  if (!t) { // 老 DOM 自愈
    t = document.createElement('div');
    t.id = 'toast'; t.hidden = true;
    document.body.insertBefore(t, document.body.firstChild);
  }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 2200);
}
let rankType = 'money';
let muted = localStorage.getItem('gz-mute') === '1';
let AC = null;
function beep(seq) {
  if (muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    seq.forEach(([f, t], i) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, AC.currentTime + i * t);
      g.gain.exponentialRampToValueAtTime(0.12, AC.currentTime + i * t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + i * t + t);
      o.connect(g); g.connect(AC.destination);
      o.start(AC.currentTime + i * t); o.stop(AC.currentTime + i * t + t + 0.05);
    });
  } catch (e) {}
}
function applyState(ns) {
  const prevAch = new Set(S ? (S.achievements || []) : []);
  const prevPh = new Set(S ? Object.keys(S.photos || {}) : []);
  S = ns; renderAll();
  const newPh = Object.keys(S.photos || {}).filter(p => !prevPh.has(p));
  const newAch = (S.achievements || []).filter(a => !prevAch.has(a));
  if (newPh.length) {
    const lm = META.LANDMARKS.find(x => x.id === newPh[0]);
    beep([[660, .12], [880, .12], [1100, .2]]);
    showOverlay(`<h3>📷 出卡！</h3><img class="flip" src="assets/lm-${newPh[0]}.jpg" alt=""><p><b>${lm ? lm.name : ''}</b> · 第${S.photos[newPh[0]]}天<br>${lm ? lm.desc : ''}</p><p class="tip">点击任意处关闭</p>`);
  } else if (newAch.length) {
    beep([[520, .1], [780, .18]]);
    showOverlay(`<h3>🏅 成就达成</h3>` + newAch.map(a => {
      const d = META.ACHIEVEMENTS.find(x => x.id === a);
      return `<img class="flip" src="assets/ach-${a}.jpg" style="width:120px;border-radius:12px"><div class="badge got"><b>${d ? d.name : a}</b> ${d ? d.desc : ''}</div>`;
    }).join('') + `<p class="tip">点击任意处关闭</p>`);
  }
}
let ovQueue = [];
function showOverlay(html) {
  ovQueue.push(html);
  if (ovQueue.length === 1) showNextOverlay();
}
function showNextOverlay() {
  const html = ovQueue[0];
  let ov = $('overlay');
  if (!ov) { // 老 DOM 自愈
    ov = document.createElement('div');
    ov.id = 'overlay'; ov.className = 'overlay'; ov.hidden = true;
    ov.innerHTML = '<div class="modal" id="ovcard"></div>';
    document.body.appendChild(ov);
  }
  if (!html) { ov.hidden = true; ov.onclick = null; return; }
  const card = $('ovcard');
  if (!card) { ovQueue.shift(); showNextOverlay(); return; }
  card.innerHTML = html;
  ov.hidden = false;
  ov.onclick = () => {
    ovQueue.shift();
    if (ovQueue.length) showNextOverlay();
    else { ov.hidden = true; ov.onclick = null; }
  };
}
function confirmBox(title, desc, onOk) {
  const ov = $('overlay');
  if (!ov || !$('ovcard')) { if (window.confirm(title + '\n' + desc.replace(/<[^>]+>/g, ''))) onOk(); return; }
  $('ovcard').innerHTML = `<h3>${title}</h3><p>${desc}</p>
    <div class="row"><button id="cf-ok">确认</button><button id="cf-no" class="ghost">取消</button></div>`;
  ov.hidden = false;
  // confirm 只是临时插队：关闭时把控制权还给队列，否则后续所有弹窗都会卡死
  const close = () => { ov.hidden = true; ov.onclick = null; if (ovQueue.length) showNextOverlay(); };
  ov.onclick = e => { if (e.target.id === 'cf-no') close(); };
  $('cf-no').onclick = close;
  $('cf-ok').onclick = () => { close(); onOk(); };
}

async function init() {
  // 只把真正的网络故障当断网，避免复制/分享之类的本地失败被误报
  // 所有报错同时回传服务端，方便定位玩家端问题
  window.addEventListener('unhandledrejection', e => {
    const msg = String(e.reason && (e.reason.message || e.reason));
    if (/clientlog/.test(msg)) return;
    fetch('/api/clientlog?msg=' + encodeURIComponent('unhandled:' + msg.slice(0, 120))).catch(() => {});
    if (/Failed to fetch|NetworkError|ERR_CONNECTION/i.test(msg)) toast('连不上服务，确认服务已启动');
  });
  window.addEventListener('error', e => {
    fetch('/api/clientlog?msg=' + encodeURIComponent('onerror:' + String(e.message).slice(0, 120))).catch(() => {});
  });
  try {
    META = await (await fetch('/api/meta')).json();
    fetch('/api/ping?cv=' + APP_V).catch(() => {});
    setH('clientver', `前端 v${APP_V} · 服务 rev${META.rev ?? '?'} · ${META.rev === APP_V ? '版本一致' : '版本不一致，请重进'}`);
  } catch (e) {
    document.querySelector('.hero p').textContent = '连不上游戏服务，先 npm start 再刷新。';
    return;
  }
  renderIdent(); renderGender(); checkName();
  $('randname').onclick = () => { $('pname').value = NAMES[Math.floor(Math.random()*NAMES.length)]; checkName(); };
  $('pname').oninput = checkName;
  $('btn-new').onclick = newGame;
  $('btn-load').onclick = loadGame;
  $('btn-next').onclick = () => nextDay(true);
  $('btn-save').onclick = saveGame;
  $('btn-copy').onclick = copyId;
  $('btn-share').onclick = () => share().catch(() => toast('这台设备暂时生不成图'));
  const mb = $('mute');
  mb.textContent = muted ? '🔇' : '🔊';
  mb.onclick = () => { muted = !muted; localStorage.setItem('gz-mute', muted ? '1' : '0'); mb.textContent = muted ? '🔇' : '🔊'; };
  $('status').onclick = () => { $('stathelp').hidden = !$('stathelp').hidden; };
  document.querySelectorAll('#albumtabs .abtn').forEach(b => b.onclick = () => {
    document.querySelectorAll('#albumtabs .abtn').forEach(x => { x.classList.remove('sel'); x.classList.add('ghost'); });
    b.classList.add('sel'); b.classList.remove('ghost');
    const t = b.dataset.a;
    ['lm', 'npc', 'ach', 'ev'].forEach(k => { const e = $('sub-' + k); if (e) e.hidden = k !== t; });
  });
  document.querySelectorAll('#ranktabs .rbtn').forEach(b => b.onclick = () => {
    document.querySelectorAll('#ranktabs .rbtn').forEach(x => { x.classList.remove('sel'); x.classList.add('ghost'); });
    b.classList.add('sel'); b.classList.remove('ghost');
    rankType = b.dataset.r; showRank(rankType);
  });
  document.querySelectorAll('#bottomnav .tbtn').forEach(b => b.onclick = () => {
    document.querySelectorAll('#bottomnav .tbtn').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    const t = b.dataset.t;
    ['trade', 'album', 'work', 'mine'].forEach(k => { const e = $('tab-' + k); if (e) e.hidden = k !== t; });
    if (t === 'mine') showRank(rankType);
  });
}
function renderIdent() {
  const box = $('identities'); box.innerHTML = '';
  const order = Object.entries(META.IDENTITIES).sort((a, b) => (DIFF_ORDER[a[1].difficulty] ?? 9) - (DIFF_ORDER[b[1].difficulty] ?? 9));
  if (!order.some(([k]) => k === selId)) selId = order[0][0];
  for (const [k, v] of order) {
    const d = document.createElement('div');
    d.className = 'card' + (k === selId ? ' sel' : '');
    d.innerHTML = `<img src="assets/avatar-${k}-${selGender}.jpg" alt="${v.label}"><b>${v.label} · 难度${v.difficulty}</b><small>启动资金${v.money} · ${v.housing}<br>人脉${v.connections}</small>`;
    d.onclick = () => { selId = k; renderIdent(); };
    box.appendChild(d);
  }
}
function renderGender() {
  document.querySelectorAll('.gbtn').forEach(b => {
    b.classList.toggle('sel', b.dataset.g === selGender);
    b.onclick = () => { selGender = b.dataset.g; renderGender(); renderIdent(); };
  });
}
async function newGame() {
  const name = $('pname').value.trim();
  if (!name) { toast('先给角色起个名字'); checkName(); return; }
  const r = await fetch('/api/new', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ identity: selId, gender: selGender, name }) });
  const j = await r.json();
  if (j.error) return toast(j.error);
  S = j.state; enterGame();
}
async function loadGame() {
  const id = $('loadid').value.trim().toUpperCase();
  if (!id) return toast('先填存档ID');
  const r = await fetch('/api/load?id=' + encodeURIComponent(id));
  const j = await r.json();
  if (j.error) return toast(j.error);
  S = j.state; enterGame();
}
function enterGame() {
  $('screen-new').hidden = true; $('screen-game').hidden = false;
  $('mine-saveid').textContent = S.id;
  renderAll();
  window.scrollTo(0, 0);
}
function renderAll() {
  // 页面版本太旧（缺新容器）就提示重进，避免静默半残
  if (!window._verWarned && ['calendar', 'albumhead', 'recaps', 'bagup'].some(id => !$(id))) {
    window._verWarned = true;
    setTimeout(() => toast('页面是旧版本：请关掉本页重进一次'), 500);
  }
  const c = S.character;
  const aimg = `assets/avatar-${c.identity}-${c.gender}.jpg`;
  $('who').innerHTML = `<img class="avatar" src="${aimg}" alt="我"><b>${c.name}</b><span>${META.IDENTITIES[c.identity].label}</span>`;
  $('distimg').src = `assets/dist-${DIST_IMG[S.district]}.jpg`;
  $('status').innerHTML = `<span>第${S.day}天</span><span>💰${S.money}</span><span>❤${S.health}</span>
    <span>⚡${S.stamina}</span><span>😊${S.mood}</span><span>🤝${S.connections}</span>
    <span>📍${S.district}</span><span>🏠${S.housing}${S.housingFreeDays>0&&S.housingFreeDays<9999?'('+S.housingFreeDays+'天)':''}</span>`;
  const db = $('districts'); db.innerHTML = '';
  META.DISTRICTS.forEach(d => {
    const b = document.createElement('button');
    b.textContent = d + (S.visited[d] ? `(${S.visited[d]})` : '');
    b.className = 'dbtn' + (d === S.district ? ' sel' : '');
    b.onclick = async () => { await nextDay(false, d); };
    db.appendChild(b);
  });
  $('day').textContent = `第${S.day}天 · ${S.district}`;
  const mods = S.mods || {};
  const modNames = Object.entries(mods).map(([gid, m]) => {
    const g = META.GOODS.find(x => x.id === gid);
    return `${g ? g.name : gid}×${m.mult}(${m.days}天)`;
  });
  const local = META.GOODS.filter(g => g.sell.includes(S.district));
  const t = $('market');
  t.innerHTML = (modNames.length ? `<tr><td colspan="5">📈 ${modNames.join('、')}</td></tr>` : '')
    + '<tr><th>商品</th><th>买价</th><th class="hide-sm">均价</th><th>持有</th><th>买入</th></tr>';
  local.forEach(g => {
    const m = mods[g.id];
    const left = STOCKLEFT(g.id);
    const r = (S.prices[g.id] || 0) / g.base;
    const trend = r >= 1.15 ? '<b style="color:var(--red)">↑</b>' : r <= 0.85 ? '<b style="color:var(--green)">↓</b>' : '<b style="color:var(--muted)">→</b>';
    const tr = document.createElement('tr');
    const bm = BUYM();
    tr.innerHTML = `<td>${g.name}${g.perish ? '⏳' : ''}${m ? (m.mult > 1 ? '🔥' : '📉') : ''} <small>剩${left}</small></td><td>${trend}${S.prices[g.id]}${bm > 1 ? '<small>💊贵</small>' : bm < 1 ? '<small>🤝惠</small>' : ''}</td><td class="hide-sm">${IQ(g.id) ? AVG(g.id) : '—'}</td><td>${IQ(g.id)}</td>`;
    const bb = document.createElement('button'); bb.textContent = '买'; bb.onclick = () => trade(g.id, 1, 0);
    const ba = document.createElement('button'); ba.textContent = '全'; ba.onclick = () => buyMax(g.id);
    const td1 = document.createElement('td'); td1.append(bb, ba);
    tr.appendChild(td1); t.appendChild(tr);
  });
  const heldList = Object.entries(S.inventory || {}).filter(([, it]) => (it?.qty || 0) > 0);
  const bagN = heldList.reduce((s, [, it]) => s + it.qty, 0);
  $('bag').innerHTML = heldList.length ? `<div class="tip">背包 ${bagN}/${CAP()}件</div>` : '背包空空，先去进货。';
  heldList.forEach(([gid, it]) => {
    const g = META.GOODS.find(x => x.id === gid);
    if (!g) return;
    const price = S.prices[gid] || 0;
    const sell = Math.floor(price * SELLR(g));
    const avg = it.qty ? Math.round(it.cost / it.qty) : 0;
    const diff = sell * it.qty - it.cost;
    const s = document.createElement('div');
    s.className = 'badge';
    s.innerHTML = `<b>${g.name}</b>x${it.qty} · 均价${avg} · 现卖${sell} · <b style="color:${diff >= 0 ? 'var(--green)' : 'var(--red)'}">${diff >= 0 ? '+' : ''}${diff}</b> `;
    const b1 = document.createElement('button'); b1.textContent = '卖1'; b1.onclick = () => trade(gid, 0, 1);
    const bs = document.createElement('button'); bs.textContent = '全卖'; bs.onclick = () => trade(gid, 0, it.qty);
    s.append(b1, bs);
    $('bag').appendChild(s);
  });
  renderBagUp();
  $('timeline').innerHTML = S.timeline.slice(-12).map(x => {
    const m = x.match(/\[\[lm:(\w+)\]\]/);
    const img = m ? `<img loading="lazy" decoding="async" src="assets/lm-${m[1]}.jpg" style="width:64px;border-radius:8px;vertical-align:middle;margin-right:6px">` : '';
    return `<li>${img}${x.replace(/\[\[lm:\w+\]\]/, '')}</li>`;
  }).join('');
  // 日历预告
  const cyc = S.day % 30;
  setH('calendar', '📅 ' + META.FESTIVALS.map(f => {
    const d = ((f.start - cyc) + 30) % 30;
    return d === 0 ? `<b>${f.name}·今日开市</b>` : `${f.name}·${d}天后`;
  }).join(' · '));
  // 日内回体小吃
  const used = (S.snackDay && S.snackDay.day === S.day) ? S.snackDay.used : {};
  setH('snacks', META.SNACKS.map(s =>
    `<button class="ghost" data-sn="${s.id}" ${used[s.id] ? 'disabled' : ''}>${s.name} ${s.cost}元+${s.stamina}体</button>`).join(''));
  $('snacks') && $('snacks').querySelectorAll('button[data-sn]').forEach(b => b.onclick = () => snack(b.dataset.sn));
  const lg = $('legend');
  if (lg) lg.textContent = '图例：⏳易腐 /📉行情涨跌 ↑贵↓贱→平 💊病中买贵 🤝人脉折扣 剩N=今日限购';
  renderAlbum(); renderCodex(); renderAch(); renderNPC(); renderWork(); renderRecaps(); renderHouse();
  setH('appver', '版本 v' + APP_V);
  const nb = $('btn-next');
  if (nb) nb.textContent = `过一天 · 休息（体+${Math.round(((META.HOUSING_LVLS || [])[S.houseLv || 0] || {}).rest || 40)}）`;
}
function renderHouse() {
  const lv = S.houseLv || 0;
  const cur = (META.HOUSING_LVLS || [])[lv] || {};
  const next = (META.HOUSING_LVLS || [])[lv + 1];
  setH('house', `🏠 <b>${cur.name || S.housing}</b> · 休息+${cur.rest}体 · ${cur.feeLabel || ''}${cur.fee || 0}元/周${S.housingFreeDays > 0 ? `（免交${S.housingFreeDays}天）` : ''}` +
    (next ? `<br>下一档「${next.name}」（休息+${next.rest}，${next.feeLabel}${next.fee}/周）${cur.upCost}元 <button id="btn-houseup">搬家</button>` : '<br>已到顶'));
  const b = $('btn-houseup');
  if (b) b.onclick = upgradeHouse;
}
async function upgradeHouse() {
  const lv = S.houseLv || 0;
  const cur0 = (META.HOUSING_LVLS || [])[lv] || {};
  const next = (META.HOUSING_LVLS || [])[lv + 1];
  if (!next) return;
  confirmBox('搬家确认', `花 <b>${cur0.upCost}元</b>搬进「${next.name}」（休息+${next.rest}，${next.feeLabel}${next.fee}元/周）？`, async () => {
    const r = await fetch('/api/upgrade-house', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: S.id }) });
    const j = await r.json();
    if (j.error) return toast(j.error);
    beep([[520, .1], [780, .15]]);
    applyState(j.state);
    toast('乔迁之喜！');
  });
}
function renderRecaps() {
  const rs = (S.recaps || []).slice().reverse();
  setH('recaps', rs.length ? rs.map(r => {
    const det = (r.lines || []).filter(([, v]) => v).map(([n, v]) => `${n} ${v > 0 ? '+' : ''}${v}`).join(' · ') || '无进出';
    return `<div class="badge">第${r.day}天 · 结余 <b style="color:${r.money >= 0 ? 'var(--green)' : 'var(--red)'}">${r.money > 0 ? '+' : ''}${r.money}</b> · 体${r.stamina > 0 ? '+' : ''}${r.stamina}<br><small>${det}</small></div>`;
  }).join('') : '<div class="tip">还没有账目，过一天看看。</div>');
}
function lvOf(xp) { return xp >= 150 ? 3 : xp >= 80 ? 2 : xp >= 30 ? 1 : 0; }
function renderBagUp() {
  const lv = S.bagLv || 0;
  const cur = META.BAG_LVLS[lv];
  const next = META.BAG_LVLS[lv + 1];
  if (!setH('bagup', next
    ? `🎒 <b>${cur.name}</b>（${cur.cap}件） → <b>${next.name}</b>（${next.cap}件${next.move !== undefined ? '·跑商体力' + next.move : ''}）${next.cost}元 · 运力${bagMText(lv)}→${bagMText(lv + 1)} <button id="btn-bagup">换装</button>`
    : `🎒 <b>${cur.name}</b>（${cur.cap}件）已到顶 · 运力${bagMText(lv)}`)) return;
  const b = $('btn-bagup');
  if (b) b.onclick = upgradeBag;
}
function bagMText(lv) { return (1 + 0.5 * lv) + '倍进货量'; }
async function upgradeBag() {
  const lv = S.bagLv || 0;
  const next = META.BAG_LVLS[lv + 1];
  if (!next) return;
  confirmBox('换装确认', `花 <b>${next.cost}元</b> 换「${next.name}」（${next.cap}件${next.move !== undefined ? '·跑商体力' + next.move : ''}）？`, async () => {
    const r = await fetch('/api/upgrade-bag', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: S.id }) });
    const j = await r.json();
    if (j.error) return toast(j.error);
    beep([[520, .1], [780, .15]]);
    applyState(j.state);
    toast('换装成功！');
  });
}
async function doWork(job) {
  const r = await fetch('/api/work', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: S.id, job }) });
  const j = await r.json();
  if (j.error) return toast(j.error);
  applyState(j.state); toastFz(j);
  if (j.tale) toast(`${j.tale.text}（${j.tale.money > 0 ? '+' : ''}${j.tale.money}元）`);
}
async function doLearn(skill) {
  const r = await fetch('/api/learn', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: S.id, skill }) });
  const j = await r.json();
  if (j.error) return toast(j.error);
  applyState(j.state); toastFz(j);
}
function renderWork() {
  const skName = id => (META.SKILLS.find(x => x.id === id) || {}).name || id;
  const worked = S.jobsToday && S.jobsToday.day === S.day && S.jobsToday.n >= 1;
  const edu = META.IDENTITIES[S.character.identity].edu;
  // 今日可做：体力够 + 门槛过 + 今天还没打过工
  const jobRows = META.JOBS.map(j => {
    const okEdu = !j.edu || edu === j.edu || ((S.connections || 0) >= (j.conn || 999));
    const okSk = !j.skill || SKILL(j.skill.id) >= j.skill.lv;
    const okSt = S.stamina >= j.stamina;
    const can = okEdu && okSk && okSt && !worked;
    const why = worked ? '今日已打过工' : !okEdu ? `需${j.edu}或人脉${j.conn}` : !okSk ? `需${skName(j.skill.id)}${j.skill.lv}级` : !okSt ? '体力不足' : '';
    const n = (S.jobs || {})[j.id] || 0;
    const prof = Math.round(Math.min(0.6, 0.02 * n) * 100);
    const pay = Math.round(j.pay * INCM() * (1 + Math.min(0.6, 0.02 * n)));
    return { j, can, pay, why, n, prof };
  });
  const today = jobRows.filter(r => r.can).sort((a, b) => b.pay - a.pay);
  const rest = jobRows.filter(r => !r.can);
  const jb = $('jobs'), ln = $('learn');
  if (!jb || !ln) return;
  jb.innerHTML = (today.length
    ? '<div class="tip">体力够、门槛过，今天能干这些：</div>' + today.map(r =>
        `<div class="badge">💼 <b>${r.j.name}</b> ${r.pay}元/${r.j.stamina}体${r.n ? ` · 熟练+${r.prof}%（${r.n}次）` : ''}<br>${r.j.desc} <button data-j="${r.j.id}">开工</button></div>`).join('')
    : '<div class="tip">今天体力或门槛不够做工，先歇着。</div>') +
    '<div class="tip" style="margin-top:8px">其余（需门槛/今日已做）：</div>' +
    rest.map(r => `<div class="badge off">💼 <b>${r.j.name}</b> ${r.j.pay}元/${r.j.stamina}体 · ${r.why}</div>`).join('');
  jb.querySelectorAll('button[data-j]').forEach(b => b.onclick = () => doWork(b.dataset.j));
  ln.innerHTML = META.LEARN.map(l => {
    const xp = (S.skills[l.id] && S.skills[l.id].xp) || 0;
    return `<div class="badge">📚 <b>${skName(l.id)}</b> Lv${lvOf(xp)}（${xp}经验）<br>${l.desc} ${l.cost}元 <button data-l="${l.id}">学艺</button></div>`;
  }).join('');
  ln.querySelectorAll('button[data-l]').forEach(b => b.onclick = () => doLearn(b.dataset.l));
}
function renderNPC() {
  const box = $('album-npc');
  if (!box) return;
  box.innerHTML = '';
  META.NPCS.forEach(n => {
    const favor = (S.npc && S.npc[n.id] && S.npc[n.id].favor) || 0;
    const lit = favor >= 100;
    const d = document.createElement('div');
    d.className = 'lm' + (lit ? '' : ' locked');
    const chs = n.chapters.map(c => favor >= c.need
      ? `<div class="badge got">📖 ${c.title}（${c.need}）${c.text}${c.reward ? ' <b style="color:var(--green)">' + rewardText(c.reward) + '</b>' : ''}</div>`
      : `<div class="badge">🔒 好感${c.need}解锁</div>`).join('');
    d.innerHTML = `<img loading="lazy" decoding="async" src="assets/npc-${n.id}.jpg" alt="${n.name}"><div><b>${n.name}</b> ${lit ? '· 点亮' : '· 未点亮'}<br>${n.role} · ${n.desc}<br>好感 <b>${favor}</b>/100<div class="bar"><i style="width:${Math.min(100, favor)}%"></i></div>${chs}</div>`;
    box.appendChild(d);
  });
}
function rewardText(r) {
  if (!r) return '';
  const p = [];
  if (r.connections) p.push(`人脉+${r.connections}`);
  if (r.mood) p.push(`心情+${r.mood}`);
  if (r.health) p.push(`健康+${r.health}`);
  if (r.experience) p.push(`阅历+${r.experience}`);
  if (r.housingDays) p.push(`免租+${r.housingDays}天`);
  if (r.give) { const g = META.GOODS.find(x => x.id === r.give.id); p.push(`${g ? g.name : r.give.id}x${r.give.qty}`); }
  return p.join(' ');
}
function renderAlbum() {
  const n = Object.keys(S.photos || {}).length;
  const lit = Object.values(S.npc || {}).filter(v => (v.favor || 0) >= 100).length;
  setH('albumhead', `地标摄影卡（${n}/${META.LANDMARKS.length}）· 跑商谋生做人情，卡自己会掉`);
  setH('albumnpchead', `街坊（${lit}/${META.NPCS.length}点亮，好感100点亮）`);
  const ab = $('album');
  if (!ab) return;
  ab.innerHTML = '';
  META.LANDMARKS.forEach(lm => {
    const day = (S.photos || {})[lm.id];
    const prog = (S.pc || {})[lm.id] || 0;
    const d = document.createElement('div');
    d.className = 'lm' + (day ? '' : ' locked');
    const bar = day ? '' : `<div class="bar"><i style="width:${Math.min(100, Math.round(prog / lm.drop.need * 100))}%"></i></div><small>进度 ${prog}/${lm.drop.need}${prog >= lm.drop.need ? ` · 每次${Math.round(lm.drop.chance * 100)}%掉落${Math.max(0, 8 - (prog - lm.drop.need)) === 0 ? '，这次必掉' : '，保底剩' + Math.max(0, 8 - (prog - lm.drop.need)) + '次'}` : ''}</small>`;
    d.innerHTML = `<img loading="lazy" decoding="async" src="assets/lm-${lm.id}.jpg" alt="${lm.name}"><div><b>${lm.name}</b> ${day ? '· 第'+day+'天' : '· 未解锁'}<br>${lm.desc}<br>📍${lm.district}<br><small>${day ? '已收藏' : lm.dropDesc}</small>${bar}</div>`;
    ab.appendChild(d);
  });
}
function renderCodex() {
  setH('codexhead', `事件图鉴（${S.eventsSeen.length}/${META.EVENTS.length}）`);
  const box = $('codex');
  if (!box) return;
  box.innerHTML = '';
  META.EVENTS.forEach(e => {
    const seen = (S.eventsSeen || []).includes(e.id);
    const d = document.createElement('div');
    d.className = 'lm' + (seen ? '' : ' locked');
    d.innerHTML = `<img loading="lazy" decoding="async" src="assets/ev-${e.id}.jpg" alt=""><div>${seen ? '✅ ' + e.text : '⬜ 未触发'}</div>`;
    box.appendChild(d);
  });
}
function renderAch() {
  setH('ach', `<div class="grid">` + META.ACHIEVEMENTS.map(a => {
    const got = (S.achievements || []).includes(a.id);
    return `<div class="lm${got ? '' : ' locked'}"><img loading="lazy" decoding="async" src="assets/ach-${a.id}.jpg" alt="${a.name}"><div>${got ? '🏅' : '🔒'} <b>${a.name}</b><br><small>${a.desc}</small></div></div>`;
  }).join('') + `</div>`);
}
function toastFz(j) { (j.fz || []).forEach(f => toast(`${f.name}好感+${f.amt}`)); }
async function trade(gid, b, s) {
  const r = await fetch('/api/trade', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: S.id, buy: b?{[gid]:b}:{}, sell: s?{[gid]:s}:{} }) });
  const j = await r.json();
  if (j.error) return toast(j.error);
  applyState(j.state); toastFz(j);
}
function buyMax(gid) {
  const eff = Math.round((S.prices[gid] || 0) * BUYM());
  const capLeft = CAP() - Object.values(S.inventory || {}).reduce((s, it) => s + (it?.qty || 0), 0);
  const dayLeft = STOCKLEFT(gid);
  const afford = eff > 0 ? Math.floor(S.money / eff) : 0;
  let q = Math.min(capLeft, dayLeft, afford);
  // 大额进货吃体力，反推能搬多少
  while (q > 0 && 2 + Math.floor(q / 10) > S.stamina) q -= Math.max(1, Math.floor(q / 10));
  if (q <= 0) return toast(capLeft <= 0 ? '背包满了' : dayLeft <= 0 ? '今日售罄' : S.stamina <= 2 ? '没体力，先休息' : '钱不够');
  trade(gid, q, 0);
}
async function nextDay(rest, moveTo) {
  const r = await fetch('/api/next-day', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: S.id, rest, moveTo }) });
  const j = await r.json();
  if (j.error) return toast(j.error);
  applyState(j.state); toastFz(j);
  if (j.recap) {
    const m = j.recap.money;
    const key = (j.recap.lines || []).filter(([, v]) => v).map(([n, v]) => `${n}${v > 0 ? '+' : ''}${v}`).slice(0, 2).join(' ');
    beep([[440, .08], [620, .12]]);
    toast(`第${S.day}天 · 结余 ${m > 0 ? '+' : ''}${m}${key ? ' · ' + key : ''}`);
  }
  (j.news || []).forEach(n => {
    const evImg = n.eid ? `assets/ev-${n.eid}.jpg` : null;
    const distImg = `assets/dist-${DIST_IMG[n.district]}.jpg`;
    if (n.type === 'market') {
      beep([[520, .1], [300, .18]]);
      showOverlay(
        `<div class="ev"><img src="${evImg || distImg}" alt="">
          <div class="ev-body">
            <h4>📈 行情异动</h4>
            <p>${n.text}</p>
            <div class="tags">${n.goods.map(g => `<span class="tag mkt-tag ${g.mult > 1 ? 'up' : 'down'}">${g.mult > 1 ? '🔥' : '📉'} ${g.name} ${g.mult > 1 ? '涨' : '跌'}${Math.abs(Math.round((g.mult - 1) * 100))}% · ${g.days}天</span>`).join('')}</div>
            <p class="tip" style="margin-top:8px">点击任意处关闭</p>
          </div></div>`);
    } else if (n.type === 'life') {
      beep([[660, .1], [880, .16]]);
      const tags = Object.entries(n.eff || {}).map(([k, v]) => {
        const L = { money: '钱', health: '健康', mood: '心情', stamina: '体力', connections: '人脉' }[k] || k;
        return `<span class="tag ${v > 0 ? 'up' : 'down'}">${L}${v > 0 ? '+' : ''}${v}</span>`;
      }).join('');
      const head = n.photo
        ? `<h4>📷 意外入镜</h4><p>你按下快门的那一幕：</p>`
        : `<h4>📌 今日见闻</h4>`;
      const photoHtml = n.photo
        ? `<div class="badge got" style="margin-top:8px">📷 顺手拍到「${(META.LANDMARKS.find(x => x.id === n.photo) || {}).name || ''}」，已收入相册</div>` : '';
      showOverlay(
        `<div class="ev">
          <img class="flip" src="${evImg || distImg}" alt="">
          <div class="ev-body">${head}<p>${n.text}</p>
          ${tags ? `<div class="tags">${tags}</div>` : ''}${photoHtml}
          <p class="tip" style="margin-top:8px">点击任意处关闭</p></div></div>`);
    } else if (n.type === 'fest') {
      beep([[780, .1], [1040, .15]]);
      toast(`📅 ${n.name}开市：${n.desc}（${n.days}天）`);
    }
  });
}
async function snack(id) {
  const r = await fetch('/api/snack', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: S.id, snack: id }) });
  const j = await r.json();
  if (j.error) return toast(j.error);
  beep([[500, .08]]);
  applyState(j.state);
}
function loadImg(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
async function share() {
  toast('正在生成分享图…');
  const c = document.createElement('canvas');
  c.width = 750; c.height = 1000;
  const x = c.getContext('2d');
  x.fillStyle = '#f5efe1'; x.fillRect(0, 0, 750, 1000);
  x.fillStyle = '#8c2f2f'; x.fillRect(0, 0, 750, 140);
  x.fillStyle = '#f7ead2'; x.font = 'bold 44px serif'; x.fillText('广州浮生记', 40, 70);
  x.font = '24px sans-serif'; x.fillText(`${S.character.name} · ${META.IDENTITIES[S.character.identity].label} · 第${S.day}天`, 40, 112);
  // 人物立绘（圆形）
  const av = await loadImg(`assets/avatar-${S.character.identity}-${S.character.gender}.jpg`);
  if (av) {
    const r = 65, cx = 650, cy = 210;
    const side = Math.min(av.width, av.height);
    x.save();
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip();
    x.drawImage(av, (av.width - side) / 2, (av.height - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
    x.restore();
    x.strokeStyle = '#c9a35c'; x.lineWidth = 6;
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
  }
  x.fillStyle = '#38302a'; x.font = '30px sans-serif';
  x.fillText(`💰 ${S.money} 元`, 40, 210);
  x.fillText(`❤ ${S.health} ⚡ ${S.stamina} 😊 ${S.mood} 🤝 ${S.connections}`, 40, 260);
  x.fillText(`📷 地标 ${Object.keys(S.photos || {}).length}/${META.LANDMARKS.length} · 🏅 成就 ${(S.achievements || []).length}/${META.ACHIEVEMENTS.length}`, 40, 310);
  const phs = Object.keys(S.photos || {}).slice(0, 6);
  let px = 40;
  for (const p of phs) {
    const img = await loadImg(`assets/lm-${p}.jpg`);
    if (!img) continue;
    x.drawImage(img, px, 360, 200, 267); px += 220;
    if (px > 700) break;
  }
  x.fillStyle = '#8a7d6b'; x.font = '22px sans-serif';
  x.fillText('烟火羊城 · 浮生一日', 40, 950);
  const url = c.toDataURL('image/png');
  showOverlay(`<h3>📤 浮生战报 · 第${S.day}天</h3><img src="${url}" style="width:100%;border-radius:12px" alt="分享图"><p class="tip">长按图片 / 右键另存为，即可分享</p><div class="row"><a href="${url}" download="fushengji-day${S.day}.png"><button>下载图片</button></a></div>`);
}
async function copyId() {
  const id = S ? S.id : '';
  if (!id) return;
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(id); toast('存档ID已复制'); return; }
  } catch (e) { /* 手机浏览器非HTTPS时没有clipboard，走降级 */ }
  // 降级：临时textarea + execCommand，手机也稳
  const ta = document.createElement('textarea');
  ta.value = id;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('存档ID已复制'); }
  catch (e) { showOverlay(`<h3>手动复制存档ID</h3><p>浏览器不给复制权限，请长按或选中下面的ID：</p><div class="badge" style="user-select:all;font-size:18px">${id}</div>`); }
  document.body.removeChild(ta);
}
async function saveGame() {
  const r = await fetch('/api/save', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ id: S.id, version: S.version, state: S }) });
  const j = await r.json();
  if (j.error) return toast(j.error);
  S.version = j.version; toast('已保存，ID=' + S.id);
}
async function showRank(type) {
  const j = await (await fetch('/api/rank?type=' + (type || rankType))).json();
  rankType = j.type || rankType;
  const names = { money: '资产榜（元）', photos: '收藏榜（张）', favor: '人情榜（好感）' };
  $('rank').innerHTML = '<h3>' + (names[rankType] || '') + '</h3>' + j.rank.map((r,i)=>`${i+1}. ${r.name} ${r.val}${r.unit}（第${r.day}天，${r.id}）`).join('<br>');
}
init();

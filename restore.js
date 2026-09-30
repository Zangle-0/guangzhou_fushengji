// 从 .bak 恢复被误删的存档：每个存档ID取最新的 .bak1（若 .bak1 缺失则退到 bak2..bak5）
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'saves';
const files = fs.readdirSync(DIR);
const byId = new Map();
for (const f of files) {
  const m = f.match(/^([A-Z0-9-]{19})\.json\.bak(\d)$/);
  if (!m) continue;
  const [, id, n] = m;
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push({ n: Number(n), f });
}
let restored = 0, skipped = 0;
for (const [id, list] of byId) {
  const target = path.join(DIR, id + '.json');
  if (fs.existsSync(target)) { skipped++; continue; }
  list.sort((a, b) => a.n - b.n);
  let best = null, bestDay = -1;
  for (const { f } of list) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      if ((s.day ?? 0) > bestDay) { bestDay = s.day ?? 0; best = f; }
    } catch (e) { /* 跳过损坏备份 */ }
  }
  if (!best) continue;
  fs.copyFileSync(path.join(DIR, best), target);
  const s = JSON.parse(fs.readFileSync(target, 'utf8'));
  console.log(`恢复 ${id}  第${s.day}天 ${s.character?.name ?? '?'}  钱${s.money}  相册${Object.keys(s.photos ?? {}).length}  <- ${best}`);
  restored++;
}
console.log(`\n共恢复 ${restored} 个存档，跳过已存在 ${skipped} 个`);

# 广州浮生记

> 致敬《北京浮生记》的网页经营模拟游戏。零依赖 Node 服务 + 原生 JS 前端，免账号、存档即文件。

[![node](https://img.shields.io/badge/node-%E2%89%A522.5-5FA04E)](https://nodejs.org)
[![docker](https://img.shields.io/badge/docker-24--alpine-2496ED)](https://hub.docker.com/r/zangle/guangzhou-fushengji)
[![license](https://img.shields.io/badge/license-MIT-f7ead2)](LICENSE)

本项目为个人习作，与《北京浮生记》原作无任何关联，仅作致敬。

## 玩什么

你是来广州讨生活的人。跑货、打工、学艺、租房搬家，跟街坊从生分到熟络。

* **跑商**：一货一区，产地 5 折、外地看行情，背包容量与运力决定你能吃下多少
* **谋生**：打工（熟练度、遇事）与学艺（拜师对应街坊），技能 4 项：销售 / 厨艺 / 体魄 / 交际
* **人情**：好感全靠行为被动涨，100 点亮街坊立册
* **收藏**：地标 / 街坊 / 成就 / 事件四个册子，全部配图，行为掉落式解锁
* **住房**：城中村床位 → 合租单间 → 一房一厅 → 老城小院 → 珠江别墅，每档都只多给你一点回体力

没有账号系统。存档是一个 16 位 ID 的 JSON 文件，ID 即权限，丢了就找不回。

## 快速开始

### Docker（推荐）

```bash
docker run -d --name fushengji \
  -p 3000:3000 \
  -v "$PWD/saves:/app/saves" \
  -v "$PWD/data:/app/data" \
  zangle/guangzhou-fushengji:1.0
```

或者用 compose：

```bash
git clone https://github.com/Zangle-0/guangzhou-fushengji.git
cd guangzhou-fushengji
mkdir -p saves data          # 这两个目录不进版本库，要自己建
docker compose up -d
```

打开 http://localhost:3000

### 裸跑

需要 **Node ≥ 22.5**（`node:sqlite` 是内置实验模块，低版本会报错）：

```bash
node server.js     # http://localhost:3000
```

改代码时用 `node --watch server.js` 自动重启。

## 目录结构

```
server.js            # 全部后端：配置表 + 纯函数 + /api 路由（数值权威在服务端）
public/              # 前端（app.js / index.html / style.css / favicon.svg）
public/assets/       # 美术资源，命名契约：avatar- dist- lm- npc- ach- ev-
saves/               # 玩家存档 JSON（16 位 ID 即权限，不进版本库）
data/                # 排行榜 sqlite（不进版本库）
Dockerfile           # node:24-alpine，零依赖无 npm install
docker-compose.yml   # 只挂 saves / data，程序全在镜像里
restore.js           # 从 .bak 备份恢复存档
test-full.mjs        # 全流程接口测试
```

## 存档与备份

存档就是 `saves/<ID>.json`，没有账号、没有数据库迁移、没有外键。备份：

```bash
tar -czf fushengji-$(date +%F).tar.gz saves data
```

服务器上挂个 cron 每天跑一次即可（`%` 记得转义成 `\%`）：

```cron
17 4 * * * tar -czf /backup/fushengji-$(date +\%F).tar.gz -C /srv/fushengji saves data
```

服务在每次写入前会自动轮转 `.bak1~5`，误删了可以：

```bash
node restore.js        # 每个 ID 取天数最大的那份备份
```

## 运维

```bash
docker compose logs -f          # 看日志
docker compose exec app sh      # 进容器
docker compose pull && up -d    # 升级
```

镜像内不含任何玩家数据（`.dockerignore` 排除 `saves/` `data/`），换机器部署只需要 compose 文件加两个空目录。

更新镜像：

```bash
docker build -t zangle/guangzhou-fushengji:1.1 .
docker push zangle/guangzhou-fushengji:1.1
```

然后把 `docker-compose.yml` 里的 `image:` 改成新 tag，再 `pull && up -d`。

## License

[MIT](LICENSE)　美术资源由 AI 生成，可自由替换。

# 广州浮生记

> 致敬《北京浮生记》的网页经营模拟游戏。零依赖 Node 服务 + 原生 JS 前端，免账号、存档即文件。

![node](https://img.shields.io/badge/node-%E2%89%A524.5-5FA04E) ![docker](https://img.shields.io/badge/docker-24--alpine-2496ED) ![license](https://img.shields.io/badge/license-MIT-f7ead2)

## 玩什么

你是来广州讨生活的人。跑货、打工、学艺、租房搬家，跟街坊从生分到熟络。

* **跑商**：一货一区，产地 5 折、外地看行情，背包容量与运力决定你能吃下多少
* **谋生**：打工（熟练度、遇事）与学艺（拜师对应街坊），技能 4 项：销售/厨艺/体魄/交际
* **人情**：好感全靠行为被动涨，100 点亮街坊立册
* **收藏**：地标 / 街坊 / 成就 / 事件四个册子，全部配图，行为掉落式解锁

## 快速开始

### Docker（推荐）

```bash
docker run -d --name fushengji \
  -p 3000:3000 \
  -v $(pwd)/saves:/app/saves \
  -v $(pwd)/data:/app/data \
  zangle/guangzhou-fushengji:1.0
```

或用 compose：

```bash
git clone https://github.com/Zangle-0/guangzhou-fushengji.git
cd guangzhou-fushengji
docker compose up -d
```

### 裸跑（需 Node ≥ 22.5）

```bash
node server.js     # http://localhost:3000
```

`node:sqlite` 是内置实验模块，22.5 以下会报错。

## 目录结构

```
server.js            # 全部后端：配置表 + 纯函数 + /api 路由（数值权威在服务端）
public/              # 前端（app.js / index.html / style.css / favicon.svg）
public/assets/       # 美术资源，命名契约：avatar- dist- lm- npc- ach- ev-
saves/               # 玩家存档 JSON（16 位 ID 即权限，git 忽略）
data/                # 排行榜 sqlite（git 忽略）
Dockerfile
docker-compose.yml
restore.js           # 存档从 .bak 恢复
```

## 存档与备份

存档就是 `saves/<ID>.json`，没有账号、没有数据库迁移。备份：

```bash
tar -czf fushengji-$(date +%F).tar.gz saves data
```

误删后用 `node restore.js` 从 `.bak1~5` 恢复（每个 ID 取天数最大的备份）。

## 运维

```bash
docker compose logs -f          # 日志
docker compose exec app sh      # 进容器
docker compose pull && up -d    # 升级
```

镜像内不含任何玩家数据（`.dockerignore` 排除 `saves/` `data/`），换机器部署只需 compose 文件 + 两个空目录。

## 约定

数值规则改一处要动两处：`server.js` 的 helper 与 `public/app.js` 里的镜像公式（`BUYM`/`INCM`/`SELLR`/`STKB`）必须同步。前端改动记得 bump `index.html` 里的 `app.js?v=N`。

## License

MIT

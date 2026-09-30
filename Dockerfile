FROM node:24-alpine

WORKDIR /app

# 零依赖：只有文件拷贝，无需 npm install
COPY package.json server.js ./
COPY public ./public

# 数据目录占位（会被 volume 覆盖），保证 node 用户可写
RUN mkdir -p saves data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/meta > /dev/null || exit 1

CMD ["node", "server.js"]

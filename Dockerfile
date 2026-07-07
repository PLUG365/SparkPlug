# SparkPlug 単一コンテナ（web ビルド済み静的ファイルを server が同一オリジンで配信）
# ---- build stage: shared → server → web をまとめてビルド ----
FROM node:22-alpine AS build
WORKDIR /app
# workspace の package.json を先に入れて依存インストール（ソース変更時のキャッシュを効かせる）
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: server を起動し web/dist を配信 ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001 WEB_DIST=/app/apps/web/dist
# 小規模なのでビルド済み node_modules をそのまま持ってくる（workspace シンボリックリンク維持のため確実）
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/web/dist apps/web/dist
EXPOSE 3001
CMD ["node", "apps/server/dist/index.js"]

FROM node:22-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
COPY scripts ./scripts
COPY config ./config
RUN npm --prefix src/web install && npm --prefix src/web run build
RUN npx tsc -p tsconfig.json

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/web/dist ./src/web/dist
COPY scripts ./scripts
COPY config ./config
EXPOSE 8080
CMD ["node", "dist/server/index.js"]

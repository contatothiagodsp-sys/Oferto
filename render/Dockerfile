# oferto-render: sidecar interno que gera a arte 1080x1080 das ofertas.
# Contexto = render/; lib/imagem.js entra por um contexto nomeado "lib":
#   docker build --build-context lib=../lib -t oferto-render render/
# (no compose: build.additional_contexts: { lib: ../lib })
FROM node:20.19.5-slim

ENV NODE_ENV=production \
    PORT=8080 \
    FONTCONFIG_FILE=/app/fonts/fonts.conf

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server.js baixar.js ./
COPY fonts ./fonts
COPY --from=lib imagem.js ./lib/imagem.js

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

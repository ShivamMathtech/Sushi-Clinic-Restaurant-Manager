FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY scripts/backup.mjs ./scripts/backup.mjs
COPY dist ./dist
RUN mkdir -p /app/data /app/backups && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3040
EXPOSE 3040
VOLUME ["/app/data", "/app/backups"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3040/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/main.mjs"]

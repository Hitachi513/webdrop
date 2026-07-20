FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production
RUN lines=$(git log --format="%H" 2>/dev/null | wc -l || echo 0); \
    if [ "$lines" -gt 10 ]; then \
      git log --format="%x00%H%x01%h%x01%aI%x01%an%x01%s%x01%b" > /app/git-log.txt; \
    fi
RUN rm -rf .git
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]

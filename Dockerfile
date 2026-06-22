FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN git log --format="%x00%H%x01%h%x01%aI%x01%an%x01%s%x01%b" 2>/dev/null > /app/git-log.txt || true
RUN rm -rf .git
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]

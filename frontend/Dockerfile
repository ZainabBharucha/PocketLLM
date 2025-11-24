FROM node:18-alpine

WORKDIR /app

# Copy package files first for caching
COPY package.json .

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose Vite's default port
EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host"]
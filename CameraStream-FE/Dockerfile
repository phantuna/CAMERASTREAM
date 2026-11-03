# Stage 1: Build Frontend Assets
FROM node:20-alpine AS builder
WORKDIR /app

# Cache package dependencies
COPY package*.json ./
RUN npm install

# Build production bundle
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Xoá cấu hình mặc định của Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Copy cấu hình reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts từ Stage 1
COPY --from=builder /app/dist .

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

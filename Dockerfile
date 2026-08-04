# Stage 1: Build React app
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

# Stage 2: Serve using Nginx
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

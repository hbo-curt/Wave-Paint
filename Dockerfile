#FROM nginx
FROM nginx:alpine

COPY dist/web /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

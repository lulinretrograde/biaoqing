FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

COPY site/index.html site/app.js site/sw.js site/manifest.webmanifest site/icon.svg /usr/share/nginx/html/

EXPOSE 80

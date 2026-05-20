FROM nginx:alpine

ARG SW_VERSION=dev

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

COPY site/index.html site/app.js site/sw.js site/manifest.webmanifest /usr/share/nginx/html/
COPY site/icon.svg site/icon-maskable.svg site/icon-192.png site/icon-512.png site/icon-maskable-512.png /usr/share/nginx/html/
COPY site/vendor/ /usr/share/nginx/html/vendor/

RUN sed -i "s/__SW_VERSION__/${SW_VERSION}/" /usr/share/nginx/html/sw.js

EXPOSE 80

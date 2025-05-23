FROM nginx:latest

RUN mkdir -p /etc/nginx/dev /etc/nginx/prod

COPY dev/nginx.conf.template /etc/nginx/dev/
COPY prod/nginx.conf.template /etc/nginx/prod/
COPY start-nginx.sh /start-nginx.sh

RUN chmod +x /start-nginx.sh
ENTRYPOINT ["/start-nginx.sh"]
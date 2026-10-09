#!/bin/bash
# Включает подробные журналы на сервере. Повторный запуск безопасен.
#
#   bash /opt/teboil/scripts/server/setup-logging.sh
#
# 1. nginx пишет в журнал время ответа (rt=), время процесса (urt=), какой
#    процесс ответил (up=), метку запроса (rid=) и устройства (dev=) и
#    передаёт метку запроса приложению — по ней строки склеиваются.
#    Первые поля строки не меняются: старые скрипты разбора работают.
# 2. Таймер teboil-monitor раз в 30 секунд пишет снимок сервера.
# 3. Журналы nginx хранятся 60 дней, снимки сервера — 60 дней.
#
# Перед перезагрузкой nginx конфиг проверяется (nginx -t); при ошибке всё
# возвращается как было.
set -u
SITE=/etc/nginx/sites-available/teboil
BACKUP="$SITE.bak-$(date +%Y%m%d-%H%M%S)"

if ! grep -q 'log_format teboil' "$SITE"; then
  cp "$SITE" "$BACKUP"
  {
    cat <<'NGINX'
# Журнал с временем ответа и метками запроса/устройства (setup-logging.sh).
log_format teboil '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent '
                  '"$http_referer" "$http_user_agent" rt=$request_time urt=$upstream_response_time '
                  'up=$upstream_addr rid=$request_id dev=$http_x_device';

NGINX
    cat "$BACKUP"
  } > "$SITE"
  # Журнал в новом формате — в блоке HTTPS-сервера (после server_name с client_max_body_size).
  sed -i 's#^\(\s*client_max_body_size 8m;\)#\1\n\n    access_log /var/log/nginx/access.log teboil;#' "$SITE"
  # Метка запроса и исходный адрес — приложению.
  sed -i 's#^\(\s*proxy_set_header X-Forwarded-Proto \$scheme;\)#\1\n        proxy_set_header X-Request-Id $request_id;\n        proxy_set_header X-Original-URI $request_uri;#' "$SITE"
  if nginx -t 2>/tmp/nginx-test.log; then
    systemctl reload nginx
    echo "nginx: новый формат журнала включён (копия старого конфига: $BACKUP)"
  else
    cp "$BACKUP" "$SITE"
    echo "nginx: проверка конфига не прошла — вернул как было:"
    cat /tmp/nginx-test.log
    exit 1
  fi
else
  echo "nginx: формат журнала уже настроен"
fi

# Хранить журналы nginx 60 дней вместо 14.
sed -i 's/^\(\s*rotate\) 14$/\1 60/' /etc/logrotate.d/nginx

# Снимки сервера.
mkdir -p /var/log/teboil
cat > /etc/systemd/system/teboil-monitor.service <<'UNIT'
[Unit]
Description=Teboil: снимок состояния сервера в /var/log/teboil/monitor.log

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/teboil/scripts/server/monitor.sh
UNIT
cat > /etc/systemd/system/teboil-monitor.timer <<'UNIT'
[Unit]
Description=Teboil: снимок состояния сервера раз в 30 секунд

[Timer]
OnBootSec=30s
OnUnitActiveSec=30s
AccuracySec=1s

[Install]
WantedBy=timers.target
UNIT
# Журнал приложения: все четыре процесса дописывают в один файл, поэтому
# copytruncate — процессы перезапускать не нужно.
cat > /etc/logrotate.d/teboil-app <<'ROT'
/var/log/teboil.log {
	daily
	rotate 60
	compress
	delaycompress
	missingok
	notifempty
	copytruncate
}
ROT
cat > /etc/logrotate.d/teboil-monitor <<'ROT'
/var/log/teboil/monitor.log {
	daily
	rotate 60
	compress
	delaycompress
	missingok
	notifempty
}
ROT
systemctl daemon-reload
systemctl enable --now teboil-monitor.timer >/dev/null 2>&1
echo "монитор: $(systemctl is-active teboil-monitor.timer), журнал /var/log/teboil/monitor.log"

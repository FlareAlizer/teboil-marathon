#!/bin/bash
# Снимок состояния сервера — одна строка в /var/log/teboil/monitor.log.
# Запускается таймером systemd каждые 30 секунд (teboil-monitor.timer).
#
# По этим строкам после мероприятия видно, когда серверу было плохо: какой
# процесс не отвечал, сколько было запросов и ошибок за минуту, сколько
# соединений с базой и свободной памяти. Пометки WORKER_DOWN / PG_DOWN /
# DISK_FULL / SITE_DOWN ищутся простым grep.
#
# LC_ALL=C обязателен: в русской локали date пишет месяц как «окт», а nginx —
# «Oct», и подсчёт по журналу молча давал бы ноль.
export LC_ALL=C
set -u

LOG_DIR=/var/log/teboil
mkdir -p "$LOG_DIR"
now=$(date '+%Y-%m-%dT%H:%M:%S%z')
flags=""

load=$(cut -d' ' -f1 /proc/loadavg)
mem=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo)
disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "${disk:-0}" -ge 90 ] && flags="$flags DISK_FULL"

# Каждый рабочий процесс напрямую: код и время ответа. Запрос лёгкий —
# проверка сессии не ходит в базу и не пишет в журнал.
workers=""
for port in 3001 3002 3003 3004; do
  r=$(curl -s -o /dev/null -w '%{http_code}:%{time_total}' --max-time 5 "http://127.0.0.1:$port/api/admin/session" 2>/dev/null)
  code=${r%%:*}
  ms=$(awk -v t="${r##*:}" 'BEGIN{printf "%d", t*1000}')
  workers="$workers w$port=${code:-000}/${ms}ms"
  [ "${code:-000}" != "200" ] && flags="$flags WORKER_DOWN:$port"
  [ "${ms:-0}" -gt 2000 ] && flags="$flags WORKER_SLOW:$port"
done

# Сайт целиком — через nginx и TLS, как его видит телефон.
site=$(curl -s -o /dev/null -w '%{http_code}:%{time_total}' --max-time 8 \
  --resolve teboil.space:443:127.0.0.1 "https://teboil.space/api/admin/session" 2>/dev/null)
site_code=${site%%:*}
site_ms=$(awk -v t="${site##*:}" 'BEGIN{printf "%d", t*1000}')
[ "${site_code:-000}" != "200" ] && flags="$flags SITE_DOWN"

# База: доступна ли и сколько соединений.
pg=$(sudo -u postgres psql -At -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'teboil'" 2>/dev/null)
[ -z "$pg" ] && { flags="$flags PG_DOWN"; pg=-1; }

# Запросы и ошибки за прошлую полную минуту по журналу nginx.
prev=$(date -d '-1 min' '+%d/%b/%Y:%H:%M')
read -r req e5 e4 slow < <(tail -n 30000 /var/log/nginx/access.log | awk -v m="[$prev" '
  index($4, m) == 1 {
    n++
    if ($9 ~ /^5/) e5++
    if ($9 ~ /^4/) e4++
    for (i = 10; i <= NF; i++) if ($i ~ /^rt=/) { split($i, a, "="); if (a[2] + 0 > 1) s++ }
  }
  END { printf "%d %d %d %d\n", n, e5, e4, s }')

# Ошибки приложения за минуту (строки журнала с "lvl":"error").
app_err=$(journalctl -u 'teboil@*' --since '-1 min' -o cat --no-pager 2>/dev/null | grep -c '"lvl":"error"')

echo "$now load=$load mem_free_mb=$mem disk_used=${disk}% pg_conn=$pg site=${site_code:-000}/${site_ms}ms$workers req_1m=$req 5xx_1m=$e5 4xx_1m=$e4 slow_1m=$slow app_err_1m=$app_err${flags}" >> "$LOG_DIR/monitor.log"

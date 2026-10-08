#!/bin/bash
# Выкатка новой версии на сервер с проверкой, что на сайте сейчас не играют.
#
#   bash /opt/teboil/scripts/server/deploy.sh          # с проверкой
#   bash /opt/teboil/scripts/server/deploy.sh --force  # без проверки (только если иначе никак)
#
# Порядок: git pull → сборка → по одному перезапуск четырёх процессов с
# ожиданием ответа каждого. Пока один перезапускается, три других работают,
# поэтому сайт не пропадает. Если сборка упала — работающая версия остаётся.
#
# LC_ALL=C обязателен: в русской локали date пишет месяц «окт», а журнал nginx
# — «Oct». Без этого проверка активности всегда видела ноль запросов.
export LC_ALL=C
set -uo pipefail
cd /opt/teboil

if [ "${1:-}" != "--force" ]; then
  SINCE=$(date -d '-4 min' '+%d/%b/%Y:%H:%M')
  busy=$(tail -n 50000 /var/log/nginx/access.log | awk -v s="$SINCE" '
    { t = substr($4, 2, 17); if (t >= s && $7 ~ /^\/api\/(quiz|players|score|station)/) n++ }
    END { print n + 0 }')
  echo "запросов игры за последние 4 минуты: $busy"
  if [ "$busy" -gt 0 ]; then echo "на сайте играют — выкатку откладываю (или --force)"; exit 2; fi
fi

before=$(git log --oneline -1)
git pull --ff-only origin master 2>&1 | tail -1
echo "было: $before"
echo "стало: $(git log --oneline -1)"

npm run build > /tmp/teboil-build.log 2>&1 || { echo "СБОРКА УПАЛА — работает прежняя версия"; tail -30 /tmp/teboil-build.log; exit 1; }
echo "сборка: успешно"

for port in 3001 3002 3003 3004; do
  systemctl restart "teboil@$port"
  ok=""
  for i in $(seq 1 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/stats")" = "200" ] && { ok=1; break; }
    sleep 0.5
  done
  [ -z "$ok" ] && { echo "teboil@$port НЕ ПОДНЯЛСЯ"; journalctl -u "teboil@$port" -n 30 --no-pager; exit 1; }
  echo "teboil@$port: работает"
done
echo "через nginx: $(curl -s -o /dev/null -w '%{http_code}' --resolve teboil.space:443:127.0.0.1 https://teboil.space/)"
echo "ошибок в журналах за 5 минут: $(journalctl -u 'teboil@*' --since '-5 min' --no-pager -o cat | grep -c '"lvl":"error"')"

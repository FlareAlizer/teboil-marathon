#!/bin/bash
# Собирает всё о дне мероприятия в одну папку и архив + готовый отчёт.
#
#   bash /opt/teboil/scripts/server/collect-logs.sh            # за сегодня
#   bash /opt/teboil/scripts/server/collect-logs.sh 2026-10-10 # за день
#
# Результат: /root/teboil-logs/<день>/ и /root/teboil-logs/teboil-logs-<день>.tar.gz
#   report.txt   — отчёт: что сломалось, где люди спотыкались, плохие минуты
#   app.jsonl    — события приложения и отметки с устройств (JSON по строке)
#   app-other.log— прочие строки процессов (запуск, предупреждения Next)
#   nginx.log    — каждый запрос: код, время ответа (rt=), процесс (up=), rid, dev
#   nginx-error.log, monitor.log — ошибки nginx и снимки сервера раз в 30 с
#   db.txt       — сводка из базы по часам (только чтение)
#   system.txt   — состояние сервера в момент сбора
#
# Ничего не меняет и в базу не пишет: всё только читается.
export LC_ALL=C
set -u
DAY=${1:-$(date +%F)}
NEXT=$(date -d "$DAY +1 day" +%F)
OUT=/root/teboil-logs/$DAY
mkdir -p "$OUT"
cd /opt/teboil || exit 1

echo "собираю за $DAY → $OUT"

# 1. Приложение. Процессы пишут в /var/log/teboil.log (юнит teboil@.service),
#    время событий — UTC, поэтому день по Москве — это с 21:00 UTC накануне.
FROM_UTC=$(date -u -d "$DAY 00:00" '+%Y-%m-%dT%H:%M:%S')
TO_UTC=$(date -u -d "$NEXT 00:00" '+%Y-%m-%dT%H:%M:%S')
{
  for f in /var/log/teboil.log.*.gz; do [ -f "$f" ] && zcat "$f"; done
  [ -f /var/log/teboil.log.1 ] && cat /var/log/teboil.log.1
  cat /var/log/teboil.log
} 2>/dev/null > "$OUT/app-all.log"
awk -v a="$FROM_UTC" -v b="$TO_UTC" '/^\{/ { i = index($0, "\"t\":\""); t = substr($0, i + 5, 19); if (t >= a && t < b) print }' "$OUT/app-all.log" > "$OUT/app.jsonl"
grep -v '^{' "$OUT/app-all.log" | tail -n 2000 > "$OUT/app-other.log"
rm -f "$OUT/app-all.log"
# Перезапуски процессов за день — важно знать, не падали ли они.
journalctl -u 'teboil@*' --since "$DAY 00:00:00" --until "$NEXT 00:00:00" --no-pager 2>/dev/null \
  | grep -E 'Started|Stopped|Main process exited|Failed|killed|OOM' > "$OUT/restarts.log"

# 2. nginx: день может лежать в текущем журнале и в ротированных.
NGINX_DAY=$(date -d "$DAY" '+%d/%b/%Y')
{
  for f in /var/log/nginx/access.log.*.gz; do [ -f "$f" ] && zcat "$f"; done
  [ -f /var/log/nginx/access.log.1 ] && cat /var/log/nginx/access.log.1
  cat /var/log/nginx/access.log
} 2>/dev/null | grep -F "[$NGINX_DAY:" > "$OUT/nginx.log"
NGINX_ERR_DAY=$(date -d "$DAY" '+%Y/%m/%d')
{
  for f in /var/log/nginx/error.log.*.gz; do [ -f "$f" ] && zcat "$f"; done
  [ -f /var/log/nginx/error.log.1 ] && cat /var/log/nginx/error.log.1
  cat /var/log/nginx/error.log
} 2>/dev/null | grep -F "$NGINX_ERR_DAY" > "$OUT/nginx-error.log"

# 3. Снимки сервера.
grep -h "^$DAY" /var/log/teboil/monitor.log* 2>/dev/null > "$OUT/monitor.log"

# 4. База — только чтение.
set -a; . ./.env; set +a
export PGOPTIONS='-c default_transaction_read_only=on'
q() { psql "$DATABASE_URL" -At -F ' | ' -c "$1" 2>&1; }
{
  echo "=== итог дня $DAY"
  q "SELECT 'участников (визитов): ' || COUNT(*) FROM visits WHERE event_day = '$DAY'"
  q "SELECT 'новых участников: ' || COUNT(*) FROM players WHERE event_day = '$DAY'"
  q "SELECT 'начислений: ' || COUNT(*) || ', баллов: ' || COALESCE(SUM(points),0) FROM score_events WHERE event_day = '$DAY'"
  q "SELECT 'отменено (архив): ' || COUNT(*) FROM deleted_events WHERE event_day = '$DAY'"
  echo; echo "=== по активностям (активность | начислений | участников | баллов)"
  q "SELECT activity, COUNT(*), COUNT(DISTINCT player_id), SUM(points) FROM score_events WHERE event_day = '$DAY' GROUP BY 1 ORDER BY 2 DESC"
  echo; echo "=== по часам (час | начислений | участников)"
  q "SELECT to_char(created_at, 'HH24'), COUNT(*), COUNT(DISTINCT player_id) FROM score_events WHERE event_day = '$DAY' GROUP BY 1 ORDER BY 1"
  echo; echo "=== новые участники по часам"
  q "SELECT to_char(created_at, 'HH24'), COUNT(*) FROM players WHERE event_day = '$DAY' GROUP BY 1 ORDER BY 1"
  echo; echo "=== записи станций, пришедшие из очереди устройства (с меткой clientId)"
  q "SELECT COUNT(*) FROM score_events WHERE event_day = '$DAY' AND meta ? 'clientId' AND activity LIKE 'sport%'"
  echo; echo "=== топ-10 квиза"
  q "SELECT p.nickname, SUM(se.points) FROM score_events se JOIN players p ON p.id = se.player_id WHERE se.event_day = '$DAY' AND se.activity LIKE 'quiz%' GROUP BY 1 ORDER BY 2 DESC LIMIT 10"
} > "$OUT/db.txt"

# 5. Сервер сейчас.
{
  echo "собрано: $(date)"; uptime; echo; free -m; echo; df -h /; echo
  for p in 3001 3002 3003 3004; do echo "teboil@$p: $(systemctl is-active teboil@$p), с $(systemctl show -p ActiveEnterTimestamp --value teboil@$p)"; done
  echo; echo "код: $(git log --oneline -1)"
  echo; echo "бэкапы базы (последние):"; ls -la /opt/teboil-backup 2>/dev/null | tail -3
} > "$OUT/system.txt"

# 6. Отчёт.
node scripts/server/log-report.mjs "$OUT" > "$OUT/report.txt" 2>&1

tar -czf "/root/teboil-logs/teboil-logs-$DAY.tar.gz" -C /root/teboil-logs "$DAY"
echo "готово: $(du -sh "$OUT" | cut -f1), архив /root/teboil-logs/teboil-logs-$DAY.tar.gz"
echo "отчёт: $OUT/report.txt"

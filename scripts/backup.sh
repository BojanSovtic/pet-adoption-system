#!/bin/sh
# Nightly production backup (docs/deployment.md §8): a database dump and a
# photo archive, uploaded to Backblaze B2. Runs on the VM from cron as the
# deploy user (member of the `docker` group):
#
#   /bin/sh /opt/pet-adoption/scripts/backup.sh
#
# Each file is written under tmp/ and moved into daily/ only after it was
# created successfully and passed a gzip integrity check, so daily/ (the only
# directory uploaded) never holds a partial file. Any failure stops the script
# with a non-zero exit and a FAILED line in the log; the monitoring ping is
# sent only after every step, including the upload, has succeeded.
#
# The backup directory is outside the repository on purpose: anything inside
# /opt/pet-adoption is part of the Docker build context.

set -eu
umask 077
# cron's PATH is minimal (/usr/bin:/bin).
PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

APP_DIR=${APP_DIR:-/opt/pet-adoption}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/pet-adoption}
B2_REMOTE=${B2_REMOTE:-b2:pet-adoption-backups}
UPLOADS_VOLUME=${UPLOADS_VOLUME:-pet-adoption-prod_uploads_data}
# Optional dead man's switch (e.g. a Healthchecks.io check URL), set in the
# crontab line; an alert fires when no ping arrives in time.
BACKUP_PING_URL=${BACKUP_PING_URL:-}
KEEP_LOCAL_DAYS=3

DAILY_DIR="$BACKUP_ROOT/daily"
TMP_DIR="$BACKUP_ROOT/tmp"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# One name per run (UTC), so a manual run before an update is never
# overwritten by the nightly one.
stamp=$(date -u +%Y-%m-%dT%H%MZ)
# The PID keeps a manual run and a cron run from sharing temporary files.
tmp_db="$TMP_DIR/db-$stamp.$$.partial"
tmp_uploads="$TMP_DIR/uploads-$stamp.$$.partial"

on_exit() {
  status=$?
  rm -f "$tmp_db" "$tmp_uploads"
  if [ "$status" -ne 0 ]; then
    log "backup FAILED (exit $status); nothing was pinged"
  fi
}
trap on_exit EXIT
# Make signals run the EXIT trap too (dash doesn't otherwise).
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Moves a finished temporary file into daily/ after checking it.
finish() {
  tmp_file=$1
  final_file=$2
  if [ ! -s "$tmp_file" ]; then
    log "error: $final_file is missing or empty"
    exit 1
  fi
  if ! gzip -t "$tmp_file"; then
    log "error: $final_file is not a valid gzip file (truncated?)"
    exit 1
  fi
  # Same file system, so the rename is atomic.
  mv -f "$tmp_file" "$DAILY_DIR/$final_file"
  log "ok: $final_file ($(wc -c <"$DAILY_DIR/$final_file") bytes)"
}

log "backup started"
mkdir -p "$DAILY_DIR" "$TMP_DIR"
# Leftovers of a run that was killed (power loss, OOM) before its trap ran.
find "$TMP_DIR" -type f -name '*.partial' -mmin +720 -exec rm -f {} +

# Database: mongodump from the official image, reading MONGODB_URI from the
# env file. The URI names the pet-adoption database, so only it is dumped.
docker run --rm --env-file "$APP_DIR/.env.production" mongo:8 \
  sh -c 'mongodump --uri "$MONGODB_URI" --archive --gzip --quiet' >"$tmp_db"
finish "$tmp_db" "db-$stamp.archive.gz"

# Photos: a read-only mount of the volume, streamed out as a tar.gz.
docker run --rm -v "$UPLOADS_VOLUME:/data:ro" alpine:3 \
  tar czf - -C /data . >"$tmp_uploads"
finish "$tmp_uploads" "uploads-$stamp.tar.gz"

# copy (never sync): it only adds files, so the B2 key needs no delete
# permission. B2's lifecycle rule handles retention there.
rclone copy "$DAILY_DIR" "$B2_REMOTE"
log "ok: uploaded to $B2_REMOTE"

# Local copies are only a convenience; B2 holds the history.
find "$DAILY_DIR" -type f \( -name 'db-*.archive.gz' -o -name 'uploads-*.tar.gz' \) \
  -mtime +"$KEEP_LOCAL_DAYS" -exec rm -f {} +

if [ -n "$BACKUP_PING_URL" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$BACKUP_PING_URL"
  log "ok: monitoring ping sent"
else
  log "note: BACKUP_PING_URL not set, no monitoring ping"
fi

log "backup finished"

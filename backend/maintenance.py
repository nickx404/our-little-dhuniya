"""Keep seven daily database snapshots. Media remains in Telegram."""
import datetime
from store import DATA, backup, database
from telegram_client import call, config

folder = DATA / 'backups'
today = datetime.date.today().isoformat()
snapshot = folder / f'archive-{today}.sqlite3'
backup(snapshot)
channel = config()['channel']
chat = call('getChat', chat_id=channel)
if chat['type'] != 'channel' or chat.get('username') or chat.get('active_usernames'):
    raise SystemExit('Database backups require a private channel.')
result = call('sendDocument', chat_id=channel, document=snapshot.as_uri(),
              caption=f'Private scrapbook database backup · {today}. Contains notes and file mappings; no bot credentials.')
with database() as db:
    import json
    db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)',
               ('latest_backup', json.dumps({'file_id':result['document']['file_id'], 'message_id':result['message_id'], 'day':today})))
for path in sorted(folder.glob('archive-????-??-??.sqlite3'))[:-7]:
    path.unlink()

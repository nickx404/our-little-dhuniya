"""Single durable Telegram sender. Run as its own systemd service."""

import hashlib
import time

from store import DATA, database, staging_path
from telegram_client import TelegramError, call, config, local_file


def recover():
    # Sending is an external side effect. A lost response requires reconciliation.
    with database() as db:
        db.execute("UPDATE parts SET state='uncertain' WHERE state='sending'")
        db.execute("UPDATE items SET error='A transfer response was lost. Check the Telegram post before retrying.' WHERE id IN (SELECT item FROM parts WHERE state='uncertain')")


def send_one():
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        part = db.execute('''SELECT p.*, i.name, i.title FROM parts p JOIN items i ON i.id=p.item
          WHERE p.state='queued' AND i.state='uploading' ORDER BY i.created,p.number LIMIT 1''').fetchone()
        if not part:
            return False
        db.execute("UPDATE parts SET state='sending' WHERE item=? AND number=?", (part['item'], part['number']))
    path = staging_path(part['item'], part['number'])
    try:
        if not path.is_file() or path.stat().st_size != part['size']:
            raise TelegramError('Staging file is missing or incomplete.', definite=True)
        settings = config()
        chat = call('getChat', chat_id=settings['channel'])
        if chat['type'] != 'channel' or chat.get('username') or chat.get('active_usernames'):
            raise TelegramError('The archive channel must be private.', definite=True)
        with path.open('rb') as file:
            checksum = hashlib.file_digest(file, 'sha256').hexdigest()
        result = call('sendDocument', chat_id=settings['channel'], document=path.as_uri(),
                      caption=f"{part['title'][:300]}\nArchive {part['item']} · part {part['number'] + 1}")
        with database() as db:
            db.execute('''UPDATE parts SET state='sent',file_id=?,message_id=?,sha256=?
              WHERE item=? AND number=?''',
                       (result['document']['file_id'], result['message_id'], checksum, part['item'], part['number']))
            db.execute("UPDATE items SET error='' WHERE id=?", (part['item'],))
            remaining = db.execute("SELECT COUNT(*) FROM parts WHERE item=? AND state!='sent'", (part['item'],)).fetchone()[0]
            covered = db.execute('SELECT COALESCE(SUM(size),0) FROM parts WHERE item=?', (part['item'],)).fetchone()[0]
            db.execute("UPDATE items SET state='ready' WHERE id=? AND state='uploading' AND size=? AND ?=0",
                       (part['item'], covered, remaining))
        path.unlink(missing_ok=True)
    except TelegramError as error:
        with database() as db:
            db.execute('UPDATE parts SET state=? WHERE item=? AND number=?',
                       ('failed' if error.definite else 'uncertain', part['item'], part['number']))
            db.execute('UPDATE items SET error=? WHERE id=?', (str(error), part['item']))
    except (OSError, KeyError):
        with database() as db:
            db.execute("UPDATE parts SET state='uncertain' WHERE item=? AND number=?", (part['item'], part['number']))
            db.execute("UPDATE items SET error='Transfer needs reconciliation before retrying.' WHERE id=?", (part['item'],))
    return True


def main():
    import fcntl
    from store import initialize
    initialize()
    with (DATA / 'worker.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        recover()
        while True:
            if not send_one():
                time.sleep(1)


if __name__ == '__main__':
    main()

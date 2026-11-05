"""Durable upload records. Media bytes live in Telegram, never in SQLite."""

import json
import os
import shutil
import sqlite3
import uuid
from contextlib import closing, contextmanager
from pathlib import Path

DATA = Path(os.environ.get('DHUNIYA_DATA', '/srv/dhuniya-telegram')).resolve()
PART_SIZE = 2_000_000_000
CHUNK_SIZE = 8 * 1024 * 1024
HEADROOM = 1_073_741_824


@contextmanager
def database():
    connection = sqlite3.connect(DATA / 'archive.sqlite3', timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize():
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'staging').mkdir(exist_ok=True)
    with database() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL,
          mime TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
          fingerprint TEXT NOT NULL DEFAULT '',
          collection TEXT NOT NULL DEFAULT 'moments',
          caption TEXT NOT NULL, day TEXT NOT NULL, tags TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'uploading', error TEXT NOT NULL DEFAULT '',
          created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS parts (
          item TEXT REFERENCES items(id), number INTEGER, start INTEGER NOT NULL,
          size INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL DEFAULT 'receiving', sha256 TEXT,
          file_id TEXT, message_id INTEGER, cache_path TEXT,
          PRIMARY KEY(item, number)
        );
        CREATE TABLE IF NOT EXISTS notes_updates (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pin_failures (at REAL NOT NULL);
        ''')
        columns = {row[1] for row in db.execute('PRAGMA table_info(items)')}
        if 'fingerprint' not in columns:
            db.execute("ALTER TABLE items ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''")
        if 'collection' not in columns:
            db.execute("ALTER TABLE items ADD COLUMN collection TEXT NOT NULL DEFAULT 'moments'")
        old = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='videos'").fetchone()
        if old:
            for video in db.execute('SELECT id,name,file_id FROM videos').fetchall():
                item_id = f'legacy-{video[0]}'
                db.execute('''INSERT OR IGNORE INTO items
                  (id,name,size,mime,kind,title,caption,day,tags,state)
                  VALUES (?,?,0,'video/mp4','video',?,'','1970-01-01','[]','legacy')''',
                           (item_id, video[1], video[1]))
                db.execute('''INSERT OR IGNORE INTO parts
                  (item,number,start,size,state,file_id) VALUES (?,0,0,0,'sent',?)''',
                           (item_id, video[2]))


def staging_path(item, number):
    # IDs and part numbers are validated before creating a record.
    return DATA / 'staging' / f'{item}.{number}.part'


def valid_id(value):
    try:
        return str(uuid.UUID(value)) == value
    except (ValueError, TypeError, AttributeError):
        return False


def available_space(db, additional=0):
    reserved = db.execute('''SELECT COALESCE(SUM(size-received),0) FROM parts
      WHERE state='receiving' ''').fetchone()[0]
    return shutil.disk_usage(DATA).free >= HEADROOM + reserved + additional


def public_item(row):
    result = dict(row)
    result['tags'] = json.loads(result['tags'])
    return result


def backup(destination):
    destination = Path(destination).resolve()
    if destination == DATA / 'archive.sqlite3':
        raise ValueError('Choose a separate backup path.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with database() as source, closing(sqlite3.connect(destination)) as target:
        source.backup(target)
        if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Backup integrity check failed.')
    os.chmod(destination, 0o600)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', required=True)
    backup(parser.parse_args().backup)

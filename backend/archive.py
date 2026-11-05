"""Private scrapbook API. Run on loopback behind the HTTPS proxy."""
import base64
import datetime
import hashlib
import json
import mimetypes
import os
import re
import secrets
import threading
import time
from pathlib import Path
from urllib.parse import quote

from flask import Flask, Response, abort, jsonify, render_template, request, send_file, send_from_directory
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash

from store import CHUNK_SIZE, DATA, PART_SIZE, available_space, database, initialize, public_item, staging_path, valid_id
from telegram_client import TelegramError, config, local_file

SITE = Path(os.environ.get('DHUNIYA_SITE', DATA / 'site'))
HOSTS = set(os.environ.get('DHUNIYA_HOSTS', '127.0.0.1:4178').split(','))
app = Flask(__name__, static_folder=None)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=0, x_proto=1, x_host=0, x_port=0, x_prefix=0)
app.config['MAX_CONTENT_LENGTH'] = CHUNK_SIZE
class InsufficientStorage(HTTPException):
    code = 507
    description = 'The server needs more disk space before this transfer can continue.'


app.aborter.mapping[507] = InsufficientStorage
upload_lock = threading.Lock()
cache_lock = threading.RLock()
SESSION_AGE = 43200
CACHE_BUDGET = 6_000_000_000
LOCK_ART = {'bunny-pixel.png', 'otter-pixel.png', 'patrick-0.ttf'}


def signer(purpose):
    settings = config()
    return URLSafeTimedSerializer(settings['csrf'], salt=f"{purpose}:{settings['pin_hash']}")


def authorize(token, purpose='session', max_age=SESSION_AGE):
    try:
        return signer(purpose).loads(token, max_age=max_age)
    except BadSignature:
        abort(401, 'Please unlock the scrapbook again.')


@app.before_request
def protect():
    if request.remote_addr != '127.0.0.1' or request.host not in HOSTS:
        abort(403)
    if request.method not in {'GET', 'HEAD'}:
        origin = request.headers.get('Origin')
        if origin and origin != request.host_url.rstrip('/'):
            abort(403)
        if request.is_json and not isinstance(request.get_json(), dict):
            abort(400, 'Send a JSON object.')
    if request.endpoint in {'unlock_page', 'unlock', 'art', 'health', 'media', 'assets'}:
        return
    authorize(request.headers.get('Authorization', '').removeprefix('Bearer '))


@app.after_request
def headers(response):
    response.headers.update({'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
                             'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY'})
    return response


@app.errorhandler(Exception)
def errors(error):
    if isinstance(error, HTTPException):
        return jsonify(error=error.description), error.code
    if isinstance(error, TelegramError):
        return jsonify(error=str(error)), 502
    if isinstance(error, OSError) and error.errno == 28:
        return jsonify(error=InsufficientStorage.description), 507
    app.logger.error('Private request failed (%s)', type(error).__name__)
    return jsonify(error='The request could not finish. Your saved records are intact.'), 500


@app.get('/api/health')
def health():
    return jsonify(ok=True)


@app.get('/')
@app.get('/index.html')
@app.get('/unlock')
@app.get('/archive')
def unlock_page():
    return render_template('unlock.html')


@app.get('/lock-art/<name>')
def art(name):
    if name not in LOCK_ART:
        abort(404)
    return send_from_directory(SITE / 'assets', name)


@app.post('/api/unlock')
def unlock():
    pin = (request.get_json() or {}).get('pin', '')
    if not isinstance(pin, str) or not re.fullmatch('[0-9]{4}', pin):
        abort(401, 'That code did not open the lock.')
    with upload_lock, database() as db:
        now = time.time()
        db.execute('DELETE FROM pin_failures WHERE at<?', (now - 60,))
        if db.execute('SELECT COUNT(*) FROM pin_failures').fetchone()[0] >= 5:
            abort(429, 'Take a little pause and try again in a minute.')
        valid = check_password_hash(config()['pin_hash'], pin)
        if not valid:
            db.execute('INSERT INTO pin_failures VALUES (?)', (now,))
    if not valid:
        abort(401, 'That code did not open the lock.')
    return jsonify(token=signer('session').dumps(secrets.token_hex(16)))


@app.get('/api/shell')
def shell():
    return (SITE / 'index.html').read_text(encoding='utf-8').replace('"./', '"/private-assets/')


@app.get('/private-assets/<path:name>')
def assets(name):
    if Path(name).suffix.lower() not in {'.js', '.mjs', '.css', '.png', '.jpg', '.ttf'}:
        abort(404)
    return send_from_directory(SITE, name)


@app.get('/api/items')
def items():
    with database() as db:
        rows = db.execute("SELECT * FROM items WHERE state IN ('ready','legacy') ORDER BY created DESC,id").fetchall()
    return jsonify([public_item(row) for row in rows])


def metadata(body):
    title, caption, day, tags = (body.get(key, default) for key, default in
                                [('title', ''), ('caption', ''), ('day', ''), ('tags', [])])
    if not isinstance(title, str) or len(title) > 200 or not isinstance(caption, str) or len(caption) > 4000:
        abort(400, 'Use a title up to 200 characters and caption up to 4,000.')
    if not isinstance(tags, list) or len(tags) > 30 or any(not isinstance(t, str) or len(t) > 60 for t in tags):
        abort(400, 'Use at most 30 tags, each up to 60 characters.')
    if not isinstance(day, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day):
        abort(400, 'Choose a valid memory date.')
    try:
        datetime.date.fromisoformat(day)
    except (ValueError, TypeError):
        abort(400, 'Choose a valid memory date.')
    return title.strip(), caption, day, json.dumps(list(dict.fromkeys(t.strip() for t in tags if t.strip())))


@app.post('/api/uploads')
def create_upload():
    body = request.get_json() or {}
    item_id, size, name = body.get('id'), body.get('size'), body.get('name', '')
    if not valid_id(item_id) or type(size) is not int or not 0 < size <= 9_007_199_254_740_991:
        abort(400, 'Choose a nonempty file with a valid upload identifier.')
    if not isinstance(name, str) or not 0 < len(name) <= 240:
        abort(400, 'The filename must be between 1 and 240 characters.')
    fingerprint = body.get('fingerprint', '')
    if not isinstance(fingerprint, str) or not re.fullmatch('[0-9a-f]{64}', fingerprint):
        abort(400, 'A file fingerprint is required for safe resume.')
    title, caption, day, tags = metadata(body)
    collection = body.get('collection', 'moments')
    if collection not in {'moments', 'keepsakes'}:
        abort(400)
    name = name.replace('\\', '/').split('/')[-1]
    mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    kind = 'photo' if mime.startswith('image/') else 'video' if mime.startswith('video/') else 'audio' if mime.startswith('audio/') else 'attachment'
    if collection == 'keepsakes' and kind != 'photo':
        abort(400, 'Choose a photograph or scan for a keepsake.')
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        existing = db.execute('SELECT * FROM items WHERE id=?', (item_id,)).fetchone()
        if existing and (existing['name'] != name or existing['size'] != size or existing['fingerprint'] != fingerprint):
            abort(409, 'This identifier belongs to a different file.')
        if not existing:
            db.execute('INSERT INTO items (id,name,size,mime,kind,title,caption,day,tags,fingerprint,collection) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                       (item_id, name, size, mime, kind, title or name, caption, day, tags, fingerprint, collection))
    return upload_status(item_id)


@app.get('/api/uploads')
def pending_uploads():
    with database() as db:
        rows = db.execute("SELECT * FROM items WHERE state='uploading' ORDER BY created").fetchall()
    return jsonify([public_item(row) for row in rows])


@app.get('/api/uploads/<item_id>')
def upload_status(item_id):
    with database() as db:
        item = db.execute('SELECT * FROM items WHERE id=?', (item_id,)).fetchone()
        if not item:
            abort(404)
        parts = [dict(row) for row in db.execute('SELECT number,start,size,received,state,sha256 FROM parts WHERE item=? ORDER BY number', (item_id,))]
    return jsonify(item=public_item(item), parts=parts, chunk_size=CHUNK_SIZE, part_size=PART_SIZE)


@app.put('/api/uploads/<item_id>/parts/<int:number>')
def receive_chunk(item_id, number):
    if not valid_id(item_id):
        abort(404)
    try:
        offset = int(request.headers.get('Upload-Offset', '-1'))
    except ValueError:
        abort(400)
    length = request.content_length
    supplied_hash = request.headers.get('Upload-Checksum', '')
    if length is None or not 0 < length <= CHUNK_SIZE or not re.fullmatch('[0-9a-f]{64}', supplied_hash):
        abort(400, 'Send a nonempty chunk up to 8 MiB with its SHA-256 checksum.')
    with upload_lock, database() as db:
        db.execute('BEGIN IMMEDIATE')
        item = db.execute('SELECT * FROM items WHERE id=?', (item_id,)).fetchone()
        if not item or item['state'] != 'uploading':
            abort(409, 'This file is not accepting more data.')
        start = number * PART_SIZE
        total = min(PART_SIZE, item['size'] - start)
        if total <= 0 or not 0 <= offset < total or offset + length > total:
            abort(400, 'Chunk exceeds its part boundary.')
        part = db.execute('SELECT * FROM parts WHERE item=? AND number=?', (item_id, number)).fetchone()
        if not part:
            if number and not db.execute("SELECT 1 FROM parts WHERE item=? AND number=? AND state='sent'", (item_id, number - 1)).fetchone():
                abort(409, 'Wait for the previous part to finish.')
            if offset:
                abort(409, 'Resume from the acknowledged offset.')
            if not available_space(db, total * 2):
                abort(507, 'The server needs more free disk space before this part can start.')
            db.execute('INSERT INTO parts (item,number,start,size) VALUES (?,?,?,?)', (item_id, number, start, total))
            received, state = 0, 'receiving'
        else:
            received, state = part['received'], part['state']
        if state == 'sent':
            return jsonify(received=received, state=state)
        if state not in {'receiving', 'queued'}:
            abort(409, 'This part is transferring or needs reconciliation.')
        path = staging_path(item_id, number)
        if offset < received:
            if offset + length > received or not path.is_file():
                abort(409, 'Resume from the acknowledged offset.')
            with path.open('rb') as file:
                file.seek(offset)
                if hashlib.sha256(file.read(length)).hexdigest() != supplied_hash:
                    abort(409, 'The selected file differs from the saved upload.')
            return jsonify(received=received, state=state)
        if offset != received or not available_space(db):
            abort(409 if offset != received else 507, 'Check the upload offset and available disk space.')
        if received and (not path.is_file() or path.stat().st_size < received):
            abort(409, 'The staged part is unavailable. Cancel and start a new upload.')
        chunk = request.get_data()
        if len(chunk) != length or hashlib.sha256(chunk).hexdigest() != supplied_hash:
            abort(400, 'Chunk checksum did not match.')
        with path.open('r+b' if path.exists() else 'w+b') as file:
            file.truncate(received)
            file.seek(received)
            file.write(chunk)
            file.flush()
            os.fsync(file.fileno())
        received += length
        state = 'queued' if received == total else 'receiving'
        db.execute('UPDATE parts SET received=?,state=? WHERE item=? AND number=?', (received, state, item_id, number))
    return jsonify(received=received, state=state)


@app.post('/api/uploads/<item_id>/retry')
def retry_upload(item_id):
    with database() as db:
        if db.execute("SELECT 1 FROM parts WHERE item=? AND state='uncertain'", (item_id,)).fetchone() and (request.get_json() or {}).get('confirm_unknown') is not True:
            abort(409, 'A response was lost. Check Telegram before retrying, which may create a duplicate post.')
        db.execute("UPDATE parts SET state='queued' WHERE item=? AND state IN ('failed','uncertain')", (item_id,))
        db.execute("UPDATE items SET error='' WHERE id=? AND state='uploading'", (item_id,))
    return upload_status(item_id)


@app.delete('/api/uploads/<item_id>')
def cancel_upload(item_id):
    if not valid_id(item_id):
        abort(404)
    with upload_lock, database() as db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute("SELECT 1 FROM parts WHERE item=? AND state='sending'", (item_id,)).fetchone():
            abort(409, 'Wait for the active Telegram transfer before cancelling.')
        item = db.execute('SELECT state FROM items WHERE id=?', (item_id,)).fetchone()
        if not item or item['state'] != 'uploading':
            abort(409)
        db.execute("UPDATE items SET state='cancelled' WHERE id=?", (item_id,))
        for row in db.execute('SELECT number FROM parts WHERE item=?', (item_id,)):
            staging_path(item_id, row[0]).unlink(missing_ok=True)
    return jsonify(ok=True)


@app.patch('/api/items/<item_id>')
def edit_item(item_id):
    values = metadata(request.get_json() or {})
    with database() as db:
        updated = db.execute("UPDATE items SET title=?,caption=?,day=?,tags=? WHERE id=? AND state IN ('ready','legacy')", (*values, item_id))
        if not updated.rowcount:
            abort(404)
    return jsonify(ok=True)


@app.delete('/api/items/<item_id>')
def delete_item(item_id):
    with database() as db:
        db.execute("UPDATE items SET state='deleted' WHERE id=? AND state IN ('ready','legacy')", (item_id,))
        for row in db.execute("SELECT key,value FROM settings WHERE key LIKE 'book:%'").fetchall():
            db.execute('UPDATE settings SET value=? WHERE key=?', (json.dumps([i for i in json.loads(row['value']) if i != item_id]), row['key']))
    return jsonify(ok=True)


@app.route('/api/books/<book_id>', methods=['GET', 'PUT'])
def book_links(book_id):
    if book_id not in {'summer', 'ordinary', 'soft'}:
        abort(404)
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT value FROM settings WHERE key=?', ('book:' + book_id,)).fetchone()
        saved = json.loads(row[0]) if row else []
        if request.method == 'PUT':
            body = request.get_json() or {}
            ids = body.get('ids')
            if 'add' in body:
                item_id = body['add']
                if not isinstance(item_id, str):
                    abort(400)
                if not db.execute("SELECT 1 FROM items WHERE id=? AND state IN ('ready','legacy')", (item_id,)).fetchone():
                    if item_id not in {'sea','flowers','sunset','coffee','beach','mountains','ticket','petal','letter'}:
                        abort(404)
                ids = saved + [item_id]
            if not isinstance(ids, list) or len(ids) > 5000 or any(not isinstance(i, str) or len(i) > 80 for i in ids):
                abort(400)
            db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', ('book:' + book_id, json.dumps(list(dict.fromkeys(ids)))))
        row = db.execute('SELECT value FROM settings WHERE key=?', ('book:' + book_id,)).fetchone()
    return jsonify(ids=json.loads(row[0]) if row else [])


@app.post('/api/items/<item_id>/link')
def media_link(item_id):
    with database() as db:
        if not db.execute("SELECT 1 FROM items WHERE id=? AND state IN ('ready','legacy')", (item_id,)).fetchone():
            abort(404)
    return jsonify(url='/media/' + item_id + '?access=' + signer('media').dumps(item_id))


def cache_file(part):
    path = local_file(part['file_id'])
    with database() as db:
        db.execute('UPDATE parts SET cache_path=? WHERE item=? AND number=?', (str(path), part['item'], part['number']))
        candidates = db.execute('SELECT DISTINCT cache_path FROM parts WHERE cache_path IS NOT NULL').fetchall()
    files = [Path(row[0]) for row in candidates]
    files = [p for p in files if p.is_relative_to(DATA) and p.is_file() and not p.is_relative_to(DATA / 'staging')]
    total = sum(p.stat().st_size for p in files)
    for candidate in sorted(files, key=lambda p: p.stat().st_mtime):
        if total <= CACHE_BUDGET:
            break
        if candidate != path:
            total -= candidate.stat().st_size
            candidate.unlink(missing_ok=True)
    return path


@app.route('/media/<item_id>', methods=['GET', 'HEAD'])
def media(item_id):
    if authorize(request.args.get('access', ''), 'media', 3600) != item_id:
        abort(403)
    with database() as db:
        item = db.execute("SELECT * FROM items WHERE id=? AND state IN ('ready','legacy')", (item_id,)).fetchone()
        parts = db.execute('SELECT * FROM parts WHERE item=? ORDER BY number', (item_id,)).fetchall()
    if not item:
        abort(404)
    if item['state'] == 'legacy':
        with cache_lock:
            size = cache_file(parts[0]).stat().st_size
        with database() as db:
            db.execute("UPDATE items SET size=?,state='ready' WHERE id=?", (size, item_id))
            db.execute('UPDATE parts SET size=?,received=? WHERE item=?', (size, size, item_id))
        return media(item_id)
    size = item['size']
    start, end, status = 0, size - 1, 200
    if request.headers.get('Range'):
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', request.headers['Range'])
        if not match or not any(match.groups()):
            return Response(status=416, headers={'Content-Range': f'bytes */{size}'})
        left, right = match.groups()
        start = int(left) if left else max(0, size - int(right))
        end = min(size - 1, int(right)) if left and right else size - 1
        if start > end or start >= size:
            return Response(status=416, headers={'Content-Range': f'bytes */{size}'})
        status = 206
    headers = {'Accept-Ranges': 'bytes', 'Content-Length': str(end - start + 1)}
    if status == 206:
        headers['Content-Range'] = f'bytes {start}-{end}/{size}'
    disposition = 'attachment' if request.args.get('download') == '1' or item['kind'] == 'attachment' or item['mime'] == 'image/svg+xml' else 'inline'
    headers['Content-Disposition'] = f"{disposition}; filename*=UTF-8''{quote(item['name'], safe='')}"
    mime = item['mime'] if item['kind'] in {'photo', 'video', 'audio'} and item['mime'] != 'image/svg+xml' else 'application/octet-stream'
    def stream():
        try:
            for part in parts:
                first = max(start, part['start'])
                last = min(end, part['start'] + part['size'] - 1)
                if first > last:
                    continue
                with cache_lock:
                    file = cache_file(part).open('rb')
                with file:
                    file.seek(first - part['start'])
                    remaining = last - first + 1
                    while remaining:
                        chunk = file.read(min(256 * 1024, remaining))
                        if not chunk:
                            raise OSError('Telegram returned an incomplete file.')
                        remaining -= len(chunk)
                        yield chunk
        except (OSError, TelegramError):
            raise RuntimeError('The media connection was interrupted. Reopen the memory to try again.') from None
    return Response(None if request.method == 'HEAD' else stream(), status=status, headers=headers, mimetype=mime)


@app.route('/api/documents/<key>', methods=['GET', 'PUT'])
def shared_document(key):
    if key not in {'journal', 'bucket-list', 'book-state'}:
        abort(404)
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT value FROM settings WHERE key=?', ('document:' + key,)).fetchone()
        document = json.loads(row[0]) if row else {'version':0, 'value':None}
        if request.method == 'PUT':
            body = request.get_json() or {}
            if body.get('version') != document['version']:
                abort(409, 'This page changed on another device. Reopen the page before saving again; your form is still here.')
            value = body.get('value')
            if not isinstance(value, (dict, list)) or len(json.dumps(value)) > 1_000_000:
                abort(400)
            document = {'version':document['version'] + 1, 'value':value}
            db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', ('document:' + key, json.dumps(document)))
    return jsonify(document)


@app.route('/api/notes', methods=['GET', 'POST'])
def notes():
    with database() as db:
        if request.method == 'POST':
            body = request.get_json() or {}
            payload = body.get('payload', '')
            if not valid_id(body.get('id')) or not isinstance(payload, str) or not 4 <= len(payload) <= 262144:
                abort(400)
            try:
                base64.b64decode(payload, validate=True)
            except ValueError:
                abort(400)
            db.execute('INSERT OR IGNORE INTO notes_updates (id,payload) VALUES (?,?)', (body['id'], payload))
            return jsonify(ok=True)
        cursor = request.args.get('after', default=0, type=int)
        rows = db.execute('SELECT seq,payload FROM notes_updates WHERE seq>? ORDER BY seq LIMIT 500', (cursor,)).fetchall()
    return jsonify([dict(row) for row in rows])


initialize()

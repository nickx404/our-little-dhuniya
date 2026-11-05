"""Loopback-only Telegram calls. Exceptions never contain bot credentials."""

import http.client
import json
from pathlib import Path

from store import DATA


class TelegramError(Exception):
    def __init__(self, message, definite=False):
        super().__init__(message)
        self.definite = definite


def config():
    return json.loads((DATA / 'archive.json').read_text(encoding='utf-8'))


def call(method, **fields):
    connection = http.client.HTTPConnection('127.0.0.1', 8081, timeout=3600)
    try:
        connection.request('POST', f"/bot{config()['token']}/{method}",
                           json.dumps(fields), {'Content-Type': 'application/json'})
        response = connection.getresponse()
        payload = json.load(response)
        if not payload.get('ok'):
            raise TelegramError('Telegram rejected the request.', definite=True)
        return payload['result']
    except (OSError, ValueError, http.client.HTTPException):
        raise TelegramError('Telegram response was interrupted.') from None
    finally:
        connection.close()


def local_file(file_id):
    result = call('getFile', file_id=file_id)
    path = Path(result['file_path']).resolve()
    if not path.is_relative_to(DATA) or not path.is_file():
        raise TelegramError('The Telegram file is unavailable.')
    return path

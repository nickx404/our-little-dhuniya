"""Import the existing ordered Yjs update export without rewriting the text."""
import argparse
import base64
import json
from store import database, initialize, valid_id

parser = argparse.ArgumentParser()
parser.add_argument('export', help='Private JSON array containing id and payload fields')
args = parser.parse_args()
with open(args.export, encoding='utf-8') as file:
    rows = json.load(file)
initialize()
with database() as db:
    for row in rows:
        if not valid_id(row['id']) or not isinstance(row['payload'], str):
            raise ValueError('Invalid note update.')
        base64.b64decode(row['payload'], validate=True)
        db.execute('INSERT OR IGNORE INTO notes_updates (id,payload) VALUES (?,?)', (row['id'], row['payload']))
print('Imported note updates without modifying their contents.')

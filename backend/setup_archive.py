"""Interactive setup. Secrets are saved only on the server."""
import getpass
import json
import os
import re
import secrets
import tempfile
from werkzeug.security import generate_password_hash
from store import DATA, initialize
from check_telegram import request

initialize()
token = getpass.getpass('Telegram website bot token: ').strip()
channel = input('Private channel ID: ').strip()
pin = getpass.getpass('Shared four-digit PIN: ').strip()
if not re.fullmatch(r'[0-9]+:[A-Za-z0-9_-]+', token) or not re.fullmatch(r'-100[0-9]+', channel) or not re.fullmatch(r'[0-9]{4}', pin):
    raise SystemExit('Invalid token, channel ID, or PIN format.')
chat = request(token, 'getChat', chat_id=channel)
if chat['type'] != 'channel' or chat.get('username') or chat.get('active_usernames'):
    raise SystemExit('Use a private channel.')
bot = request(token, 'getMe')
member = request(token, 'getChatMember', chat_id=channel, user_id=bot['id'])
if member['status'] != 'administrator' or not member.get('can_post_messages'):
    raise SystemExit('The bot needs Post Messages administrator permission.')
with tempfile.NamedTemporaryFile(mode='w', dir=DATA, delete=False) as file:
    json.dump({'token':token,'channel':channel,'pin_hash':generate_password_hash(pin),'csrf':secrets.token_hex(32)},file)
os.chmod(file.name, 0o600)
os.replace(file.name, DATA / 'archive.json')
print('Private archive configuration saved.')

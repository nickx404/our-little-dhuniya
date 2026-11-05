"""Explicitly upload synthetic acceptance files to the configured private channel."""
import argparse
import hashlib
import json
import os
import tempfile
import time
import urllib.request
import uuid
import wave
from pathlib import Path

import archive
from store import DATA, PART_SIZE, database

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=4179)
parser.add_argument('--large', action='store_true')
parser.add_argument('--resume-large', action='store_true')
args = parser.parse_args()
base = f'http://127.0.0.1:{args.port}'
token = archive.signer('session').dumps('acceptance-test')


def api(path, method='GET', body=None, headers=None):
    headers = {**(headers or {}), 'Authorization':'Bearer '+token}
    if isinstance(body, dict):
        body=json.dumps(body).encode()
        headers['Content-Type']='application/json'
    with urllib.request.urlopen(urllib.request.Request(base+path, data=body, method=method, headers=headers), timeout=120) as response:
        return json.load(response)


def digest_stream(file):
    result = hashlib.sha256()
    while chunk := file.read(1024*1024):
        result.update(chunk)
    return result.hexdigest()


def verify(path):
    size=path.stat().st_size
    with path.open('rb') as file:
        fingerprint=hashlib.sha256(file.read(1024*1024)).hexdigest()
        file.seek(0)
        expected=digest_stream(file)
    item=str(uuid.uuid4())
    api('/api/uploads','POST',{'id':item,'name':path.name,'size':size,'fingerprint':fingerprint,
        'title':'Acceptance test '+path.suffix,'caption':'First line\nSecond line','day':'2026-11-05','tags':['acceptance-test']})
    print(f'Uploading {size:,} bytes ({path.suffix})',flush=True)
    with path.open('rb') as source:
        for number,start in enumerate(range(0,size,PART_SIZE)):
            total=min(PART_SIZE,size-start)
            received=0
            while received<total:
                chunk=source.read(min(8*1024*1024,total-received))
                response=api(f'/api/uploads/{item}/parts/{number}','PUT',chunk,
                    {'Upload-Offset':str(received),'Upload-Checksum':hashlib.sha256(chunk).hexdigest(),'Content-Type':'application/octet-stream'})
                received=response['received']
            print(f'Part {number+1} received by Oracle; waiting for Telegram',flush=True)
            deadline=time.monotonic()+7200
            while True:
                state=api('/api/uploads/'+item)
                part=state['parts'][number]
                if part['state']=='sent':break
                if part['state'] in {'uncertain','failed'}:raise RuntimeError(state['item']['error'])
                if time.monotonic()>deadline:raise TimeoutError('Telegram transfer deadline reached')
                time.sleep(2)
            print(f'Part {number+1} confirmed in Telegram',flush=True)
    state=api('/api/uploads/'+item)
    assert state['item']['state']=='ready'
    link=api('/api/items/'+item+'/link','POST')['url']
    with urllib.request.urlopen(base+link,timeout=3600) as response:
        actual=digest_stream(response)
    assert actual==expected, 'Downloaded checksum differs'
    if size>PART_SIZE:
        start,end=PART_SIZE-128,PART_SIZE+128
        with path.open('rb') as source:
            source.seek(start);expected_range=source.read(end-start+1)
        req=urllib.request.Request(base+link,headers={'Range':f'bytes={start}-{end}'})
        with urllib.request.urlopen(req,timeout=3600) as response:
            assert response.status==206 and response.read()==expected_range
    values={'title':'Edited acceptance test','caption':'Retained\nline breaks','day':'2026-11-04','tags':['checked']}
    api('/api/items/'+item,'PATCH',values)
    assert next(row for row in api('/api/items') if row['id']==item)['caption']==values['caption']
    # Check that a deleted local Telegram cache is fetched again.
    with database() as db:
        cached=db.execute('SELECT cache_path FROM parts WHERE item=? AND number=0',(item,)).fetchone()[0]
    if cached:
        cached_path=Path(cached)
        assert cached_path.is_relative_to(DATA)
        cached_path.unlink(missing_ok=True)
        req=urllib.request.Request(base+link,headers={'Range':'bytes=0-255'})
        with urllib.request.urlopen(req,timeout=3600) as response, path.open('rb') as source:
            assert response.read()==source.read(256)
    api('/api/items/'+item,'DELETE')
    assert all(row['id']!=item for row in api('/api/items'))
    print(f'PASS {size:,} bytes: upload, Telegram confirmation, checksum, range, metadata, cache recovery, soft removal',flush=True)


if args.resume_large:
    from telegram_client import local_file
    with database() as db:
        row=db.execute("SELECT i.id,p.file_id,p.sha256 FROM items i JOIN parts p ON i.id=p.item WHERE i.name='sample-over-2000mb.bin' AND i.state='uploading' AND p.number=0 AND p.state='sent' ORDER BY i.created DESC LIMIT 1").fetchone()
    if not row:
        raise SystemExit('No confirmed large test part to resume.')
    item=row['id']
    path=local_file(row['file_id'])
    digest=hashlib.sha256()
    with path.open('rb') as source:
        tail=source.read(257)
        source.seek(0)
        while chunk:=source.read(1024*1024):digest.update(chunk)
    assert digest.hexdigest()==row['sha256']
    digest.update(tail)
    api(f'/api/uploads/{item}/parts/1','PUT',tail,{'Upload-Offset':'0','Upload-Checksum':hashlib.sha256(tail).hexdigest(),'Content-Type':'application/octet-stream'})
    print('Resumed large upload with its remaining 257 bytes.',flush=True)
    deadline=time.monotonic()+300
    while api('/api/uploads/'+item)['item']['state']!='ready':
        if time.monotonic()>deadline:raise TimeoutError('Tail transfer timed out.')
        time.sleep(2)
    link=api('/api/items/'+item+'/link','POST')['url']
    with urllib.request.urlopen(base+link,timeout=3600) as response:
        assert digest_stream(response)==digest.hexdigest()
    req=urllib.request.Request(base+link,headers={'Range':f'bytes={PART_SIZE-128}-{PART_SIZE+128}'})
    with urllib.request.urlopen(req,timeout=3600) as response, path.open('rb') as source:
        source.seek(PART_SIZE-128)
        assert response.status==206 and response.read()==source.read(128)+tail[:129]
    print('PASS 2,000,000,257 bytes: two Telegram documents, full checksum, cross-part seeking, interrupted-client recovery.',flush=True)
    api('/api/items/'+item,'DELETE')
    raise SystemExit(0)


with tempfile.TemporaryDirectory(prefix='acceptance-',dir=DATA) as folder:
    folder=Path(folder)
    photo=folder/'sample-photo.jpg'
    photo.write_bytes((archive.SITE/'assets'/'flowers.jpg').read_bytes())
    verify(photo)
    audio=folder/'sample-audio.wav'
    with wave.open(str(audio),'wb') as file:
        file.setnchannels(1);file.setsampwidth(2);file.setframerate(8000);file.writeframes(b'\0\0'*8000)
    verify(audio)
    attachment=folder/'sample-file.txt'
    attachment.write_text('A synthetic attachment for our scrapbook.\n',encoding='utf-8')
    verify(attachment)
    video=folder/'sample-video.mp4'
    urllib.request.urlretrieve('https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',video)
    verify(video)
    if args.large:
        large=folder/'sample-over-2000mb.bin'
        block=os.urandom(1024*1024)
        remaining=PART_SIZE+257
        with large.open('wb') as file:
            while remaining:
                piece=block[:min(len(block),remaining)]
                file.write(piece);remaining-=len(piece)
        verify(large)
print('Live acceptance checks passed.',flush=True)

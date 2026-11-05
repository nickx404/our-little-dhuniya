"""Run with python -m unittest discover -s backend -p test_backend.py."""
import hashlib
import json
import os
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

_folder = tempfile.TemporaryDirectory()
os.environ['DHUNIYA_DATA'] = _folder.name
from werkzeug.security import generate_password_hash
import store
import archive
import worker
from telegram_client import TelegramError


class BackendTests(unittest.TestCase):
    def setUp(self):
        with store.database() as db:
            for table in ['parts', 'items', 'notes_updates', 'settings', 'pin_failures']:
                db.execute('DELETE FROM ' + table)
        (store.DATA / 'archive.json').write_text(json.dumps({'csrf':'test-only-secret', 'pin_hash':generate_password_hash('1234'), 'channel':'-1001', 'token':'test-only'}))
        self.client = archive.app.test_client()
        self.base = {'base_url':'http://127.0.0.1:4178'}
        login = self.client.post('/api/unlock', json={'pin':'1234'}, **self.base)
        self.auth = {'Authorization':'Bearer ' + login.json['token']}
        self.mock_parts = patch.object(archive, 'PART_SIZE', 16)
        self.mock_parts.start()
        self.telegram = {}

    def tearDown(self):
        self.mock_parts.stop()

    def get(self, path, **kwargs):
        return self.client.get(path, headers=self.auth, **self.base, **kwargs)

    def create(self, data=b'abcdefghijklmnopqrstuvwxyz', name='sample.mp4'):
        item = str(uuid.uuid4())
        body = {'id':item, 'name':name,'size':len(data), 'title':'A title','caption':'One\nTwo','day':'2026-11-05','tags':['us'],
                'fingerprint':hashlib.sha256(data[:1024*1024]).hexdigest()}
        response = self.client.post('/api/uploads', json=body, headers=self.auth, **self.base)
        self.assertEqual(response.status_code, 200, response.json)
        return item, body

    def chunk(self, item, number, offset, data):
        headers = {**self.auth,'Upload-Offset':str(offset),'Upload-Checksum':hashlib.sha256(data).hexdigest()}
        return self.client.put(f'/api/uploads/{item}/parts/{number}', data=data, headers=headers, **self.base)

    def telegram_call(self, method, **fields):
        if method == 'getChat':
            return {'type':'channel'}
        if method == 'sendDocument':
            path = Path(fields['document'].removeprefix('file://'))
            if os.name == 'nt':
                from urllib.request import url2pathname
                path = Path(url2pathname(fields['document'].removeprefix('file:')))
            file_id = str(len(self.telegram))
            target = store.DATA / ('telegram-' + file_id)
            target.write_bytes(path.read_bytes())
            self.telegram[file_id] = target
            return {'document':{'file_id':file_id}, 'message_id':len(self.telegram)}
        raise AssertionError(method)

    def finish(self, item, data):
        for number, start in enumerate(range(0, len(data),16)):
            response = self.chunk(item, number,0,data[start:start+16])
            self.assertEqual(response.status_code,200,response.json)
            with patch.object(worker,'call',side_effect=self.telegram_call):
                self.assertTrue(worker.send_one())

    def test_auth_pin_and_fresh_documents(self):
        for path in ['/api/items','/api/notes','/api/uploads','/api/shell']:
            self.assertEqual(self.client.get(path,**self.base).status_code,401)
        for _ in range(5):
            self.assertEqual(self.client.post('/api/unlock',json={'pin':'9999'},**self.base).status_code,401)
        self.assertEqual(self.client.post('/api/unlock',json={'pin':'1234'},**self.base).status_code,429)
        for _ in range(2):
            response = self.get('/')
            self.assertIn(b'Unlock our scrapbook', response.data)
            self.assertNotIn('Set-Cookie', response.headers)
        self.assertEqual(self.client.get('/api/health').status_code,403)
        self.assertEqual(self.client.get('/api/health',headers={'X-Forwarded-For':'203.0.113.8'},**self.base).status_code,200)
        self.assertEqual(self.client.post('/api/uploads',headers={**self.auth,'Origin':'https://elsewhere.example'},json={},**self.base).status_code,403)

    def test_resume_duplicate_and_fingerprint(self):
        item, body = self.create()
        first = self.chunk(item,0,0,b'abcdefgh')
        self.assertEqual(first.json['received'],8)
        self.assertEqual(self.chunk(item,0,0,b'abcdefgh').json['received'],8)
        self.assertEqual(self.chunk(item,0,0,b'XXXXXXXX').status_code,409)
        self.assertEqual(self.chunk(item,1,0,b'qrstuvwxyz').status_code,409)
        body['fingerprint']='a'*64
        self.assertEqual(self.client.post('/api/uploads',json=body,headers=self.auth,**self.base).status_code,409)
        # Uncommitted trailing bytes from a crash are truncated on resume.
        with store.staging_path(item,0).open('ab') as file:
            file.write(b'crash')
        self.assertEqual(self.chunk(item,0,8,b'ijklmnop').json['state'],'queued')
        self.assertEqual(store.staging_path(item,0).read_bytes(),b'abcdefghijklmnop')

    def test_space_checksum_and_cancellation(self):
        item,_ = self.create()
        with patch.object(archive,'available_space',return_value=False):
            self.assertEqual(self.chunk(item,0,0,b'abcdefgh').status_code,507)
        self.assertEqual(self.chunk(item,0,0,b'abcdefgh').status_code,200)
        self.assertEqual(self.client.delete('/api/uploads/'+item,headers=self.auth,**self.base).status_code,200)
        self.assertFalse(store.staging_path(item,0).exists())
        self.assertEqual(self.chunk(item,0,8,b'ijklmnop').status_code,409)

    def test_upload_stream_ranges_edit_delete_and_backup(self):
        for data in [b'abcdefghijklmno',b'abcdefghijklmnop',b'abcdefghijklmnopqrstuvwxyz']:
            item,_ = self.create(data)
            self.finish(item,data)
            self.assertEqual(self.get('/api/uploads/'+item).json['item']['state'],'ready')
            link=self.client.post('/api/items/'+item+'/link',headers=self.auth,**self.base).json['url']
            with patch.object(archive,'local_file',side_effect=lambda id:self.telegram[id]):
                self.assertEqual(self.client.get(link,**self.base).data,data)
                for value, expected in [('bytes=12-19',data[12:20]),('bytes=-3',data[-3:]),('bytes=0-0',data[:1])]:
                    response=self.client.get(link,headers={'Range':value},**self.base)
                    self.assertEqual(response.status_code,206)
                    self.assertEqual(response.data,expected)
                self.assertEqual(self.client.get(link,headers={'Range':'bytes=99-'},**self.base).status_code,416)
                self.assertEqual(self.client.head(link,**self.base).content_length,len(data))
            values={'title':'Changed','caption':'new\ncaption','day':'2026-11-04','tags':['a','a','b']}
            self.assertEqual(self.client.patch('/api/items/'+item,json=values,headers=self.auth,**self.base).status_code,200)
            self.client.put('/api/books/summer',json={'ids':[item]},headers=self.auth,**self.base)
            self.client.delete('/api/items/'+item,headers=self.auth,**self.base)
            self.assertEqual(self.get('/api/books/summer').json['ids'],[])
            self.assertEqual(self.client.get(link,**self.base).status_code,404)
        path=store.DATA/'backup.sqlite3'
        store.backup(path)
        with closing(sqlite3.connect(path)) as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM items').fetchone()[0],3)

    def test_uncertain_send_restart_and_explicit_retry(self):
        item,_=self.create(b'abcdefgh')
        self.chunk(item,0,0,b'abcdefgh')
        with patch.object(worker,'call',side_effect=[{'type':'channel'},TelegramError('Response lost.')]):
            worker.send_one()
        self.assertEqual(self.get('/api/uploads/'+item).json['parts'][0]['state'],'uncertain')
        self.assertEqual(self.client.post('/api/uploads/'+item+'/retry',json={},headers=self.auth,**self.base).status_code,409)
        self.assertEqual(self.client.post('/api/uploads/'+item+'/retry',json={'confirm_unknown':True},headers=self.auth,**self.base).status_code,200)
        with store.database() as db:
            db.execute("UPDATE parts SET state='sending'")
        worker.recover()
        self.assertEqual(self.get('/api/uploads/'+item).json['parts'][0]['state'],'uncertain')

    def test_notes_idempotency_and_private_access(self):
        value={'id':str(uuid.uuid4()),'payload':'AQIDBA=='}
        for _ in range(2):
            self.assertEqual(self.client.post('/api/notes',json=value,headers=self.auth,**self.base).status_code,200)
        self.assertEqual(len(self.get('/api/notes').json),1)
        seq=self.get('/api/notes').json[0]['seq']
        self.assertEqual(self.get('/api/notes?after='+str(seq)).json,[])

    def test_shared_document_conflict_preserves_saved_value(self):
        path='/api/documents/journal'
        self.assertEqual(self.get(path).json,{'version':0,'value':None})
        first={'version':0,'value':{'journey':[{'title':'First'}],'future':[],'world':[]}}
        self.assertEqual(self.client.put(path,json=first,headers=self.auth,**self.base).status_code,200)
        stale={'version':0,'value':{'journey':[],'future':[],'world':[]}}
        self.assertEqual(self.client.put(path,json=stale,headers=self.auth,**self.base).status_code,409)
        self.assertEqual(self.get(path).json['value'],first['value'])
        self.assertEqual(self.get(path).json['version'],1)


if __name__ == '__main__':
    unittest.main()

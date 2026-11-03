from pathlib import Path
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
import re

root = Path(__file__).parent / 'dist' / 'assets'
photos = {
 'sea': 'photo-1476514525535-07fb3b4ae5f1',
 'flowers': 'photo-1490750967868-88aa4486c946',
 'sunset': 'photo-1500530855697-b586d89ba3ee',
 'coffee': 'photo-1495474472287-4d71bcdd2085',
 'beach': 'photo-1507525428034-b723cf961d3e',
 'mountains': 'photo-1464822759023-fed622ff2c3b',
}
def fetch(item):
 name, ident = item
 request = Request(f'https://images.unsplash.com/{ident}?auto=format&fit=crop&w=1000&q=85', headers={'User-Agent': 'Mozilla/5.0'})
 with urlopen(request, timeout=40) as response:
  (root / f'{name}.jpg').write_bytes(response.read())
 return name
with ThreadPoolExecutor(max_workers=6) as pool:
 for name in pool.map(fetch, photos.items()): print('photo:', name)
for family, stem in [('Mali:wght@400;500;600;700', 'mali'), ('Patrick+Hand', 'patrick'), ('Special+Elite', 'typewriter')]:
 css = urlopen(Request('https://fonts.googleapis.com/css2?family=' + family + '&display=swap', headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode()
 blocks = re.findall(r'@font-face\s*\{[^}]+\}', css)
 local = []
 for index, block in enumerate(blocks):
  url = re.search(r'url\(([^)]+)\)', block).group(1)
  ext = '.woff2' if 'woff2' in block else '.ttf'
  name = f'{stem}-{index}{ext}'
  (root / name).write_bytes(urlopen(url, timeout=30).read())
  local.append(block.replace(url, f'./{name}'))
 (root / f'{stem}.css').write_text('\n'.join(local), encoding='utf-8')
 print('font:', stem)

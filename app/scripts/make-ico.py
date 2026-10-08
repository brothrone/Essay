"""build/icon-1024.png -> build/icon.ico (윈도우용, 여러 크기의 PNG 압축 아이콘)
    py scripts/make-ico.py        # Pillow 필요: py -m pip install pillow
"""
import os
import struct
from io import BytesIO

from PIL import Image

SRC = 'build/icon-1024.png'
OUT = 'build/icon.ico'
SIZES = [16, 24, 32, 48, 64, 128, 256]

src = Image.open(SRC).convert('RGBA')
pngs = []
for s in SIZES:
    buf = BytesIO()
    src.resize((s, s), Image.LANCZOS).save(buf, format='PNG')
    pngs.append((s, buf.getvalue()))

header = struct.pack('<HHH', 0, 1, len(pngs))
offset = 6 + 16 * len(pngs)
entries, blobs = b'', b''
for s, data in pngs:
    dim = 0 if s >= 256 else s  # ICO 규격에서 256은 0으로 적는다
    entries += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(data), offset)
    blobs += data
    offset += len(data)
open(OUT, 'wb').write(header + entries + blobs)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')

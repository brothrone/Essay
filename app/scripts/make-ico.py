"""build/icon-1024.png -> build/icon.ico, electron/icon.ico (윈도우용 아이콘)
    py scripts/make-ico.py        # Pillow 필요: py -m pip install pillow

16~128px 는 압축하지 않은 비트맵(BMP/DIB)으로, 256px 만 PNG 로 넣는다.
작은 크기까지 PNG 로 넣으면 탐색기 · 브라우저 다운로드 목록 · 일부 압축 프로그램이 아이콘을 못 읽고
기본 exe 아이콘을 보여 주는 경우가 있어서, 마이크로소프트 권장 형식(작은 크기는 BMP, 256 만 PNG)을 따른다.
"""
import os
import struct
from io import BytesIO

from PIL import Image

SRC = 'build/icon-1024.png'
OUTS = ['build/icon.ico', 'electron/icon.ico']
SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]

src = Image.open(SRC).convert('RGBA')


def dib(img: Image.Image) -> bytes:
    """32비트 BGRA 비트맵 + 1비트 AND 마스크 (ICO 안의 BMP 형식: 높이는 2배로 적고 아래에서 위로)"""
    w, h = img.size
    header = struct.pack('<IiiHHIIiiII', 40, w, h * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    px = img.load()
    xor = bytearray()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b, a = px[x, y]
            xor += bytes((b, g, r, a))
    row = ((w + 31) // 32) * 4  # 마스크 한 줄은 4바이트 단위
    mask = bytearray()
    for y in range(h - 1, -1, -1):
        bits = bytearray(row)
        for x in range(w):
            if px[x, y][3] == 0:
                bits[x // 8] |= 0x80 >> (x % 8)
        mask += bits
    return header + bytes(xor) + bytes(mask)


frames = []
for s in SIZES:
    img = src.resize((s, s), Image.LANCZOS)
    if s >= 256:
        buf = BytesIO()
        img.save(buf, format='PNG', optimize=True)
        frames.append((s, buf.getvalue()))
    else:
        frames.append((s, dib(img)))

header = struct.pack('<HHH', 0, 1, len(frames))
offset = 6 + 16 * len(frames)
entries, blobs = b'', b''
for s, data in frames:
    dim = 0 if s >= 256 else s  # ICO 규격에서 256은 0으로 적는다
    entries += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(data), offset)
    blobs += data
    offset += len(data)
for out in OUTS:
    open(out, 'wb').write(header + entries + blobs)
    print('wrote', out, os.path.getsize(out), 'bytes')

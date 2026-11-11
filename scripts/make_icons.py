#!/usr/bin/env python3
"""확장 아이콘(icons/icon{16,32,48,128}.png)을 그린다. 외부 패키지 없이 zlib 로 PNG 를 쓴다.
파란 둥근 사각형 + 흰 자막 줄 두 개(긴 줄, 짧은 줄). 사용: python3 scripts/make_icons.py
"""
import struct
import zlib
from pathlib import Path

BLUE = (10, 91, 216)  # 0.6.4 부터 파란색 (버튼 색과 같음)
WHITE = (255, 255, 255)
SS = 4  # 가장자리를 부드럽게 하려는 슈퍼샘플링


def rounded(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def color_at(u, v):
    if not rounded(u, v, 0.02, 0.02, 0.98, 0.98, 0.22):
        return None
    # 자막 줄 두 개
    if rounded(u, v, 0.16, 0.50, 0.84, 0.64, 0.07):
        return WHITE
    if rounded(u, v, 0.28, 0.71, 0.72, 0.84, 0.065):
        return WHITE
    # 위쪽 'KO' 대신 작은 흰 점 두 개 (작은 크기에서도 보이게)
    if (u - 0.36) ** 2 + (v - 0.30) ** 2 <= 0.075 ** 2 or (u - 0.64) ** 2 + (v - 0.30) ** 2 <= 0.075 ** 2:
        return WHITE
    return BLUE


def png(size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    c = color_at((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            n = SS * SS
            a = acc[3] / n
            if acc[3]:
                k = acc[3] / 255
                row += bytes([round(acc[0] / k), round(acc[1] / k), round(acc[2] / k), round(a)])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    raw = zlib.compress(b''.join(rows), 9)

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')


if __name__ == '__main__':
    out = Path(__file__).resolve().parent.parent / 'icons'
    out.mkdir(exist_ok=True)
    for s in (16, 32, 48, 128):
        (out / f'icon{s}.png').write_bytes(png(s))
    print('아이콘:', out)

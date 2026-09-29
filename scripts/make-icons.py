#!/usr/bin/env python3
"""Generate solid-colour PNG app icons with a centred glyph, using only the stdlib.

No network access or image libraries are available in this environment, so the
PNG bytes (signature, IHDR, a single zlib-compressed IDAT, IEND) are assembled
by hand with zlib and struct.
"""
import struct
import zlib
from pathlib import Path

BG = (0x11, 0x11, 0x11, 255)  # matches manifest.webmanifest theme_color
FG = (0xFA, 0xFA, 0xFA, 255)  # matches manifest.webmanifest background_color


def make_png(size, bg=BG, fg=FG):
    pixels = [[bg] * size for _ in range(size)]

    # Keep the glyph within the central 80% safe zone so a maskable crop
    # (which can clip up to ~10% on each edge) never cuts it off.
    margin = size * 0.1
    inner = size - 2 * margin
    bar_h = inner * 0.16

    def fill_rect(x, y, w, h):
        x0, y0 = int(round(x)), int(round(y))
        x1, y1 = int(round(x + w)), int(round(y + h))
        for py in range(max(0, y0), min(size, y1)):
            row = pixels[py]
            for px in range(max(0, x0), min(size, x1)):
                row[px] = fg

    # A simple rupee-like block mark: two horizontal bars and a diagonal-ish
    # stem, all drawn as filled rectangles (no anti-aliasing needed).
    fill_rect(margin, margin, inner, bar_h)
    fill_rect(margin, margin + inner * 0.42, inner * 0.75, bar_h)
    fill_rect(margin + inner * 0.62, margin, inner * 0.16, inner)
    fill_rect(margin, margin + inner * 0.84, inner * 0.5, bar_h)

    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0 (None) for each scanline
        for (r, g, b, a) in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)

    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')


def main():
    out_dir = Path(__file__).resolve().parent.parent / 'icons'
    out_dir.mkdir(exist_ok=True)
    for size, name in (
        (192, 'icon-192.png'),
        (512, 'icon-512.png'),
        (180, 'apple-touch-icon.png'),
    ):
        data = make_png(size)
        path = out_dir / name
        path.write_bytes(data)
        print(f'wrote {path} ({len(data)} bytes)')


if __name__ == '__main__':
    main()

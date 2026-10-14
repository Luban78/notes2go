#!/usr/bin/env python3
"""Generate local, offline WOFF2 assets for LubaNote 683BQ builds.

Requires Python 3 standard library and network at build/deploy time. Downloads
only licensed Google Fonts families. Writes CSS and files atomically so failing
requests cannot silently turn the signed APK into a half-bundled font build.
No font binaries are stored in the patch ZIP/repository.
"""
from __future__ import annotations
import re
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path
from shutil import rmtree

ROOT = Path(__file__).resolve().parent.parent
OUTDIR = ROOT / 'fonts683BQ'
STYLESHEET = ROOT / 'fontAssets683BQ.css'
FAMILIES = ('Arimo', 'Carlito', 'Tinos', 'Cousine', 'Gelasio')
LICENSES = {
    'Arimo': 'https://raw.githubusercontent.com/googlefonts/Arimo/main/OFL.txt',
    'Carlito': 'https://raw.githubusercontent.com/googlefonts/carlito/main/OFL.txt',
    'Tinos': 'https://raw.githubusercontent.com/googlefonts/tinos/main/OFL.txt',
    'Cousine': 'https://raw.githubusercontent.com/googlefonts/cousine/main/OFL.txt',
    'Gelasio': 'https://raw.githubusercontent.com/SorkinType/Gelasio/main/OFL.txt',
}
USER_AGENT = ('Mozilla/5.0 (X11; Linux x86_64) '
              'AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/120.0.0.0 Safari/537.36')


def read_url(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=35) as resp:
        return resp.read()


def unpack_css(css: str, family: str):
    """Only Latin and Latin-ext WOFF2 (six production languages)."""
    pattern = re.compile(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})', re.S)
    found = []
    for block in pattern.finditer(css):
        subset, text = block.groups()
        if subset not in ('latin', 'latin-ext'):
            continue
        fam = re.search(r'font-family:\s*[\'"]?([^;\'"\n]+)', text)
        weight = re.search(r'font-weight:\s*([\d\s]+);', text)
        remote = re.search(r'url\((?:[\'"])?(https://fonts\.gstatic\.com/[^)\'" ]+)', text)
        if not fam or not weight or not remote:
            continue
        if fam.group(1).strip() != family:
            continue
        weightstr = weight.group(1).strip().replace(' ', '-')
        if weightstr not in ('400', '700', '400-700'):
            continue
        found.append((subset, weightstr, remote.group(1), text))
    if not any(subset == 'latin' for subset, *_ in found):
        raise RuntimeError(f'{family}: CSS API has no WOFF2 latin block')
    if not any(subset == 'latin-ext' for subset, *_ in found):
        raise RuntimeError(f'{family}: CSS API has no WOFF2 latin-ext block')
    return found


def build():
    pending = Path(tempfile.mkdtemp(prefix='.font-build-683BQ-', dir=ROOT))
    all_css = ['/* Offline fonts installed during CI / server deployment (683BQ). */']
    try:
        for fam in FAMILIES:
            familyquery = urllib.parse.urlencode({'family': f'{fam}:wght@400;700', 'display': 'swap'})
            source = read_url('https://fonts.googleapis.com/css2?' + familyquery).decode('utf-8')
            entries = unpack_css(source, fam)
            for subset, weight, url, rule in entries:
                name = f'{fam}-{subset}-{weight}.woff2'
                data = read_url(url)
                if not data.startswith(b'wOF2') or len(data) < 500:
                    raise RuntimeError(f'{name}: downloaded asset is not WOFF2')
                (pending / name).write_bytes(data)
                # Keep upstream copyright and unicode-range CSS, replace just the URL.
                rule = rule.replace(url, f'fonts683BQ/{name}')
                all_css.append(f'/* {fam} {subset} */\n{rule}')
            notice = read_url(LICENSES[fam]).decode('utf-8')
            if 'SIL OPEN FONT LICENSE' not in notice.upper():
                raise RuntimeError(f'{fam}: could not verify the OFL license')
            (pending / f'{fam}-OFL.txt').write_text(notice, encoding='utf-8')
        # All succeeded; switch in the completed generated files.
        if OUTDIR.exists():
            rmtree(OUTDIR)
        pending.replace(OUTDIR)
        cssfile = STYLESHEET.with_name('fontAssets683BQ.css.tmp')
        cssfile.write_text('\n\n'.join(all_css)+'\n', encoding='utf-8')
        cssfile.replace(STYLESHEET)
        files = len(list(OUTDIR.glob('*.woff2')))
        print(f'683BQ: OFFLINE FONT ASSETS PASS ({files} WOFF2, {len(FAMILIES)} licenses)')
    finally:
        if pending.exists():
            rmtree(pending)


if __name__ == '__main__':
    try:
        build()
    except Exception as exc:
        print(f'683BQ: OFFLINE FONT ASSETS FAIL: {exc}', file=sys.stderr)
        sys.exit(1)

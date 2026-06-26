from pathlib import Path
import re

root = Path(r"e:\GitHub\game 1")
source = (root / 'style.css').read_text(encoding='utf-8')
source = re.sub(r'/\*.*?\*/', '', source, flags=re.S)
source = re.sub(r'\s+', ' ', source)
source = re.sub(r'\s*([{}:;,>\(\)])\s*', r'\1', source)
source = source.strip()
style_tag = f'<style rel="stylesheet" crossorigin>{source}/*$vite$:1*/</style>'
for fname in ['index.html', 'dist/index.html']:
    p = root / fname
    text = p.read_text(encoding='utf-8')
    start = text.find('<style rel="stylesheet" crossorigin>')
    if start == -1:
        raise SystemExit(f'style tag not found in {fname}')
    end = text.find('</style>', start)
    if end == -1:
        raise SystemExit(f'style close tag not found in {fname}')
    new_text = text[:start] + style_tag + text[end+8:]
    p.write_text(new_text, encoding='utf-8')
    print(f'Updated {fname}')

"""Assembla il gioco in un unico file: index.html nella cartella principale.

Uso:  python3 tools/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'

shell = (SRC / 'shell.html').read_text(encoding='utf-8')
content = (SRC / 'content.js').read_text(encoding='utf-8')
app = (SRC / 'app.js').read_text(encoding='utf-8')

for name, code in (('content.js', content), ('app.js', app)):
    if '</script' in code.lower():
        raise SystemExit(f'{name} contiene "</script": romperebbe la pagina.')

html = shell.replace('/*__CONTENT__*/', content).replace('/*__APP__*/', app)
out = ROOT / 'index.html'
out.write_text(html, encoding='utf-8')
print(f'Creato {out.name} ({len(html.encode("utf-8")) // 1024} KB)')

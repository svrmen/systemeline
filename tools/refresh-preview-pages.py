"""Refresh existing local preview pages without changing browser project storage."""
import json
from pathlib import Path
import re

def refresh_previews(root):
    root = Path(root)
    source = (root / 'index.html').read_text(encoding='utf-8')
    revision = re.search(r'routes\.js\?v=([^"&]+)', source)[1]
    qa = root / '.qa'
    changed = []
    # These old previews already shared the main project's storage keys.
    for name in ['visual.html', 'joints.html']:
        path = qa / name
        if not path.exists():
            continue
        path.write_text('<!doctype html><html lang="ru"><meta charset="utf-8">'
                        '<title>Открыть актуальный конфигуратор</title>'
                        '<p>Проверочная страница обновлена. '
                        f'<a href="/?build={revision}">Открыть конфигуратор</a>.</p>'
                        '<script>const target=new URL("/",window.location.href);'
                        f'target.searchParams.set("build","{revision}");'
                        'target.searchParams.set("refresh",Date.now());'
                        'window.location.replace(target.href);</script></html>', encoding='utf-8')
        changed.append(name)
    for name, prefix in [('equipment.html','BUS_QA_EQUIPMENT'),
                         ('multiple-routes.html','BUS_QA_MULTI'),
                         ('columns.html','BUS_QA_NKU_COLUMNS'),
                         ('manual-path.html','BUS_QA_MANUAL_PATH'),
                         ('plan-columns.html','BUS_QA_PLAN_COLUMNS'),
                         ('startup-fresh.html','BUS_QA_STARTUP_FRESH_BUS_PROJECT')]:
        path = qa / name
        if not path.exists():
            continue
        previous = path.read_text(encoding='utf-8')
        first_inline = re.search(r'<script>(.*?)</script>', previous, re.S)
        seed_script = first_inline[1].strip() if first_inline else ''
        if not seed_script.startswith(('try{if(!localStorage', 'if(!localStorage')):
            seed_script = ''
        seed_match = re.search(r'''localStorage\.getItem\((['"])([^'"]+)\1\).*?JSON\.stringify\((\{)''', seed_script, re.S)
        boot = ''
        if seed_match:
            seed, _ = json.JSONDecoder().raw_decode(seed_script[seed_match.start(3):])
            key = json.dumps(seed_match[2])
            payload = json.dumps(seed, ensure_ascii=False).replace('<', '\\u003c')
            boot = f'<script>try{{if(!localStorage.getItem({key}))localStorage.setItem({key},JSON.stringify({payload}));}}catch(error){{console.warn(error);}}</script>\n'
        html = source.replace('<head>', '<head><base href="/">', 1)
        for old, new in [('BUS_PROJECT_V7',prefix+'_V7'),('BUS_PROJECT_V6',prefix+'_V6'),('BUS_PROJECT_V5',prefix+'_V5'),
                         ('BUS_PROJECT_V4',prefix+'_V4'),('BUS_STATE_V3',prefix+'_V3')]:
            if name=='startup-fresh.html' and old=='BUS_STATE_V3':
                new='BUS_QA_STARTUP_FRESH_BUS_STATE_V3'
            html = html.replace(old, new)
        html = html.replace('<script src="vendor/', boot+'<script src="vendor/', 1)
        path.write_text(html, encoding='utf-8')
        changed.append(name)
    return changed

if __name__ == '__main__':
    print('Updated previews: '+', '.join(refresh_previews(Path(__file__).resolve().parents[1])))

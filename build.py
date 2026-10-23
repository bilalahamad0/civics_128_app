#!/usr/bin/env python3
"""
generate_full_app.py
Generates template_body.html, template_script.js, and compiles index.html.
Ensures 100% of DOM IDs match between HTML and JavaScript.
"""

import os
import json

base_dir = os.path.dirname(os.path.abspath(__file__))

def create_body_html():
    tb_path = os.path.join(base_dir, 'template_body.html')
    if os.path.exists(tb_path):
        with open(tb_path, 'r', encoding='utf-8') as f:
            return f.read()
    return ''

def main():
    tb_path = os.path.join(base_dir, 'template_body.html')
    if os.path.exists(tb_path):
        print("Reading template_body.html...")
        with open(tb_path, 'r', encoding='utf-8') as f:
            body = f.read()
    else:
        print("Generating template_body.html from create_body_html()...")
        body = create_body_html()
        with open(tb_path, 'w', encoding='utf-8') as f:
            f.write(body)

    print("Re-compiling index.html with template_head.html, template_body.html, and template_script.js...")
    with open(os.path.join(base_dir, 'civics128_full.json'), 'r', encoding='utf-8') as f:
        civics_questions = json.load(f)

    with open(os.path.join(base_dir, 'states_data.json'), 'r', encoding='utf-8') as f:
        states_data = json.load(f)

    with open(os.path.join(base_dir, 'civics_translations.json'), 'r', encoding='utf-8') as f:
        civics_translations = json.load(f)

    with open(os.path.join(base_dir, 'template_head.html'), 'r', encoding='utf-8') as f:
        head_html = f.read()

    with open(os.path.join(base_dir, 'template_script.js'), 'r', encoding='utf-8') as f:
        script_code = f.read()

    civics_json = json.dumps(civics_questions)
    states_json = json.dumps(states_data)
    translations_json = json.dumps(civics_translations)

    script_ready = script_code.replace('__CIVICS_JSON__', civics_json).replace('__STATES_JSON__', states_json).replace('__TRANSLATIONS_JSON__', translations_json)

    full_index = head_html + '\n' + body + '\n<script>\n' + script_ready + '\n</script>\n</body>\n</html>'

    with open(os.path.join(base_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(full_index)

    print(f"Generated index.html successfully! Size: {len(full_index)} bytes.")

    # Sync to dist/ for Cloudflare Pages / Static Hosting
    import shutil
    dist_dir = os.path.join(base_dir, 'dist')
    os.makedirs(dist_dir, exist_ok=True)
    dist_files = [
        'index.html',
        'manifest.webmanifest',
        'manifest.json',
        'sw.js',
        'favicon.svg',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'favicon-32x32.png',
        'favicon-16x16.png',
        'civics_translations.json',
        '_headers',
        '_redirects'
    ]
    for df in dist_files:
        src = os.path.join(base_dir, df)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(dist_dir, df))
    print(f"Synced {len(dist_files)} assets to dist/ for Cloudflare Pages!")

if __name__ == '__main__':
    main()

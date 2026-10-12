import os
import re

files = [
    r'd:\Coding\Dự án FTS\WebFTS v3\WebFTS v1\frontend\src\pages\AixmManagerPage.tsx',
    r'd:\Coding\Dự án FTS\WebFTS v3\WebFTS v1\frontend\src\pages\AtwiPage.tsx',
    r'd:\Coding\Dự án FTS\WebFTS v3\WebFTS v1\frontend\src\pages\ReplayPage.tsx'
]

for file_path in files:
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Basic UI color replacements
    content = re.sub(r"'#1e1e1e'", "'var(--card-bg)'", content)
    content = re.sub(r"'#333'", "'var(--border)'", content)
    content = re.sub(r"'#121212'", "'var(--bg-surface)'", content)
    content = re.sub(r"'#aaa'", "'var(--text-muted)'", content)
    content = re.sub(r"'#aaaaaa'", "'var(--text-muted)'", content)
    content = re.sub(r"'#fff'", "'var(--text)'", content)
    content = re.sub(r"'white'", "'var(--text)'", content)
    content = re.sub(r"'#2a2a2a'", "'var(--input-bg)'", content)
    content = re.sub(r"'#444'", "'var(--input-border)'", content)
    content = re.sub(r"'#ccc'", "'var(--text)'", content)
    content = re.sub(r"'#888'", "'var(--text-muted)'", content)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print('Colors updated successfully for remaining pages')

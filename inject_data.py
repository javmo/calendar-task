import json

# Read the data
with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Generate JS array
js_data = json.dumps(data['tareas'], ensure_ascii=False, indent=2)

# Read the HTML
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace the empty INITIAL_DATA
old = 'const INITIAL_DATA = [];'
new = f'const INITIAL_DATA = {js_data};'
html = html.replace(old, new)

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f'Injected {len(data["tareas"])} tasks into index.html')
print(f'File size: {len(html)} bytes')

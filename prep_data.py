import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

initial_data_js = json.dumps(data['tareas'], ensure_ascii=False, indent=2)

print(f"Read {len(data['tareas'])} tasks")
print("Generating new HTML...")

# Write the data to a separate JS snippet we'll embed
with open('_tasks_data.js', 'w', encoding='utf-8') as f:
    f.write(f'const INITIAL_DATA = {initial_data_js};')

print("Done - data saved to _tasks_data.js")

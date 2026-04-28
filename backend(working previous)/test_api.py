import urllib.request, json, os, re
env_vars = {}
with open('.env') as f:
    for line in f:
        if '=' in line:
            k, v = line.strip().split('=', 1)
            env_vars[k] = v

key = env_vars.get('GEMINI_API_KEY')
url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}'

payload = {
    'contents': [{'parts': [{'text': 'Tell me a risk score object in json formatted exactly like: {"score": 50, "reason": "traffic", "incident_location": "somewhere", "safe_waypoint": "nowhere"}'}]}],
    'tools': [{'googleSearch': {}}]
}
data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})

try:
    response = urllib.request.urlopen(req)
    out = response.read().decode('utf-8')
    data_out = json.loads(out)
    parts = data_out.get('candidates', [{}])[0].get('content', {}).get('parts', [])
    combined_text = "".join([p.get("text", "") for p in parts if p.get("text")])
    json_match = re.search(r'\{.*\}', combined_text, re.DOTALL)
    if json_match:
        text = json_match.group(0)
        # test if it's purely valid JSON:
        import json
        try:
            json.loads(text)
            print("SUCCESS VALID JSON: ", text)
        except Exception as p:
            print("JSON PARSE ERROR: ", p, "\nRAW TEXT: ", text)
    else:
        print('REGEX FAILED no curly braces found')
except urllib.error.HTTPError as e:
    print(f'HTTP Error (STILL RATE LIMITED): {e.code}')
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f'Error: {e}')

import urllib.request, json, os; from dotenv import load_dotenv; load_dotenv('.env'); key = os.environ.get('GEMINI_API_KEY'); url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}'; data = json.dumps({'contents':[{'parts':[{'text': 'Hi'}]}], 'tools': [{'googleSearch': {}}]}).encode('utf-8'); req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'});
try:
    response = urllib.request.urlopen(req)
    print(response.read().decode('utf-8'))
except Exception as e:
    print(f'Error: {e}')
    if hasattr(e, 'read'): print(e.read().decode('utf-8'))


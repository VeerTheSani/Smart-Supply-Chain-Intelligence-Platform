import urllib.request, json, os, re

# read .env natively without dotenv module
env_vars = {}
with open('.env') as f:
    for line in f:
        if '=' in line:
            k, v = line.strip().split('=', 1)
            env_vars[k] = v

GEMINI_API_KEY = env_vars.get('GEMINI_API_KEY')
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

prompt = """You are a road intelligence analyst for Indian logistics.

Route: Kalol → New Delhi, Delhi, India
Highways: NH 48, NH 44
Travel date: 2026-04-28

Search for disturbances on these specific highways:
- Road closures or construction blocks on these highway numbers
- Flooding or landslides affecting these corridors
- Protests, bandh, or strikes specifically on these roads
- Major accident-based closures reported in news

Respond ONLY with this exact JSON, nothing else:
{
  "score": <0-100, 0=no issues, 20=minor works, 40=moderate disruption, 60=significant, 80=major blockage>,
  "reason": "<one concise sentence, or 'No road disturbances found' if clear>",
  "incident_location": "<city or highway stretch where the problem is, empty string if none>",
  "safe_waypoint": "<nearest real Indian city on a parallel corridor between origin and destination that avoids the incident, empty string if score < 40>"
}

If score < 40, safe_waypoint and incident_location must be empty strings."""

payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "tools": [{"googleSearch": {}}],
    "generationConfig": {"temperature": 0.1, "maxOutputTokens": 512},
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(GEMINI_URL, data=data, headers={'Content-Type': 'application/json'})

try:
    response = urllib.request.urlopen(req)
    out = response.read().decode('utf-8')
    data_out = json.loads(out)
    
    parts = data_out.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    combined_text = "".join([p.get("text", "") for p in parts if p.get("text")])
    
    # regex extract
    json_match = re.search(r'\{.*\}', combined_text, re.DOTALL)
    if json_match:
        text = json_match.group(0)
    else:
        text = combined_text
        
    print("EXTRACTED TEXT:")
    print(text)
    
    result = json.loads(text)
    print("SUCCESS PARSE:", result)
except json.JSONDecodeError as e:
    print("JSONDecodeError:", e, "ON TEXT:", text)
except urllib.error.HTTPError as e:
    print("HTTPError:", e.code, e.read().decode('utf-8'))
except Exception as e:
    print("Exception:", e)

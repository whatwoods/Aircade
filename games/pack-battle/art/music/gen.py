"""用 Gemini Lyria 3.5 生成背景音乐试听稿：python3 gen.py <名字> <提示词文件>"""
import base64, json, os, sys, urllib.request
name, pf = sys.argv[1], sys.argv[2]
body = json.dumps({'contents': [{'parts': [{'text': open(pf).read()}]}]}).encode()
req = urllib.request.Request(
    'https://generativelanguage.googleapis.com/v1beta/models/lyria-3.5:generateContent',
    data=body, headers={'x-goog-api-key': os.environ['GEMINI_API_KEY'], 'Content-Type': 'application/json'})
d = json.load(urllib.request.urlopen(req, timeout=600))
for p in d['candidates'][0]['content']['parts']:
    if 'inlineData' in p:
        open(name + '.mp3', 'wb').write(base64.b64decode(p['inlineData']['data']))
    elif 'text' in p:
        open(name + '.txt', 'w').write(p['text'])
print(name, 'ok')

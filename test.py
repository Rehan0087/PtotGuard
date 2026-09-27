import hmac
import hashlib
import base64
import json
import urllib.request
import re

with open('apps/api/.env', 'r') as f:
    env = f.read()
secret = re.search(r'AUTH_TOKEN_SECRET="([^"]+)"', env).group(1)

header = base64.urlsafe_b64encode(json.dumps({"alg":"HS256","typ":"JWT"}).encode()).decode().rstrip("=")
payload = base64.urlsafe_b64encode(json.dumps({"sub":"citizen-demo","role":"citizen","type":"access"}).encode()).decode().rstrip("=")
signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
token = f"{header}.{payload}.{signature}"
print("Token:", token)

req = urllib.request.Request('http://localhost:3001/api/community/posts', data=json.dumps({"title":"Test API","content":"Testing..."}).encode(), headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        print(response.status, response.read().decode())
except Exception as e:
    print(e)
    if hasattr(e, 'read'):
        print(e.read().decode())

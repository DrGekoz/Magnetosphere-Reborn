import json, urllib.request, os, time

FAL_KEY = os.environ.get("FAL_KEY", "896177cc-3173-4114-a8d8-93b2f3a78c43:c74c54ce659a7fabc88a8827b089145a")
PROMPT = "App icon logo for 'Magnetosphere Reborn' music visualizer. A glowing emerald-green planet sphere at center with luminous magnetic field lines arcing around it like a magnetosphere, small glowing orbs orbiting, lime green and cyan neon glow on deep black background, clean centered composition, high contrast, no text, no watermark, square format"

def fal_get(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Key {FAL_KEY}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

def fal_post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={
        "Authorization": f"Key {FAL_KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

rid = fal_post("https://queue.fal.run/fal-ai/gpt-image-2/", {
    "prompt": PROMPT, "image_size": "square", "num_images": 1, "output_format": "png"})["request_id"]
print("rid:", rid)
for i in range(90):
    time.sleep(5)
    s = fal_get(f"https://queue.fal.run/fal-ai/gpt-image-2/requests/{rid}/status")
    st = s.get("status")
    if st == "COMPLETED":
        res = fal_get(f"https://queue.fal.run/fal-ai/gpt-image-2/requests/{rid}")
        url = res["images"][0]["url"]
        print("IMAGE_URL:", url)
        urllib.request.urlretrieve(url, "branding/logo_raw.png")
        print("saved branding/logo_raw.png")
        break
    elif st in ("FAILED", "ERROR"):
        print("FAILED:", s)
        break
    elif i % 6 == 0:
        print("poll", i, st)

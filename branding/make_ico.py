# Convert the transparent logo PNG to a multi-size ICO for electron-builder (build/icon.ico)
import sys
from PIL import Image

SRC = sys.argv[1]
OUT = sys.argv[2]

img = Image.open(SRC).convert("RGBA")
print("src size:", img.size)

# Build multi-size ICO (16, 24, 32, 48, 64, 128, 256)
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
imgs = []
for s in sizes:
    im = img.resize(s, Image.LANCZOS)
    imgs.append(im)
    print("  ", s)

imgs[0].save(OUT, format="ICO", sizes=[(s[0], s[1]) for s in sizes], append_images=imgs[1:])
print("saved", OUT)

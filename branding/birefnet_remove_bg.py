# Standalone BiRefNet background removal (ZhengPeng7/BiRefNet) on ComfyUI CUDA python.
# Usage: python birefnet_remove_bg.py input.png output.png [threshold]
import sys, os
import torch
from PIL import Image
from transformers import AutoModelForImageSegmentation

INPUT = sys.argv[1]
OUTPUT = sys.argv[2]
THRESH = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"device={DEVICE} torch={torch.__version__}")

model = AutoModelForImageSegmentation.from_pretrained(
    "ZhengPeng7/BiRefNet", trust_remote_code=True, torch_dtype=torch.float16
).to(DEVICE).eval()

img = Image.open(INPUT).convert("RGB")
# BiRefNet expects a specific preprocess: 1024x1024 with mean/std normalization
from torchvision import transforms
tf = transforms.Compose([
    transforms.Resize((1024, 1024)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])
x = tf(img).unsqueeze(0).to(DEVICE, dtype=torch.float16)

with torch.no_grad():
    pred = model(x)[-1].sigmoid().cpu().squeeze()  # [1024,1024]
# resize mask back to the ORIGINAL image size (H, W)
mask = transforms.Resize((img.size[1], img.size[0]))(pred.unsqueeze(0)).squeeze().numpy()
mask = (mask > THRESH).astype("uint8") * 255
mask_im = Image.fromarray(mask, mode="L")

out = img.convert("RGBA")
out.putalpha(mask_im)
out.save(OUTPUT)
print(f"saved {OUTPUT} size={out.size}")

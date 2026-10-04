"""Gera imagens PROVISÓRIAS a partir da referência aprovada (docs/referencia/layout-aprovado.png).

Substitua os arquivos em public/ pelos oficiais assim que estiverem disponíveis.
Uso: python scripts/extract-reference-assets.py
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ref = Image.open(ROOT / "docs/referencia/layout-aprovado.png").convert("RGB")
public = ROOT / "public"


def upscale(img: Image.Image, factor: int = 2) -> Image.Image:
    return img.resize((img.width * factor, img.height * factor), Image.LANCZOS)


# Fotos dos banners: só a parte à direita do círculo do ícone (o círculo é desenhado em CSS).
banners = {
    "restaurante-padaria": (226, 164, 470, 237),
    "saude": (486, 164, 732, 237),
    "advocacia": (749, 164, 995, 237),
    "industria": (1011, 164, 1259, 237),
    "pet-shop": (1275, 164, 1520, 237),
}
for slug, (x0, y0, x1, y1) in banners.items():
    photo = ref.crop((x0 + 80, y0 + 1, x1 - 1, y1 - 1))
    upscale(photo).save(public / "sectors" / f"{slug}.webp", quality=90)

upscale(ref.crop((1347, 470, 1511, 535))).save(public / "demo" / "padaria-central.webp", quality=90)

# Mascote: recorta o robô e remove o fundo azul-marinho por preenchimento a partir das bordas
# (preserva o visor escuro, que é cercado pelo capacete branco).
robot = ref.crop((0, 783, 114, 992)).convert("RGBA")
w, h = robot.size
px = robot.load()
for y in range(h):
    for x in range(w):
        if (x >= 89 and y >= 76) or (x >= 83 and 84 <= y <= 106):  # balão de fala (refeito em HTML)
            px[x, y] = (11, 33, 60, 255)

bg = (11, 33, 60)


def dist(c):
    return sum((c[i] - bg[i]) ** 2 for i in range(3)) ** 0.5


seen = [[False] * h for _ in range(w)]
queue = deque()
for x in range(w):
    queue.extend([(x, 0), (x, h - 1)])
for y in range(h):
    queue.extend([(0, y), (w - 1, y)])
while queue:
    x, y = queue.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or seen[x][y]:
        continue
    d = dist(px[x, y])
    if d > 70:
        continue
    seen[x][y] = True
    r, g, b, _ = px[x, y]
    alpha = 0 if d < 28 else int(255 * (d - 28) / 42)
    px[x, y] = (r, g, b, alpha)
    queue.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
upscale(robot, 3).save(public / "brand" / "mascote-jr.png", optimize=True)


# Ícones PWA provisórios: monograma "JR" com o degradê da logo.
def font(size):
    for name in ("seguibl.ttf", "ariblk.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
        except OSError:
            continue
    return ImageFont.load_default()


def icon(size: int, path: Path, radius_ratio=0.22):
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), int(size * radius_ratio), fill=255)
    navy = Image.new("RGBA", (size, size), (11, 35, 64, 255))
    base.paste(navy, (0, 0), mask)
    grad = Image.new("RGBA", (size, size))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / size
        gd.line([(0, y), (size, y)], fill=(int(56 + (30 - 56) * t), int(200 + (110 - 200) * t), int(245 + (245 - 245) * t), 255))
    text_mask = Image.new("L", (size, size), 0)
    td = ImageDraw.Draw(text_mask)
    f = font(int(size * 0.5))
    bbox = td.textbbox((0, 0), "JR", font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    td.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]), "JR", font=f, fill=255)
    base.paste(grad, (0, 0), text_mask)
    base.save(path)


icon(192, public / "icons" / "icon-192.png")
icon(512, public / "icons" / "icon-512.png")
icon(180, public / "icons" / "apple-touch-icon.png", radius_ratio=0)
print("ok")

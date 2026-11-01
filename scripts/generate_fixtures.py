"""Regenerate committed reference pixels with Pillow 12.3.0."""

import json
import random
from pathlib import Path

import PIL
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from rosa_reticula import curve_lut, duotone, prepare_source, treat_gray

if PIL.__version__ != "12.3.0":
    raise SystemExit("Install scripts/requirements.txt before regenerating fixtures.")

rng = random.Random(1808)
cases = [
    ("ramp", Image.frombytes("L", (256, 3), bytes(range(256)) * 3).convert("RGBA")),
    ("odd-rgb", Image.frombytes("RGB", (31, 19), rng.randbytes(31 * 19 * 3)).convert("RGBA")),
    ("tiny-rgba", Image.frombytes("RGBA", (3, 5), rng.randbytes(3 * 5 * 4))),
    ("transparent", Image.new("RGBA", (1, 1), (255, 255, 255, 0))),
    ("white", Image.new("RGBA", (1, 1), (255, 255, 255, 255))),
    ("small-edge", Image.frombytes("L", (1, 9), bytes([0, 5, 20, 60, 255, 120, 80, 30, 0])).convert("RGBA")),
]
fixtures = []
for name, image in cases:
    rgb = prepare_source(image)
    base = ImageEnhance.Contrast(ImageOps.grayscale(rgb)).enhance(1.1).point(curve_lut())
    treated = treat_gray(image)
    fixtures.append({
        "name": name, "width": image.width, "height": image.height,
        "rgba": list(image.tobytes()), "base": list(base.tobytes()),
        "gray": list(treated.tobytes()), "rgb": list(duotone(treated).tobytes()),
        "blur": {str(radius): list(base.filter(ImageFilter.GaussianBlur(radius)).tobytes())
                 for radius in (0, .1, .5, 1, 2, 5)},
    })

target = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "pillow-12.3.0.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({"pillow": PIL.__version__, "cases": fixtures}, separators=(",", ":")) + "\n")
print(f"Generated {len(fixtures)} reference cases: {target.name}")

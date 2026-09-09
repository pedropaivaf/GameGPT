"""Bake the model's 4K PBR set down to something a browser can swallow.

Roughness and metalness are packed into the green and blue channels of one
image, which is exactly where MeshStandardMaterial reads them from, so two maps
cost one texture fetch. Everything comes out as JPEG for size.
"""
import io
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'beretta-m9a1-w-slide-lock', 'textures')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)

PLAN = {
    '92FS': {'base': 1024, 'normal': 768, 'orm': 512, 'emissive': 256},
    'Accessories': {'base': 512, 'normal': 448, 'orm': 256, 'emissive': 0},
}


def load(material, kind):
    return Image.open(os.path.join(SRC, '%s_%s.png' % (material, kind)))


def stats(name, image):
    array = np.asarray(image.convert('L'), dtype=np.uint8)
    print('   %-10s min=%3d max=%3d mean=%6.1f' % (name, array.min(), array.max(), array.mean()))
    return array


def encode(image, quality, name):
    buffer = io.BytesIO()
    image.save(buffer, 'JPEG', quality=quality, optimize=True, subsampling=1)
    data = buffer.getvalue()
    print('   %-22s %5d KB' % (name, len(data) // 1024))
    return data


def build(material):
    plan = PLAN[material]
    out = {}
    print(material)

    # No base colour: the gun is painted in code (black frame, bright steel
    # controls, green sight dots), so the baked albedo is dead weight.
    normal = load(material, 'Normal').convert('RGB').resize((plan['normal'],) * 2, Image.LANCZOS)
    out['normalMap'] = encode(normal, 90, 'Normal')

    rough = load(material, 'Roughness').convert('L')
    metal = load(material, 'Metallic').convert('L')
    stats('roughness', rough)
    stats('metallic', metal)
    size = (plan['orm'],) * 2
    packed = Image.merge('RGB', (
        Image.new('L', size, 255),
        rough.resize(size, Image.LANCZOS),
        metal.resize(size, Image.LANCZOS)))
    out['ormMap'] = encode(packed, 88, 'Roughness+Metallic')

    if plan['emissive']:
        emissive = load(material, 'Emission').convert('L')
        array = stats('emission', emissive)
        if array.max() > 12:
            size = (plan['emissive'],) * 2
            out['emissiveMap'] = encode(
                load(material, 'Emission').convert('RGB').resize(size, Image.LANCZOS),
                80, 'Emission')
        else:
            print('   emission is blank, skipped')
    return out


if __name__ == '__main__':
    total = 0
    for material in PLAN:
        for key, data in build(material).items():
            path = os.path.join(OUT, 'tex_%s_%s.jpg' % (material, key))
            open(path, 'wb').write(data)
            total += len(data)
    print('\ntotal textures %d KB -> base64 %d KB' % (total // 1024, total * 4 // 3 // 1024))

"""Weld, quantise and pack the extracted Beretta into one embeddable blob.

Parts are merged by the group they animate with and the paint they wear, welded
so shared corners stop being duplicated, then written as quantised integers:
positions to uint16 across a shared box, normals to int16. No UVs and no
textures -- the gun is painted in code, so the scanned maps would only add
weight and, downsampled from 4K, speckle.
"""
import base64
import json
import os
import struct

import numpy as np

from extract import extract

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)

# Excluded: the laser, the red dot and the rail-mounted slide lock are
# accessories the game does not use, and the loose round and case are display
# props that sit outside the weapon.
GROUPS = [
    # (mesh name, animated group, paint, source atlas, part list)
    ('body', 'body', 'black', '92FS', ['Frame', 'Grip']),
    ('can', 'body', 'black', 'Accessories', ['Suppressor']),
    ('bodySteel', 'body', 'steel', '92FS',
     ['Barrel', 'Guide rod', 'Mag releash', 'Slide catch', 'Slide releash']),
    ('slide', 'slide', 'black', '92FS', ['Slide']),
    ('slideSteel', 'slide', 'steel', '92FS', ['Safety']),
    ('sightRear', 'slide', 'black', '92FS', ['Rear sight']),
    ('sightFront', 'slide', 'green', '92FS', ['Front sight']),
    ('magazine', 'magazine', 'black', '92FS', ['Magazine', 'Mag bottom', 'Follower']),
    ('trigger', 'trigger', 'steel', '92FS', ['Trigger', 'Trigger rod']),
    ('hammer', 'hammer', 'steel', '92FS', ['Hammer']),
]


def weld(position, normal):
    """Merge identical corners. Quantised keys, so near-duplicates collapse too."""
    keys = np.concatenate([
        np.round(position * 2048).astype(np.int64),
        np.round(normal * 512).astype(np.int64)], axis=1)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    order = np.argsort(first)
    remap = np.empty(len(first), dtype=np.int64)
    remap[order] = np.arange(len(first))
    return position[first[order]], normal[first[order]], remap[inverse].astype(np.uint32)


def main():
    parts = {p['name']: p for p in extract()}
    used = [name for *_, names in GROUPS for name in names]
    missing = [n for n in used if n not in parts]
    if missing:
        raise SystemExit('missing parts: %s' % missing)

    everything = np.concatenate([parts[n]['position'] for n in used])
    lo = everything.min(axis=0).astype(np.float64)
    hi = everything.max(axis=0).astype(np.float64)
    span = np.maximum(hi - lo, 1e-6)

    chunks, manifest = [], []
    offset = 0

    def append(array):
        nonlocal offset
        raw = array.tobytes()
        pad = (-len(raw)) % 4
        chunks.append(raw + b'\0' * pad)
        start = offset
        offset += len(raw) + pad
        return start

    for name, animation, paint, material, names in GROUPS:
        position = np.concatenate([parts[n]['position'] for n in names]).astype(np.float64)
        normal = np.concatenate([parts[n]['normal'] for n in names]).astype(np.float64)
        position, normal, index = weld(position, normal)
        if len(position) > 65535:
            raise SystemExit('%s needs 32-bit indices' % name)

        qp = np.clip(np.round((position - lo) / span * 65535), 0, 65535).astype(np.uint16)
        qn = np.clip(np.round(normal * 32767), -32767, 32767).astype(np.int16)
        qi = index.astype(np.uint16)

        manifest.append({
            'name': name, 'group': animation, 'paint': paint, 'atlas': material,
            'vertices': int(len(position)),
            'indices': int(len(index)),
            'position': append(qp), 'normal': append(qn), 'index': append(qi),
        })

    blob = b''.join(chunks)
    meta = {
        'origin': [round(v, 6) for v in lo],
        'scale': [round(v / 65535.0, 10) for v in span],
        'groups': manifest,
    }

    payload = {
        'meta': meta,
        'geometry': base64.b64encode(blob).decode('ascii'),
    }
    open(os.path.join(OUT, 'beretta.json'), 'w').write(json.dumps(payload, separators=(',', ':')))

    print('groups:')
    for g in manifest:
        print('  %-11s %-9s %-6s %-12s %5d verts %5d idx' % (
            g['name'], g['group'], g['paint'], g['atlas'], g['vertices'], g['indices']))
    print('geometry blob %d KB -> base64 %d KB' % (len(blob) // 1024, len(payload['geometry']) // 1024))
    print('total payload  %d KB' % (os.path.getsize(os.path.join(OUT, 'beretta.json')) // 1024))
    print('bounds origin %s span %s' % (np.round(lo, 3), np.round(span, 3)))


if __name__ == '__main__':
    main()

"""Pull the Beretta out of the FBX into flat triangle arrays.

Handles the parts of the format this particular export actually uses: polygon
lists terminated by a bitwise-negated index, normals and UVs mapped either per
polygon-vertex or per control point, direct or indexed, and a per-model local
transform. Everything is triangulated with a simple fan, which is safe because
the source polygons are convex quads and tris.
"""
import math
import struct
import sys

import numpy as np

import fbx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'beretta-m9a1-w-slide-lock', 'source', '92FS_Finish.fbx')


def clean_name(node):
    for p in node.props:
        if isinstance(p, bytes) and b'\x00\x01' in p:
            return p.split(b'\x00\x01')[0].decode('utf-8', 'replace')
    return '?'


def prop70(model, key, default):
    props = model.find('Properties70')
    if not props:
        return default
    for p in props.children:
        if p.props and isinstance(p.props[0], bytes) and p.props[0].decode('utf-8', 'replace') == key:
            nums = [v for v in p.props if isinstance(v, float)]
            if len(nums) >= 3:
                return nums[-3:]
    return default


def euler_matrix(rx, ry, rz):
    """FBX default rotation order is XYZ, applied as R = Rz * Ry * Rx."""
    rx, ry, rz = map(math.radians, (rx, ry, rz))
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return mz @ my @ mx


def layer(geo, name, key):
    node = geo.find(name)
    if not node:
        return None, None, None, None
    values = node.find(key)
    index = node.find(key + 'Index')
    mapping = None
    reference = None
    for c in node.children:
        if c.name == 'MappingInformationType':
            mapping = c.props[0].decode()
        if c.name == 'ReferenceInformationType':
            reference = c.props[0].decode()
    return (np.array(values.props[0], dtype=np.float64) if values else None,
            np.array(index.props[0], dtype=np.int64) if index else None,
            mapping, reference)


def extract():
    root = fbx.parse(SRC)
    objs = root.find('Objects')
    conns = root.find('Connections')

    by_id = {}
    for c in objs.children:
        if c.props and isinstance(c.props[0], int):
            by_id[c.props[0]] = c

    geometry_of, material_of = {}, {}
    for c in conns.children:
        if c.name != 'C' or len(c.props) < 3:
            continue
        src, dst = by_id.get(c.props[1]), by_id.get(c.props[2])
        if not src or not dst or dst.name != 'Model':
            continue
        if src.name == 'Geometry':
            geometry_of[c.props[2]] = src
        elif src.name == 'Material':
            material_of[c.props[2]] = clean_name(src)

    parts = []
    for mid, model in by_id.items():
        if model.name != 'Model' or mid not in geometry_of:
            continue
        geo = geometry_of[mid]
        name = clean_name(model)

        verts = np.array(geo.find('Vertices').props[0], dtype=np.float64).reshape(-1, 3)
        raw_index = np.array(geo.find('PolygonVertexIndex').props[0], dtype=np.int64)

        normals, n_index, n_map, n_ref = layer(geo, 'LayerElementNormal', 'Normals')
        uvs, uv_index, uv_map, uv_ref = layer(geo, 'LayerElementUV', 'UV')
        if normals is not None:
            normals = normals.reshape(-1, 3)
        if uvs is not None:
            uvs = uvs.reshape(-1, 2)

        # Walk the polygon list; a negative index marks the last corner.
        positions, out_normals, out_uvs = [], [], []
        polygon = []
        for corner, raw in enumerate(raw_index):
            last = raw < 0
            vertex = int(~raw) if last else int(raw)
            polygon.append((vertex, corner))
            if not last:
                continue
            for k in range(1, len(polygon) - 1):
                for vertex_i, corner_i in (polygon[0], polygon[k], polygon[k + 1]):
                    positions.append(verts[vertex_i])
                    if normals is not None:
                        if n_map == 'ByPolygonVertex':
                            i = n_index[corner_i] if n_ref == 'IndexToDirect' else corner_i
                        else:
                            i = n_index[vertex_i] if n_ref == 'IndexToDirect' else vertex_i
                        out_normals.append(normals[i])
                    if uvs is not None:
                        if uv_map == 'ByPolygonVertex':
                            i = uv_index[corner_i] if uv_ref == 'IndexToDirect' else corner_i
                        else:
                            i = uv_index[vertex_i] if uv_ref == 'IndexToDirect' else vertex_i
                        out_uvs.append(uvs[i])
            polygon = []

        position = np.array(positions)
        normal = np.array(out_normals) if out_normals else np.zeros_like(position)
        uv = np.array(out_uvs) if out_uvs else np.zeros((len(position), 2))

        translation = prop70(model, 'Lcl Translation', [0, 0, 0])
        rotation = prop70(model, 'Lcl Rotation', [0, 0, 0])
        scaling = prop70(model, 'Lcl Scaling', [1, 1, 1])
        pre = prop70(model, 'PreRotation', [0, 0, 0])
        matrix = euler_matrix(*rotation)
        if any(pre):
            matrix = euler_matrix(*pre) @ matrix
        matrix = matrix @ np.diag(scaling)
        position = position @ matrix.T + np.array(translation)
        normal = normal @ np.linalg.inv(matrix).T
        lengths = np.linalg.norm(normal, axis=1, keepdims=True)
        normal = normal / np.where(lengths == 0, 1, lengths)

        parts.append({
            'name': name.replace('_low', ''),
            'material': material_of.get(mid, '92FS'),
            'position': position.astype(np.float32),
            'normal': normal.astype(np.float32),
            'uv': uv.astype(np.float32),
        })
    return parts


if __name__ == '__main__':
    parts = extract()
    parts.sort(key=lambda p: p['name'])
    total = sum(len(p['position']) for p in parts)
    allpos = np.concatenate([p['position'] for p in parts])
    lo, hi = allpos.min(axis=0), allpos.max(axis=0)
    print('parts %d, triangles %d' % (len(parts), total // 3))
    print('bounds min %s' % np.round(lo, 3))
    print('bounds max %s' % np.round(hi, 3))
    print('size      %s' % np.round(hi - lo, 3))
    print()
    print('%-16s %-12s %6s  %s' % ('PART', 'MATERIAL', 'TRIS', 'LOCAL BOUNDS (min .. max)'))
    for p in parts:
        pos = p['position']
        print('%-16s %-12s %6d  %s .. %s' % (
            p['name'], p['material'], len(pos) // 3,
            np.round(pos.min(axis=0), 2), np.round(pos.max(axis=0), 2)))

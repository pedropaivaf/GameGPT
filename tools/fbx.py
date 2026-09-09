"""Minimal binary FBX 7.x reader.

Enough of the format to pull geometry, object names and the connection graph
out of a static mesh export. No animation, no deformers.
"""
import struct
import zlib


class Node:
    __slots__ = ('name', 'props', 'children')

    def __init__(self, name, props, children):
        self.name = name
        self.props = props
        self.children = children

    def find(self, name):
        for c in self.children:
            if c.name == name:
                return c
        return None

    def findall(self, name):
        return [c for c in self.children if c.name == name]

    def __repr__(self):
        return '<%s props=%d kids=%d>' % (self.name, len(self.props), len(self.children))


def _read_array(data, off, kind):
    length, encoding, comp = struct.unpack_from('<III', data, off)
    off += 12
    raw = data[off:off + comp]
    off += comp
    if encoding == 1:
        raw = zlib.decompress(raw)
    fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}[kind]
    values = struct.unpack('<%d%s' % (length, fmt), raw[:length * struct.calcsize(fmt)])
    return values, off


def _read_props(data, off, count):
    props = []
    for _ in range(count):
        kind = chr(data[off]); off += 1
        if kind == 'Y':
            props.append(struct.unpack_from('<h', data, off)[0]); off += 2
        elif kind == 'C':
            props.append(bool(data[off])); off += 1
        elif kind == 'I':
            props.append(struct.unpack_from('<i', data, off)[0]); off += 4
        elif kind == 'F':
            props.append(struct.unpack_from('<f', data, off)[0]); off += 4
        elif kind == 'D':
            props.append(struct.unpack_from('<d', data, off)[0]); off += 8
        elif kind == 'L':
            props.append(struct.unpack_from('<q', data, off)[0]); off += 8
        elif kind in 'fdlib':
            values, off = _read_array(data, off, kind)
            props.append(values)
        elif kind in 'SR':
            n = struct.unpack_from('<I', data, off)[0]; off += 4
            props.append(data[off:off + n]); off += n
        else:
            raise ValueError('unknown property type %r at %d' % (kind, off))
    return props, off


def parse(path):
    data = open(path, 'rb').read()
    version = struct.unpack_from('<I', data, 23)[0]
    wide = version >= 7500
    head = struct.Struct('<QQQB' if wide else '<IIIB')
    sentinel = 25 if wide else 13

    def read_node(off):
        end, nprops, _plen, namelen = head.unpack_from(data, off)
        off += head.size
        if end == 0:
            return None, off
        name = data[off:off + namelen].decode('utf-8', 'replace'); off += namelen
        props, off = _read_props(data, off, nprops)
        children = []
        while off < end - sentinel:
            child, off = read_node(off)
            if child is None:
                break
            children.append(child)
        return Node(name, props, children), end

    off = 27
    roots = []
    while off < len(data) - sentinel:
        node, off = read_node(off)
        if node is None:
            break
        roots.append(node)
    return Node('root', [], roots)

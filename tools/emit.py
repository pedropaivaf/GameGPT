import io
import os

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
PARTS = HERE

data = io.open(os.path.join(HERE, 'beretta.json'), encoding='ascii').read()
assert chr(39) not in data, 'payload contains a quote'
assert chr(92) not in data, 'payload contains a backslash'

header = """// ---------------------------------------------------------------------------
// Beretta M9A1 asset payload.
//
// The source FBX is 41 MB with 4K PBR maps, which is not something a page can
// pull down before a match. This is that model reduced offline: geometry welded
// and quantised to 16 bits (positions across a shared box, normals, UVs), split
// into the six groups the view model animates, and textures downsampled with
// roughness and metalness packed into the green and blue channels of a single
// JPEG -- exactly the channels MeshStandardMaterial reads them from. It is all
// inlined as base64 so the game stays one file that still runs from file://.
//
// Model: "Beretta M9A1 w/ Slide lock" by KaL-ABIZZARE, via Sketchfab.
// ---------------------------------------------------------------------------
"""

out = os.path.join(PARTS, '06b_beretta_data.js')
io.open(out, 'w', encoding='utf-8').write(
    header + "const BERETTA_ASSET=JSON.parse('" + data + "');\n")
print('wrote %s  %d KB' % (os.path.basename(out), os.path.getsize(out) // 1024))

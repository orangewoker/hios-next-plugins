"""Optional: regenerate the checked-in CJK TTF from HIOS's existing OFL WOFF2.
Requires fonttools[woff] (not needed for ordinary npm or WASM builds).
"""
from pathlib import Path
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[2]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'src/renderer/assets/fonts/NotoSansSC-Variable.woff2'
font = TTFont(source)
font.flavor = None
instantiateVariableFont(font, {'wght': 400}, inplace=True)
target = root / 'plugins/photocraft/fonts/NotoSansSC-Regular.ttf'
target.parent.mkdir(parents=True, exist_ok=True)
font.save(target)
print(f'{target}: {target.stat().st_size} bytes')

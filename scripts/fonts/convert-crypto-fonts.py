"""Offline, format-only conversion of hash-pinned, licensed Google Fonts inputs.

No downloading, credentials, production changes or test-font substitutes.
Usage: python scripts/fonts/convert-crypto-fonts.py --source-dir <pinned-ttfs>
"""
import argparse
import hashlib
import json
from pathlib import Path
import fontTools
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
INPUTS = {
    "ManropeVariable.ttf": ("3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6", "Manrope", 200, 800, False),
    "CormorantGaramondVariable.ttf": ("b20b7d9626dd956b2c5e558692ad328b1f19e3275e2782db4fa07670d83f35e0", "Cormorant Garamond", 300, 700, False),
    "CormorantGaramondVariable-Italic.ttf": ("0f48ea6abb2084537854f7174c470991a463b13036309e3b50a81511611c530d", "Cormorant Garamond", 300, 700, True),
}

def identities(font):
    return {record.toUnicode() for record in font["name"].names if record.nameID in (1, 16)}

def axes(font):
    return [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue) for axis in font["fvar"].axes]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    args = parser.parse_args()
    source = Path(args.source_dir).resolve(strict=True)
    destination = ROOT / "frontend/src/app/fonts/crypto"
    destination.mkdir(parents=True, exist_ok=True)
    results = []
    for filename, (digest, family, minimum, maximum, italic) in INPUTS.items():
        path = source / filename
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("Font source hash mismatch: " + filename)
        font = TTFont(path, recalcTimestamp=False)
        if family not in identities(font):
            raise ValueError("Unexpected font family")
        weight = next(axis for axis in font["fvar"].axes if axis.axisTag == "wght")
        if (weight.minValue, weight.maxValue) != (minimum, maximum) or bool(font["OS/2"].fsSelection & 1) != italic:
            raise ValueError("Weight/style mismatch")
        output = destination / (path.stem + ".woff2")
        font.flavor = "woff2"
        font.save(output)
        restored = TTFont(output, recalcTimestamp=False)
        if (identities(font), axes(font), font.getGlyphOrder(), font.getBestCmap(), font["hmtx"].metrics) != (identities(restored), axes(restored), restored.getGlyphOrder(), restored.getBestCmap(), restored["hmtx"].metrics):
            raise ValueError("Font conversion changed identity, axes, glyphs or metrics")
        results.append({"file": output.name, "bytes": output.stat().st_size, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "family": family, "weight": [minimum, maximum], "italic": italic})
    print(json.dumps({"fontTools": fontTools.__version__, "conversion": "FORMAT_ONLY_ROUNDTRIP_CHECKED", "files": results}, indent=2))

if __name__ == "__main__":
    main()

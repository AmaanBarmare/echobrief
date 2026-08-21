#!/usr/bin/env python3
"""
Regenerate the EchoBrief lockup SVGs in brand/logo/svg/.

The wordmark is baked to outlines so the files render identically with or
without DM Serif Display installed. Only re-run this if the wordmark itself
changes — don't hand-edit the path data.

    pip install fonttools
    python3 brand/src/build-lockups.py
"""
import os
import urllib.request
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "logo", "svg")
CACHE = os.path.join(HERE, ".fonts")
GF = "https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/"

SIZE = 32.0        # wordmark size, matching the app's xl Logo
TRACK = -1.28      # letter-spacing -0.04em at 32px
X0, BASELINE = 66.0, 47.5


def font(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        urllib.request.urlretrieve(GF + name, path)
    return path


def outline(font_path, text, x):
    """Return (svg path data, pen x position after the run)."""
    f = TTFont(font_path)
    upm = f["head"].unitsPerEm
    cmap, glyphs, hmtx = f.getBestCmap(), f.getGlyphSet(), f["hmtx"]
    scale = SIZE / upm
    parts = []
    for ch in text:
        gname = cmap[ord(ch)]
        pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}")
        glyphs[gname].draw(TransformPen(pen, Transform(scale, 0, 0, -scale, x, BASELINE)))
        if pen.getCommands():
            parts.append(pen.getCommands())
        x += hmtx[gname][0] * scale + TRACK
    return " ".join(parts), x


MARK = """  <g transform="translate(6 12) scale(1.5)">
    <circle cx="16" cy="16" r="14" fill="none" stroke="{s}" stroke-width="1.2" opacity="0.28"/>
    <circle cx="16" cy="16" r="9"  fill="none" stroke="{s}" stroke-width="1.2" opacity="0.52"/>
    <circle cx="16" cy="16" r="4.5" fill="{s}"/>
  </g>"""

GRAD = """  <defs>
    <linearGradient id="{i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{a}"/>
      <stop offset="100%" stop-color="{b}"/>
    </linearGradient>
  </defs>
"""


def build(fn, title, mark_fill, echo_fill, brief_fill, grad=None):
    g = GRAD.format(**grad) if grad else ""
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="376" height="144" '
        'viewBox="0 0 188 72" role="img" aria-label="EchoBrief">\n'
        f"  <title>{title}</title>\n{g}{MARK.format(s=mark_fill)}\n"
        f'  <path fill="{echo_fill}" d="{ECHO}"/>\n'
        f'  <path fill="{brief_fill}" d="{BRIEF}"/>\n</svg>\n'
    )
    with open(os.path.join(OUT, fn), "w") as fh:
        fh.write(svg)
    print("wrote", fn)


ECHO, x = outline(font("DMSerifDisplay-Regular.ttf"), "echo", X0)
BRIEF, x = outline(font("DMSerifDisplay-Italic.ttf"), "brief", x)

build("echobrief-lockup-light.svg", "EchoBrief logo — light background",
      "url(#eb-l)", "#1C1917", "#D93F0B", {"i": "eb-l", "a": "#D93F0B", "b": "#F5C842"})
build("echobrief-lockup-dark.svg", "EchoBrief logo — dark background",
      "url(#eb-d)", "#F0EBE3", "#E8430A", {"i": "eb-d", "a": "#E8430A", "b": "#F5C842"})
build("echobrief-lockup-mono-black.svg", "EchoBrief logo — mono black",
      "#1C1917", "#1C1917", "#1C1917")
build("echobrief-lockup-mono-white.svg", "EchoBrief logo — mono white",
      "#FAF7F2", "#FAF7F2", "#FAF7F2")

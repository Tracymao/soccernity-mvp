"""Rebuild docs/counsel-review-pack.docx from docs/counsel-review-pack.md (task D10).

Python 3 with python-docx. Pandoc must be on PATH, or set the PANDOC environment variable.

Step 1 (pandoc, exact command):
    pandoc docs/counsel-review-pack.md -f markdown -t docx \
        --reference-doc=docs/counsel-review-pack-reference.docx \
        -o docs/counsel-review-pack.docx

Step 2 (this script): sets four sections (portrait cover; landscape documents table; portrait
questions; landscape question-to-source table, v1.0 to v1.1 map, strings sheet and sign-off),
fixed table widths, repeating header rows, rows that do not split, 8.5 pt table text and a page
number footer. Run from the repository root:
    python docs/counsel-pack-build.py
"""
import copy
import os
import subprocess
import sys

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "counsel-review-pack.md")
REF = os.path.join(ROOT, "docs", "counsel-review-pack-reference.docx")
OUT = os.path.join(ROOT, "docs", "counsel-review-pack.docx")
PANDOC = os.environ.get("PANDOC", "pandoc")

subprocess.run([PANDOC, SRC, "-f", "markdown", "-t", "docx", "--reference-doc=" + REF, "-o", OUT], check=True)
d = Document(OUT)
body = d.element.body

PORTRAIT_W, LAND_W = 17.0, 26.1  # text width in cm
WIDTHS = {  # first header cell -> column widths (cm); each entry says which table it is for
    # "Document (file in docs/)": section 2 documents table (landscape). "Question": question-to-source table.
    # "v1.0": v1.0 to v1.1 map. "#": the strings sheet, 4 columns (# | String as shown | Figma frame | Status),
    # landscape, widths sum to LAND_W. "Document": sign-off table.
    "Document (file in docs/)": [4.5, 1.6, 15.0, 5.0],
    "Question": [2.0, 1.6, 22.5],
    "v1.0": [2.5, 2.5, 21.1],
    "#": [1.4, 14.0, 6.5, 4.2],
    "Document": [5.5, 2.5, 4.5, 3.0, 4.1, 6.5],
}


def text_of(el):
    return "".join(t.text or "" for t in el.iter(qn("w:t")))


def make_sectpr(landscape):
    sp = OxmlElement("w:sectPr")
    pg = OxmlElement("w:pgSz")
    w, h = (29.7, 21.0) if landscape else (21.0, 29.7)
    pg.set(qn("w:w"), str(int(w / 2.54 * 1440)))
    pg.set(qn("w:h"), str(int(h / 2.54 * 1440)))
    if landscape:
        pg.set(qn("w:orient"), "landscape")
    sp.append(pg)
    mar = OxmlElement("w:pgMar")
    side = 1.8 if landscape else 2.0
    for k, v in (("top", 1.8), ("right", side), ("bottom", 1.8), ("left", side), ("header", 0.9), ("footer", 0.9)):
        mar.set(qn("w:" + k), str(int(v / 2.54 * 1440)))
    sp.append(mar)
    return sp


def find_heading(prefix):
    for el in body:
        if el.tag == qn("w:p") and text_of(el).startswith(prefix):
            st = el.find(qn("w:pPr"))
            if st is not None and st.find(qn("w:pStyle")) is not None and st.find(qn("w:pStyle")).get(qn("w:val")).startswith("Heading"):
                return el
    raise SystemExit("heading not found: " + prefix)


def break_before(el, landscape_of_previous):
    """End the previous section just before `el` (section break paragraph carries the previous section's sectPr)."""
    p = OxmlElement("w:p")
    ppr = OxmlElement("w:pPr")
    sp = make_sectpr(landscape_of_previous)
    # make the break paragraph tiny so it does not add a blank line
    spc = OxmlElement("w:spacing")
    spc.set(qn("w:before"), "0")
    spc.set(qn("w:after"), "0")
    spc.set(qn("w:line"), "20")
    spc.set(qn("w:lineRule"), "exact")
    ppr.append(spc)
    ppr.append(sp)
    p.append(ppr)
    el.addprevious(p)


h2 = find_heading("2. Documents")
h3 = find_heading("3. Questions")
hq = find_heading("Question-to-source table")
break_before(h2, False)  # section 1: portrait cover
break_before(h3, True)   # section 2: landscape documents table
break_before(hq, False)  # section 3: portrait questions
# section 4 (landscape) is the document's final sectPr
final = body.find(qn("w:sectPr"))
for ch in list(final):
    final.remove(ch)
fs = make_sectpr(True)
for ch in list(fs):
    final.append(ch)

# tables
for tbl in body.iter(qn("w:tbl")):
    first_row = tbl.find(qn("w:tr"))
    cells = first_row.findall(qn("w:tc"))
    head0 = text_of(cells[0])
    widths = WIDTHS.get(head0)
    if widths is None or len(widths) != len(cells):
        raise SystemExit(f"no widths for table starting {head0!r} with {len(cells)} columns")
    tw = [int(w / 2.54 * 1440) for w in widths]
    tblPr = tbl.find(qn("w:tblPr"))
    for tag in ("w:tblW", "w:tblLayout", "w:tblLook"):
        for old in tblPr.findall(qn(tag)):
            tblPr.remove(old)
    tw_el = OxmlElement("w:tblW")
    tw_el.set(qn("w:w"), str(sum(tw)))
    tw_el.set(qn("w:type"), "dxa")
    tblPr.append(tw_el)
    lay = OxmlElement("w:tblLayout")
    lay.set(qn("w:type"), "fixed")
    tblPr.append(lay)
    grid = tbl.find(qn("w:tblGrid"))
    for g in list(grid):
        grid.remove(g)
    for w in tw:
        gc = OxmlElement("w:gridCol")
        gc.set(qn("w:w"), str(w))
        grid.append(gc)
    for ri, tr in enumerate(tbl.findall(qn("w:tr"))):
        trPr = tr.find(qn("w:trPr"))
        if trPr is None:
            trPr = OxmlElement("w:trPr")
            tr.insert(0, trPr)
        cs = OxmlElement("w:cantSplit")
        trPr.append(cs)
        if ri == 0:
            th = OxmlElement("w:tblHeader")
            trPr.append(th)
        for ci, tc in enumerate(tr.findall(qn("w:tc"))):
            tcPr = tc.find(qn("w:tcPr"))
            if tcPr is None:
                tcPr = OxmlElement("w:tcPr")
                tc.insert(0, tcPr)
            for old in tcPr.findall(qn("w:tcW")):
                tcPr.remove(old)
            w_el = OxmlElement("w:tcW")
            w_el.set(qn("w:w"), str(tw[ci]))
            w_el.set(qn("w:type"), "dxa")
            tcPr.insert(0, w_el)
            if ri == 0:
                shd = OxmlElement("w:shd")
                shd.set(qn("w:val"), "clear")
                shd.set(qn("w:color"), "auto")
                shd.set(qn("w:fill"), "E6EAF2")
                tcPr.append(shd)
            for r in tc.iter(qn("w:r")):
                rpr = r.find(qn("w:rPr"))
                if rpr is None:
                    rpr = OxmlElement("w:rPr")
                    r.insert(0, rpr)
                for old in rpr.findall(qn("w:sz")):
                    rpr.remove(old)
                sz = OxmlElement("w:sz")
                sz.set(qn("w:val"), "17")
                rpr.append(sz)
                if ri == 0:
                    b = OxmlElement("w:b")
                    rpr.insert(0, b)

# blank sign-off rows get a minimum height so a reviewer can write in them
last_tbl = list(body.iter(qn("w:tbl")))[-1]
for tr in last_tbl.findall(qn("w:tr"))[1:]:
    trPr = tr.find(qn("w:trPr"))
    h = OxmlElement("w:trHeight")
    h.set(qn("w:val"), str(int(0.9 / 2.54 * 1440)))
    h.set(qn("w:hRule"), "atLeast")
    trPr.append(h)


# keep the paragraph(s) before each table with it; sign-off starts on its own page
def pfmt(el):
    ppr = el.find(qn("w:pPr"))
    if ppr is None:
        ppr = OxmlElement("w:pPr")
        el.insert(0, ppr)
    return ppr
for tbl in body.iter(qn("w:tbl")):
    prev = tbl.getprevious()
    for _ in range(2):
        if prev is not None and prev.tag == qn("w:p") and prev.find(".//" + qn("w:sectPr")) is None:
            pfmt(prev).append(OxmlElement("w:keepNext"))
            prev = prev.getprevious()
hs = find_heading("5. Sign-off")
pfmt(hs).append(OxmlElement("w:pageBreakBefore"))

# footer with page number (later sections inherit it)
sec0 = d.sections[0]
fp = sec0.footer.paragraphs[0]
fp.text = "Counsel review pack v1.1: DRAFT, not approved, not legal advice. Page "
run = fp.add_run()
for typ, txt in (("begin", None), (None, " PAGE "), ("end", None)):
    if typ:
        fc = OxmlElement("w:fldChar")
        fc.set(qn("w:fldCharType"), typ)
        run._r.append(fc)
    else:
        it = OxmlElement("w:instrText")
        it.set(qn("xml:space"), "preserve")
        it.text = txt
        run._r.append(it)
for r in fp.runs:
    r.font.size = Pt(8)

d.save(OUT)
print("saved", OUT)

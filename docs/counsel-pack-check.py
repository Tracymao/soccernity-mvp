#!/usr/bin/env python3
"""Counsel pack arithmetic check (task D10). Python 3, standard library only.

Run from anywhere:  python docs/counsel-pack-check.py            (or  python3 ...)
Exit code 0 = every check passed, 1 = a check failed. Ambiguous markers are listed, never
resolved silently, and they do NOT change the exit code (a person reads the list).

DRAFT ONLY. Nothing here is legal advice or a decision for the founder or counsel.

COUNTING RULE (the same rule as task D5 / report section 2, made executable)
  * An ITEM is one unit with its own `[vX.Y DISPOSITION: ...]` marker in one of the eight drafts:
    a Part C row, an in-text marker row, an "open item" (legal copy); a section 5 row (DPIA);
    a question row (incident plan, including Q-US1..4 and Q-EU1..4); a numbered question
    (addenda, Part C files, Cloudflare); or a marked note (a CHANGED paragraph that carries a marker).
  * The CURRENT marker of an item is the one with the NEWEST version. A marker written
    `DISPOSITION (superseded by v0.8): ...` and every older marker beside a newer one are ignored.
  * Definition/legend lines, changelog lines and container questions are not items.
  * Sub-parts (4a, 5a, 12a, 14a, 23a) fold into their parent question. A composite marker
    (A + B, "B for X; A for Y") is read letter by letter.
  * An item with ANY A component is class A: it counts once and goes in the pack. Its non-A
    remainder is a partial row in the left-out list; it is NOT an extra item.
  * An item with no A component takes the class of its main marker (B, C or D). An item with no
    marker is "X" (not assigned); it is never assigned here.
  * Check (d): items started = pack A + left-out non-A items (B, C, D) + not assigned.
"""
import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent

FILES = {
    "LC": ("legal-copy-draft-tos-privacy-policy.md", "Legal copy"),
    "DP": ("sprint-1-dpia-outline-draft.md", "DPIA"),
    "IP": ("incident-response-and-breach-notification-plan-draft.md", "Incident plan"),
    "PA": ("dpia-addendum-post-media-draft.md", "Post-media addendum"),
    "PC": ("legal-copy-part-c-post-media-draft.md", "Post-media Part C"),
    "CA": ("dpia-addendum-contest-view-data-draft.md", "Contest/view-data addendum"),
    "VC": ("legal-copy-part-c-view-data-draft.md", "View-data Part C"),
    "CF": ("cloudflare-processor-and-cross-border-draft.md", "Cloudflare"),
}
V10 = {  # the figures recorded in the v1.0 report (task D5), for the comparison table
    "LC": (67, 28, 10, 9, 20, 0), "DP": (51, 14, 13, 10, 14, 0), "IP": (32, 23, 3, 1, 2, 3),
    "PA": (33, 20, 8, 0, 5, 0), "PC": (21, 16, 2, 0, 3, 0), "CA": (22, 19, 0, 0, 3, 0),
    "VC": (10, 8, 0, 0, 2, 0), "CF": (13, 13, 0, 0, 0, 0),
}

MARK = re.compile(r"DISPOSITION:\s*")
VER = re.compile(r"\[v(\d+)\.(\d+)\s+DISPOSITION:")


def read(code):
    return (DOCS / FILES[code][0]).read_text(encoding="utf-8").split("\n")


def markers(line):
    """Yield (version, text) for each current-style marker on a line (bracket-depth aware)."""
    for m in VER.finditer(line):
        start = m.end()
        depth, i = 1, start
        while i < len(line) and depth:
            depth += {"[": 1, "]": -1}.get(line[i], 0)
            i += 1
        text = line[start:i - 1].strip()
        yield (int(m.group(1)), int(m.group(2))), text


def is_legend(text):
    return "…" in text[:12] or "A|B|C|D" in text or text.startswith("A —  …") or text == ""


def letters(text):
    """Return (primary, strict_components, loose_components) from a marker body.

    STRICT components (counted): the leading letter, plus any later segment that STARTS with a
    letter followed by an em/en dash or "for" (after "; ", ". ", "(", "**" or a "part (x)" lead-in).
    LOOSE components (only reported when they add something): any standalone A-D token followed by
    a comma, full stop or closing bracket, or preceded by "is" -- prose mentions such as
    "(A, non-blocking)". Prose mentions are listed as ambiguous, never counted.
    """
    t = text.replace("**", "").replace("*", "")
    comps = []
    m = re.match(r"\s*([ABCD])\b", t)
    if m:
        comps.append(m.group(1))
    else:
        m = re.match(r"\s*(?:parts?\b[^—–]*?)\b([ABCD])\b", t)
        if m:
            comps.append(m.group(1))
    for m in re.finditer(r"(?:[.;(]\s*|\bpart \(\w\)\s+|\band\s+)([ABCD])(?=\s*(?:—|–|for\b))", t):
        comps.append(m.group(1))
    strict = list(dict.fromkeys(comps))
    loose = set(re.findall(r"(?<![\w`])([ABCD])(?=[,.)\]])|\bis ([ABCD])\b|\(([ABCD]),", t))
    loose = {x for tup in loose for x in tup if x}
    return (strict[0] if strict else None), set(strict), loose


class Item:
    def __init__(self, doc, key):
        self.doc, self.key = doc, key
        self.marks = []  # (version, line, text, sub) ; sub = None or "4a"

    def add(self, ver, line, text, sub=None):
        self.marks.append((ver, line, text, sub))

    def current(self):
        """Newest version wins, per sub-part. Returns (class, has_non_A_remainder, notes)."""
        if not self.marks:
            return "X", False, []
        notes = []
        by_sub = {}
        for ver, line, text, sub in self.marks:
            by_sub.setdefault(sub, []).append((ver, line, text))
        picked = {}
        for sub, lst in by_sub.items():
            top = max(v for v, _, _ in lst)
            newest = [(l, t) for v, l, t in lst if v == top]
            if len(newest) > 1:
                notes.append(f"{FILES[self.doc][0]} lines {[l for l, _ in newest]}: {len(newest)} markers of the same "
                             f"newest version for {self.key} (sub-part {sub}); first one used")
            picked[sub] = newest[0][1]
        parsed = {}
        for sub, t in picked.items():
            prim, strict, loose = letters(t)
            parsed[sub] = (prim, strict)
            extra = loose - strict
            if extra and strict:
                notes.append(f"{FILES[self.doc][0]} {self.key}: prose also mentions {sorted(extra)} "
                             f"(not counted; strict components {sorted(strict)})")
        all_comps = set()
        for p, c in parsed.values():
            all_comps |= c
        main = parsed.get(None) or next(iter(parsed.values()))
        if "A" in all_comps:
            rest = any((c - {"A"}) for _, c in parsed.values()) or any(
                (p != "A") for sub, (p, _) in parsed.items() if sub is not None) or (
                None in parsed and parsed[None][0] != "A")
            return "A", rest, notes
        if main[0] is None:
            notes.append(f"{FILES[self.doc][0]} line {self.marks[0][1]}: marker letter not readable for {self.key}")
            return "X", False, notes
        return main[0], False, notes


def numbered_questions(lines, start, end, prefix):
    """Return {key: line_no} for lines like '1. ...' in [start,end] (1-based, inclusive)."""
    out = {}
    for ln in range(start, end + 1):
        m = re.match(r"\s*(\d+)\.\s", lines[ln - 1])
        if m:
            out[ln] = f"{prefix}Q{m.group(1)}"
    return out


def collect():
    items = {}  # doc -> {key: Item}
    ambiguous = []

    def get(doc, key):
        return items.setdefault(doc, {}).setdefault(key, Item(doc, key))

    # ---------------- Legal copy ----------------
    L = read("LC")
    for ln, line in enumerate(L, 1):
        m = re.match(r"\|\s*(\d+)\s*\|", line)
        if 1180 <= ln <= 1245 and m and ln > 1186:
            it = get("LC", f"row {m.group(1)}")
            for ver, text in markers(line):
                if not is_legend(text):
                    it.add(ver, ln, text)
            if not it.marks:
                it.marks = []
    # in-text marker table: letter is in column 2, no DISPOSITION marker
    n = 0
    for ln in range(1249, 1262):
        line = L[ln - 1]
        if line.startswith("| ") and "---" not in line and "Marker (where)" not in line:
            cols = [c.strip() for c in line.strip("|").split("|")]
            n += 1
            if len(cols) >= 2 and re.fullmatch(r"[A-D]", cols[1]):
                get("LC", f"marker {n}").add((0, 18), ln, cols[1] + " — " + cols[2][:40])
            else:
                get("LC", f"marker {n}")
    for ln in range(1300, 1315):
        m = re.match(r"(\d+)\.\s+\*\*", L[ln - 1])
        if m:
            it = get("LC", f"open {m.group(1)}")
            for ver, text in markers(L[ln - 1]):
                if not is_legend(text):
                    it.add(ver, ln, text)

    # ---------------- DPIA ----------------
    D = read("DP")
    for ln, line in enumerate(D, 1):
        m = re.match(r"\|\s*(\d+)\s*\|", line)
        if 1975 <= ln <= 2035 and m:
            it = get("DP", f"item {m.group(1)}")
            for ver, text in markers(line):
                if not is_legend(text):
                    it.add(ver, ln, text)

    # ---------------- Incident plan ----------------
    I = read("IP")
    for ln, line in enumerate(I, 1):
        m = re.match(r"\|\s*\*\*Q(\d+)\*\*\s*\|", line)
        if m:
            it = get("IP", f"Q{m.group(1)}")
            for ver, text in markers(line):
                if not is_legend(text):
                    it.add(ver, ln, text)
        elif re.match(r"\*\*\[v\d+\.\d+ DISPOSITION: A — Q-(US|EU)1 to Q-(US|EU)4", line):
            region = "US" if "Q-US" in line else "EU"
            for ver, text in markers(line):
                for k in range(1, 5):
                    get("IP", f"Q-{region}{k}").add(ver, ln, text)

    # ---------------- Post-media addendum (s7 and s12) ----------------
    P = read("PA")
    sect = None
    cur = None
    for ln, line in enumerate(P, 1):
        if re.match(r"##\s*7\.", line):
            sect = "s7"
        elif re.match(r"##\s*12\.", line):
            sect = "s12"
        elif re.match(r"##\s*13\.", line) or re.match(r"##\s*8\.", line):
            sect = None
        if sect is None:
            continue
        m = re.match(r"(\d+)\.\s", line)
        if m:
            cur = f"{sect} Q{m.group(1)}"
            get("PA", cur)
        for ver, text in markers(line):
            if is_legend(text) or cur is None:
                continue
            sm = re.match(r"\s*[A-D]\s*—\s*(\d+[a-z]):", text)
            sub = sm.group(1) if sm else None
            if sub:
                get("PA", cur).add(ver, ln, text, sub)
            else:
                get("PA", cur).add(ver, ln, text)
    # the container question (s12 Q11) is not an item
    items["PA"].pop("s12 Q11", None)

    # ---------------- Part C files, addenda, Cloudflare: numbered questions + marked notes -------------
    def questions_and_notes(doc, q_start, q_end, q_prefix="Q", reattach=None, container=()):
        T = read(doc)
        cur = None
        last_note = None
        for ln, line in enumerate(T, 1):
            mq = re.match(r"\s*(\d+)\.\s", line)
            in_q = q_start <= ln <= q_end
            if in_q and mq:
                cur = f"{q_prefix}{mq.group(1)}"
                get(doc, cur)
            for ver, text in markers(line):
                if is_legend(text):
                    continue
                if in_q:
                    if cur is None:
                        continue
                    tgt = cur
                    if reattach and ln in reattach:
                        tgt = reattach[ln]
                    get(doc, tgt).add(ver, ln, text)
                else:
                    if reattach and ln in reattach:
                        get(doc, reattach[ln]).add(ver, ln, text)
                    elif line.lstrip().startswith(("**[v", "*[v", "- **[v", "7. **[v", "13. **[v")) and "CHANGED" in line.split("DISPOSITION")[0]:
                        last_note = f"note {ln}"
                        get(doc, last_note).add(ver, ln, text)
                    else:
                        # a marker not on a question and not on a CHANGED note paragraph
                        if reattach is None or ln not in reattach:
                            extra = ""
                            if doc == "CF" and ln == 48:
                                extra = (" [read: this is the changelog summary line that restates Q9 "
                                         "(Q9 itself is counted once, at its own line)]")
                            ambiguous.append(f"{FILES[doc][0]} line {ln}: marker outside a question or marked note "
                                             f"(not counted as an item){extra}: {text[:60]}")
        for c in container:
            items[doc].pop(c, None)

    questions_and_notes("PC", 255, 276)
    questions_and_notes("CA", 411, 460)
    questions_and_notes("VC", 172, 187, container=("Q6",))
    # Cloudflare: v0.3 markers on lines 88 and 337 re-mark notes 87 and 335; 501 re-marks Q9; line 48 is the changelog.
    questions_and_notes("CF", 472, 507, reattach={88: "note 87", 337: "note 335", 501: "Q9"})
    items["CF"].pop("note 48", None)
    return items, ambiguous


def main():
    items, ambiguous = collect()
    classes = {}
    partial = {}
    for doc in FILES:
        for key, it in items[doc].items():
            c, rest, notes = it.current()
            ambiguous.extend(notes)
            classes[(doc, key)] = c
            if c == "A" and rest:
                partial[(doc, key)] = True
    print("PER-DOCUMENT COUNT (current marker per item)")
    hdr = f"{'Document':<30}{'Items':>6}{'A':>5}{'B':>5}{'C':>5}{'D':>5}{'X':>5}{'A+rest':>8}"
    print(hdr)
    tot = dict(n=0, A=0, B=0, C=0, D=0, X=0, P=0)
    rows = {}
    for doc in FILES:
        cnt = {k: 0 for k in "ABCDX"}
        for (d, key), c in classes.items():
            if d == doc:
                cnt[c] += 1
        n = sum(cnt.values())
        p = sum(1 for (d, k) in partial if d == doc)
        rows[doc] = (n, cnt["A"], cnt["B"], cnt["C"], cnt["D"], cnt["X"], p)
        print(f"{FILES[doc][1]:<30}{n:>6}{cnt['A']:>5}{cnt['B']:>5}{cnt['C']:>5}{cnt['D']:>5}{cnt['X']:>5}{p:>8}")
        tot["n"] += n; tot["P"] += p
        for k in "ABCDX":
            tot[k] += cnt[k]
    print(f"{'TOTAL':<30}{tot['n']:>6}{tot['A']:>5}{tot['B']:>5}{tot['C']:>5}{tot['D']:>5}{tot['X']:>5}{tot['P']:>8}")
    print()
    print("v1.0 (task D5) for comparison: " + ", ".join(f"{d} {V10[d]}" for d in V10)
          + "  | total 249 = 141 A + 36 B + 20 C + 49 D + 3 X")
    # ---- v1.0 against now, one line per difference ----
    REASONS = {
        "LC": "A 28 to 27, B 10 to 9, D 20 to 22. Verified: Part C row 22 is A again; rows 35 and 41 and in-text marker 7 are D "
              "(v0.18 removed social sign-in and the public report page). Two further A-to-D moves are not attributed to a named marker.",
        "DP": "B 13 to 10, D 14 to 17. Verified: items 40, 41 and 47 were re-marked from B to D in v0.10.",
        "IP": "A 23 to 23, B 3 to 1, D 2 to 7, not assigned 3 to 0. Verified: Q18, Q23 and Q24 are now D (Q24 part (c) stays B); Q19 and Q20 were re-marked from B to D.",
        "PA": "33 items to 32 (A 20 to 19, D 5 to 5). One v1.0 item (s12 Q26) is no longer present in the v0.6 text; not attributed further.",
        "PC": "A 16 to 13, B 2 to 3, D 3 to 5. Several note markers were re-read; the notes are matched to the current line numbers and are not attributed item by item.",
        "CA": "no change in the class split (22 items: 19 A, 3 D); note line numbers moved.",
        "VC": "no change in the class split (10 items: 8 A, 2 D); note line numbers moved.",
        "CF": "A 13 to 10, B 0 to 3. Verified: Q9 (scope, #449) and the two notes at lines 87 and 335 are B in v0.3.",
    }
    print()
    print("v1.0 AGAINST NOW (counts per document; reason where verified)")
    for doc in FILES:
        o = V10[doc]; nn = rows[doc]
        print(f"  {FILES[doc][1]:<30} v1.0 items/A/B/C/D/X {o} -> now {nn[:6]}  | {REASONS[doc]}")
    print("  TOTAL: v1.0 249 = 141 A + 36 B + 20 C + 49 D + 3 X; now "
          f"{tot['n']} = {tot['A']} A + {tot['B']} B + {tot['C']} C + {tot['D']} D + {tot['X']} X. "
          "The v1.0 figures are from the task D5 report; this script cannot recompute them. The one-item difference (249 to 248) is the PA item above.")

    # ---- checks against the pack and the left-out list ----
    pack = (DOCS / "counsel-review-pack.md").read_text(encoding="utf-8")
    left = (DOCS / "counsel-pack-left-out.md").read_text(encoding="utf-8")
    problems = []

    # question-to-source table: "| Q12 | 3 | PA s7 Q1; PC Q7; LC row 37; ... |"
    cited = {}
    qlines = re.findall(r"^\|\s*(Q\d+)\s*\|\s*\d+\s*\|\s*(.+?)\s*\|\s*$", pack, flags=re.M)
    for q, srcs in qlines:
        for s in [x.strip() for x in srcs.split(";") if x.strip()]:
            cited.setdefault(s, []).append(q)

    def src_key(s):
        s = s.strip()
        m = re.fullmatch(r"(PA) (s\d+ Q\d+)(?: \(part \d+[a-z]\))?", s)
        if m:
            return ("PA", m.group(2))
        m = re.fullmatch(r"(LC) (row \d+|marker \d+|open \d+)", s)
        if m:
            return (m.group(1), m.group(2))
        m = re.fullmatch(r"(DP) item (\d+)", s)
        if m:
            return ("DP", f"item {m.group(2)}")
        m = re.fullmatch(r"(IP) (Q[\w-]+)", s)
        if m:
            return ("IP", m.group(2))
        m = re.fullmatch(r"(PC|CA|VC|CF) (Q\d+)", s)
        if m:
            return (m.group(1), m.group(2))
        m = re.fullmatch(r"(PC|CA|VC|CF) (?:note|line) (\d+)", s)
        if m:
            return (m.group(1), f"note {m.group(2)}")
        return None

    cited_keys = {}
    unresolved = []
    for s, qs in cited.items():
        k = src_key(s)
        if k is None:
            unresolved.append(s)
        else:
            cited_keys.setdefault(k, set()).update(qs)
    if unresolved:
        problems.append("source labels the script cannot read: " + "; ".join(sorted(unresolved)))
    A_items = {k for k, c in classes.items() if c == "A"}
    missing = sorted(A_items - set(cited_keys))
    wrong = sorted(k for k in cited_keys if classes.get(k) != "A")
    unknown = sorted(k for k in cited_keys if k not in classes)
    print()
    print(f"(a) every A item cited by at least one question: {'PASS' if not missing else 'FAIL'}"
          f"  ({len(A_items) - len(missing)} of {len(A_items)} A items cited)")
    for k in missing:
        print("     not cited:", k)
    print(f"(b) no non-A item cited: {'PASS' if not wrong and not unknown else 'FAIL'}")
    for k in wrong:
        print(f"     cited but class {classes.get(k)}:", k, sorted(cited_keys[k]))
    for k in unknown:
        print("     cited but not found in the drafts:", k, sorted(cited_keys[k]))
    if missing or wrong or unknown or unresolved:
        problems.append("(a)/(b)")

    # (c) every non-A item is in the left-out list (by the source label text, any row)
    def label_variants(doc, key):
        short = {"LC": "Legal copy", "DP": "DPIA", "IP": "Incident plan", "PA": "Post-media addendum",
                 "PC": "Post-media Part C", "CA": "Contest and view-data addendum", "VC": "View-data Part C",
                 "CF": "Cloudflare draft"}[doc]
        return short, key

    non_a = sorted(k for k, c in classes.items() if c != "A")
    # The left-out list is written for people, so its labels are prose ("section 12 question 9",
    # "note at line 162", "Part C row 4"). Normalise them to the keys the script uses before matching.
    in_left = left
    in_left = re.sub(r"section (\d+) question (\d+)", lambda m: f"s{m.group(1)} Q{m.group(2)}", in_left)
    in_left = re.sub(r"question (\d+)", lambda m: f"Q{m.group(1)}", in_left)
    in_left = re.sub(r"note at line (\d+)", lambda m: f"note {m.group(1)}", in_left)
    in_left = re.sub(r"Part C row (\d+)", lambda m: f"row {m.group(1)}", in_left)
    in_left = re.sub(r"open item (\d+)", lambda m: f"open {m.group(1)}", in_left)
    in_left = re.sub(r"in-text marker (\d+)", lambda m: f"marker {m.group(1)}", in_left)
    in_left = re.sub(r"section 5 item (\d+)", lambda m: f"item {m.group(1)}", in_left)
    not_found = []
    for doc, key in non_a:
        short, k = label_variants(doc, key)
        num = re.sub(r"^(row|marker|open|item|note|Q|s\d+ Q)\s*", "", k)
        pats = []
        if doc == "LC":
            pats = [rf"Legal copy v0\.\d+, (?:Part C )?{re.escape(k)}\b", rf"Legal copy v0\.\d+.*?\b{re.escape(k)}\b"]
        elif doc == "DP":
            pats = [rf"DPIA v0\.\d+,? (?:section 5, )?{re.escape(k)}\b", rf"DPIA v0\.\d+.*?\b{re.escape(k)}\b"]
        elif doc == "IP":
            pats = [rf"Incident plan v0\.\d+,? (?:question )?{re.escape(k)}\b", rf"Incident plan v0\.\d+.*?\b{re.escape(k)}\b"]
        else:
            pats = [rf"{short}.*?(?:\b{re.escape(k)}\b|line {num}\b)"]
        if not any(re.search(p, in_left) for p in pats):
            not_found.append((doc, key))
    print(f"(c) every non-A item is in the left-out list: {'PASS' if not not_found else 'FAIL'}"
          f"  ({len(non_a) - len(not_found)} of {len(non_a)} found by citation label)")
    for doc, key in not_found:
        print("     not found in left-out:", FILES[doc][1], key, f"[class {classes[(doc, key)]}]")
    if not_found:
        problems.append("(c)")

    # (d) arithmetic
    started = len(classes)
    a = sum(1 for c in classes.values() if c == "A")
    non_a_items = sum(1 for c in classes.values() if c in "BCD")
    x = sum(1 for c in classes.values() if c == "X")
    ok_d = started == a + non_a_items + x
    print(f"(d) started {started} = pack A {a} + left-out B/C/D {non_a_items} + not assigned {x}: {'PASS' if ok_d else 'FAIL'}")
    if not ok_d:
        problems.append("(d)")
    print(f"    A items with a non-A remainder (partial rows): {len(partial)}")
    print()
    print(f"AMBIGUOUS OR UNREADABLE MARKERS ({len(ambiguous)}), listed by file and line, not fudged:")
    for a_ in ambiguous:
        print("  -", a_)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Soccernity version-consistency checker.

Run this as the literal last step before declaring any Log Book or
MVP Build Plan update "done". It catches the two bug classes that slipped
through manual review twice in this project:

  1. Self-inconsistency within one document (title page version, header/
     footer string, and closing "End of ..." marker not all agreeing).
  2. Cross-document staleness (Log Book referencing an old Build Plan
     version number, or vice versa) -- while correctly IGNORING version
     numbers that appear inside historical critique-log / changelog
     entries, where an old version number being mentioned is accurate,
     not a bug.
  3. Repo drift: CLAUDE.md / README.md referencing doc filenames that
     don't match what's actually sitting in docs/.

Usage:
    python3 check_version_consistency.py

Exits non-zero if any real problem is found, so it can also be wired
into CI later if desired.
"""

import re
import sys
from pathlib import Path

LOG_BOOK_JS = Path("/home/claude/soccernity/build.js")
BUILD_PLAN_JS = Path("/home/claude/mvpplan/build.js")
REPO_DIR = Path("/home/claude/soccernity-repo")

problems = []
notes = []


def read(path):
    if not path.exists():
        problems.append(f"MISSING FILE: {path}")
        return ""
    return path.read_text(encoding="utf-8")


def extract_self_consistency(js_text, doc_label, title_pattern, header_pattern, end_pattern):
    """Confirm a document's own title-page version, header/footer string,
    and closing marker all agree with each other."""
    title_m = re.search(title_pattern, js_text)
    header_m = re.search(header_pattern, js_text)
    end_m = re.search(end_pattern, js_text)

    versions_found = {}
    if title_m:
        versions_found["title page"] = title_m.group(1)
    if header_m:
        versions_found["header/footer"] = header_m.group(1)
    if end_m:
        versions_found["closing marker"] = end_m.group(1)

    if not versions_found:
        problems.append(f"{doc_label}: could not find ANY version markers — check regexes")
        return None

    unique_versions = set(versions_found.values())
    if len(unique_versions) > 1:
        detail = ", ".join(f"{loc}={v}" for loc, v in versions_found.items())
        problems.append(f"{doc_label}: SELF-INCONSISTENT version strings — {detail}")
    else:
        notes.append(f"{doc_label}: self-consistent at v{unique_versions.pop()} ({len(versions_found)} markers checked)")

    # Return the agreed current version (or the title-page one if they disagree)
    return title_m.group(1) if title_m else next(iter(versions_found.values()))


def check_cross_references(js_text, doc_label, other_doc_name, other_version, ref_pattern):
    """Find every mention of the OTHER document's version inside this
    document, and flag any that don't match the other doc's current
    version -- unless the mention sits inside a historical changelog
    entry (identified by appearing after a 'vX.Y update' h3 heading for
    an OLDER version than current, within a reasonable distance)."""
    h3_positions = [
        (m.start(), m.group(1))
        for m in re.finditer(r'h3\("v(\d+\.\d+) update', js_text)
    ]

    for m in ref_pattern.finditer(js_text):
        found_version = m.group(1)
        pos = m.start()

        # Is this mention inside a historical h3 block for an older version?
        containing_h3_version = None
        for h3_pos, h3_ver in h3_positions:
            if h3_pos <= pos < h3_pos + 3000:  # generous window for one addendum paragraph
                containing_h3_version = h3_ver
                break

        if found_version == other_version:
            continue  # matches current -- fine

        if containing_h3_version is not None:
            notes.append(
                f"{doc_label}: found historical reference to {other_doc_name} v{found_version} "
                f"inside the v{containing_h3_version} changelog entry — OK, this is describing the past"
            )
            continue

        # Real problem: stale reference outside any historical context
        snippet = js_text[max(0, pos - 60):pos + 60].replace("\n", " ")
        problems.append(
            f"{doc_label}: STALE reference to {other_doc_name} v{found_version} "
            f"(current is v{other_version}) — not inside a historical changelog entry. "
            f"Context: ...{snippet}..."
        )


def check_repo_sync(log_book_version, build_plan_version):
    claude_md = read(REPO_DIR / "CLAUDE.md")
    readme_md = read(REPO_DIR / "README.md")
    docs_dir = REPO_DIR / "docs"

    expected_log_book = f"Soccernity_Inventors_Log_Book_v{log_book_version}.docx"
    expected_build_plan = f"Soccernity_MVP_Build_Plan_v{build_plan_version}.docx"

    for label, text in [("CLAUDE.md", claude_md), ("README.md", readme_md)]:
        if expected_log_book not in text:
            problems.append(f"repo/{label}: does not reference current Log Book filename ({expected_log_book})")
        if expected_build_plan not in text:
            problems.append(f"repo/{label}: does not reference current Build Plan filename ({expected_build_plan})")

    if docs_dir.exists():
        actual_files = {p.name for p in docs_dir.glob("*.docx")}
        if expected_log_book not in actual_files:
            problems.append(f"repo/docs/: {expected_log_book} not present. Found: {sorted(actual_files)}")
        if expected_build_plan not in actual_files:
            problems.append(f"repo/docs/: {expected_build_plan} not present. Found: {sorted(actual_files)}")
        stale_files = actual_files - {expected_log_book, expected_build_plan}
        if stale_files:
            problems.append(f"repo/docs/: stale old-version files still present and should be removed: {sorted(stale_files)}")
    else:
        notes.append("repo/docs/ directory not found — skipping file-presence check")


def main():
    log_book_js = read(LOG_BOOK_JS)
    build_plan_js = read(BUILD_PLAN_JS)

    if not log_book_js or not build_plan_js:
        print("Cannot proceed — one or both source scripts missing.")
        sys.exit(2)

    log_book_version = extract_self_consistency(
        log_book_js, "Log Book",
        title_pattern=r"Version (\d+\.\d+)",
        header_pattern=r"SOCCERNITY — Inventor's Log Book v(\d+\.\d+)",
        end_pattern=r"End of Inventor's Log Book v(\d+\.\d+)",
    )

    build_plan_version = extract_self_consistency(
        build_plan_js, "MVP Build Plan",
        title_pattern=r"Version (\d+\.\d+) — Companion",
        header_pattern=r"SOCCERNITY — MVP Build Plan v(\d+\.\d+)",
        end_pattern=r"End of Soccernity MVP Build Plan v(\d+\.\d+)",
    )

    if log_book_version and build_plan_version:
        # Log Book referencing the Build Plan's version
        check_cross_references(
            log_book_js, "Log Book", "MVP Build Plan", build_plan_version,
            re.compile(r"MVP Build Plan v(\d+\.\d+)"),
        )
        # Build Plan referencing the Log Book's version
        check_cross_references(
            build_plan_js, "MVP Build Plan", "Log Book", log_book_version,
            re.compile(r"Inventor's Log Book v(\d+\.\d+)"),
        )
        check_repo_sync(log_book_version, build_plan_version)

    print("=" * 70)
    print("SOCCERNITY VERSION-CONSISTENCY CHECK")
    print("=" * 70)

    if notes:
        print(f"\n{len(notes)} check(s) passed:")
        for n in notes:
            print(f"  \u2713 {n}")

    if problems:
        print(f"\n{len(problems)} PROBLEM(S) FOUND:")
        for p in problems:
            print(f"  \u2717 {p}")
        print("\nRESULT: FAIL — do not declare documents done until these are fixed.")
        sys.exit(1)
    else:
        print("\nRESULT: PASS — no version-consistency problems found.")
        sys.exit(0)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Renders PRIVACY.md into a self-contained HTML page for GitHub Pages.

App Store Connect will not accept a submission without a reachable privacy
policy URL, and the policy has to keep describing what the app actually does
as it changes. So PRIVACY.md stays the single source of truth and this builds
the published page from it — updating the policy is a commit, not a second
copy to keep in step.

    python scripts/build-privacy-page.py [--out _site]

Requires `markdown` (pip install markdown). Run by
.github/workflows/privacy-policy.yml on every push that touches PRIVACY.md.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

try:
    import markdown
except ImportError:
    sys.exit("Missing dependency. Run: pip install markdown")

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = REPO_ROOT / "PRIVACY.md"

# Kept deliberately self-contained: no web fonts, no CDN, no third-party
# anything. A privacy policy that phones out to someone else's server is a bad
# look, and an asset that fails to load is a page that looks broken to the App
# Review tester checking the link resolves.
#
# Built mobile-first. Almost everyone who opens this followed a link out of an
# App Store listing on a phone, so the phone layout is the real design and the
# wide-screen rules are a small progressive enhancement at the bottom.
#
# Colours track src/lib/palette.ts so the page reads as part of the app.
TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#010304" media="(prefers-color-scheme: dark)">
<meta name="description" content="How New Era handles your data. Your pins are private to you.">
<title>{title}</title>
<style>
  :root {{
    color-scheme: light dark;
    /* Mirrors LIGHT in src/lib/palette.ts. */
    --bg: #ffffff;
    --surface: #ffffff;
    --surface2: #ecf3f5;
    --fg: #080c0f;
    --dim: #595e63;
    --rule: rgba(0,0,0,0.10);
    --accent: #4c7ea3;
    --accent-soft: rgba(76,126,163,0.09);
    --shadow: 0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.05);
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      /* Mirrors DARK in src/lib/palette.ts. */
      --bg: #010304;
      --surface: #0b1013;
      --surface2: #161b1f;
      --fg: #f3f5f7;
      --dim: #899096;
      --rule: rgba(255,255,255,0.13);
      --accent: #9fbdd4;
      --accent-soft: rgba(159,189,212,0.12);
      --shadow: none;
    }}
  }}

  * {{ box-sizing: border-box; }}

  body {{
    margin: 0;
    padding: 2rem 1.15rem calc(4rem + env(safe-area-inset-bottom));
    background: var(--bg);
    color: var(--fg);
    font: 17px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif;
    -webkit-text-size-adjust: 100%;
    -webkit-font-smoothing: antialiased;
    overflow-wrap: break-word;
  }}

  h1 {{
    font-size: 1.7rem;
    line-height: 1.22;
    letter-spacing: -0.021em;
    margin: 0 0 0.6rem;
    font-weight: 700;
  }}

  /* "Last updated" — the line right under the title. */
  h1 + p {{
    margin: 0 0 1.75rem;
    font-size: 0.9rem;
    color: var(--dim);
  }}

  h2 {{
    font-size: 1.16rem;
    line-height: 1.3;
    letter-spacing: -0.012em;
    font-weight: 700;
    margin: 2.5rem 0 0.9rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--rule);
  }}

  p, li {{ margin: 0 0 1rem; }}
  ul {{ padding-left: 1.15rem; margin: 0 0 1.15rem; }}
  li::marker {{ color: var(--accent); }}

  a {{ color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }}
  strong {{ font-weight: 660; }}

  code {{
    background: var(--surface2);
    border-radius: 5px;
    padding: 0.12em 0.38em;
    font-size: 0.86em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }}

  /* ---------------------------------------------------------------------
     "What we collect and why".

     This is the densest and most important part of the policy, and a
     three-column table is unreadable on a phone no matter how it scrolls.
     So on narrow screens each row is re-laid-out as its own card, with the
     column headers repeated as labels via data attributes. The wide-screen
     table rules are the enhancement, not the baseline.
     --------------------------------------------------------------------- */
  .table-scroll {{ margin: 0 0 1.6rem; }}

  table {{ width: 100%; border-collapse: collapse; }}

  /* Headers are redundant once each cell carries its own label. */
  thead {{
    position: absolute;
    width: 1px; height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }}

  tbody tr {{
    display: block;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 14px;
    padding: 0.35rem 1rem 0.9rem;
    margin: 0 0 0.75rem;
    box-shadow: var(--shadow);
  }}

  tbody td {{
    display: block;
    padding: 0.75rem 0 0;
    border: 0;
    font-size: 0.97rem;
  }}

  /* The label above each cell — "WHAT", "WHY", "WHERE IT GOES". */
  tbody td::before {{
    content: attr(data-label);
    display: block;
    margin-bottom: 0.28rem;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--accent);
  }}

  /* First cell is the subject of the card — give it weight. */
  tbody td:first-child {{
    font-weight: 650;
    font-size: 1.02rem;
    padding-top: 0.7rem;
  }}
  tbody td:first-child::before {{ content: none; }}

  tbody td:not(:first-child) {{
    color: var(--dim);
    border-top: 1px solid var(--rule);
    margin-top: 0.7rem;
    padding-top: 0.7rem;
  }}

  /* Callout for the standalone bold lines that carry the real promises. */
  .callout {{
    background: var(--accent-soft);
    border-left: 3px solid var(--accent);
    border-radius: 0 12px 12px 0;
    padding: 0.9rem 1rem;
    margin: 0 0 1.2rem;
  }}
  .callout p {{ margin: 0; }}

  footer {{
    margin-top: 3rem;
    padding-top: 1.4rem;
    border-top: 1px solid var(--rule);
    font-size: 0.84rem;
    color: var(--dim);
  }}

  /* Wide screens: enough room for a real table again. */
  @media (min-width: 46rem) {{
    body {{ max-width: 44rem; margin: 0 auto; padding: 3.5rem 2rem 6rem; }}
    h1 {{ font-size: 2.1rem; }}
    h2 {{ font-size: 1.3rem; }}

    thead {{
      position: static;
      width: auto; height: auto;
      clip: auto;
    }}
    thead th {{
      text-align: left;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--accent);
      padding: 0 0.85rem 0.6rem;
      border-bottom: 1px solid var(--rule);
    }}
    tbody tr {{
      display: table-row;
      background: none;
      border: 0;
      border-radius: 0;
      padding: 0;
      margin: 0;
      box-shadow: none;
    }}
    tbody td {{
      display: table-cell;
      vertical-align: top;
      padding: 0.85rem;
      border-bottom: 1px solid var(--rule);
      font-size: 0.94rem;
    }}
    tbody td::before {{ content: none; }}
    tbody td:first-child {{ font-size: 0.94rem; width: 22%; }}
    tbody td:not(:first-child) {{ margin: 0; border-top: 0; }}
    tbody tr:nth-child(odd) td {{ background: var(--surface2); }}
  }}

  @media (prefers-reduced-motion: no-preference) {{
    html {{ scroll-behavior: smooth; }}
  }}
</style>
</head>
<body>
{body}
<footer>
  New Era · Contact <a href="mailto:bnachkebia27@gmail.com">bnachkebia27@gmail.com</a>
</footer>
</body>
</html>
"""



def _label_table_cells(html: str) -> str:
    """Adds `data-label="<column header>"` to every `<td>`.

    The mobile layout drops the header row and repeats the header above each
    value instead, which only works if the value knows which column it came
    from. Done here rather than in CSS because the labels are content.
    """

    def one_table(match: re.Match[str]) -> str:
        table = match.group(0)
        headers = re.findall(r"<th[^>]*>(.*?)</th>", table, flags=re.DOTALL)
        if not headers:
            return table
        # Strip any markup the header itself carries.
        headers = [re.sub(r"<[^>]+>", "", h).strip() for h in headers]

        def one_row(row_match: re.Match[str]) -> str:
            row = row_match.group(0)
            index = [0]

            def one_cell(cell_match: re.Match[str]) -> str:
                position = index[0]
                index[0] += 1
                if position >= len(headers):
                    return cell_match.group(0)
                label = headers[position].replace('"', "&quot;")
                return cell_match.group(0).replace(
                    "<td", f'<td data-label="{label}"', 1
                )

            return re.sub(r"<td[^>]*>", one_cell, row)

        return re.sub(r"<tr>.*?</tr>", one_row, table, flags=re.DOTALL)

    return re.sub(r"<table>.*?</table>", one_table, html, flags=re.DOTALL)


# The sentences someone opens a privacy policy to check. Matched on a distinctive
# fragment rather than the whole paragraph, because each of these is followed by
# ordinary prose in the same block — an exact-match rule would silently stop
# working the first time a word around them changes.
CALLOUT_MARKERS = (
    "pins are visible only to you",
    "device location is never uploaded",
)


def _promote_callouts(html: str) -> str:
    """Gives the policy's load-bearing promises their own boxed paragraph.

    These are the reason someone opened the page; Markdown renders them as
    ordinary body text. Deliberately excludes the "Last updated" line, which is
    also whole-paragraph bold but is metadata rather than a commitment.
    """

    def maybe_box(match: re.Match[str]) -> str:
        paragraph = match.group(0)
        plain = re.sub(r"<[^>]+>", "", paragraph).lower()
        if any(marker in plain for marker in CALLOUT_MARKERS):
            return f'<div class="callout">{paragraph}</div>'
        return paragraph

    return re.sub(r"<p>.*?</p>", maybe_box, html, flags=re.DOTALL)


def build(out_dir: pathlib.Path) -> pathlib.Path:
    text = SOURCE.read_text(encoding="utf-8")

    html = markdown.markdown(text, extensions=["tables", "sane_lists"])

    # Stamp every cell with the column header it sits under. On a phone the
    # table is re-laid-out as one card per row (see the CSS), and these labels
    # are what keep each value meaningful once the header row is gone.
    html = _label_table_cells(html)

    # Wrap tables so a wide one scrolls inside its own box instead of making
    # the whole page pan horizontally on a phone.
    html = re.sub(
        r"<table>.*?</table>",
        lambda m: f'<div class="table-scroll">{m.group(0)}</div>',
        html,
        flags=re.DOTALL,
    )

    # Pull the standalone promise lines out as callouts — they carry the
    # commitments people actually came to check.
    html = _promote_callouts(html)

    # The document's own H1 is the page title; don't invent a second one.
    heading = re.search(r"<h1>(.*?)</h1>", html, flags=re.DOTALL)
    title = re.sub(r"<[^>]+>", "", heading.group(1)).strip() if heading else "Privacy Policy"

    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / "index.html"
    target.write_text(TEMPLATE.format(title=title, body=html), encoding="utf-8")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        default=str(REPO_ROOT / "_site"),
        help="Directory to write index.html into (default: ./_site)",
    )
    args = parser.parse_args()

    if not SOURCE.exists():
        sys.exit(f"Not found: {SOURCE}")

    target = build(pathlib.Path(args.out))
    print(f"Wrote {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

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

# Kept deliberately plain. This page exists to be read once, on a phone, by
# someone who followed a link out of the App Store listing — and to be read by
# an App Review tester checking the link resolves. No fonts to fetch, no
# third-party anything: a privacy policy that phones out to a CDN is a bad
# look, and an asset that fails to load is a page that looks broken.
TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #1a1c1e;
    --dim: #5a6068;
    --rule: #e3e6e9;
    --accent: #0b6bcb;
    --code-bg: #f2f4f6;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #010304;
      --fg: #e8ecef;
      --dim: #9aa3ab;
      --rule: #1e2427;
      --accent: #6db3f2;
      --code-bg: #12181b;
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0 auto;
    padding: 2.5rem 1.25rem 5rem;
    max-width: 46rem;
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif;
    -webkit-text-size-adjust: 100%;
  }}
  h1 {{ font-size: 1.85rem; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 1.25rem; }}
  h2 {{
    font-size: 1.2rem; letter-spacing: -0.01em; margin: 2.75rem 0 0.85rem;
    padding-top: 1.35rem; border-top: 1px solid var(--rule);
  }}
  p, li {{ margin: 0 0 1rem; }}
  ul {{ padding-left: 1.35rem; }}
  a {{ color: var(--accent); }}
  strong {{ font-weight: 650; }}
  code {{
    background: var(--code-bg); border-radius: 4px; padding: 0.1em 0.35em;
    font-size: 0.88em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }}
  /* The "what we collect" table is the densest thing here and the most
     important to keep legible on a phone, so it scrolls in its own box
     rather than forcing the page sideways. */
  .table-scroll {{ overflow-x: auto; margin: 0 0 1.5rem; }}
  table {{ border-collapse: collapse; width: 100%; min-width: 34rem; font-size: 0.94rem; }}
  th, td {{
    border: 1px solid var(--rule); padding: 0.6rem 0.7rem;
    text-align: left; vertical-align: top;
  }}
  th {{ background: var(--code-bg); font-weight: 650; }}
</style>
</head>
<body>
{body}
</body>
</html>
"""


def build(out_dir: pathlib.Path) -> pathlib.Path:
    text = SOURCE.read_text(encoding="utf-8")

    html = markdown.markdown(text, extensions=["tables", "sane_lists"])

    # Wrap tables so a wide one scrolls inside its own box instead of making
    # the whole page pan horizontally on a phone.
    html = re.sub(
        r"<table>.*?</table>",
        lambda m: f'<div class="table-scroll">{m.group(0)}</div>',
        html,
        flags=re.DOTALL,
    )

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

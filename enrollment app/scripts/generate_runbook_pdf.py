from __future__ import annotations

import html
import re
from pathlib import Path
from textwrap import wrap

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROOT = Path(r"c:\agristability\nr-brmb-agristability-powerapps\enrollment app")
SOURCE_HTML = ROOT / "docs" / "deployment-runbook.html"
TARGET_PDF = ROOT / "docs" / "deployment-runbook.pdf"


def html_to_text(html_content: str) -> str:
    block_tags = [
        "</h1>", "</h2>", "</h3>", "</p>", "</li>", "</tr>", "</table>", "</ul>", "</ol>", "</pre>",
    ]
    for tag in block_tags:
        html_content = html_content.replace(tag, tag + "\n")

    html_content = re.sub(r"<br\s*/?>", "\n", html_content, flags=re.IGNORECASE)
    html_content = re.sub(r"<style[\s\S]*?</style>", "", html_content, flags=re.IGNORECASE)
    html_content = re.sub(r"<script[\s\S]*?</script>", "", html_content, flags=re.IGNORECASE)
    html_content = re.sub(r"<[^>]+>", "", html_content)

    text = html.unescape(html_content)
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    lines = [line.rstrip() for line in text.split("\n")]
    return "\n".join(lines).strip() + "\n"


def write_pdf(text: str, out_path: Path) -> None:
    page_width, page_height = A4
    margin_x = 42
    margin_y = 42
    line_height = 13
    max_chars = 112

    c = canvas.Canvas(str(out_path), pagesize=A4)
    y = page_height - margin_y

    for raw_line in text.split("\n"):
        line = raw_line.expandtabs(2)

        if not line.strip():
            y -= line_height
            if y < margin_y:
                c.showPage()
                y = page_height - margin_y
            continue

        wrapped = wrap(line, width=max_chars, break_long_words=False, break_on_hyphens=False) or [""]
        for part in wrapped:
            c.drawString(margin_x, y, part)
            y -= line_height
            if y < margin_y:
                c.showPage()
                y = page_height - margin_y

    c.save()


def main() -> None:
    html_content = SOURCE_HTML.read_text(encoding="utf-8")
    text = html_to_text(html_content)
    write_pdf(text, TARGET_PDF)
    print(f"PDF_CREATED: {TARGET_PDF}")


if __name__ == "__main__":
    main()

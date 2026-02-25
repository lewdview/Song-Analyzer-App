#!/usr/bin/env python3
"""
Generate a branded buyer-facing getting started PDF for Gumroad.

No third-party dependencies are required in this environment.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import List, Tuple


PAGE_WIDTH = 612.0   # US Letter
PAGE_HEIGHT = 792.0
MARGIN = 54.0


def pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def estimate_char_width(font: str, size: float) -> float:
    # Approximation for line wrapping with base 14 fonts.
    if font == "F2":  # Helvetica-Bold
        return size * 0.56
    if font == "F3":  # Courier
        return size * 0.60
    return size * 0.53  # Helvetica


def wrap_text(text: str, width: float, font: str, size: float) -> List[str]:
    words = text.strip().split()
    if not words:
        return []
    char_capacity = max(8, int(width / estimate_char_width(font, size)))
    lines: List[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if len(candidate) <= char_capacity:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


@dataclass
class BlockStyle:
    font: str
    size: float
    leading: float
    color: Tuple[float, float, float]


class PageCanvas:
    def __init__(self) -> None:
        self.commands: List[str] = []

    def rect_fill(self, x: float, y: float, w: float, h: float, rgb: Tuple[float, float, float]) -> None:
        r, g, b = rgb
        self.commands.append(f"{r:.3f} {g:.3f} {b:.3f} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re f")

    def line(self, x1: float, y1: float, x2: float, y2: float, rgb: Tuple[float, float, float], width: float = 1.0) -> None:
        r, g, b = rgb
        self.commands.append(f"{r:.3f} {g:.3f} {b:.3f} RG {width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")

    def text(self, x: float, y: float, text: str, style: BlockStyle) -> None:
        r, g, b = style.color
        escaped = pdf_escape(text)
        self.commands.append(
            f"BT /{style.font} {style.size:.2f} Tf {r:.3f} {g:.3f} {b:.3f} rg "
            f"1 0 0 1 {x:.2f} {y:.2f} Tm ({escaped}) Tj ET"
        )

    def stream(self) -> bytes:
        return ("\n".join(self.commands) + "\n").encode("utf-8")


class GuideComposer:
    def __init__(self) -> None:
        self.pages: List[PageCanvas] = []
        self.current = PageCanvas()
        self.pages.append(self.current)
        self.y = PAGE_HEIGHT - 96.0
        self.page_num = 1

        self.title_style = BlockStyle("F2", 28, 32, (1, 1, 1))
        self.h1_style = BlockStyle("F2", 18, 24, (0.08, 0.12, 0.17))
        self.h2_style = BlockStyle("F2", 13, 18, (0.08, 0.12, 0.17))
        self.body_style = BlockStyle("F1", 11, 15, (0.14, 0.17, 0.22))
        self.small_style = BlockStyle("F1", 9, 12, (0.28, 0.32, 0.38))
        self.code_style = BlockStyle("F3", 9.5, 13, (0.10, 0.13, 0.18))

    def new_page(self) -> None:
        self.current = PageCanvas()
        self.pages.append(self.current)
        self.page_num += 1
        self.y = PAGE_HEIGHT - 84.0
        self._draw_page_chrome()

    def _draw_page_chrome(self) -> None:
        self.current.rect_fill(0, PAGE_HEIGHT - 42, PAGE_WIDTH, 42, (0.09, 0.15, 0.29))
        self.current.text(
            MARGIN,
            PAGE_HEIGHT - 28,
            "365 Tool Drop",
            BlockStyle("F2", 12, 14, (1, 1, 1)),
        )
        self.current.text(
            PAGE_WIDTH - 244,
            PAGE_HEIGHT - 28,
            "Song Analyzer - Getting Started",
            BlockStyle("F1", 10, 12, (0.90, 0.94, 1.0)),
        )
        self.current.line(MARGIN, 52, PAGE_WIDTH - MARGIN, 52, (0.85, 0.88, 0.93), 0.8)
        self.current.text(
            PAGE_WIDTH - MARGIN - 40,
            36,
            f"Page {self.page_num}",
            BlockStyle("F1", 9, 12, (0.35, 0.39, 0.46)),
        )

    def ensure_space(self, needed: float) -> None:
        if self.y - needed < 72:
            self.new_page()

    def add_h1(self, text: str) -> None:
        self.ensure_space(self.h1_style.leading + 8)
        self.current.text(MARGIN, self.y, text, self.h1_style)
        self.y -= self.h1_style.leading + 2

    def add_h2(self, text: str) -> None:
        self.ensure_space(self.h2_style.leading + 6)
        self.current.text(MARGIN, self.y, text, self.h2_style)
        self.y -= self.h2_style.leading

    def add_paragraph(self, text: str, style: BlockStyle | None = None) -> None:
        style = style or self.body_style
        lines = wrap_text(text, PAGE_WIDTH - (2 * MARGIN), style.font, style.size)
        needed = max(style.leading, len(lines) * style.leading + 4)
        self.ensure_space(needed)
        for line in lines:
            self.current.text(MARGIN, self.y, line, style)
            self.y -= style.leading
        self.y -= 4

    def add_bullet(self, text: str) -> None:
        bullet_width = PAGE_WIDTH - (2 * MARGIN) - 18
        lines = wrap_text(text, bullet_width, self.body_style.font, self.body_style.size)
        needed = max(self.body_style.leading, len(lines) * self.body_style.leading + 2)
        self.ensure_space(needed)
        self.current.text(MARGIN, self.y, "-", self.body_style)
        for i, line in enumerate(lines):
            x = MARGIN + 14
            self.current.text(x, self.y, line, self.body_style)
            if i < len(lines) - 1:
                self.y -= self.body_style.leading
        self.y -= self.body_style.leading

    def add_code_block(self, lines: List[str]) -> None:
        pad = 8
        block_height = pad * 2 + len(lines) * self.code_style.leading
        self.ensure_space(block_height + 8)
        y_bottom = self.y - block_height + 10
        self.current.rect_fill(MARGIN, y_bottom, PAGE_WIDTH - (2 * MARGIN), block_height, (0.93, 0.95, 0.98))
        y_cursor = self.y - pad
        for line in lines:
            wrapped = wrap_text(line, PAGE_WIDTH - (2 * MARGIN) - 16, self.code_style.font, self.code_style.size)
            for subline in wrapped:
                self.current.text(MARGIN + 8, y_cursor, subline, self.code_style)
                y_cursor -= self.code_style.leading
        self.y = y_bottom - 10

    def add_spacer(self, amount: float) -> None:
        self.y -= amount

    def add_cover_page(self) -> None:
        canvas = self.current
        canvas.rect_fill(0, 0, PAGE_WIDTH, PAGE_HEIGHT, (0.97, 0.98, 1.0))
        canvas.rect_fill(0, PAGE_HEIGHT - 280, PAGE_WIDTH, 280, (0.09, 0.15, 0.29))
        canvas.rect_fill(54, PAGE_HEIGHT - 258, 188, 26, (0.97, 0.64, 0.17))
        canvas.text(68, PAGE_HEIGHT - 240, "365 TOOL DROP", BlockStyle("F2", 12, 14, (0.09, 0.15, 0.29)))
        canvas.text(54, PAGE_HEIGHT - 332, "Song Analyzer", self.title_style)
        canvas.text(54, PAGE_HEIGHT - 366, "Getting Started Guide", self.title_style)
        canvas.text(
            54,
            PAGE_HEIGHT - 412,
            "Buyer-ready setup guide for your Gumroad delivery",
            BlockStyle("F1", 14, 18, (0.87, 0.92, 1.0)),
        )

        canvas.rect_fill(54, 204, PAGE_WIDTH - 108, 140, (1.0, 1.0, 1.0))
        canvas.line(54, 344, PAGE_WIDTH - 54, 344, (0.83, 0.87, 0.94), 1)
        canvas.text(72, 316, "What this guide covers", BlockStyle("F2", 13, 16, (0.11, 0.15, 0.22)))
        canvas.text(72, 292, "- Local Whisper transcription setup", self.body_style)
        canvas.text(72, 274, "- New local mood/sentiment/themes engine", self.body_style)
        canvas.text(72, 256, "- First file workflow in under 10 minutes", self.body_style)
        canvas.text(72, 238, "- Packaging notes for Gumroad buyers", self.body_style)

        today = date.today().isoformat()
        canvas.text(54, 120, f"Version: 1.0    Date: {today}", self.small_style)
        canvas.text(
            54,
            102,
            "Brand: 365 Tool Drop",
            BlockStyle("F2", 10, 12, (0.15, 0.2, 0.33)),
        )

    def add_content_pages(self) -> None:
        self.new_page()
        self.add_h1("Quick Start At A Glance")
        self.add_paragraph(
            "This product runs as two local services: the web app and a local Whisper transcription service. "
            "No OpenAI dependency is required for the mood and sentiment output in this version."
        )
        self.add_h2("System Requirements")
        self.add_bullet("macOS, Linux, or Windows with Node.js 18+ and npm.")
        self.add_bullet("About 2 to 4 GB free disk for dependencies and Whisper models.")
        self.add_bullet("Internet only needed once for model download; daily usage can stay local.")
        self.add_h2("Files Included In This Drop")
        self.add_bullet("Main app: /Song Analyzer App")
        self.add_bullet("Transcription service: /Song Analyzer App/transcription-service")
        self.add_bullet("Guide PDF: /output/pdf/365-tool-drop-getting-started.pdf")

        self.add_h1("Install And Run")
        self.add_h2("Step 1: Start the transcription service")
        self.add_code_block([
            "cd /path/to/Song Analyzer App/transcription-service",
            "npm install",
            "npm start",
        ])
        self.add_paragraph(
            "Keep this terminal open. On first run the Whisper model downloads and initialization can take several minutes."
        )
        self.add_h2("Step 2: Start the web app")
        self.add_code_block([
            "cd /path/to/Song Analyzer App",
            "npm install",
            "npm run dev",
        ])
        self.add_paragraph(
            "Open the local URL shown by Vite. By default the app points to the local transcription service at "
            "http://localhost:3001."
        )

        self.new_page()
        self.add_h1("First Analysis Workflow")
        self.add_h2("Upload and process your first track")
        self.add_bullet("Upload an MP3 or WAV in the web UI.")
        self.add_bullet("The app extracts audio features first (tempo, key, energy, valence, genre, mood).")
        self.add_bullet("The transcription service returns text, segments, words, and local lyricsAnalysis.")
        self.add_bullet("Final results combine audio and lyrics signals in one analysis card.")
        self.add_h2("Expected output fields")
        self.add_code_block([
            "{",
            '  "lyricsAnalysis": {',
            '    "mood": ["upbeat", "energetic"],',
            '    "emotion": ["joy", "confidence"],',
            '    "themes": ["ambition", "party"],',
            '    "sentiment": "positive|negative|neutral|mixed",',
            '    "sentimentScore": 0.63,',
            '    "energyFromLyrics": 0.74,',
            '    "valenceFromLyrics": 0.81',
            "  }",
            "}",
        ])
        self.add_h2("Where this comes from")
        self.add_paragraph(
            "Mood and sentiment are computed locally with a rule-based analyzer in the transcription service. "
            "It uses lexicons, phrase boosts, negation handling, and energy/valence heuristics."
        )

        self.new_page()
        self.add_h1("Configuration For Power Users")
        self.add_h2("Local lyrics analysis toggles")
        self.add_code_block([
            "export ENABLE_LOCAL_LYRICS_ANALYSIS=true",
            "export LOCAL_LYRICS_MIN_CHARS=24",
            "export WHISPER_PORT=3001",
            "npm start",
        ])
        self.add_paragraph(
            "Set ENABLE_LOCAL_LYRICS_ANALYSIS=false if you want transcription only. "
            "Increase LOCAL_LYRICS_MIN_CHARS if short clips are producing noisy labels."
        )
        self.add_h2("Troubleshooting")
        self.add_bullet("If transcription fails, confirm the service is running at http://localhost:3001/health.")
        self.add_bullet("If browser cannot connect, check firewall rules and mixed-content HTTPS restrictions.")
        self.add_bullet("If output quality is poor, switch to a larger Whisper model and restart the service.")
        self.add_bullet("If start-up is slow on first run, wait for model download and warm-up to finish.")

        self.add_h1("Gumroad Packaging Notes")
        self.add_h2("Recommended product bundle")
        self.add_bullet("Include this PDF guide in the product root.")
        self.add_bullet("Include a short README with exact start commands and your support email.")
        self.add_bullet("Provide a one-line value statement: local transcription plus local lyric intelligence.")
        self.add_h2("Suggested listing copy (short)")
        self.add_paragraph(
            "365 Tool Drop: Song Analyzer is a local-first music analysis toolkit that transcribes audio and "
            "generates mood, emotion, themes, and sentiment without requiring OpenAI."
        )
        self.add_spacer(8)
        self.add_paragraph(
            "Need support? Reply to your Gumroad receipt email with your OS, Node version, and error logs from both terminals.",
            self.small_style,
        )

    def streams(self) -> List[bytes]:
        return [page.stream() for page in self.pages]


def build_pdf(streams: List[bytes], destination: Path) -> None:
    font_regular = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    font_bold = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
    font_code = b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"

    n_pages = len(streams)
    first_content_obj = 4
    first_page_obj = first_content_obj + n_pages
    pages_obj = first_page_obj + n_pages
    catalog_obj = pages_obj + 1
    total_objs = catalog_obj

    objects: List[bytes] = [b""] * total_objs
    objects[0] = font_regular
    objects[1] = font_bold
    objects[2] = font_code

    for idx, content in enumerate(streams):
        content_obj_id = first_content_obj + idx
        stream_obj = (
            f"<< /Length {len(content)} >>\nstream\n".encode("utf-8")
            + content
            + b"endstream"
        )
        objects[content_obj_id - 1] = stream_obj

    page_ids: List[int] = []
    for idx in range(n_pages):
        page_obj_id = first_page_obj + idx
        content_obj_id = first_content_obj + idx
        page_dict = (
            f"<< /Type /Page /Parent {pages_obj} 0 R "
            f"/MediaBox [0 0 {PAGE_WIDTH:.0f} {PAGE_HEIGHT:.0f}] "
            f"/Resources << /Font << /F1 1 0 R /F2 2 0 R /F3 3 0 R >> >> "
            f"/Contents {content_obj_id} 0 R >>"
        ).encode("utf-8")
        objects[page_obj_id - 1] = page_dict
        page_ids.append(page_obj_id)

    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects[pages_obj - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>".encode("utf-8")
    objects[catalog_obj - 1] = f"<< /Type /Catalog /Pages {pages_obj} 0 R >>".encode("utf-8")

    out = bytearray()
    out.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

    offsets = [0]
    for obj_id, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out.extend(f"{obj_id} 0 obj\n".encode("utf-8"))
        out.extend(obj)
        out.extend(b"\nendobj\n")

    xref_start = len(out)
    out.extend(f"xref\n0 {total_objs + 1}\n".encode("utf-8"))
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("utf-8"))

    out.extend(
        (
            f"trailer\n<< /Size {total_objs + 1} /Root {catalog_obj} 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF\n"
        ).encode("utf-8")
    )

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(out)


def main() -> None:
    composer = GuideComposer()
    composer.add_cover_page()
    composer.add_content_pages()
    output = Path("output/pdf/365-tool-drop-getting-started.pdf")
    build_pdf(composer.streams(), output)
    print(f"Created {output}")


if __name__ == "__main__":
    main()

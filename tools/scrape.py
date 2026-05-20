#!/usr/bin/env python3
"""Pull new images from fabiaoqing.com into site/img/.
Local IDs start at 10000. Dedupes by sha256 against existing files.
"""
import argparse
import asyncio
import hashlib
import re
import sys
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = ROOT / "site" / "img"
META = ROOT / "site" / "meta.json"
HASH_FILE = ROOT / "site" / ".hashes"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://fabiaoqing.com/",
}
LIST = "https://fabiaoqing.com/biaoqing/lists/page/{}.html"


def existing_local_ids() -> list[int]:
    if not IMG_DIR.exists():
        return []
    out = []
    for p in IMG_DIR.glob("*.jpg"):
        try:
            n = int(p.stem)
            if n >= 10000:
                out.append(n)
        except ValueError:
            pass
    return out


def load_hashes() -> set[str]:
    if HASH_FILE.exists():
        return set(HASH_FILE.read_text().splitlines())
    return set()


def write_meta() -> None:
    import subprocess
    subprocess.run([str(ROOT / "tools" / "regen-meta.sh")], check=False)


class Sink:
    def __init__(self):
        IMG_DIR.mkdir(parents=True, exist_ok=True)
        self.hashes = load_hashes()
        local = existing_local_ids()
        self.next_id = max(local) + 1 if local else 10000
        self.lock = asyncio.Lock()
        self.added = 0

    async def write(self, data: bytes) -> int | None:
        h = hashlib.sha256(data).hexdigest()
        async with self.lock:
            if h in self.hashes:
                return None
            i = self.next_id
            (IMG_DIR / f"{i}.jpg").write_bytes(data)
            self.hashes.add(h)
            with HASH_FILE.open("a") as f:
                f.write(h + "\n")
            self.next_id += 1
            self.added += 1
            return i


async def fetch_image(client: httpx.AsyncClient, url: str, sink: Sink, sem: asyncio.Semaphore) -> None:
    async with sem:
        try:
            r = await client.get(url, timeout=20.0)
            r.raise_for_status()
        except Exception:
            return
        await sink.write(r.content)


async def parse_page(client: httpx.AsyncClient, page: int, sink: Sink, sem: asyncio.Semaphore) -> int:
    try:
        r = await client.get(LIST.format(page), timeout=20.0)
        r.raise_for_status()
    except Exception as e:
        print(f"page {page}: {e}", file=sys.stderr)
        return 0

    soup = BeautifulSoup(r.text, "html.parser")
    seg = soup.find("div", class_="ui segment imghover")
    if not seg:
        return 0

    urls = []
    for img in seg.select("img.ui.image.lazy"):
        u = img.get("data-original") or ""
        u = re.sub(r"bmiddle", "large", u)
        if re.search(r"\.(jpg|jpeg)$", u, re.I):
            urls.append(u)

    before = sink.added
    await asyncio.gather(*(fetch_image(client, u, sink, sem) for u in urls))
    new = sink.added - before
    print(f"page {page}: {new} new (saw {len(urls)})")
    return new


async def run(start: int, pages: int, concurrency: int) -> None:
    sink = Sink()
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, http2=True) as client:
        for p in range(start, start + pages):
            await parse_page(client, p, sink, sem)
    write_meta()
    print(f"done. {sink.added} new images. next id = {sink.next_id}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1, help="first page (default 1)")
    ap.add_argument("--pages", type=int, default=20, help="how many pages to crawl")
    ap.add_argument("--concurrency", type=int, default=8)
    args = ap.parse_args()
    asyncio.run(run(args.start, args.pages, args.concurrency))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Point every absolute URL (canonical, Open Graph, JSON-LD, sitemap, robots, llms.txt, 404) at a new address.

Run it when the site moves to its own domain:
    python3 tools/set_base_url.py https://www.example.com/
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) != 2 or not sys.argv[1].startswith("http"):
    sys.exit("usage: python3 tools/set_base_url.py https://your-domain.example/")
new = sys.argv[1].rstrip("/") + "/"
index = (root / "index.html").read_text()
old = re.search(r'<link rel="canonical" href="([^"]+)"', index).group(1)
if old == new:
    sys.exit("already using " + new)
for name in ["index.html", "sitemap.xml", "robots.txt", "llms.txt", "404.html"]:
    p = root / name
    t = p.read_text()
    p.write_text(t.replace(old, new))
    print("updated", name)
print(f"{old}  ->  {new}")

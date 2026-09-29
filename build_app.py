#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Đóng gói unified_template.html + unified_blob.json -> index.html (file duy nhất, deploy thẳng lên Vercel).

Chạy: python3 build_app.py
  --localtest   : xuất thêm index.localtest.html, dùng leaflet vendor trong vendor/
                  thay vì CDN unpkg (để test offline bằng Playwright, KHÔNG deploy file này)
"""
import re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "unified_template.html")
BLOB = os.path.join(HERE, "unified_blob.json")
OUT = os.path.join(HERE, "index.html")
OUT_LOCALTEST = os.path.join(HERE, "index.localtest.html")


def main():
    tpl = open(TEMPLATE, encoding="utf-8").read()
    blob = open(BLOB, encoding="utf-8").read()
    out = tpl.replace("__BLOB__", blob)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"XONG -> {OUT} ({os.path.getsize(OUT)/1e6:.2f} MB) — kéo thả file này lên Vercel Drop, hoặc dùng làm index.html khi deploy qua CLI.")

    if "--localtest" in sys.argv:
        s = out
        s = s.replace("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "vendor/leaflet.css")
        s = s.replace("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "vendor/leaflet.js")
        s = s.replace(
            "https://unpkg.com/leaflet-polylinedecorator@1.6.0/dist/leaflet.polylineDecorator.js",
            "vendor/leaflet.polylineDecorator.js",
        )
        s = re.sub(r"@import url\('https://fonts\.googleapis\.com[^)]*\);\n?", "", s)
        with open(OUT_LOCALTEST, "w", encoding="utf-8") as f:
            f.write(s)
        print(f"XONG -> {OUT_LOCALTEST} (dùng vendor/leaflet local, không cần mạng — chỉ để test, KHÔNG deploy file này)")


if __name__ == "__main__":
    main()

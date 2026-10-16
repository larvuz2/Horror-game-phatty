"""Minimal fal.ai queue client used to generate the game's assets.

Usage (as a library):
    from fal_client import run
    out = run("tripo3d/p2/text-to-3d", {"prompt": "..."}, out_dir="raw/props/chair")

Reads the API key from the FAL_KEY environment variable. Every URL found in the
result payload is downloaded into out_dir, and the raw JSON is saved as result.json.
"""
import json
import os
import sys
import time
import urllib.parse

import requests

KEY = os.environ.get("FAL_KEY")
HEADERS = {"Authorization": f"Key {KEY}", "Content-Type": "application/json"}


def _urls(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "url" and isinstance(v, str) and v.startswith("http"):
                yield path, v, obj.get("file_name")
            else:
                yield from _urls(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _urls(v, f"{path}[{i}]")


def _req(method, url, **kw):
    for attempt in range(6):
        try:
            r = requests.request(method, url, timeout=120, **kw)
            if r.status_code >= 500 or r.status_code == 429:
                raise requests.HTTPError(f"{r.status_code} {r.text[:200]}")
            return r
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as e:
            wait = 2 ** (attempt + 1)
            print(f"  retry {attempt+1} after error: {e} (sleep {wait}s)", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"request failed: {method} {url}")


def run(endpoint, payload, out_dir, poll=5, timeout=1800):
    os.makedirs(out_dir, exist_ok=True)
    done_marker = os.path.join(out_dir, "result.json")
    if os.path.exists(done_marker):
        print(f"[skip] {out_dir} already generated")
        return json.load(open(done_marker))
    json.dump({"endpoint": endpoint, "payload": payload}, open(os.path.join(out_dir, "request.json"), "w"), indent=2)
    r = _req("POST", f"https://queue.fal.run/{endpoint}", headers=HEADERS, json=payload)
    if r.status_code >= 400:
        raise RuntimeError(f"submit failed {r.status_code}: {r.text[:500]}")
    sub = r.json()
    status_url, response_url = sub["status_url"], sub["response_url"]
    print(f"[submit] {endpoint} -> {sub['request_id']} ({out_dir})")
    t0 = time.time()
    while True:
        s = _req("GET", status_url, headers=HEADERS).json()
        st = s.get("status")
        if st == "COMPLETED":
            break
        if st not in ("IN_QUEUE", "IN_PROGRESS"):
            raise RuntimeError(f"bad status {s}")
        if time.time() - t0 > timeout:
            raise RuntimeError("timeout")
        time.sleep(poll)
    res = _req("GET", response_url, headers=HEADERS)
    if res.status_code >= 400:
        raise RuntimeError(f"result failed {res.status_code}: {res.text[:800]}")
    data = res.json()
    for path, url, fname in _urls(data):
        name = fname or os.path.basename(urllib.parse.urlparse(url).path)
        safe = path.replace("[", "_").replace("]", "").replace(".", "_")
        dest = os.path.join(out_dir, f"{safe}__{name}")
        blob = _req("GET", url)
        open(dest, "wb").write(blob.content)
        print(f"  saved {dest} ({len(blob.content)//1024} KB)")
    json.dump(data, open(done_marker, "w"), indent=2)
    print(f"[done] {out_dir} in {time.time()-t0:.0f}s")
    return data

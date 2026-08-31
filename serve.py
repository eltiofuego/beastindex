#!/usr/bin/env python3
"""Local dev server for the BEASTINDEX static site. python3 serve.py -> :4321"""
import http.server, socketserver, os, functools
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 4321), H) as s:
    print("serving web/ on http://127.0.0.1:4321")
    s.serve_forever()

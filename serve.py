#!/usr/bin/env python3
"""
Simple local development server for PDFSlick.
Serves the current directory at http://localhost:8080

Usage:
  python serve.py          # default port 8080
  python serve.py 3000     # custom port
"""

import sys
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class NoCacheHandler(SimpleHTTPRequestHandler):
    """Serve files with no-cache headers and correct MIME types."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def guess_type(self, path):
        mime, _ = super().guess_type(path)
        # Ensure .js files are served as JavaScript (some Python versions return text/plain)
        if str(path).endswith('.js'):
            return 'application/javascript'
        if str(path).endswith('.json'):
            return 'application/json'
        return mime

    def log_message(self, fmt, *args):
        # Cleaner log output
        print(f"  {args[0]}  {args[1]}  {args[2] if len(args) > 2 else ''}")


os.chdir(os.path.dirname(os.path.abspath(__file__)))

print(f"\n  PDFSlick dev server running at:")
print(f"  ➜  http://localhost:{PORT}\n")
print(f"  Press Ctrl+C to stop.\n")

try:
    HTTPServer(('', PORT), NoCacheHandler).serve_forever()
except KeyboardInterrupt:
    print("\n  Server stopped.")

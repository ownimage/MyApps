import os
import socket
import socketserver
from http.server import SimpleHTTPRequestHandler

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

Handler = SimpleHTTPRequestHandler
Handler.extensions_map.update({
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
})
# HTTP/1.0: close each connection after one request. Playwright opens many
# parallel connections, and keep-alive threads otherwise pile up and overwhelm
# the server under high worker counts.
Handler.protocol_version = "HTTP/1.0"

class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.HTTPServer):
    daemon_threads = True

try:
    # A large accept backlog so 30 parallel test shards can connect at once.
    ThreadingHTTPServer.request_queue_size = 2048
    ThreadingHTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
except OSError:
    # Port already in use (another shard started the server first): fall back to
    # binding on the same port, or just serve whatever got there.
    socket.setdefaulttimeout(30)
    ThreadingHTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
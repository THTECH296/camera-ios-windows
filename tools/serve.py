# Servidor de teste da interface (modo demonstração no navegador), sem cache.
import http.server, functools, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
root = sys.argv[1]
port = int(sys.argv[2]) if len(sys.argv) > 2 else 5310
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()

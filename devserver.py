"""Servidor de desenvolvimento do Meridiano.

Serve o jogo e recebe a telemetria que ele envia, gravando tudo em debug.log
na pasta do projeto. Assim, quando algo bugar, basta dizer -- o log fica aqui.

Uso:
    python devserver.py
Depois abra http://127.0.0.1:8765/index.html
"""
import datetime
import http.server
import json
import os
import socketserver
import sys

PORT = 8765
ROOT = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(ROOT, 'debug.log')


def stamp():
    return datetime.datetime.now().strftime('%H:%M:%S.%f')[:-3]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # The build changes constantly during a session; never serve a stale one.
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def do_POST(self):
        if self.path != '/log':
            self.send_error(404)
            return
        try:
            size = int(self.headers.get('Content-Length', 0))
            events = json.loads(self.rfile.read(size).decode('utf-8'))
        except Exception as error:
            self.send_error(400, str(error))
            return
        lines = []
        for event in events:
            kind = event.pop('t', 'evento')
            when = event.pop('at', '')
            body = ' '.join('%s=%s' % (k, v) for k, v in event.items())
            lines.append('%s [%7s] %-9s %s' % (stamp(), when, kind, body))
        with open(LOG, 'a', encoding='utf-8') as handle:
            handle.write('\n'.join(lines) + '\n')
        for line in lines:
            if any(word in line for word in ('erro', 'fatal', 'MARCA')):
                print(line)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass  # the request spam is not what we are here to read


if __name__ == '__main__':
    with open(LOG, 'w', encoding='utf-8') as handle:
        handle.write('=== sessao iniciada %s ===\n' % stamp())
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as server:
        print('Meridiano em http://127.0.0.1:%d/index.html' % PORT)
        print('Log em %s' % LOG)
        print('No jogo: F3 = painel ao vivo, F2 = marcar "bugou aqui"')
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nencerrado')
            sys.exit(0)

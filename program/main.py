import webview
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from routes import API

base_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(base_dir, 'src')
index_inicial = os.path.join(src_dir, 'home.html')

class ReloadHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith(('.html', '.css', '.js')):
            print(f"Arquivo modificado, recarregando...")
            window.evaluate_js('window.location.reload()')

def start_watching():
    event_handler = ReloadHandler()
    observer = Observer()
    observer.schedule(event_handler, src_dir, recursive=True)
    observer.start()

if __name__ == '__main__':
    api = API()

    window = webview.create_window(
        'SEAV - Sistema Embarcado de Acesso Veicular',
        url=index_inicial,
        width=1000,
        height=700,
        js_api=api
    )

    start_watching()
    webview.start()
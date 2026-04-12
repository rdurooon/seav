import webview
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# --- Mesmas configurações de caminho que já usamos ---
base_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(base_dir, 'src')
index_inicial = os.path.join(src_dir, 'home.html')

# --- Classe que vigia os arquivos ---
class ReloadHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith(('.html', '.css', '.js')): # type: ignore
            print(f"Recarregando...")
            window.evaluate_js('window.location.reload()')    # type: ignore

def start_watching():
    event_handler = ReloadHandler()
    observer = Observer()
    observer.schedule(event_handler, src_dir, recursive=True)
    observer.start()

window = webview.create_window(
    'SEAV - Sistema Embarcado de Acesso Veicular',
    url=index_inicial,
    width=1000,
    height=700
)

if __name__ == '__main__':
    start_watching() # Inicia a vigilância antes do app
    webview.start()
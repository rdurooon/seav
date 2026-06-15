import webview
import os
import screeninfo
from routes import API

base_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(base_dir, 'src')
index_inicial = os.path.join(src_dir, 'home.html')

def center_screen(largura, altura):
    monitor = screeninfo.get_monitors()[0]
    x = (monitor.width - largura) // 3
    y = (monitor.height - altura) // 6
    return x, y

largura = 1000
altura = 700
x_pos, y_pos = center_screen(largura, altura)


if __name__ == '__main__':
    api = API()
    window = webview.create_window(
        'SEAV - Sistema Embarcado de Acesso Veicular',
        url=index_inicial,
        width=largura,
        height=altura,
        x=x_pos,
        y=y_pos,
        js_api=api,
        resizable=False
    )

    api.set_window(window)
    webview.start(debug=False)
from database.database import Api
from serial_reader import SerialReader
import serial.tools.list_ports

class API:
    def __init__(self):
        self.db = Api()
        self.serial_reader = SerialReader()
        self.window = None

    def set_window(self, window):
        self.__window = window
        self.serial_reader.set_frame_callback(
            lambda b64: window.run_js(
                f"updateCameraStream('data:image/jpeg;base64,{b64}')"
            )
        )

    def connect_serial(self, port):
        return self.serial_reader.connect(port)

    def conectar_porta(self, porta):
        if self.connect_serial(f"COM{porta}"):
            self.db.salvar_config("porta_com", porta)
            return "Conectado"
        return "Erro"

    def carregar_porta(self):
        return self.db.carregar_config("porta_com")

    def ping(self):
        return "SEAV funcionando!"

    def get_status(self):
        return self.serial_reader.get_status()

    # Métodos expostos para o frontend
    def cadastrar_completo(self, dados):
        return self.db.cadastrar_completo(dados)

    def listar_completo(self):
        return self.db.listar_completo()

    def buscar_morador(self, id_morador):
        return self.db.buscar_morador(id_morador)

    def atualizar_morador(self, dados):
        return self.db.atualizar_morador(dados)

    def deletar_morador(self, id_morador):
        return self.db.deletar_morador(id_morador)

    def detectar_portas(self):
        portas = serial.tools.list_ports.comports()
        portas_disponiveis = []
        for porta in portas:
            portas_disponiveis.append(porta.device)
        return portas_disponiveis
from database.database import Api
import serial.tools.list_ports
import serial
import threading
import time

class API:
    def __init__(self):
        self.db = Api()
        self.serial_conn = None
        self.status = "🚫"

    def connect_serial(self, port):
        try:
            self.serial_conn = serial.Serial(port, 921600, timeout=2)
            self.status = "❌"
        except:
            self.serial_conn = None
            self.status = "🚫"

    def conectar_porta(self, porta):
        self.connect_serial(f"COM{porta}")
        if self.serial_conn:
            self.db.salvar_config("porta_com", porta)
            return "Conectado"
        return "Erro"

    def carregar_porta(self):
        return self.db.carregar_config("porta_com")

    def ping(self):
        return "SEAV funcionando!"

    def get_status(self):
        if self.serial_conn:
            try:
                self.serial_conn.reset_input_buffer()
                self.serial_conn.write(b"GET_STATUS\n")
                time.sleep(0.2)
                line = self.serial_conn.readline().decode('utf-8').strip()
                if line.startswith("STATUS:"):
                    self.status = line.split(":")[1]
            except:
                self.serial_conn = None
                self.status = "🚫"
        return self.status

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
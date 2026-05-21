from database.database import Api
from serial_reader import SerialReader
import serial.tools.list_ports
import json

class API:
    def __init__(self):
        self.db = Api()
        self.serial_reader = SerialReader()
        self.window = None
        # Tentar conectar à porta salva automaticamente
        self._conectar_porta_salva_auto()
    
    def _conectar_porta_salva_auto(self):
        """Tenta conectar à porta salva no banco de dados automaticamente"""
        try:
            porta = self.db.carregar_config("porta_com")
            if porta:
                self.connect_serial(f"COM{porta}")
        except Exception:
            pass  # Silenciosamente - o status será atualizado no frontend

    def set_window(self, window):
        self.__window = window
        self.serial_reader.set_frame_callback(self._frame_update_callback)
        # registrar callback de placa
        try:
            self.serial_reader.set_placa_callback(self.__on_placa_detectada)
        except Exception:
            pass
        # registrar callback de OCR (atualizações rápidas para modal de ajuste)
        try:
            def _forward_ocr(dados):
                try:
                    if hasattr(self, '_API__window') and self._API__window:
                        self._API__window.run_js(f"onOcrUpdate({json.dumps(dados)})")
                except Exception:
                    pass

            self.serial_reader.set_ocr_callback(_forward_ocr)
        except Exception:
            pass
        # aplicar configuração de supressão de erros ao SerialReader
        try:
            val = self.db.carregar_config('suppress_errors')
            enabled = str(val) == '1' or str(val).lower() == 'true'
            if getattr(self, 'serial_reader', None):
                try:
                    self.serial_reader.set_suppress_errors(enabled)
                except Exception:
                    pass
        except Exception:
            pass

    def _frame_update_callback(self, display_b64, recognition_b64=None):
        if self.__window is None or getattr(self.__window, 'closed', False):
            return
        try:
            script = (
                f"updateCameraStream({json.dumps('data:image/jpeg;base64,' + display_b64)}"
                + (f", {json.dumps('data:image/jpeg;base64,' + recognition_b64)}" if recognition_b64 else "")
                + ")"
            )
            self.__window.run_js(script)
        except Exception:
            pass

    def __on_placa_detectada(self, placa_text):
        try:
            resultado = self.db.buscar_veiculo_por_placa(placa_text)

            if not resultado:
                # Placa reconhecida mas não cadastrada
                try:
                    print(f"Placa {placa_text} reconhecida, porém não cadastrada. Manter portão fechado!")
                except Exception:
                    pass
                self._processar_placa_nao_cadastrada(placa_text)
                return

            # Placa reconhecida e cadastrada
            try:
                print(f"Placa {placa_text} reconhecida e cadastrada. Abrir portão!")
            except Exception:
                pass

            autorizado = True
            morador = resultado

            payload = {
                "placa": placa_text,
                "autorizado": autorizado,
                "morador": morador
            }

            # envia ao frontend apenas para placas cadastradas
            try:
                if hasattr(self, '_API__window') and self._API__window:
                    self._API__window.run_js(f"onPlacaDetectada({json.dumps(payload)})")
            except Exception:
                pass

            # stub para processo de abertura de portão/cancela
            self.disparar_abertura(placa_text, morador)
        except Exception:
            pass

    # Expor controle de ROI para frontend
    def set_roi(self, x, y, w, h):
        try:
            if self.serial_reader and getattr(self.serial_reader, '_alpr', None):
                self.serial_reader._alpr.set_roi(x, y, w, h)
                return True
        except Exception:
            pass
        return False

    def set_suppress_errors(self, enabled: bool):
        try:
            self.db.salvar_config('suppress_errors', '1' if enabled else '0')
            if getattr(self, 'serial_reader', None):
                try:
                    self.serial_reader.set_suppress_errors(bool(enabled))
                except Exception:
                    pass
            return True
        except Exception:
            return False

    def get_suppress_errors(self):
        try:
            val = self.db.carregar_config('suppress_errors')
            return str(val) == '1' or str(val).lower() == 'true'
        except Exception:
            return False

    def limpar_roi(self):
        try:
            if self.serial_reader and getattr(self.serial_reader, '_alpr', None):
                self.serial_reader._alpr.limpar_roi()
                return True
        except Exception:
            pass
        return False

    def registrar_acesso(self, placa, id_morador, autorizado):
        try:
            return self.db.registrar_acesso(placa, id_morador, autorizado)
        except Exception:
            return False

    def disparar_abertura(self, placa, morador):
        # TODO: implementar modal/processo de abertura real.
        # Atualmente esta função existe apenas como ponto de extensão
        # para quando uma placa cadastrada for reconhecida em monitoramento.
        try:
            print(f"[API] Abrir acesso para placa {placa} - morador {morador}")
        except Exception:
            pass

    def _processar_placa_nao_cadastrada(self, placa_text):
        # placeholder: não faz nada para placas não cadastradas
        return

    def connect_serial(self, port):
        return self.serial_reader.connect(port)

    def conectar_porta(self, porta):
        if self.connect_serial(f"COM{porta}"):
            self.db.salvar_config("porta_com", porta)
            return "Conectado"
        return "Erro"

    def conectar_porta_silencioso(self, porta):
        """Tenta conectar à porta sem retornar erro ou feedback"""
        if porta:
            self.connect_serial(f"COM{porta}")
            self.db.salvar_config("porta_com", porta)

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
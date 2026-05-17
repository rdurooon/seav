import serial
import serial.tools.list_ports
import threading
import time
import base64
import io

try:
    from PIL import Image
except ImportError:
    Image = None

class SerialReader:
    def __init__(self):
        self.serial_conn = None
        self.__on_frame = None
        self.status = "Sem Conexão"
        self.last_frame = None
        self._text_buffer = b''
        self._reading_image = False
        self._image_buffer = b''
        self._last_error_time = 0
        self._error_cooldown = 5  # 5 segundos de cooldown entre logs de erro
        self._last_error = None
        self._connected = False
        self._last_port = None  # Armazena a última porta conectada
        self._desired_port = None  # Porta que queremos conectar / reconectar
        self._last_reconnect_attempt = 0  # Timestamp da última tentativa de reconexão
        self._reconnect_interval = 5  # Tentar reconectar a cada 5 segundos
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def connect(self, port):
        self._desired_port = port
        if self.serial_conn and self.serial_conn.is_open:
            try:
                if self.serial_conn.port == port and self._connected:
                    return True
            except Exception:
                pass
            try:
                self.serial_conn.close()
            except Exception:
                pass
            self.serial_conn = None
            self._connected = False

        try:
            self.serial_conn = serial.Serial(port, 921600, timeout=0.1)
            self._text_buffer = b''
            self._reading_image = False
            self._image_buffer = b''
            self._connected = True
            self._last_port = port  # Guardar a porta para reconexão automática
            # Não alterar o status aqui - aguardar que o ESP32 envie o status real
            return True
        except Exception as e:
            print(f"SerialReader connect erro: {e}")
            self.serial_conn = None
            self.status = "Sem Conexão"
            self._connected = False
            self._last_port = port  # Ainda guardar a porta para tentativas futuras
            return False

    def _is_port_available(self, port):
        try:
            return any(p.device == port for p in serial.tools.list_ports.comports())
        except Exception:
            return False

    def get_status(self):
        return self.status

    def set_frame_callback(self, callback):
        self.__on_frame = callback

    def _read_loop(self):
        while True:
            # Verificar defensivamente se _connected existe
            if not hasattr(self, '_connected'):
                self._connected = False
            
            if self._connected and self.serial_conn:
                try:
                    # Verificar se a porta está realmente aberta
                    if not self.serial_conn.is_open:
                        self._handle_disconnection("Porta fechada")
                        continue
                    
                    data = self.serial_conn.read(4096)
                    if data:
                        self._process_new_data(data)
                except (OSError, PermissionError, serial.SerialException) as e:
                    # Estes erros indicam que a porta foi desconectada fisicamente
                    self._handle_disconnection(f"Erro de porta: {e}")
                except Exception as e:
                    # Evitar spam de erros com cooldown
                    current_time = time.time()
                    error_str = str(e)
                    
                    if error_str != self._last_error or (current_time - self._last_error_time) >= self._error_cooldown:
                        print(f"SerialReader erro: {e}")
                        self._last_error = error_str
                        self._last_error_time = current_time
            else:
                # Se desconectado mas tem uma porta salva, tentar reconectar periodicamente
                if not self._connected and self._last_port:
                    current_time = time.time()
                    if (current_time - self._last_reconnect_attempt) >= self._reconnect_interval:
                        self._last_reconnect_attempt = current_time
                        if self._is_port_available(self._last_port):
                            try:
                                # Tentar reconectar silenciosamente somente se a porta reaparecer
                                self.connect(self._last_port)
                            except Exception:
                                pass
                        else:
                            # Aguardando a porta reaparecer
                            self.status = "Sem Conexão"
            
            time.sleep(0.01)
    
    def _handle_disconnection(self, reason):
        """Trata desconexão da porta serial"""
        self._connected = False
        self.status = "Sem Conexão"
        
        if self.serial_conn:
            try:
                self.serial_conn.close()
            except:
                pass
        
        self.serial_conn = None
        self._text_buffer = b''
        self._reading_image = False
        self._image_buffer = b''

    def _process_new_data(self, data):
        data = self._text_buffer + data
        self._text_buffer = b''

        while data:
            if self._reading_image:
                end_idx = data.find(b'END_IMG')
                if end_idx == -1:
                    self._image_buffer += data
                    return
                self._image_buffer += data[:end_idx]
                self._handle_frame(self._image_buffer)
                self._reading_image = False
                self._image_buffer = b''
                data = data[end_idx + len(b'END_IMG'):]
                continue

            start_idx = data.find(b'START_IMG')
            if start_idx == -1:
                self._text_buffer = self._process_text_lines(data)
                return

            self._text_buffer = self._process_text_lines(data[:start_idx])
            data = data[start_idx + len(b'START_IMG'):]
            self._reading_image = True
            self._image_buffer = b''

    def _process_text_lines(self, data):
        while True:
            newline_idx = data.find(b'\n')
            if newline_idx == -1:
                break
            line = data[:newline_idx]
            self._process_text_line(line)
            data = data[newline_idx + 1:]
        return data

    def _process_text_line(self, line):
        if line.startswith(b'STATUS:'):
            status_text = line.decode('utf-8', errors='ignore').split(':', 1)[1]
            self.status = status_text.strip()

    def _handle_frame(self, img_bytes):
        self.last_frame = img_bytes
        if not img_bytes:
            return
        if not self.__on_frame:
            return
        try:
            if Image is not None:
                try:
                    image = Image.open(io.BytesIO(img_bytes))
                    image = image.rotate(180, expand=True)
                    output = io.BytesIO()
                    image.save(output, format='JPEG')
                    img_bytes = output.getvalue()
                except Exception as image_error:
                    print(f"Pillow failed to rotate image: {image_error}")
            b64 = base64.b64encode(img_bytes).decode('utf-8')
            self.__on_frame(b64)
        except Exception as e:
            print(f"Erro ao atualizar camera: {e}")

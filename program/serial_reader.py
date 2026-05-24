import serial
import serial.tools.list_ports
import threading
import time
import base64

try:
    from ai.alpr_engine import ALPREngine
    import numpy as _np
    import cv2 as _cv2
except Exception as e:
    print(f"[SerialReader] ALPR import failed: {e}")
    ALPREngine = None
    _np = None
    _cv2 = None

# Ajuste fino de orientação da câmera.
# O firmware ESP32 já aplica a correção de orientação no sensor.
# Caso o feed ainda apresente inversão, descomente o valor adequado abaixo.
# -1 = flips both axes (rotate 180 degrees)
#  0 = vertical flip (up/down)
#  1 = horizontal flip (left/right)
CAMERA_ORIENTATION_FIX = None

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
        # ALPR
        self._alpr_error = None
        try:
            if ALPREngine is not None:
                self._alpr = ALPREngine()
            else:
                self._alpr = None
                self._alpr_error = "ALPR dependencies unavailable"
        except Exception as e:
            self._alpr = None
            self._alpr_error = str(e)
            print(f"[SerialReader] ALPREngine init failed: {e}")

        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

        self.__on_placa = None
        self._ultimo_placa_enviada = None
        self.__on_ocr = None
        self._ultimo_ocr_sent = 0
        self._last_ocr_text = None
        self._suppress_errors = False

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
            if not getattr(self, '_suppress_errors', False):
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

    def send_command(self, comando, tempo=5):
        if not self._connected or not self.serial_conn or not self.serial_conn.is_open:
            return False
        try:
            cmd = str(comando).strip().upper()
            if cmd not in ("OPEN", "CLOSE"):
                return False
            tempo_int = int(tempo) if tempo is not None else 5
            if tempo_int < 1:
                tempo_int = 1
            payload = f"{cmd} {tempo_int}\n".encode("utf-8")
            self.serial_conn.write(payload)
            self.serial_conn.flush()
            return True
        except Exception as e:
            if not getattr(self, '_suppress_errors', False):
                print(f"SerialReader send_command error: {e}")
            return False

    def set_frame_callback(self, callback):
        self.__on_frame = callback

    def set_placa_callback(self, callback):
        self.__on_placa = callback

    def set_ocr_callback(self, callback):
        self.__on_ocr = callback

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
            recognition_frame = None
            display_frame = None
            if _np is not None and _cv2 is not None:
                try:
                    arr = _np.frombuffer(img_bytes, _np.uint8)
                    # suprimir mensagens de libjpeg durante decodificação quando configurado
                    if getattr(self, '_suppress_errors', False):
                        @contextmanager
                        def _suppress_stderr():
                            try:
                                devnull = os.open(os.devnull, os.O_RDWR)
                                save_fd = os.dup(2)
                                os.dup2(devnull, 2)
                                os.close(devnull)
                                yield
                            finally:
                                try:
                                    os.dup2(save_fd, 2)
                                    os.close(save_fd)
                                except Exception:
                                    pass
                        with _suppress_stderr():
                            decoded = _cv2.imdecode(arr, _cv2.IMREAD_COLOR)
                    else:
                        decoded = _cv2.imdecode(arr, _cv2.IMREAD_COLOR)
                    if decoded is not None and decoded.size != 0:
                        # Ajuste de orientação: alguns módulos enviam a imagem virada e espelhada
                        if CAMERA_ORIENTATION_FIX is None:
                            recognition_frame = decoded
                        else:
                            recognition_frame = _cv2.flip(decoded, CAMERA_ORIENTATION_FIX)
                        display_frame = _cv2.convertScaleAbs(recognition_frame, alpha=1.05, beta=10)
                except Exception:
                    recognition_frame = None
                    display_frame = None

            if recognition_frame is not None:
                if self._alpr is not None:
                    try:
                        self._alpr.processar_frame(recognition_frame)
                    except Exception:
                        pass

                try:
                    resultado_ocr = None
                    try:
                        resultado_ocr = self._alpr.ocr_thread.obter() if self._alpr else None
                    except Exception:
                        resultado_ocr = None

                    agora = time.time()
                    texto = ''
                    confi = 0.0
                    padrao = ''
                    ts = None

                    if resultado_ocr:
                        texto = getattr(resultado_ocr, 'texto', '') or ''
                        confi = getattr(resultado_ocr, 'confianca', 0.0) or 0.0
                        padrao = getattr(resultado_ocr, 'padrao', '') or ''
                        ts = getattr(resultado_ocr, 'timestamp', None)

                    if self.__on_ocr and (texto != self._last_ocr_text or (agora - self._ultimo_ocr_sent) > 0.25):
                        self._last_ocr_text = texto
                        self._ultimo_ocr_sent = agora
                        try:
                            self.__on_ocr({
                                'texto': texto,
                                'confianca': confi,
                                'padrao': padrao,
                                'timestamp': ts
                            })
                        except Exception:
                            pass

                    # Remover sobreposição de texto OCR no stream (monitoramento limpa)

                    placa = self._alpr.obter_placa() if self._alpr else None
                    if placa and self._alpr.tracker.locked:
                        texto = placa.texto
                        if texto != self._ultimo_placa_enviada:
                            self._ultimo_placa_enviada = texto
                            if self.__on_placa:
                                try:
                                    self.__on_placa(texto)
                                except Exception:
                                    pass
                    if self._alpr is not None and display_frame is not None:
                        try:
                            bbox = self._alpr.tracker.bbox
                            if bbox:
                                x, y, w, h = bbox
                                # Desenha apenas o retângulo indicando onde o tracker está vendo a placa
                                _cv2.rectangle(display_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
                                # Mostrar texto LOCK apenas quando estiver bloqueado
                                if self._alpr.tracker.locked:
                                    try:
                                        _cv2.putText(display_frame, 'LOCKED', (x, max(22, y - 10)), _cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, _cv2.LINE_AA)
                                    except Exception:
                                        pass
                        except Exception:
                            pass
                except Exception:
                    pass

            if display_frame is not None and _cv2 is not None:
                try:
                    _, encoded_display = _cv2.imencode('.jpg', display_frame)
                    _, encoded_recognition = _cv2.imencode('.jpg', recognition_frame) if recognition_frame is not None else (None, None)
                    if encoded_display is not None:
                        b64_display = base64.b64encode(encoded_display.tobytes()).decode('utf-8')
                        b64_recognition = None
                        if encoded_recognition is not None:
                            b64_recognition = base64.b64encode(encoded_recognition.tobytes()).decode('utf-8')
                        self.__on_frame(b64_display, b64_recognition)
                        return
                except Exception:
                    pass

            b64 = base64.b64encode(img_bytes).decode('utf-8')
            self.__on_frame(b64, None)
        except Exception as e:
            if not getattr(self, '_suppress_errors', False):
                print(f"Erro ao atualizar camera: {e}")

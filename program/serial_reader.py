import serial
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
        self.window = None
        self.status = "🚫"
        self.last_frame = None
        self._text_buffer = b''
        self._reading_image = False
        self._image_buffer = b''
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def connect(self, port):
        try:
            self.serial_conn = serial.Serial(port, 921600, timeout=0.1)
            self.status = "❌"
            self._text_buffer = b''
            self._reading_image = False
            self._image_buffer = b''
            return True
        except Exception as e:
            print(f"SerialReader connect erro: {e}")
            self.serial_conn = None
            self.status = "🚫"
            return False

    def get_status(self):
        return self.status

    def _read_loop(self):
        while True:
            if self.serial_conn and self.serial_conn.is_open:
                try:
                    data = self.serial_conn.read(4096)
                    if data:
                        self._process_new_data(data)
                except Exception as e:
                    print(f"SerialReader erro: {e}")
            time.sleep(0.01)

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
        if not self.window:
            return
        if not getattr(self.window.events.shown, 'is_set', lambda: False)():
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
            self.window.run_js(f"updateCameraStream('data:image/jpeg;base64,{b64}')")
        except Exception as e:
            print(f"Erro ao atualizar camera: {e}")

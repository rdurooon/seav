import re
import time
import cv2
import numpy as np
import easyocr

from dataclasses import dataclass
from collections import deque, Counter
from threading import Thread, Lock
from typing import Optional, Tuple

# =========================================================
# CONFIG
# =========================================================

OCR_INTERVALO = 0.08
CONF_MINIMA = 0.22
SCORE_MIN = 0.34
TRACK_IOU_MIN = 0.25
LOCK_FRAMES = 2

REGEX_ANTIGO = re.compile(r'^[A-Z]{3}[0-9]{4}$')
REGEX_MERCOSUL = re.compile(r'^[A-Z]{3}[0-9][A-Z][0-9]{2}$')

NUM_PARA_LETRA = {
    '0': 'O',
    '1': 'I',
    '2': 'Z',
    '3': 'B',
    '4': 'A',
    '5': 'S',
    '6': 'G',
    '7': 'T'
}

LETRA_PARA_NUM = {
    'O': '0',
    'Q': '0',
    'D': '0',
    'I': '1',
    'L': '1',
    'Z': '2',
    'B': '8',
    'A': '4',
    'S': '5',
    'G': '6',
    'T': '7'
}


@dataclass
class Placa:
    texto: str
    confianca: float
    padrao: str
    bbox: Tuple[int, int, int, int]
    timestamp: float


class TrackerPlaca:
    def __init__(self):
        self.locked = False
        self.bbox = None
        self.placa = None
        self.confirmacoes = 0
        self.frames_sem_ver = 0
        self.ultimo_texto = None
        self.ultimo_timestamp = 0

    def reset(self):
        self.locked = False
        self.bbox = None
        self.placa = None
        self.confirmacoes = 0
        self.frames_sem_ver = 0

    def iou(self, a, b):
        xA = max(a[0], b[0])
        yA = max(a[1], b[1])
        xB = min(a[0] + a[2], b[0] + b[2])
        yB = min(a[1] + a[3], b[1] + b[3])
        inter = max(0, xB - xA) * max(0, yB - yA)
        areaA = a[2] * a[3]
        areaB = b[2] * b[3]
        union = areaA + areaB - inter
        if union <= 0:
            return 0
        return inter / union

    def atualizar(self, bbox, placa=None):
        if bbox is None:
            self.frames_sem_ver += 1
            if self.frames_sem_ver > 5:
                self.reset()
            return

        self.frames_sem_ver = 0

        if self.bbox is None:
            self.bbox = bbox
            self.confirmacoes = 1
            return

        iou = self.iou(self.bbox, bbox)

        if iou < 0.08:
            self.reset()
            self.bbox = bbox
            self.confirmacoes = 1
            return

        if iou > TRACK_IOU_MIN:
            self.confirmacoes += 1
            alpha = 0.30
            x = int(self.bbox[0] * (1 - alpha) + bbox[0] * alpha)
            y = int(self.bbox[1] * (1 - alpha) + bbox[1] * alpha)
            w = int(self.bbox[2] * (1 - alpha) + bbox[2] * alpha)
            h = int(self.bbox[3] * (1 - alpha) + bbox[3] * alpha)
            self.bbox = (x, y, w, h)
        else:
            self.confirmacoes = 0
            self.bbox = bbox

        if self.confirmacoes >= LOCK_FRAMES:
            self.locked = True

        if placa:
            agora = time.time()
            if self.ultimo_texto:
                if placa.texto != self.ultimo_texto:
                    self.placa = placa
                    self.ultimo_texto = placa.texto
                    self.ultimo_timestamp = agora
                    return
            self.placa = placa
            self.ultimo_texto = placa.texto
            self.ultimo_timestamp = agora


class ValidadorVisual:
    @staticmethod
    def score(roi):
        if roi is None or roi.size == 0:
            return 0

        h, w = roi.shape[:2]
        ratio = w / (h + 1)

        if ratio < 2.2 or ratio > 5.8:
            return 0

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        contraste = np.std(gray)
        claros = np.mean(gray > 140)
        escuros = np.mean(gray < 80)
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        edge = np.mean(np.abs(sobelx))
        score = (
            contraste * 0.018 +
            claros * 0.30 +
            escuros * 0.20 +
            edge * 0.015
        )
        return float(score)


class PreProcessador:
    @staticmethod
    def upscale(img):
        h = img.shape[0]
        if h < 180:
            scale = 180 / h
            img = cv2.resize(
                img,
                None,
                fx=scale,
                fy=scale,
                interpolation=cv2.INTER_CUBIC
            )
        return img

    @staticmethod
    def processar(roi):
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        gray = PreProcessador.upscale(gray)
        clahe = cv2.createCLAHE(
            clipLimit=3.0,
            tileGridSize=(8, 8)
        )
        gray = clahe.apply(gray)
        blur = cv2.GaussianBlur(
            gray,
            (3, 3),
            0
        )
        sharp = cv2.filter2D(
            blur,
            -1,
            np.array([
                [0, -1, 0],
                [-1, 5, -1],
                [0, -1, 0]
            ])
        )
        _, otsu = cv2.threshold(
            sharp,
            0,
            255,
            cv2.THRESH_BINARY + cv2.THRESH_OTSU
        )
        invert = cv2.bitwise_not(otsu)
        adapt = cv2.adaptiveThreshold(
            sharp,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            12
        )
        return [sharp, otsu, invert, adapt]


class OCREngine:
    def __init__(self):
        self.reader = easyocr.Reader(['en'], gpu=False)
        self.historico = deque(maxlen=5)

    def limpar(self, txt):
        txt = txt.upper()
        txt = txt.replace('-', '')
        txt = txt.replace(' ', '')
        txt = re.sub(r'[^A-Z0-9]', '', txt)
        return txt

    def detectar_modelo(self, roi):
        h, w = roi.shape[:2]
        topo = roi[0:int(h * 0.26), :]
        hsv = cv2.cvtColor(topo, cv2.COLOR_BGR2HSV)
        lower = np.array([90, 50, 50])
        upper = np.array([140, 255, 255])
        mask = cv2.inRange(hsv, lower, upper)
        ratio = cv2.countNonZero(mask) / (w * topo.shape[0])
        if ratio > 0.12:
            return 'MERCOSUL'
        return 'ANTIGO'

    def corrigir_antigo(self, txt):
        chars = list(txt)
        for i in range(3):
            if chars[i].isdigit():
                chars[i] = NUM_PARA_LETRA.get(chars[i], chars[i])
        for i in range(3, 7):
            if chars[i].isalpha():
                chars[i] = LETRA_PARA_NUM.get(chars[i], chars[i])
        return ''.join(chars)

    def corrigir_mercosul(self, txt):
        chars = list(txt)
        mapa = ['L', 'L', 'L', 'N', 'L', 'N', 'N']
        for i, tipo in enumerate(mapa):
            if tipo == 'L':
                if chars[i].isdigit():
                    chars[i] = NUM_PARA_LETRA.get(chars[i], chars[i])
            else:
                if chars[i].isalpha():
                    chars[i] = LETRA_PARA_NUM.get(chars[i], chars[i])
        return ''.join(chars)

    def validar(self, txt):
        if REGEX_ANTIGO.match(txt):
            return 'ANTIGO'
        if REGEX_MERCOSUL.match(txt):
            return 'MERCOSUL'
        return None

    def estabilizar(self, texto):
        if self.historico:
            ultimo = self.historico[-1]
            if len(ultimo) != len(texto):
                self.historico.clear()
            else:
                diferentes = sum(1 for a, b in zip(ultimo, texto) if a != b)
                if diferentes >= 4:
                    self.historico.clear()
        self.historico.append(texto)
        contador = Counter(self.historico)
        return contador.most_common(1)[0][0]

    def rodar(self, roi):
        modelo = self.detectar_modelo(roi)
        variantes = PreProcessador.processar(roi)
        votos = {}
        for img in variantes:
            resultados = self.reader.readtext(
                img,
                detail=1,
                paragraph=False,
                allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                decoder='beamsearch',
                batch_size=1,
                width_ths=0.7,
                contrast_ths=0.02,
                adjust_contrast=0.7
            )
            for _, txt, conf in resultados:
                txt = self.limpar(txt)
                if len(txt) < 7:
                    continue
                txt = txt[:7]
                if modelo == 'ANTIGO':
                    txt = self.corrigir_antigo(txt)
                else:
                    txt = self.corrigir_mercosul(txt)
                padrao = self.validar(txt)
                if not padrao:
                    continue
                bonus = 1.0
                if modelo == padrao:
                    bonus += 0.30
                votos[txt] = votos.get(txt, 0) + (conf * bonus)
        if not votos:
            return None
        melhor_original = max(votos, key=votos.get)
        melhor = self.estabilizar(melhor_original)
        confianca = votos.get(melhor, votos[melhor_original])
        if confianca < CONF_MINIMA:
            return None
        return melhor, confianca, self.validar(melhor)


class OCRThread:
    def __init__(self):
        self.ocr = OCREngine()
        self.fila = deque(maxlen=1)
        self.resultado = None
        self.lock = Lock()
        self.thread = Thread(target=self.loop, daemon=True)
        self.thread.start()

    def enviar(self, roi, bbox):
        self.fila.clear()
        self.fila.append((roi.copy(), bbox))

    def loop(self):
        while True:
            if not self.fila:
                time.sleep(0.005)
                continue
            roi, bbox = self.fila.pop()
            resultado = self.ocr.rodar(roi)
            if resultado:
                texto, conf, padrao = resultado
                placa = Placa(texto, conf, padrao, bbox, time.time())
                with self.lock:
                    self.resultado = placa

    def obter(self):
        with self.lock:
            return self.resultado


class DetectorPlaca:
    def __init__(self):
        self.roi_select = None

    def set_roi(self, roi: Tuple[int, int, int, int]):
        self.roi_select = roi

    def limpar_roi(self):
        self.roi_select = None

    def obter_roi(self, frame: np.ndarray) -> Optional[np.ndarray]:
        if frame is None or frame.size == 0 or self.roi_select is None:
            return None

        rx, ry, rw, rh = self.roi_select
        rx = max(0, rx)
        ry = max(0, ry)
        rw = max(1, rw)
        rh = max(1, rh)

        if rx + rw > frame.shape[1]:
            rw = frame.shape[1] - rx
        if ry + rh > frame.shape[0]:
            rh = frame.shape[0] - ry

        if rw <= 0 or rh <= 0:
            return None

        roi = frame[ry:ry + rh, rx:rx + rw]
        if roi is None or roi.size == 0 or roi.shape[0] < 5 or roi.shape[1] < 5:
            return None
        return roi

    def detectar(self, frame: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        if frame is None or frame.size == 0:
            return None

        frame_proc = frame.copy()
        offset_x = 0
        offset_y = 0

        if self.roi_select:
            rx, ry, rw, rh = self.roi_select
            rx = max(0, rx)
            ry = max(0, ry)
            rw = max(1, rw)
            rh = max(1, rh)
            if rx + rw > frame.shape[1]:
                rw = frame.shape[1] - rx
            if ry + rh > frame.shape[0]:
                rh = frame.shape[0] - ry
            frame_proc = frame[ry:ry + rh, rx:rx + rw]
            if frame_proc is None or frame_proc.size == 0 or frame_proc.shape[0] < 5 or frame_proc.shape[1] < 5:
                return None
            offset_x = rx
            offset_y = ry

        frame_small = cv2.resize(frame_proc, None, fx=0.5, fy=0.5)
        gray = cv2.cvtColor(frame_small, cv2.COLOR_BGR2GRAY)
        blur = cv2.bilateralFilter(gray, 11, 17, 17)
        edges = cv2.Canny(blur, 50, 200)
        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        melhor = None
        melhor_score = 0

        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) != 4:
                continue
            x, y, w, h = cv2.boundingRect(approx)
            ratio = w / (h + 1)
            area = w * h
            if ratio < 2.2 or ratio > 5.8:
                continue
            if area < 1800:
                continue
            x2 = int(x * 2)
            y2 = int(y * 2)
            w2 = int(w * 2)
            h2 = int(h * 2)
            if y2 + h2 > frame_proc.shape[0] or x2 + w2 > frame_proc.shape[1]:
                continue
            roi = frame_proc[y2:y2 + h2, x2:x2 + w2]
            score = ValidadorVisual.score(roi)
            if score < SCORE_MIN:
                continue
            final = score * area
            if final > melhor_score:
                melhor_score = final
                melhor = (x2 + offset_x, y2 + offset_y, w2, h2)

        return melhor


class ALPREngine:
    def __init__(self):
        self.detector = DetectorPlaca()
        self.tracker = TrackerPlaca()
        self.ocr_thread = OCRThread()
        self._ultimo_ocr = 0.0

    def processar_frame(self, frame: np.ndarray):
        if frame is None or frame.size == 0:
            return

        manual_roi = self.detector.obter_roi(frame)
        bbox = self.detector.detectar(frame)
        self.tracker.atualizar(bbox)

        agora = time.time()
        intervalo = OCR_INTERVALO / 2 if self.tracker.locked else OCR_INTERVALO

        if manual_roi is not None and (bbox is None or not self.tracker.locked):
            if agora - self._ultimo_ocr >= intervalo:
                self._ultimo_ocr = agora
                self.ocr_thread.enviar(manual_roi, self.detector.roi_select)

        if self.tracker.bbox:
            x, y, w, h = self.tracker.bbox
            roi = frame[y:y + h, x:x + w]
            if agora - self._ultimo_ocr >= intervalo:
                self._ultimo_ocr = agora
                self.ocr_thread.enviar(roi, self.tracker.bbox)
            placa = self.ocr_thread.obter()
            if placa:
                self.tracker.atualizar(self.tracker.bbox, placa)

    def obter_placa(self) -> Optional[Placa]:
        return self.tracker.placa

    def set_roi(self, x: int, y: int, w: int, h: int):
        self.detector.set_roi((x, y, w, h))

    def limpar_roi(self):
        self.detector.limpar_roi()

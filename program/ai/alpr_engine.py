import os
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
CONF_MINIMA    = 0.15   # ← era 0.22; placas impressas têm confiança menor por baixo contraste
SCORE_MIN      = 0.28   # limiar do ValidadorVisual estrutural (escala 0.0-1.0)
TRACK_IOU_MIN  = 0.20   # ← era 0.25; leve folga para câmera em mão
LOCK_FRAMES    = 2

REGEX_ANTIGO   = re.compile(r'^[A-Z]{3}[0-9]{4}$')
REGEX_MERCOSUL = re.compile(r'^[A-Z]{3}[0-9][A-Z][0-9]{2}$')

NUM_PARA_LETRA = {
    '0': 'O', '1': 'I', '2': 'Z',
    '3': 'B', '4': 'A', '5': 'S',
    '6': 'G', '7': 'T'
}

LETRA_PARA_NUM = {
    'O': '0', 'Q': '0', 'D': '0',
    'I': '1', 'L': '1', 'Z': '2',
    'B': '8', 'A': '4', 'S': '5',
    'G': '6', 'T': '7'
}


@dataclass
class Placa:
    texto:     str
    confianca: float
    padrao:    str
    bbox:      Tuple[int, int, int, int]
    timestamp: float


class TrackerPlaca:
    def __init__(self):
        self.locked          = False
        self.bbox            = None
        self.placa           = None
        self.confirmacoes    = 0
        self.frames_sem_ver  = 0
        self.ultimo_texto    = None
        self.ultimo_timestamp = 0

    def reset(self):
        self.locked         = False
        self.bbox           = None
        self.placa          = None
        self.confirmacoes   = 0
        self.frames_sem_ver = 0

    def iou(self, a, b):
        xA = max(a[0], b[0]); yA = max(a[1], b[1])
        xB = min(a[0]+a[2], b[0]+b[2]); yB = min(a[1]+a[3], b[1]+b[3])
        inter = max(0, xB-xA) * max(0, yB-yA)
        union = a[2]*a[3] + b[2]*b[3] - inter
        return inter/union if union > 0 else 0

    def atualizar(self, bbox, placa=None):
        if bbox is None:
            self.frames_sem_ver += 1
            if self.frames_sem_ver > 5:
                self.reset()
            return

        self.frames_sem_ver = 0

        if self.bbox is None:
            self.bbox         = bbox
            self.confirmacoes = 1
            return

        iou = self.iou(self.bbox, bbox)

        if iou < 0.08:
            self.reset()
            self.bbox         = bbox
            self.confirmacoes = 1
            return

        if iou > TRACK_IOU_MIN:
            self.confirmacoes += 1
            alpha = 0.30
            x = int(self.bbox[0]*(1-alpha) + bbox[0]*alpha)
            y = int(self.bbox[1]*(1-alpha) + bbox[1]*alpha)
            w = int(self.bbox[2]*(1-alpha) + bbox[2]*alpha)
            h = int(self.bbox[3]*(1-alpha) + bbox[3]*alpha)
            self.bbox = (x, y, w, h)
        else:
            self.confirmacoes = 0
            self.bbox         = bbox

        if self.confirmacoes >= LOCK_FRAMES:
            self.locked = True

        if placa:
            agora = time.time()
            if self.ultimo_texto and placa.texto != self.ultimo_texto:
                self.placa            = placa
                self.ultimo_texto     = placa.texto
                self.ultimo_timestamp = agora
                return
            self.placa            = placa
            self.ultimo_texto     = placa.texto
            self.ultimo_timestamp = agora


class PerfilAdaptativo:
    """
    Mantém um perfil EMA independente para cada tipo de placa ('MERCOSUL' e
    'ANTIGO'), evitando que o aprendizado de um tipo contamine o outro.

    Estrutura interna por tipo:
        n_amostras : int
        media_ema  : {feature: float}
        var_ema    : {feature: float}
        threshold  : float

    O JSON salvo tem a forma:
        {
          "MERCOSUL": { "n_amostras": N, "media": {...}, "var": {...}, "threshold": T },
          "ANTIGO":   { "n_amostras": N, "media": {...}, "var": {...}, "threshold": T }
        }
    """

    TIPOS          = ("MERCOSUL", "ANTIGO")
    FEATURES       = ("fundo", "bordas", "contraste", "colunas")
    MIN_AMOSTRAS   = 8      # confirmações mínimas por tipo para ativar aquele perfil
    ALPHA_EMA      = 0.15   # taxa de aprendizado
    MARGEM_DESVIO  = 1.2    # threshold = media_score - MARGEM * desvio_score

    def __init__(self):
        self._lock    = Lock()
        self._arquivo = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                     "alpr_perfil.json")
        # Estado interno: um sub-dict por tipo
        self._estado = {
            tipo: {
                "n_amostras": 0,
                "media_ema":  {f: 0.0  for f in self.FEATURES},
                "var_ema":    {f: 0.04 for f in self.FEATURES},
                "threshold":  SCORE_MIN,
            }
            for tipo in self.TIPOS
        }
        self._carregar()

    # ── Persistência ──────────────────────────────────────────────────────────

    def _carregar(self):
        import json
        if not os.path.exists(self._arquivo):
            self._salvar()   # cria arquivo vazio; adicione ao .gitignore
            return
        try:
            with open(self._arquivo, "r") as f:
                dados = json.load(f)
            for tipo in self.TIPOS:
                if tipo not in dados:
                    continue
                d = dados[tipo]
                e = self._estado[tipo]
                e["n_amostras"] = int(d.get("n_amostras", 0))
                e["threshold"]  = float(d.get("threshold", SCORE_MIN))
                for f in self.FEATURES:
                    e["media_ema"][f] = float(d.get("media", {}).get(f, 0.0))
                    e["var_ema"][f]   = float(d.get("var",   {}).get(f, 0.04))
        except (KeyError, ValueError, json.JSONDecodeError):
            pass   # corrompido — mantém defaults

    def _salvar(self):
        import json
        dados = {}
        for tipo in self.TIPOS:
            e = self._estado[tipo]
            dados[tipo] = {
                "n_amostras": e["n_amostras"],
                "media":      e["media_ema"],
                "var":        e["var_ema"],
                "threshold":  e["threshold"],
            }
        try:
            with open(self._arquivo, "w") as f:
                json.dump(dados, f, indent=2)
        except OSError:
            pass

    # ── Extração de features ──────────────────────────────────────────────────

    @staticmethod
    def extrair(roi: np.ndarray) -> Optional[dict]:
        """Extrai o vetor de features de uma ROI. Retorna None se inválida."""
        if roi is None or roi.size == 0:
            return None
        h, w = roi.shape[:2]
        if w == 0 or h == 0:
            return None
        gray      = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        gray_norm = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.float32)
        return {
            "fundo":     ValidadorVisual._fundo_homogeneo(gray_norm),
            "bordas":    ValidadorVisual._bordas_na_faixa_central(gray_norm),
            "contraste": ValidadorVisual._contraste_texto(gray_norm),
            "colunas":   min(1.0, ValidadorVisual._colunas_de_caractere(gray_norm) / 8.0),
        }

    # ── Atualização ───────────────────────────────────────────────────────────

    def confirmar(self, roi: np.ndarray, tipo: str):
        """
        Atualiza o perfil EMA do tipo informado ('MERCOSUL' ou 'ANTIGO')
        com as features da ROI confirmada pelo OCR.
        """
        if tipo not in self.TIPOS:
            return
        features = self.extrair(roi)
        if features is None:
            return

        with self._lock:
            e = self._estado[tipo]
            e["n_amostras"] += 1
            a = self.ALPHA_EMA

            for k in self.FEATURES:
                v     = features[k]
                m_ant = e["media_ema"][k]
                e["media_ema"][k] = (1 - a) * m_ant + a * v
                e["var_ema"][k]   = (1 - a) * e["var_ema"][k] + a * (v - m_ant) ** 2

            if e["n_amostras"] >= self.MIN_AMOSTRAS:
                self._recalcular_threshold(tipo)

            # Salva a cada 10 confirmações (por tipo) para não thrashear disco
            if e["n_amostras"] % 10 == 0:
                self._salvar()

    def _recalcular_threshold(self, tipo: str):
        pesos = {"fundo": 0.35, "bordas": 0.30, "contraste": 0.25, "colunas": 0.10}
        e = self._estado[tipo]
        score_medio  = sum(e["media_ema"][k] * pesos[k] for k in self.FEATURES)
        desvio_medio = sum(e["var_ema"][k] ** 0.5 * pesos[k] for k in self.FEATURES)
        adaptativo   = score_medio - self.MARGEM_DESVIO * desvio_medio
        e["threshold"] = float(max(0.15, min(SCORE_MIN, adaptativo)))

    # ── Consulta ──────────────────────────────────────────────────────────────

    def ativo(self, tipo: str) -> bool:
        """True se o perfil daquele tipo já tem amostras suficientes."""
        return self._estado.get(tipo, {}).get("n_amostras", 0) >= self.MIN_AMOSTRAS

    def threshold_ativo(self, tipo: str) -> float:
        """Threshold atual para o tipo informado (fixo ou adaptativo)."""
        with self._lock:
            return self._estado.get(tipo, {}).get("threshold", SCORE_MIN)

    def similaridade(self, features: dict, tipo: str) -> float:
        """
        Quão parecida a ROI candidata é com o perfil aprendido do tipo.
        Retorna 0.0–1.0; 0.5 quando o perfil ainda não está ativo.
        """
        if not self.ativo(tipo):
            return 0.5
        with self._lock:
            e = self._estado[tipo]
            dists = []
            for k in self.FEATURES:
                desvio = max(0.01, e["var_ema"][k] ** 0.5)
                dists.append(abs(features[k] - e["media_ema"][k]) / desvio)
            return float(max(0.0, 1.0 - min(1.0, sum(dists) / len(dists) / 2.0)))

    def resumo(self) -> str:
        """Texto legível para debug/log."""
        partes = []
        for tipo in self.TIPOS:
            e      = self._estado[tipo]
            n      = e["n_amostras"]
            status = "ATIVO" if n >= self.MIN_AMOSTRAS else f"{n}/{self.MIN_AMOSTRAS}"
            partes.append(f"{tipo}[{status} thr={e['threshold']:.3f}]")
        return "PerfilAdaptativo " + " | ".join(partes)


class ValidadorVisual:
    """
    Score composto de 4 componentes independentes.
    Cada componente retorna 0.0–1.0 e tem peso distinto no score final.
    Um candidato precisa passar em TODOS os gates antes de receber score > 0.
    """

    # ── Gates de eliminação rápida ────────────────────────────────────────────
    RATIO_MIN   = 2.1   # proporção largura/altura mínima
    RATIO_MAX   = 6.0   # proporção largura/altura máxima
    MIN_COLUNAS = 5     # mínimo de "colunas de caractere" detectadas

    @staticmethod
    def _fundo_homogeneo(gray_norm: np.ndarray) -> float:
        """
        Placas têm um fundo claro e uniforme.
        Avalia se existe uma região de fundo (pixels > 140) que cobre ao menos
        30 % da área E tem baixo desvio padrão local (ou seja, é uniforme).

        Sombras e pedaços de cena costumam ter fundo heterogêneo ou escuro.
        Retorna 0.0–1.0.
        """
        fundo_mask = gray_norm > 140
        cobertura  = np.mean(fundo_mask)
        if cobertura < 0.28:          # menos de 28 % de pixels claros → não é placa
            return 0.0

        # Desvio padrão apenas na região de fundo: quanto menor, mais uniforme
        if fundo_mask.sum() == 0:
            return 0.0
        std_fundo = float(np.std(gray_norm[fundo_mask]))
        uniformidade = max(0.0, 1.0 - std_fundo / 60.0)
        return float(cobertura * uniformidade)

    @staticmethod
    def _bordas_na_faixa_central(gray_norm: np.ndarray) -> float:
        """
        Caracteres de placa estão sempre na faixa central vertical (≈20–80 % da altura).
        Calcula a razão entre bordas verticais (Sobel-X) nessa faixa versus
        o total de bordas — se a maioria estiver fora da faixa, não é placa inteira.
        Retorna 0.0–1.0.
        """
        h, w      = gray_norm.shape
        y0        = int(h * 0.20)
        y1        = int(h * 0.82)
        sobelx    = np.abs(cv2.Sobel(gray_norm, cv2.CV_64F, 1, 0, ksize=3))
        total_borda = sobelx.sum()
        if total_borda < 1:
            return 0.0
        borda_central = sobelx[y0:y1, :].sum()
        return float(min(1.0, borda_central / total_borda + 0.05))

    @staticmethod
    def _colunas_de_caractere(gray_norm: np.ndarray) -> int:
        """
        Conta quantas 'colunas de caractere' existem projetando o perfil vertical
        de pixels escuros (< 90) ao longo da largura.
        Uma placa com 7 caracteres deve ter ≥ 5 picos no perfil.
        Retorna o número de picos encontrados.
        """
        perfil    = np.mean(gray_norm < 90, axis=0)   # fração de pixels escuros por coluna
        # suaviza para remover ruído de borda
        kernel    = np.ones(max(1, gray_norm.shape[1] // 40)) / max(1, gray_norm.shape[1] // 40)
        perfil_sm = np.convolve(perfil, kernel, mode='same')
        threshold = perfil_sm.mean() + perfil_sm.std() * 0.5
        acima     = perfil_sm > threshold
        # conta transições False→True (início de pico)
        picos = int(np.sum(np.diff(acima.astype(int)) == 1))
        return picos

    @staticmethod
    def _contraste_texto(gray_norm: np.ndarray) -> float:
        """
        Mede o contraste entre pixels escuros (texto) e claros (fundo).
        Retorna 0.0–1.0; valores baixos indicam sombra ou região uniforme.
        """
        escuros = gray_norm[gray_norm < 90]
        claros  = gray_norm[gray_norm > 140]
        if len(escuros) < 10 or len(claros) < 10:
            return 0.0
        delta = float(np.mean(claros) - np.mean(escuros))
        return float(min(1.0, delta / 160.0))

    @staticmethod
    def score(roi, perfil: 'PerfilAdaptativo' = None, tipo: str = None) -> float:
        if roi is None or roi.size == 0:
            return 0.0

        h, w = roi.shape[:2]
        ratio = w / (h + 1)

        # Gate 1 — proporção
        if ratio < ValidadorVisual.RATIO_MIN or ratio > ValidadorVisual.RATIO_MAX:
            return 0.0

        gray      = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        gray_norm = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.float32)

        # Gate 2 — contagem mínima de colunas de caractere
        n_colunas = ValidadorVisual._colunas_de_caractere(gray_norm)
        if n_colunas < ValidadorVisual.MIN_COLUNAS:
            return 0.0

        # Componentes ponderados
        s_fundo     = ValidadorVisual._fundo_homogeneo(gray_norm)
        s_bordas    = ValidadorVisual._bordas_na_faixa_central(gray_norm)
        s_contraste = ValidadorVisual._contraste_texto(gray_norm)
        s_colunas   = min(1.0, n_colunas / 8.0)

        # Gate 3 — fundo mínimo (elimina sombras sem região clara)
        if s_fundo < 0.10:
            return 0.0

        score_base = (
            s_fundo     * 0.35 +
            s_bordas    * 0.30 +
            s_contraste * 0.25 +
            s_colunas   * 0.10
        )

        # ── Bônus adaptativo por tipo ─────────────────────────────────────────
        # Compara a ROI com o perfil aprendido especificamente para o tipo
        # detectado (MERCOSUL ou ANTIGO). Uma sombra não se parece com nenhum
        # dos dois tipos, então não recebe bônus em nenhum perfil.
        if perfil is not None and tipo is not None and perfil.ativo(tipo):
            features     = {"fundo": s_fundo, "bordas": s_bordas,
                            "contraste": s_contraste, "colunas": s_colunas}
            similaridade = perfil.similaridade(features, tipo)
            score_base   = score_base * (1.0 + 0.20 * similaridade)

        return float(score_base)


class PreProcessador:
    @staticmethod
    def upscale(img):
        h = img.shape[0]
        if h < 180:
            scale = 180 / h
            img = cv2.resize(img, None, fx=scale, fy=scale,
                             interpolation=cv2.INTER_CUBIC)
        return img

    @staticmethod
    def processar(roi):
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        # ── Correção de iluminação antes de tudo ─────────────────────────────
        # Placas impressas em ambiente escuro ficam sub-expostas;
        # equalizar o histograma globalmente ajuda o OCR a ver os caracteres.
        gray = cv2.equalizeHist(gray)          # ← NOVO: equalização global

        gray = PreProcessador.upscale(gray)

        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        # ← era clipLimit=3.0; mais agressivo para recuperar detalhe em impressão escura
        gray = clahe.apply(gray)

        blur  = cv2.GaussianBlur(gray, (3, 3), 0)
        sharp = cv2.filter2D(blur, -1,
                             np.array([[0, -1, 0],
                                       [-1, 5, -1],
                                       [0, -1, 0]]))

        _, otsu = cv2.threshold(sharp, 0, 255,
                                cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        invert  = cv2.bitwise_not(otsu)

        adapt = cv2.adaptiveThreshold(sharp, 255,
                                      cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                      cv2.THRESH_BINARY, 31, 12)

        # ── Variante extra: threshold adaptativo invertido ────────────────────
        # Placas impressas frequentemente têm fundo claro e texto escuro,
        # mas dependendo da impressora o contraste inverte — ter os dois ajuda.
        adapt_inv = cv2.bitwise_not(adapt)     # ← NOVO

        return [sharp, otsu, invert, adapt, adapt_inv]


class OCREngine:
    def __init__(self):
        self.reader    = easyocr.Reader(['en'], gpu=False)
        self.historico = deque(maxlen=5)

    def limpar(self, txt):
        txt = txt.upper().replace('-', '').replace(' ', '')
        txt = re.sub(r'[^A-Z0-9]', '', txt)
        return txt

    @staticmethod
    def _detectar_modelo_estatico(roi) -> str:
        """
        Detecta o tipo da placa numa ROI sem precisar de instância.
        Usado pelo DetectorPlaca antes do OCR para escolher o perfil correto.
        """
        h, w  = roi.shape[:2]
        topo  = roi[0:int(h * 0.26), :]

        # Tentativa 1: faixa azul por HSV
        hsv       = cv2.cvtColor(topo, cv2.COLOR_BGR2HSV)
        mask      = cv2.inRange(hsv, np.array([90, 30, 30]), np.array([140, 255, 255]))
        ratio_hsv = cv2.countNonZero(mask) / max(1, w * topo.shape[0])
        if ratio_hsv > 0.08:
            return 'MERCOSUL'

        # Tentativa 2: topo claramente mais escuro que o corpo (faixa desbotada)
        media_topo  = np.mean(cv2.cvtColor(topo, cv2.COLOR_BGR2GRAY))
        media_resto = np.mean(cv2.cvtColor(roi[int(h*0.26):, :], cv2.COLOR_BGR2GRAY))
        if media_topo < media_resto * 0.78:
            return 'MERCOSUL'

        return 'ANTIGO'

    def detectar_modelo(self, roi) -> str:
        """Wrapper de instância — delega ao método estático."""
        return OCREngine._detectar_modelo_estatico(roi)

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
        mapa  = ['L', 'L', 'L', 'N', 'L', 'N', 'N']
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
        modelo   = self.detectar_modelo(roi)
        variantes = PreProcessador.processar(roi)
        votos    = {}

        for img in variantes:
            resultados = self.reader.readtext(
                img,
                detail=1,
                paragraph=False,
                allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                decoder='beamsearch',
                batch_size=1,
                width_ths=0.7,
                contrast_ths=0.01,   # ← era 0.02; aceita regiões de baixo contraste (impressão)
                adjust_contrast=0.8, # ← era 0.7; EasyOCR ajusta mais o contraste internamente
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
        melhor          = self.estabilizar(melhor_original)
        confianca       = votos.get(melhor, votos[melhor_original])

        if confianca < CONF_MINIMA:
            return None

        return melhor, confianca, self.validar(melhor)


class OCRThread:
    def __init__(self):
        self.ocr       = OCREngine()
        self.fila      = deque(maxlen=1)
        self.resultado = None
        self.lock      = Lock()
        self.thread    = Thread(target=self.loop, daemon=True)
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
    def __init__(self, perfil: 'PerfilAdaptativo' = None):
        self.roi_select = None
        self.perfil     = perfil   # recebe referência ao perfil compartilhado

    def set_roi(self, roi: Tuple[int, int, int, int]):
        self.roi_select = roi

    def limpar_roi(self):
        self.roi_select = None

    def obter_roi(self, frame: np.ndarray) -> Optional[np.ndarray]:
        if frame is None or frame.size == 0 or self.roi_select is None:
            return None
        rx, ry, rw, rh = self.roi_select
        rx, ry = max(0, rx), max(0, ry)
        rw, rh = max(1, rw), max(1, rh)
        if rx+rw > frame.shape[1]: rw = frame.shape[1]-rx
        if ry+rh > frame.shape[0]: rh = frame.shape[0]-ry
        if rw <= 0 or rh <= 0:
            return None
        roi = frame[ry:ry+rh, rx:rx+rw]
        if roi is None or roi.size == 0 or roi.shape[0] < 5 or roi.shape[1] < 5:
            return None
        return roi

    def detectar(self, frame: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        if frame is None or frame.size == 0:
            return None

        frame_proc = frame.copy()
        offset_x = offset_y = 0

        if self.roi_select:
            rx, ry, rw, rh = self.roi_select
            rx, ry = max(0, rx), max(0, ry)
            rw, rh = max(1, rw), max(1, rh)
            if rx+rw > frame.shape[1]: rw = frame.shape[1]-rx
            if ry+rh > frame.shape[0]: rh = frame.shape[0]-ry
            frame_proc = frame[ry:ry+rh, rx:rx+rw]
            if frame_proc is None or frame_proc.size == 0 or \
               frame_proc.shape[0] < 5 or frame_proc.shape[1] < 5:
                return None
            offset_x, offset_y = rx, ry

        frame_small = cv2.resize(frame_proc, None, fx=0.5, fy=0.5)
        gray        = cv2.cvtColor(frame_small, cv2.COLOR_BGR2GRAY)

        # ── Pré-processamento extra para detectar contornos em placas impressas ──
        # Equaliza antes de detectar bordas; melhora contraste em imagens escuras
        gray = cv2.equalizeHist(gray)                          # ← NOVO

        blur  = cv2.bilateralFilter(gray, 11, 17, 17)
        edges = cv2.Canny(blur, 30, 180)                       # ← era (50,200); limiares mais baixos
                                                               #   capturam bordas menos nítidas

        contours, _ = cv2.findContours(edges, cv2.RETR_TREE,
                                       cv2.CHAIN_APPROX_SIMPLE)

        melhor       = None
        melhor_score = 0

        for c in contours:
            peri  = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)

            # Aceita 4-6 vértices: perspectiva leve de câmera em mão pode gerar 5 pontos
            if len(approx) not in (4, 5, 6):
                continue

            x, y, w, h = cv2.boundingRect(approx)
            ratio = w / (h + 1)
            area  = w * h

            if ratio < 2.1 or ratio > 6.0:   # alinhado com ValidadorVisual.RATIO_MIN/MAX
                continue
            if area < 1200:                   # restaurado: evita fragmentos minúsculos
                continue

            x2, y2 = int(x*2), int(y*2)
            w2, h2 = int(w*2), int(h*2)

            if y2+h2 > frame_proc.shape[0] or x2+w2 > frame_proc.shape[1]:
                continue

            roi   = frame_proc[y2:y2+h2, x2:x2+w2]
            # Detecta o tipo da ROI candidata para usar o perfil correto no score
            tipo_roi = OCREngine._detectar_modelo_estatico(roi)
            score    = ValidadorVisual.score(roi, self.perfil, tipo_roi)

            if score < SCORE_MIN:
                continue

            final = score * area
            if final > melhor_score:
                melhor_score = final
                melhor       = (x2+offset_x, y2+offset_y, w2, h2)

        return melhor


class ALPREngine:
    def __init__(self):
        self.perfil      = PerfilAdaptativo()
        self.detector    = DetectorPlaca(perfil=self.perfil)
        self.tracker     = TrackerPlaca()
        self.ocr_thread  = OCRThread()
        self._ultimo_ocr = 0.0
        self._ultima_confirmacao: Optional[str] = None  # evita confirmar a mesma placa em loop

    def processar_frame(self, frame: np.ndarray):
        if frame is None or frame.size == 0:
            return

        manual_roi = self.detector.obter_roi(frame)
        bbox       = self.detector.detectar(frame)
        self.tracker.atualizar(bbox)

        agora     = time.time()
        intervalo = OCR_INTERVALO / 2 if self.tracker.locked else OCR_INTERVALO

        if manual_roi is not None and (bbox is None or not self.tracker.locked):
            if agora - self._ultimo_ocr >= intervalo:
                self._ultimo_ocr = agora
                self.ocr_thread.enviar(manual_roi, self.detector.roi_select)

        if self.tracker.bbox:
            x, y, w, h = self.tracker.bbox
            roi = frame[y:y+h, x:x+w]
            if agora - self._ultimo_ocr >= intervalo:
                self._ultimo_ocr = agora
                self.ocr_thread.enviar(roi, self.tracker.bbox)
            placa = self.ocr_thread.obter()
            if placa:
                self.tracker.atualizar(self.tracker.bbox, placa)

                # ── Aprendizado adaptativo por tipo ───────────────────────────
                # Alimenta apenas o perfil do tipo que o OCR identificou
                # (MERCOSUL ou ANTIGO), mantendo os dois perfis independentes.
                if placa.texto != self._ultima_confirmacao:
                    self._ultima_confirmacao = placa.texto
                    if roi is not None and roi.size > 0:
                        self.perfil.confirmar(roi, placa.padrao)

    def obter_placa(self) -> Optional[Placa]:
        return self.tracker.placa

    def obter_status_perfil(self) -> str:
        """Retorna texto de debug com o estado atual do perfil adaptativo."""
        return self.perfil.resumo()

    def set_roi(self, x: int, y: int, w: int, h: int):
        self.detector.set_roi((x, y, w, h))

    def limpar_roi(self):
        self.detector.limpar_roi()
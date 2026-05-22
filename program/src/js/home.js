// ═══════════════════════════════════════
// NAVEGAÇÃO
// ═══════════════════════════════════════
async function navegarPara(pagina) {
  const resposta = await fetch(`pages/${pagina}.html`);
  const html = await resposta.text();
  document.getElementById("content").innerHTML = html;

  const btnVoltar = document.getElementById("btn-voltar");
  btnVoltar.style.display = pagina === "menu" ? "none" : "block";

  iniciarRelogio();
  atualizarStatus();

  const paginasComJS = ["gestao", "monitoramento", "historico"];

  if (paginasComJS.includes(pagina)) {
    const script = document.createElement("script");
    script.src = `js/${pagina}.js`;
    document.body.appendChild(script);

    if (pagina === "gestao") {
      script.onload = () => carregarVeiculos();
    }
  }
}

// ═══════════════════════════════════════
// RELÓGIO
// ═══════════════════════════════════════
function iniciarRelogio() {
  const el = document.getElementById("relogio");
  if (!el) return;

  if (window._relogioInterval) clearInterval(window._relogioInterval);

  function atualizar() {
    const agora = new Date();
    const data = agora.toLocaleDateString("pt-BR");
    const hora = agora.toLocaleTimeString("pt-BR");
    el.textContent = `${data} - ${hora}`;
  }

  atualizar();
  window._relogioInterval = setInterval(atualizar, 1000);
}

// ═══════════════════════════════════════
// STATUS DO SISTEMA
// ═══════════════════════════════════════
function atualizarStatus() {
  try {
    pywebview.api
      .get_status()
      .then((status) => {
        const el = document.getElementById("status-sistema");
        if (el) el.textContent = `Status do sistema: ${status}`;
      })
      .catch(() => {});
  } catch (e) {}
}

// ═══════════════════════════════════════
// MODAIS — SISTEMA DE CLASSES
// ═══════════════════════════════════════
function abrirModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("ativo");
}

function fecharModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("ativo");
}

// ═══════════════════════════════════════
// MODAL INFO
// ═══════════════════════════════════════
function abrirInfo() {
  abrirModal("modal-info");
}

function fecharInfo() {
  fecharModal("modal-info");
}

// ═══════════════════════════════════════
// MODAL CONFIG
// ═══════════════════════════════════════
function abrirConfig() {
  try {
    pywebview.api
      .carregar_porta()
      .then((porta) => {
        if (porta) document.getElementById("porta-com").value = porta;
      })
      .catch(() => {});
  } catch (e) {}

  try {
    pywebview.api
      .get_suppress_errors()
      .then((val) => {
        const el = document.getElementById("suppress-errors-toggle");
        if (el) el.checked = !!val;
      })
      .catch(() => {});
  } catch (e) {}

  abrirModal("modal-config");
}

function fecharConfig() {
  fecharModal("modal-config");
}

function salvarConfig() {
  const porta = document.getElementById("porta-com").value;
  if (!porta || porta < 1 || porta > 99) {
    alert("Digite uma porta válida!");
    return;
  }
  try {
    pywebview.api.conectar_porta_silencioso(porta);
  } catch (e) {}
  try {
    const sup = !!document.getElementById("suppress-errors-toggle").checked;
    pywebview.api.set_suppress_errors(sup).catch(() => {});
  } catch (e) {}
  fecharConfig();
}

async function autodetectarPorta() {
  try {
    const portas = await window.pywebview.api.detectar_portas();
    if (portas.length === 0) {
      alert("Nenhuma porta serial detectada!");
      return;
    }
    const portaDetectada = portas[0].replace("COM", "");
    document.getElementById("porta-com").value = portaDetectada;
    alert(`Porta detectada: COM${portaDetectada}`);
  } catch (error) {
    alert("Erro ao detectar portas: " + error);
  }
}

// ═══════════════════════════════════════
// MODAL AJUSTE
// ═══════════════════════════════════════
function abrirModalAjuste() {
  fecharConfig();
  const modal = document.getElementById("modal-ajuste");
  if (!modal) return;
  modal.style.display = "flex";
  if (typeof setupModalCanvas === "function") {
    setupModalCanvas();
  }
}

function fecharModalAjuste() {
  const modal = document.getElementById("modal-ajuste");
  if (!modal) return;
  modal.style.display = "none";
}

// ═══════════════════════════════════════
// CÂMERA
// ═══════════════════════════════════════
const CAMERA_TIMEOUT_MS = 5000;
let cameraTimeoutId = null;
let lastFrameBase64 = null;
window.currentROI = null;

function setCameraPlaceholder(visible) {
  const placeholder = document.getElementById("camera-placeholder");
  if (!placeholder) return;
  placeholder.classList.toggle("hidden", !visible);
}

function clearCanvasROI(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawROIOnCanvas(canvas, color, lineWidth) {
  if (!canvas || !window.currentROI) return;
  const ctx = canvas.getContext("2d");
  clearCanvasROI(canvas);
  const rect = window.currentROI;
  const img = canvas.previousElementSibling;
  if (!img) return;
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const dispW = img.clientWidth;
  const dispH = img.clientHeight;
  const scaleX = dispW / (naturalW || 1);
  const scaleY = dispH / (naturalH || 1);
  const x = rect.x * scaleX;
  const y = rect.y * scaleY;
  const w = rect.w * scaleX;
  const h = rect.h * scaleY;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);
}

function drawROIOnAll() {
  drawROIOnCanvas(
    document.getElementById("camera-canvas-modal"),
    "rgba(220,30,30,0.95)",
    4,
  );
}

function updateLocalROI(x, y, w, h) {
  window.currentROI = { x, y, w, h };
  drawROIOnAll();
}

function clearLocalROI() {
  window.currentROI = null;
  clearCanvasROI(document.getElementById("camera-canvas"));
  clearCanvasROI(document.getElementById("camera-canvas-modal"));
}

function setupModalCanvas() {
  const img = document.getElementById("camera-stream-modal");
  const canvas = document.getElementById("camera-canvas-modal");
  if (!img || !canvas) return;

  function resizeCanvas() {
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    canvas.style.left = img.offsetLeft + "px";
    canvas.style.top = img.offsetTop + "px";
    drawROIOnCanvas(canvas, "rgba(220,30,30,0.95)", 4);
  }

  if (img.complete) resizeCanvas();
  img.addEventListener("load", resizeCanvas);
  window.addEventListener("resize", resizeCanvas);

  let drawing = false;
  let startX = 0;
  let startY = 0;

  canvas.onmousedown = (e) => {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
  };

  canvas.onmousemove = (e) => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (window.currentROI) drawROIOnCanvas(canvas, "rgba(220,30,30,0.95)", 4);
    if (!drawing) return;
    const x = Math.min(startX, e.offsetX);
    const y = Math.min(startY, e.offsetY);
    const w = Math.abs(e.offsetX - startX);
    const h = Math.abs(e.offsetY - startY);
    ctx.strokeStyle = "rgba(220,30,30,0.95)";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  };

  canvas.onmouseup = (e) => {
    drawing = false;
    const endX = e.offsetX;
    const endY = e.offsetY;
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    const dispW = img.clientWidth;
    const dispH = img.clientHeight;
    const scaleX = naturalW / (dispW || naturalW);
    const scaleY = naturalH / (dispH || naturalH);
    const rx = Math.round(x * scaleX);
    const ry = Math.round(y * scaleY);
    const rw = Math.round(w * scaleX);
    const rh = Math.round(h * scaleY);
    updateLocalROI(rx, ry, rw, rh);
    try {
      pywebview.api.set_roi(rx, ry, rw, rh);
    } catch (e) {}
  };

  canvas.ondblclick = () => {
    clearLocalROI();
    try {
      pywebview.api.limpar_roi();
    } catch (e) {}
  };
}

function setBackgroundImage(base64Data) {
  const stream = document.getElementById("camera-stream");
  if (!stream) return;
  if (base64Data) {
    stream.style.backgroundImage = `url('${base64Data}')`;
    stream.style.backgroundSize = "cover";
    stream.style.backgroundPosition = "center";
    stream.src = "";
  } else {
    stream.style.backgroundImage = "none";
    stream.src = "";
  }
}

function resetCameraTimeout() {
  if (cameraTimeoutId) clearTimeout(cameraTimeoutId);
  cameraTimeoutId = setTimeout(() => {
    setCameraPlaceholder(true);
    if (lastFrameBase64) setBackgroundImage(lastFrameBase64);
  }, CAMERA_TIMEOUT_MS);
}

function updateCameraStream(base64Data, recognitionBase64 = null) {
  const stream = document.getElementById("camera-stream");
  if (stream) {
    lastFrameBase64 = base64Data;
    stream.src = base64Data;
    stream.style.backgroundImage = "none";
    setCameraPlaceholder(false);
    resetCameraTimeout();
  }
  const modalStream = document.getElementById("camera-stream-modal");
  if (modalStream) modalStream.src = recognitionBase64 || base64Data;
  drawROIOnAll();
}

// ═══════════════════════════════════════
// OCR E PLACA DETECTADA
// ═══════════════════════════════════════
function onOcrUpdate(dados) {
  try {
    const obj = typeof dados === "string" ? JSON.parse(dados) : dados;
    const text = obj.texto || "";
    const conf = Number(obj.confianca || 0);
    const pad = obj.padrao || "";
    const textEl = document.getElementById("ocr-text");
    if (textEl) {
      textEl.textContent = text
        ? `Placa: ${text} | Modelo: ${pad} | Confiança: ${conf.toFixed(2)}`
        : "Nenhum resultado";
    }
  } catch (e) {
    console.warn("onOcrUpdate error", e);
  }
}

function onPlacaDetectada(dados) {
  try {
    const obj = typeof dados === "string" ? JSON.parse(dados) : dados;
    const placa = obj.placa;
    const autorizado = !!obj.autorizado;
    const veiculo = obj.veiculo || "";
    const morador = obj.morador || "";
    const dataHora = obj.data_hora || new Date().toLocaleString();
    const panel = document.getElementById("placa-panel");
    if (!panel) return;

    panel.style.display = "block";
    panel.innerHTML = `<strong>${placa}</strong><br>${autorizado ? "Autorizado" : "Negado"}`;

    const tabela = document.getElementById("tabela-acessos");
    if (tabela) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${placa}</td>
        <td>${veiculo || ""}</td>
        <td>${morador || ""}</td>
        <td>${dataHora}</td>
      `;
      tabela.insertBefore(tr, tabela.firstChild);
      while (tabela.children.length > 8) {
        tabela.removeChild(tabela.lastChild);
      }
    }

    setTimeout(() => {
      panel.style.display = "none";
    }, 6000);
  } catch (e) {
    console.warn("onPlacaDetectada error", e);
  }
}

let infoPagina = 1;

function trocarPaginaInfo() {
  const p1 = document.getElementById("info-pagina-1");
  const p2 = document.getElementById("info-pagina-2");
  const seta = document.getElementById("info-seta");

  if (infoPagina === 1) {
    p1.style.display = "none";
    p2.style.display = "block";
    seta.textContent = "‹";
    infoPagina = 2;
  } else {
    p1.style.display = "block";
    p2.style.display = "none";
    seta.textContent = "›";
    infoPagina = 1;
  }
}

// Reset ao abrir
const _origAbrirInfo = abrirInfo;
abrirInfo = function () {
  infoPagina = 1;
  document.getElementById("info-pagina-1").style.display = "block";
  document.getElementById("info-pagina-2").style.display = "none";
  document.getElementById("info-seta").textContent = "›";
  _origAbrirInfo();
};

// ═══════════════════════════════════════
// MODAL ACESSO
// ═══════════════════════════════════════
let _acessoCountdownInterval = null;
let _acessoAutorizado = false;

function onPlacaDetectada(dados) {
  try {
    const { placa, autorizado, veiculo, morador, endereco, status, data_hora } =
      dados;

    _acessoAutorizado = autorizado;

    // preenche os dados
    document.getElementById("acesso-placa").textContent = placa || "—";
    document.getElementById("acesso-veiculo").textContent = veiculo || "—";
    document.getElementById("acesso-morador").textContent = morador || "—";
    document.getElementById("acesso-endereco").textContent = endereco || "—";
    document.getElementById("acesso-status").textContent = status || "—";

    // foto do carro — usa o último frame da câmera
    const imgCarro = document.getElementById("acesso-img-carro");
    const semFoto = document.getElementById("acesso-sem-foto");
    if (lastFrameBase64) {
      imgCarro.src = lastFrameBase64;
      imgCarro.style.display = "block";
      semFoto.style.display = "none";
    } else {
      imgCarro.style.display = "none";
      semFoto.style.display = "block";
    }

    // câmera em tempo real
    const acessoCamera = document.getElementById("acesso-camera");
    if (lastFrameBase64) acessoCamera.src = lastFrameBase64;

    // abre o modal
    abrirModal("modal-acesso");

    // countdown só para autorizados
    if (autorizado) {
      iniciarCountdownAcesso(10);
    } else {
      document.getElementById("acesso-countdown").style.display = "none";
    }

    // atualiza tabela de acessos se estiver na tela de monitoramento
    const tabela = document.getElementById("tabela-acessos");
    if (tabela) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${placa}</td><td>${veiculo || "—"}</td><td>${morador || "—"}</td><td>${data_hora}</td>`;
      tabela.insertBefore(tr, tabela.firstChild);
    }
  } catch (e) {
    console.warn("onPlacaDetectada error", e);
  }
}

function iniciarCountdownAcesso(segundos) {
  if (_acessoCountdownInterval) clearInterval(_acessoCountdownInterval);

  const countdown = document.getElementById("acesso-countdown");
  const timer = document.getElementById("acesso-timer");
  countdown.style.display = "block";
  timer.textContent = segundos;

  let restante = segundos;
  _acessoCountdownInterval = setInterval(() => {
    restante--;
    timer.textContent = restante;
    if (restante <= 0) {
      clearInterval(_acessoCountdownInterval);
      fecharModal("modal-acesso");
    }
  }, 1000);
}

function cancelarAbertura() {
  if (_acessoCountdownInterval) clearInterval(_acessoCountdownInterval);
  fecharModal("modal-acesso");
}

function adiantarAbertura() {
  if (_acessoCountdownInterval) clearInterval(_acessoCountdownInterval);
  fecharModal("modal-acesso");
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  navegarPara("menu");
});

document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "modal-close") fecharModalAjuste();
});

setInterval(atualizarStatus, 2000);

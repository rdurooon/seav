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

document.addEventListener("DOMContentLoaded", () => {
  navegarPara("menu");
});

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'modal-close') {
    fecharModalAjuste();
  }
});

function abrirInfo() {
  document.getElementById("modal-info").style.display = "flex";
}

function fecharInfo() {
  document.getElementById("modal-info").style.display = "none";
}

function abrirConfig() {
  pywebview.api.carregar_porta().then((porta) => {
    if (porta) {
      document.getElementById("porta-com").value = porta;
    }
  });
  // carregar estado atual de supressão de erros
  try {
    pywebview.api.get_suppress_errors().then((val) => {
      const el = document.getElementById('suppress-errors-toggle');
      if (el) el.checked = !!val;
    }).catch(()=>{});
  } catch(e){}

  document.getElementById("modal-config").style.display = "flex";
}

function fecharConfig() {
  document.getElementById("modal-config").style.display = "none";
}

function abrirModalAjuste() {
  fecharConfig();
  const modal = document.getElementById('modal-ajuste');
  if (!modal) return;
  modal.style.display = 'flex';
  if (typeof setupModalCanvas === 'function') {
    setupModalCanvas();
  }
}

function fecharModalAjuste() {
  const modal = document.getElementById('modal-ajuste');
  if (!modal) return;
  modal.style.display = 'none';
}

async function autodetectarPorta() {
  try {
    const portas = await window.pywebview.api.detectar_portas();
    if (portas.length === 0) {
      alert("Nenhuma porta serial detectada!");
      return;
    }

    // Para simplificar, assume que a primeira porta é a do ESP32
    // Em uma implementação mais avançada, poderia verificar qual é a correta
    const portaDetectada = portas[0].replace("COM", "");
    document.getElementById("porta-com").value = portaDetectada;
    alert(`Porta detectada: COM${portaDetectada}`);
  } catch (error) {
    alert("Erro ao detectar portas: " + error);
  }
}

function salvarConfig() {
  const porta = document.getElementById("porta-com").value;
  if (!porta || porta < 1 || porta > 9) {
    alert("Digite uma porta válida entre 1 e 9!");
    return;
  }
  // Conectar à porta silenciosamente
  pywebview.api.conectar_porta_silencioso(porta);
  // salvar opção de supressão de erros
  try {
    const sup = !!document.getElementById('suppress-errors-toggle').checked;
    pywebview.api.set_suppress_errors(sup).catch(()=>{});
  } catch(e){}
  fecharConfig();
}

// Atualizar status do sistema
function atualizarStatus() {
  pywebview.api.get_status().then((status) => {
    const el = document.getElementById("status-sistema");
    if (el) el.textContent = `Status do sistema: ${status}`;
  });
}

// Callback global para o modal Ajustar reconhecimento
function onOcrUpdate(dados) {
  try {
    const obj = typeof dados === 'string' ? JSON.parse(dados) : dados;
    const text = obj.texto || '';
    const conf = Number(obj.confianca || 0);
    const pad = obj.padrao || '';
    const textEl = document.getElementById('ocr-text');
    const metaEl = document.getElementById('ocr-meta');

    if (textEl) {
      textEl.textContent = text
        ? `Placa: ${text} | Modelo: ${pad} | Confiança: ${conf.toFixed(2)}`
        : 'Nenhum resultado';
    }

    if (metaEl) {
      metaEl.textContent = '';
    }
  } catch (e) {
    console.warn('onOcrUpdate error', e);
  }
}

function onPlacaDetectada(dados) {
  try {
    const obj = typeof dados === 'string' ? JSON.parse(dados) : dados;
    const placa = obj.placa;
    const autorizado = !!obj.autorizado;
    const morador = obj.morador || null;
    const panel = document.getElementById('placa-panel');
    if (!panel) return;

    panel.style.display = 'block';
    panel.innerHTML = `<strong>${placa}</strong><br>${autorizado ? 'Autorizado' : 'Não cadastrado'}`;

    if (autorizado) {
      const tabela = document.getElementById('tabela-acessos');
      if (tabela) {
        try {
          const id_morador = morador && morador[0] ? morador[0] : null;
          pywebview.api.registrar_acesso(placa, id_morador, true).then((res) => {
            const tr = document.createElement('tr');
            const now = new Date().toLocaleString();
            tr.innerHTML = `<td>${placa}</td><td>-</td><td>${morador ? morador[3] || '' : ''}</td><td>${now}</td>`;
            tabela.insertBefore(tr, tabela.firstChild);
          }).catch(() => {});
        } catch (e) {
          // Sem tabela disponível nesta página
        }
      }
    }

    setTimeout(() => {
      panel.style.display = 'none';
    }, 6000);
  } catch (e) {
    console.warn('onPlacaDetectada error', e);
  }
}

const CAMERA_TIMEOUT_MS = 5000;
let cameraTimeoutId = null;
let lastFrameBase64 = null;
window.currentROI = null;

function setCameraPlaceholder(visible) {
  const placeholder = document.getElementById('camera-placeholder');
  if (!placeholder) return;
  placeholder.classList.toggle('hidden', !visible);
}

function clearCanvasROI(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawROIOnCanvas(canvas, color, lineWidth) {
  if (!canvas || !window.currentROI) return;
  const ctx = canvas.getContext('2d');
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
  // Não desenhar ROI na página principal de monitoramento para evitar sobreposições.
  // Mantemos desenho apenas no modal de ajuste (quando aberto).
  drawROIOnCanvas(document.getElementById('camera-canvas-modal'), 'rgba(220,30,30,0.95)', 4);
}

function updateLocalROI(x, y, w, h) {
  window.currentROI = { x, y, w, h };
  drawROIOnAll();
}

function clearLocalROI() {
  window.currentROI = null;
  clearCanvasROI(document.getElementById('camera-canvas'));
  clearCanvasROI(document.getElementById('camera-canvas-modal'));
}

function setupModalCanvas() {
  const img = document.getElementById('camera-stream-modal');
  const canvas = document.getElementById('camera-canvas-modal');
  if (!img || !canvas) return;

  function resizeCanvas() {
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    canvas.style.left = img.offsetLeft + 'px';
    canvas.style.top = img.offsetTop + 'px';
    drawROIOnCanvas(canvas, 'rgba(220,30,30,0.95)', 4);
  }

  if (img.complete) {
    resizeCanvas();
  }

  img.addEventListener('load', resizeCanvas);
  window.addEventListener('resize', resizeCanvas);

  let drawing = false;
  let startX = 0;
  let startY = 0;

  canvas.onmousedown = (e) => {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
  };

  canvas.onmousemove = (e) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (window.currentROI) {
      drawROIOnCanvas(canvas, 'rgba(220,30,30,0.95)', 4);
    }
    if (!drawing) return;
    const x = Math.min(startX, e.offsetX);
    const y = Math.min(startY, e.offsetY);
    const w = Math.abs(e.offsetX - startX);
    const h = Math.abs(e.offsetY - startY);
    ctx.strokeStyle = 'rgba(220,30,30,0.95)';
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
    } catch (e) {
      console.warn('set_roi failed', e);
    }
  };

  canvas.ondblclick = () => {
    clearLocalROI();
    try {
      pywebview.api.limpar_roi();
    } catch (e) {
      console.warn('limpar_roi failed', e);
    }
  };
}

function setBackgroundImage(base64Data) {
  const stream = document.getElementById('camera-stream');
  if (!stream) return;
  if (base64Data) {
    stream.style.backgroundImage = `url('${base64Data}')`;
    stream.style.backgroundSize = 'cover';
    stream.style.backgroundPosition = 'center';
    stream.src = '';
  } else {
    stream.style.backgroundImage = 'none';
    stream.src = '';
  }
}

function resetCameraTimeout() {
  if (cameraTimeoutId) {
    clearTimeout(cameraTimeoutId);
  }
  cameraTimeoutId = setTimeout(() => {
    setCameraPlaceholder(true);
    if (lastFrameBase64) {
      setBackgroundImage(lastFrameBase64);
    }
  }, CAMERA_TIMEOUT_MS);
}

function updateCameraStream(base64Data, recognitionBase64 = null) {
  const stream = document.getElementById('camera-stream');
  if (stream) {
    lastFrameBase64 = base64Data;
    stream.src = base64Data;
    stream.style.backgroundImage = 'none';
    setCameraPlaceholder(false);
    resetCameraTimeout();
  }
  const modalStream = document.getElementById('camera-stream-modal');
  if (modalStream) {
    modalStream.src = recognitionBase64 || base64Data;
  }
  drawROIOnAll();
}

// Atualizar a cada 2 segundos
setInterval(atualizarStatus, 2000);

function abrirModal(id) {
  document.getElementById(id).classList.add("ativo");
}

function fecharModal(id) {
  document.getElementById(id).classList.remove("ativo");
}

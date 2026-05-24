const CAMERA_TIMEOUT_MS = 5000;
let cameraTimeoutId = null;
let lastFrameBase64 = null;
let automacaoAtiva = true;
let manualAcessoAberto = false;
const ACCESS_COMMAND_DURATION = 5;

// Atualizar status do sistema
function atualizarStatus() {
  pywebview.api.get_status().then((status) => {
    document.getElementById("status-sistema").textContent =
      `Status do sistema: ${status}`;
  });
}

function atualizarBotoesMonitoramento() {
  const btnManual = document.getElementById("btn-abre-fecha");
  if (btnManual) {
    btnManual.textContent = manualAcessoAberto
      ? "Fechar acesso"
      : "Abrir/fechar acesso";
  }

  const btnAuto = document.getElementById("btn-automacao");
  if (btnAuto) {
    btnAuto.textContent = automacaoAtiva
      ? "Automação: Ativada"
      : "Automação: Desativada";
  }
}

async function carregarEstadoAutomacao() {
  try {
    const valor = await window.pywebview.api.get_automacao();
    automacaoAtiva = !!valor;
  } catch (e) {
    automacaoAtiva = true;
  }
  atualizarBotoesMonitoramento();
}

async function abrirFecharAcesso() {
  const acao = manualAcessoAberto ? "CLOSE" : "OPEN";
  try {
    const enviado = await window.pywebview.api.enviar_comando_portao(
      acao,
      ACCESS_COMMAND_DURATION
    );
    if (enviado) {
      manualAcessoAberto = !manualAcessoAberto;
      atualizarBotoesMonitoramento();
      alert(`${acao === "OPEN" ? "Abertura" : "Fechamento"} enviada com sucesso.`);
    } else {
      alert("Não foi possível enviar o comando. Verifique a conexão serial.");
    }
  } catch (e) {
    console.warn("abrirFecharAcesso error", e);
    alert("Erro ao enviar comando de abertura/fechamento.");
  }
}

async function ativarDesativarAutomacao() {
  automacaoAtiva = !automacaoAtiva;
  try {
    await window.pywebview.api.set_automacao(automacaoAtiva);
  } catch (e) {
    console.warn("ativarDesativarAutomacao error", e);
  }
  atualizarBotoesMonitoramento();
}

function atualizarEstadoAutomacao() {
  atualizarBotoesMonitoramento();
}

function setCameraPlaceholder(visible) {
  const placeholder = document.getElementById("camera-placeholder");
  if (!placeholder) return;
  placeholder.classList.toggle("hidden", !visible);
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

// Atualizar stream da câmera
function updateCameraStream(base64Data) {
  const stream = document.getElementById("camera-stream");
  if (!stream) return;
  lastFrameBase64 = base64Data;
  stream.src = base64Data;
  stream.style.backgroundImage = "none";
  setCameraPlaceholder(false);
  resetCameraTimeout();
}

// Atualiza também o stream do modal (se aberto)
function _updateModalStream(base64Data) {
  const stream = document.getElementById("camera-stream-modal");
  if (!stream) return;
  stream.src = base64Data;
}

// alterar updateCameraStream para também atualizar modal
const _origUpdateCameraStream = updateCameraStream;
updateCameraStream = function (base64Data, recognitionBase64 = null) {
  _origUpdateCameraStream(base64Data, recognitionBase64);
  try {
    _updateModalStream(recognitionBase64 || base64Data);
  } catch (e) {}
};

// --- Modal Ajuste ---
function abrirModalAjuste() {
  fecharConfig();
  const modal = document.getElementById("modal-ajuste");
  if (!modal) return;
  modal.style.display = "flex";
  // configurar canvas modal
  setupModalCanvas();
}

function fecharModalAjuste() {
  const modal = document.getElementById("modal-ajuste");
  if (!modal) return;
  modal.style.display = "none";
}

document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "modal-close") {
    fecharModalAjuste();
  }
});

function setupModalCanvas() {
  const img = document.getElementById("camera-stream-modal");
  const canvas = document.getElementById("camera-canvas-modal");
  if (!img || !canvas) return;

  function resizeCanvas() {
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    canvas.style.left = img.offsetLeft + "px";
    canvas.style.top = img.offsetTop + "px";
    drawROIOnCanvas(canvas, "rgba(255, 0, 0, 0.9)", 2);
  }

  let drawing = false;
  let startX = 0;
  let startY = 0;

  if (img.complete) {
    resizeCanvas();
  }

  img.addEventListener("load", () => {
    resizeCanvas();
  });

  window.addEventListener("resize", resizeCanvas);

  canvas.onmousedown = (e) => {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
  };

  canvas.onmousemove = (e) => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawROIOnCanvas(canvas, "rgba(255, 0, 0, 0.9)", 2);
    if (!drawing) return;
    const x = Math.min(startX, e.offsetX);
    const y = Math.min(startY, e.offsetY);
    const w = Math.abs(e.offsetX - startX);
    const h = Math.abs(e.offsetY - startY);
    ctx.strokeStyle = "rgba(255,165,0,0.9)";
    ctx.lineWidth = 2;
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

    try {
      pywebview.api.set_roi(rx, ry, rw, rh);
      updateLocalROI(rx, ry, rw, rh);
    } catch (e) {
      console.warn("set_roi failed", e);
    }
  };

  canvas.ondblclick = () => {
    clearLocalROI();
  };
}

// Recebe atualizações rápidas de OCR para exibição no modal
function onOcrUpdate(dados) {
  try {
    const obj = typeof dados === "string" ? JSON.parse(dados) : dados;
    const text = obj.texto || "";
    const conf = obj.confianca || 0;
    const pad = obj.padrao || "";
    const textEl = document.getElementById("ocr-text");
    const metaEl = document.getElementById("ocr-meta");
    if (textEl) {
      textEl.textContent = text
        ? `Placa: ${text} | Modelo: ${pad} | Confiança: ${conf.toFixed ? conf.toFixed(2) : conf}`
        : "Nenhum resultado";
    }
    if (metaEl) metaEl.textContent = "";
  } catch (e) {
    console.warn("onOcrUpdate error", e);
  }
}

// --- ROI canvas handling ---
function setupROICanvas() {
  const img = document.getElementById("camera-stream");
  const canvas = document.getElementById("camera-canvas");
  if (!img || !canvas) return;

  function resizeCanvas() {
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    canvas.style.left = img.offsetLeft + "px";
    canvas.style.top = img.offsetTop + "px";
    drawROIOnCanvas(canvas, "rgba(180,180,180,0.9)", 1);
  }

  let drawing = false;
  let startX = 0;
  let startY = 0;

  if (img.complete) {
    resizeCanvas();
  }

  img.addEventListener("load", () => {
    resizeCanvas();
  });

  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("mousedown", (e) => {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
  });

  canvas.addEventListener("mousemove", (e) => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawROIOnCanvas(canvas, "rgba(180,180,180,0.9)", 1);
    if (!drawing) return;
    const x = Math.min(startX, e.offsetX);
    const y = Math.min(startY, e.offsetY);
    const w = Math.abs(e.offsetX - startX);
    const h = Math.abs(e.offsetY - startY);
    ctx.strokeStyle = "rgba(255,165,0,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  });

  canvas.addEventListener("mouseup", (e) => {
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

    try {
      pywebview.api.set_roi(rx, ry, rw, rh);
      updateLocalROI(rx, ry, rw, rh);
    } catch (e) {
      console.warn("set_roi failed", e);
    }
  });

  canvas.addEventListener("dblclick", () => {
    clearLocalROI();
  });
}

// Executa setup do canvas
setupROICanvas();

// --- Placa detectada handler ---
function onPlacaDetectada(dados) {
  try {
    if (typeof window.showAcessoModal === "function") {
      window.showAcessoModal(dados);
    }

    const panel = document.getElementById("placa-panel");
    if (!panel) return;
    const obj = typeof dados === "string" ? JSON.parse(dados) : dados;
    const placa = obj.placa;
    const autorizado = !!obj.autorizado;
    const veiculo = obj.veiculo || "";
    const morador = obj.morador || "";
    const dataHora = obj.data_hora || new Date().toLocaleString();

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

    // esconder painel após 6s
    setTimeout(() => {
      panel.style.display = "none";
    }, 6000);
  } catch (e) {
    console.warn("onPlacaDetectada error", e);
  }
}

function carregarUltimosAcessos() {
  // Tenta buscar últimos acessos com retries para garantir disponibilidade do pywebview.api
  const maxAttempts = 10;
  let attempt = 0;

  function tryLoad() {
    attempt++;
    try {
      if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.get_ultimos_acessos) {
        if (attempt < maxAttempts) {
          setTimeout(tryLoad, 200);
        } else {
          console.warn("carregarUltimosAcessos: pywebview.api não disponível");
        }
        return;
      }

      window.pywebview.api
        .get_ultimos_acessos()
        .then((dados) => {
          console.log("carregarUltimosAcessos: received", dados && dados.length ? dados.length : 0);
          renderizarTabelaAcessos(dados || []);
        })
        .catch((err) => {
          console.warn("carregarUltimosAcessos error (call)", err);
          if (attempt < maxAttempts) setTimeout(tryLoad, 200);
        });
    } catch (e) {
      console.warn("carregarUltimosAcessos error", e);
      if (attempt < maxAttempts) setTimeout(tryLoad, 200);
    }
  }

  tryLoad();
}

function renderizarTabelaAcessos(dados) {
  const tbody = document.getElementById("tabela-acessos");
  tbody.innerHTML = "";

  const TOTAL_LINHAS = 8;

  function celula(valor) {
    if (!valor)
      return `<td style="color:#aaa; font-style:italic;">Sem informação</td>`;
    return `<td>${valor}</td>`;
  }

  dados.forEach((linha) => {
    const [placa, veiculo, morador, dataHora] = linha;
    const tr = document.createElement("tr");
    tr.innerHTML = `
            ${celula(placa)}
            ${celula(veiculo)}
            ${celula(morador)}
            ${celula(dataHora)}
        `;
    tbody.appendChild(tr);
  });

  const linhasFaltando = TOTAL_LINHAS - dados.length;
  for (let i = 0; i < linhasFaltando; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
}

// Inicializar
setCameraPlaceholder(true);
atualizarStatus();
carregarUltimosAcessos();
carregarEstadoAutomacao();

/**
 * Monitoramento – Câmera, Últimos Acessos, Botões e Ajustes
 *
 * Este módulo é injetado dinamicamente ao abrir a tela de monitoramento.
 * As variáveis globais `automacaoAtiva` e `portaoAberto` são compartilhadas
 * com o home.js e inicializadas aqui com var caso ainda não existam.
 */

// ---------------------------------------------------------------
// 1. Variáveis de estado (compartilhadas globalmente)
// ---------------------------------------------------------------
if (typeof automacaoAtiva === "undefined") {
  var automacaoAtiva = false;
}
if (typeof portaoAberto === "undefined") {
  var portaoAberto = false;
}

// ---------------------------------------------------------------
// 2. Funções de status e câmera
// ---------------------------------------------------------------
function atualizarStatus() {
  pywebview.api.get_status().then(function (status) {
    document.getElementById("status-sistema").textContent =
      "Status do sistema: " + status;
  });
}

function setCameraPlaceholder(visible) {
  var placeholder = document.getElementById("camera-placeholder");
  if (!placeholder) return;
  placeholder.classList.toggle("hidden", !visible);
}

function setBackgroundImage(base64Data) {
  var stream = document.getElementById("camera-stream");
  if (!stream) return;
  if (base64Data) {
    stream.style.backgroundImage = "url('" + base64Data + "')";
    stream.style.backgroundSize = "cover";
    stream.style.backgroundPosition = "center";
    stream.src = "";
  } else {
    stream.style.backgroundImage = "none";
    stream.src = "";
  }
}

function resetCameraTimeout() {
  if (window.cameraTimeoutId) {
    clearTimeout(window.cameraTimeoutId);
  }
  window.cameraTimeoutId = setTimeout(function () {
    setCameraPlaceholder(true);
    if (window.lastFrameBase64) {
      setBackgroundImage(window.lastFrameBase64);
    }
  }, window.CAMERA_TIMEOUT_MS || 5000);
}

// Função original (será estendida abaixo)
function updateCameraStream(base64Data) {
  var stream = document.getElementById("camera-stream");
  if (!stream) return;
  window.lastFrameBase64 = base64Data;
  stream.src = base64Data;
  stream.style.backgroundImage = "none";
  setCameraPlaceholder(false);
  resetCameraTimeout();
}

// Atualiza também o modal de ajuste
function updateModalStream(base64Data) {
  var stream = document.getElementById("camera-stream-modal");
  if (stream) {
    stream.src = base64Data;
  }
}

// Estende updateCameraStream para também alimentar o modal
var originalUpdateCameraStream = updateCameraStream;
updateCameraStream = function (base64Data, recognitionBase64) {
  originalUpdateCameraStream(base64Data, recognitionBase64);
  try {
    updateModalStream(recognitionBase64 || base64Data);
  } catch (e) {}
};

// ---------------------------------------------------------------
// 3. Modal de Ajuste (ROI)
// ---------------------------------------------------------------
function abrirModalAjuste() {
  fecharConfig();
  var modal = document.getElementById("modal-ajuste");
  if (!modal) return;
  modal.style.display = "flex";
  setupModalCanvas();
}

function fecharModalAjuste() {
  var modal = document.getElementById("modal-ajuste");
  if (modal) modal.style.display = "none";
  if (typeof processarProximaDetecção === "function" && window._filaAcesso && window._filaAcesso.length > 0) {
    setTimeout(processarProximaDetecção, 300);
  }
}

document.addEventListener("click", function (e) {
  if (e.target && e.target.id === "modal-close") {
    fecharModalAjuste();
  }
});

function setupModalCanvas() {
  var img = document.getElementById("camera-stream-modal");
  var canvas = document.getElementById("camera-canvas-modal");
  if (!img || !canvas) return;

  function resizeCanvas() {
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    canvas.style.left = img.offsetLeft + "px";
    canvas.style.top = img.offsetTop + "px";
    drawROIOnCanvas(canvas, "rgba(255, 0, 0, 0.9)", 2);
  }

  var drawing = false;
  var startX = 0;
  var startY = 0;

  if (img.complete) resizeCanvas();
  img.addEventListener("load", resizeCanvas);
  window.addEventListener("resize", resizeCanvas);

  canvas.onmousedown = function (e) {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
  };

  canvas.onmousemove = function (e) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawROIOnCanvas(canvas, "rgba(255, 0, 0, 0.9)", 2);
    if (!drawing) return;
    var x = Math.min(startX, e.offsetX);
    var y = Math.min(startY, e.offsetY);
    var w = Math.abs(e.offsetX - startX);
    var h = Math.abs(e.offsetY - startY);
    ctx.strokeStyle = "rgba(255,165,0,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  };

  canvas.onmouseup = function (e) {
    drawing = false;
    var endX = e.offsetX;
    var endY = e.offsetY;
    var x = Math.min(startX, endX);
    var y = Math.min(startY, endY);
    var w = Math.abs(endX - startX);
    var h = Math.abs(endY - startY);
    var naturalW = img.naturalWidth || img.width;
    var naturalH = img.naturalHeight || img.height;
    var dispW = img.clientWidth;
    var dispH = img.clientHeight;
    var scaleX = naturalW / (dispW || naturalW);
    var scaleY = naturalH / (dispH || naturalH);
    var rx = Math.round(x * scaleX);
    var ry = Math.round(y * scaleY);
    var rw = Math.round(w * scaleX);
    var rh = Math.round(h * scaleY);

    try {
      pywebview.api.set_roi(rx, ry, rw, rh);
      updateLocalROI(rx, ry, rw, rh);
    } catch (e) {
      console.warn("set_roi failed", e);
    }
  };

  canvas.ondblclick = function () {
    clearLocalROI();
  };
}

// ---------------------------------------------------------------
// 4. OCR (atualização rápida no modal de ajuste)
// ---------------------------------------------------------------
function onOcrUpdate(dados) {
  try {
    var obj = typeof dados === "string" ? JSON.parse(dados) : dados;
    var text = obj.texto || "";
    var conf = obj.confianca || 0;
    var pad = obj.padrao || "";
    var textEl = document.getElementById("ocr-text");
    var metaEl = document.getElementById("ocr-meta");

    if (textEl) {
      textEl.textContent = text
        ? "Placa: " +
          text +
          " | Modelo: " +
          pad +
          " | Confiança: " +
          (conf.toFixed ? conf.toFixed(2) : conf)
        : "Nenhum resultado";
    }
    if (metaEl) metaEl.textContent = "";
  } catch (e) {
    console.warn("onOcrUpdate error", e);
  }
}

// ---------------------------------------------------------------
// 5. ROI no monitoramento principal
// ---------------------------------------------------------------
function setupROICanvas() {
  var img = document.getElementById("camera-stream");
  var canvas = document.getElementById("camera-canvas");
  if (!img || !canvas) return;

  function resizeCanvas() {
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    canvas.style.left = img.offsetLeft + "px";
    canvas.style.top = img.offsetTop + "px";
    drawROIOnCanvas(canvas, "rgba(180,180,180,0.9)", 1);
  }

  var drawing = false;
  var startX = 0;
  var startY = 0;

  if (img.complete) resizeCanvas();
  img.addEventListener("load", resizeCanvas);
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("mousedown", function (e) {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
  });

  canvas.addEventListener("mousemove", function (e) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawROIOnCanvas(canvas, "rgba(180,180,180,0.9)", 1);
    if (!drawing) return;
    var x = Math.min(startX, e.offsetX);
    var y = Math.min(startY, e.offsetY);
    var w = Math.abs(e.offsetX - startX);
    var h = Math.abs(e.offsetY - startY);
    ctx.strokeStyle = "rgba(255,165,0,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  });

  canvas.addEventListener("mouseup", function (e) {
    drawing = false;
    var endX = e.offsetX;
    var endY = e.offsetY;
    var x = Math.min(startX, endX);
    var y = Math.min(startY, endY);
    var w = Math.abs(endX - startX);
    var h = Math.abs(endY - startY);
    var naturalW = img.naturalWidth || img.width;
    var naturalH = img.naturalHeight || img.height;
    var dispW = img.clientWidth;
    var dispH = img.clientHeight;
    var scaleX = naturalW / (dispW || naturalW);
    var scaleY = naturalH / (dispH || naturalH);
    var rx = Math.round(x * scaleX);
    var ry = Math.round(y * scaleY);
    var rw = Math.round(w * scaleX);
    var rh = Math.round(h * scaleY);

    try {
      pywebview.api.set_roi(rx, ry, rw, rh);
      updateLocalROI(rx, ry, rw, rh);
    } catch (e) {
      console.warn("set_roi failed", e);
    }
  });

  canvas.addEventListener("dblclick", function () {
    clearLocalROI();
  });
}

setupROICanvas();

// ---------------------------------------------------------------
// 6. Últimos acessos (tabela lateral)
// ---------------------------------------------------------------
function carregarUltimosAcessos() {
  var maxAttempts = 10;
  var attempt = 0;

  function tentarCarregar() {
    attempt++;
    try {
      if (
        !window.pywebview ||
        !window.pywebview.api ||
        !window.pywebview.api.get_ultimos_acessos
      ) {
        if (attempt < maxAttempts) {
          setTimeout(tentarCarregar, 200);
        } else {
          console.warn("carregarUltimosAcessos: pywebview.api indisponível");
        }
        return;
      }
      window.pywebview.api
        .get_ultimos_acessos()
        .then(function (dados) {
          renderizarTabelaAcessos(dados || []);
        })
        .catch(function (err) {
          console.warn("carregarUltimosAcessos error (call)", err);
          if (attempt < maxAttempts) setTimeout(tentarCarregar, 200);
        });
    } catch (e) {
      console.warn("carregarUltimosAcessos error", e);
      if (attempt < maxAttempts) setTimeout(tentarCarregar, 200);
    }
  }

  tentarCarregar();
}

function renderizarTabelaAcessos(dados) {
  var tbody = document.getElementById("tabela-acessos");
  tbody.innerHTML = "";
  var TOTAL_LINHAS = 8;

  function celula(valor) {
    return valor
      ? "<td>" + valor + "</td>"
      : '<td style="color:#aaa; font-style:italic;">Sem informação</td>';
  }

  dados.forEach(function (linha) {
    var placa = linha[0],
      veiculo = linha[1],
      morador = linha[2],
      dataHora = linha[3];
    var tr = document.createElement("tr");
    tr.innerHTML =
      celula(placa) + celula(veiculo) + celula(morador) + celula(dataHora);
    tbody.appendChild(tr);
  });

  for (var i = dados.length; i < TOTAL_LINHAS; i++) {
    var tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td></td><td></td><td></td>";
    tbody.appendChild(tr);
  }
}

// ---------------------------------------------------------------
// 7. Botões de controle (portão e automação)
// ---------------------------------------------------------------
function atualizarBotoesMonitoramento() {
  var btnPortao = document.getElementById("btn-portao");
  var btnAutomacao = document.getElementById("btn-automacao");

  if (btnPortao) {
    if (portaoAberto) {
      btnPortao.textContent = "Fechar portão";
      btnPortao.style.background = "#e74c3c";
    } else {
      btnPortao.textContent = "Abrir portão";
      btnPortao.style.background = "#27ae60";
    }
  }

  if (btnAutomacao) {
    if (automacaoAtiva) {
      btnAutomacao.textContent = "Desativar automação";
      btnAutomacao.style.background = "#e74c3c";
    } else {
      btnAutomacao.textContent = "Ativar automação";
      btnAutomacao.style.background = "#27ae60";
    }
  }
}

async function carregarEstadoAutomacao() {
  try {
    var valor = await window.pywebview.api.get_automacao();
    automacaoAtiva = !!valor;
  } catch (e) {
    automacaoAtiva = true; 
    console.warn("carregarEstadoAutomacao error", e);
  }
  atualizarBotoesMonitoramento();
}

async function togglePortao() {
  if (!automacaoAtiva) {
    alert("Automação desativada. Ative a automação para controlar o portão.");
    return;
  }
  var comando = portaoAberto ? "CLOSE" : "OPEN";
  if (window._portaoAutoResetTimer) {
    clearTimeout(window._portaoAutoResetTimer);
    window._portaoAutoResetTimer = null;
  }
  if (typeof window.portaoAbertoAuto !== "undefined") {
    window.portaoAbertoAuto = false;
  }

  try {
    var enviado = await window.pywebview.api.enviar_comando_portao(comando, 5);
    if (enviado) {
      if (typeof setPortaoState === "function") {
        setPortaoState(!portaoAberto, false);
      } else {
        portaoAberto = !portaoAberto;
        atualizarBotoesMonitoramento();
      }
    } else {
      alert("Não foi possível enviar o comando. Verifique a conexão serial.");
    }
  } catch (e) {
    console.warn("togglePortao error", e);
    alert("Erro ao enviar comando.");
  }
}

async function toggleAutomacao() {
  automacaoAtiva = !automacaoAtiva;
  try {
    await window.pywebview.api.set_automacao(automacaoAtiva);
  } catch (e) {
    console.warn("toggleAutomacao error", e);
    automacaoAtiva = !automacaoAtiva;
  }
  atualizarBotoesMonitoramento();

  if (!automacaoAtiva) {
    setCameraPlaceholder(true);
  }
}

// ---------------------------------------------------------------
// 8. Inicialização da tela de monitoramento
// ---------------------------------------------------------------
setCameraPlaceholder(true);
atualizarStatus();
carregarUltimosAcessos();
carregarEstadoAutomacao();

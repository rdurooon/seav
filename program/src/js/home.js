// ---------------------------------------------------------------
// 1. Navegação SPA (carrega páginas dentro de #content)
// ---------------------------------------------------------------
async function navegarPara(pagina) {
  var resposta = await fetch("pages/" + pagina + ".html");
  var html = await resposta.text();
  document.getElementById("content").innerHTML = html;

  var btnVoltar = document.getElementById("btn-voltar");
  btnVoltar.style.display = pagina === "menu" ? "none" : "block";

  iniciarRelogio();
  atualizarStatus();

  var paginasComJS = ["gestao", "monitoramento", "historico", "relatorio"];
  if (paginasComJS.indexOf(pagina) !== -1) {
    var script = document.createElement("script");
    script.src = "js/" + pagina + ".js";
    document.body.appendChild(script);

    if (pagina === "gestao") {
      script.onload = function () {
        carregarVeiculos();
      };
    }
  }
}

// ---------------------------------------------------------------
// 2. Estado global (compartilhado com monitoramento)
// ---------------------------------------------------------------
var automacaoAtiva = true;
var portaoAberto = false;

// ---------------------------------------------------------------
// 3. Relógio (atualizado a cada segundo)
// ---------------------------------------------------------------
function iniciarRelogio() {
  var el = document.getElementById("relogio");
  if (!el) return;

  if (window._relogioInterval) clearInterval(window._relogioInterval);

  function atualizar() {
    var agora = new Date();
    var data = agora.toLocaleDateString("pt-BR");
    var hora = agora.toLocaleTimeString("pt-BR");
    el.textContent = data + " - " + hora;
  }

  atualizar();
  window._relogioInterval = setInterval(atualizar, 1000);
}

// ---------------------------------------------------------------
// 4. Status do sistema (atualiza a cada 2s via API)
// ---------------------------------------------------------------
function atualizarStatus() {
  try {
    pywebview.api
      .get_status()
      .then(function (status) {
        var el = document.getElementById("status-sistema");
        if (el) el.textContent = "Status do sistema: " + status;
      })
      .catch(function () {});
  } catch (e) {}
}

// ---------------------------------------------------------------
// 5. Sistema de modais (classes CSS .ativo)
// ---------------------------------------------------------------
function abrirModal(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.add("ativo");
}

function fecharModal(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("ativo");
}

// ---------------------------------------------------------------
// 6. Modal "Sobre o SEAV"
// ---------------------------------------------------------------
function abrirInfo() {
  abrirModal("modal-info");
}

function fecharInfo() {
  fecharModal("modal-info");
}

var infoPagina = 1;

function trocarPaginaInfo() {
  var p1 = document.getElementById("info-pagina-1");
  var p2 = document.getElementById("info-pagina-2");
  var seta = document.getElementById("info-seta");

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

var _origAbrirInfo = abrirInfo;
abrirInfo = function () {
  infoPagina = 1;
  document.getElementById("info-pagina-1").style.display = "block";
  document.getElementById("info-pagina-2").style.display = "none";
  document.getElementById("info-seta").textContent = "›";
  _origAbrirInfo();
};

// ---------------------------------------------------------------
// 7. Modal de Configurações
// ---------------------------------------------------------------
function abrirConfig() {
  try {
    pywebview.api
      .carregar_porta()
      .then(function (porta) {
        if (porta) document.getElementById("porta-com").value = porta;
      })
      .catch(function () {});
  } catch (e) {}

  try {
    pywebview.api
      .get_suppress_errors()
      .then(function (val) {
        var el = document.getElementById("suppress-errors-toggle");
        if (el) el.checked = !!val;
      })
      .catch(function () {});
  } catch (e) {}

  abrirModal("modal-config");
}

function fecharConfig() {
  fecharModal("modal-config");
}

function salvarConfig() {
  var porta = document.getElementById("porta-com").value;
  if (!porta || porta < 1 || porta > 99) {
    alert("Digite uma porta válida!");
    return;
  }
  try {
    pywebview.api.conectar_porta_silencioso(porta);
  } catch (e) {}
  try {
    var sup = !!document.getElementById("suppress-errors-toggle").checked;
    pywebview.api.set_suppress_errors(sup).catch(function () {});
  } catch (e) {}
  fecharConfig();
}

async function autodetectarPorta() {
  try {
    var portas = await window.pywebview.api.detectar_portas();
    if (portas.length === 0) {
      alert("Nenhuma porta serial detectada!");
      return;
    }
    var portaDetectada = portas[0].replace("COM", "");
    document.getElementById("porta-com").value = portaDetectada;
    alert("Porta detectada: COM" + portaDetectada);
  } catch (error) {
    alert("Erro ao detectar portas: " + error);
  }
}

// ---------------------------------------------------------------
// 8. Modal de Ajuste (ROI)
// ---------------------------------------------------------------
function abrirModalAjuste() {
  fecharConfig();
  abrirModal("modal-ajuste");
  if (typeof setupModalCanvas === "function") {
    setupModalCanvas();
  }
}

function fecharModalAjuste() {
  fecharModal("modal-ajuste");
}

// ---------------------------------------------------------------
// 9. Câmera – Stream, Placeholder, ROI, Canvas
// ---------------------------------------------------------------
var CAMERA_TIMEOUT_MS = 5000;
var cameraTimeoutId = null;
var lastFrameBase64 = null;
window.currentROI = null;

function setCameraPlaceholder(visible) {
  var placeholder = document.getElementById("camera-placeholder");
  if (!placeholder) return;
  if (visible) {
    placeholder.textContent = automacaoAtiva
      ? "Sem sinal"
      : "Automação desativada";
    placeholder.classList.remove("hidden");
  } else {
    placeholder.classList.add("hidden");
  }
}

function clearCanvasROI(canvas) {
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawROIOnCanvas(canvas, color, lineWidth) {
  if (!canvas || !window.currentROI) return;
  var ctx = canvas.getContext("2d");
  clearCanvasROI(canvas);
  var rect = window.currentROI;
  var img = canvas.previousElementSibling;
  if (!img) return;
  var naturalW = img.naturalWidth || img.width;
  var naturalH = img.naturalHeight || img.height;
  var dispW = img.clientWidth;
  var dispH = img.clientHeight;
  var scaleX = dispW / (naturalW || 1);
  var scaleY = dispH / (naturalH || 1);
  var x = rect.x * scaleX;
  var y = rect.y * scaleY;
  var w = rect.w * scaleX;
  var h = rect.h * scaleY;
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
  window.currentROI = { x: x, y: y, w: w, h: h };
  drawROIOnAll();
}

function clearLocalROI() {
  window.currentROI = null;
  clearCanvasROI(document.getElementById("camera-canvas"));
  clearCanvasROI(document.getElementById("camera-canvas-modal"));
}

function setupModalCanvas() {
  var img = document.getElementById("camera-stream-modal");
  var canvas = document.getElementById("camera-canvas-modal");
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

  var drawing = false;
  var startX = 0;
  var startY = 0;

  canvas.onmousedown = function (e) {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;
  };

  canvas.onmousemove = function (e) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (window.currentROI) drawROIOnCanvas(canvas, "rgba(220,30,30,0.95)", 4);
    if (!drawing) return;
    var x = Math.min(startX, e.offsetX);
    var y = Math.min(startY, e.offsetY);
    var w = Math.abs(e.offsetX - startX);
    var h = Math.abs(e.offsetY - startY);
    ctx.strokeStyle = "rgba(220,30,30,0.95)";
    ctx.lineWidth = 4;
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
    updateLocalROI(rx, ry, rw, rh);
    try {
      pywebview.api.set_roi(rx, ry, rw, rh);
    } catch (e) {}
  };

  canvas.ondblclick = function () {
    clearLocalROI();
    try {
      pywebview.api.limpar_roi();
    } catch (e) {}
  };
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
  if (cameraTimeoutId) clearTimeout(cameraTimeoutId);
  cameraTimeoutId = setTimeout(function () {
    setCameraPlaceholder(true);
    if (lastFrameBase64) setBackgroundImage(lastFrameBase64);
  }, CAMERA_TIMEOUT_MS);
}

function updateCameraStream(base64Data, recognitionBase64) {
  // Se a automação estiver desativada, não atualiza o stream e mostra o aviso
  if (!automacaoAtiva) {
    var placeholder = document.getElementById("camera-placeholder");
    if (placeholder) {
      placeholder.textContent = "Automação desativada";
      placeholder.classList.remove("hidden");
    }
    return; // ignora completamente o frame recebido
  }

  var stream = document.getElementById("camera-stream");
  if (stream) {
    lastFrameBase64 = base64Data;
    stream.src = base64Data;
    stream.style.backgroundImage = "none";
    setCameraPlaceholder(false);
    resetCameraTimeout();
  }

  var modalStream = document.getElementById("camera-stream-modal");
  if (modalStream) modalStream.src = recognitionBase64 || base64Data;

  var acessoCam = document.getElementById("acesso-camera");
  if (acessoCam) {
    acessoCam.src = recognitionBase64 || base64Data;
  }

  drawROIOnAll();
}

// ---------------------------------------------------------------
// 10. OCR – Atualização rápida (texto da placa sendo lida)
// ---------------------------------------------------------------
function onOcrUpdate(dados) {
  try {
    var obj = typeof dados === "string" ? JSON.parse(dados) : dados;
    var text = obj.texto || "";
    var conf = Number(obj.confianca || 0);
    var pad = obj.padrao || "";
    var textEl = document.getElementById("ocr-text");
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
  } catch (e) {
    console.warn("onOcrUpdate error", e);
  }
}

// ---------------------------------------------------------------
// 11. Modal de Tentativa de Acesso
// ---------------------------------------------------------------
var ACESSO_COUNTDOWN_SEGUNDOS = 5;
var OPEN_COMMAND_DURATION = 5;
var _acessoCountdownInterval = null;
var _acessoPayloadAtual = null;
var _modalAcessoAberto = false;
var _filaAcesso = [];

function showAcessoModal(dados) {
  if (_modalAcessoAberto) {
    console.log("Modal já aberto, ignorando nova detecção.");
    return;
  }
  try {
    var placa = dados.placa,
      veiculo = dados.veiculo,
      morador = dados.morador,
      endereco = dados.endereco,
      status = dados.status;

    _acessoPayloadAtual = dados;
    _modalAcessoAberto = true;

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value || "—";
    }

    setText("acesso-placa", placa);
    setText("acesso-veiculo", veiculo);
    setText("acesso-morador", morador);
    setText("acesso-endereco", endereco);
    setText("acesso-status", status);

    var imgCarro = document.getElementById("acesso-img-carro");
    var semFoto = document.getElementById("acesso-sem-foto");
    if (imgCarro && semFoto) {
      if (lastFrameBase64) {
        imgCarro.src = lastFrameBase64;
        imgCarro.style.display = "block";
        semFoto.style.display = "none";
      } else {
        imgCarro.style.display = "none";
        semFoto.style.display = "block";
      }
    }

    var acessoCamera = document.getElementById("acesso-camera");
    if (acessoCamera) {
      if (lastFrameBase64) {
        acessoCamera.src = lastFrameBase64;
      } else {
        var modalImg = document.getElementById("camera-stream-modal");
        if (modalImg && modalImg.src) {
          acessoCamera.src = modalImg.src;
        } else {
          acessoCamera.src = "";
        }
      }
    }

    abrirModal("modal-acesso");
    iniciarCountdownAcesso(ACESSO_COUNTDOWN_SEGUNDOS);
  } catch (e) {
    console.warn("showAcessoModal error", e);
    _modalAcessoAberto = false;
  }
}

// ---------------------------------------------------------------
// 12. Registro no histórico e buffer de últimos acessos
// ---------------------------------------------------------------
async function registrarAcessoNoHistorico(acao) {
  if (!_acessoPayloadAtual) return;
  var placa = _acessoPayloadAtual.placa,
    veiculo = _acessoPayloadAtual.veiculo,
    morador = _acessoPayloadAtual.morador,
    endereco = _acessoPayloadAtual.endereco,
    data_hora = _acessoPayloadAtual.data_hora;
  var status = acao === "autorizar" ? "Autorizado" : "Negado";

  var dataISO = null;
  if (data_hora) {
    var match = data_hora.match(
      /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})/,
    );
    if (match) {
      dataISO = match[3] + "-" + match[2] + "-" + match[1] + " " + match[4];
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data_hora)) {
      dataISO = data_hora;
    } else {
      var agora = new Date();
      dataISO =
        agora.getFullYear() +
        "-" +
        String(agora.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(agora.getDate()).padStart(2, "0") +
        " " +
        String(agora.getHours()).padStart(2, "0") +
        ":" +
        String(agora.getMinutes()).padStart(2, "0") +
        ":" +
        String(agora.getSeconds()).padStart(2, "0");
    }
  } else {
    var agora = new Date();
    dataISO =
      agora.getFullYear() +
      "-" +
      String(agora.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(agora.getDate()).padStart(2, "0") +
      " " +
      String(agora.getHours()).padStart(2, "0") +
      ":" +
      String(agora.getMinutes()).padStart(2, "0") +
      ":" +
      String(agora.getSeconds()).padStart(2, "0");
  }

  try {
    var resultado = await window.pywebview.api.registrar_acesso(
      placa,
      null,
      acao === "autorizar",
      veiculo,
      morador,
      endereco,
      dataISO,
      status,
    );
    return resultado;
  } catch (e) {
    console.warn("registrarAcessoNoHistorico error", e);
    return false;
  }
}

// ---------------------------------------------------------------
// 13. Função chamada quando uma placa é detectada (backend -> JS)
// ---------------------------------------------------------------
function onPlacaDetectada(dados) {
  try {
    var obj = typeof dados === "string" ? JSON.parse(dados) : dados;

    if (_modalAcessoAberto) {
      console.log("Modal ocupado – adicionando à fila.");
      _filaAcesso.push(obj);
      return;
    }

    var placa = obj.placa;
    var veiculo = obj.veiculo || "";
    var morador = obj.morador || "";
    var dataHora = obj.data_hora || new Date().toLocaleString();

    if (typeof window.showAcessoModal === "function") {
      window.showAcessoModal(obj);
    }

    var tabela = document.getElementById("tabela-acessos");
    if (tabela) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        placa +
        "</td>" +
        "<td>" +
        (veiculo || "—") +
        "</td>" +
        "<td>" +
        (morador || "—") +
        "</td>" +
        "<td>" +
        dataHora +
        "</td>";
      tabela.insertBefore(tr, tabela.firstChild);
      while (tabela.children.length > 8) {
        tabela.removeChild(tabela.lastChild);
      }
    }
  } catch (e) {
    console.warn("onPlacaDetectada error", e);
  }
}

function processarProximaDetecção() {
  if (_filaAcesso.length === 0) return;
  var proximo = _filaAcesso.shift();

  setTimeout(function () {
    window.showAcessoModal(proximo);
  }, 300);
}

// ---------------------------------------------------------------
// 14. Comando de abertura do portão (enviado ao ESP32)
// ---------------------------------------------------------------
async function enviarComandoAbertura(tempoSegundos) {
  if (!automacaoAtiva) {
    console.log("Automação desativada – comando de abertura ignorado.");
    return;
  }
  if (typeof tempoSegundos === "undefined")
    tempoSegundos = OPEN_COMMAND_DURATION;
  try {
    await pywebview.api.enviar_comando_portao("OPEN", tempoSegundos);
  } catch (e) {
    console.warn("enviarComandoAbertura error", e);
  }
}

// ---------------------------------------------------------------
// 15. Countdown do modal de acesso
// ---------------------------------------------------------------
function iniciarCountdownAcesso(segundos) {
  if (_acessoCountdownInterval) clearInterval(_acessoCountdownInterval);

  var countdown = document.getElementById("acesso-countdown");
  var timer = document.getElementById("acesso-timer");
  countdown.style.display = "block";
  timer.textContent = segundos;

  var restante = segundos;
  _acessoCountdownInterval = setInterval(function () {
    restante--;
    timer.textContent = restante;
    if (restante <= 0) {
      clearInterval(_acessoCountdownInterval);
      _acessoCountdownInterval = null;
      registrarAcessoNoHistorico("autorizar");
      _modalAcessoAberto = false;
      fecharModal("modal-acesso");
      enviarComandoAbertura();
      processarProximaDetecção();
    }
  }, 1000);
}

async function cancelarAbertura() {
  if (_acessoCountdownInterval) {
    clearInterval(_acessoCountdownInterval);
    _acessoCountdownInterval = null;
  }
  await registrarAcessoNoHistorico("negar");
  _modalAcessoAberto = false;
  fecharModal("modal-acesso");
  processarProximaDetecção();
}

async function adiantarAbertura() {
  if (_acessoCountdownInterval) {
    clearInterval(_acessoCountdownInterval);
    _acessoCountdownInterval = null;
  }
  await registrarAcessoNoHistorico("autorizar");
  _modalAcessoAberto = false;
  fecharModal("modal-acesso");
  enviarComandoAbertura();
  processarProximaDetecção();
}

// ---------------------------------------------------------------
// 16. Inicialização
// ---------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  navegarPara("menu");
});

setInterval(atualizarStatus, 2000);

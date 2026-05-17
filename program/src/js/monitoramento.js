const CAMERA_TIMEOUT_MS = 5000;
let cameraTimeoutId = null;
let lastFrameBase64 = null;

// Atualizar status do sistema
function atualizarStatus() {
  pywebview.api.get_status().then(status => {
    document.getElementById('status-sistema').textContent = `Status do sistema: ${status}`;
  });
}

function setCameraPlaceholder(visible) {
  const placeholder = document.getElementById('camera-placeholder');
  if (!placeholder) return;
  placeholder.classList.toggle('hidden', !visible);
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

// Atualizar stream da câmera
function updateCameraStream(base64Data) {
  const stream = document.getElementById('camera-stream');
  if (!stream) return;
  lastFrameBase64 = base64Data;
  stream.src = base64Data;
  stream.style.backgroundImage = 'none';
  setCameraPlaceholder(false);
  resetCameraTimeout();
}

// Inicializar
setCameraPlaceholder(true);
atualizarStatus();
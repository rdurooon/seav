const CAMERA_TIMEOUT_MS = 5000;
let cameraTimeoutId = null;

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

function resetCameraTimeout() {
  if (cameraTimeoutId) {
    clearTimeout(cameraTimeoutId);
  }
  cameraTimeoutId = setTimeout(() => {
    setCameraPlaceholder(true);
    const stream = document.getElementById('camera-stream');
    if (stream) {
      stream.src = '';
    }
  }, CAMERA_TIMEOUT_MS);
}

// Atualizar stream da câmera
function updateCameraStream(base64Data) {
  const stream = document.getElementById('camera-stream');
  if (!stream) return;
  stream.src = base64Data;
  setCameraPlaceholder(false);
  resetCameraTimeout();
}

// Inicializar
setCameraPlaceholder(true);
atualizarStatus();
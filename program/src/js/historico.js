// Atualizar status do sistema
function atualizarStatus() {
  pywebview.api.get_status().then(status => {
    const el = document.getElementById('status-sistema');
    if (el) el.textContent = `Status do sistema: ${status}`;
  });
}

// Inicializar
atualizarStatus();
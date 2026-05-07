// Atualizar status do sistema
function atualizarStatus() {
  pywebview.api.get_status().then(status => {
    document.getElementById('status-sistema').textContent = `Status do sistema: ${status}`;
  });
}

// Inicializar
atualizarStatus();
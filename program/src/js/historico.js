// Atualizar status do sistema
function atualizarStatus() {
  pywebview.api.get_status().then(status => {
    const el = document.getElementById('status-sistema');
    if (el) el.textContent = `Status do sistema: ${status}`;
  }).catch(() => {});
}

function renderizarHistorico(dados) {
  const tbody = document.getElementById('tabela-historico');
  if (!tbody) return;

  tbody.innerHTML = '';

  dados.forEach((linha) => {
    const [placa, veiculo, morador, endereco, dataHora, status] = linha;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${placa || ''}</td>
      <td>${veiculo || ''}</td>
      <td>${morador || ''}</td>
      <td>${endereco || ''}</td>
      <td>${dataHora || ''}</td>
      <td>${status || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function carregarHistorico(dataInicio = null, dataFim = null, placa = null) {
  try {
    pywebview.api
      .listar_historico(dataInicio, dataFim, placa)
      .then((dados) => {
        renderizarHistorico(dados || []);
      })
      .catch(() => {
        renderizarHistorico([]);
      });
  } catch (e) {
    console.warn('carregarHistorico error', e);
    renderizarHistorico([]);
  }
}

function filtrar() {
  const dataInicio = document.getElementById('filtro-data-inicio')?.value || null;
  const dataFim = document.getElementById('filtro-data-fim')?.value || null;
  const placa = document.getElementById('filtro-placa')?.value || null;
  carregarHistorico(dataInicio, dataFim, placa);
}

function initHistorico() {
  atualizarStatus();
  carregarHistorico();
}

initHistorico();
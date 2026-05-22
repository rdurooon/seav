// Atualizar status do sistema
function atualizarStatus() {
  pywebview.api
    .get_status()
    .then((status) => {
      const el = document.getElementById("status-sistema");
      if (el) el.textContent = `Status do sistema: ${status}`;
    })
    .catch(() => {});
}

// ═══════════════════════════════════════
// RENDERIZAR TABELA
// ═══════════════════════════════════════
function renderizarHistorico(dados) {
  const tbody = document.getElementById("tabela-historico");
  if (!tbody) return;
  tbody.innerHTML = "";

  const TOTAL_LINHAS = 10;

  function celula(valor) {
    if (!valor)
      return `<td style="color:#aaa; font-style:italic;">Sem informação</td>`;
    return `<td>${valor}</td>`;
  }

  function celulaStatus(status) {
    if (!status)
      return `<td style="color:#aaa; font-style:italic;">Sem informação</td>`;
    const cor =
      status === "Autorizado"
        ? "background:#d1fae5; color:#065f46;"
        : "background:#fee2e2; color:#991b1b;";
    return `<td><span style="${cor} border-radius:6px; padding:2px 10px; font-size:0.8rem; font-weight:600;">${status}</span></td>`;
  }

  dados.forEach((linha) => {
    const [placa, veiculo, morador, endereco, dataHora, status] = linha;
    const tr = document.createElement("tr");
    tr.innerHTML = `
            ${celula(placa)}
            ${celula(veiculo)}
            ${celula(morador)}
            ${celula(endereco)}
            ${celula(dataHora)}
            ${celulaStatus(status)}
        `;
    tbody.appendChild(tr);
  });

  const linhasFaltando = TOTAL_LINHAS - dados.length;
  for (let i = 0; i < linhasFaltando; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
}

// ═══════════════════════════════════════
// CARREGAR E FILTRAR
// ═══════════════════════════════════════
function carregarHistorico(dataInicio = null, dataFim = null, placa = null) {
  try {
    pywebview.api
      .listar_historico(dataInicio, dataFim, placa)
      .then((dados) => renderizarHistorico(dados || []))
      .catch(() => renderizarHistorico([]));
  } catch (e) {
    console.warn("carregarHistorico error", e);
    renderizarHistorico([]);
  }
}

function filtrar() {
  const dataInicio =
    document.getElementById("filtro-data-inicio")?.value || null;
  const dataFim = document.getElementById("filtro-data-fim")?.value || null;
  const placa = document.getElementById("filtro-placa")?.value.trim() || null;

  console.log("Filtros:", { dataInicio, dataFim, placa });
  carregarHistorico(dataInicio, dataFim, placa);
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════
carregarHistorico();

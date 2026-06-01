// ═══════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════
var _historicoAtual = [];
var _exclusaoTipo = null;
var _exclusaoId = null;

// ═══════════════════════════════════════
// RENDERIZAR TABELA
// ═══════════════════════════════════════
function renderizarHistorico(dados) {
  const tbody = document.getElementById("tabela-historico");
  if (!tbody) return;
  tbody.innerHTML = "";
  _historicoAtual = [];

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

  dados.forEach((linha, idx) => {
    const [id, placa, veiculo, morador, endereco, dataHora, status] = linha;
    _historicoAtual[idx] = { id, placa, dataHora };

    const tr = document.createElement("tr");
    tr.innerHTML = `
            ${celula(placa)}
            ${celula(veiculo)}
            ${celula(morador)}
            ${celula(endereco)}
            ${celula(dataHora)}
            ${celulaStatus(status)}
        `;

    const tdAcoes = document.createElement("td");
    tdAcoes.style.textAlign = "center";
    const spanLimpar = document.createElement("span");
    spanLimpar.title = "Remover linha";
    spanLimpar.textContent = "Limpar";
    spanLimpar.style.cssText =
      "cursor:pointer; color:#e74c3c; font-weight:600; font-size:0.8rem; text-decoration:underline;";
    spanLimpar.onclick = () => abrirConfirmarExclusaoIndividual(idx);
    tdAcoes.appendChild(spanLimpar);
    tr.appendChild(tdAcoes);

    tr.ondblclick = () =>
      abrirInfoHistorico(placa, veiculo, morador, endereco, dataHora, status);
    tbody.appendChild(tr);
  });

  for (let i = dados.length; i < TOTAL_LINHAS; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td></td>`;
    tbody.appendChild(tr);
  }
}

// ═══════════════════════════════════════
// EXCLUSÃO
// ═══════════════════════════════════════
function abrirConfirmarExclusaoIndividual(idx) {
  const linha = _historicoAtual[idx];
  if (!linha || !linha.id) {
    alert("Registro não encontrado!");
    return;
  }
  _exclusaoTipo = "individual";
  _exclusaoId = linha.id;
  document.getElementById("msg-confirmar-hist").textContent =
    `Deseja excluir o registro da placa ${linha.placa} (${linha.dataHora})?`;
  abrirModal("modal-confirmar-historico");
}

function abrirConfirmarExclusaoTotal() {
  _exclusaoTipo = "total";
  document.getElementById("msg-confirmar-hist").textContent =
    "⚠️ Esta ação irá excluir TODOS os registros do histórico permanentemente. Deseja continuar?";
  abrirModal("modal-confirmar-historico");
}

function fecharModalConfirmarHist() {
  fecharModal("modal-confirmar-historico");
}

async function executarExclusaoHist() {
  const btn = document.getElementById("btn-confirmar-hist");
  btn.disabled = true;
  btn.textContent = "Excluindo...";

  try {
    if (_exclusaoTipo === "individual") {
      const ok =
        await window.pywebview.api.deletar_historico_linha_por_id(_exclusaoId);
      if (!ok) alert("Erro ao excluir o registro.");
    } else if (_exclusaoTipo === "total") {
      const ok = await window.pywebview.api.limpar_historico();
      if (!ok) alert("Erro ao limpar o histórico.");
    }
    filtrar();
  } catch (e) {
    alert("Erro ao processar exclusão.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Excluir";
    fecharModalConfirmarHist();
  }
}

// ═══════════════════════════════════════
// LIMPAR TODO O HISTÓRICO (função global)
// ═══════════════════════════════════════
window.limparTodoHistorico = function () {
  abrirConfirmarExclusaoTotal();
};

// ═══════════════════════════════════════
// MODAL INFO HISTÓRICO
// ═══════════════════════════════════════
function abrirInfoHistorico(
  placa,
  veiculo,
  morador,
  endereco,
  dataHora,
  status,
) {
  document.getElementById("hist-placa").textContent = placa || "Sem informação";
  document.getElementById("hist-veiculo").textContent =
    veiculo || "Sem informação";
  document.getElementById("hist-morador").textContent =
    morador || "Sem informação";
  document.getElementById("hist-endereco").textContent =
    endereco || "Sem informação";
  document.getElementById("hist-datahora").textContent =
    dataHora || "Sem informação";

  const statusEl = document.getElementById("hist-status");
  if (status === "Autorizado") {
    statusEl.innerHTML = `<span style="background:#d1fae5; color:#065f46; border-radius:6px; padding:2px 10px; font-size:0.85rem; font-weight:600;">Autorizado</span>`;
  } else if (status) {
    statusEl.innerHTML = `<span style="background:#fee2e2; color:#991b1b; border-radius:6px; padding:2px 10px; font-size:0.85rem; font-weight:600;">${status}</span>`;
  } else {
    statusEl.textContent = "Sem informação";
  }

  abrirModal("modal-info-historico");
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
  carregarHistorico(dataInicio, dataFim, placa);
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO + EVENTO NO BOTÃO
// ═══════════════════════════════════════
function iniciarHistorico() {
  if (typeof pywebview !== "undefined" && pywebview.api?.listar_historico) {
    carregarHistorico();
  } else {
    setTimeout(iniciarHistorico, 100);
  }
}


(function attachLimparTudo() {
  const btn = document.querySelector(".btn-limpar-tudo");
  if (btn) {
    btn.onclick = window.limparTodoHistorico;
  } else {
    setTimeout(attachLimparTudo, 100);
  }
})();

iniciarHistorico();


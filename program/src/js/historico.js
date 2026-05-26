// ═══════════════════════════════════════
// VARIÁVEIS DE EXCLUSÃO TEMPORÁRIA
// ═══════════════════════════════════════
var _exclusaoTipo = null;
var _exclusaoId = null;
var _exclusaoPlaca = null;
var _exclusaoDataHora = null;

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

  // Reinicializa array global
  _historicoAtual = [];

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
        <td style="text-align:center;">
            <span class="btn-lixeira" title="Remover linha" 
                onclick="abrirConfirmarExclusaoIndividual(${idx}, this)">Limpar Resgistro</span>
        </td>
    `;
    tr.ondblclick = () =>
      abrirInfoHistorico(placa, veiculo, morador, endereco, dataHora, status);
    tbody.appendChild(tr);
  });

  // Preenche linhas vazias
  for (let i = dados.length; i < TOTAL_LINHAS; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="color:#aaa; font-style:italic;">—</td>
      <td style="color:#aaa; font-style:italic;">—</td>
      <td style="color:#aaa; font-style:italic;">—</td>
      <td style="color:#aaa; font-style:italic;">—</td>
      <td style="color:#aaa; font-style:italic;">—</td>
      <td style="color:#aaa; font-style:italic;">—</td>
      <td></td>
    `;
    tbody.appendChild(tr);
  }
}

// ═══════════════════════════════════════
// CONFIRMAÇÃO VIA MODAL
// ═══════════════════════════════════════
function abrirConfirmarExclusaoIndividual(idx, elemento) {
  const linha = _historicoAtual[idx];
  if (!linha || !linha.id) {
    alert("Registro não encontrado!");
    return;
  }
  _exclusaoTipo = "individual";
  _exclusaoId = linha.id;
  _exclusaoPlaca = linha.placa;
  _exclusaoDataHora = linha.dataHora;
  document.getElementById("msg-confirmar-hist").textContent =
    `Deseja realmente excluir o registro da placa ${linha.placa} (${linha.dataHora})?`;
  abrirModal("modal-confirmar-historico");
}

function abrirConfirmarExclusaoTotal() {
  _exclusaoTipo = "total";
  document.getElementById("msg-confirmar-hist").textContent =
    "ATENÇÃO: Esta ação irá excluir TODOS os registros do histórico permanentemente! Deseja continuar?";
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
      const resultado =
        await window.pywebview.api.deletar_historico_linha_por_id(_exclusaoId);
      if (resultado) {
        filtrar();
      } else {
        alert("Erro ao excluir o registro.");
      }
    } else if (_exclusaoTipo === "total") {
      const resultado = await window.pywebview.api.limpar_historico();
      if (resultado) {
        filtrar();
      } else {
        alert("Erro ao limpar o histórico.");
      }
    }
  } catch (error) {
    console.error("Erro na exclusão:", error);
    alert("Erro ao processar exclusão.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Excluir";
    fecharModalConfirmarHist();
  }
}

// ═══════════════════════════════════════
// LIMPAR TODO O HISTÓRICO (via modal)
// ═══════════════════════════════════════
function limparTodoHistorico() {
  abrirConfirmarExclusaoTotal();
}

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

  console.log("Filtros:", { dataInicio, dataFim, placa });
  carregarHistorico(dataInicio, dataFim, placa);
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════
function iniciarHistorico() {
  if (
    typeof pywebview !== "undefined" &&
    pywebview.api &&
    pywebview.api.listar_historico
  ) {
    carregarHistorico();
  } else {
    console.warn(
      "[Historico] API ainda não disponível, tentando novamente em 100ms...",
    );
    setTimeout(iniciarHistorico, 100);
  }
}

iniciarHistorico();

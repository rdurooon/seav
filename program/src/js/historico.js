// ---------------------------------------------------------------
// 1. Estado global do módulo
// ---------------------------------------------------------------
var _historicoAtual = [];
var _exclusaoTipo = null;
var _exclusaoId = null;

// ---------------------------------------------------------------
// 2. Renderização da tabela de histórico
// ---------------------------------------------------------------
function renderizarHistorico(dados) {
  var tbody = document.getElementById("tabela-historico");
  if (!tbody) return;
  tbody.innerHTML = "";
  _historicoAtual = [];

  var TOTAL_LINHAS = 10;

  function celula(valor) {
    if (!valor) {
      return '<td style="color:#aaa; font-style:italic;">Sem informação</td>';
    }
    return "<td>" + valor + "</td>";
  }

  function celulaStatus(status) {
    if (!status) {
      return '<td style="color:#aaa; font-style:italic;">Sem informação</td>';
    }
    var cor =
      status === "Autorizado"
        ? "background:#d1fae5; color:#065f46;"
        : "background:#fee2e2; color:#991b1b;";
    return (
      '<td><span style="' +
      cor +
      ' border-radius:6px; padding:2px 10px; font-size:0.8rem; font-weight:600;">' +
      status +
      "</span></td>"
    );
  }

  dados.forEach(function (linha, idx) {
    var id = linha[0],
      placa = linha[1],
      veiculo = linha[2],
      morador = linha[3],
      endereco = linha[4],
      dataHora = linha[5],
      status = linha[6];

    _historicoAtual[idx] = { id: id, placa: placa, dataHora: dataHora };

    var tr = document.createElement("tr");
    tr.innerHTML =
      celula(placa) +
      celula(veiculo) +
      celula(morador) +
      celula(endereco) +
      celula(dataHora) +
      celulaStatus(status);

    // Botão de exclusão individual
    var tdAcoes = document.createElement("td");
    tdAcoes.style.textAlign = "center";

    var spanLimpar = document.createElement("span");
    spanLimpar.title = "Remover linha";
    spanLimpar.textContent = "Limpar";
    spanLimpar.style.cssText =
      "cursor:pointer; color:#e74c3c; font-weight:600; font-size:0.8rem; text-decoration:underline;";
    spanLimpar.onclick = (function (i) {
      return function () {
        abrirConfirmarExclusaoIndividual(i);
      };
    })(idx);
    tdAcoes.appendChild(spanLimpar);
    tr.appendChild(tdAcoes);

    // Duplo clique para abrir detalhes
    tr.ondblclick = (function (p, v, m, e, d, s) {
      return function () {
        abrirInfoHistorico(p, v, m, e, d, s);
      };
    })(placa, veiculo, morador, endereco, dataHora, status);

    tbody.appendChild(tr);
  });

  // Preenche linhas vazias até o total fixo
  for (var i = dados.length; i < TOTAL_LINHAS; i++) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td></td>";
    tbody.appendChild(tr);
  }
}

// ---------------------------------------------------------------
// 3. Exclusão de registros
// ---------------------------------------------------------------
function abrirConfirmarExclusaoIndividual(idx) {
  var linha = _historicoAtual[idx];
  if (!linha || !linha.id) {
    alert("Registro não encontrado!");
    return;
  }
  _exclusaoTipo = "individual";
  _exclusaoId = linha.id;
  document.getElementById("msg-confirmar-hist").textContent =
    "Deseja excluir o registro da placa " +
    linha.placa +
    " (" +
    linha.dataHora +
    ")?";
  abrirModal("modal-confirmar-historico");
}

function abrirConfirmarExclusaoTotal() {
  _exclusaoTipo = "total";
  document.getElementById("msg-confirmar-hist").textContent =
    "Esta ação irá excluir TODOS os registros do histórico permanentemente. Deseja continuar?";
  abrirModal("modal-confirmar-historico");
}

function fecharModalConfirmarHist() {
  fecharModal("modal-confirmar-historico");
}

async function executarExclusaoHist() {
  var btn = document.getElementById("btn-confirmar-hist");
  btn.disabled = true;
  btn.textContent = "Excluindo...";

  try {
    if (_exclusaoTipo === "individual") {
      var ok =
        await window.pywebview.api.deletar_historico_linha_por_id(_exclusaoId);
      if (!ok) alert("Erro ao excluir o registro.");
    } else if (_exclusaoTipo === "total") {
      var ok = await window.pywebview.api.limpar_historico();
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

// ---------------------------------------------------------------
// 4. Limpar todo o histórico (função global)
// ---------------------------------------------------------------
window.limparTodoHistorico = function () {
  abrirConfirmarExclusaoTotal();
};

// ---------------------------------------------------------------
// 5. Modal de detalhes do acesso (duplo clique)
// ---------------------------------------------------------------
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

  var statusEl = document.getElementById("hist-status");
  if (status === "Autorizado") {
    statusEl.innerHTML =
      '<span style="background:#d1fae5; color:#065f46; border-radius:6px; padding:2px 10px; font-size:0.85rem; font-weight:600;">Autorizado</span>';
  } else if (status) {
    statusEl.innerHTML =
      '<span style="background:#fee2e2; color:#991b1b; border-radius:6px; padding:2px 10px; font-size:0.85rem; font-weight:600;">' +
      status +
      "</span>";
  } else {
    statusEl.textContent = "Sem informação";
  }

  abrirModal("modal-info-historico");
}

// ---------------------------------------------------------------
// 6. Carregamento e filtros
// ---------------------------------------------------------------
function carregarHistorico(dataInicio, dataFim, placa) {
  if (typeof dataInicio === "undefined") dataInicio = null;
  if (typeof dataFim === "undefined") dataFim = null;
  if (typeof placa === "undefined") placa = null;

  try {
    pywebview.api
      .listar_historico(dataInicio, dataFim, placa)
      .then(function (dados) {
        renderizarHistorico(dados || []);
      })
      .catch(function () {
        renderizarHistorico([]);
      });
  } catch (e) {
    console.warn("carregarHistorico error", e);
    renderizarHistorico([]);
  }
}

function filtrar() {
  var dataInicio = document.getElementById("filtro-data-inicio");
  var dataFim = document.getElementById("filtro-data-fim");
  var placa = document.getElementById("filtro-placa");

  dataInicio = dataInicio ? dataInicio.value || null : null;
  dataFim = dataFim ? dataFim.value || null : null;
  placa = placa ? placa.value.trim() || null : null;

  carregarHistorico(dataInicio, dataFim, placa);
}

// ---------------------------------------------------------------
// 7. Inicialização e vínculo do botão "Limpar histórico"
// ---------------------------------------------------------------
function iniciarHistorico() {
  if (
    typeof pywebview !== "undefined" &&
    pywebview.api &&
    pywebview.api.listar_historico
  ) {
    carregarHistorico();
  } else {
    setTimeout(iniciarHistorico, 100);
  }
}

(function attachLimparTudo() {
  var btn = document.querySelector(".btn-limpar-tudo");
  if (btn) {
    btn.onclick = window.limparTodoHistorico;
  } else {
    setTimeout(attachLimparTudo, 100);
  }
})();

// ---------------------------------------------------------------
// 8. Exportar relatório (abre modal existente e salva PDF)
// ---------------------------------------------------------------
(function attachExportarRelatorio() {
  var btn = document.getElementById("btn-exportar-relatorio");
  if (!btn) {
    setTimeout(attachExportarRelatorio, 100);
    return;
  }

  btn.onclick = function () {
    // reaproveitar modal de confirmação, mas inserir slider e botão Exportar
    var containerMsg = document.getElementById("msg-confirmar-hist");
    var originalMsg = containerMsg.textContent;
    containerMsg.textContent = "Após exportar relatório, deseja excluir todo o histórico?";

    var btnConfirm = document.getElementById("btn-confirmar-hist");
    var btnCancelar = document.querySelector("#modal-confirmar-historico .btn-cancelar");
    var modalRodape = btnConfirm ? btnConfirm.parentNode : null;

    // salvar estado anterior para restaurar
    var prevConfirmText = btnConfirm.textContent;
    var prevCancelText = btnCancelar.textContent;
    var prevConfirmOnclick = btnConfirm.onclick;
    var prevCancelOnclick = btnCancelar.onclick;
    var prevConfirmStyle = btnConfirm.getAttribute("style");
    var prevCancelStyle = btnCancelar.getAttribute("style");

    // inverter ordem dos botões para exportação
    if (modalRodape && btnConfirm && btnCancelar && btnConfirm.parentNode === modalRodape) {
      modalRodape.insertBefore(btnConfirm, btnCancelar);
    }

    // criar slider + label e inserir antes dos botões
    var modalBox = document.querySelector("#modal-confirmar-historico .modal-box");
    var sliderContainer = document.createElement("div");
    sliderContainer.style.display = "flex";
    sliderContainer.style.alignItems = "center";
    sliderContainer.style.justifyContent = "center";
    sliderContainer.style.gap = "12px";
    sliderContainer.style.marginBottom = "12px";

    sliderContainer.innerHTML =
      '<label class="slider-toggle"><input type="checkbox" id="export-delete-toggle"><span class="slider-thumb"></span></label>' +
      '<span style="font-size:0.95rem">Excluir histórico após exportar</span>';

    modalBox.insertBefore(sliderContainer, modalBox.querySelector('.modal-rodape'));

    // configurar botoes: confirmar = Exportar, cancelar = Cancelar
    btnConfirm.textContent = "Exportar";
    btnCancelar.textContent = "Cancelar";
    btnConfirm.style.background = "var(--cor-principal)";
    btnConfirm.style.color = "#fff";
    btnConfirm.style.border = "none";

    btnConfirm.onclick = function () {
      var tog = document.getElementById("export-delete-toggle");
      var deletar = !!(tog && tog.checked);
      fecharModal("modal-confirmar-historico");
      executarExportacao(deletar).finally(function () {
        // restaurar estado original
        btnConfirm.textContent = prevConfirmText;
        btnCancelar.textContent = prevCancelText;
        btnConfirm.onclick = prevConfirmOnclick;
        btnCancelar.onclick = prevCancelOnclick;
        if (prevConfirmStyle !== null) {
          btnConfirm.setAttribute("style", prevConfirmStyle);
        } else {
          btnConfirm.removeAttribute("style");
        }
        if (prevCancelStyle !== null) {
          btnCancelar.setAttribute("style", prevCancelStyle);
        } else {
          btnCancelar.removeAttribute("style");
        }
        if (modalRodape && btnConfirm && btnCancelar) {
          modalRodape.insertBefore(btnCancelar, btnConfirm);
        }
        containerMsg.textContent = originalMsg;
        // remover slider element
        if (sliderContainer && sliderContainer.parentNode) sliderContainer.parentNode.removeChild(sliderContainer);
      });
    };

    btnCancelar.onclick = function () {
      // fechar modal e restaurar sem exportar
      fecharModal("modal-confirmar-historico");
      btnConfirm.textContent = prevConfirmText;
      btnCancelar.textContent = prevCancelText;
      btnConfirm.onclick = prevConfirmOnclick;
      btnCancelar.onclick = prevCancelOnclick;
      if (prevConfirmStyle !== null) {
        btnConfirm.setAttribute("style", prevConfirmStyle);
      } else {
        btnConfirm.removeAttribute("style");
      }
      if (prevCancelStyle !== null) {
        btnCancelar.setAttribute("style", prevCancelStyle);
      } else {
        btnCancelar.removeAttribute("style");
      }
      if (modalRodape && btnConfirm && btnCancelar) {
        modalRodape.insertBefore(btnCancelar, btnConfirm);
      }
      containerMsg.textContent = originalMsg;
      if (sliderContainer && sliderContainer.parentNode) sliderContainer.parentNode.removeChild(sliderContainer);
    };

    abrirModal("modal-confirmar-historico");
  };
})();

async function executarExportacao(deletarAposExportar) {
  try {
    var dataInicio = document.getElementById("filtro-data-inicio");
    var dataFim = document.getElementById("filtro-data-fim");
    var placa = document.getElementById("filtro-placa");

    dataInicio = dataInicio ? dataInicio.value || null : null;
    dataFim = dataFim ? dataFim.value || null : null;
    placa = placa ? placa.value.trim() || null : null;

    var resultado = await window.pywebview.api.exportar_relatorio(
      dataInicio,
      dataFim,
      placa,
      deletarAposExportar,
    );

    if (!resultado) {
      alert("Exportação cancelada ou falhou.");
      return;
    }

    if (resultado.saved) {
      alert("Relatório salvo em: " + (resultado.path || ""));
      if (deletarAposExportar && resultado.deleted) {
        // recarregar histórico
        filtrar();
      } else if (deletarAposExportar && !resultado.deleted) {
        alert("O relatório foi salvo, mas ocorreu erro ao excluir o histórico.");
      }
    } else {
      // Usuário cancelou a ação de salvar
      // não remover histórico mesmo que tivesse escolhido
    }
  } catch (e) {
    console.error(e);
    alert("Erro ao exportar relatório.");
  }
}

iniciarHistorico();

// ---------------------------------------------------------------
// 1. Renderização da tabela de relatório
// ---------------------------------------------------------------
function renderizarRelatorio(dados) {
  var tbody = document.getElementById('tabela-relatorio');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!dados || dados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#aaa; font-style:italic;">Nenhum resultado encontrado</td></tr>';
    return;
  }

  dados.forEach(function (linha) {
    var id = linha[0],
        placa = linha[1],
        veiculo = linha[2],
        morador = linha[3],
        endereco = linha[4],
        dataHora = linha[5],
        status = linha[6];

    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (placa || 'Sem informação') + '</td>' +
      '<td>' + (veiculo || 'Sem informação') + '</td>' +
      '<td>' + (morador || 'Sem informação') + '</td>' +
      '<td>' + (endereco || 'Sem informação') + '</td>' +
      '<td>' + (dataHora || 'Sem informação') + '</td>' +
      '<td>' + (status || 'Sem informação') + '</td>';
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------
// 2. Carregamento e filtros
// ---------------------------------------------------------------
function carregarRelatorio(dataInicio, dataFim, placa) {
  if (typeof dataInicio === 'undefined') dataInicio = null;
  if (typeof dataFim === 'undefined') dataFim = null;
  if (typeof placa === 'undefined') placa = null;

  try {
    pywebview.api
      .listar_historico(dataInicio, dataFim, placa)
      .then(function (dados) {
        renderizarRelatorio(dados || []);
      })
      .catch(function () {
        renderizarRelatorio([]);
      });
  } catch (e) {
    console.warn('carregarRelatorio error', e);
    renderizarRelatorio([]);
  }
}

function filtrarRelatorio() {
  var dataInicio = document.getElementById('filtro-data-inicio-rel');
  var dataFim = document.getElementById('filtro-data-fim-rel');
  var placa = document.getElementById('filtro-placa-rel');

  dataInicio = dataInicio ? dataInicio.value || null : null;
  dataFim = dataFim ? dataFim.value || null : null;
  placa = placa ? placa.value.trim() || null : null;

  carregarRelatorio(dataInicio, dataFim, placa);
}

// ---------------------------------------------------------------
// 3. Exportação para CSV
// ---------------------------------------------------------------
function exportarRelatorio() {
  var linhas = [];
  var tabela = document.getElementById('tabela-relatorio');
  var trs = tabela.querySelectorAll('tr');

  trs.forEach(function (tr) {
    var tds = tr.querySelectorAll('td');
    if (tds.length === 0) return; // ignora cabeçalho
    var linha = [];
    tds.forEach(function (td) {
      linha.push('"' + td.textContent.replace(/"/g, '""') + '"');
    });
    linhas.push(linha.join(','));
  });

  if (linhas.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }

  var csv = '\uFEFF' + 'Placa,Veículo,Morador,Endereço,Data e hora,Status\n' + linhas.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'relatorio_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------
// 4. Inicialização
// ---------------------------------------------------------------
function iniciarRelatorio() {
  if (typeof pywebview !== 'undefined' && pywebview.api && pywebview.api.listar_historico) {
    carregarRelatorio();
  } else {
    setTimeout(iniciarRelatorio, 100);
  }
}

iniciarRelatorio();
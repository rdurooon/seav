// ---------------------------------------------------------------
// 1. Estado global do módulo
// ---------------------------------------------------------------
var linhaSelecionada = null;
var idSelecionado = null;
var cacheVeiculos = [];
var acaoBusca = null;

// ---------------------------------------------------------------
// 2. Carregamento e renderização da tabela
// ---------------------------------------------------------------
async function carregarVeiculos() {
  cacheVeiculos = await window.pywebview.api.listar_completo();
  renderizarTabela(cacheVeiculos);
}

function renderizarTabela(dados) {
  var tbody = document.getElementById("tabela-veiculos");
  tbody.innerHTML = "";
  var TOTAL_LINHAS = 10;

  function celula(valor) {
    if (!valor) {
      return '<td style="color:#aaa; font-style:italic;">Sem informação</td>';
    }
    return "<td>" + valor + "</td>";
  }

  function formatarPlaca(placa) {
    if (!placa) return null;
    return placa.replace(/-/g, "").toUpperCase();
  }

  function formatarCor(cor) {
    if (!cor) return null;
    return cor.charAt(0).toUpperCase() + cor.slice(1).toLowerCase();
  }

  dados.forEach(function (linha) {
    var id = linha[0];
    var nome = linha[1];
    var cpf = linha[2];
    var modelo = linha[3];
    var cor = linha[4];
    var placa = linha[5];

    var tr = document.createElement("tr");
    tr.innerHTML =
      celula(formatarPlaca(placa)) +
      celula(modelo) +
      celula(nome) +
      celula(formatarCor(cor));

    tr.onclick = function () {
      selecionarLinha(tr, id);
    };
    tr.ondblclick = function () {
      abrirInfoCadastrado(id);
    };
    tbody.appendChild(tr);
  });

  // Preenche linhas vazias até o total fixo
  for (var i = dados.length; i < TOTAL_LINHAS; i++) {
    var tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td></td><td></td><td></td>";
    tbody.appendChild(tr);
  }
}

// ---------------------------------------------------------------
// 3. Pesquisa (campo principal e modal de busca)
// ---------------------------------------------------------------
function detectarFiltro(termo) {
  if (/^\d+$/.test(termo)) return "cpf";
  if (/[.\-]/.test(termo) && /\d/.test(termo)) return "cpf";
  if (/[a-zA-Z]/.test(termo) && /\d/.test(termo)) return "placa";
  return "nome";
}

function aplicarMascaraCPFPesquisa(campo) {
  var apenasNumeros = campo.value.replace(/\D/g, "");
  if (
    /^\d+$/.test(campo.value.replace(/\D/g, "")) &&
    apenasNumeros.length > 0
  ) {
    var v = apenasNumeros;
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    campo.value = v;
  }
}

function pesquisar() {
  var campo = document.getElementById("campo-pesquisa");
  if (/^\d[\d.]*$/.test(campo.value)) aplicarMascaraCPFPesquisa(campo);

  var termo = campo.value.toLowerCase();
  if (!termo) {
    renderizarTabela(cacheVeiculos);
    return;
  }

  var filtro = detectarFiltro(termo);
  var filtrado = cacheVeiculos.filter(function (linha) {
    var id = linha[0];
    var nome = linha[1];
    var cpf = linha[2];
    var modelo = linha[3];
    var cor = linha[4];
    var placa = linha[5];

    var cpfLimpo = (cpf || "").replace(/\D/g, "");
    var termoLimpo = termo.replace(/\D/g, "");
    var placaLimpa = (placa || "").replace(/-/g, "").toLowerCase();

    if (filtro === "cpf") return cpfLimpo.indexOf(termoLimpo) !== -1;
    if (filtro === "placa")
      return placaLimpa.indexOf(termo.replace(/-/g, "")) !== -1;
    if (filtro === "nome")
      return (nome || "").toLowerCase().indexOf(termo) !== -1;
    return true;
  });

  renderizarTabela(filtrado);
}

function buscarNoModal() {
  var campo = document.getElementById("campo-busca-modal");
  if (/^\d[\d.]*$/.test(campo.value)) aplicarMascaraCPFPesquisa(campo);

  var termo = campo.value.toLowerCase();
  var container = document.getElementById("resultados-busca");
  container.innerHTML = "";

  if (!termo) return;

  var filtro = detectarFiltro(termo);
  var filtrado = cacheVeiculos.filter(function (linha) {
    var id = linha[0];
    var nome = linha[1];
    var cpf = linha[2];
    var placa = linha[5];

    var cpfLimpo = (cpf || "").replace(/\D/g, "");
    var termoLimpo = termo.replace(/\D/g, "");
    var placaLimpa = (placa || "").replace(/-/g, "").toLowerCase();

    if (filtro === "cpf") return cpfLimpo.indexOf(termoLimpo) !== -1;
    if (filtro === "placa")
      return placaLimpa.indexOf(termo.replace(/-/g, "")) !== -1;
    if (filtro === "nome")
      return (nome || "").toLowerCase().indexOf(termo) !== -1;
    return true;
  });

  if (filtrado.length === 0) {
    container.innerHTML =
      '<p style="color:#aaa; text-align:center; font-style:italic;">Nenhum resultado encontrado</p>';
    return;
  }

  filtrado.forEach(function (linha) {
    var id = linha[0];
    var nome = linha[1];
    var placa = linha[5];
    var modelo = linha[3];

    var div = document.createElement("div");
    div.style.cssText =
      "padding: 10px 14px; border: 1.5px solid var(--cor-borda); border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; font-size: 0.9rem;";
    div.innerHTML =
      "<span><strong>" +
      nome +
      "</strong></span>" +
      '<span style="color:#888;">' +
      (placa ? placa.replace(/-/g, "").toUpperCase() : "Sem placa") +
      " · " +
      (modelo || "Sem veículo") +
      "</span>";

    div.onmouseover = function () {
      div.style.background = "#f0f4f8";
    };
    div.onmouseout = function () {
      div.style.background = "";
    };
    div.onclick = function () {
      selecionarDaBusca(id);
    };
    container.appendChild(div);
  });
}

// ---------------------------------------------------------------
// 4. Seleção de linha na tabela
// ---------------------------------------------------------------
function selecionarLinha(tr, id) {
  if (linhaSelecionada) linhaSelecionada.classList.remove("linha-selecionada");
  if (linhaSelecionada === tr) {
    linhaSelecionada = null;
    idSelecionado = null;
    return;
  }
  tr.classList.add("linha-selecionada");
  linhaSelecionada = tr;
  idSelecionado = id;
}

// ---------------------------------------------------------------
// 5. Operações CRUD (Remover, Adicionar, Atualizar)
// ---------------------------------------------------------------
function remover() {
  if (!linhaSelecionada) {
    idSelecionado = null;
    abrirModalBusca("remover");
    return;
  }
  var nome = linhaSelecionada.cells[2].textContent;
  document.getElementById("msg-remover").textContent =
    'Tem certeza que deseja remover "' +
    nome +
    '"? Esta ação não pode ser desfeita.';
  abrirModal("modal-remover");
}

function fecharModalRemover() {
  fecharModal("modal-remover");
}

async function confirmarRemover() {
  var btnRemover = document.querySelector("#modal-remover button:last-child");
  btnRemover.disabled = true;
  btnRemover.textContent = "Removendo...";

  await window.pywebview.api.deletar_morador(idSelecionado);

  btnRemover.disabled = false;
  btnRemover.textContent = "Remover";
  fecharModalRemover();
  linhaSelecionada = null;
  idSelecionado = null;
  carregarVeiculos();
}

// ---- Adicionar ----
function abrirModalAdicionar() {
  abrirModal("modal-adicionar");
}

function fecharModalAdicionar() {
  fecharModal("modal-adicionar");
  limparModalAdicionar();
}

function limparModalAdicionar() {
  var campos = [
    "add-nome",
    "add-cpf",
    "add-data",
    "add-sexo",
    "add-celular",
    "add-email",
    "add-cep",
    "add-numero",
    "add-rua",
    "add-bairro",
    "add-cidade",
    "add-estado",
    "add-modelo",
    "add-cor",
    "add-placa",
  ];
  campos.forEach(function (id) {
    document.getElementById(id).value = "";
  });
}

async function salvarAdicionar() {
  var cpf = document.getElementById("add-cpf").value;
  if (!validarCPF(cpf)) {
    alert("CPF inválido!");
    return;
  }

  var btnSalvar = document.querySelector("#modal-adicionar button:last-child");
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  var dados = {
    nome: document.getElementById("add-nome").value,
    cpf: document.getElementById("add-cpf").value,
    data_nascimento: document.getElementById("add-data").value,
    sexo: document.getElementById("add-sexo").value,
    celular: document.getElementById("add-celular").value,
    email: document.getElementById("add-email").value,
    rua: document.getElementById("add-rua").value,
    numero: document.getElementById("add-numero").value,
    bairro: document.getElementById("add-bairro").value,
    cidade: document.getElementById("add-cidade").value,
    estado: document.getElementById("add-estado").value,
    cep: document.getElementById("add-cep").value,
    modelo: document.getElementById("add-modelo").value,
    cor: document.getElementById("add-cor").value,
    placa: document.getElementById("add-placa").value,
  };

  var resultado = await window.pywebview.api.cadastrar_completo(dados);
  alert(resultado);

  btnSalvar.disabled = false;
  btnSalvar.textContent = "Salvar";
  fecharModalAdicionar();
  carregarVeiculos();
}

// ---- Atualizar ----
async function atualizar() {
  if (!linhaSelecionada) {
    idSelecionado = null;
    abrirModalBusca("atualizar");
    return;
  }
  var dados = await window.pywebview.api.buscar_morador(idSelecionado);
  abrirModalAtualizar(dados);
}

function abrirModalAtualizar(dados) {
  var id = dados[0],
    nome = dados[1],
    cpf = dados[2],
    dataNasc = dados[3],
    sexo = dados[4],
    celular = dados[5],
    email = dados[6],
    rua = dados[7],
    numero = dados[8],
    bairro = dados[9],
    cidade = dados[10],
    estado = dados[11],
    cep = dados[12],
    modelo = dados[13],
    cor = dados[14],
    placa = dados[15];

  document.getElementById("upd-nome").value = nome || "";
  document.getElementById("upd-cpf").value = cpf || "";
  document.getElementById("upd-data").value = dataNasc || "";
  document.getElementById("upd-sexo").value = sexo || "";
  document.getElementById("upd-celular").value = celular || "";
  document.getElementById("upd-email").value = email || "";
  document.getElementById("upd-rua").value = rua || "";
  document.getElementById("upd-numero").value = numero || "";
  document.getElementById("upd-bairro").value = bairro || "";
  document.getElementById("upd-cidade").value = cidade || "";
  document.getElementById("upd-estado").value = estado || "";
  document.getElementById("upd-cep").value = cep || "";
  document.getElementById("upd-modelo").value = modelo || "";
  document.getElementById("upd-cor").value = cor || "";
  document.getElementById("upd-placa").value = placa || "";

  abrirModal("modal-atualizar");
}

function fecharModalAtualizar() {
  fecharModal("modal-atualizar");
}

async function salvarAtualizar() {
  var cpf = document.getElementById("upd-cpf").value;
  if (!validarCPF(cpf)) {
    alert("CPF inválido!");
    return;
  }

  var btnSalvar = document.querySelector("#modal-atualizar button:last-child");
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  var dados = {
    id_morador: idSelecionado,
    nome: document.getElementById("upd-nome").value,
    cpf: document.getElementById("upd-cpf").value,
    data_nascimento: document.getElementById("upd-data").value,
    sexo: document.getElementById("upd-sexo").value,
    celular: document.getElementById("upd-celular").value,
    email: document.getElementById("upd-email").value,
    rua: document.getElementById("upd-rua").value,
    numero: document.getElementById("upd-numero").value,
    bairro: document.getElementById("upd-bairro").value,
    cidade: document.getElementById("upd-cidade").value,
    estado: document.getElementById("upd-estado").value,
    cep: document.getElementById("upd-cep").value,
    modelo: document.getElementById("upd-modelo").value,
    cor: document.getElementById("upd-cor").value,
    placa: document.getElementById("upd-placa").value,
  };

  var resultado = await window.pywebview.api.atualizar_morador(dados);
  alert(resultado);

  btnSalvar.disabled = false;
  btnSalvar.textContent = "Salvar";
  fecharModalAtualizar();
  document.getElementById("campo-pesquisa").value = "";
  linhaSelecionada = null;
  idSelecionado = null;
  carregarVeiculos();
}

// ---------------------------------------------------------------
// 6. Modal de busca (usado por Remover e Atualizar)
// ---------------------------------------------------------------
function abrirModalBusca(acao) {
  acaoBusca = acao;
  document.getElementById("modal-busca-titulo").textContent =
    acao === "atualizar" ? "Buscar para Atualizar" : "Buscar para Remover";
  document.getElementById("campo-busca-modal").value = "";
  document.getElementById("resultados-busca").innerHTML = "";
  abrirModal("modal-busca");
  document.getElementById("campo-busca-modal").focus();
}

function fecharModalBusca() {
  fecharModal("modal-busca");
}

async function selecionarDaBusca(id) {
  idSelecionado = id;
  fecharModalBusca();

  if (acaoBusca === "atualizar") {
    var dados = await window.pywebview.api.buscar_morador(id);
    abrirModalAtualizar(dados);
  } else if (acaoBusca === "remover") {
    var linha = cacheVeiculos.find(function (l) {
      return l[0] === id;
    });
    var nome = linha ? linha[1] : "este morador";
    document.getElementById("msg-remover").textContent =
      'Tem certeza que deseja remover "' +
      nome +
      '"? Esta ação não pode ser desfeita.';
    abrirModal("modal-remover");
  }
}

// ---------------------------------------------------------------
// 7. Máscaras e eventos de input
// ---------------------------------------------------------------
document.addEventListener("input", function (e) {
  if (e.target.id === "campo-pesquisa") pesquisar();
  if (e.target.id === "campo-busca-modal") buscarNoModal();

  // Máscara de CPF
  if (e.target.id === "add-cpf" || e.target.id === "upd-cpf") {
    var v = e.target.value.replace(/\D/g, "");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    e.target.value = v;
  }

  // Máscara de CEP
  if (e.target.id === "add-cep" || e.target.id === "upd-cep") {
    var v = e.target.value.replace(/\D/g, "");
    v = v.replace(/(\d{5})(\d)/, "$1-$2");
    e.target.value = v;
    if (v.length === 9) buscarCep(v, e.target.id.indexOf("upd") === 0);
  }

  // Máscara de celular
  if (e.target.id === "add-celular" || e.target.id === "upd-celular") {
    var v = e.target.value.replace(/\D/g, "");
    v = v.replace(/(\d{2})(\d)/, "($1) $2");
    v = v.replace(/(\d{5})(\d)/, "$1-$2");
    e.target.value = v;
  }
});

// ---------------------------------------------------------------
// 8. Autocomplete de CEP (ViaCEP)
// ---------------------------------------------------------------
async function buscarCep(cep, isUpdate) {
  var cepLimpo = cep.replace(/\D/g, "");
  if (cepLimpo.length !== 8) return;
  var prefixo = isUpdate ? "upd" : "add";

  try {
    var res = await fetch("https://viacep.com.br/ws/" + cepLimpo + "/json/");
    var data = await res.json();
    if (data.erro) {
      alert("CEP não encontrado!");
      return;
    }
    document.getElementById(prefixo + "-rua").value = data.logradouro;
    document.getElementById(prefixo + "-bairro").value = data.bairro;
    document.getElementById(prefixo + "-cidade").value = data.localidade;
    document.getElementById(prefixo + "-estado").value = data.uf;
  } catch (e) {
    alert("Erro ao buscar CEP!");
  }
}

// ---------------------------------------------------------------
// 9. Validação de CPF
// ---------------------------------------------------------------
function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  var soma = 0;
  for (var i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  var resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;

  soma = 0;
  for (var i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(cpf[10]);
}

// ---------------------------------------------------------------
// 10. Modal de informações do cadastrado (duplo clique)
// ---------------------------------------------------------------
async function abrirInfoCadastrado(id) {
  var dados = await window.pywebview.api.buscar_morador(id);
  var _ = dados[0],
    nome = dados[1],
    cpf = dados[2],
    dataNasc = dados[3],
    sexo = dados[4],
    celular = dados[5],
    email = dados[6],
    rua = dados[7],
    numero = dados[8],
    bairro = dados[9],
    cidade = dados[10],
    estado = dados[11],
    cep = dados[12],
    modelo = dados[13],
    cor = dados[14],
    placa = dados[15];

  document.getElementById("info-nome").textContent = nome || "Sem informação";
  document.getElementById("info-cpf").textContent = cpf || "Sem informação";
  document.getElementById("info-data").textContent =
    dataNasc || "Sem informação";
  document.getElementById("info-sexo").textContent =
    sexo === "M" ? "Masculino" : sexo === "F" ? "Feminino" : "Sem informação";
  document.getElementById("info-celular").textContent =
    celular || "Sem informação";
  document.getElementById("info-email").textContent = email || "Sem informação";
  document.getElementById("info-rua").textContent = rua || "Sem informação";
  document.getElementById("info-numero").textContent =
    numero || "Sem informação";
  document.getElementById("info-bairro").textContent =
    bairro || "Sem informação";
  document.getElementById("info-cidade").textContent =
    cidade || "Sem informação";
  document.getElementById("info-estado").textContent =
    estado || "Sem informação";
  document.getElementById("info-cep").textContent = cep || "Sem informação";
  document.getElementById("info-modelo").textContent =
    modelo || "Sem informação";
  document.getElementById("info-cor").textContent = cor || "Sem informação";
  document.getElementById("info-placa").textContent = placa
    ? placa.replace(/-/g, "").toUpperCase()
    : "Sem informação";

  abrirModal("modal-info-cadastrado");
}

// ---------------------------------------------------------------
// 11. Inicialização
// ---------------------------------------------------------------
document.addEventListener("DOMContentLoaded", carregarVeiculos);

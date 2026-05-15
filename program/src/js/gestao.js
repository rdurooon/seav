// ═══════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════
let linhaSelecionada = null;
let idSelecionado = null;
let cacheVeiculos = [];
let acaoBusca = null;

// ═══════════════════════════════════════
// CARREGAR E RENDERIZAR TABELA
// ═══════════════════════════════════════
async function carregarVeiculos() {
  cacheVeiculos = await window.pywebview.api.listar_completo();
  renderizarTabela(cacheVeiculos);
}

function renderizarTabela(dados) {
  const tbody = document.getElementById("tabela-veiculos");
  tbody.innerHTML = "";

  const TOTAL_LINHAS = 10;

  function celula(valor) {
    if (!valor)
      return `<td style="color:#aaa; font-style:italic;">Sem informação</td>`;
    return `<td>${valor}</td>`;
  }

  dados.forEach((linha) => {
    const [id, nome, cpf, modelo, cor, placa] = linha;
    const tr = document.createElement("tr");
    tr.innerHTML = `
            ${celula(placa)}
            ${celula(modelo)}
            ${celula(nome)}
            ${celula(cor)}
        `;
    tr.onclick = () => selecionarLinha(tr, id);
    tbody.appendChild(tr);
  });

  const linhasFaltando = TOTAL_LINHAS - dados.length;
  for (let i = 0; i < linhasFaltando; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
}

// ═══════════════════════════════════════
// PESQUISA
// ═══════════════════════════════════════
function detectarFiltro(termo) {
  if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(termo) || /^\d{3}\./.test(termo))
    return "cpf";
  if (/^[a-zA-Z]{3}\d/.test(termo) || /^[a-zA-Z]{3}[0-9][a-zA-Z]/.test(termo))
    return "placa";
  return "nome";
}

function pesquisar() {
  const termo = document.getElementById("campo-pesquisa").value.toLowerCase();
  const filtro = detectarFiltro(termo);

  const filtrado = cacheVeiculos.filter((linha) => {
    const [id, nome, cpf, modelo, cor, placa] = linha;
    if (filtro === "nome") return nome?.toLowerCase().includes(termo);
    if (filtro === "cpf") return cpf?.toLowerCase().includes(termo);
    if (filtro === "placa") return placa?.toLowerCase().includes(termo);
    return true;
  });

  renderizarTabela(filtrado);
}

// ═══════════════════════════════════════
// SELECIONAR LINHA
// ═══════════════════════════════════════
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

// ═══════════════════════════════════════
// REMOVER
// ═══════════════════════════════════════
function remover() {
  if (!idSelecionado) {
    abrirModalBusca("remover");
    return;
  }
  const nome = linhaSelecionada.cells[2].textContent;
  document.getElementById("msg-remover").textContent =
    `Tem certeza que deseja remover "${nome}"? Esta ação não pode ser desfeita.`;
  abrirModal("modal-remover");
}

function fecharModalRemover() {
  fecharModal("modal-remover");
}

async function confirmarRemover() {
  const btnRemover = document.querySelector("#modal-remover button:last-child");
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

// ═══════════════════════════════════════
// ADICIONAR
// ═══════════════════════════════════════
function abrirModalAdicionar() {
  abrirModal("modal-adicionar");
}

function fecharModalAdicionar() {
  fecharModal("modal-adicionar");
  limparModalAdicionar();
}

function limparModalAdicionar() {
  const campos = [
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
  campos.forEach((id) => (document.getElementById(id).value = ""));
}

async function salvarAdicionar() {
  const cpf = document.getElementById("add-cpf").value;
  if (!validarCPF(cpf)) {
    alert("CPF inválido!");
    return;
  }

  const btnSalvar = document.querySelector(
    "#modal-adicionar button:last-child",
  );
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  const dados = {
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

  const resultado = await window.pywebview.api.cadastrar_completo(dados);
  alert(resultado);

  btnSalvar.disabled = false;
  btnSalvar.textContent = "Salvar";
  fecharModalAdicionar();
  carregarVeiculos();
}

// ═══════════════════════════════════════
// ATUALIZAR
// ═══════════════════════════════════════
async function atualizar() {
  if (!idSelecionado) {
    abrirModalBusca("atualizar");
    return;
  }
  const dados = await window.pywebview.api.buscar_morador(idSelecionado);
  abrirModalAtualizar(dados);
}

function abrirModalAtualizar(dados) {
  const [
    id,
    nome,
    cpf,
    dataNasc,
    sexo,
    celular,
    email,
    rua,
    numero,
    bairro,
    cidade,
    estado,
    cep,
    modelo,
    cor,
    placa,
  ] = dados;

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
  const cpf = document.getElementById("upd-cpf").value;
  if (!validarCPF(cpf)) {
    alert("CPF inválido!");
    return;
  }

  const btnSalvar = document.querySelector(
    "#modal-atualizar button:last-child",
  );
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  const dados = {
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

  const resultado = await window.pywebview.api.atualizar_morador(dados);
  alert(resultado);

  btnSalvar.disabled = false;
  btnSalvar.textContent = "Salvar";
  fecharModalAtualizar();
  document.getElementById("campo-pesquisa").value = "";
  linhaSelecionada = null;
  idSelecionado = null;
  carregarVeiculos();
}

// ═══════════════════════════════════════
// MODAL BUSCA
// ═══════════════════════════════════════
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

function buscarNoModal() {
  const termo = document
    .getElementById("campo-busca-modal")
    .value.toLowerCase();
  const filtro = detectarFiltro(termo);
  const container = document.getElementById("resultados-busca");
  container.innerHTML = "";

  if (!termo) return;

  const filtrado = cacheVeiculos.filter((linha) => {
    const [id, nome, cpf, modelo, cor, placa] = linha;
    if (filtro === "nome") return nome?.toLowerCase().includes(termo);
    if (filtro === "cpf") return cpf?.toLowerCase().includes(termo);
    if (filtro === "placa") return placa?.toLowerCase().includes(termo);
    return true;
  });

  if (filtrado.length === 0) {
    container.innerHTML = `<p style="color:#aaa; text-align:center; font-style:italic;">Nenhum resultado encontrado</p>`;
    return;
  }

  filtrado.forEach((linha) => {
    const [id, nome, cpf, modelo, cor, placa] = linha;
    const div = document.createElement("div");
    div.style.cssText = `
            padding: 10px 14px;
            border: 1.5px solid var(--cor-borda);
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            font-size: 0.9rem;
        `;
    div.innerHTML = `
            <span><strong>${nome}</strong></span>
            <span style="color:#888;">${placa || "Sem placa"} · ${modelo || "Sem veículo"}</span>
        `;
    div.onmouseover = () => (div.style.background = "#f0f4f8");
    div.onmouseout = () => (div.style.background = "");
    div.onclick = () => selecionarDaBusca(id);
    container.appendChild(div);
  });
}

async function selecionarDaBusca(id) {
  idSelecionado = id;
  fecharModalBusca();

  if (acaoBusca === "atualizar") {
    const dados = await window.pywebview.api.buscar_morador(id);
    abrirModalAtualizar(dados);
  } else if (acaoBusca === "remover") {
    const linha = cacheVeiculos.find((l) => l[0] === id);
    const nome = linha ? linha[1] : "este morador";
    document.getElementById("msg-remover").textContent =
      `Tem certeza que deseja remover "${nome}"? Esta ação não pode ser desfeita.`;
    abrirModal("modal-remover");
  }
}

// ═══════════════════════════════════════
// MÁSCARAS E EVENTOS
// ═══════════════════════════════════════
document.addEventListener("input", function (e) {
  if (e.target.id === "campo-pesquisa") pesquisar();
  if (e.target.id === "campo-busca-modal") buscarNoModal();

  if (e.target.id === "add-cpf" || e.target.id === "upd-cpf") {
    let v = e.target.value.replace(/\D/g, "");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    e.target.value = v;
  }
  if (e.target.id === "add-cep" || e.target.id === "upd-cep") {
    let v = e.target.value.replace(/\D/g, "");
    v = v.replace(/(\d{5})(\d)/, "$1-$2");
    e.target.value = v;
    if (v.length === 9) buscarCep(v, e.target.id.startsWith("upd"));
  }
  if (e.target.id === "add-celular" || e.target.id === "upd-celular") {
    let v = e.target.value.replace(/\D/g, "");
    v = v.replace(/(\d{2})(\d)/, "($1) $2");
    v = v.replace(/(\d{5})(\d)/, "$1-$2");
    e.target.value = v;
  }
});

// ═══════════════════════════════════════
// CEP AUTOCOMPLETE
// ═══════════════════════════════════════
async function buscarCep(cep, isUpdate = false) {
  const cepLimpo = cep.replace(/\D/g, "");
  if (cepLimpo.length !== 8) return;
  const prefixo = isUpdate ? "upd" : "add";
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const data = await res.json();
    if (data.erro) {
      alert("CEP não encontrado!");
      return;
    }
    document.getElementById(`${prefixo}-rua`).value = data.logradouro;
    document.getElementById(`${prefixo}-bairro`).value = data.bairro;
    document.getElementById(`${prefixo}-cidade`).value = data.localidade;
    document.getElementById(`${prefixo}-estado`).value = data.uf;
  } catch (e) {
    alert("Erro ao buscar CEP!");
  }
}

// ═══════════════════════════════════════
// VALIDAÇÃO CPF
// ═══════════════════════════════════════
function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(cpf[10]);
}

// ═══════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════
document.addEventListener("DOMContentLoaded", carregarVeiculos);

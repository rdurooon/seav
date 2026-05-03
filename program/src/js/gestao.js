let linhaSelecionada = null; // guarda a linha clicada pelo usuário
let idSelecionado = null; // guarda o id_morador da linha selecionada

async function carregarVeiculos() {
  const dados = await window.pywebview.api.listar_completo();
  const tbody = document.getElementById("tabela-veiculos");
  tbody.innerHTML = ""; // limpa a tabela antes de preencher

  dados.forEach((linha) => {
    const [id, nome, cpf, modelo, cor, placa] = linha;
    // cria uma linha HTML para cada registro do banco
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${placa}</td>
            <td>${modelo}</td>
            <td>${nome}</td>
            <td>${cor}</td>
        `;
    // quando clicar na linha, chama selecionarLinha()
    tr.onclick = () => selecionarLinha(tr, id);
    tbody.appendChild(tr);
  });
}

function selecionarLinha(tr, id) {
  // remove o destaque da linha anterior
  if (linhaSelecionada) {
    linhaSelecionada.classList.remove("linha-selecionada");
  }
  // se clicar na mesma linha, deseleciona
  if (linhaSelecionada === tr) {
    linhaSelecionada = null;
    idSelecionado = null;
    return;
  }
  // destaca a nova linha
  tr.classList.add("linha-selecionada");
  linhaSelecionada = tr;
  idSelecionado = id;
}

async function remover() {
  if (!idSelecionado) {
    alert("Selecione um registro primeiro!");
    return;
  }
  const confirmar = confirm("Tem certeza que deseja remover este registro?");
  if (!confirmar) return;

  const resultado = await window.pywebview.api.deletar_morador(idSelecionado);
  alert(resultado);
  linhaSelecionada = null;
  idSelecionado = null;
  carregarVeiculos(); // recarrega a tabela
}

async function atualizar() {
  if (!idSelecionado) {
    alert("Selecione um registro primeiro!");
    return;
  }
  // busca os dados completos do morador selecionado
  const dados = await window.pywebview.api.buscar_morador(idSelecionado);
  // abre o modal de atualização passando os dados
  abrirModalAtualizar(dados);
}
document.addEventListener("DOMContentLoaded", carregarVeiculos);

function abrirModalAdicionar() {
  document.getElementById("modal-adicionar").style.display = "flex";
}

function fecharModalAdicionar() {
  document.getElementById("modal-adicionar").style.display = "none";
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

// MÁSCARA CPF
document.addEventListener("input", function (e) {
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

async function buscarCep(cep, isUpdate = false) {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    const prefixo = isUpdate ? "upd" : "add";
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await res.json();
        if (data.erro) { alert("CEP não encontrado!"); return; }
        document.getElementById(`${prefixo}-rua`).value = data.logradouro;
        document.getElementById(`${prefixo}-bairro`).value = data.bairro;
        document.getElementById(`${prefixo}-cidade`).value = data.localidade;
        document.getElementById(`${prefixo}-estado`).value = data.uf;
    } catch (e) {
        alert("Erro ao buscar CEP!");
    }
}

// VALIDAÇÃO CPF
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


function abrirModalAtualizar(dados) {
    const [id, nome, cpf, dataNasc, sexo, celular, email,
           rua, numero, bairro, cidade, estado, cep,
           modelo, cor, placa] = dados

    document.getElementById('upd-nome').value = nome || ''
    document.getElementById('upd-cpf').value = cpf || ''
    document.getElementById('upd-data').value = dataNasc || ''
    document.getElementById('upd-sexo').value = sexo || ''
    document.getElementById('upd-celular').value = celular || ''
    document.getElementById('upd-email').value = email || ''
    document.getElementById('upd-rua').value = rua || ''
    document.getElementById('upd-numero').value = numero || ''
    document.getElementById('upd-bairro').value = bairro || ''
    document.getElementById('upd-cidade').value = cidade || ''
    document.getElementById('upd-estado').value = estado || ''
    document.getElementById('upd-cep').value = cep || ''
    document.getElementById('upd-modelo').value = modelo || ''
    document.getElementById('upd-cor').value = cor || ''
    document.getElementById('upd-placa').value = placa || ''

    document.getElementById('modal-atualizar').style.display = 'flex'
}

function fecharModalAtualizar() {
    document.getElementById('modal-atualizar').style.display = 'none'
}

async function salvarAtualizar() {
    const cpf = document.getElementById('upd-cpf').value
    if (!validarCPF(cpf)) {
        alert('CPF inválido!')
        return
    }

    const btnSalvar = document.querySelector('#modal-atualizar button:last-child')
    btnSalvar.disabled = true
    btnSalvar.textContent = 'Salvando...'

    const dados = {
        id_morador:      idSelecionado,
        nome:            document.getElementById('upd-nome').value,
        cpf:             document.getElementById('upd-cpf').value,
        data_nascimento: document.getElementById('upd-data').value,
        sexo:            document.getElementById('upd-sexo').value,
        celular:         document.getElementById('upd-celular').value,
        email:           document.getElementById('upd-email').value,
        rua:             document.getElementById('upd-rua').value,
        numero:          document.getElementById('upd-numero').value,
        bairro:          document.getElementById('upd-bairro').value,
        cidade:          document.getElementById('upd-cidade').value,
        estado:          document.getElementById('upd-estado').value,
        cep:             document.getElementById('upd-cep').value,
        modelo:          document.getElementById('upd-modelo').value,
        cor:             document.getElementById('upd-cor').value,
        placa:           document.getElementById('upd-placa').value,
    }

    const resultado = await window.pywebview.api.atualizar_morador(dados)
    alert(resultado)

    btnSalvar.disabled = false
    btnSalvar.textContent = 'Salvar'
    fecharModalAtualizar()
    linhaSelecionada = null
    idSelecionado = null
    carregarVeiculos()
}
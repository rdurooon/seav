window.idEditando = null;

// ---------------- SALVAR ----------------
async function cadastrar() {
    const dados = {
        id_morador: window.idEditando,

        nome: document.getElementById("nome").value,
        cpf: document.getElementById("cpf").value,
        data_nascimento: document.getElementById("data").value,
        sexo: document.getElementById("sexo").value,

        celular: document.getElementById("celular").value,
        email: document.getElementById("email").value,

        rua: document.getElementById("rua").value,
        numero: document.getElementById("numero").value,
        bairro: document.getElementById("bairro").value,
        cidade: document.getElementById("cidade").value,
        estado: document.getElementById("estado").value,
        cep: document.getElementById("cep").value,

        modelo: document.getElementById("modelo").value,
        cor: document.getElementById("cor").value,
        placa: document.getElementById("placa").value
    };

    let res;

    if (window.idEditando) {
        res = await window.pywebview.api.atualizar_morador(dados);
        alert(res);
        window.idEditando = null;
    } else {
        res = await window.pywebview.api.cadastrar_completo(dados);
        alert(res);
    }

    limpar();
    listar();
}

// ---------------- LISTAR ----------------
async function listar() {
    const dados = await window.pywebview.api.listar_completo();

    const lista = document.getElementById("lista_moradores");
    lista.innerHTML = "";

    dados.forEach(m => {
        const li = document.createElement("li");

        const btnEdit = document.createElement("button");
        btnEdit.innerText = "Editar";
        btnEdit.onclick = () => editar(m[0]);

        const btnDel = document.createElement("button");
        btnDel.innerText = "Excluir";
        btnDel.onclick = async () => {
            await window.pywebview.api.deletar_morador(m[0]);
            listar();
        };
            const texto = document.createElement("span");
            texto.innerText = `${m[1]} | ${m[2]} | ${m[3] ?? ""}`;

            li.appendChild(texto);
            li.appendChild(btnEdit);
            li.appendChild(btnDel);

        document.getElementById("lista_moradores").appendChild(li);
    });
}

// ---------------- EDITAR ----------------
async function editar(id) {
    const m = await window.pywebview.api.buscar_morador(id);

    console.log("DEBUG MORADOR:", m);

    window.idEditando = m[0];

    document.getElementById("nome").value = m[1];
    document.getElementById("cpf").value = m[2];
    document.getElementById("data").value = m[3];
    document.getElementById("sexo").value = m[4];

    document.getElementById("celular").value = m[5];
    document.getElementById("email").value = m[6];

    document.getElementById("rua").value = m[7];
    document.getElementById("numero").value = m[8];
    document.getElementById("bairro").value = m[9];
    document.getElementById("cidade").value = m[10];
    document.getElementById("estado").value = m[11];
    document.getElementById("cep").value = m[12];

    document.getElementById("modelo").value = m[13];
    document.getElementById("cor").value = m[14];
    document.getElementById("placa").value = m[15];

    mostrarCadastro();
}


// ---------------- LIMPAR ----------------
function limpar() {
    window.idEditando = null;
    document.querySelectorAll("input").forEach(i => i.value = "");
}

// ---------------- NAV ----------------
function mostrarCadastro() {
    document.getElementById("cadastro").style.display = "block";
    document.getElementById("lista").style.display = "none";
}

function mostrarLista() {
    document.getElementById("cadastro").style.display = "none";
    document.getElementById("lista").style.display = "block";
}

async function navegarPara(pagina) {
    const resposta = await fetch(`pages/${pagina}.html`)
    const html = await resposta.text()
    document.getElementById('content').innerHTML = html

    const btnVoltar = document.getElementById('btn-voltar')
    btnVoltar.style.display = pagina === 'menu' ? 'none' : 'block'

    iniciarRelogio()

    const paginasComJS = ['gestao', 'monitoramento', 'historico']
    
    if (paginasComJS.includes(pagina)) {
        const script = document.createElement('script')
        script.src = `js/${pagina}.js`
        document.body.appendChild(script)

        if (pagina === 'gestao') {
            script.onload = () => carregarVeiculos()
        }
    }
}

function iniciarRelogio() {
  const el = document.getElementById("relogio");
  if (!el) return;

  if (window._relogioInterval) clearInterval(window._relogioInterval);

  function atualizar() {
    const agora = new Date();
    const data = agora.toLocaleDateString("pt-BR");
    const hora = agora.toLocaleTimeString("pt-BR");
    el.textContent = `${data} - ${hora}`;
  }

  atualizar();
  window._relogioInterval = setInterval(atualizar, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  navegarPara("menu");
});

function abrirInfo() {
  document.getElementById("modal-info").style.display = "flex";
}

function fecharInfo() {
  document.getElementById("modal-info").style.display = "none";
}

function abrirConfig() {
  document.getElementById("modal-config").style.display = "flex";
}

function fecharConfig() {
  document.getElementById("modal-config").style.display = "none";
}

function salvarConfig() {
  const porta = document.getElementById("porta-com").value;
  if (!porta || porta < 1 || porta > 9) {
    alert("Digite uma porta válida entre 1 e 9!");
    return;
  }
  // salva localmente por enquanto
  localStorage.setItem("porta-com", porta);
  alert(`Porta COM${porta} salva!`);
  fecharConfig();
}

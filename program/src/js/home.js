async function navegarPara(pagina) {
    const resposta = await fetch(`pages/${pagina}.html`)
    const html = await resposta.text()
    document.getElementById('content').innerHTML = html

    const btnVoltar = document.getElementById('btn-voltar')
    btnVoltar.style.display = pagina === 'menu' ? 'none' : 'block'

    iniciarRelogio()
}

function iniciarRelogio() {
    const el = document.getElementById('relogio')
    if (!el) return

    if (window._relogioInterval) clearInterval(window._relogioInterval)

    window._relogioInterval = setInterval(() => {
        const agora = new Date()
        const data = agora.toLocaleDateString('pt-BR')
        const hora = agora.toLocaleTimeString('pt-BR')
        el.textContent = `${data} - ${hora}`
    }, 1000)
}

document.addEventListener('DOMContentLoaded', () => {
    navegarPara('menu')
})
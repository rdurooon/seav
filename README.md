![SEAV Logo](program/src/assets/SEAV-logo.png)

# SEAV — Sistema Embarcado de Acesso Veicular

O SEAV é um sistema integrado (hardware + software) para controle e monitoramento de acessos veiculares por leitura automática de placas. Seu objetivo é oferecer uma solução de baixo custo para automatizar abertura de portões, registro de histórico e geração de relatórios, combinando módulos embarcados (ESP32) com uma aplicação desktop leve baseada em Python.

Principais componentes
-------------------------------------------
- Captura de imagens e reconhecimento de placas (ALPR) usando OpenCV e EasyOCR.
- Aplicação desktop em Python que provê interface de operação, histórico e exportação de relatórios (PDF).
- Comunicação serial entre a aplicação e módulos ESP32 para acionar o portão / receber telemetria.

Hardwares utilizados e suas funções
----------------------------------
- ESP32-CAM: captura de imagem e stream de vídeo para o motor ALPR.
- ESP32-Controladora: responsável pelo acionamento físico do portão (relés/controles) e comunicação serial com a máquina host.
- ESP32-Receptor: módulo receptor/auxiliar (quando aplicado) para topologias distribuídas.
- Computador/Notebook (host): executa a aplicação Python que processa OCR, mantém banco de dados e interface GUI.

Linguagens, bibliotecas e frameworks
-----------------------------------
- Linguagem principal: Python
- Bibliotecas/Frameworks principais:
  - `pywebview` (interface desktop via HTML/CSS/JS)
  - `opencv-python`, `Pillow` (processamento de imagens)
  - `easyocr`, `torch`, `torchvision` (OCR e dependências de ML)
  - `pyserial` (comunicação serial)
  - `reportlab` (exportação de PDF)
  - `screeninfo`, `watchdog`, `tkinter` (utilidades e diálogos)

Visão geral do funcionamento
---------------------------
1. A câmera (ESP32-CAM) captura frames e envia para o host.
2. O componente ALPR (módulo `program/ai/alpr_engine.py`) processa frames com OpenCV + EasyOCR, detecta e valida placas.
3. Quando uma placa é reconhecida, a aplicação consulta o banco de dados local e decide se o acesso é autorizado.
4. Para acessos autorizados, a aplicação envia um comando serial à `ESP32-Controladora` para acionar o portão e registra o evento no histórico.
5. O usuário pode visualizar últimos acessos, filtrar histórico e exportar relatórios em PDF pela interface.

Como utilizar (setup rápido)
---------------------------
1. Crie e ative um ambiente virtual Python (recomendado):

	Windows (PowerShell):

	```powershell
	python -m venv .venv
	.\.venv\Scripts\Activate.ps1
	```

2. Instale dependências:

	```powershell
	pip install -r requirements.txt
	```

	Observações: a instalação de `torch` pode variar conforme sua GPU/OS — consulte os sites oficiais se ocorrerem problemas.

3. Conecte os módulos ESP32 e, se necessário, carregue os sketches a partir da pasta `firmware/` usando Arduino IDE ou PlatformIO:

	- `firmware/esp32-cam/esp32-cam.ino`
	- `firmware/esp32-controladora/esp32-controladora.ino`
	- `firmware/esp32-receptor/esp32-receptor.ino`

4. Ajuste a porta serial e configurações iniciais na interface (ou salve a porta COM no banco de dados de configuração). Em geral, a aplicação tenta reconectar automaticamente à última porta salva.

5. Execute a aplicação:

	```powershell
	cd program
	python main.py
	```

6. Na primeira execução, verifique dependências opcionais (ex.: `reportlab` para exportação de PDF). Caso falte, instale via `pip install reportlab`.

Observações de operação
----------------------
- Se estiver usando Windows, garanta permissões de acesso à porta serial e que o antivírus não bloqueie a aplicação.
- Para cenários com múltiplas câmeras ou topologias remotas, adapte a comunicação entre módulos e leve em conta latência e qualidade de imagem.

Equipe acadêmica
----------------
- Fábio José Leite Martel
- Leandro Duarte Marques
- Lucas Dos Santos Mendes
- Pedro Henrique Smith Moita
- Ruan Durão Monte Verde
- **Orientador:** Weslyn Ivan Chaves Figueiredo
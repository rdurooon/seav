from database.database import Api
from serial_reader import SerialReader
import serial.tools.list_ports
import json
import time
from datetime import datetime
import os
import tkinter as tk
from tkinter import filedialog

# PDF generation
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Image, Spacer, Paragraph
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False

# Buffer global para últimos acessos mantido durante toda a execução
ULTIMOS_ACESSOS = []

class API:
    def __init__(self):
        self.db = Api()
        self.serial_reader = SerialReader()
        self.window = None
        self._ultimo_comando_portao = None
        self._ultimo_comando_portao_ts = 0
        # compartilhar buffer de últimos acessos no módulo (sobrevive a múltiplas instâncias)
        try:
            global ULTIMOS_ACESSOS
        except NameError:
            ULTIMOS_ACESSOS = []
        self.ultimo_acessos = ULTIMOS_ACESSOS
        # Tentar conectar à porta salva automaticamente
        self._conectar_porta_salva_auto()
        self._load_automacao_config()

    def _load_automacao_config(self):
        try:
            valor = self.db.carregar_config('automacao_enabled')
            self.automacao_habilitada = (
                str(valor).lower() in ('1', 'true', 'yes')
            ) if valor is not None else True
        except Exception:
            self.automacao_habilitada = True
    
    def _conectar_porta_salva_auto(self):
        """Tenta conectar à porta salva no banco de dados automaticamente"""
        try:
            porta = self.db.carregar_config("porta_com")
            if porta:
                self.connect_serial(f"COM{porta}")
        except Exception:
            pass  # Silenciosamente - o status será atualizado no frontend

    def set_window(self, window):
        self.__window = window
        self.serial_reader.set_frame_callback(self._frame_update_callback)
        # registrar callback de placa
        try:
            self.serial_reader.set_placa_callback(self.__on_placa_detectada)
        except Exception:
            pass
        # registrar callback de OCR (atualizações rápidas para modal de ajuste)
        try:
            def _forward_ocr(dados):
                try:
                    if hasattr(self, '_API__window') and self._API__window:
                        self._API__window.run_js(f"onOcrUpdate({json.dumps(dados)})")
                except Exception:
                    pass

            self.serial_reader.set_ocr_callback(_forward_ocr)
        except Exception:
            pass
        # aplicar configuração de supressão de erros ao SerialReader
        try:
            val = self.db.carregar_config('suppress_errors')
            enabled = str(val) == '1' or str(val).lower() == 'true'
            if getattr(self, 'serial_reader', None):
                try:
                    self.serial_reader.set_suppress_errors(enabled)
                except Exception:
                    pass
        except Exception:
            pass

    def _frame_update_callback(self, display_b64, recognition_b64=None):
        if self.__window is None or getattr(self.__window, 'closed', False):
            return
        try:
            script = (
                f"updateCameraStream({json.dumps('data:image/jpeg;base64,' + display_b64)}"
                + (f", {json.dumps('data:image/jpeg;base64,' + recognition_b64)}" if recognition_b64 else "")
                + ")"
            )
            self.__window.run_js(script)
        except Exception:
            pass

    def _adicionar_ultimo_acesso(self, registro):
        try:
            self.ultimo_acessos.insert(0, registro)
            if len(self.ultimo_acessos) > 8:
                self.ultimo_acessos.pop()
            print(f"[API] _adicionar_ultimo_acesso added, new_count={len(self.ultimo_acessos)}, registro={registro}")
        except Exception as e:
            print(f"[API] _adicionar_ultimo_acesso error: {e}")

    def get_ultimos_acessos(self):
        try:
            print(f"[API] get_ultimos_acessos called, count={len(self.ultimo_acessos)}")
            return list(self.ultimo_acessos)
        except Exception:
            return []

    def debug_ultimos(self):
        try:
            return {"count": len(self.ultimo_acessos), "items": list(self.ultimo_acessos)}
        except Exception as e:
            return {"error": str(e)}

    def _format_endereco(self, rua, numero, bairro, cidade, estado, cep):
        partes = []
        if rua:
            partes.append(str(rua).strip())
        if numero is not None and str(numero).strip():
            partes.append(str(numero).strip())
        if bairro:
            partes.append(str(bairro).strip())
        local = ', '.join(filter(None, [str(cidade).strip() if cidade else None, str(estado).strip() if estado else None]))
        if local:
            partes.append(local)
        if cep:
            partes.append(str(cep).strip())
        return ', '.join([p for p in partes if p])

    def __on_placa_detectada(self, placa_text):
        try:
            resultado = self.db.buscar_veiculo_por_placa(placa_text)
            autorizado = bool(resultado)
            data_hora_display = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

            if autorizado:
                try:
                    print(f"Placa {placa_text} reconhecida e cadastrada. Abrir portão!")
                except Exception:
                    pass

                _, modelo, cor, id_morador, nome, rua, numero, bairro, cidade, estado, cep = resultado
                veiculo = " ".join([p for p in [modelo, cor] if p]).strip()
                morador = nome or ""
                endereco = self._format_endereco(rua, numero, bairro, cidade, estado, cep)
                status = "Autorizado"
            else:
                try:
                    print(f"Placa {placa_text} reconhecida, porém não cadastrada. Manter portão fechado!")
                except Exception:
                    pass

                id_morador = None
                veiculo = ""
                morador = ""
                endereco = ""
                status = "Negado"

            # NÃO registra mais aqui – o frontend cuidará disso após decisão do operador

            payload = {
                "placa": placa_text,
                "autorizado": autorizado,
                "veiculo": veiculo,
                "morador": morador,
                "endereco": endereco,
                "status": status,
                "data_hora": data_hora_display,
            }

            try:
                if hasattr(self, '_API__window') and self._API__window:
                    self._API__window.run_js(f"onPlacaDetectada({json.dumps(payload)})")
            except Exception:
                pass
        except Exception:
            pass
        
    def set_roi(self, x, y, w, h):
        try:
            if self.serial_reader and getattr(self.serial_reader, '_alpr', None):
                self.serial_reader._alpr.set_roi(x, y, w, h)
                return True
        except Exception:
            pass
        return False

    def set_suppress_errors(self, enabled: bool):
        try:
            self.db.salvar_config('suppress_errors', '1' if enabled else '0')
            if getattr(self, 'serial_reader', None):
                try:
                    self.serial_reader.set_suppress_errors(bool(enabled))
                except Exception:
                    pass
            return True
        except Exception:
            return False

    def get_suppress_errors(self):
        try:
            val = self.db.carregar_config('suppress_errors')
            return str(val) == '1' or str(val).lower() == 'true'
        except Exception:
            return False

    def limpar_roi(self):
        try:
            if self.serial_reader and getattr(self.serial_reader, '_alpr', None):
                self.serial_reader._alpr.limpar_roi()
                return True
        except Exception:
            pass
        return False

    def registrar_acesso(self, placa, id_morador=None, autorizado=False, veiculo=None, morador=None, endereco=None, data_hora=None, status=None):
        try:
            print(f"[API] registrar_acesso recebido: placa={placa}, data_hora={data_hora}, status={status}")
            if data_hora:
                try:
                    datetime.strptime(data_hora, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    try:
                        dt = datetime.strptime(data_hora, "%d/%m/%Y %H:%M:%S")
                        data_hora = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        data_hora = None
            else:
                data_hora = None

            resultado = self.db.registrar_acesso(placa, id_morador, autorizado, veiculo, morador, endereco, data_hora, status)
            if resultado:
                if data_hora:
                    try:
                        dt = datetime.strptime(data_hora, "%Y-%m-%d %H:%M:%S")
                        data_hora_display = dt.strftime("%d/%m/%Y %H:%M:%S")
                    except:
                        data_hora_display = data_hora
                else:
                    data_hora_display = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
                
                self._adicionar_ultimo_acesso([
                    placa,
                    veiculo or "",
                    morador or "",
                    data_hora_display
                ])
            return resultado
        except Exception as e:
            print(f"[API] registrar_acesso EXCEPTION: {e}")
            return False

    def listar_historico(self, data_inicio=None, data_fim=None, placa=None):
        try:
            return self.db.listar_historico(data_inicio, data_fim, placa)
        except Exception:
            return []

    def exportar_relatorio(self, data_inicio=None, data_fim=None, placa=None, excluir_apos_exportar=False):
        """
        Exporta o histórico filtrado para PDF. Abre diálogo de salvar (padrão: ~/Documents/SEAV - Relatorios)
        Se o usuário cancelar o salvamento, nada é removido. Se salvar e excluir_apos_exportar == True,
        limpa o histórico.
        Retorna dict: {saved: bool, deleted: bool, path: str}
        """
        try:
            if not REPORTLAB_AVAILABLE:
                return {"saved": False, "deleted": False, "error": "reportlab não instalado"}

            dados = self.db.listar_historico(data_inicio, data_fim, placa) or []

            # preparar diretório padrão
            docs = os.path.join(os.path.expanduser("~"), "Documents")
            default_dir = os.path.join(docs, "SEAV - Relatorios")
            try:
                os.makedirs(default_dir, exist_ok=True)
            except Exception:
                pass

            hoje = datetime.now()
            default_name = hoje.strftime("Relatorio %d-%m-%y - SEAV.pdf")

            # abrir diálogo de salvar via tkinter
            try:
                root = tk.Tk()
                root.withdraw()
                path = filedialog.asksaveasfilename(
                    initialdir=default_dir,
                    initialfile=default_name,
                    defaultextension=".pdf",
                    filetypes=[("PDF files", "*.pdf")],
                )
                root.destroy()
            except Exception:
                path = None

            if not path:
                return {"saved": False, "deleted": False}

            # garantir extensão
            if not path.lower().endswith(".pdf"):
                path = path + ".pdf"

            # criar PDF com ReportLab (mantendo cores do projeto e logo com proporção)
            try:
                logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "assets", "SEAV-logo.png")
                doc = SimpleDocTemplate(path, pagesize=A4, rightMargin=20, leftMargin=20, topMargin=20, bottomMargin=20)
                elements = []
                tmp_files = []

                # cor principal do projeto
                cor_projeto = colors.HexColor('#1e2d3d')

                # logo: preservar proporção e não ampliar (aplica redução se for muito grande)
                try:
                    from PIL import Image as PILImage
                    import tempfile

                    if os.path.exists(logo_path):
                        pil_img = PILImage.open(logo_path).convert("RGBA")

                        # criar máscara: usar alpha se existir, senão detectar pixels não-transparentes
                        alpha = pil_img.split()[-1]
                        has_alpha = alpha.getextrema() != (255, 255)

                        if has_alpha:
                            mask = alpha.point(lambda p: 255 if p > 10 else 0)
                        else:
                            # fallback: considerar todos pixels não totalmente white como parte do logo
                            gray = pil_img.convert("L")
                            mask = gray.point(lambda p: 0 if p > 250 else 255)

                        # recolorar logo para a cor do projeto (#1e2d3d)
                        proj_rgb = (30, 45, 61, 255)
                        color_img = PILImage.new("RGBA", pil_img.size, proj_rgb)
                        recolored = PILImage.composite(color_img, PILImage.new("RGBA", pil_img.size, (255,255,255,0)), mask)

                        # preservar proporção e evitar ampliação
                        img_w, img_h = pil_img.size
                        max_width = 140  # points
                        scale = 1.0
                        if img_w > max_width:
                            scale = float(max_width) / float(img_w)
                        draw_w = int(img_w * scale)
                        draw_h = int(img_h * scale)

                        # salvar temporariamente
                        tmpf = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                        tmp_path = tmpf.name
                        try:
                            recolored.save(tmp_path, format="PNG")
                            rl_img = Image(tmp_path, width=draw_w, height=draw_h)
                            elements.append(rl_img)
                            tmp_files.append(tmp_path)
                        finally:
                            tmpf.close()
                except Exception:
                    # fallback simples
                    try:
                        if os.path.exists(logo_path):
                            elements.append(Image(logo_path, width=80, height=40))
                    except Exception:
                        pass

                elements.append(Spacer(1, 8))

                # linha horizontal com a cor do projeto
                line_table = Table([[""]], colWidths=[A4[0] - doc.leftMargin - doc.rightMargin])
                line_table.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 2, cor_projeto)]))
                elements.append(line_table)
                elements.append(Spacer(1, 12))

                # montar dados da tabela (mesma ordem e colunas da interface)
                styles = getSampleStyleSheet()
                body_style = ParagraphStyle(
                    name="body",
                    parent=styles["Normal"],
                    fontName="Helvetica",
                    fontSize=8,
                    leading=10,
                )
                header_style = ParagraphStyle(
                    name="header",
                    parent=styles["Normal"],
                    fontName="Helvetica-Bold",
                    fontSize=9,
                    leading=11,
                    textColor=colors.white,
                )

                table_data = [
                    [
                        Paragraph("Placa", header_style),
                        Paragraph("Veículo", header_style),
                        Paragraph("Morador", header_style),
                        Paragraph("Endereço", header_style),
                        Paragraph("Data e hora", header_style),
                        Paragraph("Status", header_style),
                    ]
                ]

                for row in dados:
                    placa_v = row[1] if len(row) > 1 else ""
                    veiculo = row[2] if len(row) > 2 else ""
                    morador = row[3] if len(row) > 3 else ""
                    endereco = row[4] if len(row) > 4 else ""
                    datahora = row[5] if len(row) > 5 else ""
                    status = row[6] if len(row) > 6 else ""

                    table_data.append([
                        Paragraph(str(placa_v or ""), body_style),
                        Paragraph(str(veiculo or ""), body_style),
                        Paragraph(str(morador or ""), body_style),
                        Paragraph(str(endereco or ""), body_style),
                        Paragraph(str(datahora or ""), body_style),
                        Paragraph(str(status or ""), body_style),
                    ])

                # largura das colunas (ajustar para caber na página)
                usable_width = A4[0] - doc.leftMargin - doc.rightMargin
                col_widths = [usable_width * 0.12, usable_width * 0.18, usable_width * 0.2, usable_width * 0.3, usable_width * 0.12, usable_width * 0.08]

                tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
                tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), cor_projeto),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.5, cor_projeto),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]))

                elements.append(tbl)

                doc.build(elements)

                # remover arquivos temporários (logos recoloridos)
                for f in tmp_files:
                    try:
                        if os.path.exists(f):
                            os.unlink(f)
                    except Exception:
                        pass
            except Exception as e:
                return {"saved": False, "deleted": False, "error": str(e)}

            deleted = False
            if excluir_apos_exportar:
                try:
                    ok = self.db.limpar_historico()
                    deleted = bool(ok)
                except Exception:
                    deleted = False

            return {"saved": True, "deleted": deleted, "path": path}

        except Exception as e:
            return {"saved": False, "deleted": False, "error": str(e)}

    def disparar_abertura(self, placa, morador):
        try:
            if not getattr(self, 'automacao_habilitada', True):
                print(f"[API] Automação desativada. Não enviar abertura para placa {placa}")
                return False
            sent = self.enviar_comando_portao('OPEN', 10)
            print(f"[API] Abrir acesso para placa {placa} - morador {morador}, enviado={sent}")
            return sent
        except Exception as e:
            print(f"[API] disparar_abertura error: {e}")
            return False

    def _processar_placa_nao_cadastrada(self, placa_text):
        return

    def connect_serial(self, port):
        return self.serial_reader.connect(port)

    def enviar_comando_portao(self, comando, tempo=5):
        try:
            cmd = str(comando).strip().upper()
            agora = time.time()
            if (
                self._ultimo_comando_portao == cmd
                and (agora - getattr(self, '_ultimo_comando_portao_ts', 0)) < 8
            ):
                print(f"[API] Ignorando comando repetido {cmd} dentro do cooldown.")
                return True
            resultado = self.serial_reader.send_command(comando, tempo)
            if resultado:
                self._ultimo_comando_portao = cmd
                self._ultimo_comando_portao_ts = agora
            return resultado
        except Exception:
            return False

    def set_automacao(self, enabled):
        try:
            ativo = str(enabled).lower() in ('1', 'true', 'yes')
            self.db.salvar_config('automacao_enabled', '1' if ativo else '0')
            self.automacao_habilitada = ativo
            return ativo
        except Exception:
            return False

    def get_automacao(self):
        return getattr(self, 'automacao_habilitada', True)

    def conectar_porta(self, porta):
        if self.connect_serial(f"COM{porta}"):
            self.db.salvar_config("porta_com", porta)
            return "Conectado"
        return "Erro"

    def conectar_porta_silencioso(self, porta):
        """Tenta conectar à porta sem retornar erro ou feedback"""
        if porta:
            self.connect_serial(f"COM{porta}")
            self.db.salvar_config("porta_com", porta)

    def carregar_porta(self):
        return self.db.carregar_config("porta_com")

    def ping(self):
        return "SEAV funcionando!"

    def get_status(self):
        return self.serial_reader.get_status()

    # Métodos expostos para o frontend
    def cadastrar_completo(self, dados):
        return self.db.cadastrar_completo(dados)

    def listar_completo(self):
        return self.db.listar_completo()

    def buscar_morador(self, id_morador):
        return self.db.buscar_morador(id_morador)

    def atualizar_morador(self, dados):
        return self.db.atualizar_morador(dados)

    def deletar_morador(self, id_morador):
        return self.db.deletar_morador(id_morador)

    def detectar_portas(self):
        portas = serial.tools.list_ports.comports()
        portas_disponiveis = []
        for porta in portas:
            portas_disponiveis.append(porta.device)
        return portas_disponiveis

    def deletar_historico_linha(self, placa, data_hora):
        try:
            return self.db.deletar_historico_linha(placa, data_hora)
        except Exception:
            return False

    def limpar_historico(self):
        try:
            return self.db.limpar_historico()
        except Exception:
            return False
    
    def deletar_historico_linha_por_id(self, id_registro):
        try:
            return self.db.deletar_historico_linha_por_id(id_registro)
        except Exception:
            return False

    def fechar_portao(self, tempo=5):
        """Fecha o portão (comando manual via console)"""
        try:
            resultado = self.enviar_comando_portao('CLOSE', tempo)
            print(f"[API] Comando CLOSE enviado: {resultado}")
            return resultado
        except Exception as e:
            print(f"[API] fechar_portao error: {e}")
            return False

    def abrir_portao(self, tempo=5):
        """Abre o portão (comando manual via console)"""
        try:
            resultado = self.enviar_comando_portao('OPEN', tempo)
            print(f"[API] Comando OPEN enviado: {resultado}")
            return resultado
        except Exception as e:
            print(f"[API] abrir_portao error: {e}")
            return False
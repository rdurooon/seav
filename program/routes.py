from database.database import Api
from serial_reader import SerialReader
import serial.tools.list_ports
import json
from datetime import datetime

# Buffer global para últimos acessos mantido durante toda a execução
ULTIMOS_ACESSOS = []

class API:
    def __init__(self):
        self.db = Api()
        self.serial_reader = SerialReader()
        self.window = None
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
            # data/hora para exibição e para salvar no banco (ISO)
            data_hora_display = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            data_hora_db = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

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

            # manter histórico em memória (persistente apenas até o fim do processo)
            self._adicionar_ultimo_acesso([
                placa_text,
                veiculo,
                morador,
                data_hora_display,
            ])

            # salvar no banco usando timestamp ISO (YYYY-MM-DD HH:MM:SS)
            try:
                saved = self.db.registrar_acesso(
                    placa_text,
                    id_morador,
                    autorizado,
                    veiculo,
                    morador,
                    endereco,
                    data_hora_db,
                    status,
                )
                if not saved:
                    print(f"[API] registrar_acesso falhou para {placa_text}")
            except Exception as e:
                print(f"[API] registrar_acesso exception: {e}")

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
            # Converter data_hora para formato ISO (YYYY-MM-DD HH:MM:SS) se necessário
            if data_hora:
                # Tenta formato ISO primeiro
                try:
                    datetime.strptime(data_hora, "%Y-%m-%d %H:%M:%S")
                    # já está correto
                except ValueError:
                    # Tenta formato brasileiro (DD/MM/YYYY HH:MM:SS)
                    try:
                        dt = datetime.strptime(data_hora, "%d/%m/%Y %H:%M:%S")
                        data_hora = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        # Se não conseguir, deixa como None para o banco usar NOW()
                        data_hora = None
            else:
                data_hora = None

            # Salvar no banco
            resultado = self.db.registrar_acesso(placa, id_morador, autorizado, veiculo, morador, endereco, data_hora, status)
            if resultado:
                # Formatar data_hora para exibição no buffer (DD/MM/YYYY HH:MM:SS)
                if data_hora:
                    try:
                        dt = datetime.strptime(data_hora, "%Y-%m-%d %H:%M:%S")
                        data_hora_display = dt.strftime("%d/%m/%Y %H:%M:%S")
                    except:
                        # fallback: usar a string original
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
        except Exception:
            return False

    def listar_historico(self, data_inicio=None, data_fim=None, placa=None):
        try:
            return self.db.listar_historico(data_inicio, data_fim, placa)
        except Exception:
            return []

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
            return self.serial_reader.send_command(comando, tempo)
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
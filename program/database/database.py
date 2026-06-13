"""
SEAV - Sistema de Banco de Dados
================================

Este módulo gerencia a conexão com o banco de dados MySQL.
As credenciais são carregadas de um arquivo 'credencials.key' (não versionado no Git).

Como funciona:
1. Ao inicializar a classe Api(), verifica se 'credencials.key' existe
2. Se não existir, cria automaticamente com um template
3. Carrega as credenciais do arquivo para conexões seguras

Segurança:
- O arquivo 'credencials.key' é ignorado pelo Git (.gitignore)
- Nunca commit credenciais de verdade neste arquivo
"""

import mysql.connector
import json
import os
from pathlib import Path

class Api:

    def __init__(self):
        self._credentials_path = str(Path(__file__).parent / "credencials.key")
        self._load_credentials()

    def _load_credentials(self):
        """Carrega ou cria o arquivo de credenciais"""
        if not Path(self._credentials_path).exists():
            self._create_credentials_file()
        
        with open(self._credentials_path, 'r', encoding='utf-8') as f:
            self.credentials = json.load(f)

    def _create_credentials_file(self):
        """Cria o arquivo de credenciais com um template vazio"""
        template = {
            "host": "",
            "port": 3306,
            "user": "",
            "password": "",
            "database": ""
        }
        
        with open(self._credentials_path, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=4, ensure_ascii=False)
        
        print(f"Arquivo de credenciais criado em: {self._credentials_path}")
        print("⚠️  IMPORTANTE: Atualize o arquivo com suas credenciais reais!")

    def conectar(self):
        return mysql.connector.connect(
            host=self.credentials["host"],
            port=self.credentials["port"],
            user=self.credentials["user"],
            password=self.credentials["password"],
            database=self.credentials["database"],
            connection_timeout=5
        )

    # ---------------- CREATE ----------------
    def cadastrar_completo(self, dados):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            cursor.execute("""
                INSERT INTO moradores (nome, cpf, data_nascimento, sexo)
                VALUES (%s, %s, %s, %s)
            """, (
                dados["nome"],
                dados["cpf"],
                dados["data_nascimento"],
                dados["sexo"]
            ))

            id_morador = cursor.lastrowid

            cursor.execute("""
                INSERT INTO contato (celular, email, id_morador)
                VALUES (%s, %s, %s)
            """, (
                dados["celular"],
                dados["email"],
                id_morador
            ))

            cursor.execute("""
                INSERT INTO endereco (rua, numero, bairro, cidade, estado, cep, id_morador)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                dados["rua"],
                dados["numero"],
                dados["bairro"],
                dados["cidade"],
                dados["estado"],
                dados["cep"],
                id_morador
            ))

            cursor.execute("""
                INSERT INTO veiculo (modelo, cor, placa, id_morador)
                VALUES (%s, %s, %s, %s)
            """, (
                dados["modelo"],
                dados["cor"],
                dados["placa"],
                id_morador
            ))

            conexao.commit()
            return "Cadastro realizado!"

        except Exception as e:
            conexao.rollback()
            return str(e)

        finally:
            cursor.close()
            conexao.close()

    # ---------------- READ ----------------
    def listar_completo(self):
        conexao = self.conectar()
        cursor = conexao.cursor()

        cursor.execute("""
            SELECT
                m.id_morador,
                m.nome,
                m.cpf,
                v.modelo,
                v.cor,
                v.placa
            FROM moradores m
            LEFT JOIN veiculo v ON m.id_morador = v.id_morador
        """)

        dados = cursor.fetchall()
        cursor.close()
        conexao.close()
        return dados

    # ---------------- BUSCAR UM ----------------
    def buscar_morador(self, id_morador):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            cursor.execute("""
                SELECT
                    m.id_morador,
                    m.nome,
                    m.cpf,
                    DATE_FORMAT(m.data_nascimento, '%Y-%m-%d'),
                    m.sexo,
                    c.celular,
                    c.email,
                    e.rua,
                    e.numero,
                    e.bairro,
                    e.cidade,
                    e.estado,
                    e.cep,
                    v.modelo,
                    v.cor,
                    v.placa
                FROM moradores m
                LEFT JOIN contato c ON m.id_morador = c.id_morador
                LEFT JOIN endereco e ON m.id_morador = e.id_morador
                LEFT JOIN veiculo v ON m.id_morador = v.id_morador
                WHERE m.id_morador = %s
            """, (id_morador,))

            return cursor.fetchone()

        except Exception as e:
            return str(e)

        finally:
            cursor.close()
            conexao.close()

    # ---------------- UPDATE ----------------
    def atualizar_morador(self, dados):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            id_morador = dados.get("id_morador")
            if not id_morador:
                return "ID não recebido"

            cursor.execute("""
                UPDATE moradores
                SET nome=%s, cpf=%s, data_nascimento=%s, sexo=%s
                WHERE id_morador=%s
            """, (
                dados["nome"],
                dados["cpf"],
                dados["data_nascimento"],
                dados["sexo"],
                id_morador
            ))

            cursor.execute("""
                UPDATE contato
                SET celular=%s, email=%s
                WHERE id_morador=%s
            """, (
                dados["celular"],
                dados["email"],
                id_morador
            ))

            cursor.execute("""
                UPDATE endereco
                SET rua=%s, numero=%s, bairro=%s, cidade=%s, estado=%s, cep=%s
                WHERE id_morador=%s
            """, (
                dados["rua"],
                dados["numero"],
                dados["bairro"],
                dados["cidade"],
                dados["estado"],
                dados["cep"],
                id_morador
            ))

            cursor.execute("""
                UPDATE veiculo
                SET modelo=%s, cor=%s, placa=%s
                WHERE id_morador=%s
            """, (
                dados["modelo"],
                dados["cor"],
                dados["placa"],
                id_morador
            ))

            conexao.commit()
            return "Atualizado com sucesso!"

        except Exception as e:
            conexao.rollback()
            return str(e)

        finally:
            cursor.close()
            conexao.close()

    # ---------------- DELETE ----------------
    def deletar_morador(self, id_morador):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            cursor.execute("DELETE FROM moradores WHERE id_morador=%s", (id_morador,))
            conexao.commit()
            return "Deletado com sucesso!"

        except Exception as e:
            conexao.rollback()
            return str(e)

        finally:
            cursor.close()
            conexao.close()

    # ---------------- CONFIG ----------------
    def salvar_config(self, chave, valor):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config (
                    chave VARCHAR(255) PRIMARY KEY,
                    valor TEXT
                )
            """)
            cursor.execute("""
                INSERT INTO config (chave, valor) VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE valor = %s
            """, (chave, valor, valor))
            conexao.commit()
            return "Config salva!"
        except Exception as e:
            conexao.rollback()
            return str(e)
        finally:
            cursor.close()
            conexao.close()

    def carregar_config(self, chave):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config (
                    chave VARCHAR(255) PRIMARY KEY,
                    valor TEXT
                )
            """)
            cursor.execute("SELECT valor FROM config WHERE chave = %s", (chave,))
            result = cursor.fetchone()
            return result[0] if result else None
        except Exception as e:
            return str(e)
        finally:
            cursor.close()
            conexao.close()

    # ---------------- BUSCAR POR PLACA ----------------
    def buscar_veiculo_por_placa(self, placa):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            cursor.execute("""
                SELECT
                    v.placa,
                    v.modelo,
                    v.cor,
                    m.id_morador,
                    m.nome,
                    e.rua,
                    e.numero,
                    e.bairro,
                    e.cidade,
                    e.estado,
                    e.cep
                FROM veiculo v
                LEFT JOIN moradores m ON v.id_morador = m.id_morador
                LEFT JOIN endereco e ON m.id_morador = e.id_morador
                WHERE v.placa = %s
                LIMIT 1
            """, (placa,))

            return cursor.fetchone()

        except Exception:
            return None

        finally:
            cursor.close()
            conexao.close()

    # ---------------- REGISTRAR ACESSO ----------------
    def registrar_acesso(self, placa, id_morador=None, autorizado=False, veiculo=None, morador=None, endereco=None, data_hora=None, status=None):
        print(f"[DB] registrar_acesso chamado: placa={placa}, veiculo={veiculo}, morador={morador}, endereco={endereco}, data_hora={data_hora}, status={status}, id_morador={id_morador}")
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS historico (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    placa VARCHAR(20),
                    veiculo VARCHAR(255),
                    morador VARCHAR(255),
                    endereco TEXT,
                    status VARCHAR(50),
                    data_hora DATETIME,
                    id_morador INT NULL
                )
            """)

            if data_hora:
                cursor.execute("""
                    INSERT INTO historico (placa, veiculo, morador, endereco, status, data_hora, id_morador)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (placa, veiculo, morador, endereco, status, data_hora, id_morador))
            else:
                cursor.execute("""
                    INSERT INTO historico (placa, veiculo, morador, endereco, status, data_hora, id_morador)
                    VALUES (%s, %s, %s, %s, %s, NOW(), %s)
                """, (placa, veiculo, morador, endereco, status, id_morador))

            conexao.commit()
            print("[DB] registrar_acesso sucesso")
            return True
        except Exception as e:
            conexao.rollback()
            print(f"[DB] registrar_acesso error: {e}")
            return False
        finally:
            cursor.close()
            conexao.close()

    # ---------------- LISTAR HISTÓRICO ----------------
    def listar_historico(self, data_inicio=None, data_fim=None, placa=None):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            query = """
                SELECT
                    id,
                    placa,
                    veiculo,
                    morador,
                    endereco,
                     DATE_FORMAT(data_hora, '%d/%m/%Y %H:%i:%s'),
                    status
                FROM historico
            """
            filtros = []
            parametros = []

            if data_inicio:
                filtros.append("data_hora >= %s")
                parametros.append(data_inicio + " 00:00:00")
            if data_fim:
                filtros.append("data_hora <= %s")
                parametros.append(data_fim + " 23:59:59")
            if placa:
                filtros.append("placa LIKE %s")
                parametros.append("%" + placa + "%")

            if filtros:
                query += " WHERE " + " AND ".join(filtros)

            query += " ORDER BY data_hora DESC"

            cursor.execute(query, tuple(parametros))
            return cursor.fetchall()

        except Exception as e:
            print(f"[DB] listar_historico error: {e}")
            return []
        finally:
            cursor.close()
            conexao.close()

    # ---------------- DELETAR LINHA HISTÓRICO ----------------
    def deletar_historico_linha(self, placa, data_hora):
        conexao = self.conectar()
        cursor = conexao.cursor()
        try:
            cursor.execute("""
                DELETE FROM historico
                WHERE placa = %s AND DATE_FORMAT(data_hora, '%%d/%%m/%%Y %%H:%%i:%%s') = %s
                LIMIT 1
            """, (placa, data_hora))
            conexao.commit()
            return True
        except Exception as e:
            conexao.rollback()
            print(f"[DB] deletar_historico_linha error: {e}")
            return False
        finally:
            cursor.close()
            conexao.close()

    # ---------------- LIMPAR TODO O HISTÓRICO ----------------
    def limpar_historico(self):
        conexao = self.conectar()
        cursor = conexao.cursor()
        try:
            cursor.execute("DELETE FROM historico")
            conexao.commit()
            return True
        except Exception as e:
            conexao.rollback()
            print(f"[DB] limpar_historico error: {e}")
            return False
        finally:
            cursor.close()
            conexao.close()

    # ---------------- DELETAR LINHA HISTÓRICO POR ID ----------------
    def deletar_historico_linha_por_id(self, id_registro):
        conexao = self.conectar()
        cursor = conexao.cursor()
        try:
            cursor.execute("DELETE FROM historico WHERE id = %s", (id_registro,))
            conexao.commit()
            return True
        except Exception as e:
            conexao.rollback()
            print(f"[DB] deletar_historico_linha_por_id error: {e}")
            return False
        finally:
            cursor.close()
            conexao.close()
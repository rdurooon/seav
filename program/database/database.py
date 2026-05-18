import mysql.connector

class Api:

    def conectar(self):
     return mysql.connector.connect(
        host="",
        port=3306,
        user="",
        password="",
        database=""
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
            # Criar tabela se não existe
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
            # Criar tabela se não existe
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
                    v.id_morador,
                    m.id_morador,
                    m.nome,
                    m.cpf
                FROM veiculo v
                LEFT JOIN moradores m ON v.id_morador = m.id_morador
                WHERE v.placa = %s
            """, (placa,))

            return cursor.fetchone()

        except Exception as e:
            return None

        finally:
            cursor.close()
            conexao.close()

    # ---------------- REGISTRAR ACESSO ----------------
    def registrar_acesso(self, placa, id_morador, autorizado):
        conexao = self.conectar()
        cursor = conexao.cursor()

        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS historico_acessos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    placa VARCHAR(20),
                    id_morador INT NULL,
                    autorizado TINYINT,
                    data_hora DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

            cursor.execute("""
                INSERT INTO historico_acessos (placa, id_morador, autorizado)
                VALUES (%s, %s, %s)
            """, (placa, id_morador, 1 if autorizado else 0))

            conexao.commit()
            return True
        except Exception as e:
            conexao.rollback()
            return False
        finally:
            cursor.close()
            conexao.close()
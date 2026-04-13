import webview
import mysql.connector
from pathlib import Path

class Api:

    def conectar(self):
        return mysql.connector.connect(
            host="localhost",
            user="root",
            password="root",
            database="condominio"
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


# ---------------- APP ----------------

api = Api()

BASE_DIR = Path(__file__).resolve().parent
HTML_PATH = BASE_DIR.parent / "program" / "src" / "home.html"

window = webview.create_window(
    "Sistema Condomínio",
    str(HTML_PATH),
    js_api=api,
    width=1980,
    height=1080,
    resizable=False
)

webview.start(debug=True)
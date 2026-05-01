from database.database import Api

class API:
    def __init__(self):
        self.db = Api()

    def ping(self):
        return "SEAV funcionando!"

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
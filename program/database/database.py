#CONEXÃO DO BANCO
import mysql.connector

conexao = mysql.connector.connect(
    host="localhost",
    user="root",
    password="root",
    database="condominio"
)

print("Conexão bem-sucedida!")

cursor = conexao.cursor()

###########################################
###############FUNÇÕES####################
##########################################

def cadastrar_morador():
    nome = input("Digite o nome do morador: ")
    cpf = input("Digite o CPF: ")
    data_nascimento = input("Digite a data de nascimento: ")
    sexo = input("Digite o sexo (M/F): ")
    
    sql = "insert into moradores (nome, cpf, data_nascimento, sexo) values (%s, %s, %s, %s)"
    valores = (nome, cpf, data_nascimento, sexo)
    cursor.execute(sql, valores)
    conexao.commit()
    print("Morador cadastrado com sucesso!")
    
def listar_moradores():
    cursor.execute("select * from moradores")
    resultado = cursor.fetchall()
        
    print("\n--- Moradores Cadastrados ---")
    for linha in resultado:
        print(linha)

###########################################
###############MENU#######################
##########################################

while True: 
    print("\n1. Cadastrar Morador")
    print("2. Listar Moradores")
    print("3. Sair")
    
    opcao = input("Escolha uma opção: ")
    
    if opcao == "1":
        cadastrar_morador()
    elif opcao == "2":
        listar_moradores()
    elif opcao == "3":
        print("Saindo do programa...")
        break
    else:
        print("Opção inválida. Tente novamente.")
###########################################
##############FINALIZAR###################
##########################################
# AMANHA TEM MAIS #

cursor.close()
conexao.close()
print("Conexão encerrada.")
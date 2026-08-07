"""Migração única: geoquote.db (SQLite, modelo antigo sem conta) -> Postgres
do Supabase (modelo novo, escopado por conta_id).

Pré-requisitos, nesta ordem:
  1. supabase/schema.sql            já rodado no projeto Supabase (RBAC interno).
  2. supabase/schema_contas.sql     já rodado no projeto Supabase (contas/contas_usuarios/...).
  3. DATABASE_URL no ambiente        apontando pro Postgres desse mesmo projeto.

**Este script é opcional pra migrar os dados de negócio antigos do SQLite**
(materiais/máquinas/perfis/clientes) — a ponte de usuários internos
(`profiles` -> `contas_usuarios`) que ele também fazia agora acontece
sozinha, sob demanda: `get_usuario_atual::_autoprovisionar_conta_interna`
(main.py) provisiona qualquer conta RBAC interna que ainda não tenha
`contas_usuarios` na primeira vez que ela chamar qualquer rota autenticada,
usando o MESMO `LYPSYOS_CONTA_ID_PADRAO` (conta fixa, mesmo id sempre) que
este script usa como destino padrão abaixo — então rodar isto continua
sendo compatível/idempotente mesmo que o auto-provisionamento já tenha
criado a conta sozinho.

O que faz, nessa ordem:
  1. Cria (ou reaproveita, se --conta-id for passado) UMA conta ENTERPRISE
     pra representar a própria Lypsyos — é o "dono" de todos os dados que
     hoje vivem soltos no SQLite compartilhado. Por padrão usa
     LYPSYOS_CONTA_ID_PADRAO, a mesma conta que o auto-provisionamento usa.
  2. Migra perfis_tributarios / materiais / maquinas_params / clientes pra
     essa conta. materiais não tinha conceito de perfil tributário antes —
     todos caem no perfil "Padrão" recém-criado.
  3. Faz a ponte dos usuários internos da Lypsyos: para cada linha em
     `profiles` (RBAC antigo, ver supabase/schema.sql) que ainda não tem
     `contas_usuarios`, cria uma linha apontando pra essa mesma conta —
     redundante com o auto-provisionamento sob demanda, mas útil pra
     provisionar todo mundo de uma vez em vez de esperar cada um logar.
     ADMINISTRADOR/GERENTE viram papel GESTOR (podem editar preço e ver
     tudo da conta); VENDEDOR continua VENDEDOR.

Idempotente: pode rodar de novo com o mesmo --conta-id sem duplicar nada
(usa a mesma checagem "já existe?" que as rotas de upsert do main.py usam).

Uso:
  python migrar_para_postgres.py                      # usa LYPSYOS_CONTA_ID_PADRAO
  python migrar_para_postgres.py --conta-id <uuid>     # reaproveita outra conta
  python migrar_para_postgres.py --sqlite-path outro.db
"""
import argparse
import sqlite3
import sys

from sqlalchemy import text

from main import (
    SessionLocal, engine, Base, LYPSYOS_CONTA_ID_PADRAO, MAPA_PAPEL_INTERNO,
    ContaDB, ContaUsuarioDB, PerfilTributarioDB, MaterialDB, MaquinaParamDB, ClienteDB,
)


def obter_ou_criar_conta(db, conta_id: str | None) -> str:
    conta_id = conta_id or LYPSYOS_CONTA_ID_PADRAO
    conta = db.get(ContaDB, conta_id)
    if conta:
        return conta.id
    if conta_id != LYPSYOS_CONTA_ID_PADRAO:
        sys.exit(f"--conta-id {conta_id} não existe em `contas`. Rode sem --conta-id pra usar/criar a conta padrão.")

    conta = ContaDB(id=conta_id, tipo_plano="ENTERPRISE", limite_vendedores=None)
    db.add(conta)
    db.commit()
    print(f"Conta Lypsyos criada: {conta.id} (mesma conta usada pelo auto-provisionamento em main.py).")
    return conta.id


def migrar_dados_de_negocio(db_sqlite: sqlite3.Connection, db_pg, conta_id: str):
    cur = db_sqlite.cursor()

    # 1) Perfis tributários — primeiro vira o padrão da conta.
    cur.execute("SELECT nome, imposto_perc FROM perfis_tributarios")
    perfis_antigos = cur.fetchall()
    perfil_padrao_id = None
    for i, (nome, imposto_perc) in enumerate(perfis_antigos):
        existente = db_pg.query(PerfilTributarioDB).filter_by(conta_id=conta_id, nome=nome).first()
        if not existente:
            existente = PerfilTributarioDB(conta_id=conta_id, nome=nome, imposto_perc=imposto_perc, padrao=(i == 0))
            db_pg.add(existente)
            db_pg.flush()
        if i == 0:
            perfil_padrao_id = existente.id
    if perfil_padrao_id is None:
        # Banco antigo sem nenhum perfil cadastrado — cria um mínimo pra
        # materiais poderem se ancorar em algo.
        padrao = PerfilTributarioDB(conta_id=conta_id, nome="Padrão", imposto_perc=18.0, padrao=True)
        db_pg.add(padrao)
        db_pg.flush()
        perfil_padrao_id = padrao.id
    db_pg.commit()
    print(f"Perfis tributários migrados: {len(perfis_antigos)}")

    # 2) Materiais — sem conceito de perfil no banco antigo, todos caem no padrão.
    cur.execute("SELECT nome, espessura, precoKg, densidade FROM materiais")
    materiais_antigos = cur.fetchall()
    n = 0
    for nome, espessura, preco_kg, densidade in materiais_antigos:
        existente = db_pg.query(MaterialDB).filter_by(
            conta_id=conta_id, perfil_tributario_id=perfil_padrao_id, nome=nome, espessura=espessura,
        ).first()
        if not existente:
            db_pg.add(MaterialDB(
                conta_id=conta_id, perfil_tributario_id=perfil_padrao_id,
                nome=nome, espessura=espessura, precoKg=preco_kg, densidade=densidade,
            ))
            n += 1
    db_pg.commit()
    print(f"Materiais migrados: {n}/{len(materiais_antigos)}")

    # 3) Máquinas — só ganham conta_id, sem perfil.
    cur.execute("SELECT maquina, material, espessura, velocidadeCorte, tempoPiercing, tempoSetup, valorHora FROM maquinas_params")
    maquinas_antigas = cur.fetchall()
    n = 0
    for maquina, material, espessura, vel, piercing, setup, valor_hora in maquinas_antigas:
        existente = db_pg.query(MaquinaParamDB).filter_by(
            conta_id=conta_id, maquina=maquina, material=material, espessura=espessura,
        ).first()
        if not existente:
            db_pg.add(MaquinaParamDB(
                conta_id=conta_id, maquina=maquina, material=material, espessura=espessura,
                velocidadeCorte=vel, tempoPiercing=piercing, tempoSetup=setup, valorHora=valor_hora,
            ))
            n += 1
    db_pg.commit()
    print(f"Máquinas migradas: {n}/{len(maquinas_antigas)}")

    # 4) Clientes — tabela nova (feature recente), pode nem existir num
    #    geoquote.db mais antigo.
    try:
        cur.execute("SELECT nome FROM clientes")
        clientes_antigos = cur.fetchall()
    except sqlite3.OperationalError:
        clientes_antigos = []
    n = 0
    for (nome,) in clientes_antigos:
        if not db_pg.query(ClienteDB).filter_by(conta_id=conta_id, nome=nome).first():
            db_pg.add(ClienteDB(conta_id=conta_id, nome=nome))
            n += 1
    db_pg.commit()
    print(f"Clientes migrados: {n}/{len(clientes_antigos)}")


def migrar_usuarios_internos(db_pg, conta_id: str):
    try:
        linhas = db_pg.execute(text("SELECT id, nome, role FROM profiles")).fetchall()
    except Exception as e:
        print(f"Aviso: não consegui ler `profiles` ({e}) — pulei a ponte de usuários internos.")
        db_pg.rollback()
        return

    n = 0
    for usuario_id, nome, role in linhas:
        if db_pg.get(ContaUsuarioDB, str(usuario_id)):
            continue
        db_pg.add(ContaUsuarioDB(
            id=str(usuario_id), conta_id=conta_id,
            papel=MAPA_PAPEL_INTERNO.get(role, "VENDEDOR"), nome=nome,
        ))
        n += 1
    db_pg.commit()
    print(f"Usuários internos ligados à conta Lypsyos: {n}/{len(linhas)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sqlite-path", default="./geoquote.db")
    parser.add_argument("--conta-id", default=None, help="Reaproveita uma conta já criada em vez de criar uma nova.")
    args = parser.parse_args()

    if engine.url.get_backend_name() == "sqlite":
        sys.exit("DATABASE_URL não está configurado (backend caiu no fallback SQLite) — defina a connection string do Postgres antes de migrar.")

    Base.metadata.create_all(bind=engine)  # garante que orcamentos/uso_diario etc. existem, sem tocar em profiles/contas já criadas via SQL

    db_sqlite = sqlite3.connect(args.sqlite_path)
    db_pg = SessionLocal()
    try:
        conta_id = obter_ou_criar_conta(db_pg, args.conta_id)
        migrar_dados_de_negocio(db_sqlite, db_pg, conta_id)
        migrar_usuarios_internos(db_pg, conta_id)
    finally:
        db_sqlite.close()
        db_pg.close()

    print("Migração concluída.")


if __name__ == "__main__":
    main()

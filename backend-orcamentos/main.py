import os
import uuid
import secrets
import tempfile
import uvicorn
import ezdxf
import jwt
from datetime import date, datetime
from ezdxf import bbox
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Depends, HTTPException, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Date, DateTime, JSON, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from nesting import nestear_pecas, NestingError
from pricing import PricingEngine
from geometria import calcular_geometria

load_dotenv()

motor_precos = PricingEngine()

# ==========================================
# 1. BANCO DE DADOS
# ==========================================
# Em produção, DATABASE_URL aponta pro Postgres do mesmo projeto Supabase
# usado pro login (rode supabase/schema_contas.sql lá ANTES de subir o
# backend). Sem a variável definida, cai num SQLite local — só pra dev/teste
# sem precisar de credenciais reais (ver backend-orcamentos/.env.example).
SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./geoquote.db")
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- Identidade / conta ---
# Fonte de verdade real (RLS, enums, FK pra auth.users, Realtime) é
# supabase/schema_contas.sql. Os modelos abaixo são só a visão que o
# backend usa pra consultar/gravar (via service role, que ignora RLS) — por
# isso usam tipos genéricos (String em vez de Enum/UUID nativos do
# Postgres), o que também os deixa utilizáveis contra SQLite em teste. Em
# Postgres de produção essas tabelas já existem antes do backend subir
# (criadas pelo .sql), então create_all() abaixo não recria nada nelas —
# só é útil pra criar do zero num SQLite local de dev/teste.
class ContaDB(Base):
    __tablename__ = "contas"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tipo_plano = Column(String, nullable=False, default="FREE")  # FREE | PRO | ENTERPRISE
    limite_vendedores = Column(Integer, nullable=True)


class ContaUsuarioDB(Base):
    __tablename__ = "contas_usuarios"
    id = Column(String(36), primary_key=True)  # = auth.users.id (Supabase)
    conta_id = Column(String(36), index=True, nullable=False)
    papel = Column(String, nullable=False, default="PROPRIETARIO")  # PROPRIETARIO | GESTOR | VENDEDOR
    nome = Column(String, nullable=True)
    foto_url = Column(String, nullable=True)


class ConviteDB(Base):
    __tablename__ = "convites"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conta_id = Column(String(36), index=True, nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=True)
    usado = Column(Boolean, default=False)
    criado_por = Column(String(36), nullable=True)


# Contador de cota diária do plano Free (10 orçamentos/dia) — ver
# verificar_quota/registrar_uso_diario, usados em /calcular-orcamento.
class UsoDiarioDB(Base):
    __tablename__ = "uso_diario"
    usuario_id = Column(String(36), primary_key=True)
    dia = Column(Date, primary_key=True)
    qtd_orcamentos = Column(Integer, default=0)


# Histórico de orçamentos — cada /calcular-orcamento bem-sucedido grava uma
# linha aqui. `payload` guarda o pedido enviado + o resultado devolvido como
# JSON (não normalizado peça-a-peça): dá pra reabrir/reexportar um orçamento
# antigo sem precisar de uma tabela própria por peça.
class OrcamentoDB(Base):
    __tablename__ = "orcamentos"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conta_id = Column(String(36), index=True, nullable=False)
    usuario_id = Column(String(36), index=True, nullable=False)
    cliente_nome = Column(String, nullable=True)
    valor_venda_total = Column(Float, nullable=True)
    status = Column(String, nullable=False, default="ORCADO")  # ORCADO | FECHADO
    payload = Column(JSON, nullable=False)
    criado_em = Column(DateTime, default=datetime.utcnow)
    fechado_em = Column(DateTime, nullable=True)


# Tabela 1: Mercado (Materiais e Preços). Escopada por conta E por perfil
# tributário: dois vendedores da mesma conta Enterprise podem ter o mesmo
# material/espessura com preços diferentes, desde que usem perfis
# tributários diferentes — ver decisão em POST /materiais.
class MaterialDB(Base):
    __tablename__ = "materiais"
    id = Column(Integer, primary_key=True, index=True)
    conta_id = Column(String(36), index=True, nullable=False)
    perfil_tributario_id = Column(Integer, index=True, nullable=False)
    nome = Column(String, index=True)      # Ex: Aço Carbono
    espessura = Column(Float)              # Ex: 1.50
    precoKg = Column(Float)                # Ex: 8.50
    densidade = Column(Float, default=7.85)# Ex: 7.85 (Aço)

# Tabela 2: Engenharia (Máquinas e Parâmetros). Escopada só por conta — não
# por perfil: parâmetros de máquina são compartilhados pela conta inteira.
class MaquinaParamDB(Base):
    __tablename__ = "maquinas_params"
    id = Column(Integer, primary_key=True, index=True)
    conta_id = Column(String(36), index=True, nullable=False)
    maquina = Column(String, index=True)   # Ex: Laser Fibra 4kW
    material = Column(String)              # Link com Material (Ex: Aço Carbono)
    espessura = Column(Float)              # Link com Espessura (Ex: 1.50)
    velocidadeCorte = Column(Float)
    tempoPiercing = Column(Float)
    tempoSetup = Column(Float)
    valorHora = Column(Float)

# Tabela 3: Vendas (Perfis Tributários). `padrao` marca qual perfil a conta
# usa quando o usuário não escolhe nenhum explicitamente (no máx. 1 por
# conta — ver POST /perfis-tributarios).
class PerfilTributarioDB(Base):
    __tablename__ = "perfis_tributarios"
    id = Column(Integer, primary_key=True, index=True)
    conta_id = Column(String(36), index=True, nullable=False)
    nome = Column(String)                  # Ex: Simples Nacional, Revenda
    imposto_perc = Column(Float)           # Ex: 6.0 (%)
    padrao = Column(Boolean, default=False)

# Tabela 4: Lista simples de clientes já usados em orçamentos (autocomplete do
# dropdown "Cliente" no formulário). Compartilhada por toda a conta — gestor
# e vendedores veem a mesma lista.
class ClienteDB(Base):
    __tablename__ = "clientes"
    id = Column(Integer, primary_key=True, index=True)
    conta_id = Column(String(36), index=True, nullable=False)
    nome = Column(String, index=True)

Base.metadata.create_all(bind=engine)


def seed_conta_padrao(db: Session, conta_id: str):
    """Cria o Perfil Tributário padrão de uma conta nova. Não é mais um seed
    global condicionado a "banco vazio" (não existe mais 1 banco só) — cada
    conta paga começa com só isso; materiais/máquinas ficam por conta do
    cliente cadastrar, não fazia sentido herdar dados de exemplo da
    Lypsyos. Chamado pelo endpoint de provisionamento de conta."""
    if db.query(PerfilTributarioDB).filter_by(conta_id=conta_id).first() is None:
        db.add(PerfilTributarioDB(conta_id=conta_id, nome="Padrão", imposto_perc=18.0, padrao=True))
        db.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# 1b. AUTENTICAÇÃO — JWT emitido pelo Supabase Auth
# ==========================================
# Verificação por segredo compartilhado (HS256) — é o esquema legado do
# Supabase, ainda suportado em todo projeto (Settings > API > JWT Settings).
# Projetos novos que só expõem o esquema assimétrico (JWKS) precisam trocar
# esta função por validação via chave pública/JWKS — mesma ideia, detalhe
# de implementação a confirmar contra o projeto real (ver plano).
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")


class UsuarioAtual(BaseModel):
    id: str
    email: Optional[str] = None
    conta_id: str
    papel: str
    nome: Optional[str] = None


def _decodificar_token(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autenticação ausente.")
    token = authorization[len("Bearer "):]
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET não configurado no backend.")
    try:
        return jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token de autenticação inválido ou expirado.")


def get_identidade_jwt(authorization: Optional[str] = Header(None)) -> dict:
    """Só valida o token e devolve os claims — usado pelo endpoint de
    provisionamento de conta, que roda ANTES de existir uma linha em
    contas_usuarios (get_usuario_atual exigiria ela já existir)."""
    return _decodificar_token(authorization)


# Conta interna fixa da Lypsyos — destino de auto-provisionamento de
# qualquer conta RBAC interna (`profiles`) que ainda não tem `contas_usuarios`.
# ID fixo (não gerado por request) de propósito: todo usuário interno que
# passar por aqui cai NA MESMA conta, sem precisar de coordenação/env var.
# `migrar_para_postgres.py` usa esse mesmo valor como destino padrão, então
# rodar o script continua sendo idempotente/compatível com isso.
LYPSYOS_CONTA_ID_PADRAO = "00000000-0000-0000-0000-000000000001"
MAPA_PAPEL_INTERNO = {"ADMINISTRADOR": "GESTOR", "GERENTE": "GESTOR", "VENDEDOR": "VENDEDOR"}


def _autoprovisionar_conta_interna(db: Session, usuario_id: str) -> Optional[ContaUsuarioDB]:
    """Self-healing pra contas RBAC internas da Lypsyos (`profiles`, criadas
    manualmente no painel Supabase — nunca passam por POST /contas/provisionar,
    que só o fluxo de cadastro público chama). Sem isso, TODO usuário interno
    ficaria bloqueado (403) em toda rota escopada por conta assim que essas
    rotas passaram a exigir conta_id, até alguém lembrar de rodar
    migrar_para_postgres.py manualmente — frágil demais pra depender disso
    toda vez que alguém novo entra pra equipe. Só age se existir uma linha
    correspondente em `profiles`; senão devolve None e quem chamou continua
    tratando como não-provisionado (403)."""
    try:
        linha = db.execute(text("SELECT nome, role FROM profiles WHERE id = :id"), {"id": usuario_id}).first()
    except Exception:
        db.rollback()
        return None
    if not linha:
        return None

    nome, role = linha
    if not db.get(ContaDB, LYPSYOS_CONTA_ID_PADRAO):
        db.add(ContaDB(id=LYPSYOS_CONTA_ID_PADRAO, tipo_plano="ENTERPRISE", limite_vendedores=None))
        db.flush()
    conta_usuario = ContaUsuarioDB(
        id=usuario_id, conta_id=LYPSYOS_CONTA_ID_PADRAO,
        papel=MAPA_PAPEL_INTERNO.get(role, "VENDEDOR"), nome=nome,
    )
    db.add(conta_usuario)
    seed_conta_padrao(db, LYPSYOS_CONTA_ID_PADRAO)
    db.commit()
    return conta_usuario


def get_usuario_atual(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)) -> UsuarioAtual:
    claims = _decodificar_token(authorization)
    usuario_id = claims.get("sub")
    conta_usuario = db.query(ContaUsuarioDB).filter_by(id=usuario_id).first()
    if not conta_usuario:
        conta_usuario = _autoprovisionar_conta_interna(db, usuario_id)
    if not conta_usuario:
        raise HTTPException(status_code=403, detail="Conta ainda não provisionada para este usuário.")
    return UsuarioAtual(
        id=usuario_id,
        email=claims.get("email"),
        conta_id=conta_usuario.conta_id,
        papel=conta_usuario.papel,
        nome=conta_usuario.nome,
    )


def exigir_papel_edicao(usuario: UsuarioAtual = Depends(get_usuario_atual)) -> UsuarioAtual:
    """Bloqueia escrita em materiais/máquinas/perfis pra VENDEDOR — só quem
    pode mexer em preço é PROPRIETARIO (Free/Pro, dono da própria conta) ou
    GESTOR (Enterprise). Ver item 3 do pedido do usuário."""
    if usuario.papel == "VENDEDOR":
        raise HTTPException(status_code=403, detail="Vendedores não podem alterar parâmetros de preço — fale com o gestor da conta.")
    return usuario


def exigir_gestor(usuario: UsuarioAtual = Depends(get_usuario_atual)) -> UsuarioAtual:
    """Só o GESTOR de uma conta Enterprise convida vendedores — PROPRIETARIO
    (Free/Pro solo) e VENDEDOR não têm essa ação."""
    if usuario.papel != "GESTOR":
        raise HTTPException(status_code=403, detail="Só o gestor da conta pode gerenciar a equipe.")
    return usuario


# ==========================================
# 1c. COTAS DO PLANO FREE
# ==========================================
LIMITE_ORCAMENTOS_DIA_FREE = 10
LIMITE_PECAS_ORCAMENTO_FREE = 50


def contar_orcamentos_hoje(db: Session, usuario_id: str) -> int:
    uso = db.get(UsoDiarioDB, (usuario_id, date.today()))
    return uso.qtd_orcamentos if uso else 0


def verificar_quota(dados: "OrcamentoPayload", usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)) -> UsuarioAtual:
    """Aplicado só em /calcular-orcamento. Pro/Enterprise não têm teto (nem
    de peças, nem diário) — só o Free, por pedido explícito do usuário."""
    conta = db.get(ContaDB, usuario.conta_id)
    if not conta or conta.tipo_plano != "FREE":
        return usuario
    if len(dados.pecas) > LIMITE_PECAS_ORCAMENTO_FREE:
        raise HTTPException(
            status_code=400,
            detail=f"O plano Free permite no máximo {LIMITE_PECAS_ORCAMENTO_FREE} peças por orçamento — faça upgrade pra Pro pra remover esse limite.",
        )
    if contar_orcamentos_hoje(db, usuario.id) >= LIMITE_ORCAMENTOS_DIA_FREE:
        raise HTTPException(
            status_code=429,
            detail=f"Limite de {LIMITE_ORCAMENTOS_DIA_FREE} orçamentos/dia do plano Free atingido — volte amanhã ou faça upgrade pra Pro.",
        )
    return usuario


def registrar_uso_diario(db: Session, usuario: UsuarioAtual):
    """Incrementa o contador de hoje — só chamado depois de um cálculo
    bem-sucedido (não penaliza tentativa que deu erro de validação/nesting)."""
    conta = db.get(ContaDB, usuario.conta_id)
    if not conta or conta.tipo_plano != "FREE":
        return
    hoje = date.today()
    uso = db.get(UsoDiarioDB, (usuario.id, hoje))
    if not uso:
        uso = UsoDiarioDB(usuario_id=usuario.id, dia=hoje, qtd_orcamentos=0)
        db.add(uso)
    uso.qtd_orcamentos += 1
    db.commit()


app = FastAPI(title="API Lypsyos - Motor de Orçamentos")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ==========================================
# 2. MODELOS PYDANTIC E ROTAS CRUD
# ==========================================
class MaterialCreate(BaseModel):
    nome: str
    espessura: float
    precoKg: float
    densidade: float
    perfil_tributario_id: int

class MaquinaParamCreate(BaseModel):
    maquina: str
    material: str
    espessura: float
    velocidadeCorte: float
    tempoPiercing: float
    tempoSetup: float
    valorHora: float

class PerfilTributarioCreate(BaseModel):
    nome: str
    imposto_perc: float
    padrao: bool = False

# --- Rotas CRUD: MATERIAIS ---
# Chave natural de upsert é (perfil_tributario_id, nome, espessura), não só
# (nome, espessura) — é o que permite 2 vendedores da mesma conta terem o
# mesmo material/espessura com preços diferentes, desde que em perfis
# tributários diferentes (item 3 do pedido do usuário).
@app.get("/materiais")
def get_materiais(usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    return db.query(MaterialDB).filter_by(conta_id=usuario.conta_id).all()

@app.post("/materiais")
def add_material(item: MaterialCreate, usuario: UsuarioAtual = Depends(exigir_papel_edicao), db: Session = Depends(get_db)):
    perfil = db.query(PerfilTributarioDB).filter_by(id=item.perfil_tributario_id, conta_id=usuario.conta_id).first()
    if not perfil:
        raise HTTPException(status_code=400, detail="Perfil tributário inválido para esta conta.")
    db_item = db.query(MaterialDB).filter_by(
        conta_id=usuario.conta_id, perfil_tributario_id=item.perfil_tributario_id,
        nome=item.nome, espessura=item.espessura,
    ).first()
    if db_item:
        db_item.precoKg = item.precoKg
        db_item.densidade = item.densidade
    else:
        db_item = MaterialDB(conta_id=usuario.conta_id, **item.dict())
        db.add(db_item)
    db.commit()
    return {"status": "sucesso"}

@app.delete("/materiais/{id}")
def del_material(id: int, usuario: UsuarioAtual = Depends(exigir_papel_edicao), db: Session = Depends(get_db)):
    db.query(MaterialDB).filter(MaterialDB.id == id, MaterialDB.conta_id == usuario.conta_id).delete()
    db.commit()
    return {"status": "sucesso"}

# --- Rotas CRUD: MÁQUINAS ---
@app.get("/maquinas-params")
def get_maquinas(usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    return db.query(MaquinaParamDB).filter_by(conta_id=usuario.conta_id).all()

@app.post("/maquinas-params")
def add_maquina(item: MaquinaParamCreate, usuario: UsuarioAtual = Depends(exigir_papel_edicao), db: Session = Depends(get_db)):
    db_item = db.query(MaquinaParamDB).filter_by(
        conta_id=usuario.conta_id, maquina=item.maquina, material=item.material, espessura=item.espessura,
    ).first()
    if db_item:
        db_item.velocidadeCorte = item.velocidadeCorte
        db_item.tempoPiercing = item.tempoPiercing
        db_item.tempoSetup = item.tempoSetup
        db_item.valorHora = item.valorHora
    else:
        db_item = MaquinaParamDB(conta_id=usuario.conta_id, **item.dict())
        db.add(db_item)
    db.commit()
    return {"status": "sucesso"}

@app.delete("/maquinas-params/{id}")
def del_maquina(id: int, usuario: UsuarioAtual = Depends(exigir_papel_edicao), db: Session = Depends(get_db)):
    db.query(MaquinaParamDB).filter(MaquinaParamDB.id == id, MaquinaParamDB.conta_id == usuario.conta_id).delete()
    db.commit()
    return {"status": "sucesso"}

# --- Rotas CRUD: PERFIS TRIBUTÁRIOS ---
@app.get("/perfis-tributarios")
def get_perfis(usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    return db.query(PerfilTributarioDB).filter_by(conta_id=usuario.conta_id).all()

@app.post("/perfis-tributarios")
def add_perfil(item: PerfilTributarioCreate, usuario: UsuarioAtual = Depends(exigir_papel_edicao), db: Session = Depends(get_db)):
    db_item = db.query(PerfilTributarioDB).filter_by(conta_id=usuario.conta_id, nome=item.nome).first()
    if db_item:
        db_item.imposto_perc = item.imposto_perc
        if item.padrao:
            db_item.padrao = True
    else:
        db_item = PerfilTributarioDB(conta_id=usuario.conta_id, **item.dict())
        db.add(db_item)
    # Só 1 perfil "padrão" por conta — marcar um novo desmarca os outros.
    if item.padrao:
        db.query(PerfilTributarioDB).filter(
            PerfilTributarioDB.conta_id == usuario.conta_id, PerfilTributarioDB.nome != item.nome,
        ).update({"padrao": False})
    db.commit()
    return {"status": "sucesso"}

@app.delete("/perfis-tributarios/{id}")
def del_perfil(id: int, usuario: UsuarioAtual = Depends(exigir_papel_edicao), db: Session = Depends(get_db)):
    db.query(PerfilTributarioDB).filter(PerfilTributarioDB.id == id, PerfilTributarioDB.conta_id == usuario.conta_id).delete()
    db.commit()
    return {"status": "sucesso"}

# --- Rotas CRUD: CLIENTES ---
class ClienteCreate(BaseModel):
    nome: str

@app.get("/clientes")
def get_clientes(usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    return db.query(ClienteDB).filter_by(conta_id=usuario.conta_id).order_by(ClienteDB.nome).all()

@app.post("/clientes")
def add_cliente(item: ClienteCreate, usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    upsert_cliente(db, usuario.conta_id, item.nome)
    return {"status": "sucesso"}

@app.delete("/clientes/{id}")
def del_cliente(id: int, usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    db.query(ClienteDB).filter(ClienteDB.id == id, ClienteDB.conta_id == usuario.conta_id).delete()
    db.commit()
    return {"status": "sucesso"}


def upsert_cliente(db: Session, conta_id: str, nome: str):
    """Registra um nome de cliente pra aparecer no dropdown de próximos orçamentos
    dessa conta. Silencioso por design: nome vazio não gera erro, só não registra nada."""
    nome = (nome or "").strip()
    if not nome:
        return
    if not db.query(ClienteDB).filter_by(conta_id=conta_id, nome=nome).first():
        db.add(ClienteDB(conta_id=conta_id, nome=nome))
        db.commit()


# ==========================================
# 2b. CONTAS: provisionamento, convites, equipe
# ==========================================
class ProvisionarContaRequest(BaseModel):
    nome: str
    # Presente quando o cadastro veio de um link de convite (fluxo Enterprise
    # "gestor convida vendedor") — nesse caso o usuário entra na conta do
    # convite como VENDEDOR em vez de ganhar uma conta Free própria.
    convite_token: Optional[str] = None


@app.post("/contas/provisionar")
def provisionar_conta(dados: ProvisionarContaRequest, claims: dict = Depends(get_identidade_jwt), db: Session = Depends(get_db)):
    """Chamado pelo frontend logo após um cadastro público bem-sucedido
    (supabase.auth.signUp ou, no futuro, login por Google) — NUNCA por um
    trigger em auth.users, de propósito (ver comentário no topo de
    supabase/schema_contas.sql: um trigger não teria como distinguir conta
    interna da Lypsyos de cadastro público novo). Idempotente: chamar de
    novo pra quem já tem conta só devolve o que já existe, não duplica."""
    usuario_id = claims.get("sub")
    nome = dados.nome.strip() or claims.get("email", "")

    existente = db.get(ContaUsuarioDB, usuario_id)
    if existente:
        conta = db.get(ContaDB, existente.conta_id)
        return {"conta_id": existente.conta_id, "papel": existente.papel, "tipo_plano": conta.tipo_plano if conta else None}

    if dados.convite_token:
        convite = db.query(ConviteDB).filter_by(token=dados.convite_token, usado=False).first()
        if not convite:
            raise HTTPException(status_code=400, detail="Convite inválido, expirado ou já utilizado.")
        contas_usuario = ContaUsuarioDB(id=usuario_id, conta_id=convite.conta_id, papel="VENDEDOR", nome=nome)
        convite.usado = True
        db.add(contas_usuario)
        db.commit()
        conta = db.get(ContaDB, convite.conta_id)
        return {"conta_id": convite.conta_id, "papel": "VENDEDOR", "tipo_plano": conta.tipo_plano if conta else None}

    conta = ContaDB(id=str(uuid.uuid4()), tipo_plano="FREE")
    db.add(conta)
    db.flush()
    db.add(ContaUsuarioDB(id=usuario_id, conta_id=conta.id, papel="PROPRIETARIO", nome=nome))
    db.commit()
    seed_conta_padrao(db, conta.id)
    return {"conta_id": conta.id, "papel": "PROPRIETARIO", "tipo_plano": conta.tipo_plano}


@app.get("/contas/me")
def obter_minha_conta(usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    conta = db.get(ContaDB, usuario.conta_id)
    conta_usuario = db.get(ContaUsuarioDB, usuario.id)
    tipo_plano = conta.tipo_plano if conta else None
    return {
        "id": usuario.id, "nome": usuario.nome, "email": usuario.email,
        "foto_url": conta_usuario.foto_url if conta_usuario else None,
        "papel": usuario.papel, "conta_id": usuario.conta_id,
        "tipo_plano": tipo_plano,
        "limite_vendedores": conta.limite_vendedores if conta else None,
        # Só relevante (e só calculado) pro plano Free — Pro/Enterprise não
        # têm teto, ver verificar_quota.
        "orcamentos_hoje": contar_orcamentos_hoje(db, usuario.id) if tipo_plano == "FREE" else None,
        "limite_orcamentos_dia": LIMITE_ORCAMENTOS_DIA_FREE if tipo_plano == "FREE" else None,
    }


class AtualizarContaUsuarioRequest(BaseModel):
    nome: Optional[str] = None
    foto_url: Optional[str] = None


@app.patch("/contas/me")
def atualizar_minha_conta(dados: AtualizarContaUsuarioRequest, usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    conta_usuario = db.get(ContaUsuarioDB, usuario.id)
    if dados.nome is not None:
        conta_usuario.nome = dados.nome.strip() or conta_usuario.nome
    if dados.foto_url is not None:
        conta_usuario.foto_url = dados.foto_url
    db.commit()
    return {"status": "sucesso"}


class AlterarPlanoRequest(BaseModel):
    tipo_plano: str  # FREE | PRO | ENTERPRISE
    limite_vendedores: Optional[int] = None  # só usado/obrigatório quando tipo_plano == ENTERPRISE


@app.post("/contas/alterar-plano")
def alterar_plano(dados: AlterarPlanoRequest, usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    """Troca de plano self-service — SEM cobrança real (não há gateway de
    pagamento integrado ainda). Existe pra deixar testar o comportamento de
    cada tier agora; quando um gateway for definido, isso passa a ser
    chamado só depois de um checkout confirmado, não direto pelo botão."""
    if dados.tipo_plano not in ("FREE", "PRO", "ENTERPRISE"):
        raise HTTPException(status_code=400, detail="Plano inválido.")
    if usuario.papel == "VENDEDOR":
        raise HTTPException(status_code=403, detail="Só o proprietário ou gestor da conta pode trocar o plano.")
    if dados.tipo_plano == "ENTERPRISE" and not dados.limite_vendedores:
        raise HTTPException(status_code=400, detail="Informe quantos vendedores (assentos) a conta Enterprise vai ter.")

    conta = db.get(ContaDB, usuario.conta_id)
    conta.tipo_plano = dados.tipo_plano
    conta.limite_vendedores = dados.limite_vendedores if dados.tipo_plano == "ENTERPRISE" else None

    # Virar Enterprise promove o PROPRIETARIO solo a GESTOR (agora pode ter
    # equipe); voltar pra FREE/PRO faz sentido continuar como está (conta
    # continua sendo dele). Ver exigir_gestor/exigir_papel_edicao.
    usuario_db = db.get(ContaUsuarioDB, usuario.id)
    if dados.tipo_plano == "ENTERPRISE" and usuario_db.papel == "PROPRIETARIO":
        usuario_db.papel = "GESTOR"

    db.commit()
    return {"status": "sucesso", "tipo_plano": conta.tipo_plano}


class ConviteCreate(BaseModel):
    email: Optional[str] = None


@app.post("/contas/convites")
def criar_convite(dados: ConviteCreate, usuario: UsuarioAtual = Depends(exigir_gestor), db: Session = Depends(get_db)):
    conta = db.get(ContaDB, usuario.conta_id)
    qtd_vendedores = db.query(ContaUsuarioDB).filter_by(conta_id=usuario.conta_id, papel="VENDEDOR").count()
    if conta and conta.limite_vendedores is not None and qtd_vendedores >= conta.limite_vendedores:
        raise HTTPException(status_code=400, detail=f"Limite de {conta.limite_vendedores} vendedores da conta já atingido.")
    token = secrets.token_urlsafe(24)
    db.add(ConviteDB(id=str(uuid.uuid4()), conta_id=usuario.conta_id, token=token, email=dados.email, criado_por=usuario.id))
    db.commit()
    return {"token": token}


@app.get("/contas/equipe")
def listar_equipe(usuario: UsuarioAtual = Depends(exigir_gestor), db: Session = Depends(get_db)):
    membros = db.query(ContaUsuarioDB).filter_by(conta_id=usuario.conta_id).all()
    convites_pendentes = db.query(ConviteDB).filter_by(conta_id=usuario.conta_id, usado=False).all()
    return {
        "membros": membros,
        "convites_pendentes": [{"id": c.id, "token": c.token, "email": c.email} for c in convites_pendentes],
    }


# ==========================================
# 2c. ORÇAMENTOS: histórico, fechamento, métricas
# ==========================================
# Cada linha aqui é gravada por /calcular-orcamento (ver fim da função
# calcular_orcamento) — não existe rota separada pra "criar" orçamento.
@app.get("/orcamentos")
def listar_orcamentos(usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    query = db.query(OrcamentoDB).filter_by(conta_id=usuario.conta_id)
    if usuario.papel != "GESTOR":
        # PROPRIETARIO (Free/Pro solo) e VENDEDOR só veem os próprios — só
        # GESTOR enxerga o histórico da equipe inteira.
        query = query.filter_by(usuario_id=usuario.id)
    itens = query.order_by(OrcamentoDB.criado_em.desc()).all()

    nomes_por_usuario = {m.id: m.nome for m in db.query(ContaUsuarioDB).filter_by(conta_id=usuario.conta_id).all()}
    return [{
        "id": o.id, "usuario_id": o.usuario_id, "usuario_nome": nomes_por_usuario.get(o.usuario_id, "—"),
        "cliente_nome": o.cliente_nome, "valor_venda_total": o.valor_venda_total,
        "status": o.status, "criado_em": o.criado_em, "fechado_em": o.fechado_em,
    } for o in itens]


@app.get("/orcamentos/{id}")
def obter_orcamento(id: str, usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    orcamento = db.get(OrcamentoDB, id)
    if not orcamento or orcamento.conta_id != usuario.conta_id:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")
    if usuario.papel != "GESTOR" and orcamento.usuario_id != usuario.id:
        raise HTTPException(status_code=403, detail="Sem acesso a este orçamento.")
    return orcamento


@app.patch("/orcamentos/{id}/fechar")
def fechar_orcamento(id: str, usuario: UsuarioAtual = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    """Vendedor sinaliza que fechou o negócio com o cliente — é o gatilho da
    métrica orçado x fechado, e (via Supabase Realtime na tabela orcamentos,
    ver schema_contas.sql) o que avisa o gestor em tempo real."""
    orcamento = db.get(OrcamentoDB, id)
    if not orcamento or orcamento.conta_id != usuario.conta_id:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")
    if usuario.papel != "GESTOR" and orcamento.usuario_id != usuario.id:
        raise HTTPException(status_code=403, detail="Só o vendedor responsável ou o gestor podem fechar este orçamento.")
    orcamento.status = "FECHADO"
    orcamento.fechado_em = datetime.utcnow()
    db.commit()
    return {"status": "sucesso"}


@app.get("/contas/metricas")
def obter_metricas(usuario: UsuarioAtual = Depends(exigir_gestor), db: Session = Depends(get_db)):
    orcamentos = db.query(OrcamentoDB).filter_by(conta_id=usuario.conta_id).all()
    total = len(orcamentos)
    fechados = sum(1 for o in orcamentos if o.status == "FECHADO")
    nomes_por_usuario = {m.id: m.nome for m in db.query(ContaUsuarioDB).filter_by(conta_id=usuario.conta_id).all()}

    por_vendedor = {}
    for o in orcamentos:
        bucket = por_vendedor.setdefault(o.usuario_id, {
            "usuario_id": o.usuario_id, "nome": nomes_por_usuario.get(o.usuario_id, "—"),
            "orcados": 0, "fechados": 0,
        })
        bucket["orcados"] += 1
        if o.status == "FECHADO":
            bucket["fechados"] += 1

    return {
        "total_orcados": total,
        "total_fechados": fechados,
        "taxa_conversao_pct": round(100 * fechados / total, 1) if total else 0.0,
        "por_vendedor": list(por_vendedor.values()),
    }


# ==========================================
# 3. MODELOS PYDANTIC
# ==========================================
class ConfigChapa(BaseModel):
    largura: float
    comprimento: float
    margem: float = 10.0
    offsetPeca: float = 5.0
    # Override da máquina usada no nesting desta espessura (ex: força GUILHOTINA
    # mesmo que as peças do grupo estejam com outra máquina). None = mantém o
    # comportamento antigo (usa a máquina da 1ª peça do grupo, "maquina_ref").
    maquina: Optional[str] = None
    # Não muda nenhum cálculo — só re-rotula a métrica de sucata já existente
    # (Controle de Sobras) como "sobra reservada para o cliente" no relatório,
    # em vez de descarte.
    clienteQuerSobra: bool = False


class Peca(BaseModel):
    id: str
    qtd: int
    tipoPeca: str
    tipoTriangulo: Optional[str] = None
    espessura: float
    dimA: float
    dimB: float
    dimC: Optional[float] = 0.0
    tipoFuro: str
    nFuros: int
    diaFuro: float
    furoOffsetX: float
    furoOffsetY: float
    pesoUnitario: float
    pesoTotal: float
    valorHora: float
    precoKgBase: float

    # NOVOS CAMPOS RECEBIDOS DO FRONTEND
    tempoPiercing: Optional[float] = 2.0
    tempoSetup: Optional[float] = 5.0

    maquina: Optional[str] = None
    material: Optional[str] = None
    densidade: Optional[float] = 7.85
    areaUtilMm2: Optional[float] = 0.0
    perimetroCorteMm: Optional[float] = 0.0
    velocidadeCorte: Optional[float] = 0.0
    dxfImportado: Optional[bool] = False


class OrcamentoPayload(BaseModel):
    cliente: str
    imposto: float
    comissao: float
    margemLucro: float
    precoKg: float
    frete: float
    processo: str
    fatorNesting: float
    pecas: List[Peca]
    configChapas: Dict[str, ConfigChapa]
    # Facção (cliente traz a própria chapa) x pacote completo. Quando False, o
    # custo de material não entra na base de precificação (markup incide só
    # sobre o custo de máquina/serviço) — mas peso/nº de chapas continuam
    # calculados normalmente, como referência informativa pro orçamentista.
    incluiMaterial: bool = True


# ==========================================
# 4. MOTOR DE ORÇAMENTO
# ==========================================
@app.post("/calcular-orcamento")
def calcular_orcamento(dados: OrcamentoPayload, usuario: UsuarioAtual = Depends(verificar_quota), db: Session = Depends(get_db)):
    upsert_cliente(db, usuario.conta_id, dados.cliente)

    total_pecas_global = 0
    peso_total_global = 0.0
    tempo_total_global_min = 0.0

    custo_material_global = 0.0
    custo_maquina_global = 0.0

    resumo_espessuras = {}
    pecas_por_espessura = {}
    # Rateio real por peça (não uma divisão proporcional do total — o tempo/custo
    # de cada peça já é calculado individualmente aqui, só nunca tinha sido
    # devolvido pro frontend; a tabela de peças do orçamento usava "-" nessas
    # colunas). Chave = peça.id, mesmo critério já usado em toda a app pra
    # identificar peças (nesting, cores, etc).
    detalhamento_pecas = {}

    for peca in dados.pecas:
        espessura_str = f"{peca.espessura:.2f}"

        if espessura_str not in resumo_espessuras:
            resumo_espessuras[espessura_str] = {
                "espessura": peca.espessura,
                "qtd_pecas": 0,
                "peso_kg": 0.0,
                "tempo_min": 0.0,
                "area_total_mm2": 0.0,
                "perimetro_total_mm": 0.0,
                "custo_material": 0.0,
                "custo_maquina": 0.0,
                "tempo_setup": peca.tempoSetup,  # Guarda o setup desta espessura
                "valor_hora_ref": peca.valorHora,  # Referência p/ calcular o custo do setup depois
                # LIMITAÇÃO: o agrupamento é só por espessura, não por (material, espessura).
                # Se o usuário trocar de material mantendo a mesma espessura no meio do
                # orçamento, a densidade/preço da PRIMEIRA peça do grupo é usada como
                # representativa para o custo da chapa consumida. Corrigir de verdade exige
                # agrupar por (material, espessura) — fora do escopo desta rodada.
                "densidade_ref": peca.densidade,
                "preco_kg_ref": peca.precoKgBase,
                # Mesma limitação/precedente acima, aplicada à máquina: define o algoritmo
                # de nesting (Guilhotina x padrão) do grupo inteiro pela PRIMEIRA peça.
                "maquina_ref": peca.maquina,
            }
            pecas_por_espessura[espessura_str] = []

        if peca.dxfImportado:
            # DXF é o único caso em que o backend não tem como recalcular sozinho —
            # confia no perímetro/área que o frontend extraiu do arquivo real.
            perimetro_externo_mm = peca.perimetroCorteMm
            area_peca_unidade = peca.areaUtilMm2
            bbox_largura, bbox_altura = peca.dimA, peca.dimB
        else:
            # R/Q/C/T: o backend é a fonte de verdade da geometria (geometria.py).
            geometria = calcular_geometria(peca.tipoPeca, peca.dimA, peca.dimB, peca.tipoTriangulo)
            perimetro_externo_mm = geometria["perimetro"]
            area_peca_unidade = geometria["area"]
            bbox_largura, bbox_altura = geometria["bbox_largura"], geometria["bbox_altura"]

        pecas_por_espessura[espessura_str].append({
            "id": peca.id,
            "qtd": peca.qtd,
            "dimA": bbox_largura,
            "dimB": bbox_altura,
            "tipoPeca": peca.tipoPeca,
            "tipoTriangulo": peca.tipoTriangulo,
        })

        tempo_real_unidade = motor_precos.tempo_producao_unidade_min(
            perimetro_externo_mm, peca.velocidadeCorte, peca.nFuros, peca.diaFuro, peca.tempoPiercing
        )

        tempo_total_peca = tempo_real_unidade * peca.qtd
        area_total_peca = area_peca_unidade * peca.qtd

        # Custo de material não é mais somado peça a peça: é cobrado pela chapa inteira
        # consumida por espessura (peça + sucata), calculado depois do nesting real, abaixo.
        custo_maquina_peca = motor_precos.custo_maquina(tempo_total_peca, peca.valorHora)

        detalhamento_pecas[peca.id] = {
            "tempo_min": round(tempo_total_peca, 2),
            "custo_maquina": round(custo_maquina_peca, 2),
        }

        resumo_espessuras[espessura_str]["qtd_pecas"] += peca.qtd
        resumo_espessuras[espessura_str]["peso_kg"] += peca.pesoTotal
        resumo_espessuras[espessura_str]["tempo_min"] += tempo_total_peca
        resumo_espessuras[espessura_str]["area_total_mm2"] += area_total_peca
        resumo_espessuras[espessura_str]["perimetro_total_mm"] += perimetro_externo_mm * peca.qtd
        resumo_espessuras[espessura_str]["custo_maquina"] += custo_maquina_peca

        total_pecas_global += peca.qtd
        peso_total_global += peca.pesoTotal
        tempo_total_global_min += tempo_total_peca
        custo_maquina_global += custo_maquina_peca

    detalhamento_lista = []
    chapas_total_global = 0
    sucata_peso_total_global = 0.0
    sucata_area_total_global = 0.0
    chapa_area_total_global = 0.0
    area_pecas_total_global = 0.0

    # Adicionando o Custo de Setup 1x por espessura/material
    for esp_str, dados_esp in resumo_espessuras.items():
        config_chapa = dados.configChapas.get(esp_str)
        largura_chapa = config_chapa.largura if config_chapa and config_chapa.largura > 0 else 1200.0
        comprimento_chapa = config_chapa.comprimento if config_chapa and config_chapa.comprimento > 0 else 3000.0
        margem_chapa = config_chapa.margem if config_chapa else 10.0
        offset_peca = config_chapa.offsetPeca if config_chapa else 5.0

        maquina_para_nesting = (config_chapa.maquina if config_chapa and config_chapa.maquina else dados_esp["maquina_ref"])

        try:
            resultado_nesting = nestear_pecas(
                pecas_por_espessura[esp_str], largura_chapa, comprimento_chapa, margem_chapa, offset_peca,
                maquina=maquina_para_nesting
            )
        except NestingError as erro:
            raise HTTPException(status_code=400, detail=f"Espessura {esp_str}mm: {erro}")

        chapas_necessarias = max(1, resultado_nesting["chapas_necessarias"])

        # Custo de material: chapa(s) inteira(s) consumida(s) (peça + sucata), não só o
        # peso líquido das peças — usa a contagem real de chapas do nesting.
        custo_material_espessura = motor_precos.custo_material_chapa(
            chapas_necessarias, largura_chapa, comprimento_chapa,
            dados_esp["espessura"], dados_esp["densidade_ref"], dados_esp["preco_kg_ref"]
        )
        # Facção (dados.incluiMaterial == False): não cobra a chapa — só o
        # serviço de corte. chapas_necessarias/dimensao_chapa/peso etc continuam
        # calculados normalmente logo abaixo, como referência pro orçamentista
        # (quantas chapas o cliente precisa trazer), só o CUSTO é zerado.
        dados_esp["custo_material"] = custo_material_espessura if dados.incluiMaterial else 0.0
        if dados.incluiMaterial:
            custo_material_global += custo_material_espessura

        # Injeta o Setup (apenas 1x) no total da espessura
        setup_min = dados_esp["tempo_setup"]
        custo_setup = motor_precos.custo_setup(setup_min, dados_esp["valor_hora_ref"])

        dados_esp["tempo_min"] += setup_min
        dados_esp["custo_maquina"] += custo_setup

        # Sobe os valores para o total global
        tempo_total_global_min += setup_min
        custo_maquina_global += custo_setup

        dados_esp["chapas_necessarias"] = chapas_necessarias
        dados_esp["dimensao_chapa"] = f"{int(largura_chapa)}x{int(comprimento_chapa)}"
        dados_esp["chapa_largura"] = largura_chapa
        dados_esp["chapa_comprimento"] = comprimento_chapa
        dados_esp["chapa_margem"] = margem_chapa
        dados_esp["custo_total_espessura"] = dados_esp["custo_material"] + dados_esp["custo_maquina"]
        dados_esp["nesting"] = resultado_nesting
        dados_esp["maquina"] = maquina_para_nesting
        dados_esp["sobra_reservada_cliente"] = bool(config_chapa.clienteQuerSobra) if config_chapa else False

        # Controle de Sobras: área/peso de chapa consumida que não virou peça —
        # já está pago (custo_material fatura a chapa inteira), isso é só a métrica
        # de aproveitamento/sucata pra exibir. Kerf estimado por comprimento total
        # de corte (perímetro real de cada peça) x largura de kerf.
        chapa_area_total_mm2 = chapas_necessarias * largura_chapa * comprimento_chapa
        kerf_perda_area_mm2 = dados_esp["perimetro_total_mm"] * motor_precos.config.largura_kerf_mm
        sucata_area_mm2 = max(0.0, chapa_area_total_mm2 - dados_esp["area_total_mm2"] - kerf_perda_area_mm2)
        sucata_peso_kg = motor_precos.peso_por_area_kg(sucata_area_mm2, dados_esp["espessura"], dados_esp["densidade_ref"])
        utilizacao_pct = (dados_esp["area_total_mm2"] / chapa_area_total_mm2 * 100) if chapa_area_total_mm2 > 0 else 0.0

        dados_esp["chapa_area_total_mm2"] = chapa_area_total_mm2
        dados_esp["kerf_perda_area_mm2"] = round(kerf_perda_area_mm2, 2)
        dados_esp["sucata_area_mm2"] = round(sucata_area_mm2, 2)
        dados_esp["sucata_peso_kg"] = round(sucata_peso_kg, 2)
        dados_esp["utilizacao_pct"] = round(utilizacao_pct, 2)

        chapas_total_global += chapas_necessarias
        sucata_peso_total_global += sucata_peso_kg
        sucata_area_total_global += sucata_area_mm2
        chapa_area_total_global += chapa_area_total_mm2
        area_pecas_total_global += dados_esp["area_total_mm2"]
        detalhamento_lista.append(dados_esp)

    custo_producao_global = custo_material_global + custo_maquina_global
    totais_financeiros = motor_precos.montar_totais_financeiros(
        custo_producao_global, dados.imposto, dados.comissao, dados.margemLucro, dados.frete
    )
    soma_percentuais = totais_financeiros["soma_percentuais"]
    preco_venda_bruto = totais_financeiros["preco_venda_bruto"]
    valor_taxas_incidentes = totais_financeiros["taxas_valor"]
    preco_final = totais_financeiros["preco_final"]

    resultado = {
        "status": "sucesso",
        "totais_globais": {
            "total_pecas": total_pecas_global,
            "peso_total_kg": round(peso_total_global, 2),
            "tempo_total_min": round(tempo_total_global_min, 2),
            "custo_material": round(custo_material_global, 2),
            "custo_maquina": round(custo_maquina_global, 2),
            "custo_producao": round(custo_producao_global, 2),
            "taxas_incidentes_perc": round(soma_percentuais * 100, 2),
            "taxas_incidentes_valor": round(valor_taxas_incidentes, 2),
            "preco_venda_bruto": round(preco_venda_bruto, 2),
            "frete": round(dados.frete, 2),
            "preco_final": round(preco_final, 2),
            "chapas_totais": chapas_total_global,
            "sucata_peso_total_kg": round(sucata_peso_total_global, 2),
            "sucata_area_total_mm2": round(sucata_area_total_global, 2),
            "utilizacao_media_pct": round(
                (area_pecas_total_global / chapa_area_total_global * 100) if chapa_area_total_global > 0 else 0.0, 2
            ),
        },
        "detalhamento_espessuras": detalhamento_lista,
        "detalhamento_pecas": detalhamento_pecas,
        "inclui_material": dados.incluiMaterial,
    }

    registrar_uso_diario(db, usuario)
    orcamento = OrcamentoDB(
        conta_id=usuario.conta_id, usuario_id=usuario.id, cliente_nome=dados.cliente,
        valor_venda_total=preco_final, status="ORCADO",
        payload={"pedido": dados.dict(), "resultado": resultado},
    )
    db.add(orcamento)
    db.commit()
    resultado["orcamento_id"] = orcamento.id
    return resultado


@app.post("/processar-dxf")
async def processar_dxf(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".dxf") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        try:
            doc = ezdxf.readfile(tmp_path)
            msp = doc.modelspace()

            extents = bbox.extents(msp)
            if not extents.has_data:
                return {"sucesso": False, "erro": "O arquivo DXF está vazio ou sem geometria válida."}

            dim_a = round(extents.extmax.x - extents.extmin.x, 2)
            dim_b = round(extents.extmax.y - extents.extmin.y, 2)

            svg_elements = []
            n_furos = 0
            dia_furo_ref = 0.0

            # Referencial local do contorno normalizado: origem no canto
            # superior-esquerdo da bounding box, eixo Y crescendo pra baixo —
            # a MESMA convenção já usada por furosAbsolutos/verticesTriangulo
            # no frontend (nestingUtils.js), pra poder reaproveitar o mesmo
            # transform de posicionamento (translada + rotaciona 90°) na hora
            # de desenhar a peça já posicionada numa chapa de nesting.
            min_x_dxf = extents.extmin.x
            max_y_dxf = extents.extmax.y
            perfis_contorno = []
            furos_contorno = []

            for entity in msp:
                if entity.dxftype() == 'LWPOLYLINE' or entity.dxftype() == 'POLYLINE':
                    pontos = entity.get_points('xy')
                    if pontos:
                        path = f"M {pontos[0][0]} {-pontos[0][1]} "
                        for p in pontos[1:]:
                            path += f"L {p[0]} {-p[1]} "
                        if entity.closed:
                            path += "Z"
                        svg_elements.append(
                            f'<path d="{path}" fill="none" stroke="#00C4CC" stroke-width="2" stroke-linejoin="round" />')

                        perfis_contorno.append({
                            "pontos": [[round(p[0] - min_x_dxf, 3), round(max_y_dxf - p[1], 3)] for p in pontos],
                            "fechado": bool(entity.closed),
                        })

                elif entity.dxftype() == 'LINE':
                    start = entity.dxf.start
                    end = entity.dxf.end
                    svg_elements.append(
                        f'<line x1="{start.x}" y1="{-start.y}" x2="{end.x}" y2="{-end.y}" stroke="#00C4CC" stroke-width="2" />')

                    perfis_contorno.append({
                        "pontos": [
                            [round(start.x - min_x_dxf, 3), round(max_y_dxf - start.y, 3)],
                            [round(end.x - min_x_dxf, 3), round(max_y_dxf - end.y, 3)],
                        ],
                        "fechado": False,
                    })

                elif entity.dxftype() == 'CIRCLE':
                    cx = entity.dxf.center.x
                    cy = -entity.dxf.center.y
                    r = entity.dxf.radius

                    n_furos += 1
                    if dia_furo_ref == 0.0:
                        dia_furo_ref = round(r * 2, 2)

                    svg_elements.append(
                        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#00C4CC" stroke-width="2" />')

                    furos_contorno.append({
                        "cx": round(entity.dxf.center.x - min_x_dxf, 3),
                        "cy": round(max_y_dxf - entity.dxf.center.y, 3),
                        "r": round(r, 3),
                    })

            min_x = extents.extmin.x
            min_y = -extents.extmax.y

            elements_str = "\n".join(svg_elements)
            svg_markup = f'<svg viewBox="{min_x - 5} {min_y - 5} {dim_a + 10} {dim_b + 10}" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">{elements_str}</svg>'

            # Contorno normalizado, aditivo — usado só pra desenhar a peça (real,
            # não a bounding box) já posicionada numa chapa de nesting. ARC/SPLINE
            # não são tesselados aqui (mesma limitação que o svg_markup acima já
            # tinha); uma peça que só tenha esses tipos de entidade fica sem
            # perfil e cai de volta no retângulo da bounding box, sem quebrar nada.
            contorno = (
                {"perfis": perfis_contorno, "furos": furos_contorno}
                if (perfis_contorno or furos_contorno) else None
            )

            return {
                "sucesso": True,
                "dimA": dim_a,
                "dimB": dim_b,
                "nFuros": n_furos,
                "diaFuro": dia_furo_ref,
                "svgMarkup": svg_markup,
                "contorno": contorno
            }

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except Exception as e:
        return {"sucesso": False, "erro": f"Falha ao ler o DXF: {str(e)}"}


def remover_arquivo_temp(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        pass


@app.post("/gerar-dxf")
def gerar_dxf(peca: Peca, background_tasks: BackgroundTasks):
    try:
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()

        w = peca.dimA
        h = peca.dimB
        ox = peca.furoOffsetX
        oy = peca.furoOffsetY
        r = peca.diaFuro / 2

        msp.add_lwpolyline([(0, 0), (w, 0), (w, h), (0, h)], close=True)

        furos_coordenadas = []

        if peca.tipoFuro.startswith('auto') and r > 0 and ox > 0 and oy > 0:
            furos_coordenadas.extend([
                (ox, oy),
                (w - ox, oy),
                (w - ox, h - oy),
                (ox, h - oy)
            ])
            if peca.tipoFuro in ['auto_6', 'auto_8']:
                furos_coordenadas.extend([(w / 2, oy), (w / 2, h - oy)])
            if peca.tipoFuro == 'auto_8':
                furos_coordenadas.extend([(ox, h / 2), (w - ox, h / 2)])

        elif peca.tipoFuro == 'manual' and peca.nFuros > 0 and r > 0:
            if peca.nFuros <= 5:
                for i in range(peca.nFuros):
                    cx = (w / (peca.nFuros + 1)) * (i + 1)
                    cy = h / 2
                    furos_coordenadas.append((cx, cy))

        for cx, cy in furos_coordenadas:
            msp.add_circle((cx, cy), radius=r)

        fd, path = tempfile.mkstemp(suffix=".dxf", prefix=f"lypsyos_{peca.id}_")
        os.close(fd)

        doc.saveas(path)
        background_tasks.add_task(remover_arquivo_temp, path)

        return FileResponse(
            path,
            media_type="application/dxf",
            filename=f"{peca.id}.dxf"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar DXF: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
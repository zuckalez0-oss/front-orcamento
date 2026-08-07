import os
import tempfile
import uvicorn
import ezdxf
from ezdxf import bbox
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from nesting import nestear_pecas, NestingError
from pricing import PricingEngine
from geometria import calcular_geometria

motor_precos = PricingEngine()

# ==========================================
# 1. BANCO DE DADOS (3 TABELAS INDEPENDENTES)
# ==========================================
SQLALCHEMY_DATABASE_URL = "sqlite:///./geoquote.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Tabela 1: Mercado (Materiais e Preços)
class MaterialDB(Base):
    __tablename__ = "materiais"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, index=True)      # Ex: Aço Carbono
    espessura = Column(Float)              # Ex: 1.50
    precoKg = Column(Float)                # Ex: 8.50
    densidade = Column(Float, default=7.85)# Ex: 7.85 (Aço)

# Tabela 2: Engenharia (Máquinas e Parâmetros)
class MaquinaParamDB(Base):
    __tablename__ = "maquinas_params"
    id = Column(Integer, primary_key=True, index=True)
    maquina = Column(String, index=True)   # Ex: Laser Fibra 4kW
    material = Column(String)              # Link com Material (Ex: Aço Carbono)
    espessura = Column(Float)              # Link com Espessura (Ex: 1.50)
    velocidadeCorte = Column(Float)
    tempoPiercing = Column(Float)
    tempoSetup = Column(Float)
    valorHora = Column(Float)

# Tabela 3: Vendas (Perfis Tributários)
class PerfilTributarioDB(Base):
    __tablename__ = "perfis_tributarios"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, unique=True)     # Ex: Simples Nacional, Revenda
    imposto_perc = Column(Float)           # Ex: 6.0 (%)

# Tabela 4: Lista simples de clientes já usados em orçamentos (autocomplete do
# dropdown "Cliente" no formulário — não é um cadastro completo, só nome).
class ClienteDB(Base):
    __tablename__ = "clientes"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, unique=True, index=True)

Base.metadata.create_all(bind=engine)


def seed_dados_iniciais():
    db = SessionLocal()
    try:
        if db.query(MaterialDB).first() is None:
            db.add_all([
                MaterialDB(nome="Aço Carbono", espessura=1.50, precoKg=8.50, densidade=7.85),
                MaterialDB(nome="Aço Carbono", espessura=3.00, precoKg=8.50, densidade=7.85),
                MaterialDB(nome="Inox", espessura=1.50, precoKg=25.00, densidade=8.00),
            ])

        if db.query(MaquinaParamDB).first() is None:
            db.add_all([
                MaquinaParamDB(maquina="LASER", material="Aço Carbono", espessura=1.50,
                               velocidadeCorte=21250, tempoPiercing=2.0, tempoSetup=5.0, valorHora=180.00),
                MaquinaParamDB(maquina="LASER", material="Aço Carbono", espessura=3.00,
                               velocidadeCorte=12750, tempoPiercing=2.0, tempoSetup=5.0, valorHora=180.00),
                MaquinaParamDB(maquina="LASER", material="Inox", espessura=1.50,
                               velocidadeCorte=21250, tempoPiercing=2.0, tempoSetup=5.0, valorHora=220.00),
                MaquinaParamDB(maquina="PLASMA", material="Aço Carbono", espessura=3.00,
                               velocidadeCorte=4378, tempoPiercing=2.0, tempoSetup=5.0, valorHora=150.00),
            ])

        if db.query(PerfilTributarioDB).first() is None:
            db.add(PerfilTributarioDB(nome="Padrão", imposto_perc=18.0))

        db.commit()
    finally:
        db.close()


seed_dados_iniciais()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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

# --- Rotas CRUD: MATERIAIS ---
@app.get("/materiais")
def get_materiais(db: Session = Depends(get_db)): return db.query(MaterialDB).all()

@app.post("/materiais")
def add_material(item: MaterialCreate, db: Session = Depends(get_db)):
    db_item = db.query(MaterialDB).filter_by(nome=item.nome, espessura=item.espessura).first()
    if db_item:
        db_item.precoKg = item.precoKg
        db_item.densidade = item.densidade
    else:
        db_item = MaterialDB(**item.dict())
        db.add(db_item)
    db.commit()
    return {"status": "sucesso"}

@app.delete("/materiais/{id}")
def del_material(id: int, db: Session = Depends(get_db)):
    db.query(MaterialDB).filter(MaterialDB.id == id).delete()
    db.commit()
    return {"status": "sucesso"}

# --- Rotas CRUD: MÁQUINAS ---
@app.get("/maquinas-params")
def get_maquinas(db: Session = Depends(get_db)): return db.query(MaquinaParamDB).all()

@app.post("/maquinas-params")
def add_maquina(item: MaquinaParamCreate, db: Session = Depends(get_db)):
    db_item = db.query(MaquinaParamDB).filter_by(maquina=item.maquina, material=item.material, espessura=item.espessura).first()
    if db_item:
        db_item.velocidadeCorte = item.velocidadeCorte
        db_item.tempoPiercing = item.tempoPiercing
        db_item.tempoSetup = item.tempoSetup
        db_item.valorHora = item.valorHora
    else:
        db_item = MaquinaParamDB(**item.dict())
        db.add(db_item)
    db.commit()
    return {"status": "sucesso"}

@app.delete("/maquinas-params/{id}")
def del_maquina(id: int, db: Session = Depends(get_db)):
    db.query(MaquinaParamDB).filter(MaquinaParamDB.id == id).delete()
    db.commit()
    return {"status": "sucesso"}

# --- Rotas CRUD: PERFIS TRIBUTÁRIOS ---
@app.get("/perfis-tributarios")
def get_perfis(db: Session = Depends(get_db)): return db.query(PerfilTributarioDB).all()

@app.post("/perfis-tributarios")
def add_perfil(item: PerfilTributarioCreate, db: Session = Depends(get_db)):
    db_item = db.query(PerfilTributarioDB).filter_by(nome=item.nome).first()
    if db_item: db_item.imposto_perc = item.imposto_perc
    else:
        db_item = PerfilTributarioDB(**item.dict())
        db.add(db_item)
    db.commit()
    return {"status": "sucesso"}

@app.delete("/perfis-tributarios/{id}")
def del_perfil(id: int, db: Session = Depends(get_db)):
    db.query(PerfilTributarioDB).filter(PerfilTributarioDB.id == id).delete()
    db.commit()
    return {"status": "sucesso"}

# --- Rotas CRUD: CLIENTES ---
class ClienteCreate(BaseModel):
    nome: str

@app.get("/clientes")
def get_clientes(db: Session = Depends(get_db)):
    return db.query(ClienteDB).order_by(ClienteDB.nome).all()

@app.post("/clientes")
def add_cliente(item: ClienteCreate, db: Session = Depends(get_db)):
    upsert_cliente(db, item.nome)
    return {"status": "sucesso"}

@app.delete("/clientes/{id}")
def del_cliente(id: int, db: Session = Depends(get_db)):
    db.query(ClienteDB).filter(ClienteDB.id == id).delete()
    db.commit()
    return {"status": "sucesso"}


def upsert_cliente(db: Session, nome: str):
    """Registra um nome de cliente pra aparecer no dropdown de próximos orçamentos.
    Silencioso por design: nome vazio não gera erro, só não registra nada."""
    nome = (nome or "").strip()
    if not nome:
        return
    if not db.query(ClienteDB).filter_by(nome=nome).first():
        db.add(ClienteDB(nome=nome))
        db.commit()


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
def calcular_orcamento(dados: OrcamentoPayload, db: Session = Depends(get_db)):
    upsert_cliente(db, dados.cliente)

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

    return {
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
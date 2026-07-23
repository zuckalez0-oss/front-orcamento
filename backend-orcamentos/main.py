import os
import tempfile
import uvicorn
import ezdxf
from ezdxf import bbox
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import math
from fastapi.middleware.cors import CORSMiddleware

# --- IMPORTAÇÕES PARA O BANCO DE DADOS (SQLAlchemy) ---
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ==========================================
# 1. CONFIGURAÇÃO DO BANCO DE DADOS SQLITE
# ==========================================
SQLALCHEMY_DATABASE_URL = "sqlite:///./geoquote.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ==========================================
# 1. CONFIGURAÇÃO DO BANCO DE DADOS SQLITE
# ==========================================
class DBParametrosMaterial(Base):
        __tablename__ = "parametros_material"
        id = Column(Integer, primary_key=True, index=True)
        id_str = Column(String, unique=True, index=True)
        maquina = Column(String, index=True)
        material = Column(String, index=True)
        espessura = Column(Float, index=True)
        precoKg = Column(Float)
        velocidadeCorte = Column(Float)
        valorHora = Column(Float)
Base.metadata.create_all(bind=engine)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
# ==========================================
# 2. INICIALIZAÇÃO DO FASTAPI
# ==========================================
app = FastAPI(title="API Lypsyos - Motor de Orçamentos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5173"], # Adicionei a 5174 por precaução com o Vite
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
PARAMETROS_LASER = {
    "0.90": {"velTeorica": 26000, "velPratica": 22100},
    "0.95": {"velTeorica": 26000, "velPratica": 22100},
    "1.20": {"velTeorica": 25000, "velPratica": 21250},
    "1.25": {"velTeorica": 25000, "velPratica": 21250},
    "1.50": {"velTeorica": 25000, "velPratica": 21250},
    "1.55": {"velTeorica": 25000, "velPratica": 21250},
    "1.80": {"velTeorica": 25000, "velPratica": 21250},
    "1.95": {"velTeorica": 25000, "velPratica": 21250},
    "2.00": {"velTeorica": 25000, "velPratica": 21250},
    "2.25": {"velTeorica": 20000, "velPratica": 17000},
    "2.65": {"velTeorica": 20000, "velPratica": 17000, "amperagem": 45},
    "3.00": {"velTeorica": 15000, "velPratica": 12750, "amperagem": 65},
    "3.35": {"velTeorica": 15000, "velPratica": 12750},
    "3.75": {"velTeorica": 11000, "velPratica": 9350},
    "4.25": {"velTeorica": 11000, "velPratica": 9350},
    "4.75": {"velTeorica": 8500,  "velPratica": 7225},
    "6.35": {"velTeorica": 2400,  "velPratica": 2040, "amperagem": 105},
    "7.94": {"velTeorica": 2200,  "velPratica": 1870},
    "9.53": {"velTeorica": 1900,  "velPratica": 1615},
    "12.70": {"velTeorica": 1500, "velPratica": 1275, "amperagem": 125},
    "15.88": {"velTeorica": 1200, "velPratica": 1020}
}

PARAMETROS_PLASMA = {
    "0.65": {"velTeorica": 5200, "velPratica": 4420},
    "0.90": {"velTeorica": 5200, "velPratica": 4420},
    "0.95": {"velTeorica": 5200, "velPratica": 4420},
    "1.20": {"velTeorica": 5200, "velPratica": 4420},
    "1.25": {"velTeorica": 5200, "velPratica": 4420},
    "1.50": {"velTeorica": 5200, "velPratica": 4420},
    "1.90": {"velTeorica": 5200, "velPratica": 4420},
    "2.00": {"velTeorica": 5200, "velPratica": 4420},
    "2.15": {"velTeorica": 5200, "velPratica": 4420},
    "2.25": {"velTeorica": 5200, "velPratica": 4420},
    "2.65": {"velTeorica": 5200, "velPratica": 4420, "amperagem": 45},
    "3.00": {"velTeorica": 5150, "velPratica": 4378, "amperagem": 65},
    "3.15": {"velTeorica": 3600, "velPratica": 3060},
    "3.35": {"velTeorica": 3600, "velPratica": 3485},
    "3.75": {"velTeorica": 3600, "velPratica": 3060},
    "3.85": {"velTeorica": 3600, "velPratica": 3485},
    "4.25": {"velTeorica": 3600, "velPratica": 3485},
    "4.75": {"velTeorica": 3600, "velPratica": 3485},
    "6.35": {"velTeorica": 4100, "velPratica": 3060, "amperagem": 105},
    "7.94": {"velTeorica": 3200, "velPratica": 2720},
    "9.53": {"velTeorica": 2200, "velPratica": 1870, "velocidade_furo": 700},
    "12.70": {"velTeorica": 2050, "velPratica": 1743, "amperagem": 125},
    "15.88": {"velTeorica": 1250, "velPratica": 1063},
    "19.04": {"velTeorica": 900, "velPratica": 765},
    "22.22": {"velTeorica": 750, "velPratica": 638, "velocidade_furo": 450},
    "25.40": {"velTeorica": 600, "velPratica": 510, "velocidade_furo": 400},
    "28.70": {"velTeorica": 600, "velPratica": 510},
    "31.75": {"velTeorica": 500, "velPratica": 425},
}

PARAMETROS_OXICORTE = {
    "25.40": {"velTeorica": 300, "velPratica": 255},
    "28.70": {"velTeorica": 300, "velPratica": 255},
    "31.75": {"velTeorica": 200, "velPratica": 170},
    "50.80": {"velTeorica": 190, "velPratica": 162},
}

PARAMETROS_GUILHOTINA = {
    "0.90": {"velTeorica": 36000, "velPratica": 30600},
    "1.50": {"velTeorica": 36000, "velPratica": 30600},
    "1.90": {"velTeorica": 36000, "velPratica": 30600},
    "2.00": {"velTeorica": 36000, "velPratica": 30600},
    "2.25": {"velTeorica": 36000, "velPratica": 30600},
    "2.65": {"velTeorica": 36000, "velPratica": 30600},
    "3.00": {"velTeorica": 36000, "velPratica": 30600},
    "3.35": {"velTeorica": 36000, "velPratica": 30600},
    "3.75": {"velTeorica": 36000, "velPratica": 30600},
    "4.25": {"velTeorica": 36000, "velPratica": 30600},
    "4.75": {"velTeorica": 36000, "velPratica": 30600},
    "6.35": {"velTeorica": 36000, "velPratica": 30600},
    "7.94": {"velTeorica": 36000, "velPratica": 30600},
},

class ConfigChapa(BaseModel):
    largura: float
    comprimento: float


# ==========================================
# 3. MODELOS PYDANTIC (CORRIGIDOS)
# ==========================================
class ConfigChapa(BaseModel):
    largura: float
    comprimento: float

class Peca(BaseModel):
    id: str
    qtd: int
    tipoPeca: str
    espessura: float
    dimA: float
    dimB: float
    dimC: Optional[float] = 0.0
    
    # NOVOS CAMPOS DE FURAÇÃO (Substituindo o furoPadraoCantos)
    tipoFuro: str
    nFuros: int
    diaFuro: float
    furoOffsetX: float
    furoOffsetY: float
    
    pesoUnitario: float
    pesoTotal: float
    valorHora: float
    precoKgBase: float
    maquina: Optional[str] = None
    material: Optional[str] = None
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

# Modelos Pydantic para o CRUD do Banco
class ParametroCreate(BaseModel):
    id_str: str
    maquina: str
    material: str
    espessura: float
    precoKg: float
    velocidadeCorte: float
    valorHora: float



# ==========================================
# 4. ROTAS DO BANCO DE DADOS (PARÂMETROS)
# ==========================================
@app.get("/parametros")
def listar_parametros(db: Session = Depends(get_db)):
    return db.query(DBParametroMaterial).all()

@app.post("/parametros")
def criar_parametro(param: ParametroCreate, db: Session = Depends(get_db)):
    db_param = db.query(DBParametroMaterial).filter(DBParametroMaterial.id_str == param.id_str).first()
    if db_param:
        # Se já existe, atualiza
        db_param.precoKg = param.precoKg
        db_param.velocidadeCorte = param.velocidadeCorte
        db_param.valorHora = param.valorHora
    else:
        # Se não existe, cria novo
        db_param = DBParametroMaterial(**param.dict())
        db.add(db_param)
    
    db.commit()
    db.refresh(db_param)
    return db_param

@app.delete("/parametros/{id_str}")
def deletar_parametro(id_str: str, db: Session = Depends(get_db)):
    db_param = db.query(DBParametroMaterial).filter(DBParametroMaterial.id_str == id_str).first()
    if not db_param:
        raise HTTPException(status_code=404, detail="Parâmetro não encontrado")
    db.delete(db_param)
    db.commit()
    return {"status": "sucesso", "mensagem": "Parâmetro deletado"}

# ==========================================
# 5. ROTAS DE PROCESSAMENTO E ORÇAMENTO
# ==========================================

@app.post("/calcular-orcamento")
def calcular_orcamento(dados: OrcamentoPayload):
    total_pecas_global = 0
    peso_total_global = 0.0
    tempo_total_global_min = 0.0
    
    custo_material_global = 0.0
    custo_maquina_global = 0.0

    tabela_ativa = PARAMETROS_LASER if dados.processo == "LASER" else PARAMETROS_PLASMA 
    EFICIENCIA_NESTING = dados.fatorNesting if dados.fatorNesting > 0 else 0.70

    resumo_espessuras = {}

    for peca in dados.pecas:
        espessura_str = f"{peca.espessura:.2f}"
        
        if espessura_str not in resumo_espessuras:
            resumo_espessuras[espessura_str] = {
                "espessura": peca.espessura,
                "qtd_pecas": 0,
                "peso_kg": 0.0,
                "tempo_min": 0.0,
                "area_total_mm2": 0.0,
                "custo_material": 0.0,
                "custo_maquina": 0.0
            }

        # Busca a velocidade na peça recebida (que já veio do BD/Frontend) 
        # ou usa fallback na tabela teórica
        veloc_base_mm_min = peca.velocidadeCorte if peca.velocidadeCorte > 0 else tabela_ativa.get(espessura_str, {}).get("velPratica", 5000.0) 
        veloc_furo_mm_min = veloc_base_mm_min * 0.20 # Regra geral: furo é 20% da velocidade de corte reta

        perimetro_externo_mm = peca.perimetroCorteMm if peca.dxfImportado else (peca.dimA + peca.dimB) * 2
        perimetro_furos_mm = peca.nFuros * (math.pi * peca.diaFuro)

        tempo_corte_externo_min = perimetro_externo_mm / veloc_base_mm_min if veloc_base_mm_min > 0 else 0
        tempo_corte_furos_min = (perimetro_furos_mm / veloc_furo_mm_min) if veloc_furo_mm_min > 0 else 0

        tempo_entrada_por_furo_min = 0.03 * peca.nFuros
        movimento_em_vazio_min = 0.02 * (peca.nFuros + 1)
        fator_dinamico = 1.15 

        tempo_real_unidade = (tempo_corte_externo_min + tempo_corte_furos_min + tempo_entrada_por_furo_min + movimento_em_vazio_min) * fator_dinamico
        
        tempo_total_peca = tempo_real_unidade * peca.qtd
        area_total_peca = peca.areaUtilMm2 * peca.qtd if peca.dxfImportado else (peca.dimA * peca.dimB) * peca.qtd
        
        custo_material_peca = peca.pesoTotal * peca.precoKgBase 
        custo_maquina_peca = (tempo_total_peca / 60) * peca.valorHora

        resumo_espessuras[espessura_str]["qtd_pecas"] += peca.qtd
        resumo_espessuras[espessura_str]["peso_kg"] += peca.pesoTotal
        resumo_espessuras[espessura_str]["tempo_min"] += tempo_total_peca
        resumo_espessuras[espessura_str]["area_total_mm2"] += area_total_peca
        resumo_espessuras[espessura_str]["custo_material"] += custo_material_peca
        resumo_espessuras[espessura_str]["custo_maquina"] += custo_maquina_peca

        total_pecas_global += peca.qtd
        peso_total_global += peca.pesoTotal
        tempo_total_global_min += tempo_total_peca
        custo_material_global += custo_material_peca
        custo_maquina_global += custo_maquina_peca

    detalhamento_lista = []
    chapas_total_global = 0

    for esp_str, dados_esp in resumo_espessuras.items():
        area_com_perda = dados_esp["area_total_mm2"] / EFICIENCIA_NESTING
        
        config_chapa = dados.configChapas.get(esp_str)
        if config_chapa:
            area_chapa_dinamica = config_chapa.largura * config_chapa.comprimento
        else:
            area_chapa_dinamica = 1200 * 3000 

        if area_chapa_dinamica <= 0:
            area_chapa_dinamica = 1200 * 3000

        chapas_necessarias = max(1, math.ceil(area_com_perda / area_chapa_dinamica)) 
        
        dimensao_chapa_str = f"{int(config_chapa.largura)}x{int(config_chapa.comprimento)}" if config_chapa else "1200x3000"
        
        dados_esp["chapas_necessarias"] = chapas_necessarias
        dados_esp["dimensao_chapa"] = dimensao_chapa_str
        dados_esp["custo_total_espessura"] = dados_esp["custo_material"] + dados_esp["custo_maquina"]
        
        chapas_total_global += chapas_necessarias
        detalhamento_lista.append(dados_esp)

    custo_producao_global = custo_material_global + custo_maquina_global
    soma_percentuais = (dados.imposto + dados.comissao + dados.margemLucro) / 100
    if soma_percentuais >= 1.0:
        soma_percentuais = 0.99 

    if custo_producao_global > 0:
        preco_venda_bruto = custo_producao_global / (1 - soma_percentuais)
    else:
        preco_venda_bruto = 0.0

    valor_taxas_incidentes = preco_venda_bruto * soma_percentuais
    preco_final = preco_venda_bruto + dados.frete

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
            "chapas_totais": chapas_total_global
        },
        "detalhamento_espessuras": detalhamento_lista
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

            for entity in msp:
                if entity.dxftype() == 'LWPOLYLINE' or entity.dxftype() == 'POLYLINE':
                    pontos = entity.get_points('xy')
                    if pontos:
                        path = f"M {pontos[0][0]} {-pontos[0][1]} "
                        for p in pontos[1:]:
                            path += f"L {p[0]} {-p[1]} "
                        if entity.closed:
                            path += "Z"
                        svg_elements.append(f'<path d="{path}" fill="none" stroke="#00C4CC" stroke-width="2" stroke-linejoin="round" />')
                
                elif entity.dxftype() == 'LINE':
                    start = entity.dxf.start
                    end = entity.dxf.end
                    svg_elements.append(f'<line x1="{start.x}" y1="{-start.y}" x2="{end.x}" y2="{-end.y}" stroke="#00C4CC" stroke-width="2" />')
                
                elif entity.dxftype() == 'CIRCLE':
                    cx = entity.dxf.center.x
                    cy = -entity.dxf.center.y
                    r = entity.dxf.radius
                    
                    n_furos += 1
                    if dia_furo_ref == 0.0:
                        dia_furo_ref = round(r * 2, 2) 
                        
                    svg_elements.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#00C4CC" stroke-width="2" />')
            
            min_x = extents.extmin.x
            min_y = -extents.extmax.y 
            
            elements_str = "\n".join(svg_elements)
            svg_markup = f'<svg viewBox="{min_x - 5} {min_y - 5} {dim_a + 10} {dim_b + 10}" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">{elements_str}</svg>'
            
            return {
                "sucesso": True,
                "dimA": dim_a,
                "dimB": dim_b,
                "nFuros": n_furos,
                "diaFuro": dia_furo_ref,
                "svgMarkup": svg_markup
            }

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
                
    except Exception as e:
        return {"sucesso": False, "erro": f"Falha ao ler o DXF: {str(e)}"}

# ==========================================
# 6. ROTA DE GERAÇÃO DE DXF
# ==========================================
def remover_arquivo_temp(path: str):
    """Função utilitária para limpar arquivos de DXF gerados após o envio"""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Erro ao deletar arquivo temporário {path}: {e}")

@app.post("/gerar-dxf")
def gerar_dxf(peca: Peca, background_tasks: BackgroundTasks):
    """Gera um arquivo DXF baseado nos parâmetros manuais da peça"""
    try:
        # Cria um novo documento DXF compatível com versões padrão industriais
        doc = ezdxf.new("R2010")
        msp = doc.modelspace()
        
        w = peca.dimA
        h = peca.dimB
        ox = peca.furoOffsetX
        oy = peca.furoOffsetY
        r = peca.diaFuro / 2

        # 1. Desenha a borda externa da peça (Polilinha fechada)
        msp.add_lwpolyline([(0, 0), (w, 0), (w, h), (0, h)], close=True)

        # 2. Lógica para desenhar os furos baseada no Tipo
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
            # Distribui furos alinhados no meio se forem até 5 (Mesma lógica do front)
            if peca.nFuros <= 5:
                for i in range(peca.nFuros):
                    cx = (w / (peca.nFuros + 1)) * (i + 1)
                    cy = h / 2
                    furos_coordenadas.append((cx, cy))

        # Adiciona os círculos no ModelSpace
        for cx, cy in furos_coordenadas:
            msp.add_circle((cx, cy), radius=r)

        # 3. Salva em um arquivo temporário e envia como resposta
        fd, path = tempfile.mkstemp(suffix=".dxf", prefix=f"lypsyos_{peca.id}_")
        os.close(fd)
        
        doc.saveas(path)
        
        # Agenda a remoção do arquivo após a resposta ser enviada para não encher o disco
        background_tasks.add_task(remover_arquivo_temp, path)
        
        return FileResponse(
            path, 
            media_type="application/dxf", 
            filename=f"{peca.id}.dxf"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar DXF: {str(e)}")

# ==========================================
# INICIALIZADOR
# ==========================================
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
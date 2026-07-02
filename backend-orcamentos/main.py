import os
import tempfile
import uvicorn
import ezdxf
from ezdxf import bbox
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="API Lypsyos - Motor de Orçamentos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"], # Adicionei a 5174 por precaução com o Vite
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. MODELO DA PEÇA (Reflete o objeto de peça do React)
class Peca(BaseModel):
    id: str
    qtd: int
    tipoPeca: str
    espessura: float
    dimA: float
    dimB: float
    dimC: Optional[float] = 0.0 # Optional pois pode vir vazio dependendo do tipo
    nFuros: int
    diaFuro: float
    furoPadraoCantos: bool
    furoOffsetX: float
    furoOffsetY: float
    pesoUnitario: float
    pesoTotal: float

# 2. MODELO DO ORÇAMENTO (Reflete o "pacoteDeDados" inteiro enviado no handleSalvar)
class OrcamentoPayload(BaseModel):
    cliente: str
    imposto: float
    comissao: float
    precoKg: float
    frete: float
    pecas: List[Peca] # Aqui dizemos que "pecas" é uma lista contendo o modelo Peca acima

@app.get("/")
def ler_raiz():
    return {"status": "Motor Backend da Lypsyos rodando perfeitamente!"}

@app.post("/calcular-orcamento")
def calcular_orcamento(dados: OrcamentoPayload):
    # O FastAPI já validou tudo pra você. Se chegou aqui, os dados estão corretos.
    
    total_pecas = sum(peca.qtd for peca in dados.pecas)
    peso_total_orcamento = sum(peca.pesoTotal for peca in dados.pecas)
    
    # Aqui entrará a lógica bruta: calcular perímetro, tempo de piercing, custo de máquina, etc.
    
    mensagem = f"Orçamento recebido! Cliente: {dados.cliente}. Total de {total_pecas} peças analisadas. Peso Total: {peso_total_orcamento:.2f} Kg."
    
    return {
        "status": "sucesso",
        "mensagem": mensagem,
        "dados_validados": dados # Devolvemos os dados para confirmar o recebimento
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
            
            # --- NOVAS VARIÁVEIS PARA FUROS ---
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
                    
                    # --- LÓGICA DE EXTRAÇÃO DE FUROS ---
                    n_furos += 1
                    if dia_furo_ref == 0.0:
                        dia_furo_ref = round(r * 2, 2) # Pega o diâmetro do primeiro furo que encontrar
                        
                    svg_elements.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#00C4CC" stroke-width="2" />')
            
            min_x = extents.extmin.x
            min_y = -extents.extmax.y 
            
            elements_str = "\n".join(svg_elements)
            svg_markup = f'<svg viewBox="{min_x - 5} {min_y - 5} {dim_a + 10} {dim_b + 10}" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">{elements_str}</svg>'
            
            return {
                "sucesso": True,
                "dimA": dim_a,
                "dimB": dim_b,
                "nFuros": n_furos,          # Enviando a quantidade para o React
                "diaFuro": dia_furo_ref,    # Enviando o diâmetro para o React
                "svgMarkup": svg_markup
            }

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
                
    except Exception as e:
        return {"sucesso": False, "erro": f"Falha ao ler o DXF: {str(e)}"}
# 3. BLOCO DE INICIALIZAÇÃO
# Isso permite que você rode a API apenas executando o arquivo python no terminal (ex: python main.py)
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
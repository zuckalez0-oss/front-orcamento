from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware # Importação do middleware CORS para permitir requisições do frontend

app = FastAPI(title = "API de Orçamentos de Corte a Laser")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Pertimindo o front rodar na porta 5173
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DadosMedidas(BaseModel):
    largura_mm: float
    altura_mm: float


class OrcamentoPayLoad(BaseModel):
    cliente_nome: str
    tipo_material: str
    espessura_mm: float
    tipo_processo: str
    quantidade_pecas: int
    medidas: DadosMedidas

@app.get("/")
def ler_raiz():
    return{"status": "Motor Backend rodando perfeitamente!"}

@app.post("/calcular-orcamento")
def calcular_orcamento(dados: OrcamentoPayLoad):
    # Acesso aos dados enviados pelo frontend
    area_total_mm2 = dados.medidas.largura_mm * dados.medidas.altura_mm * dados.quantidade_pecas

    mensagem = f"Orcamento recebido para o cliente {dados.cliente_nome} com material {dados.tipo_material}, processo {dados.tipo_processo}, espessura {dados.espessura_mm}mm, quantidade {dados.quantidade_pecas} peças, e Àrea total de corte de {area_total_mm2} mm²."
    return {
        "status": "sucesso",
        "mensagem" : mensagem,
        "dados_recebidos": dados
    }
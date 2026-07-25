"""Gera payloads realistas de /calcular-orcamento simulando orçamentos com várias peças."""
import random

ESPESSURAS = [1.50, 2.00, 3.00, 4.75]
MATERIAIS = [
    {"nome": "Aço Carbono", "densidade": 7.85, "precoKg": 8.50},
    {"nome": "Inox", "densidade": 8.00, "precoKg": 25.00},
    {"nome": "Alumínio", "densidade": 2.70, "precoKg": 18.00},
]


def gerar_peca(indice, espessura, material, rng):
    dimA = rng.uniform(50, 600)
    dimB = rng.uniform(50, 600)
    qtd = rng.randint(1, 40)
    n_furos = rng.choice([0, 0, 2, 4, 4, 6, 8])
    dia_furo = rng.uniform(4, 12) if n_furos else 0
    tipo_furo = rng.choice(["manual", "auto_4", "auto_6", "auto_8"]) if n_furos else "manual"

    area = dimA * dimB
    volume = area * espessura
    peso_unit = (volume * material["densidade"]) / 1_000_000
    peso_total = peso_unit * qtd

    return {
        "id": f"PC-{indice:04d}",
        "qtd": qtd,
        "tipoPeca": "R",
        "espessura": espessura,
        "dimA": round(dimA, 2),
        "dimB": round(dimB, 2),
        "dimC": 0,
        "tipoFuro": tipo_furo,
        "nFuros": n_furos,
        "diaFuro": round(dia_furo, 2),
        "furoOffsetX": round(dimA * 0.1, 2) if tipo_furo != "manual" else 0,
        "furoOffsetY": round(dimB * 0.1, 2) if tipo_furo != "manual" else 0,
        "pesoUnitario": round(peso_unit, 3),
        "pesoTotal": round(peso_total, 3),
        "valorHora": 180.0,
        "precoKgBase": material["precoKg"],
        "densidade": material["densidade"],
        "tempoPiercing": 2.0,
        "tempoSetup": 5.0,
        "maquina": "LASER",
        "material": material["nome"],
        "areaUtilMm2": round(area, 2),
        "perimetroCorteMm": round(2 * (dimA + dimB), 2),
        "velocidadeCorte": 21250.0,
        "dxfImportado": False,
    }


def gerar_payload(n_pecas, seed=None):
    """Um orçamento com n_pecas peças espalhadas em 2-4 grupos de espessura,
    imitando um vendedor montando um orçamento real de corte a laser."""
    rng = random.Random(seed)
    n_grupos = min(len(ESPESSURAS), max(1, n_pecas // 8))
    espessuras_usadas = rng.sample(ESPESSURAS, k=n_grupos)

    pecas = []
    config_chapas = {}
    for i in range(n_pecas):
        espessura = espessuras_usadas[i % n_grupos]
        material = rng.choice(MATERIAIS)
        pecas.append(gerar_peca(i, espessura, material, rng))

    for esp in espessuras_usadas:
        config_chapas[f"{esp:.2f}"] = {"largura": 1200, "comprimento": 3000, "margem": 10, "offsetPeca": 5}

    return {
        "cliente": f"Cliente Carga {rng.randint(1, 99999)}",
        "imposto": 18.0,
        "comissao": 2.0,
        "margemLucro": 25.0,
        "precoKg": 0,
        "frete": 31.0,
        "processo": "LASER",
        "fatorNesting": 0.7,
        "pecas": pecas,
        "configChapas": config_chapas,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(gerar_payload(12, seed=1), indent=2, ensure_ascii=False)[:1500])

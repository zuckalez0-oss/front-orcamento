"""
Motor de nesting 2D retangular (bin-packing) usado para estimar quantas chapas
são realmente necessárias para cortar um lote de peças, e para gerar os dados
de posicionamento usados na visualização gráfica no frontend.

Cada peça é tratada pela sua bounding box (dimA x dimB) — não há nesting por
contorno real (polígono), decisão registrada em CLAUDE.md.
"""
from typing import Any, Dict, List

from rectpack import newPacker


class NestingError(Exception):
    """Erro de negócio (não estrutural) do nesting — deve virar HTTP 400, não 500."""


# Acima desse número de peças individuais por espessura, o bin-packing exato
# fica lento demais para uma chamada síncrona de API.
LIMITE_INSTANCIAS = 2000


def nestear_pecas(pecas: List[Dict[str, Any]], largura_chapa: float, comprimento_chapa: float,
                   margem: float, offset_peca: float) -> Dict[str, Any]:
    """
    pecas: lista de {"id": str, "qtd": int, "dimA": float, "dimB": float}
    Retorna {"chapas_necessarias": int, "chapas": [{"placements": [
        {"id", "x", "y", "width", "height", "rotated"}, ...
    ]}, ...]}
    Coordenadas (x, y, width, height) já são absolutas na chapa real (mm),
    incluindo a margem, e já descontam o offset entre peças.
    """
    largura_util = largura_chapa - 2 * margem
    comprimento_util = comprimento_chapa - 2 * margem

    if largura_util <= 0 or comprimento_util <= 0:
        raise NestingError(
            f"Margem da chapa ({margem}mm) grande demais para a chapa {largura_chapa}x{comprimento_chapa}mm."
        )

    packer = newPacker(rotation=True)
    dims_originais = {}  # rid único da instância -> (peca_id, largura_com_offset, altura_com_offset)
    total_instancias = 0

    # rid é indexado por posição da peça na lista, não pelo "id" digitado pelo usuário
    # (esse não é garantidamente único entre peças diferentes).
    for peca_idx, peca in enumerate(pecas):
        largura_peca = peca["dimA"] + offset_peca
        altura_peca = peca["dimB"] + offset_peca

        cabe_sem_girar = largura_peca <= largura_util and altura_peca <= comprimento_util
        cabe_girada = altura_peca <= largura_util and largura_peca <= comprimento_util
        if not cabe_sem_girar and not cabe_girada:
            raise NestingError(
                f"Peça '{peca['id']}' ({peca['dimA']}x{peca['dimB']}mm) não cabe na área útil da chapa "
                f"({largura_util:.0f}x{comprimento_util:.0f}mm) mesmo com rotação."
            )

        qtd = int(peca["qtd"])
        for i in range(qtd):
            rid = f"{peca_idx}#{i}"
            dims_originais[rid] = (peca["id"], largura_peca, altura_peca)
            packer.add_rect(largura_peca, altura_peca, rid=rid)
            total_instancias += 1

    if total_instancias == 0:
        return {"chapas_necessarias": 0, "chapas": []}

    if total_instancias > LIMITE_INSTANCIAS:
        raise NestingError(
            f"Quantidade de peças ({total_instancias}) excede o limite de {LIMITE_INSTANCIAS} "
            "unidades por espessura para nesting em tempo real."
        )

    packer.add_bin(largura_util, comprimento_util, count=float("inf"))
    packer.pack()

    chapas = []
    for abin in packer:
        placements = []
        for rect in abin:
            peca_id, largura_com_offset, altura_com_offset = dims_originais[rect.rid]

            rotated = round(rect.width) != round(largura_com_offset)

            # Recupera a dimensão real da peça (sem o offset) considerando rotação
            if not rotated:
                largura_real = largura_com_offset - offset_peca
                altura_real = altura_com_offset - offset_peca
            else:
                largura_real = altura_com_offset - offset_peca
                altura_real = largura_com_offset - offset_peca

            placements.append({
                "id": peca_id,
                "x": round(margem + rect.x + offset_peca / 2, 2),
                "y": round(margem + rect.y + offset_peca / 2, 2),
                "width": round(largura_real, 2),
                "height": round(altura_real, 2),
                "rotated": rotated,
            })

        chapas.append({"placements": placements})

    return {"chapas_necessarias": len(chapas), "chapas": chapas}

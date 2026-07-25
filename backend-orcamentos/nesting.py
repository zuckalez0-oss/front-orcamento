"""
Motor de nesting 2D retangular (bin-packing) usado para estimar quantas chapas
são realmente necessárias para cortar um lote de peças, e para gerar os dados
de posicionamento usados na visualização gráfica no frontend.

Cada peça é tratada pela sua bounding box (dimA x dimB) — não há nesting por
contorno real (polígono) genérico, decisão registrada em CLAUDE.md. Triângulos
são a única exceção parcial: como existem identidades geométricas EXATAS de
ladrilhamento para os dois tipos suportados (par "reto" ao longo da hipotenusa;
fileira alternada "isósceles"), esse pré-processamento roda antes do bin-packing
e entrega ao `rectpack` blocos compostos já densos, em vez de triângulos avulsos
com 50% de desperdício cada. Ver `_compor_itens_triangulo`.
"""
import math
from typing import Any, Dict, List

from rectpack import newPacker


class NestingError(Exception):
    """Erro de negócio (não estrutural) do nesting — deve virar HTTP 400, não 500."""


# Acima desse número de itens (pares/fileiras de triângulo já contam como 1 item
# cada, não pela contagem bruta de peças físicas), o bin-packing exato fica lento
# demais para uma chamada síncrona de API.
LIMITE_INSTANCIAS = 2000

TIPOS_TRIANGULO_COMPONIVEIS = ("reto", "isosceles")


def _compor_itens_triangulo(tipo_triangulo: str, base: float, altura: float,
                             ids: List[str], largura_util: float, comprimento_util: float) -> List[Dict[str, Any]]:
    """
    ids: um peca_id por unidade física do grupo (todas com o mesmo tipo_triangulo/
    base/altura — só peças geometricamente idênticas se encaixam entre si).

    'reto': pareia 2 a 2 ao longo da hipotenusa — dois triângulos "reto" idênticos,
    um deles rotacionado 180°, ladrilham EXATAMENTE um retângulo base x altura
    (0% de sobreposição, 0% de vão — identidade geométrica, não heurística).
    Sobra 1 triângulo avulso se a quantidade for ímpar (inevitável).

    'isosceles': o pareamento simples acima NÃO ladrilha (dá 25% de sobreposição).
    O que ladrilha sem vão é a fileira alternada apex-up/apex-down deslocada de
    base/2 a cada peça — para N triângulos numa fileira, aproveitamento = N/(N+1)
    (exato). Cada fileira vira 1 item composto de largura (N-1)*base/2 + base.

    Retorna itens no formato {"largura", "altura", "largura_membro", "membros":
    [{"peca_id", "offset_x", "invertido"}, ...]} consumido por `nestear_pecas`.
    """
    itens: List[Dict[str, Any]] = []

    if tipo_triangulo == "reto":
        i = 0
        n = len(ids)
        while i + 1 < n:
            itens.append({
                "largura": base, "altura": altura, "largura_membro": base,
                "membros": [
                    {"peca_id": ids[i], "offset_x": 0.0, "invertido": False},
                    {"peca_id": ids[i + 1], "offset_x": 0.0, "invertido": True},
                ],
            })
            i += 2
        if i < n:
            itens.append({
                "largura": base, "altura": altura, "largura_membro": base,
                "membros": [{"peca_id": ids[i], "offset_x": 0.0, "invertido": False}],
            })
        return itens

    # 'isosceles'
    largura_alvo = max(largura_util, comprimento_util)
    n_max = max(1, math.floor(2 * (largura_alvo - base) / base) + 1) if base > 0 else 1

    n = len(ids)
    pos = 0
    while pos < n:
        n_fileira = min(n_max, n - pos)
        membros = [
            {"peca_id": ids[pos + k], "offset_x": k * (base / 2), "invertido": (k % 2 == 1)}
            for k in range(n_fileira)
        ]
        largura_fileira = (n_fileira - 1) * (base / 2) + base
        itens.append({"largura": largura_fileira, "altura": altura, "largura_membro": base, "membros": membros})
        pos += n_fileira

    return itens


def nestear_pecas(pecas: List[Dict[str, Any]], largura_chapa: float, comprimento_chapa: float,
                   margem: float, offset_peca: float) -> Dict[str, Any]:
    """
    pecas: lista de {"id": str, "qtd": int, "dimA": float, "dimB": float,
        "tipoPeca": str opcional, "tipoTriangulo": str opcional}
    Retorna {"chapas_necessarias": int, "chapas": [{"placements": [
        {"id", "x", "y", "width", "height", "rotated", "invertido"}, ...
    ]}, ...]}
    Coordenadas (x, y, width, height) já são absolutas na chapa real (mm),
    incluindo a margem, e já descontam o offset entre peças.
    `invertido` só é relevante para triângulos: indica que o desenho deve usar o
    conjunto de vértices complementar (par/fileira interligados) — ver geometria.py
    e `nestingUtils.js::verticesTriangulo` no frontend.
    """
    largura_util = largura_chapa - 2 * margem
    comprimento_util = comprimento_chapa - 2 * margem

    if largura_util <= 0 or comprimento_util <= 0:
        raise NestingError(
            f"Margem da chapa ({margem}mm) grande demais para a chapa {largura_chapa}x{comprimento_chapa}mm."
        )

    # 1) separa triângulos combináveis (agrupados por tipo/base/altura) do resto —
    # só peças geometricamente idênticas podem parear/interligar entre si.
    triangulos_por_grupo: Dict[Any, List[str]] = {}
    itens_avulsos: List[Dict[str, Any]] = []

    for peca in pecas:
        tipo_peca = peca.get("tipoPeca")
        tipo_triangulo = peca.get("tipoTriangulo")
        if tipo_peca == "T" and tipo_triangulo in TIPOS_TRIANGULO_COMPONIVEIS:
            chave = (tipo_triangulo, peca["dimA"], peca["dimB"])
            triangulos_por_grupo.setdefault(chave, []).extend([peca["id"]] * int(peca["qtd"]))
        else:
            itens_avulsos.append(peca)

    # 2) monta a lista final de itens que vão para o packer: peças avulsas viram
    # N itens simples (1 membro cada, como sempre foi); triângulos combináveis
    # viram pares/fileiras densos via `_compor_itens_triangulo`.
    itens_packer: List[Dict[str, Any]] = []

    for peca in itens_avulsos:
        for _ in range(int(peca["qtd"])):
            itens_packer.append({
                "largura": peca["dimA"], "altura": peca["dimB"], "largura_membro": peca["dimA"],
                "membros": [{"peca_id": peca["id"], "offset_x": 0.0, "invertido": False}],
            })

    for (tipo_triangulo, base, altura), ids in triangulos_por_grupo.items():
        itens_packer.extend(_compor_itens_triangulo(tipo_triangulo, base, altura, ids, largura_util, comprimento_util))

    if not itens_packer:
        return {"chapas_necessarias": 0, "chapas": []}

    # 3) valida encaixe de cada item (mesma checagem de sempre, agora por item —
    # um par/fileira nunca é maior que o necessário para caber peça a peça).
    for item in itens_packer:
        largura_peca = item["largura"] + offset_peca
        altura_peca = item["altura"] + offset_peca
        cabe_sem_girar = largura_peca <= largura_util and altura_peca <= comprimento_util
        cabe_girada = altura_peca <= largura_util and largura_peca <= comprimento_util
        if not cabe_sem_girar and not cabe_girada:
            ids_membros = ", ".join(sorted({m["peca_id"] for m in item["membros"]}))
            raise NestingError(
                f"Peça(s) '{ids_membros}' ({item['largura']:.0f}x{item['altura']:.0f}mm) não cabe(m) na área "
                f"útil da chapa ({largura_util:.0f}x{comprimento_util:.0f}mm) mesmo com rotação."
            )

    total_instancias = len(itens_packer)
    if total_instancias > LIMITE_INSTANCIAS:
        raise NestingError(
            f"Quantidade de itens de nesting ({total_instancias}) excede o limite de {LIMITE_INSTANCIAS} "
            "unidades por espessura para nesting em tempo real."
        )

    packer = newPacker(rotation=True)
    dims_originais = {}  # rid -> (largura_com_offset, altura_com_offset, largura_membro, membros)

    for rid, item in enumerate(itens_packer):
        largura_com_offset = item["largura"] + offset_peca
        altura_com_offset = item["altura"] + offset_peca
        dims_originais[rid] = (largura_com_offset, altura_com_offset, item["largura_membro"], item["membros"])
        packer.add_rect(largura_com_offset, altura_com_offset, rid=rid)

    packer.add_bin(largura_util, comprimento_util, count=float("inf"))
    packer.pack()

    chapas = []
    for abin in packer:
        placements = []
        for rect in abin:
            largura_com_offset, altura_com_offset, largura_membro, membros = dims_originais[rect.rid]

            rotated = round(rect.width) != round(largura_com_offset)
            altura_grupo = altura_com_offset - offset_peca  # altura "líquida" do item (sem o offset)

            item_x = margem + rect.x + offset_peca / 2
            item_y = margem + rect.y + offset_peca / 2

            if len(membros) == 1 and membros[0]["offset_x"] == 0.0:
                # item simples (peça avulsa OU triângulo sobrando sem par): 1 placement, como sempre foi.
                if not rotated:
                    largura_real = largura_com_offset - offset_peca
                    altura_real = altura_com_offset - offset_peca
                else:
                    largura_real = altura_com_offset - offset_peca
                    altura_real = largura_com_offset - offset_peca
                placements.append({
                    "id": membros[0]["peca_id"],
                    "x": round(item_x, 2), "y": round(item_y, 2),
                    "width": round(largura_real, 2), "height": round(altura_real, 2),
                    "rotated": rotated, "invertido": False,
                })
                continue

            # item composto (par "reto" ou fileira "isósceles"): expande em N
            # placements, um por membro, traduzindo o offset_x local — usa a MESMA
            # transformação de rotação 90° já usada para peças/furos/vértices no
            # resto do sistema (ver furosAbsolutos/verticesTrianguloAbsolutos no
            # frontend): local (x,y) -> (altura_total - y, x) quando rotacionado.
            for membro in membros:
                if not rotated:
                    mx = item_x + membro["offset_x"]
                    my = item_y
                    mw, mh = largura_membro, altura_grupo
                else:
                    mx = item_x
                    my = item_y + membro["offset_x"]
                    mw, mh = altura_grupo, largura_membro

                placements.append({
                    "id": membro["peca_id"],
                    "x": round(mx, 2), "y": round(my, 2),
                    "width": round(mw, 2), "height": round(mh, 2),
                    "rotated": rotated, "invertido": membro["invertido"],
                })

        chapas.append({"placements": placements})

    return {"chapas_necessarias": len(chapas), "chapas": chapas}

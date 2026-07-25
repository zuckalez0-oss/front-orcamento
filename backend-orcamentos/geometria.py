"""
Motor de geometria para as formas padrão de peça (Retangular/Quadrado, Círculo,
Triângulo). Calcula área (peso líquido informativo), perímetro (tempo de corte
real) e bounding box (nesting + peso de chapa consumida) a partir das dimensões
brutas informadas pelo usuário.

Peças importadas de DXF continuam usando a área/perímetro que o frontend extrai
do arquivo (`Peca.areaUtilMm2`/`Peca.perimetroCorteMm`) — este módulo só é usado
para peças manuais (R/Q/C/T), que é o único caso em que o backend tem dados
suficientes para calcular a geometria exata sozinho.
"""
import math

TIPOS_TRIANGULO_VALIDOS = ("reto", "isosceles")


def area_circulo(diametro_mm: float) -> float:
    raio = diametro_mm / 2
    return math.pi * raio ** 2


def perimetro_circulo(diametro_mm: float) -> float:
    return math.pi * diametro_mm


def area_triangulo(base_mm: float, altura_mm: float) -> float:
    """Área independe do tipo — só depende de base e altura."""
    return (base_mm * altura_mm) / 2


def perimetro_triangulo(base_mm: float, altura_mm: float, tipo: str) -> float:
    """
    'reto': ângulo reto no canto onde base e altura se encontram —
        vértices em (0,0), (base,0), (0,altura); o terceiro lado é a hipotenusa.
    'isosceles': ápice centralizado sobre a base —
        vértices em (0,0), (base,0), (base/2,altura); dois lados iguais.
    """
    if tipo == "isosceles":
        lado = math.sqrt((base_mm / 2) ** 2 + altura_mm ** 2)
        return base_mm + 2 * lado
    # padrão: 'reto'
    hipotenusa = math.sqrt(base_mm ** 2 + altura_mm ** 2)
    return base_mm + altura_mm + hipotenusa


def bounding_box_triangulo(base_mm: float, altura_mm: float, tipo: str) -> tuple:
    """Nas duas convenções acima (base horizontal, vértices dentro de
    [0,base]x[0,altura]), o retângulo envolvente é sempre base x altura."""
    return (base_mm, altura_mm)


def calcular_geometria(tipo_peca: str, dimA: float, dimB: float, tipo_triangulo: str = None) -> dict:
    """
    Dispatcher único usado por main.py para peças manuais (não-DXF).
    Retorna {"area", "perimetro", "bbox_largura", "bbox_altura"} em mm²/mm.

    - 'R'/'Q': dimA x dimB são a própria peça (bounding box == a peça).
    - 'C': dimA é o diâmetro; dimB é ignorado (bounding box = diâmetro x diâmetro).
    - 'T': dimA é a base, dimB é a altura; tipo_triangulo é 'reto' (padrão) ou 'isosceles'.
    """
    if tipo_peca == "C":
        diametro = dimA
        return {
            "area": area_circulo(diametro),
            "perimetro": perimetro_circulo(diametro),
            "bbox_largura": diametro,
            "bbox_altura": diametro,
        }

    if tipo_peca == "T":
        tipo = tipo_triangulo if tipo_triangulo in TIPOS_TRIANGULO_VALIDOS else "reto"
        largura, altura = bounding_box_triangulo(dimA, dimB, tipo)
        return {
            "area": area_triangulo(dimA, dimB),
            "perimetro": perimetro_triangulo(dimA, dimB, tipo),
            "bbox_largura": largura,
            "bbox_altura": altura,
        }

    # 'R', 'Q' ou qualquer outro valor: retângulo simples (comportamento histórico)
    return {
        "area": dimA * dimB,
        "perimetro": 2 * (dimA + dimB),
        "bbox_largura": dimA,
        "bbox_altura": dimB,
    }

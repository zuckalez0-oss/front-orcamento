// Funções puras compartilhadas entre a visualização de nesting em tela (App.jsx,
// componente ChapaSVG) e a exportação em PDF (nestingPdf.js) — mantidas num módulo
// à parte para as duas pontas importarem sem criar um import circular entre si.

// Paleta categórica validada (skill dataviz) contra o fundo da chapa de nesting (#0A0A0A):
// contraste >=3:1, separação CVD >=8.4 ΔE, piso de visão normal >=19.3 ΔE em todos os pares adjacentes.
export const PALETA_NESTING = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

// Cor estável por identidade da peça (nunca por posição/rank): mesmo id sempre cai na mesma cor,
// mesmo que a ordem de renderização mude entre chapas.
export function corDaPeca(id, idsUnicos) {
  const indice = idsUnicos.indexOf(id);
  return PALETA_NESTING[(indice < 0 ? 0 : indice) % PALETA_NESTING.length];
}

// Posições locais (relativas a um retângulo w x h com origem no canto superior esquerdo) dos furos
// de uma peça, dado seu tipo de furação. Usado tanto no preview de peça única quanto no nesting.
export function calcularFuros(tipoFuro, nFuros, diaFuro, furoOffsetX, furoOffsetY, w, h) {
  const diam = Number(diaFuro) || 0;
  const ox = Number(furoOffsetX) || 0;
  const oy = Number(furoOffsetY) || 0;
  const furos = [];

  if (tipoFuro && tipoFuro.startsWith('auto') && diam > 0 && ox > 0 && oy > 0) {
    furos.push({ cx: ox, cy: oy });
    furos.push({ cx: w - ox, cy: oy });
    furos.push({ cx: w - ox, cy: h - oy });
    furos.push({ cx: ox, cy: h - oy });

    if (tipoFuro === 'auto_6' || tipoFuro === 'auto_8') {
      furos.push({ cx: w / 2, cy: oy });
      furos.push({ cx: w / 2, cy: h - oy });
    }

    if (tipoFuro === 'auto_8') {
      furos.push({ cx: ox, cy: h / 2 });
      furos.push({ cx: w - ox, cy: h / 2 });
    }
  } else if (tipoFuro === 'manual' && Number(nFuros) > 0 && diam > 0) {
    const n = Number(nFuros);
    if (n <= 5) {
      for (let i = 0; i < n; i++) {
        furos.push({ cx: (w / (n + 1)) * (i + 1), cy: h / 2 });
      }
    }
  }

  return furos;
}

// --- Geometria das formas padrão (espelha backend-orcamentos/geometria.py) ---
// Usado só para o preview instantâneo (peso estimado, desenho) antes de enviar;
// quem decide o valor cobrado de verdade é sempre o backend.

export function areaCirculo(diametroMm) {
  const raio = diametroMm / 2;
  return Math.PI * raio * raio;
}

export function perimetroCirculo(diametroMm) {
  return Math.PI * diametroMm;
}

export function areaTriangulo(baseMm, alturaMm) {
  return (baseMm * alturaMm) / 2;
}

export function perimetroTriangulo(baseMm, alturaMm, tipo) {
  if (tipo === 'isosceles') {
    const lado = Math.sqrt((baseMm / 2) ** 2 + alturaMm ** 2);
    return baseMm + 2 * lado;
  }
  // padrão: 'reto'
  const hipotenusa = Math.sqrt(baseMm ** 2 + alturaMm ** 2);
  return baseMm + alturaMm + hipotenusa;
}

// Vértices locais do triângulo (mesma convenção do backend): 'reto' tem o ângulo
// reto no canto onde base e altura se encontram; 'isosceles' tem o ápice
// centralizado sobre a base. Nos dois casos a bounding box é base x altura.
//
// `invertido`: quando o nesting pareia/interliga triângulos (ver nesting.py::
// _compor_itens_triangulo), o segundo membro de um par "reto" (ou os membros em
// posição ímpar de uma fileira "isósceles") ocupam o conjunto de vértices
// COMPLEMENTAR — a mesma peça girada 180° em torno do centro da própria bounding
// box: (x,y) -> (base-x, altura-y). É essa mesma identidade que faz o par/fileira
// ladrilhar sem vão (validado por amostragem antes de implementar).
export function verticesTriangulo(baseMm, alturaMm, tipo, invertido = false) {
  const normais = tipo === 'isosceles'
    ? [{ x: 0, y: 0 }, { x: baseMm, y: 0 }, { x: baseMm / 2, y: alturaMm }]
    : [{ x: 0, y: 0 }, { x: baseMm, y: 0 }, { x: 0, y: alturaMm }];

  if (!invertido) return normais;
  return normais.map((v) => ({ x: baseMm - v.x, y: alturaMm - v.y }));
}

// String "x1,y1 x2,y2 x3,y3" pronta para o atributo `points` de um <polygon>.
export function pontosTriangulo(baseMm, alturaMm, tipo, invertido = false) {
  return verticesTriangulo(baseMm, alturaMm, tipo, invertido).map((v) => `${v.x},${v.y}`).join(' ');
}

// Mesma transformação de rotação 90° usada em furosAbsolutos, aplicada aos
// vértices do triângulo — para a peça aparecer rotacionada de verdade no
// nesting (não só com base/altura trocadas, o que produziria uma forma espelhada
// em vez de girada para um triângulo 'reto'). `placement.invertido` (vindo do
// nesting real, só presente em pares/fileiras interligados) seleciona o conjunto
// de vértices complementar ANTES de aplicar a rotação.
export function verticesTrianguloAbsolutos(placement, pecaOriginal) {
  const vertices = verticesTriangulo(
    pecaOriginal.dimA, pecaOriginal.dimB, pecaOriginal.tipoTriangulo, !!placement.invertido
  );
  return vertices.map((v) => {
    const xAbs = placement.rotated ? (pecaOriginal.dimB - v.y) : v.x;
    const yAbs = placement.rotated ? v.x : v.y;
    return { x: placement.x + xAbs, y: placement.y + yAbs };
  });
}

// Furos de uma peça já traduzidos para a posição absoluta na chapa (considera rotação 90°).
export function furosAbsolutos(placement, pecaOriginal) {
  if (!pecaOriginal) return [];

  const furosLocais = calcularFuros(
    pecaOriginal.tipoFuro, pecaOriginal.nFuros, pecaOriginal.diaFuro,
    pecaOriginal.furoOffsetX, pecaOriginal.furoOffsetY,
    pecaOriginal.dimA, pecaOriginal.dimB
  );
  const raioFuro = (Number(pecaOriginal.diaFuro) || 0) / 2;

  return furosLocais.map((furo) => {
    // Se a peça foi rotacionada 90° no nesting, os furos precisam acompanhar
    // a mesma rotação dentro do footprint já rotacionado.
    const cxAbs = placement.rotated ? (pecaOriginal.dimB - furo.cy) : furo.cx;
    const cyAbs = placement.rotated ? furo.cx : furo.cy;
    return { cx: placement.x + cxAbs, cy: placement.y + cyAbs, r: raioFuro };
  });
}

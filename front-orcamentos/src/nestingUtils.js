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

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

// Área da bounding box de uma lista de pontos locais [[x,y],...] — usada só
// para decidir qual perfil de um contorno DXF é o externo (ver contornoDxfAbsoluto).
function areaBoundingBoxPontos(pontos) {
  const xs = pontos.map((p) => p[0]);
  const ys = pontos.map((p) => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

// Contorno REAL de uma peça importada de DXF (`pecaOriginal.contornoDxf`, ver
// /processar-dxf e pecaUtils.js::construirPeca), já traduzido pra posição
// absoluta na chapa — mesma transformação de translação+rotação 90° usada por
// `verticesTrianguloAbsolutos`/`furosAbsolutos`. Retorna `null` quando a peça
// não tem contorno (DXF só com ARC/SPLINE, ou peça não-DXF) — quem chama deve
// cair de volta no retângulo/círculo/triângulo normal nesse caso.
//
// Heurística pra múltiplos perfis fechados (peça com rasgos/furos desenhados
// como polilinha fechada, não só CIRCLE): o perfil fechado de maior bounding
// box é o contorno EXTERNO da peça; os demais fechados são tratados como
// "buracos" (preenchidos com o fundo, mesmo tratamento visual dos furos
// circulares); perfis abertos residuais (ex: uma LINE solta) só são traçados,
// nunca preenchidos. É uma simplificação pragmática, não topologia CAD genérica.
export function contornoDxfAbsoluto(placement, pecaOriginal) {
  const contorno = pecaOriginal?.contornoDxf;
  if (!contorno || !Array.isArray(contorno.perfis) || contorno.perfis.length === 0) return null;

  let indiceExterno = -1;
  let maiorArea = -1;
  contorno.perfis.forEach((perfil, indice) => {
    if (!perfil.fechado || !perfil.pontos || perfil.pontos.length < 3) return;
    const area = areaBoundingBoxPontos(perfil.pontos);
    if (area > maiorArea) {
      maiorArea = area;
      indiceExterno = indice;
    }
  });

  const dimB = pecaOriginal.dimB;
  const transformar = (px, py) => {
    const xAbs = placement.rotated ? (dimB - py) : px;
    const yAbs = placement.rotated ? px : py;
    return { x: placement.x + xAbs, y: placement.y + yAbs };
  };

  return {
    perfis: contorno.perfis.map((perfil, indice) => ({
      fechado: !!perfil.fechado,
      externo: indice === indiceExterno,
      pontos: (perfil.pontos || []).map(([px, py]) => transformar(px, py)),
    })),
  };
}

// Furos de uma peça já traduzidos para a posição absoluta na chapa (considera rotação 90°).
export function furosAbsolutos(placement, pecaOriginal) {
  if (!pecaOriginal) return [];

  // Peça DXF com furos reais (CIRCLE do próprio arquivo): usa as posições
  // reais em vez da aproximação procedural abaixo (que é só pra peças
  // desenhadas manualmente via tipoFuro/offsets).
  const furosReaisDxf = pecaOriginal.contornoDxf?.furos;
  if (Array.isArray(furosReaisDxf) && furosReaisDxf.length > 0) {
    return furosReaisDxf.map((furo) => {
      const cxAbs = placement.rotated ? (pecaOriginal.dimB - furo.cy) : furo.cx;
      const cyAbs = placement.rotated ? furo.cx : furo.cy;
      return { cx: placement.x + cxAbs, cy: placement.y + cyAbs, r: furo.r };
    });
  }

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

// --- Sobras aproveitáveis (retângulos de material livre reutilizáveis) ---
// Extrai da chapa já posicionada (placements finais do nesting) os maiores
// retângulos de espaço livre — não é o "Controle de Sobras" agregado (área
// total não utilizada, já existente no backend), é a geometria real de cada
// pedaço reaproveitável, pra listar em "Sobras Reservadas para o Cliente".

function retangulosSeSobrepoem(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Divide `livre` nas tiras (até 4: esquerda/direita/cima/baixo) que sobram
// depois de descontar `ocupado` — padrão "guillotine" de manutenção de
// retângulos livres (mesma família de algoritmo usada internamente por
// packers MaxRects/Guillotine, aqui reaplicada de forma independente sobre
// os placements finais, sem acoplar no motor de bin-packing em si).
function dividirRetanguloLivre(livre, ocupado) {
  const resultado = [];
  if (ocupado.x > livre.x) {
    resultado.push({ x: livre.x, y: livre.y, w: ocupado.x - livre.x, h: livre.h });
  }
  if (ocupado.x + ocupado.w < livre.x + livre.w) {
    resultado.push({ x: ocupado.x + ocupado.w, y: livre.y, w: (livre.x + livre.w) - (ocupado.x + ocupado.w), h: livre.h });
  }
  if (ocupado.y > livre.y) {
    resultado.push({ x: livre.x, y: livre.y, w: livre.w, h: ocupado.y - livre.y });
  }
  if (ocupado.y + ocupado.h < livre.y + livre.h) {
    resultado.push({ x: livre.x, y: ocupado.y + ocupado.h, w: livre.w, h: (livre.y + livre.h) - (ocupado.y + ocupado.h) });
  }
  return resultado;
}

/**
 * Calcula os retângulos de sobra reutilizáveis de UMA chapa já posicionada.
 * @param {Array} placements - `chapa.placements` do resultado do nesting (x,y,width,height absolutos)
 * @param {number} larguraChapa, {number} comprimentoChapa, {number} margem - mm
 * @param {number} [dimensaoMinimaMm=100] - abaixo disso (em QUALQUER lado) não é considerado aproveitável
 * @returns {Array<{x,y,w,h}>} retângulos livres, maximais e SEM sobreposição entre si
 *   (nunca lista o mesmo pedaço físico duas vezes), ordenados do maior pro menor.
 */
// Descarta retângulos totalmente contidos em outro — redundância natural do
// método de divisão em tiras (várias tiras podem se sobrepor umas às outras).
// Extraída como função à parte porque precisa rodar DENTRO do loop principal
// (não só uma vez no fim — ver comentário no bug corrigido abaixo).
function podarContidos(lista) {
  return lista.filter((r, indice) => !lista.some((outro, outroIndice) => (
    outroIndice !== indice && r.x >= outro.x && r.y >= outro.y && r.x + r.w <= outro.x + outro.w && r.y + r.h <= outro.y + outro.h
  )));
}

// Trava de segurança: numa chapa muito densa (centenas de peças pequenas
// bem encaixadas), a lista de retângulos livres pode crescer muito rápido se
// não for podada a cada passo — cada peça pode dividir VÁRIOS retângulos
// livres em até 4 novos cada. Sem essa trava, um nesting real (várias
// centenas de placements) já travou a aba do navegador por vários segundos
// (o cálculo é 100% síncrono, congela a UI inteira enquanto roda). Acima
// desse limite, desiste de listar sobra pra ESSA chapa (degrada
// graciosamente pro texto "nenhuma sobra aproveitável" — o resto do PDF
// continua sendo gerado normalmente).
const SOBRA_LIMITE_RETANGULOS_LIVRES = 300;

export function calcularSobrasAproveitaveis(placements, larguraChapa, comprimentoChapa, margem, dimensaoMinimaMm = 100) {
  const larguraUtil = Math.max(0, larguraChapa - 2 * margem);
  const comprimentoUtil = Math.max(0, comprimentoChapa - 2 * margem);
  if (larguraUtil <= 0 || comprimentoUtil <= 0) return [];

  let livres = [{ x: margem, y: margem, w: larguraUtil, h: comprimentoUtil }];

  for (const p of (placements || [])) {
    const ocupado = { x: p.x, y: p.y, w: p.width, h: p.height };
    const proximosLivres = [];
    let algumaDivisao = false;
    livres.forEach((livre) => {
      if (retangulosSeSobrepoem(livre, ocupado)) {
        algumaDivisao = true;
        proximosLivres.push(...dividirRetanguloLivre(livre, ocupado));
      } else {
        proximosLivres.push(livre);
      }
    });
    // Poda a CADA passo (não só no final) — é isso que mantém a lista
    // pequena; sem podar aqui, o crescimento pode ficar exponencial em
    // chapas densas em vez de ficar limitado a algumas dezenas de retângulos.
    livres = algumaDivisao ? podarContidos(proximosLivres) : proximosLivres;

    if (livres.length > SOBRA_LIMITE_RETANGULOS_LIVRES) return [];
  }

  const maximais = livres.filter((r) => r.w >= dimensaoMinimaMm && r.h >= dimensaoMinimaMm);

  // Seleção gulosa por área (maior primeiro) descartando qualquer candidato
  // que ainda se sobreponha a um já aceito — garante uma lista SEM
  // sobreposição (o mesmo pedaço físico de chapa nunca aparece 2x na lista,
  // o que inflaria a quantidade real de sobra reaproveitável reportada).
  const ordenados = [...maximais].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const selecionados = [];
  ordenados.forEach((r) => {
    if (!selecionados.some((s) => retangulosSeSobrepoem(r, s))) {
      selecionados.push(r);
    }
  });
  return selecionados;
}

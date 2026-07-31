// Construção do objeto "peça" (o item que entra em listaPecas) a partir dos dados
// crus de um formulário — extraído pra ser reaproveitado tanto pelo formulário
// detalhado (um item por vez) quanto pela grade de Entrada Rápida (App.jsx),
// evitando duas implementações do mesmo cálculo de peso/área divergirem.
import { areaCirculo, perimetroCirculo, areaTriangulo, perimetroTriangulo } from './nestingUtils.js';

// `parametroAtual` é o join Material+Máquina já resolvido (ver App.jsx) — precisa
// existir e trazer espessura/densidade/precoKg/velocidadeCorte/valorHora/tempos.
export function construirPeca(dados, parametroAtual) {
  const {
    id, qtd, tipoPeca, tipoTriangulo, maquina,
    dimA, dimB, dimC,
    tipoFuro, nFuros, diaFuro, furoOffsetX, furoOffsetY,
    dxfImportado, dxfAreaUtilMm2, dxfPerimetroCorteMm, dxfPreviewSvg,
  } = dados;

  const dimANum = parseFloat(dimA || 0);
  const dimBNum = parseFloat(dimB || 0);
  let areaBaseMm2;
  let perimetroCorteMm;
  if (dxfImportado && dxfAreaUtilMm2 > 0) {
    areaBaseMm2 = dxfAreaUtilMm2;
    perimetroCorteMm = dxfPerimetroCorteMm;
  } else if (tipoPeca === 'C') {
    areaBaseMm2 = areaCirculo(dimANum);
    perimetroCorteMm = perimetroCirculo(dimANum);
  } else if (tipoPeca === 'T') {
    areaBaseMm2 = areaTriangulo(dimANum, dimBNum);
    perimetroCorteMm = perimetroTriangulo(dimANum, dimBNum, tipoTriangulo);
  } else {
    areaBaseMm2 = dimANum * dimBNum;
    perimetroCorteMm = 2 * (dimANum + dimBNum);
  }
  const volume = areaBaseMm2 * parseFloat(parametroAtual.espessura || 0);
  const pesoUnitario = (volume * (parametroAtual.densidade || 7.85)) / 1000000;
  const pesoTotal = pesoUnitario * parseInt(qtd || 1);

  return {
    id,
    qtd: parseInt(qtd),
    tipoPeca,
    tipoTriangulo: tipoPeca === 'T' ? tipoTriangulo : null,
    maquina,
    material: parametroAtual.material,
    espessura: parametroAtual.espessura,
    precoKgBase: parametroAtual.precoKg,
    densidade: parametroAtual.densidade || 7.85,
    velocidadeCorte: parametroAtual.velocidadeCorte,
    valorHora: parametroAtual.valorHora,
    tempoPiercing: parametroAtual.tempoPiercing,
    tempoSetup: parametroAtual.tempoSetup,
    dimA: dimANum || 0,
    dimB: tipoPeca === 'C' ? (dimANum || 0) : (dimBNum || 0),
    dimC: Number(dimC) || 0,
    perimetroCorteMm,
    areaUtilMm2: areaBaseMm2,
    dxfImportado: !!dxfImportado,
    // Guarda o SVG real do DXF na própria peça (não só no estado do formulário)
    // pra "Editar" poder mostrar o desenho importado de novo, não só a caixa X/Y.
    dxfPreviewSvg: dxfImportado ? (dxfPreviewSvg || null) : null,
    tipoFuro,
    nFuros: parseInt(nFuros || 0),
    diaFuro: Number(diaFuro) || 0,
    furoOffsetX: tipoFuro !== 'manual' ? (Number(furoOffsetX) || 0) : 0,
    furoOffsetY: tipoFuro !== 'manual' ? (Number(furoOffsetY) || 0) : 0,
    pesoUnitario: pesoUnitario.toFixed(2),
    pesoTotal: pesoTotal.toFixed(2),
  };
}

// Uma linha está pronta pra virar peça quando tem identificador, quantidade,
// dimensões coerentes com a geometria escolhida, parametrização resolvida
// (Máquina+Material+Espessura com registro em maquinas_params E materiais) e,
// se a furação não for manual, os offsets preenchidos.
export function linhaEstaValida(dados, parametroAtual) {
  if (!dados.id || !dados.id.trim()) return false;
  if (!parametroAtual) return false;

  const qtdNum = parseInt(dados.qtd);
  if (!qtdNum || qtdNum < 1) return false;

  const dimANum = parseFloat(dados.dimA);
  if (!dimANum || dimANum <= 0) return false;

  if (dados.tipoPeca !== 'C') {
    const dimBNum = parseFloat(dados.dimB);
    if (!dimBNum || dimBNum <= 0) return false;
  }

  if (dados.tipoFuro && dados.tipoFuro !== 'manual') {
    if (!(Number(dados.furoOffsetX) > 0) || !(Number(dados.furoOffsetY) > 0)) return false;
  }

  return true;
}

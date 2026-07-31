// Exportação do nesting em PDF, no padrão industrial "Plano de Corte" (ver
// relatorioIndustrialPdf.js) — este arquivo é o orquestrador ESPECÍFICO do
// GeoQuote: sabe o que é uma "peça"/"espessura"/"chapa" do motor de nesting e
// monta os dados que o template genérico só desenha. Continua vetorial (sem
// html2canvas), reaproveitando a mesma paleta/lógica de furos/contorno usada
// na tela (nestingUtils.js), então o desenho no PDF bate com o da tela.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  corDaPeca, furosAbsolutos, verticesTrianguloAbsolutos, verticesTriangulo,
  contornoDxfAbsoluto, calcularSobrasAproveitaveis, calcularFuros,
} from './nestingUtils.js';
import {
  MARGEM_PAGINA, desenharCabecalhoIndustrial, desenharBarraTitulo, desenharTituloPlanoDeCorte,
  desenharPainelEspessura, desenharTabelaEspecificacoesChapa, desenharTabelaPecasDoPlano,
  desenharTabelaSobras, desenharRodapeIndustrial,
} from './relatorioIndustrialPdf.js';

const COR_BORDA_CHAPA = '#334155';
const COR_MARGEM_TRACEJADA = '#94A3B8';
// Abaixo disso (em qualquer lado) uma sobra não é considerada aproveitável.
const SOBRA_DIMENSAO_MINIMA_MM = 100;
// Altura padrão do diagrama do "Plano de Corte" — FIXA por orientação de
// página, não calculada a partir do conteúdo abaixo (nº de tipos de peça,
// se tem sobra listada etc). Isso é proposital: garante que toda página de
// plano de corte tenha o mesmo tamanho visual de diagrama, independente do
// que sobra depois dele — o conteúdo abaixo (especificações/peças/sobras) é
// que se ajusta e, se não couber, continua numa página seguinte com o
// cabeçalho de coluna repetido (autoTable `showHead: 'everyPage'`).
const ALTURA_DIAGRAMA_RETRATO_MM = 125;
const ALTURA_DIAGRAMA_PAISAGEM_MM = 85;

// Assinatura de uma chapa (conjunto de peças/posições/rotações, ordem-independente)
// — chapas com a mesma assinatura têm o MESMO arranjo físico e viram um único
// "Plano de Corte N (MX)" no relatório, em vez de uma página por chapa física.
function assinaturaChapa(chapa) {
  return chapa.placements
    .map((p) => `${p.id}|${Math.round(p.x * 10)}|${Math.round(p.y * 10)}|${p.rotated ? 1 : 0}`)
    .sort()
    .join(';');
}

function agruparChapasIdenticas(chapas) {
  const grupos = [];
  const indicePorAssinatura = new Map();
  chapas.forEach((chapa) => {
    const assinatura = assinaturaChapa(chapa);
    const indice = indicePorAssinatura.get(assinatura);
    if (indice !== undefined) {
      grupos[indice].multiplicador += 1;
    } else {
      indicePorAssinatura.set(assinatura, grupos.length);
      grupos.push({ chapaRepresentante: chapa, multiplicador: 1 });
    }
  });
  return grupos;
}

function contarPecasPorId(chapa) {
  const contagem = new Map();
  chapa.placements.forEach((p) => contagem.set(p.id, (contagem.get(p.id) || 0) + 1));
  return contagem;
}

// Evita o bug de "barra de título cola no rodapé e a tabela que vem depois
// pula sozinha pra uma página nova quase em branco": `desenharBarraTitulo`
// é desenho manual (não pagina sozinho como o autoTable), então se não
// sobrar espaço nem pra ELA + pelo menos 1 linha da tabela seguinte, força a
// quebra de página ANTES de desenhar a barra — título e conteúdo sempre
// ficam juntos na mesma página.
function garantirEspaco(doc, y, alturaNecessariaMm, orientacaoPagina) {
  const pageH = doc.internal.pageSize.height;
  const RODAPE_RESERVADO_MM = 12;
  if (y + alturaNecessariaMm > pageH - RODAPE_RESERVADO_MM) {
    doc.addPage('a4', orientacaoPagina);
    return MARGEM_PAGINA;
  }
  return y;
}

// Rotaciona 90° (sentido horário) um ponto do referencial original da chapa
// (largura x comprimento) pro referencial "deitado" (comprimento x largura) —
// mesma identidade (x,y) -> (H-y, x) já usada em toda a app pra rotação de
// peça dentro do nesting, só que aplicada na chapa INTEIRA pra fins de desenho.
function pontoRotacionado90(x, y, chapaComprimento) {
  return { x: chapaComprimento - y, y: x };
}

// Idem, mas para um retângulo (x,y,w,h) — deriva do transform acima aplicado
// aos 4 cantos: como a rotação é sempre múltiplo de 90°, simplifica pra uma
// fórmula direta (sem precisar computar min/max dos 4 cantos toda vez).
function retanguloRotacionado90(x, y, w, h, chapaComprimento) {
  return { x: chapaComprimento - y - h, y: x, w: h, h: w };
}

// Mede quanto espaço (mm) a cota vertical (a que fica à direita da chapa)
// precisa — usado pra reservar espaço de verdade em vez de um valor "no
// chute" (já causou um bug real: a chapa cobria o número da cota porque o
// espaço reservado era menor que o necessário).
function medirReservaCotaVertical(doc, comprimentoRealMm) {
  doc.setFont(undefined, 'bold');
  doc.setFontSize(7);
  const texto = `${Math.round(comprimentoRealMm)} mm`;
  const larguraTexto = doc.getTextWidth(texto);
  const gap = 4;
  const tick = 1.3;
  const respiro = 1.5;
  return gap + tick + respiro + larguraTexto + 2; // +2mm de folga de segurança
}

// Cota (anotação técnica de dimensão) da chapa: uma linha com marcas nas
// pontas embaixo (largura do desenho) e outra à direita (altura do desenho),
// com o valor real em mm — não o valor já escalado. O texto da cota vertical
// é escrito NA HORIZONTAL (não rotacionado) de propósito: texto rotacionado
// já causou um bug de posicionamento (saía sobreposto pela própria chapa) —
// texto horizontal ao lado da linha é mais previsível e sempre legível.
function desenharCotaChapa(doc, x, y, w, h, larguraRealMm, comprimentoRealMm) {
  const corCota = '#334155';
  const gap = 4;
  const tick = 1.3;

  doc.setDrawColor(corCota);
  doc.setTextColor(corCota);
  doc.setLineWidth(0.15);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(7);

  const cotaY = y + h + gap;
  doc.line(x, cotaY, x + w, cotaY);
  doc.line(x, cotaY - tick, x, cotaY + tick);
  doc.line(x + w, cotaY - tick, x + w, cotaY + tick);
  doc.text(`${Math.round(larguraRealMm)} mm`, x + w / 2, cotaY + 3.2, { align: 'center' });

  const cotaX = x + w + gap;
  doc.line(cotaX, y, cotaX, y + h);
  doc.line(cotaX - tick, y, cotaX + tick, y);
  doc.line(cotaX - tick, y + h, cotaX + tick, y + h);
  doc.text(`${Math.round(comprimentoRealMm)} mm`, cotaX + tick + 1.5, y + h / 2, { align: 'left', baseline: 'middle' });
}

// Desenha a peça (contorno real do DXF quando disponível, senão retângulo/
// círculo/triângulo) + furos, já posicionada e escalada dentro da área reservada.
// Chapas "em pé" (comprimento > largura, ex: 1200x3000) são desenhadas
// GIRADAS 90° ("deitadas") — o eixo mais comprido sempre fica horizontal,
// aproveitando muito melhor a largura da página (fixa) do que a altura
// (variável, mas quase sempre menor que a largura útil da folha A4).
function desenharDiagramaChapa(doc, item, chapa, idsUnicosPecas, listaPecas, areaX, areaY, areaW, areaH) {
  const girar = item.chapa_comprimento > item.chapa_largura;
  const larguraEfetiva = girar ? item.chapa_comprimento : item.chapa_largura;
  const comprimentoEfetivo = girar ? item.chapa_largura : item.chapa_comprimento;

  // Reserva MEDIDA (não estimada) pro texto da cota — a horizontal (embaixo)
  // só precisa de altura de uma linha de texto; a vertical (à direita) precisa
  // da largura real do texto "NNNN mm", que varia com a quantidade de dígitos.
  const reservaCotaXMm = medirReservaCotaVertical(doc, comprimentoEfetivo);
  const reservaCotaYMm = 4 /* gap */ + 1.3 /* tick */ + 4.5 /* altura do texto embaixo */;

  const escala = Math.min((areaW - reservaCotaXMm) / larguraEfetiva, (areaH - reservaCotaYMm) / comprimentoEfetivo);
  const chapaWmm = larguraEfetiva * escala;
  const chapaHmm = comprimentoEfetivo * escala;
  const offsetX = areaX + (areaW - reservaCotaXMm - chapaWmm) / 2;
  const offsetY = areaY + (areaH - reservaCotaYMm - chapaHmm) / 2;

  const transformarPonto = (x, y) => {
    const pt = girar ? pontoRotacionado90(x, y, item.chapa_comprimento) : { x, y };
    return [offsetX + pt.x * escala, offsetY + pt.y * escala];
  };

  doc.setDrawColor(COR_BORDA_CHAPA);
  doc.setLineWidth(0.4);
  doc.setFillColor('#FFFFFF');
  doc.rect(offsetX, offsetY, chapaWmm, chapaHmm, 'FD');

  const margemMm = item.chapa_margem * escala;
  doc.setDrawColor(COR_MARGEM_TRACEJADA);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(offsetX + margemMm, offsetY + margemMm, Math.max(0, chapaWmm - 2 * margemMm), Math.max(0, chapaHmm - 2 * margemMm));
  doc.setLineDashPattern([], 0);

  chapa.placements.forEach((p) => {
    const cor = corDaPeca(p.id, idsUnicosPecas);
    const pecaOriginal = listaPecas.find((pc) => pc.id === p.id);
    const furos = furosAbsolutos(p, pecaOriginal);
    const contornoAbs = pecaOriginal?.dxfImportado ? contornoDxfAbsoluto(p, pecaOriginal) : null;

    const retLocal = girar
      ? retanguloRotacionado90(p.x, p.y, p.width, p.height, item.chapa_comprimento)
      : { x: p.x, y: p.y, w: p.width, h: p.height };

    const px = offsetX + retLocal.x * escala;
    const py = offsetY + retLocal.y * escala;
    const pw = retLocal.w * escala;
    const ph = retLocal.h * escala;

    doc.setFillColor(cor);
    doc.setDrawColor(cor);
    doc.setLineWidth(0.3);

    let labelX = px + pw / 2;
    let labelY = py + ph / 2;

    if (contornoAbs && contornoAbs.perfis.some((perfil) => perfil.externo)) {
      // Contorno real do DXF: desenha o(s) perfil(is) já escalado(s)/transladado(s)
      // — externo preenchido com a cor da peça, fechados internos como "buraco"
      // (recorte, mesmo tratamento visual de um furo circular), abertos só traçados.
      contornoAbs.perfis.forEach((perfil) => {
        if (!perfil.pontos || perfil.pontos.length < 2) return;
        const pontos = perfil.pontos.map((pt) => transformarPonto(pt.x, pt.y));
        const primeiro = pontos[0];
        const segmentos = pontos.slice(1).map((pt, indice) => [pt[0] - pontos[indice][0], pt[1] - pontos[indice][1]]);

        if (perfil.externo) {
          doc.lines(segmentos, primeiro[0], primeiro[1], [1, 1], 'FD', perfil.fechado);
        } else if (perfil.fechado) {
          doc.setFillColor('#FFFFFF');
          doc.setDrawColor(COR_BORDA_CHAPA);
          doc.setLineWidth(0.15);
          doc.lines(segmentos, primeiro[0], primeiro[1], [1, 1], 'FD', true);
          doc.setFillColor(cor);
          doc.setDrawColor(cor);
          doc.setLineWidth(0.3);
        } else {
          doc.setLineWidth(0.15);
          doc.lines(segmentos, primeiro[0], primeiro[1], [1, 1], 'D', false);
          doc.setLineWidth(0.3);
        }
      });
    } else if (pecaOriginal?.tipoPeca === 'C') {
      doc.circle(px + pw / 2, py + ph / 2, pw / 2, 'FD');
    } else if (pecaOriginal?.tipoPeca === 'T') {
      const vertices = verticesTrianguloAbsolutos(p, pecaOriginal).map((v) => {
        const [vx, vy] = transformarPonto(v.x, v.y);
        return { x: vx, y: vy };
      });
      doc.triangle(vertices[0].x, vertices[0].y, vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y, 'FD');
      labelX = (vertices[0].x + vertices[1].x + vertices[2].x) / 3;
      labelY = (vertices[0].y + vertices[1].y + vertices[2].y) / 3;
    } else {
      doc.rect(px, py, pw, ph, 'FD');
    }

    furos.forEach((furo) => {
      if (furo.r <= 0) return;
      const [fx, fy] = transformarPonto(furo.cx, furo.cy);
      doc.setFillColor('#FFFFFF');
      doc.setDrawColor(COR_BORDA_CHAPA);
      doc.setLineWidth(0.15);
      doc.circle(fx, fy, Math.max(0.3, furo.r * escala), 'FD');
    });

    if (pw > 6 && ph > 4) {
      doc.setFontSize(Math.min(8, Math.max(4, pw * 0.12)));
      doc.setFont(undefined, 'normal');
      doc.setTextColor('#FFFFFF');
      doc.text(String(p.id), labelX, labelY, { align: 'center', baseline: 'middle' });
    }
  });

  desenharCotaChapa(doc, offsetX, offsetY, chapaWmm, chapaHmm, larguraEfetiva, comprimentoEfetivo);
}

// Desenha a peça "parada" (sem posição/rotação de chapa — é só a forma dela
// mesma) dentro de uma célula pequena da tabela de peças. Reaproveita
// `contornoDxfAbsoluto` com um placement identidade (x=0,y=0,rotated=false)
// pra reusar a mesma classificação externo/buraco, sem duplicar essa lógica.
function desenharThumbnailPeca(doc, peca, x, y, w, h) {
  if (!peca) {
    doc.setDrawColor('#94A3B8');
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, h);
    return;
  }

  const dimA = peca.dimA > 0 ? peca.dimA : 1;
  const dimB = peca.dimB > 0 ? peca.dimB : 1;
  const escala = Math.min(w / dimA, h / dimB) * 0.85;
  const wDes = dimA * escala;
  const hDes = dimB * escala;
  const offX = x + (w - wDes) / 2;
  const offY = y + (h - hDes) / 2;
  const cor = corDaPeca(peca.id, [peca.id]);

  doc.setFillColor(cor);
  doc.setDrawColor(cor);
  doc.setLineWidth(0.15);

  const contornoLocal = peca.dxfImportado
    ? contornoDxfAbsoluto({ x: 0, y: 0, rotated: false }, peca)
    : null;

  if (contornoLocal && contornoLocal.perfis.some((perfil) => perfil.externo)) {
    contornoLocal.perfis.forEach((perfil) => {
      if (!perfil.pontos || perfil.pontos.length < 2) return;
      const pontos = perfil.pontos.map((pt) => [offX + pt.x * escala, offY + pt.y * escala]);
      const primeiro = pontos[0];
      const segmentos = pontos.slice(1).map((pt, indice) => [pt[0] - pontos[indice][0], pt[1] - pontos[indice][1]]);

      if (perfil.externo) {
        doc.lines(segmentos, primeiro[0], primeiro[1], [1, 1], 'FD', perfil.fechado);
      } else if (perfil.fechado) {
        doc.setFillColor('#FFFFFF');
        doc.lines(segmentos, primeiro[0], primeiro[1], [1, 1], 'FD', true);
        doc.setFillColor(cor);
      }
    });
  } else if (peca.tipoPeca === 'C') {
    doc.circle(offX + wDes / 2, offY + hDes / 2, Math.min(wDes, hDes) / 2, 'FD');
  } else if (peca.tipoPeca === 'T') {
    const vertices = verticesTriangulo(dimA, dimB, peca.tipoTriangulo).map((v) => ({
      x: offX + v.x * escala, y: offY + v.y * escala,
    }));
    doc.triangle(vertices[0].x, vertices[0].y, vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y, 'FD');
  } else {
    doc.rect(offX, offY, wDes, hDes, 'FD');
  }

  // Furos: prefere as posições reais do DXF (furos.cx/cy/r já em mm reais no
  // referencial local); pra peça desenhada à mão, cai na posição procedural
  // (mesma lógica de calcularFuros usada no preview de peça única/nesting).
  const furosLocais = peca.contornoDxf?.furos?.length
    ? peca.contornoDxf.furos
    : calcularFuros(peca.tipoFuro, peca.nFuros, peca.diaFuro, peca.furoOffsetX, peca.furoOffsetY, dimA, dimB)
      .map((f) => ({ ...f, r: (Number(peca.diaFuro) || 0) / 2 }));

  furosLocais.forEach((furo) => {
    if (!furo.r || furo.r <= 0) return;
    doc.setFillColor('#FFFFFF');
    doc.setDrawColor('#334155');
    doc.setLineWidth(0.1);
    doc.circle(offX + furo.cx * escala, offY + furo.cy * escala, Math.max(0.15, furo.r * escala), 'FD');
  });
}

function desenharPaginaDoPlano(doc, { cliente, item, plano, numeroPlano, totalPlanos, orientacaoPagina, detalhamentoPecas }) {
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  const agora = new Date();

  const rotuloSobra = item.sobra_reservada_cliente;
  const tituloEspessuraProcesso = `${Number(item.espessura).toFixed(2)} mm ${item.maquina || ''}`.trim();

  let y = MARGEM_PAGINA;
  y = desenharCabecalhoIndustrial(doc, y, {
    maquina: item.maquina,
    data: agora.toLocaleDateString('pt-BR'),
    horario: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    codigoCnc: null,
    tituloEspessuraProcesso,
  });

  y += 2;
  // Peso de UMA chapa inteira (informativo) — mesma fórmula de pricing.py::peso_chapa_kg,
  // recalculada aqui só pra exibição (o custo cobrado já vem pronto do backend).
  const pesoUmaChapaKg = (item.chapa_largura * item.chapa_comprimento * item.espessura * (item.densidade_ref || 7.85)) / 1_000_000;
  const sucataPct = item.chapa_area_total_mm2 > 0 ? (item.sucata_area_mm2 / item.chapa_area_total_mm2) * 100 : 0;
  y = desenharPainelEspessura(doc, y, {
    titulo: `PAINEL DA ESPESSURA ${Number(item.espessura).toFixed(2)} MM`,
    nomeJob: cliente,
    numeroChapasCortar: item.chapas_necessarias,
    aproveitamentoPct: item.utilizacao_pct.toFixed(2),
    sucataPct: sucataPct.toFixed(2),
    pesoChapaKg: pesoUmaChapaKg.toFixed(2),
    pesoSucataKg: item.sucata_peso_kg.toFixed(2),
    rotuloPercentual: rotuloSobra ? 'Sobra Reservada:' : 'Sucata:',
    rotuloPeso: rotuloSobra ? 'Peso Sobra Reservada:' : 'Peso Sucata:',
  });

  y += 2;
  y = desenharTituloPlanoDeCorte(doc, y, { numero: numeroPlano, totalPlanos, multiplicador: plano.multiplicador });

  const contagemPorId = contarPecasPorId(plano.chapaRepresentante);
  const idsDoPlano = [...contagemPorId.keys()];
  let materialDoPlano = '-';
  const pecasDoPlano = idsDoPlano.map((id, indice) => {
    const pecaOriginal = plano.listaPecas.find((pc) => pc.id === id);
    if (pecaOriginal?.material && materialDoPlano === '-') materialDoPlano = pecaOriginal.material;

    const qtdNesting = contagemPorId.get(id);
    // Tempo de corte RATEADO desta linha: tempo unitário da peça (tempo total
    // do item ÷ qtd solicitada — detalhamento_pecas já vem calculado por peça
    // individual do backend, não é estimativa) × quantas unidades dela cabem
    // NESTE plano específico. Não confundir com o tempo total do orçamento.
    const detalhePeca = detalhamentoPecas?.[id];
    const tempoUnitarioMin = detalhePeca && pecaOriginal?.qtd > 0 ? detalhePeca.tempo_min / pecaOriginal.qtd : null;
    const tempoCorteRateadoMin = tempoUnitarioMin != null ? tempoUnitarioMin * qtdNesting : null;

    return {
      numero: indice + 1,
      nome: id,
      qtdSolicitada: pecaOriginal?.qtd ?? '-',
      qtdNesting,
      pesoLiquidoKg: pecaOriginal?.pesoUnitario ?? '-',
      cliente: cliente || '-',
      tempoCorte: tempoCorteRateadoMin != null ? `${tempoCorteRateadoMin.toFixed(2)} min` : '-',
      ordemProducao: '-',
      _peca: pecaOriginal,
      _tempoCorteRateadoMin: tempoCorteRateadoMin || 0,
    };
  });

  // Sobras reais (geometria de verdade, não estimativa): retângulos livres
  // >= 100x100mm extraídos do arranjo físico deste plano. Se o cliente não
  // marcou que quer a sobra, nem calcula — ela fica na empresa por decisão
  // de negócio, independente de existir espaço aproveitável ou não.
  let sobras = [];
  let mensagemSobraVazia = 'Nenhuma sobra aproveitável neste plano.';
  if (!rotuloSobra) {
    mensagemSobraVazia = 'A sobra ficará na empresa.';
  } else {
    const retangulosLivres = calcularSobrasAproveitaveis(
      plano.chapaRepresentante.placements, item.chapa_largura, item.chapa_comprimento,
      item.chapa_margem, SOBRA_DIMENSAO_MINIMA_MM
    );
    const densidade = item.densidade_ref || 7.85;
    sobras = retangulosLivres.map((r) => {
      const maior = Math.max(r.w, r.h);
      const menor = Math.min(r.w, r.h);
      const pesoUnitarioKg = (maior * menor * item.espessura * densidade) / 1_000_000;
      return {
        medida: `${Math.round(maior)} x ${Math.round(menor)}`,
        quantidade: plano.multiplicador,
        pesoUnitarioKg: pesoUnitarioKg.toFixed(2),
        pesoTotalKg: (pesoUnitarioKg * plano.multiplicador).toFixed(2),
      };
    });
  }

  y += 2;
  const areaDiagramaY = y;
  const areaDiagramaAltura = pageW > pageH ? ALTURA_DIAGRAMA_PAISAGEM_MM : ALTURA_DIAGRAMA_RETRATO_MM;
  desenharDiagramaChapa(
    doc, item, plano.chapaRepresentante, plano.idsUnicosPecas, plano.listaPecas,
    MARGEM_PAGINA, areaDiagramaY, pageW - MARGEM_PAGINA * 2, areaDiagramaAltura
  );

  y = areaDiagramaY + areaDiagramaAltura + 3;
  // Tempo de corte deste plano = soma do tempo rateado de cada peça que está
  // NESTA chapa (não a média do total da espessura pelo nº de chapas físicas
  // — plano diferentes da mesma espessura podem ter arranjos/tempos diferentes).
  const tempoTotalDoPlanoMin = pecasDoPlano.reduce((soma, p) => soma + p._tempoCorteRateadoMin, 0);
  const utilX = Math.max(0, item.chapa_largura - 2 * item.chapa_margem);
  const utilY = Math.max(0, item.chapa_comprimento - 2 * item.chapa_margem);
  y = desenharTabelaEspecificacoesChapa(doc, y, {
    material: materialDoPlano,
    espessuraMm: Number(item.espessura).toFixed(2),
    chapaLarguraMm: item.chapa_largura,
    chapaComprimentoMm: item.chapa_comprimento,
    tempoCorteMin: tempoTotalDoPlanoMin.toFixed(1),
    utilXMm: utilX.toFixed(0),
    utilYMm: utilY.toFixed(0),
  });

  y += 2;
  // Garante que a barra de título e pelo menos o cabeçalho+1 linha da tabela
  // fiquem juntos na mesma página — senão a barra cola no rodapé e a tabela
  // (que pagina sozinha via autoTable) pula pra uma página nova quase em branco.
  y = garantirEspaco(doc, y, 8.5 + 16, orientacaoPagina);
  y = desenharBarraTitulo(doc, y, 'LISTA DETALHADA DE PEÇAS DO PLANO');
  y = desenharTabelaPecasDoPlano(doc, y, pecasDoPlano, {
    renderizarImagem: (docRef, pecaDaLinha, cx, cy, cw, ch) => desenharThumbnailPeca(docRef, pecaDaLinha._peca, cx, cy, cw, ch),
  });

  y += 2;
  y = garantirEspaco(doc, y, 8.5 + 16, orientacaoPagina);
  y = desenharBarraTitulo(doc, y, 'SOBRAS RESERVADAS PARA O CLIENTE');
  desenharTabelaSobras(doc, y, sobras, mensagemSobraVazia);

  desenharRodapeIndustrial(doc);
}

// Barra de título ESCURA (fundo preto/slate, texto branco) — só usada na
// página de orçamento (identidade "documento comercial Lypsyos", diferente
// da barra branca/bordada usada nas páginas de plano de corte "industrial").
function desenharBarraTituloEscura(doc, y, texto) {
  const pageW = doc.internal.pageSize.width;
  const largura = pageW - MARGEM_PAGINA * 2;
  const altura = 6;
  doc.setFillColor('#0F172A');
  doc.rect(MARGEM_PAGINA, y, largura, altura, 'F');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor('#FFFFFF');
  doc.text(texto, MARGEM_PAGINA + 2, y + altura / 2, { baseline: 'middle' });
  return y + altura;
}

// Última página do PDF: o mesmo "orçamento comercial" que já existia (tela
// "Resultado", impresso via window.print) — replicado aqui em jsPDF pra sair
// no MESMO arquivo PDF que os planos de corte (o orçamentista manda os
// planos de corte + o orçamento pro cliente num único PDF, não dois
// documentos separados). Mantém a identidade "Lypsyos" (cabeçalho de marca,
// barras escuras) em vez do padrão "industrial" das páginas de plano de corte.
function desenharPaginaOrcamento(doc, { resultadoOrcamento, listaPecas, cliente, orientacaoPagina }) {
  const pageW = doc.internal.pageSize.width;
  const totais = resultadoOrcamento.totais_globais;
  const detalhamentoPecas = resultadoOrcamento.detalhamento_pecas || {};
  const agora = new Date();
  // Só um número de referência visual (não é um ID persistido em lugar
  // nenhum) — mesmo comportamento que a tela impressa já tinha.
  const orcamentoId = Math.floor(Math.random() * 9000) + 1000;
  const maquinaPrincipal = resultadoOrcamento.detalhamento_espessuras?.[0]?.maquina || '-';

  // --- Cabeçalho de marca ---
  doc.setFont(undefined, 'bold');
  doc.setFontSize(18);
  doc.setTextColor('#0F172A');
  doc.text('LYPSYOS', MARGEM_PAGINA, MARGEM_PAGINA + 5);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor('#64748B');
  doc.text('CONSULTORIA & ORÇAMENTO TÉCNICO', MARGEM_PAGINA, MARGEM_PAGINA + 9.5);

  const rotuloPacote = resultadoOrcamento.inclui_material ? 'PACOTE COMPLETO (MATERIAL + CORTE)' : 'SÓ SERVIÇO (FACÇÃO)';
  doc.setFont(undefined, 'bold');
  doc.setFontSize(6.5);
  const larguraTag = doc.getTextWidth(rotuloPacote) + 4;
  doc.setDrawColor('#0F172A');
  doc.setLineWidth(0.2);
  doc.rect(MARGEM_PAGINA, MARGEM_PAGINA + 11.5, larguraTag, 4.5);
  doc.setTextColor('#0F172A');
  doc.text(rotuloPacote, MARGEM_PAGINA + 2, MARGEM_PAGINA + 14.4);

  autoTable(doc, {
    theme: 'plain',
    startY: MARGEM_PAGINA,
    margin: { left: pageW / 2, right: MARGEM_PAGINA },
    styles: { font: 'helvetica', fontSize: 7.5, textColor: '#0F172A', cellPadding: 0.9 },
    body: [
      [{ content: 'ORÇAMENTO:', styles: { fontStyle: 'bold' } }, { content: String(orcamentoId), styles: { halign: 'right' } }],
      [{ content: 'MÁQUINA:', styles: { fontStyle: 'bold' } }, { content: maquinaPrincipal, styles: { halign: 'right' } }],
      [{ content: 'CLIENTE:', styles: { fontStyle: 'bold' } }, { content: (cliente || 'CONSUMIDOR FINAL').toUpperCase(), styles: { halign: 'right' } }],
      [{ content: 'EMISSÃO:', styles: { fontStyle: 'bold' } }, { content: agora.toLocaleDateString('pt-BR'), styles: { halign: 'right' } }],
    ],
  });

  let y = MARGEM_PAGINA + 19;
  doc.setDrawColor('#0F172A');
  doc.setLineWidth(0.4);
  doc.line(MARGEM_PAGINA, y, pageW - MARGEM_PAGINA, y);
  y += 4;

  // --- Resumo de custos e parâmetros técnicos ---
  y = desenharBarraTituloEscura(doc, y, 'RESUMO DE CUSTOS E PARÂMETROS TÉCNICOS PARA USO COMERCIAL');
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM_PAGINA, right: MARGEM_PAGINA },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, halign: 'center', textColor: '#64748B', lineColor: '#CBD5E1', lineWidth: 0.2, cellPadding: 1.5 },
    body: [
      ['TEMPO TOTAL ESTIMADO', 'PESO TOTAL ESTIMADO (KG)', 'CHAPAS UTILIZADAS (QTD)', 'VALOR VENDA BRUTO'],
      [
        { content: `${Math.floor(totais.tempo_total_min / 60)}h ${Math.round(totais.tempo_total_min % 60)}m`, styles: { fontStyle: 'bold', fontSize: 11, textColor: '#0F172A' } },
        { content: totais.peso_total_kg.toFixed(2), styles: { fontStyle: 'bold', fontSize: 11, textColor: '#0F172A' } },
        { content: String(totais.chapas_totais), styles: { fontStyle: 'bold', fontSize: 11, textColor: '#0F172A' } },
        { content: `R$ ${totais.preco_venda_bruto.toFixed(2)}`, styles: { fontStyle: 'bold', fontSize: 11, textColor: '#0F172A', fillColor: '#E2E8F0' } },
      ],
    ],
  });
  y = doc.lastAutoTable.finalY + 4;

  // --- Dados da peça e produção detalhada (mesma tabela/dados da tela
  // "Resultado" impressa — ID/Dimensões/Furos/Qtd/Peso/Chapas/Tempo/Custo —
  // agrupada por espessura com linha de TOTAL, igual ao HTML original). ---
  y = garantirEspaco(doc, y, 20, orientacaoPagina);
  y = desenharBarraTituloEscura(doc, y, 'DADOS DA PEÇA E PRODUÇÃO DETALHADA');

  const corpoTabelaPecas = [];
  (resultadoOrcamento.detalhamento_espessuras || []).forEach((item) => {
    const pecasDaEspessura = listaPecas.filter((p) => Number(p.espessura).toFixed(2) === Number(item.espessura).toFixed(2));
    pecasDaEspessura.forEach((p) => {
      const detalhe = detalhamentoPecas[p.id];
      corpoTabelaPecas.push([
        p.id,
        `${p.dimA} x ${p.dimB}`,
        Number(p.nFuros) > 0 ? `${p.nFuros}x Ø${p.diaFuro}` : '-',
        String(p.qtd),
        p.pesoTotal,
        item.dimensao_chapa,
        detalhe ? `${detalhe.tempo_min.toFixed(1)} min` : '-',
        detalhe ? detalhe.custo_maquina.toFixed(2) : '-',
      ]);
    });
    corpoTabelaPecas.push([
      { content: `TOTAL ESPESSURA ${Number(item.espessura).toFixed(2)} MM`, colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: '#E2E8F0' } },
      { content: String(item.qtd_pecas), styles: { fontStyle: 'bold', fillColor: '#E2E8F0' } },
      { content: item.peso_kg.toFixed(2), styles: { fontStyle: 'bold', fillColor: '#E2E8F0' } },
      { content: `${item.chapas_necessarias} un (${item.dimensao_chapa})`, styles: { fontStyle: 'bold', fillColor: '#E2E8F0', fontSize: 6 } },
      { content: `${Math.floor(item.tempo_min / 60)}h ${Math.round(item.tempo_min % 60)}m`, styles: { fontStyle: 'bold', fillColor: '#E2E8F0' } },
      { content: `R$ ${item.custo_maquina.toFixed(2)}`, styles: { fontStyle: 'bold', fillColor: '#E2E8F0' } },
    ]);
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM_PAGINA, right: MARGEM_PAGINA, bottom: MARGEM_PAGINA },
    showHead: 'everyPage',
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.5, halign: 'center', textColor: '#0F172A', lineColor: '#94A3B8', lineWidth: 0.2, cellPadding: 1.3 },
    headStyles: { fillColor: '#0F172A', textColor: '#FFFFFF', fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left' } },
    head: [['ID DA PEÇA', 'DIMENSÕES (MM)', 'FUROS', 'QTD', 'PESO (KG)', 'CHAPAS (L X C)', 'TEMPO', 'CUSTO MÁQUINA R$']],
    body: corpoTabelaPecas,
  });
  y = doc.lastAutoTable.finalY + 4;

  // --- Observações + assinatura ---
  y = garantirEspaco(doc, y, 35, orientacaoPagina);
  y = desenharBarraTituloEscura(doc, y, 'OBSERVAÇÕES SOBRE PRAZO E PRODUÇÃO');
  y += 4;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(7);
  doc.setTextColor('#334155');
  [
    '1. Os valores orçados referem-se estritamente às geometrias fornecidas na data da emissão.',
    '2. Variações na espessura comercial da chapa estão sujeitas à tolerância da usina siderúrgica.',
    '3. Prazo de entrega a combinar após aprovação técnica e financeira deste documento.',
  ].forEach((linha) => {
    doc.text(linha, MARGEM_PAGINA + 2, y);
    y += 3.8;
  });

  y += 10;
  const larguraAssinatura = 70;
  const xAssinatura = pageW - MARGEM_PAGINA - larguraAssinatura;
  doc.setDrawColor('#0F172A');
  doc.setLineWidth(0.2);
  doc.line(xAssinatura, y, xAssinatura + larguraAssinatura, y);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(7);
  doc.setTextColor('#0F172A');
  doc.text('DEPTO. COMERCIAL - LYPSYOS', xAssinatura + larguraAssinatura / 2, y + 4, { align: 'center' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(6);
  doc.setTextColor('#64748B');
  doc.text('ASSINATURA E CARIMBO', xAssinatura + larguraAssinatura / 2, y + 7.5, { align: 'center' });

  desenharRodapeIndustrial(doc);
}

/**
 * Gera e baixa um PDF no padrão industrial "Plano de Corte", uma página por
 * arranjo de chapa distinto (chapas idênticas viram 1 página com multiplicador
 * "(MX)" em vez de 1 página por chapa física).
 * @param {object} resultadoOrcamento - retorno de /calcular-orcamento
 * @param {Array} listaPecas - peças do orçamento (para achar tipoFuro/dimensões/contorno originais)
 * @param {string} cliente
 * @param {number} [espessuraFiltro] - se informado, exporta só as chapas dessa espessura
 * @param {'retrato'|'paisagem'} [orientacao='retrato'] - preferência do usuário; chapas muito
 *   mais largas que altas ainda forçam paisagem automaticamente, pra não espremer o desenho.
 */
export function gerarPdfNesting(resultadoOrcamento, listaPecas, cliente, espessuraFiltro, orientacao = 'retrato') {
  const grupos = (resultadoOrcamento?.detalhamento_espessuras || [])
    .filter((item) => item.nesting && item.nesting.chapas && item.nesting.chapas.length > 0)
    .filter((item) => espessuraFiltro === undefined || Number(item.espessura) === Number(espessuraFiltro));

  if (grupos.length === 0) {
    alert('Nenhuma chapa de nesting disponível para exportar.');
    return;
  }

  const idsUnicosPecas = [...new Set(listaPecas.map((p) => p.id))];

  const paginas = [];
  grupos.forEach((item) => {
    const planosDoItem = agruparChapasIdenticas(item.nesting.chapas);
    planosDoItem.forEach((plano, indice) => {
      const paisagemForcada = orientacao === 'paisagem';
      const paisagemAuto = !paisagemForcada && item.chapa_largura / item.chapa_comprimento > 1.4;
      paginas.push({
        item,
        plano: { ...plano, idsUnicosPecas, listaPecas },
        numeroPlano: indice + 1,
        totalPlanos: planosDoItem.length,
        orientacaoPagina: (paisagemForcada || paisagemAuto) ? 'landscape' : 'portrait',
      });
    });
  });

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: paginas[0].orientacaoPagina });
  const detalhamentoPecas = resultadoOrcamento.detalhamento_pecas || {};

  paginas.forEach((pagina, indice) => {
    if (indice > 0) doc.addPage('a4', pagina.orientacaoPagina);
    desenharPaginaDoPlano(doc, {
      cliente, item: pagina.item, plano: pagina.plano, numeroPlano: pagina.numeroPlano, totalPlanos: pagina.totalPlanos,
      orientacaoPagina: pagina.orientacaoPagina, detalhamentoPecas,
    });
  });

  // Última folha: resumo do orçamento (mesmo doc, mesmo PDF) — o orçamentista
  // manda tudo (planos de corte + orçamento) num arquivo só pro cliente.
  if (resultadoOrcamento.totais_globais) {
    const orientacaoPaginaOrcamento = orientacao === 'paisagem' ? 'landscape' : 'portrait';
    doc.addPage('a4', orientacaoPaginaOrcamento);
    desenharPaginaOrcamento(doc, { resultadoOrcamento, listaPecas, cliente, orientacaoPagina: orientacaoPaginaOrcamento });
  }

  const sufixoEspessura = espessuraFiltro !== undefined ? `-${Number(espessuraFiltro).toFixed(2)}mm` : '';
  const nomeArquivo = `plano-de-corte-${(cliente || 'orcamento').trim().toLowerCase().replace(/\s+/g, '-')}${sufixoEspessura}.pdf`;
  doc.save(nomeArquivo);
}

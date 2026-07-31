// Exportação do nesting em PDF, no padrão industrial "Plano de Corte" (ver
// relatorioIndustrialPdf.js) — este arquivo é o orquestrador ESPECÍFICO do
// GeoQuote: sabe o que é uma "peça"/"espessura"/"chapa" do motor de nesting e
// monta os dados que o template genérico só desenha. Continua vetorial (sem
// html2canvas), reaproveitando a mesma paleta/lógica de furos/contorno usada
// na tela (nestingUtils.js), então o desenho no PDF bate com o da tela.
import { jsPDF } from 'jspdf';
import { corDaPeca, furosAbsolutos, verticesTrianguloAbsolutos, contornoDxfAbsoluto } from './nestingUtils.js';
import {
  MARGEM_PAGINA, desenharCabecalhoIndustrial, desenharBarraTitulo, desenharTituloPlanoDeCorte,
  desenharPainelEspessura, desenharTabelaEspecificacoesChapa, desenharTabelaPecasDoPlano,
  desenharTabelaSobras, desenharRodapeIndustrial,
} from './relatorioIndustrialPdf.js';

const COR_BORDA_CHAPA = '#334155';
const COR_MARGEM_TRACEJADA = '#94A3B8';
const ALTURA_RODAPE_RESERVADA = 10;

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

// Desenha a peça (contorno real do DXF quando disponível, senão retângulo/
// círculo/triângulo) + furos, já posicionada e escalada dentro da área reservada.
function desenharDiagramaChapa(doc, item, chapa, idsUnicosPecas, listaPecas, areaX, areaY, areaW, areaH) {
  const escala = Math.min(areaW / item.chapa_largura, areaH / item.chapa_comprimento);
  const chapaWmm = item.chapa_largura * escala;
  const chapaHmm = item.chapa_comprimento * escala;
  const offsetX = areaX + (areaW - chapaWmm) / 2;
  const offsetY = areaY + (areaH - chapaHmm) / 2;

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

    const px = offsetX + p.x * escala;
    const py = offsetY + p.y * escala;
    const pw = p.width * escala;
    const ph = p.height * escala;

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
        const pontos = perfil.pontos.map((pt) => [offsetX + pt.x * escala, offsetY + pt.y * escala]);
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
      const vertices = verticesTrianguloAbsolutos(p, pecaOriginal).map((v) => ({
        x: offsetX + v.x * escala,
        y: offsetY + v.y * escala,
      }));
      doc.triangle(vertices[0].x, vertices[0].y, vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y, 'FD');
      labelX = (vertices[0].x + vertices[1].x + vertices[2].x) / 3;
      labelY = (vertices[0].y + vertices[1].y + vertices[2].y) / 3;
    } else {
      doc.rect(px, py, pw, ph, 'FD');
    }

    furos.forEach((furo) => {
      if (furo.r <= 0) return;
      doc.setFillColor('#FFFFFF');
      doc.setDrawColor(COR_BORDA_CHAPA);
      doc.setLineWidth(0.15);
      doc.circle(offsetX + furo.cx * escala, offsetY + furo.cy * escala, Math.max(0.3, furo.r * escala), 'FD');
    });

    if (pw > 6 && ph > 4) {
      doc.setFontSize(Math.min(8, Math.max(4, pw * 0.12)));
      doc.setFont(undefined, 'normal');
      doc.setTextColor('#FFFFFF');
      doc.text(String(p.id), labelX, labelY, { align: 'center', baseline: 'middle' });
    }
  });
}

function desenharPaginaDoPlano(doc, { cliente, item, plano, numeroPlano }) {
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
  y = desenharTituloPlanoDeCorte(doc, y, { numero: numeroPlano, multiplicador: plano.multiplicador });

  // Monta a lista de peças deste plano ANTES de desenhar o diagrama, pra poder
  // estimar quanto espaço reservar pras tabelas abaixo (autoTable calcula a
  // altura real só na hora de desenhar — isto é uma aproximação, suficiente
  // pro volume normal de tipos de peça por chapa; planos com dezenas de tipos
  // de peça distintos podem overflow de página, caso não comum).
  const contagemPorId = contarPecasPorId(plano.chapaRepresentante);
  const idsDoPlano = [...contagemPorId.keys()];
  let materialDoPlano = '-';
  const pecasDoPlano = idsDoPlano.map((id, indice) => {
    const pecaOriginal = plano.listaPecas.find((pc) => pc.id === id);
    if (pecaOriginal?.material && materialDoPlano === '-') materialDoPlano = pecaOriginal.material;
    return {
      numero: indice + 1,
      nome: id,
      qtdSolicitada: pecaOriginal?.qtd ?? '-',
      qtdNesting: contagemPorId.get(id),
      pesoLiquidoKg: pecaOriginal?.pesoUnitario ?? '-',
      cliente: cliente || '-',
      tempoCorte: '-',
      ordemProducao: '-',
    };
  });

  const sobras = rotuloSobra
    ? [{
      medida: '—',
      quantidade: plano.multiplicador,
      // Rateio proporcional do agregado de sucata da espessura pelas chapas
      // deste plano específico — não é medição de retalho real (decisão já
      // validada: só um flag/estimativa, sem geometria de sobra).
      pesoUnitarioKg: (item.sucata_peso_kg / Math.max(1, item.chapas_necessarias)).toFixed(2),
      pesoTotalKg: (item.sucata_peso_kg * (plano.multiplicador / Math.max(1, item.chapas_necessarias))).toFixed(2),
    }]
    : [];

  // Estimativa da altura das tabelas que ainda vão ser desenhadas ABAIXO do
  // diagrama (autoTable só calcula a altura real no momento de desenhar) —
  // com folga extra de segurança pra não estourar o rodapé da página.
  const alturaEspecificacoes = 3 * 7.5;
  const alturaPecas = (1 + pecasDoPlano.length) * 9.5;
  const alturaSobras = (1 + Math.max(1, sobras.length)) * 10;
  const alturaReservadaAbaixo = alturaEspecificacoes + alturaPecas + alturaSobras + ALTURA_RODAPE_RESERVADA + 28;

  y += 2;
  const areaDiagramaY = y;
  const areaDiagramaAltura = Math.max(30, pageH - areaDiagramaY - alturaReservadaAbaixo);
  desenharDiagramaChapa(
    doc, item, plano.chapaRepresentante, plano.idsUnicosPecas, plano.listaPecas,
    MARGEM_PAGINA, areaDiagramaY, pageW - MARGEM_PAGINA * 2, areaDiagramaAltura
  );

  y = areaDiagramaY + areaDiagramaAltura + 3;
  const tempoCorteMedioMin = item.tempo_min / Math.max(1, item.chapas_necessarias);
  const utilX = Math.max(0, item.chapa_largura - 2 * item.chapa_margem);
  const utilY = Math.max(0, item.chapa_comprimento - 2 * item.chapa_margem);
  y = desenharTabelaEspecificacoesChapa(doc, y, {
    material: materialDoPlano,
    espessuraMm: Number(item.espessura).toFixed(2),
    chapaLarguraMm: item.chapa_largura,
    chapaComprimentoMm: item.chapa_comprimento,
    tempoCorteMin: tempoCorteMedioMin.toFixed(1),
    utilXMm: utilX.toFixed(0),
    utilYMm: utilY.toFixed(0),
  });

  y += 2;
  y = desenharBarraTitulo(doc, y, 'LISTA DETALHADA DE PEÇAS DO PLANO');
  y = desenharTabelaPecasDoPlano(doc, y, pecasDoPlano);

  y += 2;
  y = desenharBarraTitulo(doc, y, 'SOBRAS RESERVADAS PARA O CLIENTE');
  desenharTabelaSobras(doc, y, sobras);

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
        orientacaoPagina: (paisagemForcada || paisagemAuto) ? 'landscape' : 'portrait',
      });
    });
  });

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: paginas[0].orientacaoPagina });

  paginas.forEach((pagina, indice) => {
    if (indice > 0) doc.addPage('a4', pagina.orientacaoPagina);
    desenharPaginaDoPlano(doc, { cliente, item: pagina.item, plano: pagina.plano, numeroPlano: pagina.numeroPlano, orientacaoPagina: pagina.orientacaoPagina });
  });

  const sufixoEspessura = espessuraFiltro !== undefined ? `-${Number(espessuraFiltro).toFixed(2)}mm` : '';
  const nomeArquivo = `plano-de-corte-${(cliente || 'orcamento').trim().toLowerCase().replace(/\s+/g, '-')}${sufixoEspessura}.pdf`;
  doc.save(nomeArquivo);
}

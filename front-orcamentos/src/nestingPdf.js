// Exportação do nesting em PDF vetorial (sem rasterizar a tela — sem html2canvas).
// Reaproveita a mesma paleta/lógica de furos usada na visualização em SVG (nestingUtils.js),
// então a cor de cada peça no PDF é sempre a mesma que aparece na tela.
import { jsPDF } from 'jspdf';
import { corDaPeca, furosAbsolutos, verticesTrianguloAbsolutos } from './nestingUtils.js';

const COR_LARANJA = '#F97316';
const COR_TEXTO_PRIMARIO = '#0F172A';
const COR_TEXTO_MUTED = '#64748B';
const COR_BORDA_CHAPA = '#334155';
const COR_MARGEM_TRACEJADA = '#94A3B8';
const MARGEM_PAGINA = 15;
const ALTURA_CABECALHO = 30;
const ALTURA_RODAPE = 10;

function formatarData(data) {
  return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function desenharCabecalho(doc, { cliente, item, chapaIndex, totalChapasEspessura }) {
  const pageW = doc.internal.pageSize.width;

  doc.setFillColor(COR_LARANJA);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor('#FFFFFF');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(14);
  doc.text('GeoQuote', MARGEM_PAGINA, 9.5);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.text('Lypsyos — Relatório de Nesting', pageW - MARGEM_PAGINA, 9.5, { align: 'right' });

  doc.setTextColor(COR_TEXTO_PRIMARIO);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(`Cliente: ${cliente || 'Consumidor Final'}`, MARGEM_PAGINA, 21);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(COR_TEXTO_MUTED);
  const linhaInfo = `Espessura ${Number(item.espessura).toFixed(2)}mm  ·  Chapa ${chapaIndex + 1} de ${totalChapasEspessura}  ·  ${item.dimensao_chapa}mm`;
  doc.text(linhaInfo, MARGEM_PAGINA, 27);

  if (item.utilizacao_pct !== undefined) {
    const pageW2 = doc.internal.pageSize.width;
    const rotuloSucata = item.sobra_reservada_cliente ? 'sobra reservada p/ cliente' : 'sucata (espessura)';
    const linhaAproveitamento = `${item.utilizacao_pct}% aproveitamento  ·  ${item.sucata_peso_kg}kg ${rotuloSucata}`;
    doc.text(linhaAproveitamento, pageW2 - MARGEM_PAGINA, 27, { align: 'right' });
  }
}

function desenharRodape(doc) {
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  doc.setDrawColor(COR_MARGEM_TRACEJADA);
  doc.setLineWidth(0.2);
  doc.line(MARGEM_PAGINA, pageH - ALTURA_RODAPE, pageW - MARGEM_PAGINA, pageH - ALTURA_RODAPE);
  doc.setFontSize(7);
  doc.setTextColor(COR_TEXTO_MUTED);
  doc.text(`Emitido em ${formatarData(new Date())}`, MARGEM_PAGINA, pageH - 4);
}

function desenharChapa(doc, item, chapa, idsUnicosPecas, listaPecas) {
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;

  const areaW = pageW - MARGEM_PAGINA * 2;
  const areaH = pageH - ALTURA_CABECALHO - ALTURA_RODAPE - MARGEM_PAGINA;

  const escala = Math.min(areaW / item.chapa_largura, areaH / item.chapa_comprimento);
  const chapaWmm = item.chapa_largura * escala;
  const chapaHmm = item.chapa_comprimento * escala;
  const offsetX = MARGEM_PAGINA + (areaW - chapaWmm) / 2;
  const offsetY = ALTURA_CABECALHO + (areaH - chapaHmm) / 2;

  // Contorno da chapa (fundo branco — impressão, sem gastar tinta)
  doc.setDrawColor(COR_BORDA_CHAPA);
  doc.setLineWidth(0.4);
  doc.setFillColor('#FFFFFF');
  doc.rect(offsetX, offsetY, chapaWmm, chapaHmm, 'FD');

  // Margem útil tracejada
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

    const px = offsetX + p.x * escala;
    const py = offsetY + p.y * escala;
    const pw = p.width * escala;
    const ph = p.height * escala;

    doc.setFillColor(cor);
    doc.setDrawColor(cor);
    doc.setLineWidth(0.3);

    // Desenha o contorno real da peça — mesma lógica de tipoPeca/vértices usada
    // na tela (ContornoPeca em App.jsx) — em vez de sempre um retângulo.
    let labelX = px + pw / 2;
    let labelY = py + ph / 2;

    if (pecaOriginal?.tipoPeca === 'C') {
      doc.circle(px + pw / 2, py + ph / 2, pw / 2, 'FD');
    } else if (pecaOriginal?.tipoPeca === 'T') {
      const vertices = verticesTrianguloAbsolutos(p, pecaOriginal).map((v) => ({
        x: offsetX + v.x * escala,
        y: offsetY + v.y * escala,
      }));
      doc.triangle(vertices[0].x, vertices[0].y, vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y, 'FD');
      // Centroide, não o centro da bounding box — no triângulo 'reto' o centro
      // da bbox cai exatamente sobre a hipotenusa.
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
      doc.setTextColor('#FFFFFF');
      doc.text(String(p.id), labelX, labelY, { align: 'center', baseline: 'middle' });
    }
  });
}

/**
 * Gera e baixa um PDF com uma página por chapa de nesting.
 * @param {object} resultadoOrcamento - retorno de /calcular-orcamento
 * @param {Array} listaPecas - peças do orçamento (para achar tipoFuro/dimensões originais)
 * @param {string} cliente
 * @param {number} [espessuraFiltro] - se informado, exporta só as chapas dessa espessura
 */
export function gerarPdfNesting(resultadoOrcamento, listaPecas, cliente, espessuraFiltro) {
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
    item.nesting.chapas.forEach((chapa, chapaIndex) => {
      paginas.push({
        item, chapa, chapaIndex,
        totalChapasEspessura: item.nesting.chapas.length,
        orientacao: item.chapa_largura >= item.chapa_comprimento ? 'landscape' : 'portrait',
      });
    });
  });

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: paginas[0].orientacao });

  paginas.forEach((pagina, indice) => {
    if (indice > 0) doc.addPage('a4', pagina.orientacao);
    desenharCabecalho(doc, { cliente, item: pagina.item, chapaIndex: pagina.chapaIndex, totalChapasEspessura: pagina.totalChapasEspessura });
    desenharChapa(doc, pagina.item, pagina.chapa, idsUnicosPecas, listaPecas);
    desenharRodape(doc);
  });

  const sufixoEspessura = espessuraFiltro !== undefined ? `-${Number(espessuraFiltro).toFixed(2)}mm` : '';
  const nomeArquivo = `nesting-${(cliente || 'orcamento').trim().toLowerCase().replace(/\s+/g, '-')}${sufixoEspessura}.pdf`;
  doc.save(nomeArquivo);
}

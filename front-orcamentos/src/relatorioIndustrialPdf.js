// Padrão "industrial" de relatório de plano de corte — pensado para ser
// reutilizado por qualquer ferramenta de orçamento do nicho ferro/aço que a
// empresa for construindo, não só o GeoQuote. Por isso este módulo NÃO conhece
// nada de "orçamento"/"nesting"/"peça" do GeoQuote — só desenha seções
// genéricas (cabeçalho, painel de espessura, tabelas) a partir de dados já
// resolvidos em texto/número simples. Quem conhece o domínio do GeoQuote é
// `nestingPdf.js`, que monta os dados e chama estas funções em sequência.
//
// Cada função de seção recebe `doc` (instância jsPDF) + a posição Y atual e
// devolve a próxima posição Y livre, para o chamador encadear as seções.
import autoTable from 'jspdf-autotable';

export const MARGEM_PAGINA = 12;

const COR_PRETO = '#000000';
const COR_CINZA = '#666666';
const LARGURA_LINHA = 0.3;

const ESTILO_BASE_TABELA = {
  theme: 'grid',
  tableLineColor: COR_PRETO,
  tableLineWidth: LARGURA_LINHA,
  styles: { font: 'helvetica', fontSize: 8, textColor: COR_PRETO, cellPadding: 1.8, lineColor: COR_PRETO, lineWidth: LARGURA_LINHA },
};

function formatarDataHora(data) {
  return `${data.toLocaleDateString('pt-BR')} ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// --- Logo: placeholder por padrão, trocável em runtime sem mexer no resto ---
// Pra usar a arte final: chame `configurarLogoRelatorio(dataUrlBase64PNG)` uma
// vez (ex: na inicialização do app) e todo relatório gerado depois passa a
// usar essa imagem em vez do placeholder — nenhuma outra mudança necessária.
let logoDataUrl = null;
let logoFormato = 'PNG';

export function configurarLogoRelatorio(dataUrlBase64, formato = 'PNG') {
  logoDataUrl = dataUrlBase64 || null;
  logoFormato = formato;
}

function desenharLogoPlaceholder(doc, x, y, w, h) {
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, logoFormato, x, y, w, h);
      return;
    } catch {
      // dataUrl inválido/corrompido — cai no placeholder abaixo em vez de quebrar o PDF.
    }
  }
  doc.setDrawColor(COR_CINZA);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(COR_CINZA);
  doc.text('LOGO DA EMPRESA', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' });
}

// Cabeçalho padrão: logo (2 linhas) | Máquina (larga) / Data | Espessura+Processo / Código CNC / Horário.
export function desenharCabecalhoIndustrial(doc, y, { maquina, data, horario, codigoCnc, tituloEspessuraProcesso }) {
  autoTable(doc, {
    ...ESTILO_BASE_TABELA,
    startY: y,
    margin: { left: MARGEM_PAGINA, right: MARGEM_PAGINA, bottom: MARGEM_PAGINA },
    body: [
      [
        { content: '', rowSpan: 2, styles: { cellWidth: 42 } },
        { content: `Máquina: ${maquina || '-'}`, colSpan: 2, styles: { fontStyle: 'bold' } },
        { content: `Data: ${data}`, styles: { fontStyle: 'bold' } },
      ],
      [
        tituloEspessuraProcesso || '-',
        { content: `Código CNC: ${codigoCnc || '-'}`, styles: { fontStyle: 'bold' } },
        { content: `Horário: ${horario || '-'}`, styles: { fontStyle: 'bold' } },
      ],
    ],
    didDrawCell: (info) => {
      if (info.section === 'body' && info.row.index === 0 && info.column.index === 0) {
        desenharLogoPlaceholder(doc, info.cell.x + 1, info.cell.y + 1, info.cell.width - 2, info.cell.height - 2);
      }
    },
  });
  return doc.lastAutoTable.finalY;
}

// Barra de título simples (usada pra "PAINEL DA ESPESSURA...", "PLANO DE
// CORTE N (MX)", "LISTA DETALHADA DE PEÇAS DO PLANO", "SOBRAS RESERVADAS...").
export function desenharBarraTitulo(doc, y, texto) {
  const larguraTotal = doc.internal.pageSize.width - MARGEM_PAGINA * 2;
  const altura = 6.5;
  doc.setDrawColor(COR_PRETO);
  doc.setLineWidth(LARGURA_LINHA);
  doc.rect(MARGEM_PAGINA, y, larguraTotal, altura);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(COR_PRETO);
  doc.text(texto, MARGEM_PAGINA + 2, y + altura / 2 + 1.1);
  return y + altura;
}

// `totalPlanos` (opcional): quantos planos de corte distintos essa espessura
// tem no total — vira "(N-TOTAL)" no título, pra o orçamentista sempre saber
// em qual página está sem precisar contar manualmente (ex: 3 planos numa
// espessura viram "(1-3)", "(2-3)", "(3-3)"). `multiplicador` (chapas físicas
// idênticas repetidas dentro do MESMO plano) continua exibido à parte, quando >1.
export function desenharTituloPlanoDeCorte(doc, y, { numero, totalPlanos, multiplicador }) {
  const posicao = totalPlanos > 1 ? ` (${numero}-${totalPlanos})` : '';
  const repeticao = multiplicador > 1 ? ` (${multiplicador}X)` : '';
  return desenharBarraTitulo(doc, y, `PLANO DE CORTE ${numero}${posicao}${repeticao}`);
}

// Painel-resumo da espessura: Nome do JOB / Nº de chapas, Aproveitamento /
// Sucata (ou "Sobra Reservada", ver `rotuloPercentual`/`rotuloPeso`), Peso
// Chapa / Peso Sucata(-reservada).
export function desenharPainelEspessura(doc, y, {
  titulo, nomeJob, numeroChapasCortar, aproveitamentoPct, sucataPct, pesoChapaKg, pesoSucataKg,
  rotuloPercentual = 'Sucata:', rotuloPeso = 'Peso Sucata:',
}) {
  autoTable(doc, {
    ...ESTILO_BASE_TABELA,
    startY: y,
    margin: { left: MARGEM_PAGINA, right: MARGEM_PAGINA, bottom: MARGEM_PAGINA },
    head: [[{ content: titulo, colSpan: 4, styles: { fontStyle: 'bold', halign: 'left', fontSize: 9 } }]],
    headStyles: { fillColor: '#FFFFFF', textColor: COR_PRETO, lineWidth: LARGURA_LINHA, lineColor: COR_PRETO },
    body: [
      [
        { content: 'Nome do JOB:', styles: { fontStyle: 'bold' } }, nomeJob || '-',
        { content: 'Nº de Chapas serem Cortadas:', styles: { fontStyle: 'bold' } }, String(numeroChapasCortar),
      ],
      [
        { content: 'Aproveitamento:', styles: { fontStyle: 'bold' } }, `${aproveitamentoPct}%`,
        { content: rotuloPercentual, styles: { fontStyle: 'bold' } }, `${sucataPct}%`,
      ],
      [
        { content: 'Peso Chapa:', styles: { fontStyle: 'bold' } }, `${pesoChapaKg} kg`,
        { content: rotuloPeso, styles: { fontStyle: 'bold' } }, `${pesoSucataKg} kg`,
      ],
    ],
  });
  return doc.lastAutoTable.finalY;
}

// Especificações físicas da chapa usada neste plano.
export function desenharTabelaEspecificacoesChapa(doc, y, {
  material, espessuraMm, chapaLarguraMm, chapaComprimentoMm, tempoCorteMin, utilXMm, utilYMm,
}) {
  autoTable(doc, {
    ...ESTILO_BASE_TABELA,
    startY: y,
    margin: { left: MARGEM_PAGINA, right: MARGEM_PAGINA, bottom: MARGEM_PAGINA },
    body: [
      [
        { content: 'Material:', styles: { fontStyle: 'bold' } }, material || '-',
        { content: 'Comp. Chapa:', styles: { fontStyle: 'bold' } }, `${chapaComprimentoMm} mm`,
        { content: 'Útil Chapa X:', styles: { fontStyle: 'bold' } }, `${utilXMm} mm`,
      ],
      [
        { content: 'Espessura:', styles: { fontStyle: 'bold' } }, `${espessuraMm} mm`,
        { content: 'Largura Chapa:', styles: { fontStyle: 'bold' } }, `${chapaLarguraMm} mm`,
        { content: 'Útil Chapa Y:', styles: { fontStyle: 'bold' } }, `${utilYMm} mm`,
      ],
      [
        { content: 'Chapa:', styles: { fontStyle: 'bold' } }, `${chapaLarguraMm} x ${chapaComprimentoMm} mm`,
        { content: 'Tempo Corte:', styles: { fontStyle: 'bold' } }, `${tempoCorteMin} min`,
        '', '',
      ],
    ],
  });
  return doc.lastAutoTable.finalY;
}

// Lista detalhada de peças do plano. `pecas`: [{numero, nome, qtdSolicitada,
// qtdNesting, pesoLiquidoKg, cliente, tempoCorte, ordemProducao}]. A coluna
// "Imagem" desenha um placeholder vazio por padrão; passe `renderizarImagem(doc,
// pecaDaLinha, x, y, w, h)` pra desenhar a forma real da peça em cada célula
// (o "o quê" desenhar é decisão do chamador — este módulo continua sem
// conhecer nada de DXF/contorno, só oferece o gancho).
export function desenharTabelaPecasDoPlano(doc, y, pecas, { renderizarImagem } = {}) {
  autoTable(doc, {
    ...ESTILO_BASE_TABELA,
    startY: y,
    margin: { left: MARGEM_PAGINA, right: MARGEM_PAGINA, bottom: MARGEM_PAGINA },
    showHead: 'everyPage',
    styles: { ...ESTILO_BASE_TABELA.styles, fontSize: 7.5, halign: 'center' },
    headStyles: { fillColor: '#FFFFFF', textColor: COR_PRETO, lineWidth: LARGURA_LINHA, lineColor: COR_PRETO, fontStyle: 'bold' },
    head: [['Imagem', 'Número da Peça', 'Nome da Peça', 'Qtd Solicitada', 'Qtd Nesting', 'Peso Líquido (KG)', 'Cliente', 'Tempo de Corte', 'Ordem de Produção']],
    body: pecas.map((p) => [
      '', String(p.numero), p.nome, String(p.qtdSolicitada), String(p.qtdNesting),
      p.pesoLiquidoKg, p.cliente || '-', p.tempoCorte || '-', p.ordemProducao || '-',
    ]),
    columnStyles: { 2: { halign: 'left' } },
    didDrawCell: (info) => {
      if (info.section !== 'body' || info.column.index !== 0) return;
      const pad = 1.3;
      const cellX = info.cell.x + pad;
      const cellY = info.cell.y + pad;
      const cellW = info.cell.width - pad * 2;
      const cellH = info.cell.height - pad * 2;
      const pecaDaLinha = pecas[info.row.index];
      if (renderizarImagem && pecaDaLinha) {
        renderizarImagem(doc, pecaDaLinha, cellX, cellY, cellW, cellH);
      } else {
        doc.setDrawColor(COR_CINZA);
        doc.setLineWidth(0.2);
        doc.rect(cellX, cellY, cellW, cellH);
      }
    },
  });
  return doc.lastAutoTable.finalY;
}

// Sobras reservadas para o cliente. `sobras`: [{medida, quantidade,
// pesoUnitarioKg, pesoTotalKg}] — lista vazia mostra `mensagemVazia` (ex:
// "Nenhuma sobra aproveitável neste plano." ou "A sobra ficará na empresa.",
// dependendo se o cliente pediu a sobra ou não — decisão do chamador).
export function desenharTabelaSobras(doc, y, sobras, mensagemVazia = 'Nenhuma sobra aproveitável neste plano.') {
  autoTable(doc, {
    ...ESTILO_BASE_TABELA,
    startY: y,
    margin: { left: MARGEM_PAGINA, right: MARGEM_PAGINA, bottom: MARGEM_PAGINA },
    showHead: 'everyPage',
    styles: { ...ESTILO_BASE_TABELA.styles, halign: 'center' },
    headStyles: { fillColor: '#FFFFFF', textColor: COR_PRETO, lineWidth: LARGURA_LINHA, lineColor: COR_PRETO, fontStyle: 'bold' },
    head: [['Medida (L x A mm)', 'Quantidade', 'Peso Unitário (kg)', 'Peso Total (kg)']],
    body: sobras.length > 0
      ? sobras.map((s) => [s.medida, String(s.quantidade), s.pesoUnitarioKg, s.pesoTotalKg])
      : [[{ content: mensagemVazia, colSpan: 4, styles: { halign: 'left', textColor: COR_CINZA, fontStyle: 'italic' } }]],
  });
  return doc.lastAutoTable.finalY;
}

// Tabela genérica de pares "rótulo: valor" (linhas com 2 ou 4 colunas,
// alternando rótulo/valor) — pra telas de resumo que não têm uma seção fixa
// própria no padrão (ex: página de orçamento). Rótulos (índices pares) saem
// em negrito automaticamente.
export function desenharTabelaChavesValores(doc, y, linhas) {
  autoTable(doc, {
    ...ESTILO_BASE_TABELA,
    startY: y,
    margin: { left: MARGEM_PAGINA, right: MARGEM_PAGINA, bottom: MARGEM_PAGINA },
    body: linhas.map((linha) => linha.map((celula, indice) => (
      indice % 2 === 0 && typeof celula !== 'object'
        ? { content: celula, styles: { fontStyle: 'bold' } }
        : celula
    ))),
  });
  return doc.lastAutoTable.finalY;
}

export function desenharRodapeIndustrial(doc) {
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  doc.setDrawColor(COR_CINZA);
  doc.setLineWidth(0.2);
  doc.line(MARGEM_PAGINA, pageH - 8, pageW - MARGEM_PAGINA, pageH - 8);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(COR_CINZA);
  doc.text(`Emitido em ${formatarDataHora(new Date())}`, MARGEM_PAGINA, pageH - 4);
  doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, pageW - MARGEM_PAGINA, pageH - 4, { align: 'right' });
}

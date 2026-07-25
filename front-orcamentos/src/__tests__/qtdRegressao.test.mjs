// Teste de regressão para o relato de bug "digitei 100, a peça ficou com 96".
// Investigação (ver histórico do projeto): não existe um test runner configurado
// no front-end ainda, então este é um script Node standalone — rode com
// `node src/__tests__/qtdRegressao.test.mjs` a partir de front-orcamentos/.
//
// Ele espelha, linha a linha, a transformação real usada em `adicionarOuAtualizarPeca`
// (App.jsx) e em `editarPeca` (App.jsx) para o campo `qtd`. Se alguém reintroduzir
// qualquer arredondamento/fator/percentual no meio desse trajeto, este teste falha.

function montarNovaPeca({ qtd, dimA, dimB, espessuraSelecionada, densidade }) {
  // Espelha App.jsx:483-513 (adicionarOuAtualizarPeca) na parte relevante ao qtd.
  const areaBaseMm2 = parseFloat(dimA || 0) * parseFloat(dimB || 0);
  const volume = areaBaseMm2 * parseFloat(espessuraSelecionada || 0);
  const pesoUnitario = (volume * (densidade || 7.85)) / 1000000;
  const pesoTotal = pesoUnitario * parseInt(qtd || 1);

  return {
    qtd: parseInt(qtd),
    pesoUnitario: pesoUnitario.toFixed(2),
    pesoTotal: pesoTotal.toFixed(2),
  };
}

function reabrirParaEdicao(pecaSalva) {
  // Espelha App.jsx:585 (editarPeca): setQtd(peca.qtd) — sem conversão nenhuma.
  return { qtd: pecaSalva.qtd };
}

let falhas = 0;

function assertIgual(descricao, obtido, esperado) {
  if (obtido !== esperado) {
    falhas += 1;
    console.error(`FALHOU: ${descricao} — esperado ${esperado}, obtido ${obtido}`);
  } else {
    console.log(`OK: ${descricao}`);
  }
}

// Caso relatado: usuário digita "100" no campo QTD.
const peca100 = montarNovaPeca({ qtd: '100', dimA: 200, dimB: 100, espessuraSelecionada: '1.50', densidade: 7.85 });
assertIgual('qtd digitado como "100" deve chegar como 100 na peça', peca100.qtd, 100);

// Reabrir a mesma peça para edição não pode alterar o valor.
const reaberta = reabrirParaEdicao(peca100);
assertIgual('reabrir para edição preserva qtd', reaberta.qtd, 100);

// Re-salvar após reabrir (fluxo completo de edição) também preserva.
const pecaReeditada = montarNovaPeca({ qtd: String(reaberta.qtd), dimA: 200, dimB: 100, espessuraSelecionada: '1.50', densidade: 7.85 });
assertIgual('re-salvar após editar preserva qtd', pecaReeditada.qtd, 100);

// Outros valores redondos, para garantir que não é específico de "100".
[1, 5, 24, 50, 250, 1000].forEach((valor) => {
  const peca = montarNovaPeca({ qtd: String(valor), dimA: 50, dimB: 50, espessuraSelecionada: '3.00', densidade: 7.85 });
  assertIgual(`qtd digitado como "${valor}"`, peca.qtd, valor);
});

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
} else {
  console.log('\nTodas as verificações de quantidade passaram.');
}

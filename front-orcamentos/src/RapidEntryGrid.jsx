import React, { useRef, useState } from 'react';
import { construirPeca, linhaEstaValida } from './pecaUtils.js';

// Entrada Rápida: grade estilo planilha pra cadastrar várias peças em sequência
// só com o teclado (Tab entre colunas, Enter pula pra próxima linha / cria uma
// nova). As linhas ficam num estágio local (não entram em listaPecas ainda) —
// só viram peças de verdade quando o usuário clica "Adicionar" no rodapé, o
// que evita que uma linha pela metade contamine o cálculo de orçamento.

let contadorLinhas = 0;
function criarLinha(overrides = {}) {
  contadorLinhas += 1;
  return {
    key: `linha-${Date.now()}-${contadorLinhas}`,
    id: '', qtd: '1', tipoPeca: 'R', tipoTriangulo: 'reto',
    dimA: '', dimB: '', dimC: '',
    maquina: '', material: '', espessura: '',
    tipoFuro: 'manual', nFuros: '', diaFuro: '', furoOffsetX: '', furoOffsetY: '',
    dxfImportado: false, dxfPreviewSvg: null, dxfAreaUtilMm2: 0, dxfPerimetroCorteMm: 0, dxfContorno: null,
    ...overrides,
  };
}

function maquinasDaLista(params) {
  return [...new Set(params.map((p) => p.maquina))];
}
function materiaisDaMaquina(params, maquina) {
  return [...new Set(params.filter((p) => p.maquina === maquina).map((p) => p.material))];
}
function espessurasDoMaterial(params, maquina, material) {
  return params.filter((p) => p.maquina === maquina && p.material === material).map((p) => p.espessura.toFixed(2));
}
function parametroDaLinha(params, materiais, linha) {
  const maquinaParam = params.find(
    (p) => p.maquina === linha.maquina && p.material === linha.material && p.espessura.toFixed(2) === linha.espessura
  );
  const materialItem = materiais.find((m) => m.nome === linha.material && m.espessura.toFixed(2) === linha.espessura);
  return maquinaParam && materialItem ? { ...maquinaParam, precoKg: materialItem.precoKg, densidade: materialItem.densidade } : null;
}

function focarCampo(key, campo) {
  requestAnimationFrame(() => {
    document.getElementById(`re-${key}-${campo}`)?.focus();
  });
}

// Parser de CSV simples (sem escaping de vírgula/aspas) — suficiente pro caso
// de uso interno: cabeçalho `id,geometria,tipoTriangulo,dimA,dimB,qtd,maquina,material,espessura`.
function parseCsvPecas(texto) {
  const linhasTexto = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhasTexto.length < 2) return [];
  const cabecalho = linhasTexto[0].split(',').map((h) => h.trim());
  return linhasTexto.slice(1).map((linhaTexto) => {
    const valores = linhaTexto.split(',').map((v) => v.trim());
    const obj = {};
    cabecalho.forEach((campo, i) => { obj[campo] = valores[i] ?? ''; });
    return criarLinha({
      id: obj.id || '',
      qtd: obj.qtd || '1',
      tipoPeca: obj.geometria || 'R',
      tipoTriangulo: obj.tipoTriangulo || 'reto',
      dimA: obj.dimA || '',
      dimB: obj.dimB || '',
      maquina: obj.maquina || '',
      material: obj.material || '',
      espessura: obj.espessura || '',
    });
  });
}

// Parser de JSON: aceita um array de peças ou `{ "pecas": [...] }`. Mais expressivo
// que o CSV — permite mandar também furação (tipoFuro/nFuros/diaFuro/offsets).
// Retorna null quando o JSON é inválido/não reconhecível (distinto de "vazio").
function parseJsonPecas(texto) {
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    return null;
  }
  const lista = Array.isArray(dados) ? dados : (Array.isArray(dados?.pecas) ? dados.pecas : null);
  if (!lista) return null;

  return lista.map((item) => criarLinha({
    id: item.id || item.identificador || '',
    qtd: String(item.qtd ?? item.quantidade ?? 1),
    tipoPeca: item.geometria || item.tipoPeca || 'R',
    tipoTriangulo: item.tipoTriangulo || 'reto',
    dimA: item.dimA != null ? String(item.dimA) : '',
    dimB: item.dimB != null ? String(item.dimB) : '',
    dimC: item.dimC != null ? String(item.dimC) : '',
    maquina: item.maquina || '',
    material: item.material || '',
    espessura: item.espessura != null ? Number(item.espessura).toFixed(2) : '',
    tipoFuro: item.tipoFuro || 'manual',
    nFuros: item.nFuros != null ? String(item.nFuros) : '',
    diaFuro: item.diaFuro != null ? String(item.diaFuro) : '',
    furoOffsetX: item.furoOffsetX != null ? String(item.furoOffsetX) : '',
    furoOffsetY: item.furoOffsetY != null ? String(item.furoOffsetY) : '',
  }));
}

export default function RapidEntryGrid({ maquinasParamsOrdenados, listaMateriais, maquinaPadrao, materialPadrao, espessuraPadrao, onAdicionarPecas }) {
  const [linhas, setLinhas] = useState(() => [
    criarLinha({ maquina: maquinaPadrao || '', material: materialPadrao || '', espessura: espessuraPadrao || '' }),
  ]);
  const [furoAbertoKey, setFuroAbertoKey] = useState(null);
  const [isImportandoDxf, setIsImportandoDxf] = useState(false);
  const [dxfPreviewAberto, setDxfPreviewAberto] = useState(null); // { id, svg } | null
  // Seleção múltipla de linhas — hoje só usada pra edição em massa da Máquina
  // (marcar N linhas e mudar a Máquina de UMA delas reflete em todas as marcadas).
  const [linhasSelecionadas, setLinhasSelecionadas] = useState(() => new Set());
  const inputCsvRef = useRef(null);
  const inputJsonRef = useRef(null);
  const inputDxfRef = useRef(null);

  const maquinasDisponiveis = maquinasDaLista(maquinasParamsOrdenados).length > 0
    ? maquinasDaLista(maquinasParamsOrdenados) : ['LASER', 'PLASMA'];

  // Edição em massa: quando o campo é "maquina" e a linha editada faz parte de
  // uma seleção com mais de 1 linha marcada, o valor novo se aplica a TODAS as
  // linhas marcadas (não só à que dispara o onChange) — cada uma recalculando
  // seu próprio material/espessura padrão pra máquina nova, igual ao caso de
  // linha única. Outros campos continuam editando só a linha em questão.
  const atualizarLinha = (key, campo, valor) => {
    const emMassa = campo === 'maquina' && linhasSelecionadas.has(key) && linhasSelecionadas.size > 1;
    const chavesAlvo = emMassa ? linhasSelecionadas : new Set([key]);

    setLinhas((prev) => prev.map((l) => {
      if (!chavesAlvo.has(l.key)) return l;
      const atualizado = { ...l, [campo]: valor };

      if (campo === 'maquina') {
        const materiaisPossiveis = materiaisDaMaquina(maquinasParamsOrdenados, valor);
        atualizado.material = materiaisPossiveis[0] || '';
        const esp = espessurasDoMaterial(maquinasParamsOrdenados, valor, atualizado.material);
        atualizado.espessura = esp[0] || '';
      }
      if (campo === 'material') {
        const esp = espessurasDoMaterial(maquinasParamsOrdenados, atualizado.maquina, valor);
        atualizado.espessura = esp[0] || '';
      }
      if (campo === 'tipoPeca' && (valor === 'C' || valor === 'T') && atualizado.tipoFuro !== 'manual') {
        atualizado.tipoFuro = 'manual';
        atualizado.nFuros = '';
      }
      if (campo === 'tipoFuro') {
        if (valor === 'auto_4') atualizado.nFuros = '4';
        else if (valor === 'auto_6') atualizado.nFuros = '6';
        else if (valor === 'auto_8') atualizado.nFuros = '8';
        else atualizado.nFuros = '';
      }
      return atualizado;
    }));
  };

  const alternarSelecaoLinha = (key) => {
    setLinhasSelecionadas((prev) => {
      const novo = new Set(prev);
      if (novo.has(key)) novo.delete(key); else novo.add(key);
      return novo;
    });
  };

  const todasLinhasSelecionadas = linhas.length > 0 && linhas.every((l) => linhasSelecionadas.has(l.key));
  const alternarSelecaoTodas = () => {
    setLinhasSelecionadas(todasLinhasSelecionadas ? new Set() : new Set(linhas.map((l) => l.key)));
  };

  const adicionarLinha = (baseKey) => {
    const base = linhas.find((l) => l.key === baseKey);
    const nova = criarLinha({
      maquina: base?.maquina || '', material: base?.material || '', espessura: base?.espessura || '',
      tipoPeca: base?.tipoPeca || 'R', tipoTriangulo: base?.tipoTriangulo || 'reto',
    });
    setLinhas((prev) => [...prev, nova]);
    return nova.key;
  };

  const duplicarLinha = (key) => {
    setLinhas((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      if (idx === -1) return prev;
      const nova = { ...prev[idx], key: criarLinha().key };
      return [...prev.slice(0, idx + 1), nova, ...prev.slice(idx + 1)];
    });
  };

  const removerLinha = (key) => {
    setLinhas((prev) => prev.filter((l) => l.key !== key));
    if (furoAbertoKey === key) setFuroAbertoKey(null);
    setLinhasSelecionadas((prev) => {
      if (!prev.has(key)) return prev;
      const novo = new Set(prev);
      novo.delete(key);
      return novo;
    });
  };

  const handleEnterNaLinha = (key) => {
    const idx = linhas.findIndex((l) => l.key === key);
    const proxima = linhas[idx + 1];
    if (proxima) {
      focarCampo(proxima.key, 'id');
    } else {
      const novaKey = adicionarLinha(key);
      focarCampo(novaKey, 'id');
    }
  };

  const handleKeyDownCelula = (e, key) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleEnterNaLinha(key);
  };

  const linhasComEstado = linhas.map((linha) => {
    const parametro = parametroDaLinha(maquinasParamsOrdenados, listaMateriais, linha);
    return { linha, parametro, valida: linhaEstaValida(linha, parametro) };
  });
  const totalProntas = linhasComEstado.filter((l) => l.valida).length;
  const totalPendentes = linhasComEstado.length - totalProntas;

  const commitar = () => {
    const prontas = linhasComEstado.filter((l) => l.valida);
    if (prontas.length === 0) return;

    const pecas = prontas.map(({ linha, parametro }) => construirPeca({
      id: linha.id, qtd: linha.qtd, tipoPeca: linha.tipoPeca, tipoTriangulo: linha.tipoTriangulo, maquina: linha.maquina,
      dimA: linha.dimA, dimB: linha.dimB, dimC: linha.dimC,
      tipoFuro: linha.tipoFuro, nFuros: linha.nFuros, diaFuro: linha.diaFuro,
      furoOffsetX: linha.furoOffsetX, furoOffsetY: linha.furoOffsetY,
      dxfImportado: linha.dxfImportado, dxfAreaUtilMm2: linha.dxfAreaUtilMm2, dxfPerimetroCorteMm: linha.dxfPerimetroCorteMm,
      dxfPreviewSvg: linha.dxfPreviewSvg, dxfContorno: linha.dxfContorno,
    }, parametro));

    onAdicionarPecas(pecas);

    const chavesProntas = new Set(prontas.map((p) => p.linha.key));
    setLinhas((prev) => {
      const restantes = prev.filter((l) => !chavesProntas.has(l.key));
      if (restantes.length > 0) return restantes;
      const ultima = prontas[prontas.length - 1].linha;
      return [criarLinha({
        maquina: ultima.maquina, material: ultima.material, espessura: ultima.espessura,
        tipoPeca: ultima.tipoPeca, tipoTriangulo: ultima.tipoTriangulo,
      })];
    });
    setLinhasSelecionadas((prev) => {
      if (![...chavesProntas].some((k) => prev.has(k))) return prev;
      const novo = new Set(prev);
      chavesProntas.forEach((k) => novo.delete(k));
      return novo;
    });
  };

  const handleImportarCsv = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const novasLinhas = parseCsvPecas(String(reader.result || ''));
      if (novasLinhas.length === 0) {
        alert('CSV vazio ou sem linhas de dados reconhecíveis. Cabeçalho esperado: id,geometria,tipoTriangulo,dimA,dimB,qtd,maquina,material,espessura');
        return;
      }
      setLinhas((prev) => [...prev, ...novasLinhas]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportarJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const novasLinhas = parseJsonPecas(String(reader.result || ''));
      if (novasLinhas === null) {
        alert('JSON inválido. Envie um array de peças (ou { "pecas": [...] }) com campos como id, geometria, dimA, dimB, qtd, maquina, material, espessura.');
        return;
      }
      if (novasLinhas.length === 0) {
        alert('JSON sem peças reconhecíveis.');
        return;
      }
      setLinhas((prev) => [...prev, ...novasLinhas]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Cada DXF selecionado vira uma linha própria já preenchida (identificador =
  // nome do arquivo, dimA/dimB/furos vindos do bounding box lido pelo backend),
  // igual ao comportamento de importação múltipla do Formulário em App.jsx.
  const handleImportarDxf = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setIsImportandoDxf(true);
    const novasLinhas = [];
    const falhas = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const resposta = await fetch('http://localhost:8000/processar-dxf', { method: 'POST', body: formData });
        const dados = await resposta.json();

        if (!dados.sucesso) {
          falhas.push(`${file.name}: ${dados.erro || 'erro desconhecido'}`);
          continue;
        }

        novasLinhas.push(criarLinha({
          id: file.name.replace(/\.dxf$/i, ''),
          dimA: String(dados.dimA ?? ''),
          dimB: String(dados.dimB ?? ''),
          nFuros: dados.nFuros ? String(dados.nFuros) : '',
          diaFuro: dados.diaFuro ? String(dados.diaFuro) : '',
          maquina: maquinaPadrao || '', material: materialPadrao || '', espessura: espessuraPadrao || '',
          dxfImportado: true,
          dxfPreviewSvg: dados.svgMarkup || null,
          dxfAreaUtilMm2: Number(dados.areaUtilMm2 || 0),
          dxfPerimetroCorteMm: Number(dados.perimetroCorteMm || 0),
          dxfContorno: dados.contorno || null,
        }));
      } catch {
        falhas.push(`${file.name}: falha de rede`);
      }
    }

    if (novasLinhas.length > 0) {
      setLinhas((prev) => [...prev, ...novasLinhas]);
    }
    setIsImportandoDxf(false);
    if (falhas.length > 0) {
      alert(`${novasLinhas.length} DXF(s) importado(s). Falha(s):\n${falhas.join('\n')}`);
    }
  };

  const inputCls = 'input-field w-full rounded px-1.5 py-1 text-[11px]';
  const inputInvalidoCls = 'border-red-500/70 focus:border-red-500';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => adicionarLinha(linhas[linhas.length - 1]?.key)} className="text-[10px] bg-slate-900/5 dark:bg-white/10 surface-body px-2.5 py-1.5 rounded-full font-bold hover:bg-slate-900/10 dark:hover:bg-white/20">
            + Adicionar Linha
          </button>
          <button type="button" onClick={() => inputCsvRef.current?.click()} className="text-[10px] bg-slate-900/5 dark:bg-white/10 surface-body px-2.5 py-1.5 rounded-full font-bold hover:bg-slate-900/10 dark:hover:bg-white/20">
            ⇪ Importar CSV
          </button>
          <input ref={inputCsvRef} type="file" accept=".csv,text/csv" onChange={handleImportarCsv} className="hidden" />
          <button type="button" onClick={() => inputJsonRef.current?.click()} className="text-[10px] bg-slate-900/5 dark:bg-white/10 surface-body px-2.5 py-1.5 rounded-full font-bold hover:bg-slate-900/10 dark:hover:bg-white/20">
            ⇪ Importar JSON
          </button>
          <input ref={inputJsonRef} type="file" accept=".json,application/json" onChange={handleImportarJson} className="hidden" />
          <button type="button" onClick={() => inputDxfRef.current?.click()} disabled={isImportandoDxf} className="text-[10px] bg-slate-900/5 dark:bg-white/10 surface-body px-2.5 py-1.5 rounded-full font-bold hover:bg-slate-900/10 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed">
            {isImportandoDxf ? 'Analisando DXF...' : '⇪ Importar DXF'}
          </button>
          <input ref={inputDxfRef} type="file" accept=".dxf" multiple onChange={handleImportarDxf} className="hidden" />
          <button type="button" disabled title="Em breve: importação de planilhas .xlsx" className="text-[10px] bg-slate-900/5 dark:bg-white/10 surface-muted px-2.5 py-1.5 rounded-full font-bold opacity-50 cursor-not-allowed">
            ⇪ Importar Excel (em breve)
          </button>
        </div>
        <span className="text-[10px] font-bold surface-muted">
          {totalProntas} pronta{totalProntas === 1 ? '' : 's'}
          {totalPendentes > 0 && <span className="text-amber-500 dark:text-amber-400"> · {totalPendentes} pendente{totalPendentes === 1 ? '' : 's'}</span>}
        </span>
      </div>

      {linhasSelecionadas.size > 1 && (
        <div className="flex items-center gap-2 text-[10px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2.5 py-1.5 rounded-full w-fit">
          <span>{linhasSelecionadas.size} linhas marcadas — mude a Máquina de uma delas pra aplicar em todas</span>
          <button type="button" onClick={() => setLinhasSelecionadas(new Set())} className="underline hover:no-underline">Limpar seleção</button>
        </div>
      )}

      <div className="overflow-x-auto scrollbar-thin surface-card-inset rounded-lg">
        <table className="w-full text-left min-w-[1100px] border-collapse">
          <thead className="text-[9px] font-bold uppercase tracking-wider surface-muted">
            <tr>
              <th className="p-1.5 w-8">
                <input
                  type="checkbox"
                  checked={todasLinhasSelecionadas}
                  onChange={alternarSelecaoTodas}
                  title="Selecionar todas as linhas"
                  className="w-3.5 h-3.5 accent-orange-500"
                />
              </th>
              <th className="p-1.5 min-w-[90px]">Identificador</th>
              <th className="p-1.5 min-w-[90px]">Geometria</th>
              <th className="p-1.5 min-w-[90px]">Tipo Δ</th>
              <th className="p-1.5 min-w-[75px]">Dim A</th>
              <th className="p-1.5 min-w-[75px]">Dim B</th>
              <th className="p-1.5 min-w-[55px]">Qtd</th>
              <th className="p-1.5 min-w-[95px]">Máquina</th>
              <th className="p-1.5 min-w-[110px]">Material</th>
              <th className="p-1.5 min-w-[80px]">Esp.</th>
              <th className="p-1.5 min-w-[70px]">Furos</th>
              <th className="p-1.5 min-w-[70px] text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhasComEstado.map(({ linha, parametro, valida }) => {
              const materiaisDaLinha = materiaisDaMaquina(maquinasParamsOrdenados, linha.maquina);
              const espessurasDaLinha = espessurasDoMaterial(maquinasParamsOrdenados, linha.maquina, linha.material);
              const idInvalido = !linha.id.trim();
              const qtdInvalida = !(parseInt(linha.qtd) > 0);
              const dimAInvalida = !(parseFloat(linha.dimA) > 0);
              const dimBInvalida = linha.tipoPeca !== 'C' && !(parseFloat(linha.dimB) > 0);
              const semParametro = !parametro;
              const nFurosAtual = linha.tipoFuro === 'manual' ? (parseInt(linha.nFuros) || 0) : (parseInt(linha.nFuros) || 0);

              const selecionada = linhasSelecionadas.has(linha.key);

              return (
                <React.Fragment key={linha.key}>
                  <tr className={`border-t border-slate-200 dark:border-white/10 ${selecionada ? 'bg-orange-500/10' : valida ? '' : 'bg-amber-500/5'}`}>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={selecionada}
                        onChange={() => alternarSelecaoLinha(linha.key)}
                        className="w-3.5 h-3.5 accent-orange-500"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        id={`re-${linha.key}-id`}
                        type="text" value={linha.id} placeholder="PC-01"
                        onChange={(e) => atualizarLinha(linha.key, 'id', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={`${inputCls} ${idInvalido ? inputInvalidoCls : ''}`}
                      />
                      {linha.dxfImportado && <span className="block text-[8px] font-black text-orange-500 mt-0.5">⛭ DXF</span>}
                    </td>
                    <td className="p-1">
                      <select
                        id={`re-${linha.key}-tipoPeca`}
                        value={linha.tipoPeca}
                        onChange={(e) => atualizarLinha(linha.key, 'tipoPeca', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={inputCls}
                      >
                        <option value="R">Retangular</option>
                        <option value="Q">Quadrado</option>
                        <option value="C">Círculo</option>
                        <option value="T">Triângulo</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <select
                        id={`re-${linha.key}-tipoTriangulo`}
                        value={linha.tipoTriangulo}
                        disabled={linha.tipoPeca !== 'T'}
                        onChange={(e) => atualizarLinha(linha.key, 'tipoTriangulo', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={inputCls}
                      >
                        <option value="reto">Reto</option>
                        <option value="isosceles">Isósceles</option>
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        id={`re-${linha.key}-dimA`}
                        type="number" value={linha.dimA} placeholder={linha.tipoPeca === 'C' ? 'Ø' : 'X'}
                        disabled={linha.dxfImportado}
                        onChange={(e) => atualizarLinha(linha.key, 'dimA', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={`${inputCls} ${dimAInvalida ? inputInvalidoCls : ''}`}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        id={`re-${linha.key}-dimB`}
                        type="number" value={linha.tipoPeca === 'C' ? '' : linha.dimB} placeholder="Y"
                        disabled={linha.tipoPeca === 'C' || linha.dxfImportado}
                        onChange={(e) => atualizarLinha(linha.key, 'dimB', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={`${inputCls} ${dimBInvalida ? inputInvalidoCls : ''}`}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        id={`re-${linha.key}-qtd`}
                        type="number" min="1" value={linha.qtd}
                        onChange={(e) => atualizarLinha(linha.key, 'qtd', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={`${inputCls} ${qtdInvalida ? inputInvalidoCls : ''}`}
                      />
                    </td>
                    <td className="p-1">
                      <select
                        id={`re-${linha.key}-maquina`}
                        value={linha.maquina}
                        onChange={(e) => atualizarLinha(linha.key, 'maquina', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={inputCls}
                      >
                        <option value="">—</option>
                        {maquinasDisponiveis.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <select
                        id={`re-${linha.key}-material`}
                        value={linha.material}
                        onChange={(e) => atualizarLinha(linha.key, 'material', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={`${inputCls} ${materiaisDaLinha.length === 0 ? inputInvalidoCls : ''}`}
                      >
                        {materiaisDaLinha.length === 0 ? <option value="">Sem material</option> : materiaisDaLinha.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <select
                        id={`re-${linha.key}-espessura`}
                        value={linha.espessura}
                        onChange={(e) => atualizarLinha(linha.key, 'espessura', e.target.value)}
                        onKeyDown={(e) => handleKeyDownCelula(e, linha.key)}
                        className={`${inputCls} ${semParametro ? inputInvalidoCls : ''}`}
                      >
                        {espessurasDaLinha.length === 0 ? <option value="">—</option> : espessurasDaLinha.map((esp) => <option key={esp} value={esp}>{esp}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <button
                        type="button"
                        onClick={() => setFuroAbertoKey((prev) => (prev === linha.key ? null : linha.key))}
                        className={`w-full text-[10px] font-bold px-1.5 py-1 rounded ${furoAbertoKey === linha.key ? 'bg-orange-500 text-white' : 'bg-slate-900/5 dark:bg-white/10 surface-body hover:bg-slate-900/10 dark:hover:bg-white/20'}`}
                      >
                        {nFurosAtual > 0 ? `⚬ ${nFurosAtual}` : '⚬ furos'}
                      </button>
                    </td>
                    <td className="p-1 text-right whitespace-nowrap">
                      {linha.dxfImportado && (
                        <button type="button" title="Ver DXF importado" onClick={() => setDxfPreviewAberto({ id: linha.id, svg: linha.dxfPreviewSvg })} className="text-[11px] px-1.5 py-1 rounded text-orange-500 hover:bg-orange-500/10">👁</button>
                      )}
                      <button type="button" title="Duplicar linha" onClick={() => duplicarLinha(linha.key)} className="text-[11px] px-1.5 py-1 rounded hover:bg-slate-900/10 dark:hover:bg-white/10">⎘</button>
                      <button type="button" title="Remover linha" onClick={() => removerLinha(linha.key)} className="text-[11px] px-1.5 py-1 rounded text-red-500 hover:bg-red-500/10">✕</button>
                    </td>
                  </tr>

                  {furoAbertoKey === linha.key && (
                    <tr className="bg-black/10 dark:bg-black/30">
                      <td colSpan={12} className="p-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="block text-[9px] font-semibold surface-muted">Tipo de Furo</label>
                            <select
                              value={linha.tipoFuro}
                              onChange={(e) => atualizarLinha(linha.key, 'tipoFuro', e.target.value)}
                              className={`${inputCls} min-w-[150px]`}
                            >
                              <option value="manual">Manual</option>
                              {linha.tipoPeca !== 'C' && linha.tipoPeca !== 'T' && (
                                <>
                                  <option value="auto_4">Automático (4 Furos)</option>
                                  <option value="auto_6">Automático (6 Furos)</option>
                                  <option value="auto_8">Automático (8 Furos)</option>
                                </>
                              )}
                            </select>
                          </div>
                          {linha.tipoFuro === 'manual' ? (
                            <div>
                              <label className="block text-[9px] font-semibold surface-muted">Nº Furos</label>
                              <input type="number" min="0" value={linha.nFuros} onChange={(e) => atualizarLinha(linha.key, 'nFuros', e.target.value)} className={`${inputCls} w-20`} />
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="block text-[9px] font-semibold surface-muted">Offset X</label>
                                <input type="number" min="0" value={linha.furoOffsetX} onChange={(e) => atualizarLinha(linha.key, 'furoOffsetX', e.target.value)} className={`${inputCls} w-20`} />
                              </div>
                              <div>
                                <label className="block text-[9px] font-semibold surface-muted">Offset Y</label>
                                <input type="number" min="0" value={linha.furoOffsetY} onChange={(e) => atualizarLinha(linha.key, 'furoOffsetY', e.target.value)} className={`${inputCls} w-20`} />
                              </div>
                            </>
                          )}
                          <div>
                            <label className="block text-[9px] font-semibold surface-muted">Ø Furo</label>
                            <input type="number" min="0" step="0.1" value={linha.diaFuro} onChange={(e) => atualizarLinha(linha.key, 'diaFuro', e.target.value)} className={`${inputCls} w-20`} />
                          </div>
                          <button type="button" onClick={() => setFuroAbertoKey(null)} className="text-[10px] surface-muted hover:text-orange-500 font-bold uppercase ml-auto">Fechar</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {linhas.length === 0 && (
        <div className="text-center text-xs surface-muted py-4">
          Nenhuma linha. <button type="button" onClick={() => adicionarLinha(undefined)} className="text-orange-500 font-bold hover:underline">Adicionar a primeira</button>
        </div>
      )}

      <button
        type="button"
        onClick={commitar}
        disabled={totalProntas === 0}
        className="w-full text-white font-black py-2.5 rounded-full transition-all shadow-lg hover:-translate-y-0.5 bg-orange-500 hover:bg-orange-600 text-sm disabled:opacity-40 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
      >
        Adicionar {totalProntas} peça{totalProntas === 1 ? '' : 's'} à lista →
      </button>

      {dxfPreviewAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setDxfPreviewAberto(null)}>
          <div className="bg-[#0d1626] border border-slate-700 rounded-2xl p-4 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-orange-400">DXF importado: {dxfPreviewAberto.id}</span>
              <button type="button" onClick={() => setDxfPreviewAberto(null)} className="text-slate-400 hover:text-white text-sm font-bold px-1">✕</button>
            </div>
            <div
              className="w-full h-64 flex items-center justify-center bg-black/20 rounded-lg"
              dangerouslySetInnerHTML={{ __html: (dxfPreviewAberto.svg || '').replace(/#00C4CC/g, '#F97316') }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

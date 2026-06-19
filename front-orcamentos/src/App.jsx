import { useState } from 'react';

const parametrosLaser = {
  "0.90": { velTeorica: 26000, velPratica: 22100 },
  "0.95": { velTeorica: 26000, velPratica: 22100 },
  "1.20": { velTeorica: 25000, velPratica: 21250 },
  "1.25": { velTeorica: 25000, velPratica: 21250 },
  "1.50": { velTeorica: 25000, velPratica: 21250 },
  "1.55": { velTeorica: 25000, velPratica: 21250 },
  "1.80": { velTeorica: 25000, velPratica: 21250 },
  "1.95": { velTeorica: 25000, velPratica: 21250 },
  "2.00": { velTeorica: 25000, velPratica: 21250 },
  "2.25": { velTeorica: 20000, velPratica: 17000 },
  "2.65": { velTeorica: 20000, velPratica: 17000, amperagem: 45 },
  "3.00": { velTeorica: 15000, velPratica: 12750, amperagem: 65 },
  "3.35": { velTeorica: 15000, velPratica: 12750 },
  "3.75": { velTeorica: 11000, velPratica: 9350 },
  "4.25": { velTeorica: 11000, velPratica: 9350 },
  "4.75": { velTeorica: 8500, velPratica: 7225 },
  "6.35": { velTeorica: 2400, velPratica: 2040, amperagem: 105 },
  "7.94": { velTeorica: 2200, velPratica: 1870 },
  "9.53": { velTeorica: 1900, velPratica: 1615, velocidadeFuro: 700 },
  "12.70": { velTeorica: 1500, velPratica: 1275, amperagem: 125 },
  "15.88": { velTeorica: 1200, velPratica: 1020 }
};
const parametrosPlasma = {
  "0.65": { velTeorica: 5200, velPratica: 4420 },
  "0.90": { velTeorica: 5200, velPratica: 4420 },
  "0.95": { velTeorica: 5200, velPratica: 4420 },
  "1.20": { velTeorica: 5200, velPratica: 4420 },
  "1.25": { velTeorica: 5200, velPratica: 4420 },
  "1.50": { velTeorica: 5200, velPratica: 4420 },
  "1.90": { velTeorica: 5200, velPratica: 4420 },
  "2.00": { velTeorica: 5200, velPratica: 4420 },
  "2.15": { velTeorica: 5200, velPratica: 4420 },
  "2.25": { velTeorica: 5200, velPratica: 4420 },
  "2.65": { velTeorica: 5200, velPratica: 4420, amperagem: 45 },
  "3.00": { velTeorica: 5150, velPratica: 4378, amperagem: 65 },
  "3.15": { velTeorica: 3600, velPratica: 3060 },
  "3.35": { velTeorica: 3600, velPratica: 3485 },
  "3.75": { velTeorica: 3600, velPratica: 3060 },
  "3.85": { velTeorica: 3600, velPratica: 3485 },
  "4.25": { velTeorica: 3600, velPratica: 3485 },
  "4.75": { velTeorica: 3600, velPratica: 3485 },
  "6.35": { velTeorica: 4100, velPratica: 3060, amperagem: 105 },
  "7.94": { velTeorica: 3200, velPratica: 2720 },
  "9.53": { velTeorica: 2200, velPratica: 1870, velocidadeFuro: 700 },
  "12.70": { velTeorica: 2050, velPratica: 1743, amperagem: 125 },
  "15.88": { velTeorica: 1250, velPratica: 1063 },
  "19.04": { velTeorica: 900, velPratica: 765 },
  "22.22": { velTeorica: 750, velPratica: 638, velocidadeFuro: 450 },
  "25.40": { velTeorica: 600, velPratica: 510, velocidadeFuro: 400 },
  "28.70": { velTeorica: 600, velPratica: 510 },
  "31.75": { velTeorica: 500, velPratica: 425 }
};
const parametrosOxicorte = {
  "25.40": { velTeorica: 300, velPratica: 255 },
  "28.70": { velTeorica: 300, velPratica: 255 },
  "31.75": { velTeorica: 200, velPratica: 170 },
  "50.80": { velTeorica: 190, velPratica: 162 }
};
const parametrosGuilhotina = {
  "0.90": { velocidade: 36000, velocidadePratica: 30600 },
  "1.50": { velocidade: 36000, velocidadePratica: 30600 },
  "1.90": { velocidade: 36000, velocidadePratica: 30600 },
  "2.00": { velocidade: 36000, velocidadePratica: 30600 },
  "2.25": { velocidade: 36000, velocidadePratica: 30600 },
  "2.65": { velocidade: 36000, velocidadePratica: 30600 },
  "3.00": { velocidade: 36000, velocidadePratica: 30600 },
  "3.35": { velocidade: 36000, velocidadePratica: 30600 },
  "3.75": { velocidade: 36000, velocidadePratica: 30600 },
  "4.25": { velocidade: 36000, velocidadePratica: 30600 },
  "4.75": { velocidade: 36000, velocidadePratica: 30600 },
  "6.35": { velocidade: 36000, velocidadePratica: 30600 },
  "7.94": { velocidade: 36000, velocidadePratica: 30600 }
};

function App() {
  // 1. ESTADOS GLOBAIS
  const [cliente, setCliente] = useState('');
  const [imposto, setImposto] = useState(0.18);
  const [comissao, setComissao] = useState(0.02);
  const [frete, setFrete] = useState(0.31);
  const [precoKg, setPrecoKg] = useState(11.50);

  // 2. ESTADOS DA PEÇA ATUAL
  const [idNoroaco, setIdNoroaco] = useState('');
  const [qtd, setQtd] = useState('');
  const [tipoPeca, setTipoPeca] = useState('R');
  const [espessura, setEspessura] = useState('');
  const [dimA, setDimA] = useState('');
  const [dimB, setDimB] = useState('');
  const [dimC, setDimC] = useState('');
  
  // ESTADOS DE FURAÇÃO (Novos)
  const [nFuros, setNFuros] = useState(0);
  const [diaFuro, setDiaFuro] = useState(0);
  const [furoPadraoCantos, setFuroPadraoCantos] = useState(false);
  const [furoOffsetX, setFuroOffsetX] = useState('');
  const [furoOffsetY, setFuroOffsetY] = useState('');

  // 3. LISTA E CONTROLE DE EDIÇÃO
  const [listaPecas, setListaPecas] = useState([]);
  const [editandoIndex, setEditandoIndex] = useState(null);

  // FUNÇÃO: ADICIONAR OU ATUALIZAR
  const adicionarOuAtualizarPeca = (e) => {
    e.preventDefault();

    const volume = parseFloat(dimA || 0) * parseFloat(dimB || 0) * parseFloat(espessura || 0);
    const pesoUnitario = (volume * 7.85) / 1000000; 
    const pesoTotal = pesoUnitario * parseInt(qtd || 1);

    const novaPeca = {
      idNoroaco,
      qtd: parseInt(qtd),
      tipoPeca,
      espessura: parseFloat(espessura),
      dimA: parseFloat(dimA),
      dimB: parseFloat(dimB),
      dimC: parseFloat(dimC),
      // Dados de furação incluídos no pacote
      nFuros: parseInt(nFuros),
      diaFuro: parseFloat(diaFuro),
      furoPadraoCantos,
      furoOffsetX: parseFloat(furoOffsetX || 0),
      furoOffsetY: parseFloat(furoOffsetY || 0),
      // Pesos
      pesoUnitario: pesoUnitario.toFixed(2),
      pesoTotal: pesoTotal.toFixed(2)
    };

    if (editandoIndex !== null) {
      const listaAtualizada = [...listaPecas];
      listaAtualizada[editandoIndex] = novaPeca;
      setListaPecas(listaAtualizada);
      setEditandoIndex(null);
    } else {
      setListaPecas([...listaPecas, novaPeca]);
    }

    // Limpa todos os campos
    setIdNoroaco(''); setDimA(''); setDimB(''); setDimC(''); 
    setNFuros(0); setDiaFuro(0); setFuroPadraoCantos(false); setFuroOffsetX(''); setFuroOffsetY('');
  };

  // FUNÇÃO: REMOVER
  const removerPeca = (indexParaRemover) => {
    const listaFiltrada = listaPecas.filter((_, index) => index !== indexParaRemover);
    setListaPecas(listaFiltrada);
  };

  // FUNÇÃO: INICIAR EDIÇÃO
  const editarPeca = (index) => {
    const peca = listaPecas[index];
    setIdNoroaco(peca.idNoroaco);
    setQtd(peca.qtd);
    setTipoPeca(peca.tipoPeca);
    setEspessura(peca.espessura);
    setDimA(peca.dimA);
    setDimB(peca.dimB);
    setDimC(peca.dimC);
    
    // Puxa os dados de furação antigos
    setNFuros(peca.nFuros);
    setDiaFuro(peca.diaFuro);
    setFuroPadraoCantos(peca.furoPadraoCantos);
    setFuroOffsetX(peca.furoOffsetX);
    setFuroOffsetY(peca.furoOffsetY);
    
    setEditandoIndex(index);
  };

  // FUNÇÃO: ENVIAR PARA O BACKEND
  const handleSalvar = async () => {
    const pacoteDeDados = {
      cliente,
      imposto: parseFloat(imposto),
      comissao: parseFloat(comissao),
      precoKg: parseFloat(precoKg),
      frete: parseFloat(frete),
      pecas: listaPecas
    };
    console.log("Enviando para Python:", pacoteDeDados);
    // ... Aqui vai o fetch do Python que já construímos ...
    alert("Dados enviados (Veja o console)");
  };

  // FUNÇÃO: PREVIEW VISUAL CNC ATUALIZADO
  const renderPreviewPeca = () => {
    const w = parseFloat(dimA) || (tipoPeca === 'Q' ? 100 : 200);
    const h = parseFloat(dimB) || (tipoPeca === 'Q' ? w : 100);
    const furos = parseInt(nFuros) || 0;
    const raioFuro = (parseFloat(diaFuro) || 0) / 2;
    
    // Distâncias (se vazias, usamos 10mm como padrão visual temporário)
    const offX = parseFloat(furoOffsetX) || 10;
    const offY = parseFloat(furoOffsetY) || 10;

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 rounded-lg p-4 relative overflow-hidden">
        <span className="absolute top-2 left-2 text-xs font-mono text-green-400">Preview (Escala Automática)</span>
        
        <svg viewBox={`0 0 ${w + 40} ${h + 40}`} className="w-full h-full max-h-48 drop-shadow-lg">
          {/* Corpo da chapa principal */}
          <rect x="20" y="20" width={w} height={h} fill="#94a3b8" stroke="#334155" strokeWidth="2" rx="2" />
          
          {/* Lógica Inteligente de Furos */}
          {furos > 0 && (
            furoPadraoCantos && furos === 4 ? (
              // Padrão 4 Cantos (As coordenadas exatas baseadas nas bordas)
              <>
                <circle cx={20 + offX} cy={20 + offY} r={raioFuro} fill="#1e293b" />
                <circle cx={20 + w - offX} cy={20 + offY} r={raioFuro} fill="#1e293b" />
                <circle cx={20 + offX} cy={20 + h - offY} r={raioFuro} fill="#1e293b" />
                <circle cx={20 + w - offX} cy={20 + h - offY} r={raioFuro} fill="#1e293b" />
              </>
            ) : (
              // Padrão Linear Simples (Para furos normais)
              furos <= 5 ? (
                Array.from({ length: furos }).map((_, i) => (
                  <circle key={i} cx={20 + (w / (furos + 1)) * (i + 1)} cy={20 + h / 2} r={raioFuro} fill="#1e293b" />
                ))
              ) : (
                <text x={20 + w/2} y={20 + h/2} textAnchor="middle" fill="#1e293b" fontSize={Math.min(w, h) * 0.2}>
                  +{furos} Furos
                </text>
              )
            )
          )}
        </svg>

        <div className="mt-2 text-center text-xs text-slate-300 font-mono">
          Eixos: X={w}mm | Y={h}mm
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col md:flex-row gap-6">
      
      {/* LADO ESQUERDO: FORMULÁRIOS */}
      <div className="w-full md:w-2/3 space-y-6">
        
        <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-orange-500">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Parâmetros do Orçamento</h2>
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700">Cliente</label>
              <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 w-full border rounded p-2" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 text-orange-600">Imposto</label>
              <input type="number" step="0.01" value={imposto} onChange={(e) => setImposto(e.target.value)} className="mt-1 w-full border rounded p-2 bg-orange-50" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 text-orange-600">Comissão</label>
              <input type="number" step="0.01" value={comissao} onChange={(e) => setComissao(e.target.value)} className="mt-1 w-full border rounded p-2 bg-orange-50" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 text-orange-600">R$/KG</label>
              <input type="number" step="0.01" value={precoKg} onChange={(e) => setPrecoKg(e.target.value)} className="mt-1 w-full border rounded p-2 bg-orange-50" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-red-600">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800">
              {editandoIndex !== null ? '✏️ Editando Peça' : 'Adicionar Peça (Corte)'}
            </h2>
            {editandoIndex !== null && (
              <button onClick={() => {
                setEditandoIndex(null); 
                setIdNoroaco(''); setDimA(''); setDimB(''); setDimC(''); 
                setNFuros(0); setDiaFuro(0); setFuroPadraoCantos(false); setFuroOffsetX(''); setFuroOffsetY('');
              }} className="text-sm text-red-500 hover:underline">Cancelar Edição</button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="col-span-2">
              <form onSubmit={adicionarOuAtualizarPeca} className="space-y-4">
                
                {/* Linha 1: Dimensões Principais */}
                <div className="grid grid-cols-4 gap-4">
                   <div>
                     <label className="block text-sm font-bold text-red-700">ID Noroaço</label>
                     <input type="text" value={idNoroaco} onChange={(e) => setIdNoroaco(e.target.value)} required className="mt-1 w-full border border-red-300 rounded p-2 bg-red-50" />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-red-700">QTD</label>
                     <input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} required className="mt-1 w-full border border-red-300 rounded p-2 bg-red-50" />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-red-700">Tipo</label>
                     <select value={tipoPeca} onChange={(e) => setTipoPeca(e.target.value)} className="mt-1 w-full border border-red-300 rounded p-2 bg-red-50">
                        <option value="R">Retangular (R)</option>
                        <option value="Q">Quadrado (Q)</option>
                     </select>
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-red-700">Espessura</label>
                     <input type="number" step="0.01" value={espessura} onChange={(e) => setEspessura(e.target.value)} required className="mt-1 w-full border border-red-300 rounded p-2 bg-red-50" />
                   </div>
                </div>

                {/* Linha 2: Furos e Dimensões */}
                <div className="grid grid-cols-5 gap-4 items-end">
                   <div>
                     <label className="block text-sm font-medium">Nº Furos</label>
                     <input type="number" value={nFuros} onChange={(e) => setNFuros(e.target.value)} className="mt-1 w-full border rounded p-2" />
                   </div>
                   <div>
                     <label className="block text-sm font-medium">Dia. Furo</label>
                     <input type="number" value={diaFuro} onChange={(e) => setDiaFuro(e.target.value)} className="mt-1 w-full border rounded p-2" />
                   </div>
                   <div>
                     <label className="block text-sm font-medium">DIM A</label>
                     <input type="number" value={dimA} onChange={(e) => setDimA(e.target.value)} required className="mt-1 w-full border rounded p-2" />
                   </div>
                   <div>
                     <label className="block text-sm font-medium">DIM B</label>
                     <input type="number" value={dimB} onChange={(e) => setDimB(e.target.value)} required className="mt-1 w-full border rounded p-2" />
                   </div>
                   <div>
                     <label className="block text-sm font-medium">DIM C</label>
                     <input type="number" value={dimC} onChange={(e) => setDimC(e.target.value)} className="mt-1 w-full border rounded p-2" />
                   </div>
                </div>

                {/* Linha 3: Renderização Condicional (O MENU INTELIGENTE DE FUROS) */}
                {nFuros > 0 && (
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded grid grid-cols-3 gap-4 items-center">
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        id="checkCantos"
                        checked={furoPadraoCantos} 
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setFuroPadraoCantos(isChecked);
                          if (isChecked) setNFuros(4); // Força 4 furos automaticamente
                        }} 
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <label htmlFor="checkCantos" className="text-sm font-bold text-slate-700 cursor-pointer">
                        Padrão: 4 Cantos
                      </label>
                    </div>
                    
                    {furoPadraoCantos && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-600">Dist. Borda X (mm)</label>
                          <input type="number" value={furoOffsetX} onChange={(e) => setFuroOffsetX(e.target.value)} required className="mt-1 w-full border rounded p-1 text-sm" placeholder="Ex: 35" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600">Dist. Borda Y (mm)</label>
                          <input type="number" value={furoOffsetY} onChange={(e) => setFuroOffsetY(e.target.value)} required className="mt-1 w-full border rounded p-1 text-sm" placeholder="Ex: 35" />
                        </div>
                      </>
                    )}
                  </div>
                )}

                <button type="submit" className={`w-full text-white font-bold py-3 rounded transition-colors shadow-md ${editandoIndex !== null ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {editandoIndex !== null ? '✓ Atualizar Peça' : '+ Inserir Peça na Lista'}
                </button>
              </form>
            </div>

            <div className="col-span-1 h-full min-h-[200px]">
              {renderPreviewPeca()}
            </div>
          </div>
        </div>
      </div>

      {/* LADO DIREITO: LISTA LATERAL */}
      <div className="w-full md:w-1/3 bg-white p-6 rounded-lg shadow-md border-t-4 border-slate-800 flex flex-col">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h2 className="text-lg font-bold text-slate-800">Peças do Orçamento</h2>
          <span className="bg-slate-200 text-slate-800 text-xs font-bold px-2 py-1 rounded-full">{listaPecas.length} itens</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {listaPecas.length === 0 ? (
            <p className="text-sm text-slate-500 italic text-center mt-10">Nenhuma peça adicionada.</p>
          ) : (
            listaPecas.map((peca, index) => (
              <div key={index} className="border border-slate-200 p-3 rounded bg-slate-50 relative group hover:border-blue-400 transition-colors">
                
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-blue-900">{peca.idNoroaco}</span>
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => editarPeca(index)} className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-200 uppercase font-bold">Editar</button>
                      <button onClick={() => removerPeca(index)} className="text-[10px] bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200 uppercase font-bold">Excluir</button>
                    </div>
                  </div>
                  <span className="text-sm font-bold bg-white border px-2 py-1 rounded shadow-sm">{peca.qtd} UN</span>
                </div>
                
                <div className="text-xs text-slate-600 mt-3 grid grid-cols-2 gap-1 border-t pt-2">
                  <p>Espessura: <b>{peca.espessura}mm</b></p>
                  <p>Dim: <b>{peca.dimA}x{peca.dimB}</b></p>
                  <p>Peso Unt: <b>{peca.pesoUnitario}kg</b></p>
                  <p className="text-green-700">Peso Tot: <b>{peca.pesoTotal}kg</b></p>
                  {peca.nFuros > 0 && (
                     <p className="col-span-2 text-slate-500 mt-1">
                       ⚙️ {peca.nFuros} Furo(s) Ø{peca.diaFuro} 
                       {peca.furoPadraoCantos ? ` (Cantos: ${peca.furoOffsetX}x${peca.furoOffsetY})` : ''}
                     </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        
        {listaPecas.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <button onClick={handleSalvar} className="w-full bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700">
              Enviar para Cálculo (Python)
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

export default App;
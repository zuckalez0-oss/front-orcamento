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
  // 1. ESTADOS GLOBAIS (Verde e Laranja no Excel)
  const [cliente, setCliente] = useState('');
  const [imposto, setImposto] = useState(0.18);
  const [comissao, setComissao] = useState(0.02);
  const [frete, setFrete] = useState(0.31);
  const [precoKg, setPrecoKg] = useState(11.50);

  // 2. ESTADOS DA PEÇA ATUAL (Vermelho no Excel)
  const [idNoroaco, setIdNoroaco] = useState('');
  const [qtd, setQtd] = useState('');
  const [tipoPeca, setTipoPeca] = useState('R'); // R = Retangular, Q = Quadrada
  const [nFuros, setNFuros] = useState(0);
  const [diaFuro, setDiaFuro] = useState(0);
  const [espessura, setEspessura] = useState('');
  const [dimA, setDimA] = useState('');
  const [dimB, setDimB] = useState('');
  const [dimC, setDimC] = useState('');
  const [pesoUnitario, setPesoUnitario] = useState(0);

  // 3. LISTA DE PEÇAS
  const [listaPecas, setListaPecas] = useState([]);

  // NOVO: Estado para saber se estamos editando uma peça existente
  const [editandoIndex, setEditandoIndex] = useState(null);

  const adicionarOuAtualizarPeca = (e) => {
    e.preventDefault();

    const volume = parseFloat(dimA || 0) * parseFloat(dimB || 0) * parseFloat(espessura || 0);
    const pesoUnitario = (volume * 7.85) / 1000000; 
    const pesoTotal = pesoUnitario * parseInt(qtd || 1);

    const novaPeca = {
      idNoroaco,
      qtd: parseInt(qtd),
      tipoPeca,
      nFuros: parseInt(nFuros),
      diaFuro: parseFloat(diaFuro),
      espessura: parseFloat(espessura),
      dimA: parseFloat(dimA),
      dimB: parseFloat(dimB),
      dimC: parseFloat(dimC),
      pesoUnitario: pesoUnitario.toFixed(2),
      pesoTotal: pesoTotal.toFixed(2)
    };

    if (editandoIndex !== null) {
      // Se estamos editando, atualizamos a peça na posição correta
      const listaAtualizada = [...listaPecas];
      listaAtualizada[editandoIndex] = novaPeca;
      setListaPecas(listaAtualizada);
      setEditandoIndex(null); // Sai do modo de edição
    } else {
      // Se não, adiciona uma nova
      setListaPecas([...listaPecas, novaPeca]);
    }

    // Limpa os campos após salvar
    setIdNoroaco(''); setDimA(''); setDimB(''); setDimC(''); setNFuros(0); setDiaFuro(0);
  };

  const removerPeca = (indexParaRemover) => {
    const listaFiltrada = listaPecas.filter((_, index) => index !== indexParaRemover);
    setListaPecas(listaFiltrada);
  };

  const editarPeca = (index) => {
    const peca = listaPecas[index];
    // Carrega os dados da peça selecionada de volta para os inputs
    setIdNoroaco(peca.idNoroaco);
    setQtd(peca.qtd);
    setTipoPeca(peca.tipoPeca);
    setNFuros(peca.nFuros);
    setDiaFuro(peca.diaFuro);
    setEspessura(peca.espessura);
    setDimA(peca.dimA);
    setDimB(peca.dimB);
    setDimC(peca.dimC);
    
    setEditandoIndex(index);
  };


  // 2. FUNÇÃO DE AÇÃO
  // Adicionamos a palavra 'async' porque a comunicação com o servidor leva tempo (milissegundos)
  const handleSalvar = async (evento) => {
    evento.preventDefault(); 
    
    const pacoteDeDados = {
      cliente_nome: cliente,
      tipo_material: material,
      espessura_mm: parseFloat(espessura) || 0,
      tipo_processo: processo,
      quantidade_pecas: parseInt(quantidade) || 0,
      medidas: {
        largura_mm: parseFloat(largura) || 0,
        altura_mm: parseFloat(altura) || 0
      }
    };

    try {
      // 1. O React faz a "ligação" para o Python
      const resposta = await fetch("http://localhost:8000/calcular-orcamento", {
        method: "POST", // Método de envio
        headers: {
          "Content-Type": "application/json" // Avisa que estamos mandando um JSON
        },
        body: JSON.stringify(pacoteDeDados) // Transforma nosso objeto em texto JSON
      });

      // 2. Espera a resposta do Python chegar
      const dadosDoBackend = await resposta.json();

      // 3. Mostra o resultado processado pelo servidor!
      if (dadosDoBackend.status === "sucesso") {
        alert("✅ Sucesso no Servidor: " + dadosDoBackend.mensagem);
        console.log("Resposta completa do backend:", dadosDoBackend);
      } else {
        alert("⚠️ Erro ao processar no servidor.");
      }

    } catch (erro) {
      console.error("Erro na comunicação:", erro);
      alert("❌ O backend Python parece estar desligado!");
    }
  };
  // Função que gera o desenho vetorial da peça em tempo real
  const renderPreviewPeca = () => {
    // Garante que temos valores mínimos para não quebrar o desenho
    const w = parseFloat(dimA) || (tipoPeca === 'Q' ? 100 : 200);
    const h = parseFloat(dimB) || (tipoPeca === 'Q' ? w : 100);
    const furos = parseInt(nFuros) || 0;
    const raioFuro = (parseFloat(diaFuro) || 0) / 2;

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 rounded-lg p-4 relative overflow-hidden">
        <span className="absolute top-2 left-2 text-xs font-mono text-green-400">Preview (Escala Automática)</span>
        
        {/* O viewBox atua como a área de trabalho da máquina CNC */}
        <svg viewBox={`0 0 ${w + 40} ${h + 40}`} className="w-full h-full max-h-48 drop-shadow-lg">
          {/* Corpo da chapa principal */}
          <rect x="20" y="20" width={w} height={h} fill="#94a3b8" stroke="#334155" strokeWidth="2" rx="2" />
          
          {/* Lógica simples para furos (centralizados de forma ilustrativa) */}
          {furos > 0 && furos <= 5 && Array.from({ length: furos }).map((_, i) => (
             <circle 
               key={i} 
               cx={20 + (w / (furos + 1)) * (i + 1)} 
               cy={20 + h / 2} 
               r={raioFuro} 
               fill="#1e293b" 
             />
          ))}
          {furos > 5 && (
            <text x={20 + w/2} y={20 + h/2} textAnchor="middle" fill="#1e293b" fontSize={Math.min(w, h) * 0.2}>
              +{furos} Furos
            </text>
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
      
      {/* LADO ESQUERDO: FORMULÁRIOS (Ocupa 2/3 da tela) */}
      <div className="w-full md:w-2/3 space-y-6">
        
        {/* BLOCO 1: Variáveis Globais (Laranja/Verde) */}
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

        {/* BLOCO 2: Entrada de Peças (Com Preview) */}
        <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-red-600">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800">
              {editandoIndex !== null ? '✏️ Editando Peça' : 'Adicionar Peça (Corte)'}
            </h2>
            {editandoIndex !== null && (
              <button onClick={() => {
                setEditandoIndex(null); 
                setIdNoroaco(''); setDimA(''); setDimB(''); setDimC(''); setNFuros(0); setDiaFuro(0);
              }} className="text-sm text-red-500 hover:underline">Cancelar Edição</button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LADO ESQUERDO DO BLOCO: O Formulário */}
            <div className="col-span-2">
              <form onSubmit={adicionarOuAtualizarPeca} className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                   <div>
                     <label className="block text-sm font-bold text-red-700">ID Noroaço</label>
                     <input type="text" value={idNoroaco} onChange={(e) => setIdNoroaco(e.target.value)} required className="mt-1 w-full border border-red-300 rounded p-2 bg-red-50 focus:ring-red-500" />
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

                <div className="grid grid-cols-5 gap-4">
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

                <button type="submit" className={`w-full text-white font-bold py-3 rounded transition-colors shadow-md ${editandoIndex !== null ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {editandoIndex !== null ? '✓ Atualizar Peça' : '+ Inserir Peça na Lista'}
                </button>
              </form>
            </div>

            {/* LADO DIREITO DO BLOCO: O Preview Visual (Aonde você desenhou o quadrado vermelho) */}
            <div className="col-span-1 h-full min-h-[200px]">
              {renderPreviewPeca()}
            </div>

          </div>
        </div>
      </div>

      {/* LADO DIREITO DA TELA INTEIRA: LISTA LATERAL COM EXCLUIR/EDITAR */}
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
                </div>
              </div>
            ))
          )}
        </div>
        
        {listaPecas.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <button className="w-full bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700">
              Enviar para Cálculo (Python)
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

export default App;
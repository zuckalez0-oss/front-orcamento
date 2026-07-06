import { useState } from 'react';


function App() {
  // 1. ESTADOS GLOBAIS
  const [cliente, setCliente] = useState('');
  const [imposto, setImposto] = useState(0.18);
  const [comissao, setComissao] = useState(0.02);
  const [frete, setFrete] = useState(0.31);
  const [precoKg, setPrecoKg] = useState(11.50);

  // 2. ESTADOS DA PEÇA ATUAL
  const [id, setId] = useState('');
  const [processo, setProcesso] = useState('LASER');
  const [qtd, setQtd] = useState('');
  const [tipoPeca, setTipoPeca] = useState('R');
  const [espessura, setEspessura] = useState('');
  const [dimA, setDimA] = useState('');
  const [dimB, setDimB] = useState('');
  const [dimC, setDimC] = useState('');
  
  // ESTADOS DE FURAÇÃO
  const [nFuros, setNFuros] = useState(0);
  const [diaFuro, setDiaFuro] = useState(0);
  const [furoPadraoCantos, setFuroPadraoCantos] = useState(false);
  const [furoOffsetX, setFuroOffsetX] = useState('');
  const [furoOffsetY, setFuroOffsetY] = useState('');

  // ESTADOS DE ARQUIVO DXF E VALIDAÇÃO
  const [dxfFile, setDxfFile] = useState(null);
  const [dxfPreviewSvg, setDxfPreviewSvg] = useState(null);
  const [isUploadingDxf, setIsUploadingDxf] = useState(false);
  const [dxfErro, setDxfErro] = useState(null);

  // 3. LISTA E CONTROLE DE EDIÇÃO
  const [listaPecas, setListaPecas] = useState([]);
  const [editandoIndex, setEditandoIndex] = useState(null);

  // 4. CONTROLE DE TELAS E RESULTADOS
  const [telaAtual, setTelaAtual] = useState('formulario'); // 'formulario' ou 'resultado'
  const [resultadoOrcamento, setResultadoOrcamento] = useState(null);

  // 5. ESTADOS DO MODAL DE CHAPAS
  const [isModalChapasOpen, setIsModalChapasOpen] = useState(false);
  const [chapasConfig, setChapasConfig] = useState({});


  // FUNÇÃO: LIDAR COM UPLOAD DE DXF E INTEGRAÇÃO COM BACKEND
  const handleDxfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setDxfFile(file);
    setIsUploadingDxf(true);
    setDxfErro(null);
    setDxfPreviewSvg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resposta = await fetch('http://localhost:8000/processar-dxf', {
        method: 'POST',
        body: formData
      });

      const dados = await resposta.json();

      if (!dados.sucesso) {
        setDxfErro(dados.erro || "O arquivo contém erros ou geometria aberta.");
        setIsUploadingDxf(false);
        return;
      }

      setDimA(dados.dimA);
      setDimB(dados.dimB);
      setNFuros(dados.nFuros || 0);    
      setDiaFuro(dados.diaFuro || 0);  
      setId(file.name.replace('.dxf', ''));
      setDxfPreviewSvg(dados.svgMarkup);
      
      setIsUploadingDxf(false);

    } catch (error) {
      console.error("Erro ao processar DXF", error);
      setDxfErro("Falha de rede ao tentar comunicar com o motor de processamento.");
      setIsUploadingDxf(false);
    }
  };

  // FUNÇÃO: ADICIONAR OU ATUALIZAR
  const adicionarOuAtualizarPeca = (e) => {
    e.preventDefault();

    const volume = parseFloat(dimA || 0) * parseFloat(dimB || 0) * parseFloat(espessura || 0);
    const pesoUnitario = (volume * 7.85) / 1000000; 
    const pesoTotal = pesoUnitario * parseInt(qtd || 1);

    const novaPeca = {
      id,
      qtd: parseInt(qtd),
      tipoPeca,
      espessura: parseFloat(espessura),
      dimA: parseFloat(dimA),
      dimB: parseFloat(dimB),
      dimC: parseFloat(dimC),
      nFuros: parseInt(nFuros),
      diaFuro: parseFloat(diaFuro),
      furoPadraoCantos,
      furoOffsetX: parseFloat(furoOffsetX || 0),
      furoOffsetY: parseFloat(furoOffsetY || 0),
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

    limparFormulario();
  };

  const limparFormulario = () => {
    setId(''); setDimA(''); setDimB(''); setDimC(''); setQtd(''); setEspessura('');
    setNFuros(0); setDiaFuro(0); setFuroPadraoCantos(false); setFuroOffsetX(''); setFuroOffsetY('');
    setDxfFile(null); setDxfPreviewSvg(null); setDxfErro(null);
  };

  // Prepara o Modal agrupando as espessuras únicas da lista
  const prepararProcessamento = () => {
    const espessurasUnicas = [...new Set(listaPecas.map(p => p.espessura.toFixed(2)))];
    const configInicial = {};
    
    espessurasUnicas.forEach(esp => {
      configInicial[esp] = { largura: 1200, comprimento: 3000 };
    });
    
    setChapasConfig(configInicial);
    setIsModalChapasOpen(true);
  };

  // Atualiza os valores digitados no Modal
  const handleChapaChange = (esp, campo, valor) => {
    setChapasConfig(prev => ({
      ...prev,
      [esp]: { ...prev[esp], [campo]: parseFloat(valor) || 0 }
    }));
  };

  // Aciona a impressão nativa do navegador (Gera PDF)
  const baixarPDF = () => {
    window.print();
  };

  const removerPeca = (indexParaRemover) => {
    setListaPecas(listaPecas.filter((_, index) => index !== indexParaRemover));
  };

  const editarPeca = (index) => {
    const peca = listaPecas[index];
    setId(peca.id); setQtd(peca.qtd); setTipoPeca(peca.tipoPeca); setEspessura(peca.espessura);
    setDimA(peca.dimA); setDimB(peca.dimB); setDimC(peca.dimC); setNFuros(peca.nFuros); setDiaFuro(peca.diaFuro);
    setFuroPadraoCantos(peca.furoPadraoCantos); setFuroOffsetX(peca.furoOffsetX); setFuroOffsetY(peca.furoOffsetY);
    setEditandoIndex(index);
  };

  const handleSalvar = async () => {
    setIsModalChapasOpen(false); // Fecha o modal
    
    const pacoteDeDados = { 
      cliente, 
      imposto: parseFloat(imposto), 
      comissao: parseFloat(comissao), 
      precoKg: parseFloat(precoKg), 
      frete: parseFloat(frete), 
      processo, 
      pecas: listaPecas,
      configChapas: chapasConfig // Envia os dados do modal para o Python
    };
    
    try {
      const resposta = await fetch('http://localhost:8000/calcular-orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pacoteDeDados)
      });
      
      const dadosDoBack = await resposta.json();
      
      if (dadosDoBack.status === "sucesso") {
         setResultadoOrcamento(dadosDoBack); 
         setTelaAtual('resultado'); 
      }
    } catch (erro) {
      console.error("Erro ao conectar com a API:", erro);
      alert("Erro ao processar orçamento no servidor.");
    }
  };

  // FUNÇÃO: PREVIEW VISUAL CNC
  const renderPreviewPeca = () => {
    if (isUploadingDxf) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1626] rounded-lg p-4 relative overflow-hidden border border-slate-700 shadow-inner min-h-[250px]">
           <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
           <span className="text-cyan-400 text-sm font-mono mt-3">Analisando vetores...</span>
        </div>
      );
    }

    if (dxfPreviewSvg) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1626] rounded-lg p-4 relative overflow-hidden border border-slate-700 shadow-inner min-h-[250px]">
          <span className="absolute top-2 left-2 text-xs font-mono text-cyan-400">Preview Real (DXF)</span>
          <div 
            className="w-full h-full drop-shadow-2xl flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: dxfPreviewSvg }} 
          />
          <div className="absolute bottom-2 text-center text-xs text-slate-400 font-mono">
            X={dimA}mm | Y={dimB}mm
          </div>
        </div>
      );
    }

    const w = parseFloat(dimA) || (tipoPeca === 'Q' ? 100 : 200);
    const h = parseFloat(dimB) || (tipoPeca === 'Q' ? w : 100);
    const furos = parseInt(nFuros) || 0;
    const raioFuro = (parseFloat(diaFuro) || 0) / 2;
    const offX = parseFloat(furoOffsetX) || 10;
    const offY = parseFloat(furoOffsetY) || 10;

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1626] rounded-lg p-4 relative overflow-hidden border border-slate-700 shadow-inner min-h-[250px]">
        <span className="absolute top-2 left-2 text-xs font-mono text-slate-400">Preview Geométrico</span>
        
        <svg viewBox={`0 0 ${w + 40} ${h + 40}`} className="w-full h-full max-h-48 drop-shadow-2xl">
          <rect x="20" y="20" width={w} height={h} fill="#e2e8f0" stroke="#334155" strokeWidth="1.5" rx="2" />
          {furos > 0 && (
            furoPadraoCantos && furos === 4 ? (
              <>
                <circle cx={20 + offX} cy={20 + offY} r={raioFuro} fill="#0d1626" />
                <circle cx={20 + w - offX} cy={20 + offY} r={raioFuro} fill="#0d1626" />
                <circle cx={20 + offX} cy={20 + h - offY} r={raioFuro} fill="#0d1626" />
                <circle cx={20 + w - offX} cy={20 + h - offY} r={raioFuro} fill="#0d1626" />
              </>
            ) : (
              furos <= 5 ? (
                Array.from({ length: furos }).map((_, i) => (
                  <circle key={i} cx={20 + (w / (furos + 1)) * (i + 1)} cy={20 + h / 2} r={raioFuro} fill="#0d1626" />
                ))
              ) : (
                <text x={20 + w/2} y={20 + h/2} textAnchor="middle" fill="#0d1626" fontSize={Math.min(w, h) * 0.2}>+{furos} Furos</text>
              )
            )
          )}
        </svg>
        <div className="mt-2 text-center text-xs text-slate-400 font-mono">
          Eixos: X={w}mm | Y={h}mm
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans relative">
      
      {/* 🚀 HEADER / NAVBAR: GeoQuote by Lypsyos */}
      <header className="bg-slate-900 shadow-md px-8 py-4 flex justify-between items-center border-b-4 border-cyan-500 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">
            Geo<span className="text-cyan-400">Quote</span>
          </h1>
        </div>
        
        <div className="text-slate-400 text-sm font-medium tracking-wide">
          Powered by <span className="text-white font-bold tracking-widest uppercase text-xs bg-slate-800 px-2 py-1 rounded border border-slate-700">Lypsyos</span>
        </div>
      </header>
      
      {/* TELA 1: FORMULÁRIO DE ENTRADA */}
      {telaAtual === 'formulario' && (
        <div className="p-6 flex flex-col md:flex-row gap-6">
          
          {/* LADO ESQUERDO: FORMULÁRIOS */}
          <div className="w-full md:w-2/3 space-y-6">
            
            {/* PARÂMETROS DO ORÇAMENTO - TEMA LYPSYOS */}
            <div className="bg-white p-6 rounded-lg shadow-sm border-t-4 border-slate-900">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  ⚙️ Parâmetros do Orçamento
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700">Cliente</label>
                  <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md p-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all" placeholder="Nome da empresa" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Imposto</label>
                  <input type="number" step="0.01" value={imposto} onChange={(e) => setImposto(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md p-2 bg-slate-50 focus:ring-2 focus:ring-cyan-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Comissão</label>
                  <input type="number" step="0.01" value={comissao} onChange={(e) => setComissao(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md p-2 bg-slate-50 focus:ring-2 focus:ring-cyan-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">R$/KG Base</label>
                  <input type="number" step="0.01" value={precoKg} onChange={(e) => setPrecoKg(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md p-2 bg-slate-50 focus:ring-2 focus:ring-cyan-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Processo</label>
                  <select value={processo} onChange={(e) => setProcesso(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md p-2 bg-slate-50 focus:ring-2 focus:ring-cyan-500 outline-none">
                    <option value="LASER">Laser CNC</option>
                    <option value="PLASMA">Plasma HD</option>
                </select>
              </div>
              </div>
            </div>

            {/* INSERÇÃO DE PEÇAS E UPLOAD DE DXF */}
            <div className="bg-white p-6 rounded-lg shadow-sm border-t-4 border-cyan-500">
              <div className="flex justify-between items-center mb-6 border-b pb-3">
                <h2 className="text-xl font-bold text-slate-900">
                  {editandoIndex !== null ? '✏️ Editando Peça' : 'Adicionar Nova Peça'}
                </h2>
                {editandoIndex !== null && (
                  <button onClick={() => { setEditandoIndex(null); limparFormulario(); }} className="text-sm text-slate-500 hover:text-red-500 transition-colors font-medium">
                    Cancelar Edição
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="col-span-2 space-y-6">
                  
                  {/* ÁREA DE UPLOAD DXF COM VALIDAÇÃO VISUAL */}
                  <div className="space-y-2">
                    <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors relative 
                      ${dxfErro ? 'border-red-400 bg-red-50 hover:bg-red-100' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                        <input 
                          type="file" 
                          accept=".dxf" 
                          onChange={handleDxfUpload} 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={isUploadingDxf}
                        />
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <svg className={`w-8 h-8 ${dxfErro ? 'text-red-500' : 'text-cyan-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                          </svg>
                          <span className={`text-sm font-semibold ${dxfErro ? 'text-red-700' : 'text-slate-700'}`}>
                              {isUploadingDxf ? 'Processando e validando vetores...' : dxfFile ? `Arquivo: ${dxfFile.name}` : 'Arraste um arquivo DXF para importar'}
                          </span>
                        </div>
                    </div>
                    
                    {/* Alerta de Validação */}
                    {dxfErro && (
                      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm flex items-start shadow-sm mt-2">
                        <span className="mr-2 font-bold">⚠️</span>
                        <p>{dxfErro}</p>
                      </div>
                    )}
                  </div>

                  <form onSubmit={adicionarOuAtualizarPeca} className="space-y-5">
                    
                    {/* Linha 1: Dados Base */}
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Identificador</label>
                        <input type="text" value={id} onChange={(e) => setId(e.target.value)} required className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="Ex: PC-01" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">QTD</label>
                        <input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} required min="1" className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Geometria</label>
                        <select value={tipoPeca} onChange={(e) => setTipoPeca(e.target.value)} className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none">
                            <option value="R">Retangular (R)</option>
                            <option value="Q">Quadrado (Q)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Espessura (mm)</label>
                        <input type="number" step="0.01" value={espessura} onChange={(e) => setEspessura(e.target.value)} required className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none" />
                      </div>
                    </div>

                    {/* Linha 2: Dimensões e Furação */}
                    <div className="grid grid-cols-5 gap-4 items-end bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Dim A (X)</label>
                        <input type="number" value={dimA} onChange={(e) => setDimA(e.target.value)} required className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Dim B (Y)</label>
                        <input type="number" value={dimB} onChange={(e) => setDimB(e.target.value)} required className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Dim C (Z/Dobra)</label>
                        <input type="number" value={dimC} onChange={(e) => setDimC(e.target.value)} className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none bg-white" placeholder="Opcional" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Nº Furos</label>
                        <input type="number" value={nFuros} onChange={(e) => setNFuros(e.target.value)} min="0" className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Ø Furo (mm)</label>
                        <input type="number" value={diaFuro} onChange={(e) => setDiaFuro(e.target.value)} min="0" step="0.1" className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none bg-white" />
                      </div>
                    </div>

                    {/* Opções Avançadas de Furação */}
                    {nFuros > 0 && (
                      <div className="bg-cyan-50 border border-cyan-200 p-3 rounded grid grid-cols-3 gap-4 items-center transition-all">
                        <div className="flex items-center space-x-2">
                          <input 
                            type="checkbox" 
                            id="checkCantos"
                            checked={furoPadraoCantos} 
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setFuroPadraoCantos(isChecked);
                              if (isChecked) setNFuros(4); 
                            }} 
                            className="w-4 h-4 text-cyan-600 rounded border-cyan-300 focus:ring-cyan-500"
                          />
                          <label htmlFor="checkCantos" className="text-sm font-bold text-cyan-900 cursor-pointer">
                            Padrão: 4 Cantos
                          </label>
                        </div>
                        
                        {furoPadraoCantos && (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-cyan-800">Offset X (mm)</label>
                              <input type="number" value={furoOffsetX} onChange={(e) => setFuroOffsetX(e.target.value)} required className="mt-1 w-full border border-cyan-200 rounded p-1 text-sm outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Ex: 25" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-cyan-800">Offset Y (mm)</label>
                              <input type="number" value={furoOffsetY} onChange={(e) => setFuroOffsetY(e.target.value)} required className="mt-1 w-full border border-cyan-200 rounded p-1 text-sm outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Ex: 25" />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <button type="submit" className={`w-full text-white font-bold py-3 rounded-md transition-all shadow-md flex justify-center items-center gap-2 ${editandoIndex !== null ? 'bg-slate-800 hover:bg-slate-900' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                      {editandoIndex !== null ? '✓ Salvar Alterações' : '+ Adicionar ao Orçamento'}
                    </button>
                  </form>
                </div>

                {/* PREVIEW CONTAINER */}
                <div className="col-span-1 h-full min-h-[250px] flex flex-col">
                  {renderPreviewPeca()}
                </div>
              </div>
            </div>
          </div>

          {/* LADO DIREITO: LISTA LATERAL */}
          <div className="w-full md:w-1/3 bg-white p-6 rounded-lg shadow-sm border-t-4 border-slate-900 flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Itens do Orçamento</h2>
              <span className="bg-cyan-100 text-cyan-800 text-xs font-bold px-3 py-1 rounded-full">{listaPecas.length} peças</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-300">
              {listaPecas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 space-y-2">
                    <svg className="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                    <p className="text-sm font-medium">Nenhuma peça cadastrada.</p>
                </div>
              ) : (
                listaPecas.map((peca, index) => (
                  <div key={index} className="border border-slate-200 p-3 rounded-lg bg-white shadow-sm relative group hover:border-cyan-400 hover:shadow-md transition-all">
                    
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-slate-800">{peca.id}</span>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => editarPeca(index)} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-slate-200 uppercase font-bold transition-colors">Editar</button>
                          <button onClick={() => removerPeca(index)} className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100 uppercase font-bold transition-colors">Remover</button>
                        </div>
                      </div>
                      <span className="text-sm font-bold bg-slate-900 text-white px-2 py-1 rounded shadow-sm">{peca.qtd} UN</span>
                    </div>
                    
                    <div className="text-xs text-slate-600 mt-3 grid grid-cols-2 gap-y-2 border-t border-slate-100 pt-3">
                      <p>Espessura: <b className="text-slate-800">{peca.espessura}mm</b></p>
                      <p>Dim: <b className="text-slate-800">{peca.dimA}x{peca.dimB}</b></p>
                      <p>Peso Unt: <b className="text-slate-800">{peca.pesoUnitario}kg</b></p>
                      <p className="text-cyan-700 font-semibold">Peso Tot: <b>{peca.pesoTotal}kg</b></p>
                      {peca.nFuros > 0 && (
                         <p className="col-span-2 text-slate-500 bg-slate-50 p-1 rounded">
                           ⚙️ {peca.nFuros} Furo(s) Ø{peca.diaFuro} 
                           {peca.furoPadraoCantos ? ` (${peca.furoOffsetX}x${peca.furoOffsetY})` : ''}
                         </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {listaPecas.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                {/* Aqui está o botão chamando prepararProcessamento */}
                <button onClick={prepararProcessamento} className="w-full bg-slate-900 text-white py-3 rounded-md font-bold hover:bg-slate-800 transition-colors flex justify-center items-center gap-2 shadow-lg hover:shadow-xl">
                  Processar Orçamento ➔
                </button>
              </div>
            )}
          </div>

        </div>
      )}
      

      {/* TELA 2: DASHBOARD DE RESULTADO PROCESSADO */}
      {telaAtual === 'resultado' && resultadoOrcamento && (
        <div className="p-8 max-w-6xl mx-auto mt-6">
           <div className="bg-white rounded-xl shadow-2xl border-t-8 border-cyan-500 overflow-hidden">
              
              {/* Cabeçalho do Orçamento */}
              <div className="bg-slate-900 p-8 text-white flex justify-between items-start">
                 <div>
                    <h1 className="text-3xl font-black uppercase tracking-wider">
                      Resumo de <span className="text-cyan-400">Produção</span>
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">
                      Cliente: <span className="font-bold text-white">{cliente || 'Consumidor Final'}</span>
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                      Processo: <span className="bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded uppercase font-bold">{processo}</span>
                    </p>
                 </div>
                 
                 {/* Contêiner de botões com a classe print:hidden para não aparecer no PDF */}
                 <div className="flex gap-4 print:hidden">
                    <button 
                       onClick={() => setTelaAtual('formulario')} 
                       className="bg-slate-700 text-white px-5 py-2.5 rounded-md font-bold hover:bg-slate-600 transition shadow-lg flex items-center gap-2"
                    >
                       ← Nova Edição
                    </button>
                    
                    {/* Botão para Baixar/Imprimir o PDF */}
                    <button 
                       onClick={baixarPDF} 
                       className="bg-cyan-500 text-slate-900 px-5 py-2.5 rounded-md font-bold hover:bg-cyan-400 transition shadow-lg flex items-center gap-2"
                    >
                       📄 Baixar PDF
                    </button>
                 </div>
              </div>

              {/* TOTAIS GLOBAIS (Cards Topo) */}
              <div className="p-8 bg-slate-50 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                   📊 Totais Globais do Orçamento
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                   <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-center">
                      <p className="text-xs font-bold text-slate-500 uppercase">Total Peças</p>
                      <p className="text-2xl font-black text-slate-900 mt-1">{resultadoOrcamento.totais_globais.total_pecas}</p>
                   </div>
                   <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-center">
                      <p className="text-xs font-bold text-slate-500 uppercase">Chapas Totais</p>
                      <p className="text-2xl font-black text-slate-900 mt-1">{resultadoOrcamento.totais_globais.chapas_totais}</p>
                   </div>
                   <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-center">
                      <p className="text-xs font-bold text-slate-500 uppercase">Peso Total (Kg)</p>
                      <p className="text-2xl font-black text-slate-900 mt-1">{resultadoOrcamento.totais_globais.peso_total_kg}</p>
                   </div>
                   <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-center">
                      <p className="text-xs font-bold text-slate-500 uppercase">Tempo Máquina</p>
                      <p className="text-2xl font-black text-slate-900 mt-1">
                        {Math.floor(resultadoOrcamento.totais_globais.tempo_total_min / 60)}h {Math.round(resultadoOrcamento.totais_globais.tempo_total_min % 60)}m
                      </p>
                   </div>
                   <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200 shadow-sm text-center">
                      <p className="text-xs font-bold text-cyan-800 uppercase">Custo Material Base</p>
                      <p className="text-2xl font-black text-cyan-700 mt-1">
                         R$ {resultadoOrcamento.totais_globais.custo_total.toFixed(2)}
                      </p>
                   </div>
                </div>
              </div>

              {/* DETALHAMENTO POR ESPESSURA (Tabela Padrão Mercado) */}
              <div className="p-8">
                 <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                   ⚙️ Necessidade de Materiais (Por Espessura)
                 </h3>
                 <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
                    <table className="w-full text-left border-collapse">
                       <thead>
                          <tr className="bg-slate-800 text-white text-sm uppercase tracking-wider">
                             <th className="p-4 font-semibold text-center border-b-2 border-cyan-500">Esp. (mm)</th>
                             <th className="p-4 font-semibold border-b-2 border-cyan-500">Qtd Peças</th>
                             <th className="p-4 font-semibold text-center border-b-2 border-cyan-500">Chapas (Qtd x Tam)</th>
                             <th className="p-4 font-semibold border-b-2 border-cyan-500">Tempo de Corte</th>
                             <th className="p-4 font-semibold border-b-2 border-cyan-500">Peso (Kg)</th>
                             <th className="p-4 font-semibold text-right border-b-2 border-cyan-500">Montante R$</th>
                          </tr>
                       </thead>
                       <tbody className="bg-white divide-y divide-slate-100">
                          {resultadoOrcamento.detalhamento_espessuras.map((item, index) => (
                             <tr key={index} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-black text-center text-slate-900 bg-slate-100">{item.espessura.toFixed(2)}</td>
                                <td className="p-4 font-medium text-slate-700">{item.qtd_pecas}</td>
                                
                                {/* Exibição das Chapas + Dimensões atualizadas pelo Modal */}
                                <td className="p-4 text-center">
                                  <span className="bg-cyan-100 text-cyan-800 font-bold px-3 py-1 rounded-full text-sm block">
                                    {item.chapas_necessarias} un
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                                    {item.dimensao_chapa}
                                  </span>
                                </td>
                                
                                <td className="p-4 font-mono text-slate-600 text-sm">
                                  {Math.floor(item.tempo_min / 60)}h {Math.round(item.tempo_min % 60)}m
                                </td>
                                <td className="p-4 font-medium text-slate-700">{item.peso_kg.toFixed(2)} Kg</td>
                                <td className="p-4 font-bold text-right text-slate-800">R$ {item.custo_material.toFixed(2)}</td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
              
           </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE CHAPAS (Oculto na impressão devido a ser renderizado condicionalmente) */}
      {isModalChapasOpen && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-80 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 p-5 border-b-4 border-cyan-500">
              <h3 className="text-xl font-bold text-white uppercase tracking-wide">📐 Definição de Chapas</h3>
              <p className="text-slate-400 text-sm mt-1">Informe a dimensão do material por espessura</p>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              {Object.keys(chapasConfig).map(esp => (
                <div key={esp} className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex items-center justify-between gap-4">
                  <div className="bg-slate-800 text-white font-black text-lg h-12 w-16 flex items-center justify-center rounded">
                    {esp}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Largura (mm)</label>
                      <input 
                        type="number" 
                        value={chapasConfig[esp].largura} 
                        onChange={(e) => handleChapaChange(esp, 'largura', e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Comp. (mm)</label>
                      <input 
                        type="number" 
                        value={chapasConfig[esp].comprimento} 
                        onChange={(e) => handleChapaChange(esp, 'comprimento', e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 bg-slate-100 flex justify-end gap-3 border-t border-slate-200">
              <button onClick={() => setIsModalChapasOpen(false)} className="px-5 py-2 font-bold text-slate-600 hover:text-slate-800 transition">
                Cancelar
              </button>
              <button onClick={handleSalvar} className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded font-bold shadow transition flex items-center justify-center">
                Confirmar e Processar ➔
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
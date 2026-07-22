import { useEffect, useState } from 'react';

const DEFAULT_PARAMETROS_MATERIAIS = [
  { id: 'laser-aco-carbono-1-50', maquina: 'LASER', material: 'Aço Carbono', espessura: 1.50, precoKg: 8.50, velocidadeCorte: 21250, valorHora: 180.00 },
  { id: 'laser-aco-carbono-3-00', maquina: 'LASER', material: 'Aço Carbono', espessura: 3.00, precoKg: 8.50, velocidadeCorte: 12750, valorHora: 180.00 },
  { id: 'laser-inox-1-50', maquina: 'LASER', material: 'Inox', espessura: 1.50, precoKg: 25.00, velocidadeCorte: 21250, valorHora: 220.00 },
  { id: 'plasma-aco-carbono-3-00', maquina: 'PLASMA', material: 'Aço Carbono', espessura: 3.00, precoKg: 8.50, velocidadeCorte: 4378, valorHora: 150.00 }
];

function App() {
  const dataEmissao = new Date();
  const validadeOrcamento = new Date(dataEmissao.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 1. ESTADOS GLOBAIS
  const [cliente, setCliente] = useState('');
  const [imposto, setImposto] = useState(18);
  const [comissao, setComissao] = useState(2);
  const [margemLucro, setMargemLucro] = useState(25);
  const [frete, setFrete] = useState(31);
  const [parametrosMateriais, setParametrosMateriais] = useState(DEFAULT_PARAMETROS_MATERIAIS);
  const [maquinaSelecionada, setMaquinaSelecionada] = useState('LASER');
  const [materialSelecionado, setMaterialSelecionado] = useState('Aço Carbono');
  const [espessuraSelecionada, setEspessuraSelecionada] = useState('1.50');
  const [editandoParametroIndex, setEditandoParametroIndex] = useState(null);
  const [abaGlobal, setAbaGlobal] = useState('materiais');
  const [formParametro, setFormParametro] = useState({
    maquina: 'LASER',
    material: 'Aço Carbono',
    espessura: '1.50',
    precoKg: '8.50',
    velocidadeCorte: '21250',
    valorHora: '180.00'
  });

  // 2. ESTADOS DA PEÇA ATUAL
  const [id, setId] = useState('');
  const [processo, setProcesso] = useState('LASER');
  const [qtd, setQtd] = useState('');
  const [tipoPeca, setTipoPeca] = useState('R');
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
  const [dxfImportado, setDxfImportado] = useState(false);
  const [dxfPerimetroCorteMm, setDxfPerimetroCorteMm] = useState(0);
  const [dxfAreaUtilMm2, setDxfAreaUtilMm2] = useState(0);

  // 3. LISTA E CONTROLE DE EDIÇÃO
  const [listaPecas, setListaPecas] = useState([]);
  const [editandoIndex, setEditandoIndex] = useState(null);

  // 4. CONTROLE DE TELAS E RESULTADOS
  const [telaAtual, setTelaAtual] = useState('formulario'); 
  const [resultadoOrcamento, setResultadoOrcamento] = useState(null);
  const [fatorNesting] = useState(0.7);

  // 5. ESTADOS DO MODAL DE CHAPAS
  const [isModalChapasOpen, setIsModalChapasOpen] = useState(false);
  const [chapasConfig, setChapasConfig] = useState({});

  useEffect(() => {
    const parametrosSalvos = localStorage.getItem('parametrosMateriais');

    if (parametrosSalvos) {
      try {
        const lista = JSON.parse(parametrosSalvos);
        if (Array.isArray(lista) && lista.length > 0) {
          setParametrosMateriais(
            lista.map((item, index) => ({
              id: item.id || `${item.material}-${item.espessura}-${index}`,
              maquina: item.maquina || 'LASER',
              material: item.material,
              espessura: Number(item.espessura),
              precoKg: Number(item.precoKg),
              velocidadeCorte: Number(item.velocidadeCorte),
              valorHora: Number(item.valorHora || 180)
            }))
          );
        }
      } catch (erro) {
        console.error('Falha ao carregar parametrização local', erro);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('parametrosMateriais', JSON.stringify(parametrosMateriais));
  }, [parametrosMateriais]);

  const parametrosOrdenados = [...parametrosMateriais].sort((a, b) => {
    if (a.maquina === b.maquina) {
      if (a.material === b.material) {
        return a.espessura - b.espessura;
      }
      return a.material.localeCompare(b.material);
    }
    return a.maquina.localeCompare(b.maquina);
  });

  const maquinasDisponiveis = [...new Set(parametrosOrdenados.map((item) => item.maquina))];
  const materiaisDisponiveis = [...new Set(parametrosOrdenados.filter((item) => item.maquina === maquinaSelecionada).map((item) => item.material))];
  const espessurasDisponiveis = parametrosOrdenados
    .filter((item) => item.maquina === maquinaSelecionada && item.material === materialSelecionado)
    .map((item) => item.espessura.toFixed(2));

  const parametroAtual = parametrosOrdenados.find(
    (item) => item.maquina === maquinaSelecionada && item.material === materialSelecionado && item.espessura.toFixed(2) === espessuraSelecionada
  );

  const atualizarFormParametro = (campo, valor) => {
    setFormParametro((prev) => ({
      ...prev,
      [campo]: valor
    }));
  };

  const limparFormParametro = () => {
    setEditandoParametroIndex(null);
    setFormParametro({
      maquina: 'LASER',
      material: 'Aço Carbono',
      espessura: '1.50',
      precoKg: '8.50',
      velocidadeCorte: '21250',
      valorHora: '180.00'
    });
  };

  const gerarParametroId = (parametro) => {
    const slugMaterial = parametro.material.trim().toLowerCase().replace(/\s+/g, '-');
    return `${parametro.maquina.toLowerCase()}-${slugMaterial}-${parametro.espessura}`;
  };

  const salvarParametroMaterial = (e) => {
    e.preventDefault();

    const novoParametro = {
      id: editandoParametroIndex || gerarParametroId(formParametro),
      maquina: formParametro.maquina,
      material: formParametro.material.trim(),
      espessura: parseFloat(formParametro.espessura),
      precoKg: parseFloat(formParametro.precoKg),
      velocidadeCorte: parseFloat(formParametro.velocidadeCorte),
      valorHora: parseFloat(formParametro.valorHora)
    };

    if (!novoParametro.material || Number.isNaN(novoParametro.espessura) || Number.isNaN(novoParametro.precoKg) || Number.isNaN(novoParametro.velocidadeCorte) || Number.isNaN(novoParametro.valorHora)) {
      alert('Preencha máquina, material, espessura, preço/kg, velocidade de corte e valor por hora.');
      return;
    }

    setParametrosMateriais((prev) => {
      if (editandoParametroIndex !== null) {
        return prev.map((item) => (item.id === editandoParametroIndex ? novoParametro : item));
      }
      return [...prev, novoParametro];
    });

    setMaquinaSelecionada(novoParametro.maquina);
    setMaterialSelecionado(novoParametro.material);
    setEspessuraSelecionada(novoParametro.espessura.toFixed(2));
    limparFormParametro();
  };

  const editarParametroMaterial = (index) => {
    const parametro = parametrosOrdenados[index];

    setEditandoParametroIndex(parametro.id);
    setFormParametro({
      maquina: parametro.maquina,
      material: parametro.material,
      espessura: parametro.espessura.toFixed(2),
      precoKg: parametro.precoKg.toFixed(2),
      velocidadeCorte: parametro.velocidadeCorte.toString(),
      valorHora: parametro.valorHora.toFixed(2)
    });
    setTelaAtual('parametrizacao');
  };

  const removerParametroMaterial = (index) => {
    const parametro = parametrosOrdenados[index];
    setParametrosMateriais((prev) => prev.filter((item) => item.id !== parametro.id));

    if (editandoParametroIndex === parametro.id) {
      limparFormParametro();
    }
  };

  const selecionarMaterial = (novoMaterial) => {
    setMaterialSelecionado(novoMaterial);

    const primeiraEspessuraDoMaterial = parametrosOrdenados.find((item) => item.maquina === maquinaSelecionada && item.material === novoMaterial);
    setEspessuraSelecionada(primeiraEspessuraDoMaterial ? primeiraEspessuraDoMaterial.espessura.toFixed(2) : '');
  };

  const handleDxfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setDxfFile(file);
    setIsUploadingDxf(true);
    setDxfErro(null);
    setDxfPreviewSvg(null);
    setDxfImportado(false);
    setDxfPerimetroCorteMm(0);
    setDxfAreaUtilMm2(0);

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
      setDxfPerimetroCorteMm(Number(dados.perimetroCorteMm || 0));
      setDxfAreaUtilMm2(Number(dados.areaUtilMm2 || 0));
      setDxfImportado(true);
      
      setIsUploadingDxf(false);

    } catch (error) {
      console.error("Erro ao processar DXF", error);
      setDxfErro("Falha de rede ao tentar comunicar com o motor de processamento.");
      setIsUploadingDxf(false);
    }
  };

  const adicionarOuAtualizarPeca = (e) => {
    e.preventDefault();

    if (!parametroAtual) {
      alert('Cadastre uma parametrização para o material e a espessura selecionados.');
      return;
    }

    const areaBaseMm2 = dxfImportado && dxfAreaUtilMm2 > 0 ? dxfAreaUtilMm2 : parseFloat(dimA || 0) * parseFloat(dimB || 0);
    const perimetroCorteMm = dxfImportado && dxfPerimetroCorteMm > 0 ? dxfPerimetroCorteMm : 2 * (parseFloat(dimA || 0) + parseFloat(dimB || 0));
    const volume = areaBaseMm2 * parseFloat(espessuraSelecionada || 0);
    const pesoUnitario = (volume * 7.85) / 1000000; 
    const pesoTotal = pesoUnitario * parseInt(qtd || 1);

    const novaPeca = {
      id,
      qtd: parseInt(qtd),
      tipoPeca,
      maquina: maquinaSelecionada,
      material: parametroAtual.material,
      espessura: parametroAtual.espessura,
      precoKgBase: parametroAtual.precoKg,
      velocidadeCorte: parametroAtual.velocidadeCorte,
      valorHora: parametroAtual.valorHora,
      dimA: Number(dimA) || 0,
      dimB: Number(dimB) || 0,
      dimC: Number(dimC) || 0,
      perimetroCorteMm,
      areaUtilMm2: areaBaseMm2,
      dxfImportado,
      nFuros: parseInt(nFuros || 0),
      diaFuro: Number(diaFuro) || 0,
      furoPadraoCantos,
      furoOffsetX: Number(furoOffsetX) || 0,
      furoOffsetY: Number(furoOffsetY) || 0,
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
    setId(''); setDimA(''); setDimB(''); setDimC(''); setQtd('');
    setNFuros(0); setDiaFuro(0); setFuroPadraoCantos(false); setFuroOffsetX(''); setFuroOffsetY('');
    setDxfFile(null); setDxfPreviewSvg(null); setDxfErro(null);
    setDxfImportado(false);
    setDxfPerimetroCorteMm(0);
    setDxfAreaUtilMm2(0);

    const maquinaPadrao = maquinasDisponiveis[0] || 'LASER';
    setMaquinaSelecionada(maquinaPadrao);
    setProcesso(maquinaPadrao);

    const primeiroParametroDaMaquina = parametrosOrdenados.find((item) => item.maquina === maquinaPadrao);

    if (primeiroParametroDaMaquina) {
      setMaterialSelecionado(primeiroParametroDaMaquina.material);
      setEspessuraSelecionada(primeiroParametroDaMaquina.espessura.toFixed(2));
    } else {
      setMaterialSelecionado('');
      setEspessuraSelecionada('');
    }
  };

  const prepararProcessamento = () => {
    const espessurasUnicas = [...new Set(listaPecas.map(p => p.espessura.toFixed(2)))];
    const configInicial = {};
    
    espessurasUnicas.forEach(esp => {
      configInicial[esp] = { largura: 1200, comprimento: 3000 };
    });
    
    setChapasConfig(configInicial);
    setIsModalChapasOpen(true);
  };

  const handleChapaChange = (esp, campo, valor) => {
    setChapasConfig(prev => ({
      ...prev,
      [esp]: { ...prev[esp], [campo]: parseFloat(valor) || 0 }
    }));
  };

  const baixarPDF = () => {
    const tituloOriginal = document.title;
    document.title = `Orcamento-${cliente || 'cliente'}`;
    window.print();
    window.setTimeout(() => {
      document.title = tituloOriginal;
    }, 0);
  };

  const removerPeca = (indexParaRemover) => {
    setListaPecas(listaPecas.filter((_, index) => index !== indexParaRemover));
  };

  const editarPeca = (index) => {
    const peca = listaPecas[index];
    setId(peca.id); setQtd(peca.qtd); setTipoPeca(peca.tipoPeca);
    setProcesso(peca.maquina || 'LASER');
    setMaquinaSelecionada(peca.maquina || 'LASER');
    setMaterialSelecionado(peca.material || '');
    setEspessuraSelecionada(Number(peca.espessura).toFixed(2));
    setDimA(peca.dimA); setDimB(peca.dimB); setDimC(peca.dimC); setNFuros(peca.nFuros); setDiaFuro(peca.diaFuro);
    setFuroPadraoCantos(peca.furoPadraoCantos); setFuroOffsetX(peca.furoOffsetX); setFuroOffsetY(peca.furoOffsetY);
    setEditandoIndex(index);
  };

  const handleSalvar = async () => {
    setIsModalChapasOpen(false); 
    
    const pacoteDeDados = { 
      cliente, 
      imposto: parseFloat(imposto), 
      comissao: parseFloat(comissao), 
      margemLucro: parseFloat(margemLucro),
      precoKg: 0,
      frete: parseFloat(frete), 
      processo, 
      pecas: listaPecas,
      configChapas: chapasConfig,
      fatorNesting
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

  const renderPreviewPeca = () => {
    if (isUploadingDxf) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1626] rounded-lg p-4 relative overflow-hidden border border-slate-700 shadow-inner min-h-[250px]">
           <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
           <span className="text-orange-400 text-sm font-mono mt-3">Analisando vetores...</span>
        </div>
      );
    }

    if (dxfPreviewSvg) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1626] rounded-lg p-4 relative overflow-hidden border border-slate-700 shadow-inner min-h-[250px]">
          <span className="absolute top-2 left-2 text-xs font-mono text-orange-400">Preview Real (DXF)</span>
          <div 
            className="w-full h-full drop-shadow-2xl flex items-center justify-center preview-svg-container"
            dangerouslySetInnerHTML={{ __html: dxfPreviewSvg.replace(/#00C4CC/g, '#F97316') }} 
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
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0A0A] rounded-lg p-4 relative overflow-hidden border border-slate-800 shadow-inner min-h-[250px]">
        <span className="absolute top-2 left-2 text-xs font-mono text-slate-500">Preview Geométrico</span>
        
        <svg viewBox={`0 0 ${w + 40} ${h + 40}`} className="w-full h-full max-h-48 drop-shadow-2xl">
          <rect x="20" y="20" width={w} height={h} fill="none" stroke="#F97316" strokeWidth="2" rx="2" strokeDasharray="4 2" />
          {furos > 0 && (
            furoPadraoCantos && furos === 4 ? (
              <>
                <circle cx={20 + offX} cy={20 + offY} r={raioFuro} fill="#F97316" />
                <circle cx={20 + w - offX} cy={20 + offY} r={raioFuro} fill="#F97316" />
                <circle cx={20 + offX} cy={20 + h - offY} r={raioFuro} fill="#F97316" />
                <circle cx={20 + w - offX} cy={20 + h - offY} r={raioFuro} fill="#F97316" />
              </>
            ) : (
              furos <= 5 ? (
                Array.from({ length: furos }).map((_, i) => (
                  <circle key={i} cx={20 + (w / (furos + 1)) * (i + 1)} cy={20 + h / 2} r={raioFuro} fill="#F97316" />
                ))
              ) : (
                <text x={20 + w/2} y={20 + h/2} textAnchor="middle" fill="#F97316" fontSize={Math.min(w, h) * 0.2}>+{furos} Furos</text>
              )
            )
          )}
        </svg>
        <div className="mt-2 text-center text-xs text-orange-500 font-mono">
          Eixos: X={w}mm | Y={h}mm
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.1),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] font-sans text-slate-900 overflow-hidden">
      
      {/* 🚀 HEADER / NAVBAR */}
<header className="bg-slate-950/95 backdrop-blur border-b border-orange-500/30 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.9)] px-4 lg:px-8 py-3 lg:py-4 flex flex-col sm:flex-row justify-between items-center shrink-0 z-50 gap-3 print:hidden">
  <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
    
    {/* 👇 AQUI ESTÁ A SUBSTITUIÇÃO DO LOGO */}
    <img 
      src="/logo-geoquote.svg" 
      alt="GeoQuote Logo" 
      className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl object-cover shadow-lg ring-1 ring-orange-400/30 shrink-0" 
    />

    <h1 className="text-xl lg:text-2xl font-black tracking-tight text-white uppercase">
      Geo<span className="text-orange-500">Quote</span>
    </h1>
  </div>
  
  <div className="flex flex-wrap items-center justify-center gap-2">
    <button onClick={() => setTelaAtual('formulario')} className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-full border border-white/10 bg-white/5 text-white text-xs lg:text-sm hover:bg-orange-500 hover:text-white transition-all shadow-sm">Orçamento</button>
    <button onClick={() => setTelaAtual('parametrizacao')} className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 text-xs lg:text-sm hover:bg-orange-500 hover:text-white transition-all shadow-sm">Parâmetros Globais</button>
    <span className="hidden sm:inline-block text-white font-bold tracking-widest uppercase text-[10px] lg:text-xs bg-slate-800 px-2 py-1.5 lg:px-3 lg:py-2 rounded-full border border-slate-700">Lypsyos</span>
  </div>
</header>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 relative overflow-hidden">
        
        {/* TELA: PARAMETRIZAÇÃO GLOBAIS */}
        {telaAtual === 'parametrizacao' && (
          <div className="absolute inset-0 p-4 lg:p-6 overflow-y-auto scrollbar-thin">
            <div className="max-w-7xl mx-auto space-y-6 pb-10">
              <div className="bg-white/90 backdrop-blur rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.45)] border border-slate-200/70 border-t-4 border-orange-500 p-4 lg:p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Parâmetros Globais</h2>
                    <p className="text-sm text-slate-500 mt-1">Matéria-prima, taxa horária e impostos em abas separadas.</p>
                  </div>
                  <button onClick={() => setTelaAtual('formulario')} className="bg-slate-900 text-white px-5 py-2.5 rounded-full font-bold hover:bg-slate-800 transition-all text-sm w-full md:w-auto text-center">
                    Voltar ao orçamento
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-100 rounded-full w-full sm:w-fit">
                  <button
                    type="button"
                    onClick={() => setAbaGlobal('materiais')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs lg:text-sm font-bold transition-all ${abaGlobal === 'materiais' ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Matéria-prima
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbaGlobal('tarifacao')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs lg:text-sm font-bold transition-all ${abaGlobal === 'tarifacao' ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Tarifação/Impostos
                  </button>
                </div>

                {abaGlobal === 'materiais' ? (
                  <form onSubmit={salvarParametroMaterial} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end bg-slate-50/90 p-4 rounded-2xl border border-slate-200 shadow-inner">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Máquina</label>
                      <select value={formParametro.maquina} onChange={(e) => atualizarFormParametro('maquina', e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 bg-white focus:ring-2 focus:ring-orange-500 outline-none text-sm">
                        {(maquinasDisponiveis.length > 0 ? maquinasDisponiveis : ['LASER', 'PLASMA']).map((maquina) => (
                          <option key={maquina} value={maquina}>{maquina === 'LASER' ? 'Laser' : 'Plasma'}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase">Material</label>
                      <input type="text" value={formParametro.material} onChange={(e) => atualizarFormParametro('material', e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm" placeholder="Ex: Aço Carbono"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Espessura</label>
                      <input type="number" step="0.01" value={formParametro.espessura} onChange={(e) => atualizarFormParametro('espessura', e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Preço/kg</label>
                      <input type="number" step="0.01" value={formParametro.precoKg} onChange={(e) => atualizarFormParametro('precoKg', e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Velocidade</label>
                      <input type="number" step="1" value={formParametro.velocidadeCorte} onChange={(e) => atualizarFormParametro('velocidadeCorte', e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">R$/Hora</label>
                      <input type="number" step="0.01" value={formParametro.valorHora} onChange={(e) => atualizarFormParametro('valorHora', e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-6 flex flex-col sm:flex-row gap-3 justify-end pt-2">
                      {editandoParametroIndex !== null && (
                        <button type="button" onClick={limparFormParametro} className="w-full sm:w-auto px-5 py-2.5 rounded-full border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 text-sm">Cancelar edição</button>
                      )}
                      <button type="submit" className="w-full sm:w-auto bg-orange-500 text-white px-6 py-2.5 rounded-full font-bold shadow-lg hover:bg-orange-600 text-sm">
                        {editandoParametroIndex !== null ? 'Salvar' : 'Adicionar'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-slate-50/90 p-4 lg:p-5 rounded-2xl border border-slate-200 shadow-inner space-y-4">
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">Tarifação e Impostos</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Imposto (%)</label>
                          <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white pr-2 shadow-sm"><input type="number" step="0.01" value={imposto} onChange={(e) => setImposto(e.target.value)} className="w-full rounded-xl p-2 text-sm outline-none"/><span className="text-slate-400 font-black text-xs">%</span></div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Comissão (%)</label>
                          <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white pr-2 shadow-sm"><input type="number" step="0.01" value={comissao} onChange={(e) => setComissao(e.target.value)} className="w-full rounded-xl p-2 text-sm outline-none"/><span className="text-slate-400 font-black text-xs">%</span></div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">MARKUP (%)</label>
                          <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white pr-2 shadow-sm"><input type="number" step="0.01" value={margemLucro} onChange={(e) => setMargemLucro(e.target.value)} className="w-full rounded-xl p-2 text-sm outline-none"/><span className="text-slate-400 font-black text-xs">%</span></div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Frete (R$)</label>
                          <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white px-2 shadow-sm"><span className="text-slate-400 font-black text-xs">R$</span><input type="number" step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} className="w-full rounded-xl p-2 text-sm outline-none text-right"/></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {abaGlobal === 'materiais' && (
                <div className="bg-white/90 backdrop-blur rounded-3xl shadow-lg border border-slate-200 overflow-hidden">
                  <div className="p-4 lg:p-6 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-base lg:text-lg font-bold text-slate-900">Parâmetros cadastrados</h3>
                    <span className="text-xs font-semibold text-slate-500">{parametrosOrdenados.length} reg.</span>
                  </div>
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left min-w-[600px]">
                      <thead className="bg-slate-950 text-white text-[10px] lg:text-xs uppercase tracking-wider">
                        <tr>
                          <th className="p-3 lg:p-4">Máquina</th><th className="p-3 lg:p-4">Material</th><th className="p-3 lg:p-4">Espessura</th>
                          <th className="p-3 lg:p-4">R$/Kg</th><th className="p-3 lg:p-4">R$/Hora</th><th className="p-3 lg:p-4">Velocidade</th>
                          <th className="p-3 lg:p-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white text-xs lg:text-sm">
                        {parametrosOrdenados.map((item, index) => (
                          <tr key={item.id || index} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 lg:p-4 font-semibold text-orange-600">{item.maquina}</td><td className="p-3 lg:p-4 font-semibold">{item.material}</td><td className="p-3 lg:p-4">{item.espessura.toFixed(2)} mm</td>
                            <td className="p-3 lg:p-4">R$ {item.precoKg.toFixed(2)}</td><td className="p-3 lg:p-4">R$ {Number(item.valorHora || 0).toFixed(2)}</td><td className="p-3 lg:p-4">{item.velocidadeCorte} mm/min</td>
                            <td className="p-3 lg:p-4 text-right">
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => editarParametroMaterial(index)} className="text-[10px] bg-slate-100 px-2 py-1.5 lg:px-3 lg:py-2 rounded-full font-bold">Editar</button>
                                <button onClick={() => removerParametroMaterial(index)} className="text-[10px] bg-red-50 text-red-600 px-2 py-1.5 lg:px-3 lg:py-2 rounded-full font-bold">Excluir</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* TELA: FORMULÁRIO DE ENTRADA */}
        {telaAtual === 'formulario' && (
          <div className="absolute inset-0 p-4 lg:p-6 flex flex-col lg:flex-row gap-6 overflow-y-auto lg:overflow-hidden">
            
            <div className="w-full lg:w-[65%] space-y-6 lg:overflow-y-auto lg:h-full lg:pr-4 pb-4 lg:pb-10 scrollbar-thin">
              
              <div className="bg-white/90 backdrop-blur p-4 lg:p-6 rounded-3xl shadow-[0_4px_20px_-5px_rgba(0,0,0,0.1)] border border-slate-200 border-t-4 border-slate-900">
                <h2 className="text-lg lg:text-xl font-black text-slate-900 mb-4 flex items-center gap-2">⚙️ Parâmetros do Orçamento</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">Cliente</label>
                    <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white" placeholder="Nome da empresa" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Máquina</label>
                    <select value={maquinaSelecionada} onChange={(e) => { setMaquinaSelecionada(e.target.value); setProcesso(e.target.value); }} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500 outline-none">
                      {(maquinasDisponiveis.length > 0 ? maquinasDisponiveis : ['LASER', 'PLASMA']).map((maquina) => (
                        <option key={maquina} value={maquina}>{maquina === 'LASER' ? 'Laser CNC' : 'Plasma HD'}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700">Material Base</label>
                    <select value={materialSelecionado} onChange={(e) => selecionarMaterial(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-orange-500 outline-none">
                      {materiaisDisponiveis.length === 0 ? <option value="">Cadastre um material</option> : materiaisDisponiveis.map((material) => <option key={material} value={material}>{material}</option>)}
                    </select>
                  </div>
                </div>
                {parametroAtual && (
                  <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs lg:text-sm text-orange-900 grid grid-cols-2 sm:grid-cols-3 lg:flex gap-3 lg:gap-4 shadow-sm">
                    <span className="truncate"><b>Máquina:</b> {parametroAtual.maquina}</span>
                    <span className="truncate"><b>R$/kg:</b> R$ {parametroAtual.precoKg.toFixed(2)}</span>
                    <span className="truncate"><b>R$/Hora:</b> R$ {parametroAtual.valorHora.toFixed(2)}</span>
                    <span className="truncate"><b>Vel:</b> {parametroAtual.velocidadeCorte} mm/m</span>
                    <span className="col-span-2 sm:col-span-1 truncate"><b>Frete:</b> R$ {Number(frete).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* INSERÇÃO DE PEÇAS E UPLOAD DE DXF */}
              <div className="bg-white/90 backdrop-blur p-4 lg:p-6 rounded-3xl shadow-[0_4px_20px_-5px_rgba(0,0,0,0.1)] border border-slate-200 border-t-4 border-orange-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 border-b border-slate-200 pb-3 gap-2">
                  <h2 className="text-lg lg:text-xl font-black text-slate-900">
                    {editandoIndex !== null ? '✏️ Editando Peça' : 'Adicionar Nova Peça'}
                  </h2>
                  {editandoIndex !== null && (
                    <button onClick={() => { setEditandoIndex(null); limparFormulario(); }} className="text-xs text-slate-500 hover:text-red-500 font-bold uppercase w-full sm:w-auto text-left sm:text-right">Cancelar Edição</button>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  
                  <div className="xl:col-span-2 space-y-5">
                    
                    <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors relative 
                      ${dxfErro ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-slate-50'}`}>
                        <input type="file" accept=".dxf" onChange={handleDxfUpload} disabled={isUploadingDxf} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                        <div className="flex flex-col items-center justify-center space-y-1 lg:space-y-2">
                          <svg className={`w-6 h-6 lg:w-8 lg:h-8 ${dxfErro ? 'text-red-500' : 'text-orange-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                          <span className={`text-xs lg:text-sm font-semibold truncate px-2 w-full ${dxfErro ? 'text-red-700' : 'text-slate-700'}`}>
                              {isUploadingDxf ? 'Analisando...' : dxfFile ? dxfFile.name : 'Toque ou arraste um DXF'}
                          </span>
                        </div>
                    </div>

                    {dxfImportado && (
                      <div className="grid grid-cols-3 gap-2 text-[10px] lg:text-xs text-center">
                        <div className="bg-slate-900 text-white rounded-xl p-2 shadow-sm"><p className="text-slate-400">Perímetro</p><p className="text-sm font-bold text-orange-400 truncate">{dxfPerimetroCorteMm.toFixed(2)}</p></div>
                        <div className="bg-slate-900 text-white rounded-xl p-2 shadow-sm"><p className="text-slate-400">Área útil</p><p className="text-sm font-bold text-orange-400 truncate">{dxfAreaUtilMm2.toFixed(2)}</p></div>
                        <div className="bg-slate-900 text-white rounded-xl p-2 shadow-sm"><p className="text-slate-400">Furos</p><p className="text-sm font-bold text-orange-400 truncate">{nFuros}</p></div>
                      </div>
                    )}

                    <form onSubmit={adicionarOuAtualizarPeca} className="space-y-4">
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Identificador</label>
                          <input type="text" value={id} onChange={(e) => setId(e.target.value)} required className="mt-1 w-full border border-slate-300 rounded-xl p-2 text-sm focus:ring-orange-500 outline-none" placeholder="Ex: PC-01" />
                        </div>
                        <div>
                          <label className="block text-[10px] lg:text-xs font-bold text-slate-500 uppercase">QTD</label>
                          <input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} required min="1" className="mt-1 w-full border border-slate-300 rounded-xl p-2 text-sm focus:ring-orange-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Geometria</label>
                          <select value={tipoPeca} onChange={(e) => setTipoPeca(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-2 text-sm focus:ring-orange-500 outline-none">
                              <option value="R">Retangular</option>
                              <option value="Q">Quadrado</option>
                          </select>
                        </div>
                      </div>

                      <div className="w-full">
                        <label className="block text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Espessura (mm)</label>
                        <select value={espessuraSelecionada} onChange={(e) => setEspessuraSelecionada(e.target.value)} required disabled={espessurasDisponiveis.length === 0} className="mt-1 w-full border border-slate-300 rounded-xl p-2 text-sm focus:ring-orange-500 outline-none bg-white">
                          {espessurasDisponiveis.length === 0 ? <option value="">Selecione material</option> : espessurasDisponiveis.map((esp) => <option key={esp} value={esp}>{esp} mm</option>)}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-700">Dim A (X)</label>
                          <input type="number" value={dimA} onChange={(e) => setDimA(e.target.value)} required disabled={dxfImportado} className="mt-1 w-full border border-slate-300 rounded p-2 text-sm outline-none bg-white" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-700">Dim B (Y)</label>
                          <input type="number" value={dimB} onChange={(e) => setDimB(e.target.value)} required disabled={dxfImportado} className="mt-1 w-full border border-slate-300 rounded p-2 text-sm outline-none bg-white" />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-[10px] font-semibold text-slate-700">Dim C (Z)</label>
                          <input type="number" value={dimC} onChange={(e) => setDimC(e.target.value)} className="mt-1 w-full border border-slate-300 rounded p-2 text-sm outline-none bg-white" placeholder="Opc." />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-700">Nº Furos</label>
                          <input type="number" value={nFuros} onChange={(e) => setNFuros(e.target.value)} min="0" className="mt-1 w-full border border-slate-300 rounded p-2 text-sm outline-none bg-white" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-700">Ø Furo</label>
                          <input type="number" value={diaFuro} onChange={(e) => setDiaFuro(e.target.value)} min="0" step="0.1" className="mt-1 w-full border border-slate-300 rounded p-2 text-sm outline-none bg-white" />
                        </div>
                      </div>

                      <button type="submit" className="w-full text-white font-black py-3.5 rounded-full transition-all shadow-lg hover:-translate-y-0.5 bg-orange-500 hover:bg-orange-600 text-sm lg:text-base">
                        {editandoIndex !== null ? '✓ Salvar Alterações' : '+ Adicionar Peça'}
                      </button>
                    </form>
                  </div>

                  <div className="xl:col-span-1 min-h-[200px] h-[250px] xl:h-full flex flex-col">
                    {renderPreviewPeca()}
                  </div>
                </div>
              </div>
            </div>

            {/* LADO DIREITO: LISTA LATERAL */}
            <div className="w-full lg:w-[35%] h-[500px] lg:h-full flex flex-col bg-white/90 backdrop-blur p-4 lg:p-6 rounded-3xl shadow-[0_4px_20px_-5px_rgba(0,0,0,0.1)] border border-slate-200 border-t-4 border-slate-900 shrink-0">
              <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
                <h2 className="text-base lg:text-lg font-black text-slate-900">Itens do Orçamento</h2>
                <span className="bg-orange-100 text-orange-800 text-[10px] lg:text-xs font-bold px-2 py-1 rounded-full">{listaPecas.length} peças</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                {listaPecas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 opacity-60">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                      <p className="text-xs font-medium">Lista vazia.</p>
                  </div>
                ) : (
                  listaPecas.map((peca, index) => (
                    <div key={index} className="border border-slate-200 p-3 rounded-2xl bg-white shadow-sm hover:border-orange-400 transition-all text-xs lg:text-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0 pr-2">
                          <span className="font-bold text-slate-800 truncate block">{peca.id}</span>
                          <div className="flex gap-1.5 mt-2">
                            <button onClick={() => editarPeca(index)} className="text-[9px] lg:text-[10px] bg-slate-100 px-2 py-1.5 rounded-full font-bold">EDITAR</button>
                            <button onClick={() => removerPeca(index)} className="text-[9px] lg:text-[10px] bg-red-50 text-red-600 px-2 py-1.5 rounded-full font-bold">REMOVER</button>
                          </div>
                        </div>
                        <span className="text-[10px] lg:text-xs font-bold bg-slate-900 text-white px-2 py-1 rounded shrink-0">{peca.qtd} UN</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-y-1.5 border-t border-slate-100 pt-2 text-[10px] lg:text-xs text-slate-600">
                        <p className="truncate">Material: <b className="text-slate-800">{peca.material}</b></p>
                        <p>Esp.: <b className="text-slate-800">{peca.espessura}mm</b></p>
                        <p>Dim: <b className="text-slate-800">{peca.dimA}x{peca.dimB}</b></p>
                        <p>R$/Kg: <b className="text-slate-800">R${Number(peca.precoKgBase || 0).toFixed(2)}</b></p>
                        <p className="col-span-2 text-orange-600 font-semibold text-right border-t border-orange-50 pt-1 mt-1">Peso Tot: <b>{peca.pesoTotal}kg</b></p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {listaPecas.length > 0 && (
                <div className="pt-3 border-t border-slate-100 mt-2 shrink-0">
                  <button onClick={prepararProcessamento} className="w-full bg-slate-900 text-white py-3 lg:py-3.5 rounded-full font-black hover:bg-slate-800 text-sm">
                    Processar Orçamento ➔
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TELA: DASHBOARD DE RESULTADOS (MODO TIMBRADO / PDF EXATO AO SEU PEDIDO) */}
        {telaAtual === 'resultado' && resultadoOrcamento && (
          <div className="absolute inset-0 p-4 lg:p-8 overflow-y-auto scrollbar-thin print:p-0 print:overflow-visible print:bg-white">
            <div className="max-w-7xl mx-auto pb-10 print:max-w-none print:w-full">
              
              <div className="bg-white/90 backdrop-blur rounded-3xl shadow-xl border border-slate-200 border-t-8 border-orange-500 overflow-hidden print:shadow-none print:border-none print:rounded-none print:bg-white relative">
                
                {/* --- CABEÇALHO PADRÃO DE PDF (TIMBRADO COMERCIAL) --- */}
                <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-6 pt-2 px-8">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.35em] text-orange-500">
                        Lypsyos - Orçamento Técnico
                      </div>
                      <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                        Geo<span className="text-orange-500">Quote</span>
                      </h1>
                    </div>
                    <div className="text-right">
                      <h2 className="text-lg font-bold text-slate-800 uppercase">Orçamento Comercial</h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Cliente: <span className="font-bold text-slate-900">{cliente || 'Consumidor Final'}</span>
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Emissão: <b>{dataEmissao?.toLocaleDateString('pt-BR')}</b> | Validade: <b>{validadeOrcamento?.toLocaleDateString('pt-BR')}</b>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cabeçalho Web (Oculto na impressão) */}
                <div className="bg-slate-950 p-6 lg:p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:hidden">
                  <div>
                    <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-wider">Resumo de <span className="text-orange-500">Produção</span></h1>
                    <p className="text-slate-400 mt-2 text-sm lg:text-base">Cliente: <span className="font-bold text-white">{cliente || 'Consumidor Final'}</span></p>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs lg:text-sm text-slate-400">
                      <span>MÁQ: <b className="text-orange-400">{processo}</b></span>
                      <span>EMISSÃO: <b className="text-white">{dataEmissao?.toLocaleDateString('pt-BR')}</b></span>
                    </div>
                  </div>
                  <div className="flex w-full md:w-auto gap-3">
                    <button onClick={() => setTelaAtual('formulario')} className="flex-1 md:flex-none bg-white/10 px-4 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm text-center border border-white/10">← Editar</button>
                    <button onClick={baixarPDF} className="flex-1 md:flex-none bg-orange-500 text-white px-4 py-2.5 lg:py-3 rounded-full font-black text-xs lg:text-sm text-center shadow-lg">📄 PDF</button>
                  </div>
                </div>

                {/* TOTAIS GLOBAIS (Apenas Peças, Chapas, Peso, Tempo e Custo Máquina) */}
                <div className="p-4 lg:p-8 bg-slate-50 border-b border-slate-200 print:bg-white print:border-none print:p-4">
                  <h3 className="text-base lg:text-lg font-black text-slate-800 mb-4 tracking-tight print:text-sm">📊 Totais Globais</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 xl:gap-4 print:grid-cols-5">
                    <div className="bg-white p-3 lg:p-4 rounded-xl border border-slate-200 shadow-sm text-center flex flex-col justify-center print:border-slate-300">
                        <p className="text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Peças</p>
                        <p className="text-lg xl:text-xl font-black text-slate-900 mt-1 truncate">{resultadoOrcamento.totais_globais.total_pecas}</p>
                    </div>
                    <div className="bg-white p-3 lg:p-4 rounded-xl border border-slate-200 shadow-sm text-center flex flex-col justify-center print:border-slate-300">
                        <p className="text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Chapas</p>
                        <p className="text-lg xl:text-xl font-black text-slate-900 mt-1 truncate">{resultadoOrcamento.totais_globais.chapas_totais}</p>
                    </div>
                    <div className="bg-white p-3 lg:p-4 rounded-xl border border-slate-200 shadow-sm text-center flex flex-col justify-center print:border-slate-300">
                        <p className="text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Peso (Kg)</p>
                        <p className="text-lg xl:text-xl font-black text-slate-900 mt-1 truncate">{resultadoOrcamento.totais_globais.peso_total_kg}</p>
                    </div>
                    <div className="bg-white p-3 lg:p-4 rounded-xl border border-slate-200 shadow-sm text-center flex flex-col justify-center print:border-slate-300">
                        <p className="text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Tempo</p>
                        <p className="text-base xl:text-lg font-black text-slate-900 mt-1 truncate">
                          {Math.floor(resultadoOrcamento.totais_globais.tempo_total_min / 60)}h {Math.round(resultadoOrcamento.totais_globais.tempo_total_min % 60)}m
                        </p>
                    </div>
                    <div className="bg-white p-3 lg:p-4 rounded-xl border border-orange-200 shadow-sm text-center flex flex-col justify-center col-span-2 sm:col-span-1 print:border-slate-300">
                      <p className="text-[10px] lg:text-xs font-bold text-orange-800 uppercase print:text-slate-600">Custo Máquina R$</p>
                      <p className="text-lg xl:text-xl font-black text-orange-700 mt-1 truncate print:text-slate-900">R$ {resultadoOrcamento.totais_globais.custo_maquina?.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* DETALHAMENTO DA TABELA POR ESPESSURA (Apenas o necessário) */}
                <div className="px-4 lg:px-8 pb-8 pt-6 border-t border-slate-100 print:px-4 print:pt-4">
                  <h3 className="text-base lg:text-lg font-black text-slate-800 mb-4 print:text-sm">⚙️ Tabela por Espessura</h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white scrollbar-thin print:border-slate-300">
                    <table className="w-full text-left min-w-[700px] print:min-w-0 print:w-full print:text-[11px]">
                        <thead>
                          <tr className="bg-slate-950 text-white text-[10px] lg:text-xs uppercase print:bg-slate-200 print:text-slate-900">
                            <th className="p-3 text-center border-b-2 border-orange-500 print:border-slate-400">Esp. (mm)</th>
                            <th className="p-3 border-b-2 border-orange-500 print:border-slate-400">Qtd</th>
                            <th className="p-3 text-center border-b-2 border-orange-500 print:border-slate-400">Chapas (Qtd x Tam)</th>
                            <th className="p-3 border-b-2 border-orange-500 print:border-slate-400">Tempo</th>
                            <th className="p-3 border-b-2 border-orange-500 print:border-slate-400">Peso</th>
                            <th className="p-3 text-right border-b-2 border-orange-500 print:border-slate-400">Custo Máquina R$</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100 text-xs lg:text-sm print:divide-slate-300">
                          {resultadoOrcamento.detalhamento_espessuras.map((item, index) => (
                              <tr key={index} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-black text-center text-slate-900 bg-slate-50 print:bg-transparent">{item.espessura.toFixed(2)}</td>
                                <td className="p-3 font-medium text-slate-700">{item.qtd_pecas}</td>
                                <td className="p-3 text-center">
                                  <span className="bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded text-[10px] lg:text-xs block w-max mx-auto border border-orange-200 print:bg-transparent print:border-slate-400 print:text-slate-800">{item.chapas_necessarias} un</span>
                                  <span className="text-[9px] lg:text-[10px] text-slate-500 font-mono mt-1 block">{item.dimensao_chapa}</span>
                                </td>
                                <td className="p-3 font-mono text-slate-600 text-[10px] lg:text-xs">{Math.floor(item.tempo_min / 60)}h {Math.round(item.tempo_min % 60)}m</td>
                                <td className="p-3 font-medium text-slate-700">{item.peso_kg.toFixed(2)} Kg</td>
                                <td className="p-3 font-black text-right text-orange-600 truncate print:text-slate-900">R$ {Number(item.custo_maquina || 0).toFixed(2)}</td>
                              </tr>
                          ))}
                        </tbody>
                    </table>
                  </div>
                </div>

                {/* --- BLOCO DE ASSINATURA E CONDIÇÕES GERAIS (EXATAMENTE COMO NA SUA REFERÊNCIA) --- */}
                <div className="hidden print:block mt-6 pt-4 border-t-2 border-slate-800 break-inside-avoid px-8 pb-6">
                  <div className="flex justify-between items-end gap-6">
                      <div className="text-[10px] text-slate-600 w-3/5 space-y-1">
                          <p className="font-bold text-slate-800">Condições Gerais:</p>
                          <p>1. Os valores orçados referem-se estritamente às geometrias fornecidas.</p>
                          <p>2. Variações na espessura comercial da chapa estão sujeitas à tolerância da usina.</p>
                          <p>3. Prazo de entrega a combinar após aprovação deste orçamento.</p>
                      </div>
                      <div className="w-2/5 text-center">
                          <div className="border-t border-slate-500 pt-2 mx-auto">
                              <p className="text-xs font-bold text-slate-900">Depto. Comercial - Lypsyos</p>
                              <p className="text-[10px] text-slate-500">Assinatura / Carimbo</p>
                          </div>
                      </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE CONFIGURAÇÃO DE CHAPAS */}
      {isModalChapasOpen && (
        <div className="fixed inset-0 bg-slate-950 bg-opacity-90 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-[0_24px_80px_-35px_rgba(249,115,22,0.3)] w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="bg-slate-950 p-4 lg:p-5 border-b-4 border-orange-500 shrink-0">
              <h3 className="text-lg lg:text-xl font-bold text-white uppercase">📐 Dimensões de Chapa</h3>
            </div>
            
            <div className="p-4 lg:p-6 overflow-y-auto scrollbar-thin space-y-3">
              {Object.keys(chapasConfig).map(esp => (
                <div key={esp} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between gap-3">
                  <div className="bg-slate-900 text-orange-400 font-black text-base lg:text-lg h-10 w-12 lg:h-12 lg:w-16 flex items-center justify-center rounded shrink-0">
                    {esp}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2 lg:gap-4">
                    <div>
                      <label className="block text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Largura</label>
                      <input type="number" value={chapasConfig[esp].largura} onChange={(e) => handleChapaChange(esp, 'largura', e.target.value)} className="mt-1 w-full border border-slate-300 rounded p-2 text-sm focus:ring-orange-500 outline-none"/>
                    </div>
                    <div>
                      <label className="block text-[10px] lg:text-xs font-bold text-slate-500 uppercase">Comp.</label>
                      <input type="number" value={chapasConfig[esp].comprimento} onChange={(e) => handleChapaChange(esp, 'comprimento', e.target.value)} className="mt-1 w-full border border-slate-300 rounded p-2 text-sm focus:ring-orange-500 outline-none"/>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-100 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-200 shrink-0">
              <button onClick={() => setIsModalChapasOpen(false)} className="w-full sm:w-auto px-5 py-3 font-bold text-slate-600 rounded-full hover:bg-slate-200 text-sm">Cancelar</button>
              <button onClick={handleSalvar} className="w-full sm:w-auto bg-orange-500 text-white px-6 py-3 rounded-full font-black shadow-lg hover:bg-orange-600 text-sm">Processar Orçamento ➔</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
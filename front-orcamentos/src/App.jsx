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
  const [telaAtual, setTelaAtual] = useState('formulario'); // 'formulario', 'parametrizacao' ou 'resultado'
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


  // FUNÇÃO: LIDAR COM UPLOAD DE DXF E INTEGRAÇÃO COM BACKEND
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

  // FUNÇÃO: ADICIONAR OU ATUALIZAR
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
    setIsModalChapasOpen(false); // Fecha o modal
    
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] font-sans relative text-slate-900">
      
      {/* 🚀 HEADER / NAVBAR: GeoQuote by Lypsyos */}
      <header className="bg-slate-950/95 backdrop-blur border-b border-cyan-400/30 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.9)] px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-300 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-300/30">
            <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">
            Geo<span className="text-cyan-400">Quote</span>
          </h1>
        </div>
        
        <div className="text-slate-400 text-sm font-medium tracking-wide">
          <div className="flex items-center gap-3">
            <button onClick={() => setTelaAtual('formulario')} className="px-4 py-2 rounded-full border border-white/10 bg-white/5 text-white hover:bg-cyan-400 hover:text-slate-950 hover:border-cyan-300 transition-all duration-300 shadow-sm">Orçamento</button>
            <button onClick={() => setTelaAtual('parametrizacao')} className="px-4 py-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-300 hover:text-slate-950 hover:border-cyan-200 transition-all duration-300 shadow-sm">Parâmetros Globais</button>
            <span className="text-white font-bold tracking-widest uppercase text-xs bg-slate-800 px-3 py-2 rounded-full border border-slate-700 shadow-inner">Lypsyos</span>
          </div>
        </div>
      </header>

      {telaAtual === 'parametrizacao' && (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <div className="bg-white/90 backdrop-blur rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.45)] border border-slate-200/70 border-t-4 border-cyan-500 p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Parâmetros Globais</h2>
                <p className="text-slate-500 mt-1">Matéria-prima, taxa horária e impostos em abas separadas.</p>
              </div>
              <button onClick={() => setTelaAtual('formulario')} className="bg-slate-900 text-white px-5 py-3 rounded-full font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 hover:shadow-cyan-500/10 hover:-translate-y-0.5">
                Voltar ao orçamento
              </button>
            </div>

            <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-full w-fit">
              <button
                type="button"
                onClick={() => setAbaGlobal('materiais')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${abaGlobal === 'materiais' ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Matéria-prima
              </button>
              <button
                type="button"
                onClick={() => setAbaGlobal('tarifacao')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${abaGlobal === 'tarifacao' ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Tarifação e Impostos
              </button>
            </div>

            {abaGlobal === 'materiais' ? (
              <form onSubmit={salvarParametroMaterial} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end bg-slate-50/90 p-4 rounded-2xl border border-slate-200 shadow-inner">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Máquina</label>
                  <select
                    value={formParametro.maquina}
                    onChange={(e) => atualizarFormParametro('maquina', e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-xl p-3 bg-white focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    {(maquinasDisponiveis.length > 0 ? maquinasDisponiveis : ['LASER', 'PLASMA']).map((maquina) => (
                      <option key={maquina} value={maquina}>{maquina === 'LASER' ? 'Laser' : 'Plasma'}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Material</label>
                  <input
                    type="text"
                    value={formParametro.material}
                    onChange={(e) => atualizarFormParametro('material', e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="Ex: Aço Carbono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Espessura (mm)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formParametro.espessura}
                    onChange={(e) => atualizarFormParametro('espessura', e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Preço/kg</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formParametro.precoKg}
                    onChange={(e) => atualizarFormParametro('precoKg', e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Velocidade Corte</label>
                  <input
                    type="number"
                    step="1"
                    value={formParametro.velocidadeCorte}
                    onChange={(e) => atualizarFormParametro('velocidadeCorte', e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">R$/Hora</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formParametro.valorHora}
                    onChange={(e) => atualizarFormParametro('valorHora', e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>
                <div className="md:col-span-6 flex gap-3 justify-end pt-2">
                  {editandoParametroIndex !== null && (
                    <button type="button" onClick={limparFormParametro} className="px-5 py-3 rounded-full border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-all hover:-translate-y-0.5">
                      Cancelar edição
                    </button>
                  )}
                  <button type="submit" className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 transition-all">
                    {editandoParametroIndex !== null ? 'Salvar parâmetro' : 'Adicionar parâmetro'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-50/90 p-5 rounded-2xl border border-slate-200 shadow-inner space-y-4">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Tarifação e Impostos</h3>
                  <p className="text-sm text-slate-500">Digite os percentuais da formação de preço e o frete em valor fixo.</p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Imposto (%)</label>
                      <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white pr-3 shadow-sm">
                        <input
                          type="number"
                          step="0.01"
                          value={imposto}
                          onChange={(e) => setImposto(e.target.value)}
                          className="w-full rounded-xl p-3 outline-none"
                        />
                        <span className="text-slate-400 font-black">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Comissão (%)</label>
                      <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white pr-3 shadow-sm">
                        <input
                          type="number"
                          step="0.01"
                          value={comissao}
                          onChange={(e) => setComissao(e.target.value)}
                          className="w-full rounded-xl p-3 outline-none"
                        />
                        <span className="text-slate-400 font-black">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">MARKUP (%)</label>
                      <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white pr-3 shadow-sm">
                        <input
                          type="number"
                          step="0.01"
                          value={margemLucro}
                          onChange={(e) => setMargemLucro(e.target.value)}
                          className="w-full rounded-xl p-3 outline-none"
                        />
                        <span className="text-slate-400 font-black">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Frete (R$)</label>
                      <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white pr-3 shadow-sm">
                        <span className="pl-3 text-slate-400 font-black">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={frete}
                          onChange={(e) => setFrete(e.target.value)}
                          className="w-full rounded-xl p-3 outline-none text-right"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
                    <span className="font-black">Dica:</span> impostos, comissão e margem formam a taxa incidente; o frete é somado somente no final.
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">Resumo da Cascata</h3>
                    <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-3 py-1 rounded-full">Global</span>
                  </div>
                  <div className="p-5 space-y-3 text-sm text-slate-600">
                    <div className="flex justify-between"><span>Taxas Incidentes</span><strong>{Number(imposto) + Number(comissao) + Number(margemLucro)}%</strong></div>
                    <div className="flex justify-between"><span>Frete</span><strong>R$ {Number(frete).toFixed(2)}</strong></div>
                    <div className="border-t border-slate-200 pt-3 flex justify-between text-slate-900"><span className="font-bold">Somatório final</span><strong>CP - TI + Frete</strong></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {abaGlobal === 'materiais' && (
            <div className="bg-white/90 backdrop-blur rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.32)] border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Tabela de parâmetros cadastrados</h3>
                <span className="text-sm font-semibold text-slate-500">{parametrosOrdenados.length} registros</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-950 text-white text-sm uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Máquina</th>
                      <th className="p-4">Material</th>
                      <th className="p-4">Espessura</th>
                      <th className="p-4">R$/Kg</th>
                      <th className="p-4">R$/Hora</th>
                      <th className="p-4">Velocidade</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parametrosOrdenados.map((item, index) => (
                      <tr key={item.id || `${item.maquina}-${item.material}-${item.espessura}-${index}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-semibold text-cyan-700">{item.maquina}</td>
                        <td className="p-4 font-semibold text-slate-800">{item.material}</td>
                        <td className="p-4 text-slate-600">{item.espessura.toFixed(2)} mm</td>
                        <td className="p-4 text-slate-600">R$ {item.precoKg.toFixed(2)}</td>
                        <td className="p-4 text-slate-600">R$ {Number(item.valorHora || 0).toFixed(2)}</td>
                        <td className="p-4 text-slate-600">{item.velocidadeCorte.toLocaleString('pt-BR')} mm/min</td>
                        <td className="p-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => editarParametroMaterial(index)} className="text-[10px] bg-slate-100 text-slate-700 px-3 py-2 rounded-full uppercase font-bold hover:bg-slate-200 transition-all">Editar</button>
                            <button onClick={() => removerParametroMaterial(index)} className="text-[10px] bg-red-50 text-red-600 px-3 py-2 rounded-full uppercase font-bold hover:bg-red-100 transition-all">Excluir</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {parametrosOrdenados.length === 0 && (
                      <tr>
                        <td colSpan="7" className="p-6 text-center text-slate-500">Nenhum parâmetro cadastrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* TELA 1: FORMULÁRIO DE ENTRADA */}
      {telaAtual === 'formulario' && (
        <div className="p-6 flex flex-col md:flex-row gap-6">
          
          {/* LADO ESQUERDO: FORMULÁRIOS */}
          <div className="w-full md:w-2/3 space-y-6">
            
            {/* PARÂMETROS DO ORÇAMENTO - TEMA LYPSYOS */}
            <div className="bg-white/90 backdrop-blur p-6 rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.32)] border border-slate-200 border-t-4 border-slate-900">
              <h2 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2 tracking-tight">
                  ⚙️ Parâmetros do Orçamento
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700">Cliente</label>
                  <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all bg-white shadow-sm" placeholder="Nome da empresa" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Máquina</label>
                  <select value={maquinaSelecionada} onChange={(e) => { setMaquinaSelecionada(e.target.value); setProcesso(e.target.value); selecionarMaquina(e.target.value); }} className="mt-1 w-full border border-slate-300 rounded-xl p-3 bg-slate-50 focus:ring-2 focus:ring-cyan-500 outline-none shadow-sm">
                    {(maquinasDisponiveis.length > 0 ? maquinasDisponiveis : ['LASER', 'PLASMA']).map((maquina) => (
                      <option key={maquina} value={maquina}>{maquina === 'LASER' ? 'Laser CNC' : 'Plasma HD'}</option>
                    ))}
                </select>
              </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Material Base</label>
                  <select
                    value={materialSelecionado}
                    onChange={(e) => selecionarMaterial(e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-xl p-3 bg-slate-50 focus:ring-2 focus:ring-cyan-500 outline-none shadow-sm"
                  >
                    {materiaisDisponiveis.length === 0 ? (
                      <option value="">Cadastre um material</option>
                    ) : (
                      materiaisDisponiveis.map((material) => (
                        <option key={material} value={material}>{material}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
              {parametroAtual && (
                <div className="mt-4 bg-gradient-to-r from-cyan-50 to-sky-50 border border-cyan-200 rounded-2xl p-4 text-sm text-cyan-950 flex flex-wrap gap-4 shadow-inner">
                  <span><b>Máquina:</b> {parametroAtual.maquina}</span>
                  <span><b>Preço/kg:</b> R$ {parametroAtual.precoKg.toFixed(2)}</span>
                  <span><b>R$/Hora:</b> R$ {parametroAtual.valorHora.toFixed(2)}</span>
                  <span><b>Velocidade:</b> {parametroAtual.velocidadeCorte.toLocaleString('pt-BR')} mm/min</span>
                  <span><b>Frete:</b> R$ {Number(frete).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* INSERÇÃO DE PEÇAS E UPLOAD DE DXF */}
            <div className="bg-white/90 backdrop-blur p-6 rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.32)] border border-slate-200 border-t-4 border-cyan-500">
              <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-3">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {editandoIndex !== null ? '✏️ Editando Peça' : 'Adicionar Nova Peça'}
                </h2>
                {editandoIndex !== null && (
                  <button onClick={() => { setEditandoIndex(null); limparFormulario(); }} className="text-sm text-slate-500 hover:text-red-500 transition-colors font-bold uppercase tracking-wider">
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
                          {dxfImportado && (
                            <span className="text-xs font-black text-cyan-700 bg-cyan-100 px-3 py-1 rounded-full">DXF importado e campos travados</span>
                          )}
                        </div>
                    </div>
                    
                    {/* Alerta de Validação */}
                    {dxfErro && (
                      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm flex items-start shadow-sm mt-2">
                        <span className="mr-2 font-bold">⚠️</span>
                        <p>{dxfErro}</p>
                      </div>
                    )}

                    {dxfImportado && (
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="bg-slate-950 text-white rounded-2xl p-3 shadow-sm">
                          <p className="uppercase font-black text-slate-400">Perímetro</p>
                          <p className="text-lg font-black text-cyan-300 mt-1">{dxfPerimetroCorteMm.toFixed(2)} mm</p>
                        </div>
                        <div className="bg-slate-950 text-white rounded-2xl p-3 shadow-sm">
                          <p className="uppercase font-black text-slate-400">Área útil</p>
                          <p className="text-lg font-black text-cyan-300 mt-1">{dxfAreaUtilMm2.toFixed(2)} mm²</p>
                        </div>
                        <div className="bg-slate-950 text-white rounded-2xl p-3 shadow-sm">
                          <p className="uppercase font-black text-slate-400">Furos</p>
                          <p className="text-lg font-black text-cyan-300 mt-1">{nFuros}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={adicionarOuAtualizarPeca} className="space-y-5">
                    
                    {/* Linha 1: Dados Base */}
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Identificador</label>
                        <input type="text" value={id} onChange={(e) => setId(e.target.value)} required className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none shadow-sm" placeholder="Ex: PC-01" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">QTD</label>
                        <input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} required min="1" className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none shadow-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Geometria</label>
                        <select value={tipoPeca} onChange={(e) => setTipoPeca(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-cyan-500 outline-none shadow-sm">
                            <option value="R">Retangular (R)</option>
                            <option value="Q">Quadrado (Q)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Espessura (mm)</label>
                        <select
                          value={espessuraSelecionada}
                          onChange={(e) => setEspessuraSelecionada(e.target.value)}
                          required
                          disabled={espessurasDisponiveis.length === 0}
                          className="mt-1 w-full border border-slate-300 rounded-xl p-3 bg-white focus:ring-2 focus:ring-cyan-500 outline-none shadow-sm"
                        >
                          {espessurasDisponiveis.length === 0 ? (
                            <option value="">Selecione uma máquina/material</option>
                          ) : (
                            espessurasDisponiveis.map((espessura) => (
                              <option key={espessura} value={espessura}>{espessura} mm</option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Linha 2: Dimensões e Furação */}
                    <div className="grid grid-cols-5 gap-4 items-end bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Dim A (X)</label>
                        <input type="number" value={dimA} onChange={(e) => setDimA(e.target.value)} required disabled={dxfImportado} className={`mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none ${dxfImportado ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'}`} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">Dim B (Y)</label>
                        <input type="number" value={dimB} onChange={(e) => setDimB(e.target.value)} required disabled={dxfImportado} className={`mt-1 w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-cyan-500 outline-none ${dxfImportado ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'}`} />
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

                    <button type="submit" className={`w-full text-white font-black py-4 rounded-full transition-all shadow-lg flex justify-center items-center gap-2 hover:-translate-y-0.5 ${editandoIndex !== null ? 'bg-slate-800 hover:bg-slate-950 shadow-slate-900/20' : 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 shadow-cyan-500/30'}`}>
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
          <div className="w-full md:w-1/3 bg-white/90 backdrop-blur p-6 rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.32)] border border-slate-200 border-t-4 border-slate-900 flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Itens do Orçamento</h2>
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
                  <div key={index} className="border border-slate-200 p-4 rounded-2xl bg-white shadow-sm relative group hover:border-cyan-300 hover:shadow-xl transition-all duration-300">
                    
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-slate-800">{peca.id}</span>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => editarPeca(index)} className="text-[10px] bg-slate-100 text-slate-700 px-3 py-2 rounded-full hover:bg-slate-200 uppercase font-bold transition-all">Editar</button>
                          <button onClick={() => removerPeca(index)} className="text-[10px] bg-red-50 text-red-600 px-3 py-2 rounded-full hover:bg-red-100 uppercase font-bold transition-all">Remover</button>
                        </div>
                      </div>
                      <span className="text-sm font-bold bg-slate-900 text-white px-2 py-1 rounded shadow-sm">{peca.qtd} UN</span>
                    </div>
                    
                    <div className="text-xs text-slate-600 mt-3 grid grid-cols-2 gap-y-2 border-t border-slate-100 pt-3">
                      <p>Máquina: <b className="text-slate-800">{peca.maquina}</b></p>
                      <p>Espessura: <b className="text-slate-800">{peca.espessura}mm</b></p>
                      <p>Material: <b className="text-slate-800">{peca.material}</b></p>
                      <p>Dim: <b className="text-slate-800">{peca.dimA}x{peca.dimB}</b></p>
                      <p>Peso Unt: <b className="text-slate-800">{peca.pesoUnitario}kg</b></p>
                      <p>R$/Kg: <b className="text-slate-800">R$ {Number(peca.precoKgBase || 0).toFixed(2)}</b></p>
                      <p>R$/Hora: <b className="text-slate-800">R$ {Number(peca.valorHora || 0).toFixed(2)}</b></p>
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
                <button onClick={prepararProcessamento} className="w-full bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-900 text-white py-4 rounded-full font-black hover:from-slate-900 hover:to-cyan-800 transition-all flex justify-center items-center gap-2 shadow-lg shadow-slate-900/20 hover:shadow-cyan-500/20 hover:-translate-y-0.5">
                  Processar Orçamento ➔
                </button>
              </div>
            )}
          </div>

        </div>
      )}
      

      {/* TELA 2: DASHBOARD DE RESULTADO PROCESSADO */}
      {telaAtual === 'resultado' && resultadoOrcamento && (
          <div className="p-8 max-w-7xl mx-auto mt-6 print:p-0 print:m-0 print:max-w-none print:w-full">
            
            {/* Adicionado print:shadow-none, print:border-none, print:bg-white para limpar o papel */}
            <div className="bg-white/90 backdrop-blur rounded-3xl shadow-[0_24px_90px_-35px_rgba(15,23,42,0.35)] border border-slate-200 border-t-8 border-cyan-500 overflow-hidden print:shadow-none print:border-none print:rounded-none print:bg-white print:overflow-visible">
              
              {/* --- CABEÇALHO EXCLUSIVO PARA O PDF (TIMBRADO LYPSYOS) --- */}
              {/* Invisível na tela, visível apenas na impressão */}
              <div className="hidden print:block border-b-2 border-slate-800 pb-6 mb-6 pt-4 px-8">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="mb-1 text-xs font-black uppercase tracking-[0.35em] text-cyan-600">
                      Lypsyos - Orçamento Técnico
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">
                      Geo<span className="text-cyan-600">Quote</span>
                    </h1>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-slate-800 uppercase">Orçamento Comercial</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Cliente: <span className="font-bold text-slate-900">{cliente || 'Consumidor Final'}</span>
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      Emissão: <b>{dataEmissao?.toLocaleDateString('pt-BR') || new Date().toLocaleDateString('pt-BR')}</b> | Validade: <b>{validadeOrcamento?.toLocaleDateString('pt-BR') || '7 dias'}</b>
                    </p>
                  </div>
                </div>
              </div>

              {/* Cabeçalho do Orçamento (Web) - Oculto na impressão com print:hidden */}
                <div className="bg-slate-950 p-8 text-white flex justify-between items-start gap-6 print:hidden">
                 <div>
                    <div className="hidden print:block mb-4 text-xs font-black uppercase tracking-[0.35em] text-cyan-300">
                      Lypsyos - Orçamento Técnico
                    </div>
                    <h1 className="text-3xl font-black uppercase tracking-wider">
                      Resumo de <span className="text-cyan-400">Produção</span>
                    </h1>
                    <p className="text-slate-400 mt-2 text-lg">
                      Cliente: <span className="font-bold text-white">{cliente || 'Consumidor Final'}</span>
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                      Máquina: <span className="bg-cyan-900 text-cyan-300 px-2 py-0.5 rounded-full uppercase font-bold">{processo}</span>
                    </p>
                      <p className="text-slate-400 text-sm mt-1">
                      Emissão: <span className="font-bold text-white">{dataEmissao?.toLocaleDateString('pt-BR')}</span> | Validade: <span className="font-bold text-white">{validadeOrcamento?.toLocaleDateString('pt-BR')}</span>
                      </p>
                 </div>
                 
                 <div className="flex gap-4">
                    <button 
                       onClick={() => setTelaAtual('formulario')} 
                      className="bg-white/10 text-white px-5 py-3 rounded-full font-bold hover:bg-white/15 transition-all shadow-lg flex items-center gap-2 border border-white/10"
                    >
                       ← Nova Edição
                    </button>
                    
                    <button 
                       onClick={baixarPDF} 
                       className="bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-950 px-5 py-3 rounded-full font-black hover:from-cyan-300 hover:to-cyan-400 transition-all shadow-lg shadow-cyan-500/25 flex items-center gap-2"
                    >
                       📄 Baixar PDF
                    </button>
                 </div>
              </div>

              {/* TOTAIS GLOBAIS (Cards Topo) */}
              <div className="p-8 print:p-0 bg-slate-50 print:bg-white border-b border-slate-200 print:border-none print:break-inside-avoid">
                 <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 tracking-tight print:text-base print:border-b print:pb-2">
                   📊 Totais Globais do Orçamento
                </h3>
                 <div className="grid grid-cols-2 md:grid-cols-7 print:grid-cols-7 gap-4 print:gap-2">
                   <div className="bg-white print:p-2 p-4 rounded-2xl print:rounded-lg border border-slate-200 shadow-sm print:shadow-none text-center">
                      <p className="text-xs print:text-[10px] font-bold text-slate-500 uppercase">Total Peças</p>
                      <p className="text-2xl print:text-lg font-black text-slate-900 mt-1">{resultadoOrcamento.totais_globais.total_pecas}</p>
                   </div>
                   <div className="bg-white print:p-2 p-4 rounded-2xl print:rounded-lg border border-slate-200 shadow-sm print:shadow-none text-center">
                      <p className="text-xs print:text-[10px] font-bold text-slate-500 uppercase">Chapas Totais</p>
                      <p className="text-2xl print:text-lg font-black text-slate-900 mt-1">{resultadoOrcamento.totais_globais.chapas_totais}</p>
                   </div>
                   <div className="bg-white print:p-2 p-4 rounded-2xl print:rounded-lg border border-slate-200 shadow-sm print:shadow-none text-center">
                      <p className="text-xs print:text-[10px] font-bold text-slate-500 uppercase">Peso Total (Kg)</p>
                      <p className="text-2xl print:text-lg font-black text-slate-900 mt-1">{resultadoOrcamento.totais_globais.peso_total_kg}</p>
                   </div>
                   <div className="bg-white print:p-2 p-4 rounded-2xl print:rounded-lg border border-slate-200 shadow-sm print:shadow-none text-center">
                      <p className="text-xs print:text-[10px] font-bold text-slate-500 uppercase">Tempo Máquina</p>
                      <p className="text-2xl print:text-lg font-black text-slate-900 mt-1">
                        {Math.floor(resultadoOrcamento.totais_globais.tempo_total_min / 60)}h {Math.round(resultadoOrcamento.totais_globais.tempo_total_min % 60)}m
                      </p>
                   </div>
                   <div className="bg-cyan-50 print:bg-white print:p-2 p-4 rounded-2xl print:rounded-lg border border-cyan-200 print:border-slate-300 shadow-sm print:shadow-none text-center">
                     <p className="text-xs print:text-[10px] font-bold text-cyan-800 print:text-slate-600 uppercase">Custo Material</p>
                     <p className="text-2xl print:text-lg font-black text-cyan-700 print:text-slate-900 mt-1">
                       R$ {resultadoOrcamento.totais_globais.custo_material?.toFixed(2)}
                     </p>
                   </div>
                   <div className="bg-sky-50 print:bg-white print:p-2 p-4 rounded-2xl print:rounded-lg border border-sky-200 print:border-slate-300 shadow-sm print:shadow-none text-center">
                     <p className="text-xs print:text-[10px] font-bold text-sky-800 print:text-slate-600 uppercase">Custo Máquina</p>
                     <p className="text-2xl print:text-lg font-black text-sky-700 print:text-slate-900 mt-1">
                       R$ {resultadoOrcamento.totais_globais.custo_maquina?.toFixed(2)}
                     </p>
                   </div>
                   <div className="bg-slate-950 print:bg-white print:p-2 p-4 rounded-2xl print:rounded-lg border border-slate-800 print:border-slate-900 shadow-sm print:shadow-none text-center">
                     <p className="text-xs print:text-[10px] font-bold text-slate-300 print:text-slate-800 uppercase">Total Final</p>
                     <p className="text-2xl print:text-lg font-black text-white print:text-slate-900 mt-1">
                       R$ {resultadoOrcamento.totais_globais.custo_total?.toFixed(2)}
                     </p>
                   </div>
                </div>
              </div>

              {/* CASCATA DE PRECIFICAÇÃO */}
              <div className="px-8 pb-8 pt-2 print:p-0 print:mt-6 print:break-inside-avoid">
                <div className="bg-white rounded-3xl print:rounded-lg border border-slate-200 shadow-sm print:shadow-none overflow-hidden print:overflow-visible">
                  <div className="p-5 print:p-2 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-lg print:text-base font-black text-slate-900 tracking-tight">Cascata de Preço</h3>
                    <span className="text-xs font-bold text-cyan-700 print:text-slate-600 bg-cyan-50 print:bg-transparent px-3 py-1 rounded-full">CP → TI → Bruto → Final</span>
                  </div>
                  <div className="p-5 print:p-2 grid grid-cols-1 md:grid-cols-5 print:grid-cols-5 gap-4 print:gap-2 text-sm">
                    <div className="rounded-2xl print:rounded-lg border border-cyan-200 print:border-slate-300 bg-cyan-50 print:bg-transparent p-4 print:p-2">
                      <p className="text-xs font-bold text-cyan-800 print:text-slate-700 uppercase">Custo de Produção</p>
                      <p className="text-xl print:text-lg font-black text-cyan-800 print:text-slate-900 mt-2">R$ {Number(resultadoOrcamento.totais_globais.custo_producao || 0).toFixed(2)}</p>
                      <p className="text-xs print:text-[10px] text-cyan-900 print:text-slate-500 mt-2">Material + Máquina + Cons.</p>
                    </div>
                    <div className="rounded-2xl print:rounded-lg border border-amber-200 print:border-slate-300 bg-amber-50 print:bg-transparent p-4 print:p-2">
                      <p className="text-xs font-bold text-amber-800 print:text-slate-700 uppercase">Taxas Incidentes</p>
                      <p className="text-xl print:text-lg font-black text-amber-700 print:text-slate-900 mt-2">{Number(resultadoOrcamento.totais_globais.taxas_incidentes_percent || 0).toFixed(2)}%</p>
                      <p className="text-sm print:text-xs font-semibold text-amber-800 print:text-slate-600 mt-1">R$ {Number(resultadoOrcamento.totais_globais.custo_tarifas || 0).toFixed(2)}</p>
                    </div>
                    <div className="rounded-2xl print:rounded-lg border border-sky-200 print:border-slate-300 bg-sky-50 print:bg-transparent p-4 print:p-2">
                      <p className="text-xs font-bold text-sky-800 print:text-slate-700 uppercase">Preço Venda Bruto</p>
                      <p className="text-xl print:text-lg font-black text-sky-700 print:text-slate-900 mt-2">R$ {Number(resultadoOrcamento.totais_globais.preco_venda_bruto || 0).toFixed(2)}</p>
                      <p className="text-xs print:text-[10px] text-sky-900 print:text-slate-500 mt-2">CP / (1 - TI)</p>
                    </div>
                    <div className="rounded-2xl print:rounded-lg border border-violet-200 print:border-slate-300 bg-violet-50 print:bg-transparent p-4 print:p-2">
                      <p className="text-xs font-bold text-violet-800 print:text-slate-700 uppercase">Acréscimos Finais</p>
                      <p className="text-xl print:text-lg font-black text-violet-700 print:text-slate-900 mt-2">R$ {Number(resultadoOrcamento.totais_globais.acrescimos_finais || 0).toFixed(2)}</p>
                      <p className="text-xs print:text-[10px] text-violet-900 print:text-slate-500 mt-2">Frete somado ao final</p>
                    </div>
                    <div className="rounded-2xl print:rounded-lg border border-slate-900 print:border-slate-400 bg-slate-950 print:bg-slate-100 p-4 print:p-2">
                      <p className="text-xs font-bold text-slate-300 print:text-slate-700 uppercase">Preço Final</p>
                      <p className="text-xl print:text-lg font-black text-white print:text-slate-900 mt-2">R$ {Number(resultadoOrcamento.totais_globais.custo_total || 0).toFixed(2)}</p>
                      <p className="text-xs print:text-[10px] text-slate-300 print:text-slate-600 mt-2">Bruto + Frete</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* DETALHAMENTO POR ESPESSURA (Tabela Padrão Mercado) */}
                <div className="p-8 print:p-0 print:mt-6 print:break-inside-avoid">
                 <h3 className="text-lg print:text-base font-black text-slate-800 mb-4 flex items-center gap-2 tracking-tight print:border-b print:pb-2">
                   ⚙️ Necessidade de Materiais e Custo por Espessura
                 </h3>
                 {/* Ajuste crucial: remover overflow-x-auto na impressão */}
                 <div className="overflow-x-auto print:overflow-visible rounded-2xl print:rounded-lg border border-slate-200 shadow-sm print:shadow-none bg-white">
                    <table className="w-full text-left border-collapse print:text-[11px]">
                       <thead>
                        <tr className="bg-slate-950 text-white text-sm print:text-xs print:bg-slate-200 print:text-slate-900 uppercase tracking-wider">
                             <th className="p-4 print:p-2 font-semibold text-center border-b-2 border-cyan-500 print:border-slate-400">Esp. (mm)</th>
                             <th className="p-4 print:p-2 font-semibold border-b-2 border-cyan-500 print:border-slate-400">Qtd Peças</th>
                             <th className="p-4 print:p-2 font-semibold text-center border-b-2 border-cyan-500 print:border-slate-400">Chapas (Qtd x Tam)</th>
                             <th className="p-4 print:p-2 font-semibold border-b-2 border-cyan-500 print:border-slate-400">Tempo</th>
                             <th className="p-4 print:p-2 font-semibold border-b-2 border-cyan-500 print:border-slate-400">Peso (Kg)</th>
                          <th className="p-4 print:p-2 font-semibold text-right border-b-2 border-cyan-500 print:border-slate-400">Material R$</th>
                          <th className="p-4 print:p-2 font-semibold text-right border-b-2 border-cyan-500 print:border-slate-400">Máquina R$</th>
                          <th className="p-4 print:p-2 font-semibold text-right border-b-2 border-cyan-500 print:border-slate-400">Total R$</th>
                          </tr>
                       </thead>
                       <tbody className="bg-white divide-y divide-slate-100 print:divide-slate-300">
                          {resultadoOrcamento.detalhamento_espessuras.map((item, index) => (
                             <tr key={index} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 print:p-2 font-black text-center text-slate-900 bg-slate-100 print:bg-transparent">{item.espessura.toFixed(2)}</td>
                                <td className="p-4 print:p-2 font-medium text-slate-700">{item.qtd_pecas}</td>
                                
                                <td className="p-4 print:p-2 text-center">
                                  <span className="bg-cyan-100 print:bg-transparent print:border print:border-slate-400 text-cyan-800 print:text-slate-800 font-bold px-3 py-1 rounded-full print:rounded text-sm print:text-[10px] block w-max mx-auto">
                                    {item.chapas_necessarias} un
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                                    {item.dimensao_chapa}
                                  </span>
                                </td>
                                
                                <td className="p-4 print:p-2 font-mono text-slate-600 text-sm print:text-xs">
                                  {Math.floor(item.tempo_min / 60)}h {Math.round(item.tempo_min % 60)}m
                                </td>
                                <td className="p-4 print:p-2 font-medium text-slate-700">{item.peso_kg.toFixed(2)} Kg</td>
                                  <td className="p-4 print:p-2 font-bold text-right text-slate-800">R$ {item.custo_material.toFixed(2)}</td>
                                  <td className="p-4 print:p-2 font-bold text-right text-sky-700 print:text-slate-800">R$ {Number(item.custo_maquina || 0).toFixed(2)}</td>
                                  <td className="p-4 print:p-2 font-black text-right text-cyan-700 print:text-slate-900">R$ {Number(item.custo_total || 0).toFixed(2)}</td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>

              {/* RODAPÉ DO PDF (Termos e Assinaturas) */}
              <div className="hidden print:block mt-8 pt-6 border-t-2 border-slate-800 break-inside-avoid px-8 pb-8">
                  <div className="flex justify-between items-end">
                      <div className="text-[10px] text-slate-500 w-1/2">
                          <p className="font-bold text-slate-700 mb-1">Condições Gerais:</p>
                          <p>1. Os valores orçados referem-se estritamente às geometrias fornecidas.</p>
                          <p>2. Variações na espessura comercial da chapa estão sujeitas à tolerância da usina.</p>
                          <p>3. Prazo de entrega a combinar após aprovação deste orçamento.</p>
                      </div>
                      <div className="w-1/3 text-center border-t border-slate-400 pt-2">
                          <p className="text-xs font-bold text-slate-900">Depto. Comercial - Lypsyos</p>
                          <p className="text-[10px] text-slate-500">Assinatura / Carimbo</p>
                      </div>
                  </div>
              </div>
              
           </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE CHAPAS (Oculto na impressão devido a ser renderizado condicionalmente) */}
      {isModalChapasOpen && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-80 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.4)] w-full max-w-lg overflow-hidden border border-slate-200">
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
              <button onClick={() => setIsModalChapasOpen(false)} className="px-5 py-3 font-bold text-slate-600 hover:text-slate-800 transition-all rounded-full hover:bg-white">
                Cancelar
              </button>
              <button onClick={handleSalvar} className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white px-6 py-3 rounded-full font-black shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center hover:-translate-y-0.5">
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
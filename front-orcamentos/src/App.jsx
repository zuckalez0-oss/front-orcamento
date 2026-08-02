
import React, { useEffect, useState, Fragment } from 'react';
import './App.css';
import {
  corDaPeca, calcularFuros, furosAbsolutos,
  verticesTriangulo, verticesTrianguloAbsolutos, contornoDxfAbsoluto,
} from './nestingUtils.js';
import { gerarPdfNesting } from './nestingPdf.js';
import { construirPeca } from './pecaUtils.js';
import RapidEntryGrid from './RapidEntryGrid.jsx';
import { supabase } from './lib/supabaseClient.js';
import { useAuth } from './useAuth.js';
import PerfilUsuario from './PerfilUsuario.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// Lista fixa dos perfis de máquina suportados pelo motor de nesting (ver
// nesting.py) — não deriva de maquinas_params porque um perfil precisa poder
// ser selecionado no formulário de cadastro ANTES de existir qualquer linha
// dele no banco (senão nunca dá pra cadastrar o primeiro parâmetro).
const PERFIS_MAQUINA_SUPORTADOS = ['LASER', 'PLASMA', 'GUILHOTINA'];

const ROTULOS_MAQUINA = { LASER: 'Laser', PLASMA: 'Plasma', GUILHOTINA: 'Guilhotina' };
const rotuloMaquina = (maquina) => ROTULOS_MAQUINA[maquina] || maquina;
const ROTULOS_MAQUINA_LONGO = { LASER: 'Laser CNC', PLASMA: 'Plasma HD', GUILHOTINA: 'Guilhotina' };
const rotuloMaquinaLongo = (maquina) => ROTULOS_MAQUINA_LONGO[maquina] || maquina;

// Desenha o contorno real da peça (retângulo, círculo ou triângulo) dentro de um
// footprint x/y/width/height — usado tanto no preview de peça única quanto no
// nesting (ChapaSVG), pra evitar desenhar sempre um retângulo genérico.
// `verticesAbsolutos`, quando informado, tem prioridade sobre width/height/tipoTriangulo
// pro caso do triângulo (nesting já traz os vértices prontos, considerando rotação 90°).
function ContornoPeca({ tipoPeca, tipoTriangulo, x, y, width, height, verticesAbsolutos, contornoAbsoluto, ...pathProps }) {
  // Peça importada de DXF com contorno real disponível: desenha a silhueta de
  // verdade em vez do retângulo/círculo/triângulo genérico. `perfil.externo`
  // marca o contorno de fora (preenchido com a cor da peça); perfis fechados
  // não-externos são rasgos/furos internos (recorte, mesmo tratamento visual
  // dos furos circulares); perfis abertos residuais só são traçados.
  if (contornoAbsoluto && contornoAbsoluto.perfis.some((perfil) => perfil.externo)) {
    return (
      <>
        {contornoAbsoluto.perfis.map((perfil, indice) => {
          const pontos = perfil.pontos.map((v) => `${v.x},${v.y}`).join(' ');
          if (perfil.externo) {
            return <polygon key={indice} points={pontos} {...pathProps} />;
          }
          if (perfil.fechado) {
            return (
              <polygon
                key={indice} points={pontos}
                fill="#0A0A0A" stroke="rgba(255,255,255,0.25)"
                strokeWidth={pathProps.strokeWidth ? pathProps.strokeWidth * 0.6 : undefined}
              />
            );
          }
          return <polyline key={indice} points={pontos} fill="none" stroke={pathProps.stroke} strokeWidth={pathProps.strokeWidth} />;
        })}
      </>
    );
  }

  if (tipoPeca === 'C') {
    return <circle cx={x + width / 2} cy={y + height / 2} r={width / 2} {...pathProps} />;
  }

  if (tipoPeca === 'T') {
    const vertices = verticesAbsolutos || verticesTriangulo(width, height, tipoTriangulo).map((v) => ({ x: x + v.x, y: y + v.y }));
    const pontos = vertices.map((v) => `${v.x},${v.y}`).join(' ');
    return <polygon points={pontos} {...pathProps} />;
  }

  return <rect x={x} y={y} width={width} height={height} {...pathProps} />;
}

// Renderiza uma chapa de nesting (peças coloridas + furos recortados) em SVG.
// Reaproveitada tanto na miniatura quanto no modal de expansão.
function ChapaSVG({ item, chapa, idsUnicosPecas, listaPecas, width, height, className, mostrarLabels = true }) {
  const strokeW = Math.max(item.chapa_largura, item.chapa_comprimento) * 0.003;

  return (
    <svg
      viewBox={`0 0 ${item.chapa_largura} ${item.chapa_comprimento}`}
      width={width}
      height={height}
      className={className}
    >
      <rect x="0" y="0" width={item.chapa_largura} height={item.chapa_comprimento} fill="#0A0A0A" />
      <rect
        x={item.chapa_margem} y={item.chapa_margem}
        width={Math.max(0, item.chapa_largura - 2 * item.chapa_margem)}
        height={Math.max(0, item.chapa_comprimento - 2 * item.chapa_margem)}
        fill="none" stroke="#374151" strokeDasharray="10,6"
        strokeWidth={strokeW}
      />
      {chapa.placements.map((p, pIndex) => {
        const corPeca = corDaPeca(p.id, idsUnicosPecas);
        const pecaOriginal = listaPecas.find((pc) => pc.id === p.id);
        const furos = furosAbsolutos(p, pecaOriginal);
        const contornoAbsoluto = pecaOriginal?.dxfImportado ? contornoDxfAbsoluto(p, pecaOriginal) : null;

        return (
          <g key={pIndex}>
            <ContornoPeca
              tipoPeca={pecaOriginal?.tipoPeca}
              tipoTriangulo={pecaOriginal?.tipoTriangulo}
              x={p.x} y={p.y} width={p.width} height={p.height}
              verticesAbsolutos={pecaOriginal?.tipoPeca === 'T' ? verticesTrianguloAbsolutos(p, pecaOriginal) : undefined}
              contornoAbsoluto={contornoAbsoluto}
              fill={corPeca} fillOpacity="0.45" stroke={corPeca}
              strokeWidth={strokeW}
            />
            {furos.map((furo, furoIndex) => (
              furo.r > 0 && (
                <circle
                  key={furoIndex}
                  cx={furo.cx} cy={furo.cy} r={furo.r}
                  fill="#0A0A0A" stroke="rgba(255,255,255,0.25)" strokeWidth={strokeW * 0.6}
                />
              )
            ))}
            {mostrarLabels && p.width > item.chapa_largura * 0.08 && p.height > item.chapa_comprimento * 0.03 && (
              <text
                x={p.x + p.width / 2} y={p.y + p.height / 2}
                textAnchor="middle" dominantBaseline="middle" fill="#FFFFFF"
                stroke="#0A0A0A" strokeWidth={strokeW * 2} paintOrder="stroke"
                fontSize={Math.max(item.chapa_largura, item.chapa_comprimento) * 0.018}
              >
                {p.id}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function App() {
  const { papel } = useAuth();
  const dataEmissao = new Date();
  const validadeOrcamento = new Date(dataEmissao.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 1. ESTADOS GLOBAIS
  const [tema, setTema] = useState(() => {
    const salvo = localStorage.getItem('tema');
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  });
  const [cliente, setCliente] = useState('');
  const [incluiMaterial, setIncluiMaterial] = useState(true); // false = facção (cliente traz a própria chapa)
  const [comissao, setComissao] = useState(2);
  const [margemLucro, setMargemLucro] = useState(25);
  const [frete, setFrete] = useState(31);
  const [maquinaSelecionada, setMaquinaSelecionada] = useState('LASER');
  const [materialSelecionado, setMaterialSelecionado] = useState('');
  const [espessuraSelecionada, setEspessuraSelecionada] = useState('');
  const [abaGlobal, setAbaGlobal] = useState('materiais'); // 'materiais', 'maquinas', 'tarifacao'

  // 3 cadastros independentes (Material / Máquina-Corte / Perfil Tributário)
  const [listaMateriais, setListaMateriais] = useState([]);
  const [listaMaquinasParams, setListaMaquinasParams] = useState([]);
  const [listaPerfisTributarios, setListaPerfisTributarios] = useState([]);
  const [perfilSelecionadoId, setPerfilSelecionadoId] = useState('');

  const [editandoMaterialId, setEditandoMaterialId] = useState(null);
  const [formMaterial, setFormMaterial] = useState({ nome: 'Aço Carbono', espessura: '1.50', precoKg: '8.50', densidade: '7.85' });

  const [editandoMaquinaId, setEditandoMaquinaId] = useState(null);
  const [formMaquina, setFormMaquina] = useState({ maquina: 'LASER', material: '', espessura: '1.50', velocidadeCorte: '21250', tempoPiercing: '2.0', tempoSetup: '5.0', valorHora: '180.00' });

  const [editandoPerfilId, setEditandoPerfilId] = useState(null);
  const [formPerfil, setFormPerfil] = useState({ nome: '', imposto_perc: '18.00' });

  // 2. ESTADOS DA PEÇA ATUAL
  const [id, setId] = useState('');
  const [processo, setProcesso] = useState('LASER');
  const [qtd, setQtd] = useState('');
  const [tipoPeca, setTipoPeca] = useState('R');
  const [tipoTriangulo, setTipoTriangulo] = useState('reto'); // só relevante quando tipoPeca === 'T'
  const [dimA, setDimA] = useState('');
  const [dimB, setDimB] = useState('');
  const [dimC, setDimC] = useState('');
  
  // ESTADOS DE FURAÇÃO
  const [tipoFuro, setTipoFuro] = useState('manual');
  const [nFuros, setNFuros] = useState(''); 
  const [diaFuro, setDiaFuro] = useState('');
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
  const [dxfContorno, setDxfContorno] = useState(null);

  // 3. LISTA E CONTROLE DE EDIÇÃO
  const [listaPecas, setListaPecas] = useState([]);
  const [editandoIndex, setEditandoIndex] = useState(null);
  const [modoEntrada, setModoEntrada] = useState('formulario'); // 'formulario' | 'rapida'

  // 4. CONTROLE DE TELAS E RESULTADOS
  const [telaAtual, setTelaAtual] = useState('formulario'); 
  const [resultadoOrcamento, setResultadoOrcamento] = useState(null);
  const [fatorNesting] = useState(0.7);

  // 5. ESTADOS DO MODAL DE CHAPAS
  const [isModalChapasOpen, setIsModalChapasOpen] = useState(false);
  const [chapasConfig, setChapasConfig] = useState({});
  const [chapaExpandida, setChapaExpandida] = useState(null); // { item, chapa, chapaIndex } | null
  const [orientacaoPdf, setOrientacaoPdf] = useState('retrato'); // 'retrato' | 'paisagem' — usado no PDF do plano de corte
  const [mostrarLabelsNesting, setMostrarLabelsNesting] = useState(true); // liga/desliga os textos (ID da peça) no preview de nesting

  const carregarMateriais = async () => {
    try {
      const resposta = await fetch(`${API_BASE}/materiais`);
      const dados = await resposta.json();
      setListaMateriais(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error('Falha ao carregar materiais', erro);
    }
  };

  const carregarMaquinasParams = async () => {
    try {
      const resposta = await fetch(`${API_BASE}/maquinas-params`);
      const dados = await resposta.json();
      setListaMaquinasParams(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      console.error('Falha ao carregar parâmetros de máquina', erro);
    }
  };

  const carregarPerfisTributarios = async () => {
    try {
      const resposta = await fetch(`${API_BASE}/perfis-tributarios`);
      const dados = await resposta.json();
      setListaPerfisTributarios(Array.isArray(dados) ? dados : []);
      if (Array.isArray(dados) && dados.length > 0) {
        setPerfilSelecionadoId((atual) => atual || dados[0].id);
      }
    } catch (erro) {
      console.error('Falha ao carregar perfis tributários', erro);
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'escuro');
    localStorage.setItem('tema', tema);
  }, [tema]);

  useEffect(() => {
    carregarMateriais();
    carregarMaquinasParams();
    carregarPerfisTributarios();
  }, []);

  // Pré-seleciona máquina/material/espessura assim que os parâmetros carregarem
  useEffect(() => {
    if (!materialSelecionado && listaMaquinasParams.length > 0) {
      const primeiro = listaMaquinasParams.find((item) => item.maquina === maquinaSelecionada) || listaMaquinasParams[0];
      setMaquinaSelecionada(primeiro.maquina);
      setMaterialSelecionado(primeiro.material);
      setEspessuraSelecionada(primeiro.espessura.toFixed(2));
    }
  }, [listaMaquinasParams]);

  // Mesma sincronização acima, mas para o <select> de Material do formulário de
  // CADASTRO de máquina/corte (aba Parâmetros Globais): sem isso, o select mostra
  // visualmente a primeira opção (comportamento padrão do HTML quando o value
  // controlado não bate com nenhuma option) mas o estado real fica '' até o
  // usuário reselecionar manualmente — daí o formulário rejeitar o submit
  // dizendo "preencha material" mesmo com um nome aparentemente selecionado.
  useEffect(() => {
    if (!formMaquina.material && listaMateriais.length > 0) {
      setFormMaquina((prev) => ({ ...prev, material: listaMateriais[0].nome }));
    }
  }, [listaMateriais]);

  const maquinasParamsOrdenados = [...listaMaquinasParams].sort((a, b) => {
    if (a.maquina === b.maquina) {
      if (a.material === b.material) {
        return a.espessura - b.espessura;
      }
      return a.material.localeCompare(b.material);
    }
    return a.maquina.localeCompare(b.maquina);
  });

  const materiaisOrdenados = [...listaMateriais].sort((a, b) => {
    if (a.nome === b.nome) return a.espessura - b.espessura;
    return a.nome.localeCompare(b.nome);
  });

  const maquinasDisponiveis = [...new Set(maquinasParamsOrdenados.map((item) => item.maquina))];
  const materiaisDisponiveis = [...new Set(maquinasParamsOrdenados.filter((item) => item.maquina === maquinaSelecionada).map((item) => item.material))];
  const materiaisNomesCadastrados = [...new Set(listaMateriais.map((item) => item.nome))];
  const idsUnicosPecasNesting = [...new Set(listaPecas.map((pc) => pc.id))];

  // Materiais que não têm nenhum parâmetro de corte (maquinas_params) correspondente ainda
  const materiaisSemParametroDeCorte = new Set(
    listaMateriais
      .filter((material) => !listaMaquinasParams.some((param) => param.material === material.nome && param.espessura.toFixed(2) === material.espessura.toFixed(2)))
      .map((material) => material.id)
  );

  // No formulário de Máquina & Corte: a espessura digitada bate com algum material já cadastrado?
  const formMaquinaEspessuraFloat = parseFloat(formMaquina.espessura);
  const formMaquinaSemMaterialCorrespondente = formMaquina.material && !Number.isNaN(formMaquinaEspessuraFloat) &&
    !listaMateriais.some((item) => item.nome === formMaquina.material && item.espessura.toFixed(2) === formMaquinaEspessuraFloat.toFixed(2));
  const espessurasDisponiveis = maquinasParamsOrdenados
    .filter((item) => item.maquina === maquinaSelecionada && item.material === materialSelecionado)
    .map((item) => item.espessura.toFixed(2));

  const maquinaParamAtual = maquinasParamsOrdenados.find(
    (item) => item.maquina === maquinaSelecionada && item.material === materialSelecionado && item.espessura.toFixed(2) === espessuraSelecionada
  );
  const materialAtual = listaMateriais.find(
    (item) => item.nome === materialSelecionado && item.espessura.toFixed(2) === espessuraSelecionada
  );
  // parametroAtual junta o custo/preço (tabela Material) com a velocidade/tempo/hora (tabela Máquina)
  const parametroAtual = maquinaParamAtual && materialAtual
    ? { ...maquinaParamAtual, precoKg: materialAtual.precoKg, densidade: materialAtual.densidade }
    : null;

  const perfilSelecionado = listaPerfisTributarios.find((item) => String(item.id) === String(perfilSelecionadoId));

  // --- CRUD: MATÉRIA-PRIMA ---
  const atualizarFormMaterial = (campo, valor) => setFormMaterial((prev) => ({ ...prev, [campo]: valor }));

  const limparFormMaterial = () => {
    setEditandoMaterialId(null);
    setFormMaterial({ nome: '', espessura: '', precoKg: '', densidade: '7.85' });
  };

  const salvarMaterial = async (e) => {
    e.preventDefault();
    const payload = {
      nome: formMaterial.nome.trim(),
      espessura: parseFloat(formMaterial.espessura),
      precoKg: parseFloat(formMaterial.precoKg),
      densidade: parseFloat(formMaterial.densidade || 7.85)
    };

    if (!payload.nome || Number.isNaN(payload.espessura) || Number.isNaN(payload.precoKg)) {
      alert('Preencha material, espessura e preço/kg.');
      return;
    }

    try {
      await fetch(`${API_BASE}/materiais`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await carregarMateriais();
      limparFormMaterial();
    } catch (erro) {
      console.error('Falha ao salvar material', erro);
      alert('Erro ao salvar material no servidor.');
    }
  };

  const editarMaterial = (item) => {
    setEditandoMaterialId(item.id);
    setFormMaterial({
      nome: item.nome,
      espessura: item.espessura.toFixed(2),
      precoKg: item.precoKg.toFixed(2),
      densidade: item.densidade.toFixed(2)
    });
  };

  const removerMaterial = async (id) => {
    try {
      await fetch(`${API_BASE}/materiais/${id}`, { method: 'DELETE' });
      await carregarMateriais();
      if (editandoMaterialId === id) limparFormMaterial();
    } catch (erro) {
      console.error('Falha ao remover material', erro);
    }
  };

  // --- CRUD: MÁQUINA & CORTE ---
  const atualizarFormMaquina = (campo, valor) => setFormMaquina((prev) => ({ ...prev, [campo]: valor }));

  const limparFormMaquina = () => {
    setEditandoMaquinaId(null);
    setFormMaquina({ maquina: 'LASER', material: '', espessura: '1.50', velocidadeCorte: '21250', tempoPiercing: '2.0', tempoSetup: '5.0', valorHora: '180.00' });
  };

  const salvarMaquinaParam = async (e) => {
    e.preventDefault();
    const payload = {
      maquina: formMaquina.maquina,
      material: formMaquina.material.trim(),
      espessura: parseFloat(formMaquina.espessura),
      velocidadeCorte: parseFloat(formMaquina.velocidadeCorte),
      tempoPiercing: parseFloat(formMaquina.tempoPiercing),
      tempoSetup: parseFloat(formMaquina.tempoSetup),
      valorHora: parseFloat(formMaquina.valorHora)
    };

    if (!payload.material || Number.isNaN(payload.espessura) || Number.isNaN(payload.velocidadeCorte) || Number.isNaN(payload.valorHora)) {
      alert('Preencha máquina, material, espessura, velocidade de corte e valor por hora.');
      return;
    }

    try {
      await fetch(`${API_BASE}/maquinas-params`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await carregarMaquinasParams();
      limparFormMaquina();
    } catch (erro) {
      console.error('Falha ao salvar parâmetro de máquina', erro);
      alert('Erro ao salvar parâmetro de máquina no servidor.');
    }
  };

  const editarMaquinaParam = (item) => {
    setEditandoMaquinaId(item.id);
    setFormMaquina({
      maquina: item.maquina,
      material: item.material,
      espessura: item.espessura.toFixed(2),
      velocidadeCorte: item.velocidadeCorte.toString(),
      tempoPiercing: item.tempoPiercing.toString(),
      tempoSetup: item.tempoSetup.toString(),
      valorHora: item.valorHora.toFixed(2)
    });
  };

  const removerMaquinaParam = async (id) => {
    try {
      await fetch(`${API_BASE}/maquinas-params/${id}`, { method: 'DELETE' });
      await carregarMaquinasParams();
      if (editandoMaquinaId === id) limparFormMaquina();
    } catch (erro) {
      console.error('Falha ao remover parâmetro de máquina', erro);
    }
  };

  // --- CRUD: PERFIS DE FATURAMENTO ---
  const atualizarFormPerfil = (campo, valor) => setFormPerfil((prev) => ({ ...prev, [campo]: valor }));

  const limparFormPerfil = () => {
    setEditandoPerfilId(null);
    setFormPerfil({ nome: '', imposto_perc: '18.00' });
  };

  const salvarPerfil = async (e) => {
    e.preventDefault();
    const payload = {
      nome: formPerfil.nome.trim(),
      imposto_perc: parseFloat(formPerfil.imposto_perc)
    };

    if (!payload.nome || Number.isNaN(payload.imposto_perc)) {
      alert('Preencha o nome do perfil e o percentual de imposto.');
      return;
    }

    try {
      await fetch(`${API_BASE}/perfis-tributarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await carregarPerfisTributarios();
      limparFormPerfil();
    } catch (erro) {
      console.error('Falha ao salvar perfil tributário', erro);
      alert('Erro ao salvar perfil tributário no servidor.');
    }
  };

  const editarPerfil = (item) => {
    setEditandoPerfilId(item.id);
    setFormPerfil({ nome: item.nome, imposto_perc: item.imposto_perc.toFixed(2) });
  };

  const removerPerfil = async (id) => {
    try {
      await fetch(`${API_BASE}/perfis-tributarios/${id}`, { method: 'DELETE' });
      await carregarPerfisTributarios();
      if (editandoPerfilId === id) limparFormPerfil();
      if (String(perfilSelecionadoId) === String(id)) setPerfilSelecionadoId('');
    } catch (erro) {
      console.error('Falha ao remover perfil tributário', erro);
    }
  };

  const selecionarMaterial = (novoMaterial) => {
    setMaterialSelecionado(novoMaterial);

    const primeiraEspessuraDoMaterial = maquinasParamsOrdenados.find((item) => item.maquina === maquinaSelecionada && item.material === novoMaterial);
    setEspessuraSelecionada(primeiraEspessuraDoMaterial ? primeiraEspessuraDoMaterial.espessura.toFixed(2) : '');
  };

  const selecionarMaquina = (novaMaquina) => {
    setMaquinaSelecionada(novaMaquina);
    setProcesso(novaMaquina);

    const primeiroParametroDaMaquina = maquinasParamsOrdenados.find((item) => item.maquina === novaMaquina);
    setMaterialSelecionado(primeiroParametroDaMaquina ? primeiroParametroDaMaquina.material : '');
    setEspessuraSelecionada(primeiroParametroDaMaquina ? primeiroParametroDaMaquina.espessura.toFixed(2) : '');
  };

  const processarArquivoDxf = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const resposta = await fetch(`${API_BASE}/processar-dxf`, {
      method: 'POST',
      body: formData
    });
    return resposta.json();
  };

  const handleDxfUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // permite reimportar o(s) mesmo(s) arquivo(s) em seguida

    if (files.length === 0) return;

    // Um único arquivo: mantém o fluxo tradicional, populando o formulário pra
    // revisão antes de "Adicionar Peça" (permite ajustar qtd/furos/etc).
    if (files.length === 1) {
      const file = files[0];
      setDxfFile(file);
      setIsUploadingDxf(true);
      setDxfErro(null);
      setDxfPreviewSvg(null);
      setDxfImportado(false);
      setDxfPerimetroCorteMm(0);
      setDxfAreaUtilMm2(0);
      setDxfContorno(null);

      try {
        const dados = await processarArquivoDxf(file);

        if (!dados.sucesso) {
          setDxfErro(dados.erro || "O arquivo contém erros ou geometria aberta.");
          setIsUploadingDxf(false);
          return;
        }

        setDimA(dados.dimA);
        setDimB(dados.dimB);
        setNFuros(dados.nFuros || '');
        setDiaFuro(dados.diaFuro || '');
        setId(file.name.replace(/\.dxf$/i, ''));
        setDxfPreviewSvg(dados.svgMarkup);
        setDxfPerimetroCorteMm(Number(dados.perimetroCorteMm || 0));
        setDxfAreaUtilMm2(Number(dados.areaUtilMm2 || 0));
        setDxfContorno(dados.contorno || null);
        setDxfImportado(true);

        setIsUploadingDxf(false);

      } catch (error) {
        console.error("Erro ao processar DXF", error);
        setDxfErro("Falha de rede ao tentar comunicar com o motor de processamento.");
        setIsUploadingDxf(false);
      }
      return;
    }

    // Vários arquivos de uma vez: não dá pra revisar um por um no formulário
    // único, então cada DXF já vira uma peça própria (qtd=1) direto na lista,
    // usando a máquina/material/espessura selecionados no momento.
    if (!parametroAtual) {
      alert('Cadastre uma parametrização para o material e a espessura selecionados antes de importar vários DXFs.');
      return;
    }

    setIsUploadingDxf(true);
    const novasPecas = [];
    const falhas = [];

    for (const file of files) {
      try {
        const dados = await processarArquivoDxf(file);
        if (!dados.sucesso) {
          falhas.push(`${file.name}: ${dados.erro || 'erro desconhecido'}`);
          continue;
        }
        novasPecas.push(construirPeca({
          id: file.name.replace(/\.dxf$/i, ''), qtd: 1, tipoPeca, tipoTriangulo, maquina: maquinaSelecionada,
          dimA: dados.dimA, dimB: dados.dimB, dimC: 0,
          tipoFuro: 'manual', nFuros: dados.nFuros || 0, diaFuro: dados.diaFuro || 0, furoOffsetX: 0, furoOffsetY: 0,
          dxfImportado: true, dxfAreaUtilMm2: Number(dados.areaUtilMm2 || 0), dxfPerimetroCorteMm: Number(dados.perimetroCorteMm || 0),
          dxfPreviewSvg: dados.svgMarkup, dxfContorno: dados.contorno || null,
        }, parametroAtual));
      } catch {
        falhas.push(`${file.name}: falha de rede`);
      }
    }

    if (novasPecas.length > 0) {
      setListaPecas((prev) => [...prev, ...novasPecas]);
    }
    setIsUploadingDxf(false);

    if (falhas.length > 0) {
      alert(`${novasPecas.length} peça(s) importada(s) de DXF. Falha(s):\n${falhas.join('\n')}`);
    } else {
      alert(`${novasPecas.length} peça(s) importada(s) de DXF com sucesso.`);
    }
  };

  const adicionarOuAtualizarPeca = (e) => {
    e.preventDefault();

    if (!parametroAtual) {
      alert('Cadastre uma parametrização para o material e a espessura selecionados.');
      return;
    }

    const novaPeca = construirPeca({
      id, qtd, tipoPeca, tipoTriangulo, maquina: maquinaSelecionada,
      dimA, dimB, dimC,
      tipoFuro, nFuros, diaFuro, furoOffsetX, furoOffsetY,
      dxfImportado, dxfAreaUtilMm2, dxfPerimetroCorteMm, dxfPreviewSvg, dxfContorno,
    }, parametroAtual);

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
    setNFuros(''); setDiaFuro(''); setTipoFuro('manual'); setFuroOffsetX(''); setFuroOffsetY('');
    setDxfFile(null); setDxfPreviewSvg(null); setDxfErro(null);
    setDxfImportado(false);
    setDxfPerimetroCorteMm(0);
    setDxfAreaUtilMm2(0);
    setDxfContorno(null);

    const maquinaPadrao = maquinasDisponiveis[0] || 'LASER';
    setMaquinaSelecionada(maquinaPadrao);
    setProcesso(maquinaPadrao);

    const primeiroParametroDaMaquina = maquinasParamsOrdenados.find((item) => item.maquina === maquinaPadrao);

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
      configInicial[esp] = { largura: 1200, comprimento: 3000, margem: 10, offsetPeca: 5, maquina: 'LASER', clienteQuerSobra: false };
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

  const handleChapaMaquinaChange = (esp, valor) => {
    setChapasConfig(prev => ({ ...prev, [esp]: { ...prev[esp], maquina: valor } }));
  };

  const handleChapaSobraChange = (esp, valor) => {
    setChapasConfig(prev => ({ ...prev, [esp]: { ...prev[esp], clienteQuerSobra: valor } }));
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
    setTipoTriangulo(peca.tipoTriangulo || 'reto');
    setProcesso(peca.maquina || 'LASER');
    setMaquinaSelecionada(peca.maquina || 'LASER');
    setMaterialSelecionado(peca.material || '');
    setEspessuraSelecionada(Number(peca.espessura).toFixed(2));
    setDimA(peca.dimA); setDimB(peca.dimB); setDimC(peca.dimC); setNFuros(peca.nFuros); setDiaFuro(peca.diaFuro);
    setTipoFuro(peca.tipoFuro || 'manual'); setFuroOffsetX(peca.furoOffsetX); setFuroOffsetY(peca.furoOffsetY);

    // Restaura o preview real do DXF (se essa peça veio de um import) — sem isso
    // o formulário de edição mostrava só a caixa X/Y genérica, não o desenho original.
    setDxfFile(null);
    setDxfErro(null);
    setDxfImportado(!!peca.dxfImportado);
    setDxfPreviewSvg(peca.dxfImportado ? (peca.dxfPreviewSvg || null) : null);
    setDxfAreaUtilMm2(peca.dxfImportado ? Number(peca.areaUtilMm2 || 0) : 0);
    setDxfPerimetroCorteMm(peca.dxfImportado ? Number(peca.perimetroCorteMm || 0) : 0);
    setDxfContorno(peca.dxfImportado ? (peca.contornoDxf || null) : null);

    setEditandoIndex(index);
  };

  const handleSalvar = async () => {
    setIsModalChapasOpen(false); 
    
    const pacoteDeDados = {
      cliente,
      imposto: parseFloat(perfilSelecionado?.imposto_perc ?? 0),
      comissao: parseFloat(comissao),
      margemLucro: parseFloat(margemLucro),
      precoKg: 0,
      frete: parseFloat(frete), 
      processo, 
      pecas: listaPecas,
      configChapas: chapasConfig,
      fatorNesting,
      incluiMaterial,
    };
    
    try {
      const resposta = await fetch(`${API_BASE}/calcular-orcamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pacoteDeDados)
      });
      
      const dadosDoBack = await resposta.json();

      if (dadosDoBack.status === "sucesso") {
         setResultadoOrcamento(dadosDoBack);
         setTelaAtual('resultado');
      } else {
        alert(dadosDoBack.detail || 'Não foi possível calcular o orçamento (verifique as dimensões de chapa/margem).');
        setIsModalChapasOpen(true);
      }
    } catch (erro) {
      console.error("Erro ao conectar com a API:", erro);
      alert("Erro ao processar orçamento no servidor.");
    }
  };

  const renderPreviewPeca = () => {
    // 1) Se estiver upando arquivo
    if (isUploadingDxf) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d1626] rounded-lg p-4 relative overflow-hidden border border-slate-700 shadow-inner min-h-[250px]">
           <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
           <span className="text-orange-400 text-sm font-mono mt-3">Analisando vetores...</span>
        </div>
      );
    }

    // 2) Se o DXF foi lido com sucesso (prioriza o SVG importado)
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

    // 3) Criação vetorial manual/automática baseada em dimensões
    const w = parseFloat(dimA) || (tipoPeca === 'Q' || tipoPeca === 'C' ? 100 : 200);
    const h = tipoPeca === 'C' ? w : (parseFloat(dimB) || (tipoPeca === 'Q' ? w : 100));

    // Calcula um respiro (padding) de 15% para a peça não encostar nas bordas do SVG
    const maxDim = Math.max(w, h);
    const padding = maxDim * 0.15; 
    const viewBox = `-${padding} -${padding} ${w + padding * 2} ${h + padding * 2}`;
    
    // Variáveis da furação
    const diam = Number(diaFuro) || 0;
    const r = diam / 2;
    const furosSvg = calcularFuros(tipoFuro, nFuros, diaFuro, furoOffsetX, furoOffsetY, w, h);

    const strokeW = maxDim * 0.005 > 1 ? maxDim * 0.005 : 1;

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0A0A] rounded-lg p-4 relative overflow-hidden border border-slate-800 shadow-inner min-h-[250px]">
        <span className="absolute top-2 left-2 text-xs font-mono text-slate-500">Preview Geométrico</span>
        
        <svg viewBox={viewBox} className="w-full h-full max-h-48 drop-shadow-2xl">
          <ContornoPeca
            tipoPeca={tipoPeca}
            tipoTriangulo={tipoTriangulo}
            x={0}
            y={0}
            width={w}
            height={h}
            fill="none"
            stroke="#F97316"
            strokeWidth={strokeW}
            strokeDasharray={strokeW * 4}
          />

          {furosSvg.map((furo, index) => (
            <circle 
              key={index} 
              cx={furo.cx} 
              cy={furo.cy} 
              r={r} 
              fill="#F97316" 
            />
          ))}

          {tipoFuro === 'manual' && Number(nFuros) > 5 && diam > 0 && (
            <text x={w/2} y={h/2} textAnchor="middle" dominantBaseline="middle" fill="#F97316" fontSize={maxDim * 0.15}>
              +{nFuros} Furos
            </text>
          )}
        </svg>

        <div className="mt-2 text-center text-xs text-orange-500 font-mono">
          Eixos: X={w}mm | Y={h}mm
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.1),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.15),_transparent_40%),linear-gradient(180deg,_#050505_0%,_#000000_100%)] font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
      
      {/* 🚀 HEADER / NAVBAR */}
      <header className="bg-slate-950/95 backdrop-blur border-b border-orange-500/30 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.9)] px-4 lg:px-8 py-3 lg:py-4 flex flex-col sm:flex-row justify-between items-center shrink-0 z-50 gap-3 print:hidden">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
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
          {papel === 'ADMINISTRADOR' && (
            <button onClick={() => setTelaAtual('parametrizacao')} className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 text-xs lg:text-sm hover:bg-orange-500 hover:text-white transition-all shadow-sm">Parâmetros Globais</button>
          )}
          <button onClick={() => setTelaAtual('perfil')} className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-full border border-white/10 bg-white/5 text-white text-xs lg:text-sm hover:bg-orange-500 hover:text-white transition-all shadow-sm">Meu Perfil</button>
          <button
            onClick={() => setTema((atual) => (atual === 'escuro' ? 'claro' : 'escuro'))}
            title={tema === 'escuro' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            className="w-8 h-8 lg:w-9 lg:h-9 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-orange-500 transition-all shadow-sm shrink-0"
          >
            {tema === 'escuro' ? (
              <svg className="w-4 h-4 lg:w-[18px] lg:h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
              <svg className="w-4 h-4 lg:w-[18px] lg:h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
          </button>
          <button
            onClick={() => supabase && supabase.auth.signOut()}
            title="Sair"
            className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-full border border-white/10 bg-white/5 text-white text-xs lg:text-sm hover:bg-red-500/80 hover:border-red-500/50 transition-all shadow-sm"
          >
            Sair
          </button>
          <span className="hidden sm:inline-block text-white font-bold tracking-widest uppercase text-[10px] lg:text-xs bg-slate-800 px-2 py-1.5 lg:px-3 lg:py-2 rounded-full border border-slate-700">Lypsyos</span>
        </div>
      </header>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 relative overflow-hidden">
        
        {/* TELA: PARAMETRIZAÇÃO GLOBAIS (RBAC: só ADMINISTRADOR) */}
        {telaAtual === 'parametrizacao' && papel !== 'ADMINISTRADOR' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="surface-card rounded-3xl p-8 text-center max-w-sm">
              <p className="text-lg font-black surface-heading mb-2">🔒 Acesso restrito</p>
              <p className="text-sm surface-muted">Somente usuários com papel Administrador podem acessar os Parâmetros Globais.</p>
            </div>
          </div>
        )}
        {telaAtual === 'parametrizacao' && papel === 'ADMINISTRADOR' && (
          <div className="absolute inset-0 p-4 lg:p-6 overflow-y-auto scrollbar-thin">
            <div className="max-w-7xl mx-auto space-y-6 pb-10">
              <div className="surface-card backdrop-blur rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.45)] dark:shadow-[0_24px_80px_-35px_rgba(0,0,0,0.7)] border-t-4 border-orange-500 p-4 lg:p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl lg:text-2xl font-black surface-heading uppercase tracking-tight">Parâmetros Globais</h2>
                    <p className="text-sm surface-muted mt-1">Matéria-prima, máquina/corte e tarifação em cadastros independentes.</p>
                  </div>
                  <button onClick={() => setTelaAtual('formulario')} className="bg-slate-900 dark:bg-orange-500 text-white px-5 py-2.5 rounded-full font-bold hover:bg-slate-800 dark:hover:bg-orange-600 transition-all text-sm w-full md:w-auto text-center">
                    Voltar ao orçamento
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-6 p-1 bg-slate-100 dark:bg-black/30 rounded-full w-full sm:w-fit">
                  <button
                    type="button"
                    onClick={() => setAbaGlobal('materiais')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs lg:text-sm font-bold transition-all ${abaGlobal === 'materiais' ? 'bg-slate-950 dark:bg-orange-500 text-white shadow-lg' : 'surface-muted hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    Matéria-prima
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbaGlobal('maquinas')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs lg:text-sm font-bold transition-all ${abaGlobal === 'maquinas' ? 'bg-slate-950 dark:bg-orange-500 text-white shadow-lg' : 'surface-muted hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    Máquina &amp; Corte
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbaGlobal('tarifacao')}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs lg:text-sm font-bold transition-all ${abaGlobal === 'tarifacao' ? 'bg-slate-950 dark:bg-orange-500 text-white shadow-lg' : 'surface-muted hover:text-slate-900 dark:hover:text-white'}`}
                  >
                    Tarifação/Impostos
                  </button>
                </div>

                {abaGlobal === 'materiais' && (
                  <form onSubmit={salvarMaterial} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end surface-card-inset p-4 rounded-2xl shadow-inner">
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="block text-xs font-bold surface-muted uppercase">Material</label>
                      <input type="text" value={formMaterial.nome} onChange={(e) => atualizarFormMaterial('nome', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm" placeholder="Ex: Aço Carbono"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">Espessura</label>
                      <input type="number" step="0.01" value={formMaterial.espessura} onChange={(e) => atualizarFormMaterial('espessura', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">Preço/kg</label>
                      <input type="number" step="0.01" value={formMaterial.precoKg} onChange={(e) => atualizarFormMaterial('precoKg', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">Densidade</label>
                      <input type="number" step="0.01" value={formMaterial.densidade} onChange={(e) => atualizarFormMaterial('densidade', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-5 flex flex-col sm:flex-row gap-3 justify-end pt-2">
                      {editandoMaterialId !== null && (
                        <button type="button" onClick={limparFormMaterial} className="w-full sm:w-auto px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-white/10 text-sm">Cancelar edição</button>
                      )}
                      <button type="submit" className="w-full sm:w-auto bg-orange-500 text-white px-6 py-2.5 rounded-full font-bold shadow-lg hover:bg-orange-600 text-sm">
                        {editandoMaterialId !== null ? 'Salvar' : 'Adicionar'}
                      </button>
                    </div>
                  </form>
                )}

                {abaGlobal === 'maquinas' && (
                  <form onSubmit={salvarMaquinaParam} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 items-end surface-card-inset p-4 rounded-2xl shadow-inner">
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">Máquina</label>
                      <select value={formMaquina.maquina} onChange={(e) => atualizarFormMaquina('maquina', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm">
                        {PERFIS_MAQUINA_SUPORTADOS.map((maquina) => (
                          <option key={maquina} value={maquina}>{rotuloMaquina(maquina)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="block text-xs font-bold surface-muted uppercase">Material</label>
                      <select value={formMaquina.material} onChange={(e) => atualizarFormMaquina('material', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm">
                        {materiaisNomesCadastrados.length === 0 ? <option value="">Cadastre um material</option> : materiaisNomesCadastrados.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">Espessura</label>
                      <input type="number" step="0.01" value={formMaquina.espessura} onChange={(e) => atualizarFormMaquina('espessura', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">Velocidade</label>
                      <input type="number" step="1" value={formMaquina.velocidadeCorte} onChange={(e) => atualizarFormMaquina('velocidadeCorte', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">Piercing (s)</label>
                      <input type="number" step="0.1" value={formMaquina.tempoPiercing} onChange={(e) => atualizarFormMaquina('tempoPiercing', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">Setup (min)</label>
                      <input type="number" step="0.1" value={formMaquina.tempoSetup} onChange={(e) => atualizarFormMaquina('tempoSetup', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold surface-muted uppercase">R$/Hora</label>
                      <input type="number" step="0.01" value={formMaquina.valorHora} onChange={(e) => atualizarFormMaquina('valorHora', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                    </div>
                    {formMaquinaSemMaterialCorrespondente && (
                      <div className="sm:col-span-2 lg:col-span-7 flex flex-col sm:flex-row sm:items-center gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-2.5 text-[11px] lg:text-xs text-amber-800 dark:text-amber-300">
                        <span className="flex-1">Não existe <b className="text-amber-900 dark:text-amber-200">{formMaquina.material} {Number(formMaquina.espessura).toFixed(2)}mm</b> cadastrado em Matéria-prima ainda — esse parâmetro de máquina não vai aparecer para seleção até você cadastrar o material com essa espessura.</span>
                        <button type="button" onClick={() => setAbaGlobal('materiais')} className="shrink-0 text-[10px] lg:text-xs bg-amber-500 text-white px-3 py-1.5 rounded-full font-bold hover:bg-amber-600">Ir para Matéria-prima</button>
                      </div>
                    )}
                    <div className="sm:col-span-2 lg:col-span-7 flex flex-col sm:flex-row gap-3 justify-end pt-2">
                      {editandoMaquinaId !== null && (
                        <button type="button" onClick={limparFormMaquina} className="w-full sm:w-auto px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-white/10 text-sm">Cancelar edição</button>
                      )}
                      <button type="submit" className="w-full sm:w-auto bg-orange-500 text-white px-6 py-2.5 rounded-full font-bold shadow-lg hover:bg-orange-600 text-sm">
                        {editandoMaquinaId !== null ? 'Salvar' : 'Adicionar'}
                      </button>
                    </div>
                  </form>
                )}

                {abaGlobal === 'tarifacao' && (
                  <div className="space-y-6">
                    <div className="surface-card-inset p-4 lg:p-5 rounded-2xl shadow-inner space-y-4">
                      <h3 className="text-lg font-black surface-heading tracking-tight">Comissão, Markup e Frete</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold surface-muted uppercase">Comissão (%)</label>
                          <div className="input-field mt-1 flex items-center rounded-xl pr-2 shadow-sm"><input type="number" step="0.01" value={comissao} onChange={(e) => setComissao(e.target.value)} className="w-full bg-transparent rounded-xl p-2 text-sm outline-none"/><span className="surface-muted font-black text-xs">%</span></div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold surface-muted uppercase">MARKUP (%)</label>
                          <div className="input-field mt-1 flex items-center rounded-xl pr-2 shadow-sm"><input type="number" step="0.01" value={margemLucro} onChange={(e) => setMargemLucro(e.target.value)} className="w-full bg-transparent rounded-xl p-2 text-sm outline-none"/><span className="surface-muted font-black text-xs">%</span></div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold surface-muted uppercase">Frete (R$)</label>
                          <div className="input-field mt-1 flex items-center rounded-xl px-2 shadow-sm"><span className="surface-muted font-black text-xs">R$</span><input type="number" step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} className="w-full bg-transparent rounded-xl p-2 text-sm outline-none text-right"/></div>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={salvarPerfil} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end surface-card-inset p-4 rounded-2xl shadow-inner">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold surface-muted uppercase">Perfil de Faturamento</label>
                        <input type="text" value={formPerfil.nome} onChange={(e) => atualizarFormPerfil('nome', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm" placeholder="Ex: Revenda, Industrialização, Simples Nacional"/>
                      </div>
                      <div>
                        <label className="block text-xs font-bold surface-muted uppercase">Imposto (%)</label>
                        <input type="number" step="0.01" value={formPerfil.imposto_perc} onChange={(e) => atualizarFormPerfil('imposto_perc', e.target.value)} className="input-field mt-1 w-full rounded-xl p-2.5 focus:ring-2 focus:ring-orange-500 outline-none text-sm"/>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 justify-end">
                        {editandoPerfilId !== null && (
                          <button type="button" onClick={limparFormPerfil} className="w-full sm:w-auto px-5 py-2.5 rounded-full border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-white/10 text-sm">Cancelar</button>
                        )}
                        <button type="submit" className="w-full sm:w-auto bg-orange-500 text-white px-6 py-2.5 rounded-full font-bold shadow-lg hover:bg-orange-600 text-sm">
                          {editandoPerfilId !== null ? 'Salvar' : 'Adicionar'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

              {abaGlobal === 'materiais' && (
                <div className="surface-card backdrop-blur rounded-3xl shadow-lg overflow-hidden">
                  <div className="p-4 lg:p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                    <h3 className="text-base lg:text-lg font-bold surface-heading">Materiais cadastrados</h3>
                    <span className="text-xs font-semibold surface-muted">{materiaisOrdenados.length} reg.</span>
                  </div>
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left min-w-[600px]">
                      <thead className="bg-slate-950 text-white text-[10px] lg:text-xs uppercase tracking-wider">
                        <tr>
                          <th className="p-3 lg:p-4">Material</th><th className="p-3 lg:p-4">Espessura</th>
                          <th className="p-3 lg:p-4">R$/Kg</th><th className="p-3 lg:p-4">Densidade</th>
                          <th className="p-3 lg:p-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/10 text-xs lg:text-sm">
                        {materiaisOrdenados.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors">
                            <td className="p-3 lg:p-4 font-semibold">
                              {item.nome}
                              {materiaisSemParametroDeCorte.has(item.id) && (
                                <span title="Sem parâmetro de máquina/corte cadastrado — não vai aparecer para seleção na tela de orçamento" className="ml-2 inline-block text-[9px] bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-bold align-middle">sem corte</span>
                              )}
                            </td><td className="p-3 lg:p-4">{item.espessura.toFixed(2)} mm</td>
                            <td className="p-3 lg:p-4">R$ {item.precoKg.toFixed(2)}</td><td className="p-3 lg:p-4">{item.densidade.toFixed(2)}</td>
                            <td className="p-3 lg:p-4 text-right">
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => editarMaterial(item)} className="text-[10px] bg-slate-100 dark:bg-white/10 surface-body px-2 py-1.5 lg:px-3 lg:py-2 rounded-full font-bold">Editar</button>
                                <button onClick={() => removerMaterial(item.id)} className="text-[10px] bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1.5 lg:px-3 lg:py-2 rounded-full font-bold">Excluir</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {abaGlobal === 'maquinas' && (
                <div className="surface-card backdrop-blur rounded-3xl shadow-lg overflow-hidden">
                  <div className="p-4 lg:p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                    <h3 className="text-base lg:text-lg font-bold surface-heading">Parâmetros de máquina cadastrados</h3>
                    <span className="text-xs font-semibold surface-muted">{maquinasParamsOrdenados.length} reg.</span>
                  </div>
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left min-w-[720px]">
                      <thead className="bg-slate-950 text-white text-[10px] lg:text-xs uppercase tracking-wider">
                        <tr>
                          <th className="p-3 lg:p-4">Máquina</th><th className="p-3 lg:p-4">Material</th><th className="p-3 lg:p-4">Espessura</th>
                          <th className="p-3 lg:p-4">Velocidade</th><th className="p-3 lg:p-4">Piercing</th><th className="p-3 lg:p-4">Setup</th><th className="p-3 lg:p-4">R$/Hora</th>
                          <th className="p-3 lg:p-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/10 text-xs lg:text-sm">
                        {maquinasParamsOrdenados.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors">
                            <td className="p-3 lg:p-4 font-semibold text-orange-600">{item.maquina}</td><td className="p-3 lg:p-4 font-semibold">{item.material}</td><td className="p-3 lg:p-4">{item.espessura.toFixed(2)} mm</td>
                            <td className="p-3 lg:p-4">{item.velocidadeCorte} mm/min</td><td className="p-3 lg:p-4">{item.tempoPiercing}s</td><td className="p-3 lg:p-4">{item.tempoSetup}min</td><td className="p-3 lg:p-4">R$ {Number(item.valorHora || 0).toFixed(2)}</td>
                            <td className="p-3 lg:p-4 text-right">
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => editarMaquinaParam(item)} className="text-[10px] bg-slate-100 dark:bg-white/10 surface-body px-2 py-1.5 lg:px-3 lg:py-2 rounded-full font-bold">Editar</button>
                                <button onClick={() => removerMaquinaParam(item.id)} className="text-[10px] bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1.5 lg:px-3 lg:py-2 rounded-full font-bold">Excluir</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {abaGlobal === 'tarifacao' && (
                <div className="surface-card backdrop-blur rounded-3xl shadow-lg overflow-hidden">
                  <div className="p-4 lg:p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                    <h3 className="text-base lg:text-lg font-bold surface-heading">Perfis de Faturamento cadastrados</h3>
                    <span className="text-xs font-semibold surface-muted">{listaPerfisTributarios.length} reg.</span>
                  </div>
                  <div className="overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left min-w-[400px]">
                      <thead className="bg-slate-950 text-white text-[10px] lg:text-xs uppercase tracking-wider">
                        <tr>
                          <th className="p-3 lg:p-4">Perfil</th><th className="p-3 lg:p-4">Imposto</th>
                          <th className="p-3 lg:p-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/10 text-xs lg:text-sm">
                        {listaPerfisTributarios.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors">
                            <td className="p-3 lg:p-4 font-semibold">{item.nome}</td><td className="p-3 lg:p-4">{item.imposto_perc.toFixed(2)}%</td>
                            <td className="p-3 lg:p-4 text-right">
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => editarPerfil(item)} className="text-[10px] bg-slate-100 dark:bg-white/10 surface-body px-2 py-1.5 lg:px-3 lg:py-2 rounded-full font-bold">Editar</button>
                                <button onClick={() => removerPerfil(item.id)} className="text-[10px] bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1.5 lg:px-3 lg:py-2 rounded-full font-bold">Excluir</button>
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
              
              {/* BARRA COMPACTA: CONFIGURAÇÃO GERAL DO ORÇAMENTO */}
              <div className="surface-card rounded-2xl border-t-4 border-orange-500 px-3 py-2.5 lg:px-4 lg:py-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2 lg:gap-3 items-end">
                  <div className="col-span-2 sm:col-span-4 lg:col-span-3">
                    <label className="block text-[9px] font-bold uppercase tracking-wider surface-muted">Cliente</label>
                    <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)} className="input-field mt-0.5 w-full rounded-lg px-2 py-1.5 text-xs" placeholder="Nome da empresa" />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[9px] font-bold uppercase tracking-wider surface-muted">Máquina</label>
                    <select value={maquinaSelecionada} onChange={(e) => selecionarMaquina(e.target.value)} className="input-field mt-0.5 w-full rounded-lg px-2 py-1.5 text-xs">
                      {(maquinasDisponiveis.length > 0 ? maquinasDisponiveis : ['LASER', 'PLASMA']).map((maquina) => (
                        <option key={maquina} value={maquina}>{rotuloMaquinaLongo(maquina)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 lg:col-span-4">
                    <label className="block text-[9px] font-bold uppercase tracking-wider surface-muted">Material Base</label>
                    <select value={materialSelecionado} onChange={(e) => selecionarMaterial(e.target.value)} className="input-field mt-0.5 w-full rounded-lg px-2 py-1.5 text-xs">
                      {materiaisDisponiveis.length === 0 ? <option value="">Cadastre um material</option> : materiaisDisponiveis.map((material) => <option key={material} value={material}>{material}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 lg:col-span-3">
                    <label className="block text-[9px] font-bold uppercase tracking-wider surface-muted">Perfil de Faturamento</label>
                    <select value={perfilSelecionadoId} onChange={(e) => setPerfilSelecionadoId(e.target.value)} className="input-field mt-0.5 w-full rounded-lg px-2 py-1.5 text-xs">
                      {listaPerfisTributarios.length === 0 ? <option value="">Cadastre um perfil</option> : listaPerfisTributarios.map((perfil) => <option key={perfil.id} value={perfil.id}>{perfil.nome} ({perfil.imposto_perc.toFixed(2)}%)</option>)}
                    </select>
                  </div>
                </div>

                <label className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-white/10 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider surface-muted cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={incluiMaterial}
                    onChange={(e) => setIncluiMaterial(e.target.checked)}
                    className="w-4 h-4 accent-orange-500"
                  />
                  Incluir custo de material
                  <span className="font-normal normal-case text-[9px] surface-muted">
                    {incluiMaterial ? '(pacote completo: material + corte)' : '(facção — cliente traz a própria chapa)'}
                  </span>
                </label>
              </div>

              {/* INSERÇÃO DE PEÇAS E UPLOAD DE DXF */}
              <div className="surface-card p-3 lg:p-4 rounded-2xl shadow-[0_4px_20px_-5px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_-5px_rgba(0,0,0,0.4)] border-t-4 border-orange-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 border-b border-slate-200 dark:border-white/10 pb-2 gap-2">
                  <h2 className="text-sm lg:text-base font-black surface-heading uppercase tracking-tight">
                    {editandoIndex !== null ? '✏️ Editando Peça' : 'Adicionar Peça'}
                  </h2>
                  {editandoIndex !== null ? (
                    <button onClick={() => { setEditandoIndex(null); limparFormulario(); }} className="text-[10px] surface-muted hover:text-red-500 dark:hover:text-red-400 font-bold uppercase w-full sm:w-auto text-left sm:text-right">Cancelar Edição</button>
                  ) : (
                    <div className="flex rounded-full bg-slate-900/5 dark:bg-white/10 p-0.5 text-[10px] font-bold uppercase">
                      <button onClick={() => setModoEntrada('formulario')} className={`px-3 py-1.5 rounded-full transition-colors ${modoEntrada === 'formulario' ? 'bg-orange-500 text-white' : 'surface-muted hover:text-orange-500'}`}>Formulário</button>
                      <button onClick={() => setModoEntrada('rapida')} className={`px-3 py-1.5 rounded-full transition-colors ${modoEntrada === 'rapida' ? 'bg-orange-500 text-white' : 'surface-muted hover:text-orange-500'}`}>Entrada Rápida</button>
                    </div>
                  )}
                </div>

                {modoEntrada === 'rapida' && editandoIndex === null ? (
                  <RapidEntryGrid
                    maquinasParamsOrdenados={maquinasParamsOrdenados}
                    listaMateriais={listaMateriais}
                    maquinaPadrao={maquinaSelecionada}
                    materialPadrao={materialSelecionado}
                    espessuraPadrao={espessuraSelecionada}
                    onAdicionarPecas={(pecas) => setListaPecas((prev) => [...prev, ...pecas])}
                  />
                ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

                  <div className="xl:col-span-2 space-y-3">

                    <div className={`border-2 border-dashed rounded-lg p-2.5 text-center transition-colors relative
                      ${dxfErro ? 'border-red-400 bg-red-500/10' : 'border-slate-600 bg-black/20'}`}>
                        <input type="file" accept=".dxf" multiple onChange={handleDxfUpload} disabled={isUploadingDxf} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                        <div className="flex flex-row items-center justify-center gap-2">
                          <svg className={`w-4 h-4 shrink-0 ${dxfErro ? 'text-red-400' : 'text-orange-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                          <span className={`text-[11px] font-semibold truncate ${dxfErro ? 'text-red-400' : 'text-slate-300'}`}>
                              {isUploadingDxf ? 'Analisando...' : dxfFile ? dxfFile.name : 'Toque ou arraste um ou mais DXF'}
                          </span>
                        </div>
                    </div>
                    {!dxfFile && !isUploadingDxf && (
                      <p className="text-[9px] text-slate-500 -mt-1 px-1">Selecione vários arquivos de uma vez para importar cada um como uma peça (qtd. 1, usando a máquina/material/espessura atuais).</p>
                    )}

                    {dxfImportado && (
                      <div className="grid grid-cols-3 gap-1.5 text-[9px] text-center">
                        <div className="bg-black/30 border border-white/10 text-white rounded-lg p-1.5"><p className="text-slate-500">Perímetro</p><p className="text-xs font-bold text-orange-400 truncate">{dxfPerimetroCorteMm.toFixed(2)}</p></div>
                        <div className="bg-black/30 border border-white/10 text-white rounded-lg p-1.5"><p className="text-slate-500">Área útil</p><p className="text-xs font-bold text-orange-400 truncate">{dxfAreaUtilMm2.toFixed(2)}</p></div>
                        <div className="bg-black/30 border border-white/10 text-white rounded-lg p-1.5"><p className="text-slate-500">Furos</p><p className="text-xs font-bold text-orange-400 truncate">{nFuros}</p></div>
                      </div>
                    )}

                    <form onSubmit={adicionarOuAtualizarPeca} className="space-y-3">

                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-orange-500 mb-1.5">Identificação &amp; Geometria</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          <div className="sm:col-span-2">
                            <label className="block text-[9px] font-bold surface-muted uppercase">Identificador</label>
                            <input type="text" value={id} onChange={(e) => setId(e.target.value)} required className="input-field mt-0.5 w-full rounded-lg px-2 py-1.5 text-xs" placeholder="Ex: PC-01" />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold surface-muted uppercase">QTD</label>
                            <input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} required min="1" className="input-field mt-0.5 w-full rounded-lg px-2 py-1.5 text-xs" />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold surface-muted uppercase">Geometria</label>
                            <select
                              value={tipoPeca}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTipoPeca(val);
                                if ((val === 'C' || val === 'T') && tipoFuro !== 'manual') {
                                  setTipoFuro('manual');
                                  setNFuros('');
                                }
                              }}
                              className="input-field mt-0.5 w-full rounded-lg px-2 py-1.5 text-xs"
                            >
                                <option value="R">Retangular</option>
                                <option value="Q">Quadrado</option>
                                <option value="C">Círculo</option>
                                <option value="T">Triângulo</option>
                            </select>
                          </div>
                        </div>

                        <div className="w-full mt-2">
                          <label className="block text-[9px] font-bold surface-muted uppercase">Espessura (mm)</label>
                          <select value={espessuraSelecionada} onChange={(e) => setEspessuraSelecionada(e.target.value)} required disabled={espessurasDisponiveis.length === 0} className="input-field mt-0.5 w-full rounded-lg px-2 py-1.5 text-xs">
                            {espessurasDisponiveis.length === 0 ? <option value="">Nenhuma espessura cadastrada</option> : espessurasDisponiveis.map((esp) => <option key={esp} value={esp}>{esp} mm</option>)}
                          </select>
                          {materialSelecionado && espessurasDisponiveis.length === 0 && (
                            <div className="mt-1.5 flex flex-col sm:flex-row sm:items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-2 text-[10px] text-amber-800 dark:text-amber-300">
                              <span className="flex-1">Nenhum parâmetro de corte para <b className="text-amber-900 dark:text-amber-200">{maquinaSelecionada} + {materialSelecionado}</b>.</span>
                              <button type="button" onClick={() => { setTelaAtual('parametrizacao'); setAbaGlobal('maquinas'); }} className="shrink-0 text-[9px] bg-amber-500 text-white px-2 py-1 rounded-full font-bold hover:bg-amber-600">Cadastrar agora</button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-orange-500 mb-1.5">Dimensões</p>
                        <div className="surface-card-inset grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 rounded-lg">
                          {tipoPeca === 'C' ? (
                            <div className="col-span-2 sm:col-span-1">
                              <label className="block text-[9px] font-semibold surface-muted">Diâmetro (mm)</label>
                              <input type="number" value={dimA} onChange={(e) => setDimA(e.target.value)} required disabled={dxfImportado} className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs" />
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="block text-[9px] font-semibold surface-muted">{tipoPeca === 'T' ? 'Base (X)' : 'Dim A (X)'}</label>
                                <input type="number" value={dimA} onChange={(e) => setDimA(e.target.value)} required disabled={dxfImportado} className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs" />
                              </div>
                              <div>
                                <label className="block text-[9px] font-semibold surface-muted">{tipoPeca === 'T' ? 'Altura (Y)' : 'Dim B (Y)'}</label>
                                <input type="number" value={dimB} onChange={(e) => setDimB(e.target.value)} required disabled={dxfImportado} className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs" />
                              </div>
                            </>
                          )}
                          {tipoPeca === 'T' ? (
                            <div className="col-span-2 sm:col-span-1">
                              <label className="block text-[9px] font-semibold surface-muted">Tipo de Triângulo</label>
                              <select value={tipoTriangulo} onChange={(e) => setTipoTriangulo(e.target.value)} className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs">
                                <option value="reto">Reto</option>
                                <option value="isosceles">Isósceles</option>
                              </select>
                            </div>
                          ) : (
                            <div className="col-span-2 sm:col-span-1">
                              <label className="block text-[9px] font-semibold surface-muted">Dim C (Z)</label>
                              <input type="number" value={dimC} onChange={(e) => setDimC(e.target.value)} className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs" placeholder="Opc." />
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-orange-500 mb-1.5">Furação</p>
                        <div className="surface-card-inset grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 rounded-lg">
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-[9px] font-semibold surface-muted">Tipo de Furo</label>
                            <select
                              value={tipoFuro}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTipoFuro(val);
                                if (val === 'auto_4') setNFuros('4');
                                else if (val === 'auto_6') setNFuros('6');
                                else if (val === 'auto_8') setNFuros('8');
                                else setNFuros('');
                              }}
                              className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs"
                            >
                              <option value="manual">Manual</option>
                              {tipoPeca !== 'C' && tipoPeca !== 'T' && (
                                <>
                                  <option value="auto_4">Automático (4 Furos)</option>
                                  <option value="auto_6">Automático (6 Furos)</option>
                                  <option value="auto_8">Automático (8 Furos)</option>
                                </>
                              )}
                            </select>
                          </div>

                          {tipoFuro === 'manual' ? (
                            <div>
                              <label className="block text-[9px] font-semibold surface-muted">Nº Furos</label>
                              <input type="number" value={nFuros} onChange={(e) => setNFuros(e.target.value)} min="0" className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs" />
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="block text-[9px] font-semibold surface-muted">Offset X (mm)</label>
                                <input type="number" value={furoOffsetX} onChange={(e) => setFuroOffsetX(e.target.value)} required min="0" className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs border-orange-500/50" placeholder="Ex: 35" />
                              </div>
                              <div>
                                <label className="block text-[9px] font-semibold surface-muted">Offset Y (mm)</label>
                                <input type="number" value={furoOffsetY} onChange={(e) => setFuroOffsetY(e.target.value)} required min="0" className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs border-orange-500/50" placeholder="Ex: 40" />
                              </div>
                            </>
                          )}

                          <div>
                            <label className="block text-[9px] font-semibold surface-muted">Ø Furo</label>
                            <input type="number" value={diaFuro} onChange={(e) => setDiaFuro(e.target.value)} min="0" step="0.1" className="input-field mt-0.5 w-full rounded px-2 py-1.5 text-xs" />
                          </div>
                        </div>
                      </div>

                      <button type="submit" className="w-full text-white font-black py-2.5 rounded-full transition-all shadow-lg hover:-translate-y-0.5 bg-orange-500 hover:bg-orange-600 text-sm">
                        {editandoIndex !== null ? '✓ Salvar Alterações' : '+ Adicionar Peça'}
                      </button>
                    </form>
                  </div>

                  <div className="xl:col-span-1 min-h-[180px] h-[220px] xl:h-full flex flex-col">
                    {renderPreviewPeca()}
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* LADO DIREITO: LISTA LATERAL */}
            <div className="surface-card w-full lg:w-[35%] h-[500px] lg:h-full flex flex-col p-4 lg:p-6 rounded-3xl shadow-[0_4px_20px_-5px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_-5px_rgba(0,0,0,0.4)] border-t-4 border-orange-500 shrink-0">
              <div className="flex justify-between items-center mb-3 border-b border-slate-200 dark:border-white/10 pb-2">
                <h2 className="text-base lg:text-lg font-black surface-heading">Itens do Orçamento</h2>
                <span className="bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300 text-[10px] lg:text-xs font-bold px-2 py-1 rounded-full">{listaPecas.length} peças</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                {listaPecas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full surface-muted space-y-2 opacity-60">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                      <p className="text-xs font-medium">Lista vazia.</p>
                  </div>
                ) : (
                  listaPecas.map((peca, index) => (
                    <div key={index} className="surface-card-inset p-3 rounded-2xl hover:border-orange-500/50 transition-all text-xs lg:text-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0 pr-2">
                          <span className="font-bold surface-heading truncate block">
                            {peca.id}
                            {peca.dxfImportado && <span className="ml-1.5 text-[8px] font-black text-orange-500 align-middle">DXF</span>}
                          </span>
                          <div className="flex gap-1.5 mt-2">
                            <button onClick={() => editarPeca(index)} className="text-[9px] lg:text-[10px] bg-slate-900/5 dark:bg-white/10 surface-body px-2 py-1.5 rounded-full font-bold hover:bg-slate-900/10 dark:hover:bg-white/20">EDITAR</button>
                            <button onClick={() => removerPeca(index)} className="text-[9px] lg:text-[10px] bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1.5 rounded-full font-bold hover:bg-red-100 dark:hover:bg-red-500/20">REMOVER</button>
                          </div>
                        </div>
                        <span className="text-[10px] lg:text-xs font-bold bg-orange-500 text-white px-2 py-1 rounded shrink-0">{peca.qtd} UN</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-y-1.5 border-t border-slate-200 dark:border-white/10 pt-2 text-[10px] lg:text-xs surface-muted">
                        <p className="truncate">Material: <b className="surface-body">{peca.material}</b></p>
                        <p>Esp.: <b className="surface-body">{peca.espessura}mm</b></p>
                        <p>Dim: <b className="surface-body">{peca.dimA}x{peca.dimB}</b></p>
                        <p>R$/Kg: <b className="surface-body">R${Number(peca.precoKgBase || 0).toFixed(2)}</b></p>
                        <p className="col-span-2 text-orange-600 dark:text-orange-400 font-semibold text-right border-t border-orange-200 dark:border-orange-500/20 pt-1 mt-1">Peso Tot: <b>{peca.pesoTotal}kg</b></p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {listaPecas.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-white/10 mt-2 shrink-0">
                  <button onClick={prepararProcessamento} className="w-full bg-orange-500 text-white py-3 lg:py-3.5 rounded-full font-black hover:bg-orange-600 text-sm">
                    Processar Orçamento ➔
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TELA: DASHBOARD DE RESULTADOS */}
        {telaAtual === 'resultado' && resultadoOrcamento && (
          <div className="absolute inset-0 p-4 lg:p-8 overflow-y-auto scrollbar-thin print:p-0 print:overflow-visible print:bg-white print:font-sans">
            <div className="max-w-7xl mx-auto pb-10 print:max-w-none print:w-full print:m-0 print:p-2">
              
              <div className="surface-card backdrop-blur rounded-3xl shadow-xl border-t-8 border-orange-500 overflow-hidden print:shadow-none print:border-none print:rounded-none print:bg-white relative print:text-[10px]">
                
                {/* ========================================== */}
                {/* CABEÇALHO - VERSÃO WEB (Oculto na Impressão) */}
                {/* ========================================== */}
                <div className="bg-slate-950 p-6 lg:p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:hidden">
                  <div>
                    <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-wider">Resumo de <span className="text-orange-500">Produção</span></h1>
                    <p className="text-slate-400 mt-2 text-sm lg:text-base">Cliente: <span className="font-bold text-white">{cliente || 'Consumidor Final'}</span></p>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs lg:text-sm text-slate-400">
                      <span>MÁQ: <b className="text-orange-400">{processo}</b></span>
                      <span>EMISSÃO: <b className="text-white">{dataEmissao?.toLocaleDateString('pt-BR')}</b></span>
                    </div>
                    <span className={`inline-block mt-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${resultadoOrcamento.inclui_material ? 'bg-orange-500/20 text-orange-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {resultadoOrcamento.inclui_material ? '📦 Pacote completo (material + corte)' : '✂️ Só serviço (facção — chapa por conta do cliente)'}
                    </span>
                  </div>
                  <div className="flex w-full md:w-auto gap-3">
                    <button onClick={() => setTelaAtual('formulario')} className="flex-1 md:flex-none bg-white/10 px-4 py-2.5 lg:py-3 rounded-full font-bold text-xs lg:text-sm text-center border border-white/10">← Editar</button>
                    <button onClick={baixarPDF} className="flex-1 md:flex-none bg-orange-500 text-white px-4 py-2.5 lg:py-3 rounded-full font-black text-xs lg:text-sm text-center shadow-lg hover:bg-orange-600 transition-colors">📄 Gerar PDF Técnico</button>
                  </div>
                </div>

                {/* ========================================== */}
                {/* CABEÇALHO - VERSÃO PDF B2B (Visível só na Impressão) */}
                {/* ========================================== */}
                <div className="hidden print:flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4 pt-2">
                  <div className="flex flex-col">
                    <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase leading-none mb-1">
                      Lypsyos
                    </h1>
                    <h2 className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                      Consultoria & Orçamento Técnico
                    </h2>
                    <span className="mt-1.5 inline-block w-fit px-2 py-0.5 border border-slate-900 text-[8px] font-bold uppercase tracking-wider text-slate-900">
                      {resultadoOrcamento.inclui_material ? 'Pacote completo (material + corte)' : 'Só serviço (facção — chapa por conta do cliente)'}
                    </span>
                  </div>
                  <div className="text-right text-[10px] text-slate-900">
                    <table className="text-right ml-auto">
                      <tbody>
                        <tr><td className="pr-2 font-bold uppercase text-slate-600">Orçamento:</td><td className="font-black">{String(Math.floor(Math.random() * 9000) + 1000)}</td></tr>
                        <tr><td className="pr-2 font-bold uppercase text-slate-600">Máquina:</td><td className="font-black uppercase">{processo}</td></tr>
                        <tr><td className="pr-2 font-bold uppercase text-slate-600">Cliente:</td><td className="font-black uppercase">{cliente || 'CONSUMIDOR FINAL'}</td></tr>
                        <tr><td className="pr-2 font-bold uppercase text-slate-600">Emissão:</td><td className="font-black">{dataEmissao?.toLocaleDateString('pt-BR')}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ========================================== */}
                {/* TOTAIS GLOBAIS - VERSÃO WEB */}
                {/* ========================================== */}
                <div className="print:hidden p-4 lg:p-8 bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-white/10">
                  <h3 className="text-base lg:text-lg font-black surface-heading mb-4 tracking-tight">📊 Totais Globais</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 xl:gap-4">
                    <div className="input-field p-3 lg:p-4 rounded-xl shadow-sm text-center flex flex-col justify-center">
                        <p className="text-[10px] lg:text-xs font-bold surface-muted uppercase">Peças</p>
                        <p className="text-lg xl:text-xl font-black surface-heading mt-1 truncate">{resultadoOrcamento.totais_globais.total_pecas}</p>
                    </div>
                    <div className="input-field p-3 lg:p-4 rounded-xl shadow-sm text-center flex flex-col justify-center">
                        <p className="text-[10px] lg:text-xs font-bold surface-muted uppercase">Chapas</p>
                        <p className="text-lg xl:text-xl font-black surface-heading mt-1 truncate">{resultadoOrcamento.totais_globais.chapas_totais}</p>
                    </div>
                    <div className="input-field p-3 lg:p-4 rounded-xl shadow-sm text-center flex flex-col justify-center">
                        <p className="text-[10px] lg:text-xs font-bold surface-muted uppercase">Peso (Kg)</p>
                        <p className="text-lg xl:text-xl font-black surface-heading mt-1 truncate">{resultadoOrcamento.totais_globais.peso_total_kg}</p>
                    </div>
                    <div className="input-field p-3 lg:p-4 rounded-xl shadow-sm text-center flex flex-col justify-center">
                        <p className="text-[10px] lg:text-xs font-bold surface-muted uppercase">Tempo</p>
                        <p className="text-base xl:text-lg font-black surface-heading mt-1 truncate">
                          {Math.floor(resultadoOrcamento.totais_globais.tempo_total_min / 60)}h {Math.round(resultadoOrcamento.totais_globais.tempo_total_min % 60)}m
                        </p>
                    </div>
                    <div className="bg-white dark:bg-orange-500/10 p-3 lg:p-4 rounded-xl border border-orange-200 dark:border-orange-500/30 shadow-sm text-center flex flex-col justify-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] lg:text-xs font-bold text-orange-800 dark:text-orange-300 uppercase">Custo Máquina R$</p>
                      <p className="text-lg xl:text-xl font-black text-orange-700 dark:text-orange-400 mt-1 truncate">R$ {resultadoOrcamento.totais_globais.custo_maquina?.toFixed(2)}</p>
                    </div>
                    <div className="input-field p-3 lg:p-4 rounded-xl shadow-sm text-center flex flex-col justify-center" title={!resultadoOrcamento.inclui_material ? 'Facção: material não cobrado, chapa por conta do cliente' : ''}>
                        <p className="text-[10px] lg:text-xs font-bold surface-muted uppercase">Custo Material R$</p>
                        <p className="text-lg xl:text-xl font-black surface-heading mt-1 truncate">R$ {resultadoOrcamento.totais_globais.custo_material?.toFixed(2)}</p>
                    </div>
                    <div className="input-field p-3 lg:p-4 rounded-xl shadow-sm text-center flex flex-col justify-center">
                        <p className="text-[10px] lg:text-xs font-bold surface-muted uppercase">Aproveitamento</p>
                        <p className="text-lg xl:text-xl font-black surface-heading mt-1 truncate">{resultadoOrcamento.totais_globais.utilizacao_media_pct?.toFixed(1)}%</p>
                    </div>
                    <div className="input-field p-3 lg:p-4 rounded-xl shadow-sm text-center flex flex-col justify-center">
                        <p className="text-[10px] lg:text-xs font-bold surface-muted uppercase">Sucata (Kg)</p>
                        <p className="text-lg xl:text-xl font-black surface-heading mt-1 truncate">{resultadoOrcamento.totais_globais.sucata_peso_total_kg}</p>
                    </div>
                  </div>
                </div>

                {/* ========================================== */}
                {/* TOTAIS GLOBAIS - VERSÃO PDF B2B (Grid Quadrado) */}
                {/* ========================================== */}
                <div className="hidden print:block mb-6 border-2 border-slate-900">
                    <div className="bg-slate-900 text-white text-[9px] font-bold uppercase p-1.5 tracking-wider">
                        Resumo de Custos e Parâmetros Técnicos para uso comercial
                    </div>
                    <div className="grid grid-cols-4 text-center divide-x-2 divide-slate-300 bg-slate-100">
                        <div className="p-2 border-b-2 border-slate-300">
                            <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">Tempo Total Estimado</p>
                            <p className="text-xs font-black text-slate-900">
                              {Math.floor(resultadoOrcamento.totais_globais.tempo_total_min / 60)}h {Math.round(resultadoOrcamento.totais_globais.tempo_total_min % 60)}m
                            </p>
                        </div>
                        <div className="p-2 border-b-2 border-slate-300">
                            <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">Peso Total Estimado (KG)</p>
                            <p className="text-xs font-black text-slate-900">{resultadoOrcamento.totais_globais.peso_total_kg} kg</p>
                        </div>
                        <div className="p-2 border-b-2 border-slate-300">
                            <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">Chapas Utilizadas (Qtd)</p>
                            <p className="text-xs font-black text-slate-900">{resultadoOrcamento.totais_globais.chapas_totais}</p>
                        </div>
                        <div className="p-2 border-b-2 border-slate-300 bg-slate-200">
                            <p className="text-[9px] text-slate-800 uppercase font-bold mb-1">Valor Venda Bruto</p>
                            <p className="text-sm font-black text-slate-900">R$ {resultadoOrcamento.totais_globais.preco_venda_bruto?.toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                {/* ========================================== */}
                {/* TABELA DE PEÇAS - UNIFICADA (Estilos mistos Tailwind) */}
                {/* ========================================== */}
                <div className="px-4 lg:px-8 pb-8 pt-6 print:px-0 print:pt-0">
                  <h3 className="text-base lg:text-lg font-black surface-heading mb-4 print:hidden">⚙️ Relação de Peças e Totais por Espessura</h3>

                  {/* Título Tabela no PDF */}
                  <div className="hidden print:block bg-slate-900 text-white text-[9px] font-bold uppercase p-1.5 tracking-wider border-2 border-b-0 border-slate-900 mt-2">
                      Dados da Peça e Produção Detalhada
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 shadow-sm bg-white dark:bg-transparent scrollbar-thin print:shadow-none print:rounded-none print:border-2 print:border-slate-900">
                    <table className="w-full text-left min-w-[900px] print:min-w-0 print:w-full print:text-[9px] print:border-collapse">
                        <thead>
                          <tr className="bg-slate-950 text-white text-[10px] lg:text-xs uppercase print:bg-slate-200 print:text-slate-900 print:border-b-2 print:border-slate-900">
                            <th className="p-3 border-b-2 border-orange-500 print:border-b-0 print:border print:border-slate-400 print:p-1.5">ID da Peça</th>
                            <th className="p-3 border-b-2 border-orange-500 print:border-b-0 print:border print:border-slate-400 print:p-1.5">Dimensões (mm)</th>
                            <th className="p-3 text-center border-b-2 border-orange-500 print:border-b-0 print:border print:border-slate-400 print:p-1.5">Furos</th>
                            <th className="p-3 text-center border-b-2 border-orange-500 print:border-b-0 print:border print:border-slate-400 print:p-1.5">Qtd</th>
                            <th className="p-3 text-center border-b-2 border-orange-500 print:border-b-0 print:border print:border-slate-400 print:p-1.5">Peso (Kg)</th>
                            <th className="p-3 text-center border-b-2 border-orange-500 print:border-b-0 print:border print:border-slate-400 print:p-1.5">Chapas (L x C)</th>
                            <th className="p-3 border-b-2 border-orange-500 print:border-b-0 print:border print:border-slate-400 print:p-1.5">Tempo</th>
                            <th className="p-3 text-right border-b-2 border-orange-500 print:border-b-0 print:border print:border-slate-400 print:p-1.5">Custo Máquina R$</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-transparent text-xs lg:text-sm print:divide-slate-400">
                          {resultadoOrcamento.detalhamento_espessuras.map((item, index) => {

                              const pecasDestaEspessura = listaPecas.filter(
                                p => Number(p.espessura).toFixed(2) === Number(item.espessura).toFixed(2)
                              );

                              return (
                                <React.Fragment key={index}>

                                  {/* 1. LINHAS INDIVIDUAIS DAS PEÇAS */}
                                  {pecasDestaEspessura.map((p, i) => {
                                    const detalhePeca = resultadoOrcamento.detalhamento_pecas?.[p.id];
                                    return (
                                    <tr key={`${index}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border-t border-slate-100 dark:border-white/10 print:border-none">
                                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200 print:text-slate-800 print:border print:border-slate-400 print:p-1 print:px-2 print:text-[9px]">
                                        {p.id}
                                      </td>

                                      <td className="p-3 text-slate-600 dark:text-slate-400 print:text-slate-600 font-mono text-[10px] lg:text-xs print:border print:border-slate-400 print:p-1 print:px-2 print:text-[9px]">
                                        {p.dimA} x {p.dimB}
                                      </td>

                                      <td className="p-3 text-center text-slate-600 dark:text-slate-400 print:text-slate-600 font-mono text-[10px] lg:text-xs print:border print:border-slate-400 print:p-1 print:px-2 print:text-[9px]">
                                        {Number(p.nFuros) > 0 ? (
                                          <span className="bg-slate-100 dark:bg-white/10 px-2 py-1 rounded border border-slate-200 dark:border-white/10 print:border-none print:p-0 print:bg-transparent">
                                            {p.nFuros}x Ø{p.diaFuro}
                                          </span>
                                        ) : '-'}
                                      </td>

                                      <td className="p-3 text-center font-medium text-slate-700 dark:text-slate-300 print:text-slate-700 print:border print:border-slate-400 print:p-1 print:px-2 print:text-[10px]">
                                        {p.qtd}
                                      </td>

                                      <td className="p-3 text-center text-slate-600 dark:text-slate-400 print:text-slate-600 print:border print:border-slate-400 print:p-1 print:px-2">
                                        <div className="flex flex-col print:flex-row print:justify-center">
                                          <span className="text-[9px] text-slate-400 print:hidden">Unit: {p.pesoUnitario} | </span>
                                          <span className="font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 print:text-[9px]">{p.pesoTotal}</span>
                                        </div>
                                      </td>

                                      {/* Rateio real por peça (não estimado): tempo/custo já vêm calculados
                                          individualmente do backend (detalhamento_pecas), não divididos do total. */}
                                      <td className="p-3 text-center font-mono text-[10px] lg:text-xs text-slate-600 dark:text-slate-400 print:text-slate-600 print:border print:border-slate-400 print:p-1 print:px-2 print:text-[9px]">
                                        {item.dimensao_chapa}
                                      </td>
                                      <td className="p-3 font-mono text-[10px] lg:text-xs text-slate-600 dark:text-slate-400 print:text-slate-600 print:border print:border-slate-400 print:p-1 print:px-2 print:text-[9px]">
                                        {detalhePeca ? `${detalhePeca.tempo_min.toFixed(1)} min` : '-'}
                                      </td>
                                      <td className="p-3 text-right font-mono text-[10px] lg:text-xs font-bold text-slate-700 dark:text-slate-300 print:text-slate-700 print:border print:border-slate-400 print:p-1 print:px-2 print:text-[9px]">
                                        {detalhePeca ? `R$ ${detalhePeca.custo_maquina.toFixed(2)}` : '-'}
                                      </td>
                                    </tr>
                                    );
                                  })}

                                  {/* 2. LINHA DE SUBTOTAL DA ESPESSURA */}
                                  <tr className="bg-orange-50/60 dark:bg-orange-500/10 print:bg-slate-300 border-t-2 border-orange-200 dark:border-orange-500/30 print:border-y-2 print:border-slate-900 shadow-sm print:shadow-none">
                                    <td colSpan="3" className="p-3 font-black text-orange-900 dark:text-orange-300 uppercase text-right print:text-slate-900 print:border print:border-slate-900 print:p-1.5 print:text-[9px]">
                                      TOTAL ESPESSURA {Number(item.espessura).toFixed(2)} mm
                                    </td>

                                    <td className="p-3 text-center font-black text-orange-900 dark:text-orange-300 print:text-slate-900 print:border print:border-slate-900 print:p-1.5 print:text-[10px]" title={`Soma da quantidade de todas as peças desta espessura (${pecasDestaEspessura.length} tipo(s) de peça)`}>
                                      {item.qtd_pecas}
                                      <span className="block text-[8px] font-bold uppercase tracking-wider text-orange-700/70 dark:text-orange-400/60 print:hidden">total peças</span>
                                    </td>

                                    <td className="p-3 text-center font-black text-orange-900 dark:text-orange-300 print:text-slate-900 print:border print:border-slate-900 print:p-1.5 print:text-[10px]">
                                      {item.peso_kg.toFixed(2)}
                                    </td>

                                    <td className="p-3 text-center print:border print:border-slate-900 print:p-1.5">
                                      <span className="bg-orange-200 dark:bg-orange-500/20 text-orange-900 dark:text-orange-200 font-bold px-2 py-0.5 rounded text-[10px] lg:text-xs block w-max mx-auto print:bg-transparent print:text-slate-900 print:inline print:p-0 print:text-[10px]">
                                        {item.chapas_necessarias} un
                                      </span>
                                      <span className="text-[9px] lg:text-[10px] text-orange-700 dark:text-orange-400 font-mono mt-1 block print:text-slate-700 print:inline print:ml-1 print:text-[9px]">
                                        ({item.dimensao_chapa})
                                      </span>
                                      <span className="text-[9px] lg:text-[10px] text-orange-600/80 dark:text-orange-400/70 font-mono mt-0.5 block print:hidden" title="Área das peças / área total de chapa consumida">
                                        {item.utilizacao_pct}% aproveit.
                                      </span>
                                    </td>

                                    <td className="p-3 font-mono font-bold text-orange-900 dark:text-orange-300 text-[10px] lg:text-xs print:text-slate-900 print:border print:border-slate-900 print:p-1.5 print:text-[10px]">
                                      {Math.floor(item.tempo_min / 60)}h {Math.round(item.tempo_min % 60)}m
                                    </td>

                                    <td className="p-3 font-black text-right text-orange-600 dark:text-orange-400 text-sm lg:text-base print:text-slate-900 print:border print:border-slate-900 print:p-1.5 print:text-[10px]">
                                      R$ {Number(item.custo_maquina || 0).toFixed(2)}
                                    </td>
                                  </tr>
                                  
                                </React.Fragment>
                              )
                          })}
                        </tbody>
                    </table>
                  </div>

                  {/* ========================================== */}
                  {/* VISUALIZAÇÃO DE NESTING (Web, oculto na impressão) */}
                  {/* ========================================== */}
                  <div className="mt-8 space-y-6 print:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base lg:text-lg font-black surface-heading">🧩 Visualização de Nesting</h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMostrarLabelsNesting((atual) => !atual)}
                          title="Mostrar/ocultar os IDs das peças desenhados sobre o nesting"
                          className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase transition-colors ${mostrarLabelsNesting ? 'bg-slate-900/5 dark:bg-white/10 surface-body hover:bg-slate-900/10 dark:hover:bg-white/20' : 'bg-orange-500 text-white'}`}
                        >
                          {mostrarLabelsNesting ? '🏷️ Labels ligadas' : '🏷️ Labels ocultas'}
                        </button>
                        <div className="flex rounded-full bg-slate-900/5 dark:bg-white/10 p-0.5 text-[10px] font-bold uppercase">
                          <button
                            type="button"
                            onClick={() => setOrientacaoPdf('retrato')}
                            className={`px-3 py-1.5 rounded-full transition-colors ${orientacaoPdf === 'retrato' ? 'bg-orange-500 text-white' : 'surface-muted hover:text-orange-500'}`}
                          >
                            Retrato
                          </button>
                          <button
                            type="button"
                            onClick={() => setOrientacaoPdf('paisagem')}
                            className={`px-3 py-1.5 rounded-full transition-colors ${orientacaoPdf === 'paisagem' ? 'bg-orange-500 text-white' : 'surface-muted hover:text-orange-500'}`}
                          >
                            Paisagem
                          </button>
                        </div>
                        <button
                          onClick={() => gerarPdfNesting(resultadoOrcamento, listaPecas, cliente, undefined, orientacaoPdf)}
                          className="text-xs lg:text-sm bg-orange-500 text-white px-4 py-2 rounded-full font-bold shadow hover:bg-orange-600 transition-colors"
                        >
                          📄 Baixar PDF do Nesting
                        </button>
                      </div>
                    </div>
                    {resultadoOrcamento.detalhamento_espessuras.map((item, index) => (
                      item.nesting && item.nesting.chapas.length > 0 && (
                        <div key={index} className="surface-card rounded-2xl p-4 lg:p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <p className="text-sm font-bold surface-heading">Espessura {Number(item.espessura).toFixed(2)}mm</p>
                            <span className="text-xs font-semibold text-orange-500 dark:text-orange-400">
                              {item.nesting.chapas_necessarias} chapa(s) de {item.dimensao_chapa}mm
                              {' · '}{item.utilizacao_pct}% aproveitamento{' · '}{item.sucata_peso_kg}kg {item.sobra_reservada_cliente ? 'sobra reservada p/ cliente' : 'sucata'}
                              {item.maquina && ` · ${rotuloMaquina(item.maquina)}`}
                            </span>
                          </div>
                          <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-2">
                            {item.nesting.chapas.map((chapa, chapaIndex) => (
                              <div key={chapaIndex} className="shrink-0">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 text-center">Chapa {chapaIndex + 1}</p>
                                <button
                                  type="button"
                                  onClick={() => setChapaExpandida({ item, chapa, chapaIndex })}
                                  title="Clique para ampliar"
                                  className="block rounded border border-white/10 hover:border-orange-500/60 transition-colors cursor-zoom-in"
                                >
                                  <ChapaSVG
                                    item={item}
                                    chapa={chapa}
                                    idsUnicosPecas={idsUnicosPecasNesting}
                                    listaPecas={listaPecas}
                                    mostrarLabels={mostrarLabelsNesting}
                                    width={Math.max(60, Math.round(260 * (item.chapa_largura / item.chapa_comprimento)))}
                                    height={260}
                                    className="bg-black rounded"
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>

                  {/* ========================================== */}
                  {/* CONDIÇÕES E ASSINATURAS - VERSÃO PDF B2B */}
                  {/* ========================================== */}
                  <div className="hidden print:block mt-6 border-2 border-slate-900 break-inside-avoid">
                     <div className="bg-slate-900 text-white text-[9px] font-bold uppercase p-1.5 tracking-wider">
                         Observações sobre Prazo e Produção
                     </div>
                     <div className="p-4 grid grid-cols-2 gap-8 bg-slate-50">
                         <div className="text-[9px] text-slate-800 space-y-1.5 font-medium">
                             <p>1. Os valores orçados referem-se estritamente às geometrias fornecidas na data da emissão.</p>
                             <p>2. Variações na espessura comercial da chapa estão sujeitas à tolerância da usina siderúrgica.</p>
                             <p>3. Prazo de entrega a combinar após aprovação técnica e financeira deste documento.</p>
                         </div>
                         <div className="flex flex-col items-center justify-end pt-6 pb-2">
                             <div className="border-t-2 border-slate-900 w-3/4 pt-1.5 text-center">
                                 <p className="text-[10px] font-black text-slate-900 uppercase">Depto. Comercial - Lypsyos</p>
                                 <p className="text-[8px] text-slate-500 uppercase font-bold">Assinatura e Carimbo</p>
                             </div>
                         </div>
                     </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        )}

        {telaAtual === 'perfil' && <PerfilUsuario />}
      </main>

      {/* MODAL DE CONFIGURAÇÃO DE CHAPAS */}
      {isModalChapasOpen && (
        <div className="fixed inset-0 bg-slate-950 bg-opacity-90 z-[100] flex items-center justify-center p-4">
          <div className="surface-card rounded-3xl shadow-[0_24px_80px_-35px_rgba(249,115,22,0.3)] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-950 p-4 lg:p-5 border-b-4 border-orange-500 shrink-0">
              <h3 className="text-lg lg:text-xl font-bold text-white uppercase">📐 Dimensões de Chapa</h3>
            </div>

            <div className="p-4 lg:p-6 overflow-y-auto scrollbar-thin space-y-3">
              {Object.keys(chapasConfig).map(esp => (
                <div key={esp} className="surface-card-inset p-3 rounded-xl flex items-center gap-3">
                  <div className="bg-slate-900 text-orange-400 font-black text-base lg:text-lg h-10 w-12 lg:h-12 lg:w-16 flex items-center justify-center rounded shrink-0">
                    {esp}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2 lg:gap-4">
                    <div>
                      <label className="block text-[10px] lg:text-xs font-bold surface-muted uppercase">Largura</label>
                      <input type="number" value={chapasConfig[esp].largura} onChange={(e) => handleChapaChange(esp, 'largura', e.target.value)} className="input-field mt-1 w-full rounded p-2 text-sm focus:ring-orange-500 outline-none"/>
                    </div>
                    <div>
                      <label className="block text-[10px] lg:text-xs font-bold surface-muted uppercase">Comp.</label>
                      <input type="number" value={chapasConfig[esp].comprimento} onChange={(e) => handleChapaChange(esp, 'comprimento', e.target.value)} className="input-field mt-1 w-full rounded p-2 text-sm focus:ring-orange-500 outline-none"/>
                    </div>
                    <div>
                      <label className="block text-[10px] lg:text-xs font-bold surface-muted uppercase">Margem (mm)</label>
                      <input type="number" value={chapasConfig[esp].margem} onChange={(e) => handleChapaChange(esp, 'margem', e.target.value)} className="input-field mt-1 w-full rounded p-2 text-sm focus:ring-orange-500 outline-none"/>
                    </div>
                    <div>
                      <label className="block text-[10px] lg:text-xs font-bold surface-muted uppercase">Espaço entre peças (mm)</label>
                      <input type="number" value={chapasConfig[esp].offsetPeca} onChange={(e) => handleChapaChange(esp, 'offsetPeca', e.target.value)} className="input-field mt-1 w-full rounded p-2 text-sm focus:ring-orange-500 outline-none"/>
                    </div>
                    <div>
                      <label className="block text-[10px] lg:text-xs font-bold surface-muted uppercase">Máquina</label>
                      <select value={chapasConfig[esp].maquina || 'LASER'} onChange={(e) => handleChapaMaquinaChange(esp, e.target.value)} className="input-field mt-1 w-full rounded p-2 text-sm focus:ring-orange-500 outline-none">
                        {PERFIS_MAQUINA_SUPORTADOS.map((m) => <option key={m} value={m}>{rotuloMaquinaLongo(m)}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-[10px] lg:text-xs font-bold surface-muted uppercase mt-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!chapasConfig[esp].clienteQuerSobra}
                          onChange={(e) => handleChapaSobraChange(esp, e.target.checked)}
                          className="w-4 h-4 accent-orange-500"
                        />
                        Cliente quer a sobra
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-100 dark:bg-black/30 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-200 dark:border-white/10 shrink-0">
              <button onClick={() => setIsModalChapasOpen(false)} className="w-full sm:w-auto px-5 py-3 font-bold surface-muted hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-sm">Cancelar</button>
              <button onClick={handleSalvar} className="w-full sm:w-auto bg-orange-500 text-white px-6 py-3 rounded-full font-black shadow-lg hover:bg-orange-600 text-sm">Processar Orçamento ➔</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EXPANSÃO DE CHAPA (NESTING) */}
      {chapaExpandida && (
        <div className="fixed inset-0 bg-slate-950 bg-opacity-90 z-[100] flex items-center justify-center p-4" onClick={() => setChapaExpandida(null)}>
          <div className="surface-card rounded-3xl shadow-[0_24px_80px_-35px_rgba(249,115,22,0.3)] w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-950 p-4 lg:p-5 border-b-4 border-orange-500 shrink-0 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg lg:text-xl font-bold text-white uppercase">
                📐 Espessura {Number(chapaExpandida.item.espessura).toFixed(2)}mm — Chapa {chapaExpandida.chapaIndex + 1}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => gerarPdfNesting(resultadoOrcamento, listaPecas, cliente, chapaExpandida.item.espessura, orientacaoPdf)}
                  className="text-xs lg:text-sm bg-orange-500 text-white px-4 py-2 rounded-full font-bold hover:bg-orange-600 transition-colors"
                >
                  📄 Baixar PDF
                </button>
                <button onClick={() => setChapaExpandida(null)} className="text-xs lg:text-sm bg-white/10 text-white px-4 py-2 rounded-full font-bold hover:bg-white/20 transition-colors">Fechar ✕</button>
              </div>
            </div>
            <div className="p-4 lg:p-8 overflow-auto flex items-center justify-center bg-black/20 dark:bg-black/40">
              <ChapaSVG
                item={chapaExpandida.item}
                chapa={chapaExpandida.chapa}
                idsUnicosPecas={idsUnicosPecasNesting}
                listaPecas={listaPecas}
                mostrarLabels={mostrarLabelsNesting}
                width={Math.min(900, Math.round(700 * (chapaExpandida.item.chapa_largura / chapaExpandida.item.chapa_comprimento)))}
                height={700}
                className="bg-black rounded-lg shadow-2xl"
              />
            </div>
            <div className="p-3 lg:p-4 border-t border-slate-200 dark:border-white/10 text-xs surface-muted text-center shrink-0">
              {chapaExpandida.chapa.placements.length} peça(s) nesta chapa · {chapaExpandida.item.dimensao_chapa}mm
              {' · '}{chapaExpandida.item.utilizacao_pct}% aproveitamento (espessura) · {chapaExpandida.item.sucata_peso_kg}kg {chapaExpandida.item.sobra_reservada_cliente ? 'sobra reservada p/ cliente' : 'sucata'}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
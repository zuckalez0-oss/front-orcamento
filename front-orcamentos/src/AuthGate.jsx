import { useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from './lib/supabaseClient.js';
import { API_BASE } from './apiBase.js';
import Login from './Login.jsx';
import AuthContext from './AuthContext.jsx';

const fundoTela = 'h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.15),_transparent_40%),linear-gradient(180deg,_#050505_0%,_#000000_100%)] p-4 text-center';

function TelaCarregando() {
  return (
    <div className={fundoTela}>
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function TelaErroConfiguracao() {
  return (
    <div className={fundoTela}>
      <div className="max-w-md bg-[linear-gradient(145deg,_#171717_0%,_#0A0A0A_100%)] border border-red-500/30 border-t-4 border-t-red-500 rounded-3xl shadow-2xl p-6 lg:p-8">
        <h1 className="text-lg font-black text-white uppercase mb-2">⚠️ Supabase não configurado</h1>
        <p className="text-sm text-slate-400">
          As variáveis <code className="text-orange-400">VITE_SUPABASE_URL</code> e <code className="text-orange-400">VITE_SUPABASE_ANON_KEY</code> não
          foram encontradas. Copie <code className="text-orange-400">.env.example</code> para <code className="text-orange-400">.env</code> na pasta{' '}
          <code className="text-orange-400">front-orcamentos/</code>, preencha com as credenciais do seu projeto Supabase e reinicie o servidor de
          desenvolvimento.
        </p>
      </div>
    </div>
  );
}

// Gate único no topo da árvore: sem sessão válida, ninguém vê o app (children).
// Sem roteador — protege a ferramenta inteira de uma vez, não tela por tela.
function AuthGate({ children }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [contaAtual, setContaAtual] = useState(null);

  const carregarPerfil = async (sessaoAtual) => {
    if (!sessaoAtual) {
      setPerfil(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', sessaoAtual.user.id).single();
    if (error) {
      // Não é um erro real pra quem não faz parte do RBAC interno (ex: um
      // cliente Free/Pro cadastrado pelo app público nunca terá linha em
      // `profiles`, só em `contas_usuarios`) — por isso não loga como falha
      // aqui; só fica sem `perfil`/`papel` internos, o que é o esperado.
      setPerfil(null);
    } else {
      setPerfil(data);
    }
  };

  // Conta de assinatura (Free/Pro/Enterprise) — sistema paralelo ao RBAC
  // interno acima, ver comentário em AuthContext.jsx. 403 aqui é o caso
  // normal pra quem só existe no RBAC interno (nunca provisionou conta) —
  // MAS também é o caso de alguém que acabou de confirmar o e-mail do
  // cadastro público (ver Login.jsx::handleCriarConta): nesse caso existe
  // uma marca em localStorage dizendo que o provisionamento ficou pendente,
  // então tentamos terminá-lo aqui antes de desistir.
  const carregarConta = async (sessaoAtual) => {
    if (!sessaoAtual) {
      setContaAtual(null);
      return;
    }
    const buscarContaMe = () => fetch(`${API_BASE}/contas/me`, {
      headers: { Authorization: `Bearer ${sessaoAtual.access_token}` },
    });
    try {
      let resposta = await buscarContaMe();
      if (!resposta.ok) {
        const pendenteBruto = localStorage.getItem('geoquote_provisionamento_pendente');
        if (pendenteBruto) {
          const pendente = JSON.parse(pendenteBruto);
          const provisionado = await fetch(`${API_BASE}/contas/provisionar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessaoAtual.access_token}` },
            body: JSON.stringify({ nome: pendente.nome, convite_token: pendente.convite_token || undefined }),
          });
          localStorage.removeItem('geoquote_provisionamento_pendente');
          if (provisionado.ok) resposta = await buscarContaMe();
        }
      }
      setContaAtual(resposta.ok ? await resposta.json() : null);
    } catch (erro) {
      console.error('Falha ao carregar conta/assinatura', erro);
      setContaAtual(null);
    }
  };

  useEffect(() => {
    if (!supabaseConfigurado) {
      setCarregando(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session);
      await Promise.all([carregarPerfil(data.session), carregarConta(data.session)]);
      setCarregando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      carregarPerfil(novaSessao);
      carregarConta(novaSessao);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigurado) return <TelaErroConfiguracao />;
  if (carregando) return <TelaCarregando />;
  if (!sessao) return <Login />;

  return (
    <AuthContext.Provider value={{
      session: sessao, perfil, papel: perfil?.role || null,
      contaAtual, papelConta: contaAtual?.papel || null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthGate;

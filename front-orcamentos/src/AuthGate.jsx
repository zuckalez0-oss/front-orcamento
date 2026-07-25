import { useEffect, useState } from 'react';
import { supabase, supabaseConfigurado } from './lib/supabaseClient.js';
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

  const carregarPerfil = async (sessaoAtual) => {
    if (!sessaoAtual) {
      setPerfil(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', sessaoAtual.user.id).single();
    if (error) {
      console.error('Falha ao carregar perfil (verifique se supabase/schema.sql já foi rodado no seu projeto)', error);
      setPerfil(null);
    } else {
      setPerfil(data);
    }
  };

  useEffect(() => {
    if (!supabaseConfigurado) {
      setCarregando(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session);
      await carregarPerfil(data.session);
      setCarregando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      carregarPerfil(novaSessao);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigurado) return <TelaErroConfiguracao />;
  if (carregando) return <TelaCarregando />;
  if (!sessao) return <Login />;

  return (
    <AuthContext.Provider value={{ session: sessao, perfil, papel: perfil?.role || null }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthGate;

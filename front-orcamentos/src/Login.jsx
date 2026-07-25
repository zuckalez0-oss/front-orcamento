import { useState } from 'react';
import { supabase } from './lib/supabaseClient.js';

// Tela de login sempre no tema escuro de marca (mesmo padrão do header do app) —
// não depende do toggle claro/escuro, que só existe depois de autenticado.
function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [modoRecuperacao, setModoRecuperacao] = useState(false);
  const [mensagemRecuperacao, setMensagemRecuperacao] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : error.message);
    }
    // Sucesso: o AuthGate detecta a nova sessão via onAuthStateChange e libera o app.
  };

  const handleRecuperarSenha = async (e) => {
    e.preventDefault();
    setErro(null);
    setMensagemRecuperacao(null);
    if (!email) {
      setErro('Informe seu e-mail para recuperar a senha.');
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setCarregando(false);
    if (error) setErro(error.message);
    else setMensagemRecuperacao('Se esse e-mail estiver cadastrado, enviamos um link de recuperação.');
  };

  const inputClasses = 'w-full bg-black border border-slate-700 rounded-xl p-2.5 text-sm text-white outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 placeholder:text-slate-600';

  return (
    <div className="h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.15),_transparent_40%),linear-gradient(180deg,_#050505_0%,_#000000_100%)] p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo-geoquote.svg" alt="GeoQuote" className="w-16 h-16 rounded-2xl shadow-lg ring-1 ring-orange-400/30 mb-4" />
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">Geo<span className="text-orange-500">Quote</span></h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Lypsyos</p>
        </div>

        <div className="bg-[linear-gradient(145deg,_#171717_0%,_#0A0A0A_100%)] border border-white/10 border-t-4 border-t-orange-500 rounded-3xl shadow-2xl p-6 lg:p-8">
          {!modoRecuperacao ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-2">Entrar</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">E-mail</label>
                <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClasses} placeholder="voce@empresa.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Senha</label>
                <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} className={inputClasses} placeholder="••••••••" />
              </div>
              {erro && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{erro}</p>}
              <button type="submit" disabled={carregando} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-3 rounded-full transition-colors text-sm">
                {carregando ? 'Entrando...' : 'Entrar'}
              </button>
              <button type="button" onClick={() => { setModoRecuperacao(true); setErro(null); }} className="w-full text-xs text-slate-400 hover:text-orange-400 text-center transition-colors">
                Esqueci minha senha
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecuperarSenha} className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-2">Recuperar senha</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">E-mail</label>
                <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClasses} placeholder="voce@empresa.com" />
              </div>
              {erro && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{erro}</p>}
              {mensagemRecuperacao && <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2">{mensagemRecuperacao}</p>}
              <button type="submit" disabled={carregando} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-3 rounded-full transition-colors text-sm">
                {carregando ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
              <button type="button" onClick={() => { setModoRecuperacao(false); setErro(null); setMensagemRecuperacao(null); }} className="w-full text-xs text-slate-400 hover:text-orange-400 text-center transition-colors">
                Voltar ao login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-6 uppercase tracking-widest font-bold">Ferramenta interna — acesso restrito</p>
      </div>
    </div>
  );
}

export default Login;

import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { API_BASE } from './apiBase.js';

// Tela de login sempre no tema escuro de marca (mesmo padrão do header do app) —
// não depende do toggle claro/escuro, que só existe depois de autenticado.
//
// Serve DOIS públicos na mesma tela, de propósito (decisão do plano de
// contas/assinaturas): a equipe interna da Lypsyos (conta criada manualmente
// por um admin, aba "Entrar") e clientes externos Free/Pro/Enterprise (aba
// "Criar conta", autocadastro). Ver AuthContext.jsx pra como os dois
// sistemas de identidade ficam separados depois do login.
function Login() {
  const [aba, setAba] = useState('entrar'); // 'entrar' | 'criar-conta'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [modoRecuperacao, setModoRecuperacao] = useState(false);
  const [mensagemRecuperacao, setMensagemRecuperacao] = useState(null);
  const [conviteToken, setConviteToken] = useState(null);

  // Link de convite de vendedor (fluxo Enterprise) chega como
  // ?convite=TOKEN — abre direto na aba de cadastro.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('convite');
    if (token) {
      setConviteToken(token);
      setAba('criar-conta');
    }
  }, []);

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

  const handleCriarConta = async (e) => {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    setCarregando(true);

    // Guardado ANTES do signUp de propósito: se o projeto tiver confirmação
    // de e-mail ligada, `data.session` abaixo vem nulo e não dá pra chamar
    // /contas/provisionar agora — o usuário só ganha sessão de verdade
    // quando volta pelo link do e-mail, possivelmente numa aba nova
    // (onAuthStateChange dispara sem passar de novo por este formulário).
    // AuthGate.jsx lê essa marca no próximo carregamento de sessão e termina
    // o provisionamento sozinho. localStorage (não sessionStorage) porque
    // precisa sobreviver à troca de aba do clique no link do e-mail.
    localStorage.setItem('geoquote_provisionamento_pendente', JSON.stringify({
      nome: nomeCompleto, convite_token: conviteToken || null,
    }));

    const { data, error } = await supabase.auth.signUp({
      email, password: senha, options: { data: { nome: nomeCompleto } },
    });
    if (error) {
      localStorage.removeItem('geoquote_provisionamento_pendente');
      setCarregando(false);
      setErro(error.message);
      return;
    }
    if (!data.session) {
      // Confirmação de e-mail ligada — a marca acima fica salva, AuthGate
      // termina o provisionamento quando a sessão de verdade chegar.
      setCarregando(false);
      setMensagem('Conta criada! Verifique seu e-mail para confirmar o cadastro antes de entrar.');
      return;
    }
    try {
      const resposta = await fetch(`${API_BASE}/contas/provisionar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ nome: nomeCompleto, convite_token: conviteToken || undefined }),
      });
      if (!resposta.ok) {
        const detalhe = await resposta.json().catch(() => ({}));
        setErro(detalhe.detail || 'Conta criada, mas houve um problema ao configurar sua assinatura.');
      }
      localStorage.removeItem('geoquote_provisionamento_pendente');
      // Sucesso (com ou sem o provisionamento acima): o AuthGate detecta a
      // nova sessão via onAuthStateChange e libera o app.
    } catch (erroProvisionamento) {
      console.error('Falha ao provisionar conta', erroProvisionamento);
      setErro('Conta criada, mas não consegui configurar sua assinatura agora. Tente entrar novamente em instantes.');
    }
    setCarregando(false);
  };

  const handleGoogle = async () => {
    setErro(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    // Provider ainda não habilitado no painel Supabase até o Google entrar
    // de fato em produção — nesse meio tempo isso só mostra um erro claro
    // em vez de travar; nenhum código muda quando o provider for ligado.
    if (error) setErro(error.message);
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
          {!modoRecuperacao && (
            <div className="flex mb-6 rounded-full bg-black/60 border border-slate-800 p-1 text-xs font-bold uppercase">
              <button type="button" onClick={() => { setAba('entrar'); setErro(null); setMensagem(null); }}
                className={`flex-1 py-2 rounded-full transition-colors ${aba === 'entrar' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                Entrar
              </button>
              <button type="button" onClick={() => { setAba('criar-conta'); setErro(null); setMensagem(null); }}
                className={`flex-1 py-2 rounded-full transition-colors ${aba === 'criar-conta' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                Criar conta
              </button>
            </div>
          )}

          {modoRecuperacao ? (
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
          ) : aba === 'entrar' ? (
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
              <button type="button" onClick={handleGoogle} className="w-full border border-slate-700 hover:border-slate-500 text-slate-300 font-bold py-2.5 rounded-full transition-colors text-sm">
                Continuar com Google
              </button>
              <button type="button" onClick={() => { setModoRecuperacao(true); setErro(null); }} className="w-full text-xs text-slate-400 hover:text-orange-400 text-center transition-colors">
                Esqueci minha senha
              </button>
            </form>
          ) : (
            <form onSubmit={handleCriarConta} className="space-y-4">
              <h2 className="text-lg font-bold text-white mb-2">Criar conta</h2>
              {conviteToken && (
                <p className="text-xs text-orange-300 bg-orange-500/10 border border-orange-500/30 rounded-lg p-2">
                  Você foi convidado para uma equipe — ao concluir o cadastro, você entra direto nela.
                </p>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome completo</label>
                <input type="text" required autoFocus value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} className={inputClasses} placeholder="Seu nome" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">E-mail</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClasses} placeholder="voce@empresa.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Senha</label>
                <input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} className={inputClasses} placeholder="Mínimo 6 caracteres" />
              </div>
              {erro && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{erro}</p>}
              {mensagem && <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2">{mensagem}</p>}
              <button type="submit" disabled={carregando} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-3 rounded-full transition-colors text-sm">
                {carregando ? 'Criando...' : conviteToken ? 'Entrar na equipe' : 'Criar conta gratuita'}
              </button>
              <button type="button" onClick={handleGoogle} className="w-full border border-slate-700 hover:border-slate-500 text-slate-300 font-bold py-2.5 rounded-full transition-colors text-sm">
                Continuar com Google
              </button>
              {!conviteToken && (
                <p className="text-[10px] text-slate-500 text-center">Plano Free: 10 orçamentos/dia, até 50 peças por orçamento.</p>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-6 uppercase tracking-widest font-bold">GeoQuote — orçamentos de corte a laser/plasma</p>
      </div>
    </div>
  );
}

export default Login;

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth.js';
import { API_BASE } from './apiBase.js';
import { supabase } from './lib/supabaseClient.js';

const ROTULO_PAPEL = {
  ADMINISTRADOR: 'Administrador',
  GERENTE: 'Gerente',
  VENDEDOR: 'Vendedor',
};

const ROTULO_PLANO = { FREE: 'Free', PRO: 'Pro', ENTERPRISE: 'Enterprise' };
const ROTULO_PAPEL_CONTA = { PROPRIETARIO: 'Proprietário', GESTOR: 'Gestor', VENDEDOR: 'Vendedor' };

// Tela do perfil serve os DOIS sistemas de identidade da app (ver
// AuthContext.jsx): o RBAC interno da Lypsyos (`perfil`/`papel`, sempre
// existiu) e a conta de assinatura Free/Pro/Enterprise dos clientes
// externos (`contaAtual`/`papelConta`, nova) — mostra as duas seções
// quando aplicável, cada conta só vê a que tem.
function PerfilUsuario({ onIrParaPlanos }) {
  const { session, perfil, papel, contaAtual, papelConta } = useAuth();
  const [equipe, setEquipe] = useState(null);
  const [linkConvite, setLinkConvite] = useState(null);
  const [gerandoConvite, setGerandoConvite] = useState(false);
  const [erroEquipe, setErroEquipe] = useState(null);

  const [editandoNome, setEditandoNome] = useState(false);
  const [novoNome, setNovoNome] = useState(contaAtual?.nome || '');
  const [salvandoNome, setSalvandoNome] = useState(false);

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [mensagemSenha, setMensagemSenha] = useState(null);
  const [erroSenha, setErroSenha] = useState(null);

  const salvarNome = async () => {
    setSalvandoNome(true);
    try {
      const resposta = await fetch(`${API_BASE}/contas/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ nome: novoNome }),
      });
      if (resposta.ok) {
        setEditandoNome(false);
        window.location.reload(); // recarrega contaAtual (mesmo padrão de Planos.jsx)
      }
    } catch (erro) {
      console.error('Falha ao salvar nome', erro);
    } finally {
      setSalvandoNome(false);
    }
  };

  const trocarSenha = async (e) => {
    e.preventDefault();
    setErroSenha(null);
    setMensagemSenha(null);
    if (novaSenha.length < 6) {
      setErroSenha('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErroSenha('As senhas não coincidem.');
      return;
    }
    setSalvandoSenha(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSalvandoSenha(false);
    if (error) {
      setErroSenha(error.message);
    } else {
      setNovaSenha('');
      setConfirmarSenha('');
      setMensagemSenha('Senha alterada com sucesso.');
    }
  };

  const carregarEquipe = async () => {
    try {
      const resposta = await fetch(`${API_BASE}/contas/equipe`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (resposta.ok) setEquipe(await resposta.json());
    } catch (erro) {
      console.error('Falha ao carregar equipe', erro);
    }
  };

  useEffect(() => {
    if (papelConta === 'GESTOR') carregarEquipe();
  }, [papelConta]);

  const gerarConvite = async () => {
    setErroEquipe(null);
    setGerandoConvite(true);
    try {
      const resposta = await fetch(`${API_BASE}/contas/convites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({}),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErroEquipe(dados.detail || 'Não foi possível gerar o convite.');
      } else {
        setLinkConvite(`${window.location.origin}/?convite=${dados.token}`);
        await carregarEquipe();
      }
    } catch (erro) {
      console.error('Falha ao gerar convite', erro);
      setErroEquipe('Erro ao gerar convite no servidor.');
    } finally {
      setGerandoConvite(false);
    }
  };

  return (
    <div className="absolute inset-0 p-4 lg:p-6 overflow-y-auto scrollbar-thin">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="surface-card rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.45)] dark:shadow-[0_24px_80px_-35px_rgba(0,0,0,0.7)] border-t-4 border-orange-500 p-6 lg:p-8">
          <h2 className="text-xl lg:text-2xl font-black surface-heading uppercase tracking-tight mb-6">Meu Perfil</h2>

          <div className="space-y-4">
            <div className="surface-card-inset rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">Nome</p>
              {editandoNome ? (
                <div className="flex flex-col sm:flex-row gap-2 mt-1">
                  <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="input-field flex-1 rounded-lg p-2 text-sm" autoFocus />
                  <div className="flex gap-2">
                    <button onClick={salvarNome} disabled={salvandoNome} className="text-xs font-bold uppercase px-3 py-2 rounded-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white">Salvar</button>
                    <button onClick={() => { setEditandoNome(false); setNovoNome(contaAtual?.nome || ''); }} className="text-xs font-bold uppercase px-3 py-2 rounded-full border border-slate-300 dark:border-white/20 surface-muted">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold surface-heading">{perfil?.nome || contaAtual?.nome || '—'}</p>
                  {contaAtual && (
                    <button onClick={() => setEditandoNome(true)} className="text-[10px] font-bold uppercase text-orange-500 hover:text-orange-600">Editar</button>
                  )}
                </div>
              )}
            </div>
            <div className="surface-card-inset rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">E-mail</p>
              <p className="text-sm font-semibold surface-heading">{session?.user?.email || '—'}</p>
            </div>
            {papel && (
              <div className="surface-card-inset rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">Papel (equipe interna Lypsyos)</p>
                <span className="inline-block text-xs font-bold uppercase px-3 py-1.5 rounded-full bg-orange-500 text-white">
                  {ROTULO_PAPEL[papel] || papel}
                </span>
              </div>
            )}
          </div>

          {!perfil && !contaAtual && (
            <p className="mt-6 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3">
              Não foi possível carregar seu perfil.
            </p>
          )}

          <form onSubmit={trocarSenha} className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 space-y-3">
            <h3 className="text-sm font-black surface-heading uppercase tracking-tight">Trocar senha</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="password" placeholder="Nova senha" minLength={6} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className="input-field rounded-lg p-2.5 text-sm" />
              <input type="password" placeholder="Confirmar nova senha" minLength={6} value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} className="input-field rounded-lg p-2.5 text-sm" />
            </div>
            {erroSenha && <p className="text-xs text-red-500">{erroSenha}</p>}
            {mensagemSenha && <p className="text-xs text-emerald-600 dark:text-emerald-400">{mensagemSenha}</p>}
            <button type="submit" disabled={salvandoSenha} className="text-xs font-bold uppercase px-4 py-2 rounded-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white transition-colors">
              {salvandoSenha ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        </div>

        {contaAtual && (
          <div className="surface-card rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.45)] dark:shadow-[0_24px_80px_-35px_rgba(0,0,0,0.7)] border-t-4 border-orange-500 p-6 lg:p-8">
            <h2 className="text-xl lg:text-2xl font-black surface-heading uppercase tracking-tight mb-6">Assinatura</h2>
            <div className="space-y-4">
              <div className="surface-card-inset rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">Plano</p>
                  <p className="text-sm font-semibold surface-heading">{ROTULO_PLANO[contaAtual.tipo_plano] || contaAtual.tipo_plano}</p>
                </div>
                <span className="text-xs font-bold uppercase px-3 py-1.5 rounded-full bg-orange-500 text-white">
                  {ROTULO_PAPEL_CONTA[papelConta] || papelConta}
                </span>
              </div>
              {contaAtual.tipo_plano === 'FREE' && contaAtual.limite_orcamentos_dia != null && (
                <div className="surface-card-inset rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">Orçamentos hoje</p>
                  <p className="text-sm font-semibold surface-heading">{contaAtual.orcamentos_hoje}/{contaAtual.limite_orcamentos_dia}</p>
                </div>
              )}
              {(papelConta === 'PROPRIETARIO' || papelConta === 'GESTOR') && onIrParaPlanos && (
                <button type="button" onClick={onIrParaPlanos} className="text-xs font-bold uppercase text-orange-500 hover:text-orange-600">
                  Ver planos e fazer upgrade →
                </button>
              )}
            </div>

            {papelConta === 'GESTOR' && (
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-black surface-heading uppercase tracking-tight mb-3">Equipe</h3>

                {equipe && (
                  <ul className="space-y-2 mb-4">
                    {equipe.membros.map((m) => (
                      <li key={m.id} className="surface-card-inset rounded-lg px-3 py-2 text-sm flex justify-between">
                        <span className="surface-heading font-semibold">{m.nome || '—'}</span>
                        <span className="text-xs uppercase font-bold surface-muted">{ROTULO_PAPEL_CONTA[m.papel] || m.papel}</span>
                      </li>
                    ))}
                    {equipe.convites_pendentes.map((c) => (
                      <li key={c.id} className="surface-card-inset rounded-lg px-3 py-2 text-sm flex justify-between opacity-70">
                        <span className="surface-heading">{c.email || 'Convite pendente'}</span>
                        <span className="text-xs uppercase font-bold surface-muted">Aguardando cadastro</span>
                      </li>
                    ))}
                  </ul>
                )}

                {contaAtual.limite_vendedores != null && (
                  <p className="text-xs surface-muted mb-3">
                    {equipe ? equipe.membros.filter((m) => m.papel === 'VENDEDOR').length : 0}/{contaAtual.limite_vendedores} vendedores utilizados.
                  </p>
                )}

                <button onClick={gerarConvite} disabled={gerandoConvite} className="text-xs font-bold uppercase px-4 py-2 rounded-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white transition-colors">
                  {gerandoConvite ? 'Gerando...' : 'Gerar link de convite'}
                </button>

                {erroEquipe && <p className="mt-3 text-xs text-red-500">{erroEquipe}</p>}

                {linkConvite && (
                  <div className="mt-3 surface-card-inset rounded-lg p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">Link do convite (envie pro vendedor)</p>
                    <p className="text-xs font-mono break-all surface-heading">{linkConvite}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PerfilUsuario;

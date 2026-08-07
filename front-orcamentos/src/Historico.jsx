import { useEffect, useState } from 'react';
import { useAuth } from './useAuth.js';
import { API_BASE } from './apiBase.js';
import { supabase } from './lib/supabaseClient.js';

const ROTULO_STATUS = { ORCADO: 'Orçado', FECHADO: 'Fechado' };

// PROPRIETARIO (Free/Pro solo) e VENDEDOR só veem os próprios orçamentos;
// GESTOR vê a conta inteira + métricas + é avisado em tempo real quando
// qualquer vendedor fecha um negócio (ver PATCH /orcamentos/{id}/fechar e
// a policy de Realtime em supabase/schema_contas.sql).
function Historico() {
  const { session, papelConta, contaAtual } = useAuth();
  const [itens, setItens] = useState([]);
  const [metricas, setMetricas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [notificacao, setNotificacao] = useState(null);

  const authHeaders = () => ({ Authorization: `Bearer ${session?.access_token}` });

  const carregar = async () => {
    setCarregando(true);
    try {
      const resposta = await fetch(`${API_BASE}/orcamentos`, { headers: authHeaders() });
      setItens(resposta.ok ? await resposta.json() : []);
      if (papelConta === 'GESTOR') {
        const respostaMetricas = await fetch(`${API_BASE}/contas/metricas`, { headers: authHeaders() });
        setMetricas(respostaMetricas.ok ? await respostaMetricas.json() : null);
      }
    } catch (erro) {
      console.error('Falha ao carregar histórico', erro);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [papelConta]);

  useEffect(() => {
    if (papelConta !== 'GESTOR' || !contaAtual?.conta_id) return undefined;
    const canal = supabase
      .channel(`orcamentos-conta-${contaAtual.conta_id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orcamentos',
        filter: `conta_id=eq.${contaAtual.conta_id}`,
      }, (payload) => {
        if (payload.new.status === 'FECHADO') {
          setNotificacao(`Um orçamento foi fechado agora — R$ ${Number(payload.new.valor_venda_total || 0).toFixed(2)}.`);
          carregar();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papelConta, contaAtual?.conta_id]);

  const fechar = async (id) => {
    try {
      const resposta = await fetch(`${API_BASE}/orcamentos/${id}/fechar`, { method: 'PATCH', headers: authHeaders() });
      if (resposta.ok) await carregar();
      else alert('Não foi possível fechar este orçamento.');
    } catch (erro) {
      console.error('Falha ao fechar orçamento', erro);
    }
  };

  return (
    <div className="absolute inset-0 p-4 lg:p-6 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <h2 className="text-xl lg:text-2xl font-black surface-heading uppercase tracking-tight">Histórico de Orçamentos</h2>

        {notificacao && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-xl p-3 text-sm flex justify-between items-center">
            <span>🔔 {notificacao}</span>
            <button onClick={() => setNotificacao(null)} className="text-xs font-bold shrink-0 ml-3">Fechar</button>
          </div>
        )}

        {metricas && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="surface-card rounded-2xl p-4"><p className="text-[10px] font-bold uppercase surface-muted">Orçados</p><p className="text-2xl font-black surface-heading">{metricas.total_orcados}</p></div>
            <div className="surface-card rounded-2xl p-4"><p className="text-[10px] font-bold uppercase surface-muted">Fechados</p><p className="text-2xl font-black surface-heading">{metricas.total_fechados}</p></div>
            <div className="surface-card rounded-2xl p-4"><p className="text-[10px] font-bold uppercase surface-muted">Conversão</p><p className="text-2xl font-black surface-heading">{metricas.taxa_conversao_pct}%</p></div>
            <div className="surface-card rounded-2xl p-4 col-span-2 sm:col-span-1"><p className="text-[10px] font-bold uppercase surface-muted">Vendedores ativos</p><p className="text-2xl font-black surface-heading">{metricas.por_vendedor.length}</p></div>
          </div>
        )}

        {metricas && metricas.por_vendedor.length > 0 && (
          <div className="surface-card rounded-2xl p-4 overflow-x-auto scrollbar-thin">
            <h3 className="text-sm font-black surface-heading uppercase mb-3">Por vendedor</h3>
            <table className="w-full text-left text-sm min-w-[400px]">
              <thead className="text-[10px] uppercase surface-muted"><tr><th className="pb-2">Vendedor</th><th className="pb-2">Orçados</th><th className="pb-2">Fechados</th><th className="pb-2">Conversão</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {metricas.por_vendedor.map((v) => (
                  <tr key={v.usuario_id}>
                    <td className="py-2 font-semibold surface-heading">{v.nome}</td>
                    <td className="py-2">{v.orcados}</td>
                    <td className="py-2">{v.fechados}</td>
                    <td className="py-2">{v.orcados ? Math.round(100 * v.fechados / v.orcados) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="surface-card rounded-3xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
            <h3 className="text-base font-bold surface-heading">Orçamentos</h3>
            <span className="text-xs surface-muted">{itens.length} reg.</span>
          </div>
          {carregando ? (
            <p className="p-6 text-sm surface-muted">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="p-6 text-sm surface-muted">Nenhum orçamento ainda.</p>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-950 text-white text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Cliente</th>
                    {papelConta === 'GESTOR' && <th className="p-3">Vendedor</th>}
                    <th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Data</th><th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10 text-sm">
                  {itens.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3 font-semibold surface-heading">{item.cliente_nome || 'Consumidor Final'}</td>
                      {papelConta === 'GESTOR' && <td className="p-3 surface-muted">{item.usuario_nome}</td>}
                      <td className="p-3">R$ {Number(item.valor_venda_total || 0).toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${item.status === 'FECHADO' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                          {ROTULO_STATUS[item.status] || item.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs surface-muted">{new Date(item.criado_em).toLocaleDateString('pt-BR')}</td>
                      <td className="p-3 text-right">
                        {item.status === 'ORCADO' && (
                          <button onClick={() => fechar(item.id)} className="text-[10px] bg-orange-500 text-white px-3 py-1.5 rounded-full font-bold hover:bg-orange-600">Marcar Fechado</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Historico;

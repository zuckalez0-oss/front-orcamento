import { useState } from 'react';
import { useAuth } from './useAuth.js';
import { API_BASE } from './apiBase.js';

const PLANOS = [
  {
    id: 'FREE',
    nome: 'Free',
    preco: 'R$ 0',
    descricao: 'Pra testar e usar em baixo volume.',
    beneficios: ['Até 10 orçamentos por dia', 'Até 50 peças por orçamento', '1 usuário'],
  },
  {
    id: 'PRO',
    nome: 'Pro',
    preco: 'Sob consulta',
    descricao: 'Uso individual sem limites de volume.',
    beneficios: ['Orçamentos ilimitados por dia', 'Sem limite de peças por orçamento', '1 usuário'],
  },
  {
    id: 'ENTERPRISE',
    nome: 'Enterprise',
    preco: 'Sob consulta',
    descricao: 'Equipe de vendas com gestão centralizada.',
    beneficios: [
      'Orçamentos e peças ilimitados',
      '1 gestor + vendedores (assentos configuráveis)',
      'Gestor acompanha os orçamentos de toda a equipe',
      'Métricas de conversão (orçado x fechado) em tempo real',
      'Preço de matéria-prima pode variar por vendedor (perfis tributários)',
    ],
  },
];

// Troca de plano SELF-SERVICE: não há gateway de pagamento integrado ainda,
// então o clique já muda tipo_plano no backend na hora (ver
// POST /contas/alterar-plano em main.py). Decisão deliberada pra deixar
// testar o comportamento de cada tier agora — quando um gateway (Stripe
// etc.) for definido, essa chamada passa a rodar só depois de um checkout
// confirmado, não direto pelo clique do botão.
function Planos() {
  const { session, contaAtual } = useAuth();
  const [carregando, setCarregando] = useState(null);
  const [limiteVendedores, setLimiteVendedores] = useState(5);
  const [erro, setErro] = useState(null);

  const trocarPlano = async (tipoPlano) => {
    setErro(null);
    setCarregando(tipoPlano);
    try {
      const resposta = await fetch(`${API_BASE}/contas/alterar-plano`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tipo_plano: tipoPlano,
          limite_vendedores: tipoPlano === 'ENTERPRISE' ? Number(limiteVendedores) : undefined,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.detail || 'Não foi possível trocar de plano.');
        setCarregando(null);
        return;
      }
      // Recarrega a app inteira pra AuthGate buscar contaAtual/papelConta
      // atualizados do zero — mais simples e confiável do que replicar essa
      // lógica de refetch aqui.
      window.location.reload();
    } catch (e) {
      console.error('Falha ao trocar de plano', e);
      setErro('Erro ao trocar de plano no servidor.');
      setCarregando(null);
    }
  };

  return (
    <div className="absolute inset-0 p-4 lg:p-6 overflow-y-auto scrollbar-thin">
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <div>
          <h2 className="text-xl lg:text-2xl font-black surface-heading uppercase tracking-tight">Planos</h2>
          <p className="text-sm surface-muted mt-1">
            Sem gateway de pagamento integrado ainda — trocar de plano aqui é imediato, sem cobrança real.
          </p>
        </div>

        {erro && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3">{erro}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANOS.map((plano) => {
            const atual = contaAtual?.tipo_plano === plano.id;
            return (
              <div key={plano.id} className={`surface-card rounded-3xl p-6 border-t-4 flex flex-col ${atual ? 'border-orange-500' : 'border-slate-300 dark:border-white/10'}`}>
                <h3 className="text-lg font-black surface-heading uppercase">{plano.nome}</h3>
                <p className="text-2xl font-black surface-heading mt-1">{plano.preco}</p>
                <p className="text-xs surface-muted mt-1 mb-4">{plano.descricao}</p>
                <ul className="space-y-2 text-sm surface-body flex-1">
                  {plano.beneficios.map((b) => (
                    <li key={b} className="flex gap-2"><span className="text-orange-500 font-black shrink-0">✓</span><span>{b}</span></li>
                  ))}
                </ul>

                {plano.id === 'ENTERPRISE' && !atual && (
                  <div className="mt-4">
                    <label className="block text-[10px] font-bold surface-muted uppercase mb-1">Nº de vendedores (assentos)</label>
                    <input type="number" min="1" value={limiteVendedores} onChange={(e) => setLimiteVendedores(e.target.value)} className="input-field w-full rounded-xl p-2 text-sm" />
                  </div>
                )}

                <button
                  onClick={() => trocarPlano(plano.id)}
                  disabled={atual || carregando === plano.id}
                  className={`mt-5 w-full py-2.5 rounded-full font-bold text-sm transition-colors ${atual ? 'bg-slate-100 dark:bg-white/10 text-slate-400 cursor-default' : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50'}`}
                >
                  {atual ? 'Plano atual' : carregando === plano.id ? 'Processando...' : plano.id === 'FREE' ? 'Voltar pro Free' : `Assinar ${plano.nome}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Planos;

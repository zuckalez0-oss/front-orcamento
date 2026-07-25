import { useAuth } from './useAuth.js';

const ROTULO_PAPEL = {
  ADMINISTRADOR: 'Administrador',
  GERENTE: 'Gerente',
  VENDEDOR: 'Vendedor',
};

// Tela mínima ("lançar as bases" do RBAC): mostra o perfil do usuário logado,
// somente leitura por enquanto. Gestão de outros usuários fica para depois.
function PerfilUsuario() {
  const { session, perfil, papel } = useAuth();

  return (
    <div className="absolute inset-0 p-4 lg:p-6 overflow-y-auto scrollbar-thin">
      <div className="max-w-xl mx-auto">
        <div className="surface-card rounded-3xl shadow-[0_24px_80px_-35px_rgba(15,23,42,0.45)] dark:shadow-[0_24px_80px_-35px_rgba(0,0,0,0.7)] border-t-4 border-orange-500 p-6 lg:p-8">
          <h2 className="text-xl lg:text-2xl font-black surface-heading uppercase tracking-tight mb-6">Meu Perfil</h2>

          <div className="space-y-4">
            <div className="surface-card-inset rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">Nome</p>
              <p className="text-sm font-semibold surface-heading">{perfil?.nome || '—'}</p>
            </div>
            <div className="surface-card-inset rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">E-mail</p>
              <p className="text-sm font-semibold surface-heading">{session?.user?.email || '—'}</p>
            </div>
            <div className="surface-card-inset rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest surface-muted mb-1">Papel</p>
              <span className="inline-block text-xs font-bold uppercase px-3 py-1.5 rounded-full bg-orange-500 text-white">
                {papel ? (ROTULO_PAPEL[papel] || papel) : 'Sem perfil carregado'}
              </span>
            </div>
          </div>

          {!perfil && (
            <p className="mt-6 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3">
              Não foi possível carregar seu perfil. Confirme que <code>supabase/schema.sql</code> foi executado no
              projeto Supabase e que existe uma linha correspondente em <code>profiles</code> para este usuário.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default PerfilUsuario;

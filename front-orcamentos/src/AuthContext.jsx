import { createContext } from 'react';

// Preenchido pelo AuthGate.jsx depois que a sessão e o perfil (tabela `profiles`,
// ver supabase/schema.sql) são carregados. `papel` é o atalho mais usado pra
// renderização condicional por RBAC (ADMINISTRADOR / GERENTE / VENDEDOR).
// O hook de acesso (`useAuth`) fica em ./useAuth.js — separado deste arquivo
// porque misturar hook + contexto no mesmo módulo quebra o Fast Refresh do Vite.
const AuthContext = createContext({ session: null, perfil: null, papel: null });

export default AuthContext;

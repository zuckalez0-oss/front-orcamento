import { createContext } from 'react';

// Preenchido pelo AuthGate.jsx depois que a sessão e o perfil (tabela `profiles`,
// ver supabase/schema.sql) são carregados. `papel` é o atalho mais usado pra
// renderização condicional por RBAC (ADMINISTRADOR / GERENTE / VENDEDOR) —
// esse é o RBAC INTERNO da equipe Lypsyos, contas criadas manualmente.
//
// `contaAtual`/`papelConta` são um sistema PARALELO e separado: a conta de
// assinatura (Free/Pro/Enterprise) de clientes externos que se cadastram
// pelo app (ver supabase/schema_contas.sql, GET /contas/me em main.py).
// `papelConta` usa PROPRIETARIO/GESTOR/VENDEDOR — atenção que "VENDEDOR"
// existe nos dois sistemas com significados diferentes, por isso os nomes
// de campo são propositalmente distintos de `papel`. `contaAtual` fica
// `null` pra contas internas da Lypsyos (não têm linha em contas_usuarios,
// de propósito — ver POST /contas/provisionar).
// O hook de acesso (`useAuth`) fica em ./useAuth.js — separado deste arquivo
// porque misturar hook + contexto no mesmo módulo quebra o Fast Refresh do Vite.
const AuthContext = createContext({ session: null, perfil: null, papel: null, contaAtual: null, papelConta: null });

export default AuthContext;

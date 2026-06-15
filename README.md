# Registro de Orçamentos

Sistema para gerenciamento e registro de orçamentos.

## Estrutura do Projeto

```text
registro-orcamentos/
│
├── backend-orcamentos/
│   ├── main.py
│   ├── requirements.txt
│   └── venv/
│
├── front-orcamentos/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
└── doc.md
```

---

# Pré-requisitos

Instale os seguintes softwares:

- Node.js 20+ recomendado
- Python 3.11+ recomendado
- Git

Verifique as versões:

```bash
node -v
npm -v
python --version
git --version
```

---

# Clonando o Projeto

```bash
git clone <URL_DO_REPOSITORIO>
cd registro-orcamentos
```

---

# Configuração do Backend

Acesse a pasta:

```bash
cd backend-orcamentos
```

## Criar ambiente virtual

Windows:

```bash
python -m venv venv
```

## Ativar ambiente virtual

Windows:

```bash
venv\Scripts\activate
```

## Instalar dependências

```bash
pip install -r requirements.txt
```

## Executar Backend

Caso utilize FastAPI:

```bash
uvicorn main:app --reload
```

Servidor disponível em:

```text
http://localhost:8000
```

Documentação Swagger:

```text
http://localhost:8000/docs
```

---

# Configuração do Frontend

Abra um novo terminal.

Acesse a pasta:

```bash
cd front-orcamentos
```

## Instalar dependências

```bash
npm install
```

## Executar ambiente de desenvolvimento

```bash
npm run dev
```

O Vite exibirá algo semelhante a:

```text
Local: http://localhost:5173/
```

Abra o endereço informado no navegador.

---

# Build para Produção

Dentro da pasta:

```bash
cd front-orcamentos
```

Execute:

```bash
npm run build
```

Os arquivos compilados serão gerados em:

```text
front-orcamentos/dist
```

---

# Atualizando Dependências

Frontend:

```bash
npm update
```

Backend:

```bash
pip install -U -r requirements.txt
```

---

# Comandos Úteis

## Instalar nova dependência React

```bash
npm install nome-da-biblioteca
```

## Instalar nova dependência Python

```bash
pip install nome-do-pacote
```

Atualizar requirements:

```bash
pip freeze > requirements.txt
```

---

# Tecnologias Utilizadas

## Frontend

- React
- Vite
- JavaScript
- CSS

## Backend

- Python
- FastAPI
- Uvicorn

---

# Equipe

Projeto desenvolvido para controle e registro de orçamentos.

Autor: Matheus .A {ZipoLock}
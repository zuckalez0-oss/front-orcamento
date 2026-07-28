<!--
  PREENCHER ANTES DE PUBLICAR (marcados com TODO no corpo):
  1. Como o orçamento é calculado (área, peso, perímetro, tempo de corte?)
  2. Como a peça entra no sistema (formulário, DXF, upload?)
  3. Onde os orçamentos ficam salvos (banco, arquivo, memória?)
  4. Se existe autenticação de usuário
  5. Ajustar o Roadmap para o que você realmente pretende fazer
-->

# GeoQuote
<img width="241" height="73" alt="image" src="https://github.com/user-attachments/assets/09d0c823-c96c-45c2-8080-b6dc00b693e2" />


> Orçamento de peças cortadas a **laser, plasma e oxicorte** — da geometria ao preço, sem planilha intermediária.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Uvicorn](https://img.shields.io/badge/Uvicorn-2F9E44?style=for-the-badge)

## O que faz

Ferramenta web para gerar e registrar orçamentos de corte. Substitui a planilha que vai e volta entre o comercial e a produção por um fluxo único: entra a peça, sai o preço, fica o registro.

- 📐 Orçamento de peças para **laser, plasma e oxicorte** <!-- TODO: detalhar como o preço é calculado -->
- 🧾 Registro dos orçamentos gerados, consultáveis depois
- ⚡ API própria em FastAPI, com documentação automática em `/docs`
- 🖥️ Interface React desacoplada do backend — dá para trocar um sem mexer no outro

## Stack

| Camada | Tecnologia | Papel |
|---|---|---|
| Frontend | **React + Vite** | interface e build |
| | **JavaScript / CSS** | lógica de tela e estilos |
| Backend | **FastAPI** | API de cálculo e registro |
| | **Uvicorn** | servidor ASGI |

## Estrutura

```
geoquote/
├── backend-orcamentos/
│   ├── main.py            → aplicação FastAPI
│   └── requirements.txt
│
└── front-orcamentos/
    ├── src/               → componentes e telas
    ├── public/
    ├── package.json
    └── vite.config.js
```

## Como executar

O projeto sobe em **dois terminais**: um para a API, outro para a interface.

### 1. Backend

```bash
cd backend-orcamentos

python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS

pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Frontend

```bash
cd front-orcamentos
npm install
npm run dev
```

### Endereços

| Serviço | URL |
|---|---|
| Interface | http://localhost:5173 |
| API | http://localhost:8000 |
| Documentação (Swagger) | http://localhost:8000/docs |

## Build de produção

```bash
cd front-orcamentos
npm run build
```

Os arquivos compilados vão para `front-orcamentos/dist`.

## Requisitos

- Node.js 20+
- Python 3.11+
- Git

## Roadmap

- [ ] Testes automatizados da regra de cálculo
- [ ] Exportação do orçamento em PDF
- [ ] Histórico com busca por cliente e período

---
# Demonstração:

## Interface Principal v1.0.0
<img width="1893" height="885" alt="image" src="https://github.com/user-attachments/assets/f7e01ee0-3ad8-41b7-9758-6050df9299f0" />

---

## Parâmetros Globais de Configuração
<img width="1908" height="904" alt="image" src="https://github.com/user-attachments/assets/0be66ec6-01ad-4feb-8680-68532cdd6a5e" />

---

Desenvolvido por **Matheus Ribeiro** (Zucka) · [@zuckalez0-oss](https://github.com/zuckalez0-oss) · [matribeiro.tech](https://matribeiro.tech)


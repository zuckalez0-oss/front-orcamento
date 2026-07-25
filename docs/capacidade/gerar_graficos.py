import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

with open("resultados.json") as f:
    dados = json.load(f)

niveis = sorted(int(k) for k in dados.keys())
p50 = [dados[str(n)]["latencia_p50_ms"] for n in niveis]
p95 = [dados[str(n)]["latencia_p95_ms"] for n in niveis]
p99 = [dados[str(n)]["latencia_p99_ms"] for n in niveis]
throughput = [dados[str(n)]["throughput_req_s"] for n in niveis]
cpu_pico = [dados[str(n)]["cpu_pct_pico"] for n in niveis]
mem_pico = [dados[str(n)]["mem_pico_mb"] for n in niveis]
erro = [dados[str(n)]["taxa_erro"] * 100 for n in niveis]

# Paleta (dataviz-style: laranja de marca do GeoQuote + neutros)
LARANJA = "#F97316"
AZUL = "#3987e5"
VERDE = "#199e70"
VERMELHO = "#e66767"
CINZA = "#64748B"
BG = "#0A0A0A"
GRID = "#262626"
TEXTO = "#E2E8F0"

plt.rcParams.update({
    "figure.facecolor": BG,
    "axes.facecolor": BG,
    "axes.edgecolor": GRID,
    "axes.labelcolor": TEXTO,
    "text.color": TEXTO,
    "xtick.color": TEXTO,
    "ytick.color": TEXTO,
    "grid.color": GRID,
    "font.size": 11,
    "font.family": "DejaVu Sans",
})

IDLE_CPU = 41.5  # % medido com o servidor parado, atribuído ao --reload (file watcher) do modo dev


SAIDA = "/home/z1/projetos_/front-orcamento/docs/capacidade"


def salvar(fig, nome):
    fig.savefig(f"{SAIDA}/{nome}.png", dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)


# 1) Latência vs concorrência
fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(niveis, p50, marker="o", color=VERDE, label="p50 (mediana)", linewidth=2)
ax.plot(niveis, p95, marker="o", color=LARANJA, label="p95", linewidth=2)
ax.plot(niveis, p99, marker="o", color=VERMELHO, label="p99", linewidth=2)
ax.set_xlabel("Requisições simultâneas (concorrência)")
ax.set_ylabel("Latência (ms)")
ax.set_title("Latência de /calcular-orcamento por nível de concorrência\n(1 worker uvicorn, ambiente de teste)", fontsize=12, fontweight="bold")
ax.legend(frameon=False)
ax.grid(True, alpha=0.3)
ax.axhline(1000, color=CINZA, linestyle="--", linewidth=1, alpha=0.6)
ax.text(niveis[-1], 1000, " limite confortável de UX (~1s)", color=CINZA, fontsize=9, va="bottom", ha="right")
salvar(fig, "01_latencia_vs_concorrencia")

# 2) Throughput vs concorrência
fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(niveis, throughput, marker="o", color=AZUL, linewidth=2)
ax.fill_between(niveis, throughput, alpha=0.15, color=AZUL)
ax.set_xlabel("Requisições simultâneas (concorrência)")
ax.set_ylabel("Throughput sustentado (req/s)")
ax.set_title("Vazão de 1 worker do backend conforme a concorrência aumenta", fontsize=12, fontweight="bold")
ax.grid(True, alpha=0.3)
ax.set_ylim(0, max(throughput) * 1.25)
salvar(fig, "02_throughput_vs_concorrencia")

# 3) CPU: bruto (medido) vs corrigido (descontando overhead do --reload)
cpu_corrigido = [max(0, c - IDLE_CPU) for c in cpu_pico]
fig, ax = plt.subplots(figsize=(8, 5))
largura = 0.35
x = range(len(niveis))
ax.bar([i - largura / 2 for i in x], cpu_pico, largura, label="Medido (ambiente dev, com --reload)", color=CINZA)
ax.bar([i + largura / 2 for i in x], cpu_corrigido, largura, label="Estimado em produção (sem overhead do --reload)", color=LARANJA)
ax.set_xticks(list(x))
ax.set_xticklabels([str(n) for n in niveis])
ax.set_xlabel("Requisições simultâneas (concorrência)")
ax.set_ylabel("Pico de CPU (%, soma dos processos)")
ax.set_title("Consumo de CPU do backend sob carga", fontsize=12, fontweight="bold")
ax.legend(frameon=False, fontsize=9)
ax.grid(True, alpha=0.3, axis="y")
salvar(fig, "03_cpu_vs_concorrencia")

# 4) Memória vs concorrência
fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(niveis, mem_pico, marker="o", color=VERDE, linewidth=2)
ax.set_xlabel("Requisições simultâneas (concorrência)")
ax.set_ylabel("RAM pico (MB)")
ax.set_title("Consumo de memória do backend sob carga\n(praticamente plano — carga é CPU-bound, não memory-bound)", fontsize=12, fontweight="bold")
ax.grid(True, alpha=0.3)
ax.set_ylim(0, max(mem_pico) * 1.3)
salvar(fig, "04_memoria_vs_concorrencia")

print("Gráficos 1-4 gerados.")

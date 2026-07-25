import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

LARANJA = "#F97316"
AZUL = "#3987e5"
VERDE = "#199e70"
VERMELHO = "#e66767"
ROXO = "#9085e9"
CINZA = "#64748B"
BG = "#0A0A0A"
GRID = "#262626"
TEXTO = "#E2E8F0"

plt.rcParams.update({
    "figure.facecolor": BG, "axes.facecolor": BG, "axes.edgecolor": GRID,
    "axes.labelcolor": TEXTO, "text.color": TEXTO, "xtick.color": TEXTO,
    "ytick.color": TEXTO, "grid.color": GRID, "font.size": 11,
    "font.family": "DejaVu Sans",
})

SAIDA = "/home/z1/projetos_/front-orcamento/docs/capacidade"


def salvar(fig, nome):
    fig.savefig(f"{SAIDA}/{nome}.png", dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)


# 5) Usuários simultâneos -> droplet recomendado (specs + custo)
tiers = ["10 usuários", "100 usuários", "1.000 usuários"]
vcpu = [2, 2, 8]
ram = [2, 4, 16]
custo = [18, 24, 168]
cor_tier = [VERDE, AZUL, LARANJA]

fig, axes = plt.subplots(1, 3, figsize=(14, 5))
for ax, valores, titulo, unidade in zip(
    axes, [vcpu, ram, custo], ["vCPU", "RAM (GB)", "Custo (US$/mês)"], ["", " GB", " US$"]
):
    barras = ax.bar(tiers, valores, color=cor_tier, width=0.6)
    ax.set_title(titulo, fontsize=12, fontweight="bold")
    ax.grid(True, alpha=0.3, axis="y")
    for b, v in zip(barras, valores):
        ax.text(b.get_x() + b.get_width() / 2, v, f"{v}{unidade}", ha="center", va="bottom", fontsize=10, fontweight="bold")
    ax.set_ylim(0, max(valores) * 1.25)
    ax.tick_params(axis="x", labelrotation=15)
    for label in ax.get_xticklabels():
        label.set_ha("right")
fig.suptitle("Droplet recomendado por faixa de usuários simultâneos (DigitalOcean)", fontsize=13, fontweight="bold", y=1.03)
salvar(fig, "05_recomendacao_por_tier")

# 6) Custo por 100 usuários simultâneos (economia de escala)
custo_por_100 = [c / (int(t.split()[0].replace(".", "")) / 100) for t, c in zip(tiers, custo)]
fig, ax = plt.subplots(figsize=(8, 5))
barras = ax.bar(tiers, custo_por_100, color=[VERDE, AZUL, LARANJA])
for b, v in zip(barras, custo_por_100):
    ax.text(b.get_x() + b.get_width() / 2, v, f"US$ {v:.2f}", ha="center", va="bottom", fontsize=10, fontweight="bold")
ax.set_ylabel("US$ / mês para cada 100 usuários simultâneos")
ax.set_title("Custo normalizado: quanto custa suportar cada 100 usuários", fontsize=12, fontweight="bold")
ax.grid(True, alpha=0.3, axis="y")
ax.set_ylim(0, max(custo_por_100) * 1.3)
salvar(fig, "06_custo_por_100_usuarios")

print("Gráficos 5-6 gerados.")

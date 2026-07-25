"""Modelo de capacidade: traduz os números medidos em vCPU/RAM necessários
por faixa de usuários simultâneos, e mapeia para droplets reais da DigitalOcean
(pesquisados ao vivo em digitalocean.com/pricing/droplets)."""
import json

with open("resultados.json") as f:
    bench = json.load(f)

# ---- Premissas do modelo (documentadas no relatório) ----
FATOR_PICO_SIMULTANEO = 0.10   # % dos usuários simultâneos que clicam "Calcular" na mesma janela de 1s, no pico
INTERVALO_MEDIO_S = 30         # um usuário ativo dispara 1 cálculo a cada ~30s em média
CONCORRENCIA_BOA_LATENCIA_POR_WORKER = 25  # acima disso, p95 passa de ~550ms
BASELINE_VCPU_SO_NGINX = 1     # vCPU reservado p/ SO, nginx, sqlite, monitoramento

DROPLETS = [
    # categoria, vcpu, ram_gb, preco_mes_usd, cpu_dedicada
    ("Basic (shared)", 1, 1, 6, False),
    ("Basic (shared)", 1, 2, 12, False),
    ("Basic (shared)", 2, 2, 18, False),
    ("Basic (shared)", 2, 4, 24, False),
    ("Basic (shared)", 4, 8, 48, False),
    ("Basic (shared)", 8, 16, 96, False),
    ("CPU-Optimized (dedicated)", 2, 4, 42, True),
    ("CPU-Optimized (dedicated)", 4, 8, 84, True),
    ("CPU-Optimized (dedicated)", 8, 16, 168, True),
    ("CPU-Optimized (dedicated)", 16, 32, 336, True),
]


def vcpus_necessarios(usuarios_simultaneos):
    pico_concorrente = max(1, round(usuarios_simultaneos * FATOR_PICO_SIMULTANEO))
    workers = max(1, -(-pico_concorrente // CONCORRENCIA_BOA_LATENCIA_POR_WORKER))  # ceil
    vcpu_total = workers + BASELINE_VCPU_SO_NGINX
    media_req_s = usuarios_simultaneos / INTERVALO_MEDIO_S
    return {
        "usuarios_simultaneos": usuarios_simultaneos,
        "pico_concorrente_estimado": pico_concorrente,
        "workers_recomendados": workers,
        "vcpu_minimo": vcpu_total,
        "carga_media_req_s": round(media_req_s, 2),
    }


def escolher_droplet(vcpu_min, dedicado=False):
    candidatos = [d for d in DROPLETS if d[1] >= vcpu_min and d[4] == dedicado]
    candidatos.sort(key=lambda d: d[1])
    return candidatos[0] if candidatos else None


resultado = {}
for usuarios in (10, 100, 1000):
    modelo = vcpus_necessarios(usuarios)
    basic = escolher_droplet(modelo["vcpu_minimo"], dedicado=False)
    cpu_opt = escolher_droplet(modelo["vcpu_minimo"], dedicado=True)
    modelo["recomendacao_basic"] = basic
    modelo["recomendacao_cpu_optimized"] = cpu_opt
    resultado[usuarios] = modelo
    print(usuarios, "usuarios ->", modelo)

with open("modelo_capacidade.json", "w") as f:
    json.dump(resultado, f, indent=2, ensure_ascii=False)

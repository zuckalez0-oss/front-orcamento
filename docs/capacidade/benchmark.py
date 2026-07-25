"""
Benchmark de carga contra /calcular-orcamento rodando de verdade em
http://localhost:8000 (instância que o usuário já tem aberta).

Para cada nível de concorrência, dispara N requisições "simultâneas"
(simulando N usuários clicando 'Processar Orçamento' ao mesmo tempo),
em várias rodadas, medindo latência e monitorando CPU/RAM do processo
do backend via psutil durante toda a rajada.
"""
import asyncio
import json
import statistics
import time

import httpx
import psutil

from gerar_payload import gerar_payload

BASE_URL = "http://localhost:8000"
NIVEIS_CONCORRENCIA = [1, 5, 10, 25, 50, 100, 150, 200]
RODADAS_POR_NIVEL = 3
PECAS_POR_ORCAMENTO_MIN = 10
PECAS_POR_ORCAMENTO_MAX = 30

# PIDs candidatos do processo do backend (uvicorn --reload gera um supervisor
# + um worker via multiprocessing.spawn; somamos CPU/RAM dos dois porque o
# fork pode migrar o trabalho real entre eles dependendo da versão do uvicorn).
def localizar_pids_backend():
    pids = []
    for proc in psutil.process_iter(["pid", "cmdline"]):
        try:
            cmdline = " ".join(proc.info["cmdline"] or [])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        if "main.py" in cmdline and "backend-orcamentos" in cmdline:
            pids.append(proc.pid)
        elif "multiprocessing.spawn" in cmdline:
            # só inclui se for filho de um processo já identificado (checado depois)
            pids.append(proc.pid)
    return pids


def filtrar_filhos_relevantes(pids_candidatos):
    """Mantém só quem é o processo main.py ou descendente dele."""
    relevantes = set()
    procs = {p.pid: p for p in psutil.process_iter(["pid", "ppid", "cmdline"])}
    raiz = None
    for pid in pids_candidatos:
        info = procs.get(pid)
        if info and "main.py" in " ".join(info.info["cmdline"] or []):
            raiz = pid
            relevantes.add(pid)
    if raiz is None:
        return list(pids_candidatos)
    mudou = True
    while mudou:
        mudou = False
        for pid, p in procs.items():
            if p.info["ppid"] in relevantes and pid not in relevantes:
                relevantes.add(pid)
                mudou = True
    return list(relevantes)


class MonitorRecursos:
    """Amostra CPU% e RSS (RAM) dos processos do backend em background."""

    def __init__(self, pids, intervalo=0.05):
        self.processos = [psutil.Process(pid) for pid in pids if psutil.pid_exists(pid)]
        self.intervalo = intervalo
        self.amostras_cpu = []
        self.amostras_mem = []
        self._rodando = False
        self._task = None
        for p in self.processos:
            try:
                p.cpu_percent(None)  # descarta a primeira leitura (sempre 0)
            except psutil.NoSuchProcess:
                pass

    async def _loop(self):
        while self._rodando:
            cpu_total = 0.0
            mem_total = 0
            for p in self.processos:
                try:
                    cpu_total += p.cpu_percent(None)
                    mem_total += p.memory_info().rss
                except psutil.NoSuchProcess:
                    pass
            self.amostras_cpu.append(cpu_total)
            self.amostras_mem.append(mem_total)
            await asyncio.sleep(self.intervalo)

    def iniciar(self):
        self._rodando = True
        self._task = asyncio.ensure_future(self._loop())

    async def parar(self):
        self._rodando = False
        if self._task:
            await self._task


async def disparar_uma_requisicao(client, payload):
    t0 = time.perf_counter()
    try:
        r = await client.post(f"{BASE_URL}/calcular-orcamento", json=payload, timeout=60)
        dt = time.perf_counter() - t0
        return {"ok": r.status_code == 200, "status": r.status_code, "tempo": dt}
    except Exception as e:
        dt = time.perf_counter() - t0
        return {"ok": False, "status": None, "tempo": dt, "erro": str(e)}


async def rodada(client, concorrencia, seed_base):
    payloads = [
        gerar_payload(
            n_pecas=(seed_base + i) % (PECAS_POR_ORCAMENTO_MAX - PECAS_POR_ORCAMENTO_MIN) + PECAS_POR_ORCAMENTO_MIN,
            seed=seed_base * 1000 + i,
        )
        for i in range(concorrencia)
    ]
    t0 = time.perf_counter()
    resultados = await asyncio.gather(*[disparar_uma_requisicao(client, p) for p in payloads])
    duracao_rodada = time.perf_counter() - t0
    return resultados, duracao_rodada


async def main():
    pids_candidatos = localizar_pids_backend()
    pids = filtrar_filhos_relevantes(pids_candidatos)
    print(f"Monitorando PIDs do backend: {pids}")

    resultado_final = {}

    limits = httpx.Limits(max_connections=300, max_keepalive_connections=300)
    async with httpx.AsyncClient(limits=limits) as client:
        # aquecimento
        await disparar_uma_requisicao(client, gerar_payload(15, seed=0))

        for concorrencia in NIVEIS_CONCORRENCIA:
            monitor = MonitorRecursos(pids)
            monitor.iniciar()

            todas_latencias = []
            todos_status_ok = 0
            todos_total = 0
            duracoes_rodada = []

            for rodada_idx in range(RODADAS_POR_NIVEL):
                resultados, duracao_rodada = await rodada(client, concorrencia, seed_base=concorrencia * 10 + rodada_idx)
                duracoes_rodada.append(duracao_rodada)
                for r in resultados:
                    todas_latencias.append(r["tempo"])
                    todos_total += 1
                    if r["ok"]:
                        todos_status_ok += 1

            await monitor.parar()

            latencias_ms = sorted(t * 1000 for t in todas_latencias)
            n = len(latencias_ms)
            p50 = latencias_ms[int(n * 0.50)] if n else 0
            p95 = latencias_ms[min(int(n * 0.95), n - 1)] if n else 0
            p99 = latencias_ms[min(int(n * 0.99), n - 1)] if n else 0

            # throughput: requisições concluídas / tempo total gasto em todas as rodadas
            tempo_total_rodadas = sum(duracoes_rodada)
            throughput = todos_total / tempo_total_rodadas if tempo_total_rodadas > 0 else 0

            cpu_medio = statistics.mean(monitor.amostras_cpu) if monitor.amostras_cpu else 0
            cpu_pico = max(monitor.amostras_cpu) if monitor.amostras_cpu else 0
            mem_media_mb = (statistics.mean(monitor.amostras_mem) / 1_048_576) if monitor.amostras_mem else 0
            mem_pico_mb = (max(monitor.amostras_mem) / 1_048_576) if monitor.amostras_mem else 0

            linha = {
                "concorrencia": concorrencia,
                "total_requisicoes": todos_total,
                "sucesso": todos_status_ok,
                "taxa_erro": 1 - (todos_status_ok / todos_total if todos_total else 1),
                "latencia_media_ms": statistics.mean(latencias_ms) if latencias_ms else 0,
                "latencia_p50_ms": p50,
                "latencia_p95_ms": p95,
                "latencia_p99_ms": p99,
                "latencia_max_ms": max(latencias_ms) if latencias_ms else 0,
                "throughput_req_s": throughput,
                "cpu_pct_medio": cpu_medio,
                "cpu_pct_pico": cpu_pico,
                "mem_media_mb": mem_media_mb,
                "mem_pico_mb": mem_pico_mb,
            }
            resultado_final[concorrencia] = linha
            print(
                f"conc={concorrencia:4d} | ok={todos_status_ok}/{todos_total} | "
                f"p50={p50:7.1f}ms p95={p95:7.1f}ms p99={p99:7.1f}ms | "
                f"throughput={throughput:6.2f} req/s | cpu_pico={cpu_pico:6.1f}% | mem_pico={mem_pico_mb:6.1f}MB"
            )

    with open("resultados.json", "w") as f:
        json.dump(resultado_final, f, indent=2)
    print("\nResultados salvos em resultados.json")


if __name__ == "__main__":
    asyncio.run(main())

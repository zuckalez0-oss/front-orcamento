"""
Motor de precificação genérico para corte a laser/plasma.

Cada peça é cobrada por quatro componentes: custo de material (chapa inteira
consumida, via nesting real — não só o peso líquido da peça), custo de corte
(tempo de perímetro/velocidade), custo de piercing (furos) e custo de setup
(uma vez por espessura). Markup/comissão/imposto são aplicados sobre o custo
de produção total para chegar ao preço de venda.

As constantes de `ConfiguracaoPrecificacao` estão centralizadas aqui de propósito:
é o gancho para um usuário ADMINISTRADOR poder ajustá-las no futuro (a UI de
edição fica para uma próxima etapa — por ora, é só um lugar único e nomeado em
vez de números soltos no meio do cálculo).
"""
import math
from dataclasses import dataclass


@dataclass
class ConfiguracaoPrecificacao:
    fator_dinamico: float = 1.15
    movimento_vazio_por_furo_min: float = 0.02
    fator_velocidade_furo: float = 0.20
    velocidade_fallback_mm_min: float = 5000.0
    teto_soma_percentuais: float = 0.99
    # Estimativa típica de largura de kerf (material vaporizado ao longo do corte)
    # pra corte a laser em chapa fina/média — é uma aproximação de engenharia, não
    # um valor de precisão por máquina/gás/material. Usada só pro cálculo de sobra
    # (Controle de Sobras), não afeta tempo de corte nem custo de material.
    largura_kerf_mm: float = 0.15


class PricingEngine:
    def __init__(self, config: ConfiguracaoPrecificacao = None):
        self.config = config or ConfiguracaoPrecificacao()

    # --- Tempo de produção ---

    def tempo_corte_externo_min(self, perimetro_externo_mm, velocidade_corte_mm_min):
        velocidade = velocidade_corte_mm_min if velocidade_corte_mm_min > 0 else self.config.velocidade_fallback_mm_min
        return perimetro_externo_mm / velocidade

    def tempo_corte_furos_min(self, n_furos, diametro_furo_mm, velocidade_corte_mm_min):
        velocidade_base = velocidade_corte_mm_min if velocidade_corte_mm_min > 0 else self.config.velocidade_fallback_mm_min
        velocidade_furo = velocidade_base * self.config.fator_velocidade_furo
        perimetro_furos_mm = n_furos * math.pi * diametro_furo_mm
        return perimetro_furos_mm / velocidade_furo if velocidade_furo > 0 else 0.0

    def tempo_piercing_min(self, n_furos, tempo_piercing_seg):
        return (tempo_piercing_seg / 60) * n_furos

    def tempo_movimento_vazio_min(self, n_furos):
        return self.config.movimento_vazio_por_furo_min * (n_furos + 1)

    def tempo_producao_unidade_min(self, perimetro_externo_mm, velocidade_corte_mm_min, n_furos, diametro_furo_mm, tempo_piercing_seg):
        bruto = (
            self.tempo_corte_externo_min(perimetro_externo_mm, velocidade_corte_mm_min)
            + self.tempo_corte_furos_min(n_furos, diametro_furo_mm, velocidade_corte_mm_min)
            + self.tempo_piercing_min(n_furos, tempo_piercing_seg)
            + self.tempo_movimento_vazio_min(n_furos)
        )
        return bruto * self.config.fator_dinamico

    # --- Custos de máquina ---

    def custo_maquina(self, tempo_min, valor_hora):
        return (tempo_min / 60) * valor_hora

    def custo_setup(self, tempo_setup_min, valor_hora):
        return self.custo_maquina(tempo_setup_min, valor_hora)

    # --- Custo de material ---

    def peso_por_area_kg(self, area_mm2, espessura_mm, densidade_g_cm3):
        """Peso de uma área plana qualquer (mm²) de chapa: volume * g/cm³ de
        densidade, convertido para kg. Base tanto do peso de uma chapa inteira
        quanto do peso da sobra (Controle de Sobras)."""
        return (area_mm2 * espessura_mm * densidade_g_cm3) / 1_000_000

    def peso_chapa_kg(self, largura_mm, comprimento_mm, espessura_mm, densidade_g_cm3):
        """Peso de UMA chapa inteira (não da peça)."""
        return self.peso_por_area_kg(largura_mm * comprimento_mm, espessura_mm, densidade_g_cm3)

    def custo_material_chapa(self, chapas_necessarias, largura_mm, comprimento_mm, espessura_mm, densidade_g_cm3, preco_kg):
        """Cobra a(s) chapa(s) inteira(s) consumida(s) — peça + sucata — em vez de só o
        peso líquido da peça. `chapas_necessarias` vem do nesting real (nesting.py)."""
        peso_total_kg = chapas_necessarias * self.peso_chapa_kg(largura_mm, comprimento_mm, espessura_mm, densidade_g_cm3)
        return peso_total_kg * preco_kg

    # --- Fechamento do orçamento ---

    def montar_totais_financeiros(self, custo_producao, imposto_pct, comissao_pct, margem_pct, frete):
        soma_percentuais = min((imposto_pct + comissao_pct + margem_pct) / 100, self.config.teto_soma_percentuais)
        preco_venda_bruto = custo_producao / (1 - soma_percentuais) if custo_producao > 0 else 0.0
        taxas_valor = preco_venda_bruto * soma_percentuais
        preco_final = preco_venda_bruto + frete
        return {
            "soma_percentuais": soma_percentuais,
            "preco_venda_bruto": preco_venda_bruto,
            "taxas_valor": taxas_valor,
            "preco_final": preco_final,
        }

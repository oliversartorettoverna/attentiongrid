"""Erlang C: quanti operatori servono per rispondere in tempo alle richieste di aiuto.

È la stessa formula che si usa per dimensionare i call center. Ingressi:
- richieste al minuto (dalla previsione),
- durata media di un intervento,
- attesa massima accettabile e livello di servizio (es. 90% entro 20 s).

Test: python engine/erlang.py
"""
import math


def erlang_c(traffico: float, operatori: int) -> float:
    """Probabilità che una richiesta debba aspettare. `traffico` è in Erlang
    (richieste al secondo × durata media in secondi)."""
    if operatori <= 0:
        return 1.0
    if traffico <= 0:
        return 0.0
    if traffico >= operatori:
        return 1.0
    termine, somma = 1.0, 1.0
    for k in range(1, operatori):
        termine *= traffico / k
        somma += termine
    termine_n = termine * traffico / operatori          # A^N / N!
    alto = termine_n * operatori / (operatori - traffico)
    return alto / (somma + alto)


def livello_servizio(traffico: float, operatori: int, durata_media_s: float, attesa_max_s: float) -> float:
    """Quota di richieste servite entro `attesa_max_s`."""
    if traffico <= 0:
        return 1.0
    if traffico >= operatori:
        return 0.0
    p_attesa = erlang_c(traffico, operatori)
    return 1 - p_attesa * math.exp(-(operatori - traffico) * attesa_max_s / durata_media_s)


def operatori_necessari(richieste_al_minuto: float, durata_media_s: float, attesa_max_s: float,
                        livello: float = 0.9, massimo: int = 60) -> int:
    """Numero minimo di operatori (almeno 1) per rispettare il livello di servizio."""
    traffico = richieste_al_minuto * durata_media_s / 60.0
    n = max(1, math.ceil(traffico))
    while n <= massimo:
        if livello_servizio(traffico, n, durata_media_s, attesa_max_s) >= livello:
            return n
        n += 1
    return massimo


if __name__ == "__main__":
    # Esempio classico da manuale: 10 Erlang, 11 operatori → probabilità di attesa ≈ 0,682
    p = erlang_c(10, 11)
    assert abs(p - 0.6821) < 0.001, p
    # Più operatori → meno attesa
    assert erlang_c(10, 15) < erlang_c(10, 12) < erlang_c(10, 11)
    # 2 richieste al minuto da 90 s = 3 Erlang
    n = operatori_necessari(2.0, 90, 20, 0.9)
    assert livello_servizio(3.0, n, 90, 20) >= 0.9 > livello_servizio(3.0, n - 1, 90, 20)
    print(f"OK. Erlang C(10, 11) = {p:.4f}; per 2 richieste/min da 90 s servono {n} operatori")

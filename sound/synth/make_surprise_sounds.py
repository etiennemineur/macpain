#!/usr/bin/env python3
"""Génère les bruitages « surprise » de MacPaint (préfixe fx_) :
   suspense (roulement de tambour + cymbale), cartoon (boing, sifflet à
   coulisse, coin-coin, pouet, coucou, sifflet admiratif), actions (glouglou
   du pot, rembobinage de l'annulation, caisse enregistreuse), rythme (note de
   marimba, rejouée à différentes hauteurs) et silence gêné (grillons).
Synthèse procédurale (numpy/scipy), WAV 16-bit mono 44,1 kHz, CC0."""
import numpy as np
from scipy.signal import butter, lfilter
from scipy.io import wavfile
from pathlib import Path

FS = 44100
OUT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(1984)


def t_of(n):
    return np.arange(n) / FS

def filt(kind, freqs, x, order=2):
    b, a = butter(order, np.array(freqs, dtype=float) / (0.5 * FS), btype=kind)
    return lfilter(b, a, x)

def noise(n):
    return rng.uniform(-1, 1, n)

def phase(f):
    return 2 * np.pi * np.cumsum(f) / FS

def edges(x, a=0.004, r=0.02):
    """Petits fondus d'entrée et de sortie : aucun clic en début ni en fin."""
    na, nr = int(FS * a), int(FS * r)
    x = x.copy()
    x[:na] *= np.linspace(0, 1, na)
    x[-nr:] *= np.linspace(1, 0, nr)
    return x

def write(name, x, peak=0.85, loop=False):
    x = np.asarray(x, dtype=float)
    if not loop:
        x = edges(x)
    x = x / (np.max(np.abs(x)) or 1.0) * peak
    wavfile.write(str(OUT / name), FS, (x * 32767).astype(np.int16))
    print(f'{name}  {len(x) / FS:.2f}s')

def place(out, seg, at, wrap=False):
    i = int(at * FS)
    if wrap:
        idx = (i + np.arange(len(seg))) % len(out)
        np.add.at(out, idx, seg)
    else:
        seg = seg[:max(0, len(out) - i)]
        out[i:i + len(seg)] += seg


# -- Suspense : roulement de caisse claire (boucle exacte) et cymbale ---------
def snare_hit(amp=1.0):
    n = int(FS * 0.09); t = t_of(n)
    wires = filt('band', [1500, 8000], noise(n)) * np.exp(-t / 0.022)
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.03)
    return amp * (wires + 0.55 * body)

def drumroll():
    n = 44000                      # 22 coups de 2000 échantillons : boucle exacte
    out = np.zeros(n)
    for i in range(22):
        amp = (1.0 if i % 2 == 0 else 0.8) * rng.uniform(0.88, 1.0)
        place(out, snare_hit(amp), i * 2000 / FS, wrap=True)
    return out

def cymbal():
    n = int(FS * 1.7); t = t_of(n)
    wash = filt('high', 3500, noise(n), 3) * np.exp(-t / 0.42)
    metal = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (2217, 3101, 4233, 5417, 6811))
    metal = filt('high', 2500, metal, 2) * np.exp(-t / 0.3) * 0.12
    thump = np.sin(phase(150 * np.exp(-t * 18) + 48)) * np.exp(-t / 0.07) * 1.1
    stick = filt('band', [900, 5000], noise(n)) * np.exp(-t / 0.012) * 0.9
    return wash + metal + thump + stick


# -- Cartoon -------------------------------------------------------------------
def slide(f0, f1, dur, curve=1.0):
    n = int(FS * dur); t = t_of(n)
    u = (t / dur) ** curve
    f = f0 * (f1 / f0) ** u * (1 + 0.012 * np.sin(2 * np.pi * 6.5 * t))
    ph = phase(f)
    tone = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
    breath = filt('band', [1500, 6000], noise(n)) * 0.07
    env = np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.07)
    return (tone + breath) * env

def boing():
    n = int(FS * 0.75); t = t_of(n)
    f = 95 + 190 * np.exp(-t * 2.2) * (1 + 0.55 * np.sin(2 * np.pi * (7 + 9 * t) * t))
    ph = phase(f)
    x = np.tanh(2.2 * (np.sin(ph) + 0.4 * np.sin(2 * ph + 0.5)))
    x = filt('band', [90, 2600], x)
    return x * np.minimum(1, t / 0.004) * np.exp(-t / 0.24)

def quack_one(f0, f1, dur):
    n = int(FS * dur); t = t_of(n)
    f = np.linspace(f0, f1, n) * (1 + 0.02 * np.sin(2 * np.pi * 38 * t))
    saw = 2 * ((np.cumsum(f) / FS) % 1.0) - 1
    x = filt('band', [850, 1500], saw) * 1.0 + filt('band', [2100, 3000], saw) * 0.7
    rough = 0.7 + 0.3 * np.sign(np.sin(2 * np.pi * 70 * t))
    env = np.minimum(1, t / 0.012) * np.minimum(1, (dur - t) / 0.04)
    return x * rough * env

def quack():
    out = np.zeros(int(FS * 0.6))
    place(out, quack_one(560, 400, 0.17), 0.0)
    place(out, quack_one(520, 330, 0.24), 0.24)
    return out

def honk_one(f, dur):
    n = int(FS * dur); t = t_of(n)
    ff = f * (1 - 0.06 * np.exp(-t / 0.02))
    ph = phase(ff)
    reed = np.sign(np.sin(ph)) * 0.6 + (2 * ((ph / (2 * np.pi)) % 1.0) - 1) * 0.6
    x = filt('band', [500, 3200], reed)
    env = np.minimum(1, t / 0.008) * np.minimum(1, (dur - t) / 0.03)
    return x * env

def pouet():
    out = np.zeros(int(FS * 0.62))
    place(out, honk_one(392, 0.16), 0.0)
    place(out, honk_one(311, 0.30), 0.24)
    return out

def flute(f, dur):
    n = int(FS * dur); t = t_of(n)
    ph = phase(np.full(n, f) * (1 + 0.004 * np.sin(2 * np.pi * 5 * t)))
    x = np.sin(ph) + 0.12 * np.sin(2 * ph) + filt('band', [f * 0.8, f * 2.5], noise(n)) * 0.05
    env = np.minimum(1, t / 0.035) * np.exp(-np.maximum(0, t - dur * 0.45) / (dur * 0.22))
    return x * env

def cuckoo():
    out = np.zeros(int(FS * 0.95))
    place(out, flute(659.3, 0.24), 0.0)
    place(out, flute(523.3, 0.5), 0.34)
    return out

def wolf():
    a = slide(950, 2500, 0.34, 0.8)
    n = int(FS * 0.62); t = t_of(n); u = t / 0.62
    f = np.where(u < 0.35, 1300 * (2700 / 1300) ** (u / 0.35), 2700 * (650 / 2700) ** ((u - 0.35) / 0.65))
    ph = phase(f)
    b = (np.sin(ph) + 0.15 * np.sin(2 * ph)) * np.minimum(1, t / 0.03) * np.minimum(1, (0.62 - t) / 0.12)
    out = np.zeros(int(FS * 1.08))
    place(out, a, 0.0); place(out, b, 0.43)
    return out


# -- Actions -------------------------------------------------------------------
def glug():
    out = np.zeros(int(FS * 0.85))
    for i in range(5):
        dur = 0.085
        n = int(FS * dur); t = t_of(n)
        base = 260 + 55 * i + rng.uniform(-15, 15)
        f = base * (1 + 1.5 * (t / dur) ** 1.6)
        b = np.sin(phase(f)) * np.minimum(1, t / 0.006) * np.exp(-t / 0.045)
        place(out, b * (0.75 + 0.06 * i), 0.02 + i * 0.115 + rng.uniform(-0.008, 0.008))
    n = int(FS * 0.22); t = t_of(n)
    splash = filt('band', [1200, 5000], noise(n)) * np.minimum(1, t / 0.01) * np.exp(-t / 0.05) * 0.3
    place(out, splash, 0.6)
    return out

def scratch():
    """Rembobinage : « zwip » montant, pour les annulations en rafale."""
    n = int(FS * 0.32); t = t_of(n); u = t / 0.32
    f = 220 * (2600 / 220) ** (u ** 0.8)
    wob = 1 + 0.08 * np.sin(2 * np.pi * 34 * t)
    saw = 2 * ((np.cumsum(f * wob) / FS) % 1.0) - 1
    tape = filt('band', [600, 5200], noise(n)) * (0.4 + 0.6 * u)
    x = filt('low', 6500, saw * 0.55 + tape * 0.7)
    return x * np.minimum(1, t / 0.01) * np.minimum(1, (0.32 - t) / 0.04) * (0.5 + 0.5 * u)

def kaching():
    out = np.zeros(int(FS * 1.1))
    n = int(FS * 0.06); t = t_of(n)
    place(out, filt('band', [700, 4200], noise(n)) * np.exp(-t / 0.012) * 0.8, 0.0)   # « ka »
    n = int(FS * 0.95); t = t_of(n)
    bell = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in
               ((2093, 1.0, 0.30), (3140, 0.6, 0.22), (4187, 0.45, 0.16), (5290, 0.3, 0.11), (6650, 0.2, 0.08)))
    place(out, bell * 0.5, 0.09)                                                       # « ching »
    place(out, bell * 0.28, 0.17)
    return out


# -- Rythme : note de marimba (do 5), rejouée plus ou moins vite par le moteur --
def marimba():
    n = int(FS * 0.55); t = t_of(n)
    f = 523.25
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.16)
    x += 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.035)
    x += 0.12 * np.sin(2 * np.pi * 10 * f * t) * np.exp(-t / 0.012)
    x += filt('band', [1500, 5000], noise(n)) * np.exp(-t / 0.004) * 0.25
    return x


# -- Silence gêné : deux grillons ----------------------------------------------
def crickets():
    dur = 4.2
    n = int(FS * dur); t = t_of(n)
    out = np.zeros(n)
    for f, period, offset, amp in ((4350, 0.62, 0.25, 1.0), (4920, 0.87, 0.6, 0.55)):
        k = 0
        while offset + k * period < dur - 0.3:
            for p in range(3):                     # un chant = trois impulsions
                m = int(FS * 0.019); tt = t_of(m)
                pulse = np.sin(2 * np.pi * f * tt) * np.sin(np.pi * tt / 0.019) ** 2
                place(out, pulse * amp * rng.uniform(0.85, 1.0), offset + k * period + p * 0.029)
            k += 1
    night = filt('band', [2500, 7000], noise(n)) * 0.012
    env = np.minimum(1, t / 0.7) * np.minimum(1, (dur - t) / 1.0)
    return (out + night) * env


write('fx_drumroll.wav', drumroll(), loop=True)
write('fx_cymbal.wav', cymbal())
write('fx_slide_up.wav', slide(480, 1900, 0.55, 1.3))
write('fx_slide_down.wav', slide(1800, 380, 0.7, 0.8))
write('fx_boing.wav', boing())
write('fx_quack.wav', quack())
write('fx_pouet.wav', pouet())
write('fx_cuckoo.wav', cuckoo())
write('fx_wolf.wav', wolf())
write('fx_glug.wav', glug())
write('fx_scratch.wav', scratch())
write('fx_kaching.wav', kaching())
write('fx_marimba.wav', marimba())
write('fx_crickets.wav', crickets(), peak=0.6)

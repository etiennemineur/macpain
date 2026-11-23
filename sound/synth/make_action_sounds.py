#!/usr/bin/env python3
"""Synthétise les sons d'action manquants (bruit de pinceau, gomme, frappe,
forme, « oh non ») en WAV 16-bit mono. Ces bruits accompagnent le geste en
continu (boucles) ou en ponctuation (one-shot), contrairement aux réactions
de foule déjà présentes."""
import numpy as np
from scipy.signal import butter, lfilter
from scipy.io import wavfile
from pathlib import Path

FS = 44100
OUT = Path('/Users/etiennemineur/Developer/MacPaint/sound/synth')
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)

def bandpass(lo, hi, fs=FS, order=4):
    ny = 0.5 * fs
    return butter(order, [lo / ny, hi / ny], btype='band')

def highpass(lo, fs=FS, order=2):
    return butter(order, lo / (0.5 * fs), btype='high')

def lowpass(hi, fs=FS, order=2):
    return butter(order, hi / (0.5 * fs), btype='low')

def norm(x, peak=0.85):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak

def seamless_loop(x, fade=0.02):
    """Fond les 20 dernières ms dans les 20 premières pour une boucle nette."""
    n = len(x)
    f = int(FS * fade)
    if f >= n // 2:
        return x
    ramp = np.linspace(0.0, 1.0, f)
    x[:f] = x[:f] * ramp + x[-f:] * (1.0 - ramp)
    return x[:-f]

# --- 1. Bruit de pinceau/crayon (boucle, ~600 ms) : grattement vif ---
def brush_scratch():
    dur = 0.6
    n = int(FS * dur)
    t = np.arange(n) / FS
    b, a = bandpass(1100, 4800, order=6)
    x = lfilter(b, a, rng.uniform(-1, 1, n))
    # texture « scritch » : modulation rapide et irrégulière
    am = 0.55 + 0.45 * np.sin(2 * np.pi * 28 * t + rng.uniform(-1, 1, n) * 0.7)
    x = x * am
    return norm(seamless_loop(x))

# --- 2. Gomme (boucle, ~600 ms) : frottement grave « rub-rub » ---
def eraser_rub():
    dur = 0.6
    n = int(FS * dur)
    t = np.arange(n) / FS
    b, a = bandpass(140, 700, order=5)
    x = lfilter(b, a, rng.uniform(-1, 1, n))
    # rythme de frottement aller-retour ~5 Hz
    am = 0.35 + 0.65 * np.abs(np.sin(2 * np.pi * 2.5 * t))
    x = x * am
    return norm(seamless_loop(x))

# --- 3. Frappe de lettre (one-shot, ~70 ms) : tic sec ---
def type_click():
    dur = 0.07
    n = int(FS * dur)
    t = np.arange(n) / FS
    b, a = highpass(1800, order=3)
    tick = lfilter(b, a, rng.uniform(-1, 1, n))
    # petit corps grave
    bl, al = lowpass(320, order=2)
    thump = lfilter(bl, al, rng.uniform(-1, 1, n))
    x = tick + 0.8 * thump
    env = np.exp(-t / 0.012)          # attaque vive, décroissance rapide
    x = x * env
    return norm(x, 0.9)

# --- 4. Forme terminée (one-shot, ~260 ms) : « pop » qui monte ---
def shape_pop():
    dur = 0.26
    n = int(FS * dur)
    t = np.arange(n) / FS
    f = 300 + 900 * (t / dur) ** 1.5       # glissement vers le haut
    phase = 2 * np.pi * np.cumsum(f) / FS
    tone = np.sin(phase)
    b, a = highpass(1200, order=2)
    noise = lfilter(b, a, rng.uniform(-1, 1, n))
    x = 0.7 * tone + 0.5 * noise * np.exp(-t / 0.04)
    env = np.exp(-t / 0.09) * (1 - np.exp(-t / 0.004))
    return norm(x * env, 0.9)

# --- 5. « Oh non » (one-shot, ~850 ms) : voyelle « oh » qui descend ---
def oh_no():
    dur = 0.85
    n = int(FS * dur)
    t = np.arange(n) / FS
    f0 = np.linspace(235, 105, n) * (1 + 0.02 * np.sin(2 * np.pi * 5.2 * t))
    phase = 2 * np.pi * np.cumsum(f0) / FS
    saw = 2 * ((phase / (2 * np.pi)) % 1.0) - 1.0
    # deux formants du « oh » : F1 ~550, F2 ~900
    b1, a1 = bandpass(420, 700, order=3)
    b2, a2 = bandpass(760, 1080, order=3)
    f1 = lfilter(b1, a1, saw)
    f2 = lfilter(b2, a2, saw)
    x = 0.55 * f1 + 0.45 * f2
    # résonance nasale « n » sur la fin (le « nonnn » traînant)
    bn, an = bandpass(250, 900, order=2)
    nasal = lfilter(bn, an, saw) * 0.25
    gate = np.clip((t - 0.55) / 0.15, 0, 1)
    x = x + nasal * gate
    env = (1 - np.exp(-t / 0.02)) * np.exp(-t / 0.5)
    return norm(x * env, 0.9)

sounds = {
    'brush_scratch.wav': brush_scratch,
    'eraser_rub.wav': eraser_rub,
    'type_click.wav': type_click,
    'shape_pop.wav': shape_pop,
    'oh_no.wav': oh_no,
}
for name, fn in sounds.items():
    x = fn()
    y = (x * 32767).astype(np.int16)
    wavfile.write(str(OUT / name), FS, y)
    print(f'{name}  {len(x)/FS:.2f}s  {np.max(np.abs(x)):.2f}')

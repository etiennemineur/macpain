#!/usr/bin/env python3
"""Génère des sons abstraits et rigolos, distincts par outil :
   - un son de sélection par pictogramme (15),
   - un bruit de dessin en boucle par outil de dessin (10).
Synthèse procédurale (numpy/scipy), WAV 16-bit mono, CC0."""
import numpy as np
from scipy.signal import butter, lfilter
from scipy.io import wavfile
from pathlib import Path

FS = 44100
OUT = Path('/Users/etiennemineur/Developer/MacPaint/sound/tool')
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(11)

def bp(lo, hi, order=4, fs=FS):
    lo, hi = sorted((lo, hi))
    ny = 0.5 * fs
    return butter(order, [lo / ny, hi / ny], btype='band')

def hp(lo, order=2, fs=FS):
    return butter(order, lo / (0.5 * fs), btype='high')

def lp(hi, order=2, fs=FS):
    return butter(order, hi / (0.5 * fs), btype='low')

def norm(x, peak=0.85):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak

def write(name, x):
    wavfile.write(str(OUT / name), FS, (norm(x) * 32767).astype(np.int16))
    print(f'{name}  {len(x)/FS:.2f}s')

def seamless(x, fade=0.02):
    n = len(x)
    f = int(FS * fade)
    if f >= n // 2:
        return x
    ramp = np.linspace(0.0, 1.0, f)
    x[:f] = x[:f] * ramp + x[-f:] * (1.0 - ramp)
    return x[:-f]

def t_of(n):
    return np.arange(n) / FS

# ----------------------------------------------------------------------
# Sélections : petits sons abstraits, un par pictogramme.
# ----------------------------------------------------------------------
def sel_sweep_noise(lo, hi, dur, up=True):
    n = int(FS * dur); t = t_of(n)
    b, a = bp(lo, hi, order=4)
    x = lfilter(b, a, rng.uniform(-1, 1, n))
    env = (1 - np.exp(-t / 0.02)) * np.exp(-t / (dur * 0.5))
    return x * env

def sel_blip(f0, f1, dur, order=2, env_exp=0.5):
    n = int(FS * dur); t = t_of(n)
    f = np.linspace(f0, f1, n)
    ph = 2 * np.pi * np.cumsum(f) / FS
    x = np.sin(ph)
    if order >= 2:
        x = np.sign(x) * (np.abs(x) ** 0.5)  # timbre plus riche
    env = (1 - np.exp(-t / 0.005)) * np.exp(-t / (dur * env_exp))
    return x * env

def sel_click(dur=0.06, hi=3200):
    n = int(FS * dur); t = t_of(n)
    b, a = hp(1800, order=3)
    x = lfilter(b, a, rng.uniform(-1, 1, n))
    bl, al = lp(hi, order=2)
    x = x + 0.8 * lfilter(bl, al, rng.uniform(-1, 1, n))
    return x * np.exp(-t / 0.012)

def sel_twing(f=520, dur=0.25):
    n = int(FS * dur); t = t_of(n)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2.01 * f * t)
    x += 0.2 * np.sin(2 * np.pi * 3.02 * f * t)
    return x * np.exp(-t / 0.06)

def sel_bonk(f=160, dur=0.15):
    n = int(FS * dur); t = t_of(n)
    f = f * np.exp(-t * 6)  # chute de hauteur
    ph = 2 * np.pi * np.cumsum(f) / FS
    return np.sign(np.sin(ph)) * np.exp(-t / 0.05)

def sel_boing(dur=0.32):
    n = int(FS * dur); t = t_of(n)
    f = 180 + 500 * np.sin(2 * np.pi * 3.2 * t) * np.exp(-t * 4)
    ph = 2 * np.pi * np.cumsum(f) / FS
    x = np.sin(ph) + 0.3 * np.sin(2 * ph)
    return x * (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.3)

def sel_dings(note, count=3, dur=0.35):
    n = int(FS * dur); out = np.zeros(n)
    per = int(FS * 0.11)
    for i in range(count):
        b = int(i * per)
        if b >= n:
            break
        seg = min(per, n - b)
        tt = np.arange(seg) / FS
        f = note[i] if isinstance(note, list) else note
        out[b:b + seg] += np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.05)
    return out

def sel_squeak(dur=0.28):
    n = int(FS * dur); t = t_of(n)
    f = 1500 + 900 * np.sin(2 * np.pi * 11 * t) + 300 * np.sin(2 * np.pi * 2.3 * t)
    ph = 2 * np.pi * np.cumsum(f) / FS
    x = np.sin(ph) + 0.5 * np.sin(2 * ph)
    return x * (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.12)

# 15 sons de sélection
write('sel_lasso.wav', sel_sweep_noise(500, 3000, 0.28, up=True))
write('sel_marquee.wav', np.concatenate([sel_click(), np.zeros(int(FS*0.05)), sel_click()]))
write('sel_eraser.wav', sel_squeak())
write('sel_pencil.wav', sel_click(0.05, 4000))
write('sel_brush.wav', sel_sweep_noise(2500, 700, 0.28, up=False))
write('sel_bucket.wav', sel_blip(900, 220, 0.3))
write('sel_spray.wav', sel_sweep_noise(2000, 6000, 0.3, up=True))
write('sel_line.wav', sel_twing(520, 0.25))
write('sel_rect.wav', sel_bonk(160, 0.16))
write('sel_rrect.wav', np.concatenate([sel_bonk(160, 0.12), np.zeros(int(FS*0.04)), sel_bonk(210, 0.12)]))
write('sel_oval.wav', sel_boing())
write('sel_polygon.wav', sel_dings([660, 880, 1320], 3))
write('sel_freeform.wav', sel_sweep_noise(1200, 5000, 0.26, up=False))
write('sel_text.wav', sel_dings([1560], 1, 0.3))
write('sel_hand.wav', sel_bonk(120, 0.14))

# ----------------------------------------------------------------------
# Dessin : une boucle de texture distincte par outil de dessin.
# ----------------------------------------------------------------------
def loop_noise(lo, hi, dur, am_rate, am_depth, order=5):
    n = int(FS * dur); t = t_of(n)
    b, a = bp(lo, hi, order=order)
    x = lfilter(b, a, rng.uniform(-1, 1, n))
    am = 1.0 - am_depth + am_depth * np.abs(np.sin(2 * np.pi * am_rate * t))
    return seamless(x * am)

def loop_clicks(dur=0.6, rate=6, hi=3800):
    n = int(FS * dur); out = np.zeros(n)
    per = int(FS / rate)
    i = 0
    while i < n:
        seg = min(int(FS * 0.05), n - i)
        out[i:i + seg] += sel_click(0.05, hi)
        i += per
    return seamless(out)

write('draw_pencil.wav', loop_noise(3800, 8000, 0.6, 30, 0.5, order=6))
write('draw_brush.wav', loop_noise(700, 2200, 0.6, 12, 0.4))
write('draw_spray.wav', loop_noise(1200, 6000, 0.6, 3, 0.2))
write('draw_eraser.wav', loop_noise(140, 500, 0.6, 2.5, 0.65))
write('draw_line.wav', loop_noise(900, 1400, 0.6, 6, 0.35))
write('draw_rect.wav', loop_noise(180, 350, 0.6, 8, 0.6))
write('draw_rrect.wav', loop_noise(250, 450, 0.6, 8, 0.5))
write('draw_oval.wav', loop_noise(500, 1500, 0.6, 4, 0.4))
write('draw_polygon.wav', loop_clicks(0.6, 6))
write('draw_freeform.wav', loop_noise(2500, 6000, 0.6, 25, 0.55, order=6))

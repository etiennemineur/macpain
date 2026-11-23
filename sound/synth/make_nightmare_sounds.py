#!/usr/bin/env python3
"""Bruitages du niveau Nightmare! : sons ORIGINAUX dans l'esprit des jeux de
tir des années 1990 (aucun son repris d'un jeu existant). Synthèse numpy, puis
passage en 11 kHz / 8 bits comme les échantillons de l'époque. Plus le bruit de
lecteur de disquette de l'enregistrement en Ultra-Violence. CC0."""
import numpy as np
from scipy.signal import butter, lfilter
from scipy.io import wavfile
from pathlib import Path

FS = 44100
OUT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(666)

def filt(kind, f, x, order=2):
    b, a = butter(order, np.array(f, dtype=float) / (FS / 2), btype=kind)
    return lfilter(b, a, x)

def crush(x, hold=4, bits=8):
    x = x / (np.max(np.abs(x)) or 1)
    x = np.repeat(x[::hold], hold)[:len(x)]            # 11 kHz
    q = 2 ** (bits - 1)
    return np.round(x * q) / q

def write(name, x, peak=0.85, raw=False):
    x = np.asarray(x, dtype=float)
    if not raw:
        x = crush(x)
    n = int(FS * 0.004)
    x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n)
    x = x / (np.max(np.abs(x)) or 1) * peak
    wavfile.write(str(OUT / name), FS, (x * 32767).astype(np.int16))
    print(f'{name:22s} {len(x) / FS:.2f}s')

def t_of(d):
    return np.arange(int(FS * d)) / FS

def saw(f):
    return 2 * ((np.cumsum(f) / FS) % 1.0) - 1

def click(at, total, lo=900, hi=4200, d=0.018):
    out = np.zeros(int(FS * total)); t = t_of(d)
    seg = filt('band', [lo, hi], rng.uniform(-1, 1, len(t))) * np.exp(-t / (d / 3))
    i = int(at * FS); out[i:i + len(seg)] += seg
    return out

# Coup de fusil : détonation, puis rechargement « clac-clac ».
t = t_of(0.62)
blast = filt('low', 2800, rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.085)
thump = np.sin(2 * np.pi * np.cumsum(120 * np.exp(-t * 14) + 45) / FS) * np.exp(-t / 0.11) * 1.3
write('nm_shot.wav', np.tanh(2.5 * (blast * 1.4 + thump)) + 0.55 * click(0.34, 0.62) + 0.7 * click(0.46, 0.62, 600, 3000))

# Rechargement seul (changement d'outil).
write('nm_pump.wav', click(0.0, 0.2) + 0.9 * click(0.11, 0.2, 600, 3000))

# Grognement de monstre : scie grave, rugueuse, qui descend.
def growl(d, f0, f1, rough):
    t = t_of(d)
    f = f0 * (f1 / f0) ** (t / d) * (1 + 0.04 * np.sin(2 * np.pi * 9 * t))
    x = saw(f) + 0.6 * saw(f * 1.51)
    x = filt('band', [220, 1100], x) * 2 + filt('band', [1500, 2600], x) * 0.6
    x *= 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * rough * t))
    x += filt('band', [300, 2000], rng.uniform(-1, 1, len(t))) * 0.25
    return np.tanh(3 * x) * np.minimum(1, t / 0.03) * np.minimum(1, (d - t) / 0.12)

write('nm_growl.wav', growl(0.85, 78, 44, 27))
write('nm_roar.wav', growl(1.5, 120, 40, 19))

# « Ouf ! » : le joueur encaisse.
t = t_of(0.24)
f = 190 * (105 / 190) ** (t / 0.24)
ugh = filt('band', [400, 1500], saw(f)) * 2 + filt('band', [500, 2500], rng.uniform(-1, 1, len(t))) * 0.3
write('nm_pain.wav', np.tanh(2 * ugh) * np.minimum(1, t / 0.01) * np.exp(-t / 0.11))

# Porte blindée : choc sourd et résonance métallique.
t = t_of(0.6)
door = np.sin(2 * np.pi * np.cumsum(70 * np.exp(-t * 5) + 38) / FS) * np.exp(-t / 0.16) * 1.4
door += sum(np.sin(2 * np.pi * fq * t) * np.exp(-t / dd) for fq, dd in ((412, 0.2), (667, 0.13), (1130, 0.08))) * 0.18
door += filt('band', [700, 3500], rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.02) * 0.6
write('nm_door.wav', np.tanh(2 * door))

# Lecteur de disquette 3,5 pouces : pas du moteur, par rafales (boucle de 1,2 s).
n = int(FS * 1.2); out = np.zeros(n); tt = np.arange(n) / FS
for start, dur, hz in ((0.0, 0.22, 86), (0.3, 0.1, 110), (0.46, 0.3, 74), (0.86, 0.07, 130), (0.98, 0.16, 92)):
    i0, i1 = int(start * FS), int((start + dur) * FS)
    ph = ((tt[i0:i1] - start) * hz) % 1.0
    out[i0:i1] += np.where(ph < 0.12, 1.0, -0.15)                   # impulsions du moteur pas à pas
out = filt('band', [300, 4500], out) + filt('band', [2000, 6000], rng.uniform(-1, 1, n)) * 0.03
out = crush(out)
wavfile.write(str(OUT / 'fx_floppy.wav'), FS, (out / np.max(np.abs(out)) * 0.6 * 32767).astype(np.int16))
print('fx_floppy.wav          1.20s (boucle)')

# Cris : une voix aiguë qui monte puis s'effondre, et un « aaargh » grave.
def scream(d, f0, f1, f2, wob):
    t = t_of(d); u = t / d
    f = np.where(u < 0.3, f0 * (f1 / f0) ** (u / 0.3), f1 * (f2 / f1) ** ((u - 0.3) / 0.7)) * (1 + 0.05 * np.sin(2 * np.pi * wob * t))
    x = saw(f) + 0.5 * saw(f * 2.01)
    x = filt('band', [900, 1900], x) * 2 + filt('band', [2400, 3600], x) * 1.2
    x += filt('band', [1500, 5000], rng.uniform(-1, 1, len(t))) * 0.3 * u
    return np.tanh(3 * x) * np.minimum(1, t / 0.02) * np.minimum(1, (d - t) / 0.15)

write('nm_scream.wav', scream(0.8, 520, 1150, 430, 11))
write('nm_scream2.wav', scream(0.95, 260, 420, 150, 7))

# Explosion : souffle grave, long, avec des éclats.
t = t_of(1.4)
boom = filt('low', 900, rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.4) * 2
boom += np.sin(2 * np.pi * np.cumsum(90 * np.exp(-t * 5) + 32) / FS) * np.exp(-t / 0.3) * 1.6
crack = filt('band', [1200, 5000], rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.03)
boom += crack + 0.5 * filt('band', [700, 3000], rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.25) * (rng.uniform(0, 1, len(t)) > 0.985)
write('nm_boom.wav', np.tanh(2.2 * boom))


# ---------------------------------------------------------------------------
# Arsenal : rechargements, balles, explosions (toujours des sons originaux).
# ---------------------------------------------------------------------------
def mix(total, *parts):
    out = np.zeros(int(FS * total))
    for at, seg in parts:
        i = int(at * FS); seg = seg[:max(0, len(out) - i)]
        out[i:i + len(seg)] += seg
    return out

def clack(lo=700, hi=3800, d=0.03, ring=0, amp=1.0):
    """Choc métallique : bruit filtré très court, avec une résonance éventuelle."""
    t = t_of(d + 0.08)
    x = filt('band', [lo, hi], rng.uniform(-1, 1, len(t))) * np.exp(-t / (d / 3))
    if ring:
        x += 0.35 * np.sin(2 * np.pi * ring * t) * np.exp(-t / 0.02) + 0.2 * np.sin(2 * np.pi * ring * 2.7 * t) * np.exp(-t / 0.012)
    return x * amp

def slide_metal(d=0.09, lo=1200, hi=5000, up=True):
    """Glissière : souffle métallique qui monte ou descend."""
    t = t_of(d); n = rng.uniform(-1, 1, len(t))
    env = (t / d) if up else (1 - t / d)
    return filt('band', [lo, hi], n) * env * 0.6

def gun(d, decay, low, body_f, drive=2.5):
    t = t_of(d)
    blast = filt('low', low, rng.uniform(-1, 1, len(t))) * np.exp(-t / decay)
    crack_ = filt('high', 2500, rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.006) * 0.8
    thump = np.sin(2 * np.pi * np.cumsum(body_f * np.exp(-t * 18) + 50) / FS) * np.exp(-t / (decay * 1.2)) * 1.2
    return np.tanh(drive * (blast * 1.4 + thump + crack_))

# Pompe de fusil : « tchk-tchk » lourd, avec glissière.
write('nm_cock.wav', mix(0.42, (0.0, slide_metal(0.07, up=False)), (0.06, clack(500, 2800, 0.04, 820, 1.2)),
                         (0.2, slide_metal(0.07, up=True)), (0.27, clack(700, 3600, 0.035, 1100, 1.3))))
# Chargeur : éjection, chargeur neuf enfoncé, culasse relâchée.
write('nm_reload.wav', mix(0.85, (0.0, clack(900, 4200, 0.02, 1500, 0.8)), (0.07, slide_metal(0.1, 800, 3000, False)),
                           (0.33, clack(400, 2400, 0.05, 620, 1.3)), (0.38, clack(1200, 5000, 0.015, 0, 0.6)),
                           (0.58, slide_metal(0.06, 1500, 6000, True)), (0.65, clack(800, 4500, 0.03, 1250, 1.4))))
# Cartouches glissées une à une.
write('nm_shells.wav', mix(0.62, *[(0.02 + i * 0.145, clack(900 + 150 * i, 4000, 0.02, 1300 + 120 * i, 0.9)) for i in range(4)]))
# Douilles qui tombent au sol.
def casing(f):
    t = t_of(0.12)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.52 * t)) * np.exp(-t / 0.03)
write('nm_casings.wav', mix(0.8, *[(a, casing(f) * g) for a, f, g in
      ((0.0, 3900, 1), (0.09, 4400, 0.7), (0.15, 4100, 0.5), (0.3, 3600, 0.9), (0.37, 4700, 0.6), (0.41, 4300, 0.4), (0.55, 4000, 0.5), (0.6, 4500, 0.3))]),
      raw=True, peak=0.6)

# Pistolet : coup sec.
write('nm_pistol.wav', gun(0.28, 0.035, 3800, 180))
# Mitrailleuse : rafale de six coups.
burst = mix(0.75, *[(i * 0.085, gun(0.2, 0.028, 3200, 150 + 12 * (i % 2)) * (1 - 0.05 * i)) for i in range(6)])
write('nm_chaingun.wav', burst)
# Double canon : deux détonations presque ensemble, énormes.
write('nm_double.wav', mix(0.9, (0.0, gun(0.8, 0.12, 2400, 110, 3.2)), (0.045, gun(0.8, 0.13, 2000, 95, 3.2))))
# Fusil à plasma : tir électrique, qui descend.
t = t_of(0.3)
zap = np.sign(np.sin(2 * np.pi * np.cumsum(1900 * np.exp(-t * 9) + 240) / FS)) * np.exp(-t / 0.09)
zap += 0.5 * filt('band', [2000, 6000], rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.03)
write('nm_plasma.wav', zap)
# Balle qui ricoche : claquement, puis sifflement qui s'éloigne.
t = t_of(0.55)
whine = np.sin(2 * np.pi * np.cumsum(3400 * np.exp(-t * 3.2) + 500 + 90 * np.sin(2 * np.pi * 31 * t)) / FS) * np.exp(-t / 0.2) * np.minimum(1, t / 0.01)
write('nm_ricochet.wav', mix(0.55, (0.0, clack(1500, 6000, 0.012, 2600, 1.2)), (0.01, whine * 0.8)), raw=True)
# Balle qui passe : sifflement bref.
t = t_of(0.22)
zip_ = filt('band', [1800, 7000], rng.uniform(-1, 1, len(t))) * np.sin(np.pi * t / 0.22) ** 3
zip_ *= 1 + 0.6 * np.sin(2 * np.pi * np.cumsum(1400 - 3500 * t) / FS)
write('nm_whizz.wav', zip_, raw=True)
# Impact de balle dans le métal.
write('nm_impact.wav', mix(0.3, (0.0, clack(600, 5000, 0.03, 1750, 1.4)), (0.0, gun(0.2, 0.02, 1500, 220, 1.5) * 0.5)))

# Roquette : départ soufflé, vol, explosion.
t = t_of(0.5)
whoosh = filt('band', [300, 2600], rng.uniform(-1, 1, len(t))) * np.minimum(1, t / 0.03) * (0.5 + 0.5 * t / 0.5)
whoosh += 0.4 * saw(110 + 160 * t / 0.5) * np.minimum(1, t / 0.05)
def explosion(d, decay, low, f0, debris=0.99):
    t = t_of(d)
    b = filt('low', low, rng.uniform(-1, 1, len(t))) * np.exp(-t / decay) * 2
    b += np.sin(2 * np.pi * np.cumsum(f0 * np.exp(-t * 6) + 30) / FS) * np.exp(-t / (decay * 0.8)) * 1.7
    b += filt('band', [1200, 5000], rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.025)
    b += 0.6 * filt('band', [600, 3200], rng.uniform(-1, 1, len(t))) * np.exp(-t / (decay * 0.7)) * (rng.uniform(0, 1, len(t)) > debris)
    return np.tanh(2.4 * b)
write('nm_rocket.wav', mix(1.6, (0.0, whoosh * 0.7), (0.48, explosion(1.1, 0.3, 1100, 100))))
# Baril : explosion courte et sèche.
write('nm_barrel.wav', explosion(0.7, 0.16, 1500, 130, 0.975))
# Grosse explosion, avec un écho qui roule.
big = explosion(1.9, 0.5, 700, 75, 0.985)
write('nm_bigboom.wav', mix(2.2, (0.0, big), (0.24, big * 0.35), (0.5, big * 0.16)))

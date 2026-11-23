#!/usr/bin/env python3
"""Tous les bruitages synthétiques de MacPaint, façon console 8 bits.

Trois « canaux » comme sur une puce sonore des années 1980 :
  - onde carrée à rapport cyclique 12,5 / 25 / 50 % ;
  - triangle en escalier à 16 niveaux ;
  - bruit pseudo-aléatoire (registre à décalage), plus ou moins grave.
Hauteur et volume ne changent qu'à chaque image (60 fois par seconde) et le
volume n'a que 16 niveaux : c'est ce qui donne les arpèges et les glissades
en marches d'escalier typiques.

Les rires et applaudissements réels (MP3) ne sont pas touchés. Les noms de
fichiers sont ceux qu'attend satire.js. WAV 16 bits mono 44,1 kHz, CC0.
Les versions précédentes sont conservées dans sound/classique/."""
import numpy as np
from scipy.io import wavfile
from pathlib import Path

FS = 44100
FR = FS // 60                      # 735 échantillons : une image
OUT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(8)


def hz(m):                         # numéro de note MIDI → fréquence
    return 440.0 * 2 ** ((m - 69) / 12)


# -- Canaux --------------------------------------------------------------------
def chan(frames, wave='p50'):
    """frames : liste de (fréquence, volume 0-15), une entrée par image."""
    out = np.zeros(len(frames) * FR)
    ph = 0.0
    for i, (f, v) in enumerate(frames):
        if v <= 0 or f <= 0:
            ph = 0.0
            continue
        p = (ph + f * np.arange(FR) / FS) % 1.0
        ph = (ph + f * FR / FS) % 1.0
        if wave == 'tri':
            s = np.round((2 * np.abs(2 * p - 1) - 1) * 7.5) / 7.5
        else:
            duty = {'p12': 0.125, 'p25': 0.25, 'p50': 0.5}[wave]
            s = np.where(p < duty, 1.0, -1.0)
        out[i * FR:(i + 1) * FR] = s * (v / 15.0)
    return out

def noise(frames, short=False):
    """frames : liste de (période en échantillons, volume 0-15)."""
    out = np.zeros(len(frames) * FR)
    reg = 1
    tap = 6 if short else 1        # mode court : bruit métallique
    val, left = 1.0, 0
    for i, (period, v) in enumerate(frames):
        seg = np.empty(FR)
        for k in range(FR):
            if left <= 0:
                bit = (reg ^ (reg >> tap)) & 1
                reg = (reg >> 1) | (bit << 14)
                val = 1.0 if reg & 1 else -1.0
                left = period
            seg[k] = val
            left -= 1
        out[i * FR:(i + 1) * FR] = seg * (v / 15.0)
    return out


# -- Fabrication des listes d'images -------------------------------------------
def fade(n, v0, v1):
    return [int(round(v0 + (v1 - v0) * i / max(1, n - 1))) for i in range(n)]

def hold(f, n, v0=12, v1=None, vib=0.0, vib_rate=7.0):
    vols = fade(n, v0, v0 if v1 is None else v1)
    return [(f * (1 + vib * np.sin(2 * np.pi * vib_rate * i / 60)), vols[i]) for i in range(n)]

def glide(f0, f1, n, v0=12, v1=None, curve=1.0):
    vols = fade(n, v0, v0 if v1 is None else v1)
    return [(f0 * (f1 / f0) ** ((i / max(1, n - 1)) ** curve), vols[i]) for i in range(n)]

def arp(notes, each, v0=12, v1=None, last=None):
    total = len(notes) * each + ((last or each) - each)
    vols = fade(total, v0, v0 if v1 is None else v1)
    frames = []
    for i, m in enumerate(notes):
        n = last if (last and i == len(notes) - 1) else each
        frames += [(hz(m), 0)] * n
    return [(f, vols[i]) for i, (f, _) in enumerate(frames)]

def rest(n):
    return [(0, 0)] * n

def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out

def at(frame, x):
    return np.concatenate([np.zeros(frame * FR), x])


def write(name, x, rms=0.16, peak=0.8, loop=False):
    x = np.asarray(x, dtype=float)
    if not loop:                   # 2 ms de garde : pas de clic de coupure
        g = int(FS * 0.002)
        x = np.concatenate([x, np.zeros(g)])
        x[-2 * g:-g] *= np.linspace(1, 0, g)
    level = np.sqrt(np.mean(x ** 2)) or 1.0
    x = x * (rms / level)
    top = np.max(np.abs(x))
    if top > peak:
        x *= peak / top
    wavfile.write(str(OUT / name), FS, (x * 32767).astype(np.int16))
    print(f'{name:32s} {len(x) / FS:.2f}s')


# ==============================================================================
# 1. Sélection d'un outil : un petit motif par pictogramme
# ==============================================================================
write('sel_lasso.wav', chan(arp([72, 76, 79, 84], 2, 12, 6, last=6), 'p25'))
write('sel_marquee.wav', chan(hold(hz(81), 3, 12, 8) + rest(3) + hold(hz(88), 4, 12, 4), 'p50'))
write('sel_eraser.wav', chan(glide(1900, 900, 14, 12, 3) , 'p12') * 1.0
      + 0.0 * 0)
write('sel_pencil.wav', mix(noise([(3, 12), (3, 6)]), chan(hold(hz(96), 2, 10, 4), 'p12')))
write('sel_brush.wav', chan(glide(640, 190, 14, 14, 4), 'tri'))
write('sel_bucket.wav', chan(glide(520, 150, 8, 12, 9) + glide(180, 420, 6, 10, 2), 'p50'))
write('sel_spray.wav', noise([(max(2, 22 - 2 * i), min(13, 4 + i)) for i in range(10)] + [(2, v) for v in fade(6, 12, 1)]))
write('sel_line.wav', chan(glide(hz(72), hz(74), 4, 12, 12) + hold(hz(74), 10, 12, 2), 'p25'))
write('sel_rect.wav', chan(hold(hz(48), 4, 14, 8) + rest(1) + hold(hz(48), 4, 12, 3), 'p50'))
write('sel_rrect.wav', chan(arp([48, 52, 55], 4, 14, 4), 'p50'))
write('sel_oval.wav', chan([(260 * (1 + 0.5 * np.sin(2 * np.pi * i / 6) * np.exp(-i / 9)), v)
                            for i, v in enumerate(fade(18, 13, 2))], 'p50'))
write('sel_polygon.wav', chan(arp([76, 83, 88], 4, 12, 3, last=8), 'p12'))
write('sel_freeform.wav', chan([(hz(int(rng.choice([72, 74, 76, 79, 81, 84, 86]))), v) for v in fade(14, 12, 3)], 'p25'))
write('sel_text.wav', chan(hold(hz(100), 3, 13, 10) + hold(hz(100), 12, 7, 1), 'p12'))
write('sel_hand.wav', mix(chan(glide(130, 55, 8, 15, 4), 'tri'), noise([(40, 8), (60, 3)])))

# ==============================================================================
# 2. Texture du geste : boucles de 36 images exactement (0,6 s)
# ==============================================================================
def loop_noise(pattern):                         # pattern : (période, volume) répété
    return noise([pattern[i % len(pattern)] for i in range(36)])

def loop_tone(notes, each, wave, vols):
    frames = []
    i = 0
    while len(frames) < 36:
        frames += [(hz(notes[i % len(notes)]), vols[k % len(vols)]) for k in range(each)]
        i += 1
    return chan(frames[:36], wave)

write('draw_pencil.wav', loop_noise([(2, 9), (2, 3)]), rms=0.1, loop=True)
write('draw_brush.wav', mix(loop_tone([45, 45, 47], 3, 'tri', [12, 9, 6]), 0.35 * loop_noise([(14, 6), (14, 3), (14, 0)])), rms=0.11, loop=True)
write('draw_spray.wav', loop_noise([(5, 9), (4, 10), (5, 8), (6, 9), (4, 7), (5, 10)]), rms=0.1, loop=True)
# draw_eraser.wav : bruit réaliste, fabriqué par make_eraser_sound.py (pas ici).
write('draw_line.wav', loop_tone([69, 71], 3, 'p25', [9, 7, 5]), rms=0.09, loop=True)
write('draw_rect.wav', loop_tone([48, 55], 6, 'p50', [10, 8, 6, 4, 3, 2]), rms=0.09, loop=True)
write('draw_rrect.wav', loop_tone([48, 52, 55], 4, 'p50', [10, 7, 5, 3]), rms=0.09, loop=True)
write('draw_oval.wav', chan([(330 * (1 + 0.25 * np.sin(2 * np.pi * i / 12)), 8) for i in range(36)], 'tri'), rms=0.1, loop=True)
write('draw_polygon.wav', mix(loop_tone([84], 6, 'p12', [10, 3, 0, 0, 0, 0]), loop_noise([(3, 6), (3, 0), (3, 0), (3, 0), (3, 0), (3, 0)])), rms=0.08, loop=True)
write('draw_freeform.wav', loop_tone([72, 76, 79, 74, 81, 76, 84, 79, 72, 81, 74, 86], 3, 'p25', [8, 6, 4]), rms=0.09, loop=True)

# ==============================================================================
# 3. Ponctuations
# ==============================================================================
write('type_click.wav', mix(chan(hold(1250, 1, 12) + hold(1250, 1, 4), 'p25'), noise([(2, 8)])), rms=0.12)
write('shape_pop.wav', chan(glide(300, 950, 5, 13, 10) + hold(950, 3, 6, 1), 'p50'))
write('oh_no.wav', chan(hold(hz(64), 12, 12, 11, vib=0.012) + glide(hz(64), hz(57), 10, 11, 10)
                        + hold(hz(57), 26, 10, 1, vib=0.02, vib_rate=5), 'p25'))

# ==============================================================================
# 4. Surprises, suspense, actions
# ==============================================================================
def drumroll():
    out = np.zeros(44000)                        # 22 coups de 2000 échantillons : boucle exacte
    reg = 1
    for i in range(22):
        n = 1500
        seg = np.empty(n); val = 1.0
        for k in range(n):
            if k % 4 == 0:
                bit = (reg ^ (reg >> 1)) & 1
                reg = (reg >> 1) | (bit << 14)
                val = 1.0 if reg & 1 else -1.0
            seg[k] = val
        env = np.floor(np.exp(-np.arange(n) / 420.0) * 15) / 15
        out[i * 2000:i * 2000 + n] += seg * env * (1.0 if i % 2 == 0 else 0.75)
    return out

write('fx_drumroll.wav', drumroll(), rms=0.12, loop=True)
write('fx_cymbal.wav', mix(noise([(2, v) for v in fade(70, 15, 0)], short=False),
                           0.5 * noise([(9, v) for v in fade(20, 12, 0)], short=True),
                           0.8 * chan(glide(160, 45, 6, 15, 6), 'tri'),
                           0.6 * at(2, chan(arp([72, 76, 79, 84], 3, 12, 2, last=30), 'p25'))))
write('fx_slide_up.wav', chan(glide(hz(60), hz(86), 30, 11, 12, 1.3) + hold(hz(86), 4, 10, 2), 'p50'))
write('fx_slide_down.wav', chan(glide(hz(86), hz(55), 36, 12, 9, 0.8) + hold(hz(55), 6, 8, 1), 'p50'))
write('fx_boing.wav', chan([(150 * (1 + 0.9 * np.exp(-i / 14) * np.sin(2 * np.pi * i / (5 - i / 14))), v)
                            for i, v in enumerate(fade(42, 14, 1))], 'p50'))
write('fx_quack.wav', chan(glide(560, 400, 9, 13, 9) + rest(5) + glide(520, 330, 13, 13, 4), 'p12')
      * np.resize(np.where(np.arange(630) < 380, 1.0, 0.45), 27 * FR))
write('fx_pouet.wav', chan(hold(hz(67), 9, 13, 11) + rest(4) + hold(hz(63), 17, 13, 3), 'p25')
      * np.resize(np.where(np.arange(1470) < 1000, 1.0, 0.6), 30 * FR))
write('fx_cuckoo.wav', chan(hold(hz(88), 13, 13, 6) + rest(6) + hold(hz(84), 28, 13, 1), 'tri'))
write('fx_wolf.wav', chan(glide(950, 2500, 18, 10, 12) + rest(5) + glide(1300, 2700, 12, 11, 12)
                          + glide(2700, 650, 24, 12, 2), 'p50'))
write('fx_glug.wav', mix(*[at(1 + i * 7, chan(glide(240 + 60 * i, 700 + 110 * i, 5, 13, 6), 'tri')) for i in range(5)],
                         at(37, noise([(6, v) for v in fade(10, 8, 0)]))))
write('fx_scratch.wav', mix(noise([(max(2, 30 - 2 * i), min(12, 3 + i)) for i in range(15)]),
                            0.7 * chan(glide(220, 2600, 15, 6, 12, 0.8), 'p25')) , rms=0.14)
write('fx_kaching.wav', mix(noise([(4, 12), (4, 5)]),
                            at(3, chan(hold(hz(83), 4, 13) + hold(hz(88), 46, 13, 0), 'p50'))))
write('fx_marimba.wav', chan(hold(523.25, 2, 15, 12) + hold(523.25, 26, 10, 0), 'p25'))

def crickets():
    total = int(4.2 * 60)
    frames = [(0, 0)] * total
    for start, period, f, vol in ((15, 37, 4350, 9), (36, 52, 4920, 5)):
        k = start
        while k < total - 20:
            for p in range(3):                   # un chant = trois impulsions
                frames[k + p * 2] = (f, vol)
            k += period
    env = np.minimum(1, np.arange(total * FR) / (0.7 * FS)) * np.minimum(1, (total * FR - np.arange(total * FR)) / (1.0 * FS))
    return chan(frames, 'p12') * env

write('fx_crickets.wav', crickets(), rms=0.035, peak=0.5)

# ==============================================================================
# 5. Ponctuations de plateau télé, version borne d'arcade
# ==============================================================================
# « Wah-wah-wah-waaah » : la défaite.
write('gameshow_sad_trombone.wav', chan(
    hold(hz(62), 20, 13, 11, vib=0.01) + rest(3) + hold(hz(61), 20, 13, 11, vib=0.01) + rest(3)
    + hold(hz(60), 20, 13, 11, vib=0.012) + rest(3)
    + hold(hz(59), 30, 13, 12, vib=0.025, vib_rate=5.5) + glide(hz(59), hz(52), 50, 12, 0, 1.4), 'p25'))
# Pièce d'or puis étincelles : la victoire.
write('gameshow_win_ding.wav', mix(chan(arp([84, 88, 91, 96], 3, 13, 12, last=24), 'p50'),
                                   0.5 * at(14, chan(arp([96, 103, 100, 108, 103, 110], 4, 9, 0, last=30), 'p12'))))
# « Ba-doum-tss ».
write('festive_rimshot_badumtss.wav', mix(
    chan(glide(190, 90, 7, 15, 5), 'tri'), noise([(18, 10), (18, 5), (18, 2)]),
    at(13, mix(chan(glide(150, 70, 8, 15, 4), 'tri'), noise([(26, 10), (26, 5), (26, 2)]))),
    at(30, noise([(2, v) for v in fade(72, 14, 0)]))))
# Langue de belle-mère : ça monte, puis ça frétille.
write('festive_party_horn.wav', chan(glide(hz(60), hz(79), 12, 10, 13)
                                     + [(hz(79 + (i % 4 < 2)), v) for i, v in enumerate(fade(50, 13, 1))], 'p12'))
# Fanfare « ta-da-da-daaa », avec basse et batterie.
write('festive_kazoo_fanfare.wav', mix(
    chan(arp([67, 67, 67], 6, 13, 13) + rest(2) + hold(hz(72), 14, 13, 12) + hold(hz(76), 14, 13, 12)
         + hold(hz(79), 60, 13, 0, vib=0.012), 'p25'),
    0.6 * chan(hold(hz(43), 18, 12) + rest(2) + hold(hz(48), 28, 12) + hold(hz(43), 60, 12, 2), 'tri'),
    0.4 * noise([(3, 10), (3, 3)] + [(3, 0)] * 4 + [(3, 10), (3, 3)] + [(3, 0)] * 4 + [(3, 10), (3, 3)]
                + [(3, 0)] * 34 + [(2, v) for v in fade(40, 9, 0)])))
# Canon à confettis : « pan », puis une pluie de notes.
write('festive_confetti_pop.wav', mix(
    noise([(10, 15), (6, 13), (4, 10), (3, 7), (2, 4)]), chan(glide(240, 60, 5, 15, 6), 'tri'),
    0.6 * at(5, chan([(hz(int(rng.choice([84, 86, 88, 91, 93, 96, 98, 100]))) if i % 3 < 2 else 0, v)
                      for i, v in enumerate(fade(64, 12, 0))], 'p12'))))

#!/usr/bin/env python3
"""Bruit de gomme réaliste (draw_eraser.wav), seule texture non « 8 bits » :
du caoutchouc qui frotte le papier. Quatre allers-retours par boucle, chacun
avec son attaque, un grain de broutement (la gomme accroche puis lâche) et un
léger souffle de papier. Boucle de 1,2 s sans raccord audible. CC0."""
import numpy as np
from scipy.signal import butter, lfilter
from scipy.io import wavfile
from pathlib import Path

FS = 44100
OUT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(1985)
N = int(FS * 1.2)
t = np.arange(N) / FS

def band(lo, hi, x, order=2):
    b, a = butter(order, [lo / (FS / 2), hi / (FS / 2)], btype='band')
    return lfilter(b, a, x)

def tiled_noise():
    """Bruit filtré sur trois périodes, dont on garde celle du milieu : le
    filtre est déjà « chaud » aux deux bouts, donc la boucle raccorde."""
    return np.tile(rng.uniform(-1, 1, N), 3)

mid = lambda x: x[N:2 * N]
body = mid(band(220, 1500, tiled_noise()))            # le corps mat du caoutchouc
grit = mid(band(1500, 4200, tiled_noise()))           # le grain du papier
hiss = mid(band(4500, 9000, tiled_noise()))           # souffle léger

# Quatre frottements par boucle (≈ 3,3 par seconde), aller plus sombre, retour plus clair.
phase = (t * 4 / 1.2) % 1.0
stroke = np.sin(np.pi * phase) ** 0.7                  # chaque geste enfle puis retombe
onward = (np.floor(t * 4 / 1.2) % 2 == 0).astype(float)
# Broutement : la gomme accroche et lâche une centaine de fois par seconde, irrégulièrement.
chatter_rate = 95 + 35 * np.sin(2 * np.pi * t / 1.2 * 2) + 20 * np.sin(2 * np.pi * t / 1.2 * 5)
chatter = 0.55 + 0.45 * np.abs(np.sin(np.pi * np.cumsum(chatter_rate) / FS)) ** 3

x = body * (0.9 + 0.25 * onward) * chatter
x += grit * (0.35 + 0.3 * (1 - onward)) * chatter
x += hiss * 0.12
x *= 0.12 + 0.88 * stroke                              # jamais tout à fait muet entre deux gestes

x = x / np.max(np.abs(x)) * 0.8
wavfile.write(str(OUT / 'draw_eraser.wav'), FS, (x * 32767).astype(np.int16))
print('draw_eraser.wav', len(x) / FS, 's', 'raccord', abs(x[0] - x[-1]).round(3))

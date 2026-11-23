#!/usr/bin/env python3
"""Coupe un large éventail de rires et d'applaudissements réels distincts
depuis les enregistrements CC0 d'archive.org, pour varier les réactions."""
import subprocess
from pathlib import Path

SRC = Path('/Users/etiennemineur/Developer/MacPaint/sound/reel_cc0/sons_reels_CC0_archive')
OUT = Path('/Users/etiennemineur/Developer/MacPaint/sound/reel2')
OUT.mkdir(parents=True, exist_ok=True)
for p in OUT.glob('*.mp3'):
    p.unlink()

def duration(path):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(path)], text=True).strip())

def mean_volume(path):
    r = subprocess.run(['ffmpeg','-i',str(path),'-af','volumedetect','-f','null','-'],
                       capture_output=True, text=True)
    for line in r.stderr.splitlines():
        if 'mean_volume' in line:
            return float(line.split('mean_volume:')[1].split(' dB')[0].strip())
    return -999

def cut(src, start, dur, out):
    af = "afade=t=in:st=0:d=0.03,afade=t=out:st=%f:d=0.5,loudnorm=I=-16:TP=-1.5:LRA=11" % (dur - 0.5)
    subprocess.run(['ffmpeg','-y','-v','error','-ss',str(start),'-t',str(dur),'-i',str(src),
                    '-af',af,'-c:a','libmp3lame','-b:a','96k',str(out)], check=True)

# (source, kind, nombre de fenêtres candidates)
JOBS = [
    ('rires/laugh_radio_show.mp3', 'laugh', 6),
    ('rires/laugh_theater_audience.mp3', 'laugh', 4),
    ('rires/laugh_theater_burst.mp3', 'laugh', 4),
    ('rires/laugh_audience.mp3', 'laugh', 3),
    ('rires/laugh_large_group.mp3', 'laugh', 3),
    ('rires/laugh_small_group.mp3', 'laugh', 3),
    ('applaudissements/applause_whistles.mp3', 'applause', 4),
    ('applaudissements/applause_happy_crowd.mp3', 'applause', 3),
    ('applaudissements/applause_medium.mp3', 'applause', 3),
    ('applaudissements/clap_ironic_two_people.mp3', 'applause', 2),
    ('applaudissements/applause_small_group.mp3', 'applause', 2),
    ('festif_et_reactions/festive_whoops_whistles_laugh.mp3', 'cheer', 2),
    ('festif_et_reactions/festive_hip_hip_hooray.mp3', 'cheer', 2),
    ('festif_et_reactions/festive_comedy_horns.mp3', 'cheer', 2),
    ('festif_et_reactions/reaction_crowd_gasp.mp3', 'cheer', 2),
]

candidates = []  # (kind, path)
tmp = 0
for source, kind, count in JOBS:
    d = duration(SRC / source)
    usable = max(0.2, d - 2.5 - 0.2)
    for i in range(count):
        s = 0.2 + usable * i / (count - 1) if count > 1 else 0.2
        p = OUT / f'_tmp_{tmp:03d}.mp3'
        tmp += 1
        cut(SRC / source, s, 2.5, p)
        candidates.append((kind, p))

# Pour chaque famille, garde les prises les plus fortes et renumérote.
from collections import defaultdict
by_kind = defaultdict(list)
for kind, p in candidates:
    by_kind[kind].append(p)

for kind, paths in by_kind.items():
    ranked = sorted(paths, key=mean_volume, reverse=True)
    for i, p in enumerate(ranked, 1):
        p.replace(OUT / f'{kind}_{i:02d}.mp3')

print('--- résultat ---')
for p in sorted(OUT.glob('*.mp3')):
    print(f'  {p.name}  {duration(p):.1f}s  {mean_volume(p):.1f} dB')
print('total:', len(list(OUT.glob('*.mp3'))))

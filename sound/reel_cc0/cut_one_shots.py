#!/usr/bin/env python3
"""Coupe des one-shots réels (rires, applaudissements) depuis les enregistrements
CC0 d'archive.org : détecte les fenêtres les plus énergiques, normalise et fond."""
import subprocess, json, math
from pathlib import Path

SRC = Path('/Users/etiennemineur/Developer/MacPaint/sound/reel_cc0/sons_reels_CC0_archive')
OUT = Path('/Users/etiennemineur/Developer/MacPaint/sound/reel')
OUT.mkdir(parents=True, exist_ok=True)

def duration(path):
    out = subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(path)], text=True).strip()
    return float(out)

def mean_volume(path):
    # ffmpeg volumedetect donne mean_volume en dB
    r = subprocess.run(['ffmpeg','-i',str(path),'-af','volumedetect','-f','null','-'],
                       capture_output=True, text=True)
    for line in r.stderr.splitlines():
        if 'mean_volume' in line:
            return float(line.split('mean_volume:')[1].split(' dB')[0].strip())
    return -999

def cut(src, start, dur, out, loudnorm=True):
    af = "afade=t=in:st=0:d=0.03,afade=t=out:st=%f:d=0.5" % (dur-0.5)
    if loudnorm:
        af += ",loudnorm=I=-16:TP=-1.5:LRA=11"
    subprocess.run(['ffmpeg','-y','-v','error','-ss',str(start),'-t',str(dur),'-i',str(src),
                    '-af',af,'-c:a','libmp3lame','-b:a','96k',str(out)], check=True)

def cut_candidates(src, out_prefix, count=5, seg=2.5, min_start=0.2):
    """Coupe `count` fenêtres régulières, renvoie les chemins créés."""
    d = duration(src)
    usable = max(0.2, d - seg - 0.2)
    if usable <= 0:
        return []
    starts = [min_start + usable * i / (count - 1) for i in range(count)] if count > 1 else [min_start]
    paths = []
    for i, s in enumerate(starts):
        p = OUT / f'{out_prefix}_{i:02d}.mp3'
        cut(src, s, seg, p)
        paths.append(p)
    return paths

def pick_best(candidates, keep=2):
    """Garde les `keep` candidats les plus forts (mean_volume le plus élevé)."""
    scored = sorted(candidates, key=lambda p: mean_volume(p), reverse=True)
    best = scored[:keep]
    # Supprime les candidats non retenus
    for p in scored[keep:]:
        p.unlink(missing_ok=True)
    return best

# Rires réels
laugh_sources = [
    ('rires/laugh_theater_burst.mp3', 'laugh_theater'),
    ('rires/laugh_large_group.mp3', 'laugh_large'),
    ('rires/laugh_audience.mp3', 'laugh_group'),
    ('rires/laugh_small_group.mp3', 'laugh_small'),
    ('rires/laugh_theater_audience.mp3', 'laugh_big'),
]
for src, prefix in laugh_sources:
    cands = cut_candidates(SRC/src, prefix)
    pick_best(cands, keep=2)

# Applaudissements réels
applause_sources = [
    ('applaudissements/applause_medium.mp3', 'applause_medium'),
    ('applaudissements/applause_happy_crowd.mp3', 'applause_crowd'),
    ('applaudissements/applause_whistles.mp3', 'applause_whistles'),
    ('applaudissements/clap_ironic_two_people.mp3', 'clap_ironic'),
]
for src, prefix in applause_sources:
    cands = cut_candidates(SRC/src, prefix)
    pick_best(cands, keep=2)

# Le petit groupe d'applaudissements (2.16s) est déjà un one-shot court.
cut(SRC/'applaudissements/applause_small_group.mp3', 0.05, 2.1, OUT/'applause_small.mp3')

print('Fichiers produits :')
for p in sorted(OUT.glob('*.mp3')):
    print('  %s  %.1fs  %.1f dB' % (p.name, duration(p), mean_volume(p)))

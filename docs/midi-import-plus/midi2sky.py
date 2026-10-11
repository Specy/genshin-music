#!/usr/bin/env python3
"""midi2sky — converte um trecho de MIDI no formato .skysheet.json (layers com tonalidade própria).

Uso:
  python midi2sky.py info  arquivo.mid                 # lista tracks e seções (mudanças de tom/tempo)
  python midi2sky.py convert arquivo.mid config.json -o saida.skysheet.json [--template modelo.json]
  python midi2sky.py auto arquivo.mid --start TICK --end TICK --name "Nome" -o saida.skysheet.json [--third-below]
      (gera o config sozinho, salvo como saida.config.json, pra ajustar e rodar 'convert' depois)

Formato observado do .skysheet.json:
  tracks[].notes = [coluna, nota_MIDI_absoluta, (duração_em_colunas)]
  bpm = BPM da semínima x 4  -> 1 coluna = 1 semicolcheia
  cada layer tem pitch ('' = tom global); 15 teclas = 2 oitavas da escala maior do tom,
  a escala sobe a partir de C (C4-C6 ... B4-B6 no padrão); em F: Contrabass F1-F3, Cello F2-F4, resto F4-F6.
"""
import json, sys, argparse, collections, random, string
import mido

NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
PITCH_SEMI = {'C': 0, 'Db': 1, 'C#': 1, 'D': 2, 'Eb': 3, 'D#': 3, 'E': 4, 'F': 5, 'Gb': 6, 'F#': 6,
              'G': 7, 'Ab': 8, 'G#': 8, 'A': 9, 'Bb': 10, 'A#': 10, 'B': 11}
PITCH_OUT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
MAJOR = [0, 2, 4, 5, 7, 9, 11]
# oitava base de cada instrumento (inferida do JSON de exemplo; ajustar se o app discordar)
OCTAVE_BASE = {'Contrabass': 1, 'Cello': 2}
# instrumentos que SOAM numa oitava diferente da nota gravada no arquivo:
# Winter Piano usa as mesmas teclas do Piano, mas soa 1 oitava acima (continuação do Piano)
SOUND_SHIFT = {}  # a tabela SKY_KEYS já tem o som real de cada instrumento
# pra onde vai uma nota que não cabe no alcance do instrumento (em vez de pular de oitava)
SPILL = {'Trumpet': ['WinterPiano', 'Piano', 'Cello'], 'Violin': ['WinterPiano', 'Piano', 'Cello'],
         'Cello': ['Piano', 'Contrabass'], 'Contrabass': ['Cello'],
         'Piano': ['WinterPiano', 'Cello', 'Contrabass']}
DEFAULT_OCTAVE = 4
SUSTAIN = {'Violin', 'Cello', 'Trumpet', 'Horn', 'Saxophone', 'Flute', 'TransverseFlute',
           'Harmonica', 'Panflute', 'Ocarina', 'Manta Ocarina', 'Tuned Krill Horn'}
ICON = {'Drum': 'circle', 'DunDun': 'circle', 'FortuneDrum': 'circle', 'Cymbals': 'circle',
        'Violin': 'border', 'Trumpet': 'border'}

# mapa de bateria GM -> (instrumento, [notas]); padrão copiado do arranjo de exemplo
# percussão: só as primeiras teclas existem (DunDun/Drum 8 = C..C, Fortune Drum 4 = C..F)
NKEYS = {'DunDun': 8, 'Drum': 8, 'FortuneDrum': 4, 'Cymbals': 4}
# mapa de bateria GM -> (instrumento, [ÍNDICES de tecla 0..7]); a nota sai da escala do layer,
# então funciona em qualquer tom. Sons (DunDun): C=tambor 1, D=caixa (oco), E=tambor 2,
# F=prato, G=repique (oco), A=chocalho, B=prato, C agudo=prato. Drum segue a mesma linha.
DRUM_MAP = {
    'kick':     ([35, 36], 'DunDun', [0]),                     # bumbo -> C
    'snare':    ([37, 38, 39, 40], 'DunDun', [1, 2, 4, 6]),    # caixa -> D+E+G+B (teu cluster da Luffy)
    'tom_grave': ([41, 43, 45], 'DunDun', [2]),                # tons graves -> E
    'tom_agudo': ([47, 48, 50], 'DunDun', [4]),                # tons agudos -> G
    'conga':    ([60, 61, 62, 63, 64], 'DunDun', [4]),         # bongô/conga -> G
    'crash':    ([49, 52, 55, 57], 'DunDun', [7]),             # crash/splash -> C agudo
    'ride':     ([51, 53, 59], 'DunDun', [3]),                 # condução -> F
    'hat':      ([42, 44, 46, 54, 69, 70, 82], 'Drum', [5]),   # chimbal/pandeirola/cabasa -> Drum A (chocalho)
    'perc':     ([75, 76, 77, 80, 81], 'Drum', [6]),           # triângulo/woodblock -> Drum B
}


def nn(p):
    return NOTE_NAMES[p % 12] + str(p // 12 - 1)


# Teclas de cada instrumento do app (som de cada tecla com a escala em C), tirado do código-fonte
# do Sky Music Nightly (src/lib/games/sky/instruments/*/meta.json + presets.json).
# O número gravado no arquivo = som da tecla + deslocamento da escala do layer (C=0, Db=1 ... B=11).
SKY_KEYS = {"Piano":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"GrandPiano":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"Contrabass":[24,26,28,29,31,33,35,36,38,40,41,43,45,47,48],"Cello":[36,38,40,41,43,45,47,48,50,52,53,55,57,59,60],"Violin":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"Guitar":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"LightGuitar":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"Harp":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"Horn":[36,38,40,41,43,45,47,48,50,52,53,55,57,59,60],"KrillHorn":[53,55,57,59,60,62,64,65],"Trumpet":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"Saxophone":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"Pipa":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"WinterPiano":[72,74,76,77,79,81,83,84,86,88,89,91,93,95,96],"Xylophone":[72,74,76,77,79,81,83,84,86,88,89,91,93,95,96],"Flute":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"TransverseFlute":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"Panflute":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"Ocarina":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"MantaOcarina":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"Harmonica":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"Aurora":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"Kalimba":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"ToyUkulele":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"Drum":[60,62,64,65,67,69,71,72],"FortuneDrum":[60,62,64,65],"Cymbals":[60,62,64,65],"Bells":[60,62,67,69,72,74,79,81],"SmallBell":[60,62,67,69,72,74,79,81],"DunDun":[60,62,64,65,67,69,71,72],"HandPan":[50,57,60,62,65,67,69,72],"TriumphHandPan":[50,57,60,62,65,67,69,72],"SFX_SineSynth":[72,74,76,77,79,81,83,84],"SFX_BassSynth":[36,38,40,41,43,45,47,48],"SFX_ChimeSynth":[84,86,88,89,91,93,95,96],"SFX_TR-909":[60,62,64,65,67,69,71,72],"SFX_Dance":[60,62,64,65,67,69],"SFX_BirdCall":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"SFX_CrabCall":[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],"SFX_FishCall":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"SFX_SpiritMantaCall":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"SFX_JellyCall":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"SFX_MantaCall":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72],"SFX_MothCall":[48,50,52,53,55,57,59,60,62,64,65,67,69,71,72]}
ALIASES = {'WinterPiano': 'WinterPiano', 'Grand Piano': 'GrandPiano', 'FortuneDrum': 'FortuneDrum',
           'TransverseFlute': 'TransverseFlute', 'Light Guitar': 'LightGuitar', 'Small Bell': 'SmallBell',
           'Toy Ukulele': 'ToyUkulele', 'Manta Ocarina': 'MantaOcarina', 'Triumph HandPan': 'TriumphHandPan',
           'Tuned Krill Horn': 'KrillHorn'}


def inst_id(name):
    return ALIASES.get(name, name)


def layer_range(instr, pitch):
    return [k + PITCH_SEMI[pitch] for k in SKY_KEYS.get(inst_id(instr), SKY_KEYS['Piano'])]

def fit(note, keys, fold=True):
    """devolve a nota encaixada nas 15 teclas (dobrando oitava se preciso) ou None se cromática"""
    if note % 12 not in {k % 12 for k in keys}:
        return None
    n = note
    if fold:
        while n < keys[0]:
            n += 12
        while n > keys[-1]:
            n -= 12
    return n if n in keys else None


def read_midi(path):
    m = mido.MidiFile(path, clip=True)
    tracks = []
    for i, t in enumerate(m.tracks):
        ab = 0; on = {}; ev = []; prog = None; chans = set()
        for msg in t:
            ab += msg.time
            if msg.type == 'program_change' and prog is None:
                prog = msg.program
            if msg.type == 'note_on' and msg.velocity > 0:
                on.setdefault((msg.note, msg.channel), []).append((ab, msg.velocity))
                chans.add(msg.channel)
            elif msg.type in ('note_off', 'note_on'):
                k = (msg.note, msg.channel)
                if on.get(k):
                    s, v = on[k].pop(0)
                    ev.append((s, ab, msg.note, v))
        ev.sort()
        tracks.append({'idx': i, 'name': t.name, 'prog': prog, 'chans': chans,
                       'drum': chans == {9}, 'notes': ev})
    meta = []  # só a track condutora; outras tracks repetem/contradizem os metadados
    ab = 0
    last = {}
    cond = m.tracks[0]
    if not any(x.type == 'set_tempo' for x in cond):
        cond = next((t for t in m.tracks if any(x.type == 'set_tempo' for x in t)), cond)
    for msg in cond:
        ab += msg.time
        if msg.type in ('set_tempo', 'key_signature', 'time_signature'):
            sig = str(msg.copy(time=0))
            if last.get(msg.type) != sig:
                meta.append((ab, msg)); last[msg.type] = sig
    return m, tracks, meta


def cmd_info(args):
    m, tracks, meta = read_midi(args.midi)
    tpb = m.ticks_per_beat
    print(f'ticks/semínima: {tpb}')
    print('\n# Seções (mudança de tom ou tempo):')
    for ab, msg in meta:
        if msg.type == 'key_signature':
            print(f'  semínima {ab / tpb:8.2f}  (tick {ab:7d})  tom {msg.key}')
        elif msg.type == 'set_tempo':
            print(f'  semínima {ab / tpb:8.2f}  (tick {ab:7d})  tempo {60e6 / msg.tempo:.0f} bpm')
        else:
            print(f'  semínima {ab / tpb:8.2f}  (tick {ab:7d})  compasso {msg.numerator}/{msg.denominator}')
    a, b = args.start or 0, args.end or 10 ** 12
    print(f'\n# Tracks com notas entre tick {a} e {b}:')
    for t in tracks:
        ev = [e for e in t['notes'] if a <= e[0] < b]
        if not ev:
            continue
        lo, hi = min(e[2] for e in ev), max(e[2] for e in ev)
        kind = 'BATERIA' if t['drum'] else f'prog {t["prog"]}'
        extra = ''
        if t['drum']:
            extra = ' notas ' + ','.join(str(x) for x in sorted({e[2] for e in ev}))
        print(f'  track {t["idx"]:2d} {kind:10s} {len(ev):4d} notas  {nn(lo)}..{nn(hi)}{extra}')


def best_key(notes):
    pcs = collections.Counter(n % 12 for n in notes)
    best = max(range(12), key=lambda k: sum(pcs[(k + s) % 12] for s in MAJOR))
    return PITCH_OUT[best]


def cmd_convert(args):
    m, tracks, meta = read_midi(args.midi)
    cfg = json.load(open(args.config))
    tpb = m.ticks_per_beat
    a, b = cfg['start_tick'], cfg['end_tick']
    last_tick = max((e[1] for t in tracks for e in t['notes']), default=b)
    b = min(b, last_tick + 1)
    grid = cfg.get('grid', 4)  # colunas por semínima
    tick_col = tpb / (grid if grid != 'auto' else 4)
    offset = cfg.get('column_offset', 0)
    # mapa de tempo: tick -> segundos (respeita ritardandos/mudanças de tempo dentro do trecho)
    tmap = [(0, 500000)]
    for ab, msg in meta:
        if msg.type == 'set_tempo':
            tmap.append((ab, msg.tempo))
    tmap.sort(key=lambda x: x[0])
    def secs(tick):
        t = 0.0; prev_tick, prev_tempo = 0, 500000
        for tk, tp in tmap:
            if tk >= tick:
                break
            t += (tk - prev_tick) * prev_tempo / 1e6 / tpb; prev_tick, prev_tempo = tk, tp
        return t + (tick - prev_tick) * prev_tempo / 1e6 / tpb
    # tempo predominante no trecho (ponderado por duração)
    wt = collections.Counter()
    pts = [a] + [tk for tk, _ in tmap if a < tk < b] + [b]
    for x, y in zip(pts, pts[1:]):
        tp = [p for tk, p in tmap if tk <= x][-1]
        wt[round(60e6 / tp)] += y - x
    tempo = wt.most_common(1)[0][0]
    if grid == 'auto':  # música rápida: colcheia por coluna pra não passar de ~600 bpm
        grid = 2 if tempo * 4 > 600 else 4
        tick_col = tpb / grid
    bpm = cfg.get('bpm') or round(tempo * grid)
    colsec = 60 / bpm
    s0 = secs(a)

    def part_tracks(part):
        if part.get('tracks') == 'all':
            return [t['idx'] for t in tracks if not t['drum'] and t['prog'] != 47
                    and any(a <= e[0] < b for e in t['notes'])]
        return part['tracks']
    scale_pcs = lambda p: {(PITCH_SEMI[p] + x) % 12 for x in MAJOR}
    # peso de cada classe de nota: melodia (1ª parte) pesa 3x
    wpc = collections.Counter()
    for pi, part in enumerate(cfg.get('parts', [])):
        w = 3 if pi == 0 else 1
        for ti in part_tracks(part):
            for e in tracks[ti]['notes']:
                if a <= e[0] < b:
                    wpc[e[2] % 12] += w
    total = sum(wpc.values()) or 1
    import itertools
    def cover(ps):
        u = set().union(*[scale_pcs(p) for p in ps])
        return sum(v for pc, v in wpc.items() if pc in u)
    key = cfg.get('pitch')
    if cfg.get('aux_pitches') is not None:
        aux_order = cfg['aux_pitches']
        key = key or max(PITCH_OUT, key=lambda p: cover([p]))
    else:
        # testa todo tom principal + até max_aux tons auxiliares; cada layer extra precisa
        # cobrir pelo menos 0,5% das notas pra valer a pena
        best = None
        mains = [key] if key else PITCH_OUT
        for p in mains:
            others = [q for q in PITCH_OUT if q != p]
            for k in range(cfg.get('max_aux', 2) + 1):
                for combo in itertools.combinations(others, k):
                    sc = cover((p,) + combo) - 0.005 * total * k
                    # desempate: tom principal mais forte, depois auxiliares mais próximos no ciclo de quintas
                    near = -sum(min(((PITCH_SEMI[q] - PITCH_SEMI[p]) * 7) % 12,
                                    (-(PITCH_SEMI[q] - PITCH_SEMI[p]) * 7) % 12) for q in combo)
                    cand = (round(sc, 6), cover([p]), near, p, combo)
                    if best is None or cand[:3] > best[:3]:
                        best = cand
        key, aux_order = best[3], list(best[4])
    def fifths(p):
        d = ((PITCH_SEMI[p] - PITCH_SEMI[key]) * 7) % 12
        return min(d, 12 - d)
    miss = sum(v for pc, v in wpc.items() if pc not in set().union(*[scale_pcs(p) for p in [key] + aux_order]))

    layers = collections.OrderedDict()  # (instr, pitch, alias) -> dict
    report = collections.Counter()

    def layer(instr, pitch, vol=None, alias=''):
        k = (instr, pitch, alias)
        if k not in layers:
            layers[k] = {'instr': instr, 'pitch': pitch, 'vol': vol, 'alias': alias, 'notes': {}}
        if vol is not None and layers[k]['vol'] is None:
            layers[k]['vol'] = vol
        return layers[k]

    # ---- linha do tempo de colunas com duração variável (1, 1/2, 1/4, 1/8) ----
    # cada coluna dura colsec * fração; escolhe a maior fração que não passa do próximo ataque,
    # assim notas mais rápidas que a grade (fusas, tercinas, apojaturas) não se juntam na mesma coluna
    FR = [1, 0.5, 0.25, 0.125]
    eps = colsec / 16
    use_ids = set()
    for part in cfg.get('parts', []):
        use_ids |= set(part_tracks(part))
    dt_ids = cfg.get('drum_tracks')
    use_ids |= set(dt_ids if dt_ids is not None else [t['idx'] for t in tracks if t['drum']])
    onsets = sorted({round(secs(e[0]) - s0, 6) for t in tracks if t['idx'] in use_ids
                     for e in t['notes'] if a <= e[0] < b})
    tim_err = []
    end_t = secs(b) - s0
    col_t, col_k = [], []
    t = 0.0; i = 0
    subdiv = cfg.get('subdiv', True)
    while t < end_t - eps or i < len(onsets):
        while i < len(onsets) and onsets[i] <= t + eps:
            i += 1
        gap = (onsets[i] - t) if i < len(onsets) else (end_t - t)
        k = 0
        if subdiv:
            while k < 3 and FR[k] * colsec > gap + eps:
                k += 1
        col_t.append(t); col_k.append(k)
        t += FR[k] * colsec
        if len(col_t) > 200000:
            break
    import bisect
    def col_at_time(x):
        j = bisect.bisect_left(col_t, x - eps)
        if j >= len(col_t):
            return len(col_t) - 1
        if j > 0 and abs(col_t[j - 1] - x) < abs(col_t[j] - x):
            j -= 1
        return j
    def col_of(tick):
        x = secs(tick) - s0
        j = col_at_time(x)
        tim_err.append(abs(col_t[j] - x))
        return j + offset
    def dur_cols(s_, e_):
        c1 = col_of(s_)
        c2 = col_at_time(secs(e_) - s0) + offset
        return max(1, c2 - c1)

    def add(L, c, n, d):
        old = L['notes'].get((c, n))
        if old is None or (d or 0) > (old or 0):
            L['notes'][(c, n)] = d

    by_idx = {t['idx']: t for t in tracks}
    used = set()
    for part in cfg.get('parts', []):
        instr = part['instrument']
        shift = part.get('shift', 0)
        use_dur = part.get('durations', instr in SUSTAIN)
        poly = part.get('max_poly')
        pick = part.get('pick', 'top')
        pkey = part.get('pitch') or key          # escala própria do layer (ou a da música)
        paux = part.get('aux_pitches', aux_order)  # escalas extras desse layer
        balias = part.get('alias', '')
        main = layer(instr, '' if pkey == key else pkey, part.get('volume'), balias)
        mkeys = layer_range(instr, pkey)
        evs = []
        for ti in part_tracks(part):
            used.add(ti)
            evs += [e for e in by_idx[ti]['notes'] if a <= e[0] < b]
        if part.get('note_range'):  # usa só uma faixa de notas (ex.: mão direita/esquerda de um piano)
            lo_, hi_ = part['note_range']
            evs = [e for e in evs if lo_ <= e[2] <= hi_]
        lo_k, hi_k = mkeys[0], mkeys[-1]
        inr = lambda x: lo_k <= x <= hi_k
        if 'center' in part and evs:
            # oitava que deixa MAIS notas dentro das 15 teclas (empate: mais perto do centro pedido)
            med = sorted(e[2] for e in evs)[len(evs) // 2]
            base = 12 * round((part['center'] - med) / 12)
            shift = max((base + 12 * k for k in (-2, -1, 0, 1, 2)),
                        key=lambda sh: (sum(inr(e[2] + sh) for e in evs), -abs(sh - base)))
        # frases: um trecho que não cabe é deslocado INTEIRO de oitava, em vez de nota por nota,
        # pra melodia não ficar pulando de oitava no meio da frase
        evs = sorted(evs)
        phrase_shift = {}
        if part.get('phrase_fold', True) and not part.get('fill') and evs:
            gap = tpb  # 1 semínima sem nota nova = frase nova
            groups, cur, last = [], [], None
            for ev in evs:
                if last is not None and ev[0] - last > gap:
                    groups.append(cur); cur = []
                cur.append(ev); last = max(last or 0, ev[0])
            groups.append(cur)
            for g in groups:
                if all(inr(ev[2] + shift) for ev in g):
                    continue
                best = max((0, -12, 12, -24, 24), key=lambda x: (sum(inr(ev[2] + shift + x) for ev in g), -abs(x)))
                for ev in g:
                    phrase_shift[id(ev)] = best
                if best:
                    report['frase_deslocada'] += 1
        bycol = collections.defaultdict(dict)
        for ev in evs:
            s, e, n, v = ev
            c = col_of(s)
            d = dur_cols(s, e)
            n2 = n + shift + phrase_shift.get(id(ev), 0)
            bycol[c][n2] = max(d, bycol[c].get(n2, 0))
        if part.get('fill'):
            # só o que nenhuma layer já toca (mesma nota, ignorando oitava, na mesma coluna)
            have = collections.defaultdict(set)
            for L in layers.values():
                for (c, n) in L['notes']:
                    have[c].add(n % 12)
            for c in list(bycol):
                bycol[c] = {n: d for n, d in bycol[c].items() if n % 12 not in have[c]}
                if not bycol[c]:
                    del bycol[c]
        ovf = part.get('overflow')
        for c, notes in sorted(bycol.items()):
            ns = sorted(notes, reverse=(pick in ('top', 'second')))
            if pick == 'second':
                ns = ns[1:2]
            if poly:
                ns = ns[:poly]
            if part.get('third_below'):
                # acrescenta a terça diatônica abaixo de cada nota (estilo do contrabass do arranjo original)
                ext = {}
                for n in ns:
                    deg = [k % 12 for k in mkeys[:7]]
                    if n % 12 in deg:
                        i = deg.index(n % 12)
                        t = n - ((n % 12 - deg[(i - 2) % 7]) % 12)
                        ext[t] = notes[n]
                for t, d in ext.items():
                    notes.setdefault(t, d)
                ns = sorted(set(ns) | set(ext), reverse=(pick == 'top'))
            for n in ns:
                d = notes[n]
                dur = d if (use_dur and d > 1) else None
                f = fit(n, mkeys, fold=False)
                if f is not None:
                    add(main, c, f, dur); report['ok'] += 1; continue
                if ovf and n > mkeys[-1]:  # acima do alcance: continua no instrumento de cima (ex. Winter Piano)
                    okeys = layer_range(ovf, key)
                    n_ovf = n - SOUND_SHIFT.get(ovf, 0)  # nota como é gravada no instrumento de cima
                    f = fit(n_ovf, okeys, fold=False)
                    if f is None:
                        for p in paux:
                            f2 = fit(n_ovf, layer_range(ovf, p), fold=False)
                            if f2 is not None:
                                add(layer(ovf, p, part.get('volume'), f'{ovf} {p}'), c, f2, dur)
                                report['overflow'] += 1; f = -1; break
                    elif f is not None:
                        add(layer(ovf, '', part.get('volume')), c, f, dur); report['overflow'] += 1
                    if f is not None:
                        continue
                # fora da escala ou fora do alcance: tenta layer com outro tom (sem dobrar oitava)
                placed = False
                out_of_scale = n % 12 not in {k % 12 for k in mkeys}
                if part.get('aux', True) and (out_of_scale or part.get('extend_range', False)):
                    for p in paux:
                        f = fit(n, layer_range(instr, p), fold=False)
                        if f is not None:
                            add(layer(instr, p, part.get('volume'), f'{balias or instr} {p}'), c, f, dur)
                            report['aux_' + p] += 1; placed = True; break
                if placed:
                    continue
                # nota fora do alcance: passa pra outro instrumento que alcança (sem mudar a oitava)
                for sp_i in part.get('spill', []):
                    n_sp = n - SOUND_SHIFT.get(sp_i, 0)
                    f2 = fit(n_sp, layer_range(sp_i, key), fold=False)
                    if f2 is not None:
                        add(layer(sp_i, '', None), c, f2, dur); report['passada_' + sp_i] += 1; placed = True; break
                    if out_of_scale:
                        for p in paux:
                            f2 = fit(n_sp, layer_range(sp_i, p), fold=False)
                            if f2 is not None:
                                add(layer(sp_i, p, None, f'{sp_i} {p}'), c, f2, dur)
                                report['passada_' + sp_i] += 1; placed = True; break
                    if placed:
                        break
                if placed:
                    continue
                f = fit(n, mkeys, fold=True)  # dobra oitava no tom principal
                if f is not None:
                    add(main, c, f, dur); report['oitava_dobrada'] += 1
                    report['dobrada_' + instr + ('_grave' if n < mkeys[0] else '_aguda')] += 1; continue
                for p in paux:
                    f = fit(n, layer_range(instr, p), fold=True)
                    if f is not None and part.get('aux', True):
                        add(layer(instr, p, part.get('volume'), f'{balias or instr} {p}'), c, f, dur)
                        report['aux_dobrada_' + p] += 1; placed = True; break
                if not placed:
                    report['descartada'] += 1

    # bateria
    dmap = cfg.get('drum_map') or {k: v for k, v in DRUM_MAP.items()}
    gm2 = {}
    for name, (gms, instr, target) in dmap.items():
        for g in gms:
            gm2[g] = (instr, target, name)
    drum_tracks = cfg.get('drum_tracks')
    if drum_tracks is None:
        drum_tracks = [t['idx'] for t in tracks if t['drum']]
    unk = collections.Counter()
    snare_gm = set(dmap['snare'][0]) if 'snare' in dmap else set()
    snare_cols = sorted({col_of(e[0]) for ti in drum_tracks for e in by_idx[ti]['notes']
                         if a <= e[0] < b and e[2] in snare_gm})
    for ti in drum_tracks:
        used.add(ti)
        for s, e, n, v in by_idx[ti]['notes']:
            if not (a <= s < b):
                continue
            if n not in gm2:
                unk[n] += 1; continue
            instr, target, name = gm2[n]
            L = layer(instr, '' if key == 'C' else 'C', cfg.get('drum_volume', {}).get(instr))
            if name == 'snare':  # em rufo/caixa rápida usa só o D, o cluster fica pras batidas soltas
                c = col_of(s)
                near = [x for x in snare_cols if abs(x - c) <= 2 and x != c]
                if near:
                    target = [target[0]]
            dkeys = layer_range(instr, 'C')[:NKEYS.get(instr, 15)]
            for idx in target:
                add(L, col_of(s), dkeys[min(idx, len(dkeys) - 1)], None)
            report['bateria_' + name] += 1

    # cobertura: quantas notas do MIDI (sem bateria/tímpano) aparecem na mesma coluna em algum layer
    have = collections.defaultdict(set)
    for (instr, pitch, alias), L in layers.items():
        if instr in NKEYS:
            continue
        for (c, n) in L['notes']:
            have[c].add(n % 12)
    tot = hit = 0
    for t in tracks:
        if t['drum'] or t['prog'] == 47:
            continue
        for e in t['notes']:
            if a <= e[0] < b:
                c = col_of(e[0]); tot += 1
                hit += any(e[2] % 12 in have[c + x] for x in (-1, 0, 1))
    coverage = hit / tot if tot else 1

    # monta JSON
    tpl = json.load(open(args.template))[0] if args.template else {}
    out_tracks = []
    maxcol = 0
    for (instr, pitch, alias), L in layers.items():
        notes = []
        for (c, n), d in sorted(L['notes'].items()):
            if c < 0:
                continue
            notes.append([c, n, d] if d else [c, n])
            maxcol = max(maxcol, c + (d or 1) - 1)
        if not notes:
            continue
        out_tracks.append({'instrument': {
            'name': instr, 'volume': L['vol'] if L['vol'] is not None else 100, 'pitch': pitch,
            'visible': True, 'icon': ICON.get(instr, 'line'), 'alias': alias,
            'muted': False, 'solo': False, 'reverbOverride': None}, 'notes': notes})
    ncols = maxcol + 2
    bp_every = cfg.get('breakpoint_every', grid * 16)
    song = {
        'name': cfg.get('name', 'Sem nome'), 'type': 'composed', 'bpm': bpm, 'pitch': key,
        'version': tpl.get('version', 5), 'folderId': None,
        'data': tpl.get('data', {'isComposed': True, 'isComposedVersion': True, 'appName': 'Sky'}),
        'reverb': cfg.get('reverb', False),
        # marca a cada 4 compassos (pelo tempo real) + última coluna
        'breakpoints': sorted({col_at_time(x * bp_every * colsec) for x in range(int(end_t / (bp_every * colsec)) + 1)
                               if col_at_time(x * bp_every * colsec) < ncols} | {0, ncols - 1}),
        'columnTempos': [col_k[c] if c < len(col_k) else 0 for c in range(ncols)],
        'tracks': out_tracks,
        'id': '-'.join(''.join(random.choice('0123456789abcdef') for _ in range(n)) for n in (8, 4, 4, 4)),
    }
    # campos de compatibilidade Sky Studio (só tom principal; layers auxiliares não cabem lá)
    ms = 60000 / bpm
    sn = []
    for tr in out_tracks:
        if tr['instrument']['pitch']:
            continue
        keys = layer_range(tr['instrument']['name'], key)
        for nt in tr['notes']:
            if nt[1] in keys:
                tt = col_t[nt[0]] if nt[0] < len(col_t) else nt[0] * colsec
                d = {'key': '1Key' + str(keys.index(nt[1])), 'time': round(tt * 1000)}
                sn.append(d)
    sn.sort(key=lambda x: x['time'])
    song.update({'isComposed': True, 'pitchLevel': PITCH_SEMI[key], 'bitsPerPage': 16,
                 'isEncrypted': False, 'songNotes': sn})
    json.dump([song], open(args.output, 'w'), ensure_ascii=False, separators=(',', ':'))

    print(f'tom: {key}  bpm: {bpm}  colunas: {ncols}  (1/2: {col_k.count(1)}, 1/4: {col_k.count(2)}, 1/8: {col_k.count(3)})')
    for tr in out_tracks:
        i = tr['instrument']
        print(f'  layer {i["name"]:12s} pitch={i["pitch"] or "-":3s} {len(tr["notes"]):4d} notas')
    print('relatório:', dict(report))
    if unk:
        print('notas de bateria sem mapa:', dict(unk))
    nao = [t['idx'] for t in tracks if t['idx'] not in used and any(a <= e[0] < b for e in t['notes'])]
    if nao:
        print('tracks com notas no trecho que NÃO foram usadas:', nao)
    tch = [(ab, round(60e6 / msg.tempo)) for ab, msg in meta if msg.type == 'set_tempo' and a < ab < b]
    if tch:
        print(f'obs: {len(tch)} mudanças de tempo no trecho (bpm base {tempo}); notas posicionadas pelo tempo real')
    print(f'cobertura das notas do MIDI: {coverage:.0%}')
    if tim_err:
        te = sorted(tim_err)
        print(f'erro de tempo: mediana {te[len(te)//2]*1000:.0f} ms, máx {te[-1]*1000:.0f} ms')
    print('tons auxiliares usados:', aux_order or 'nenhum',
          f'| notas sem tecla em nenhum layer: {miss / total:.1%} (ponderado)')
    off = sum(1 for t in tracks for e in t['notes'] if a <= e[0] < b and (e[0] - a) % max(1, int(tick_col)))
    if off:
        print(f'AVISO: {off} notas fora da grade (quiáltera/humanizado?) foram arredondadas')


def auto_config(tracks, a, b, name, lead='Trumpet', second='Violin', mid='Cello', bass='Contrabass',
                third_below=False, tpb=480):
    q16 = tpb // 4
    """monta um config automático: separa as tracks por registro e escolhe instrumentos"""
    import statistics
    high, midg, low, cand = [], [], [], []
    for t in tracks:
        if t['drum'] or t['prog'] == 47:  # bateria e tímpano ficam de fora dos melódicos
            continue
        ev = [e for e in t['notes'] if a <= e[0] < b]
        if len(ev) < 8:
            continue
        med = statistics.median(e[2] for e in ev)
        offr = sum(1 for e in ev if (e[0] - a) % q16) / len(ev)
        cols = collections.Counter(e[0] for e in ev)
        poly = len(ev) / len(cols)
        if med < 50:
            low.append(t['idx'])
        elif not (offr > 0.3 and poly > 1.45) and poly < 2.5:
            cand.append((med, t['idx'], len(ev)))
    if cand:  # ignora tracks esparsas na hora de achar a melodia
        mx = max(c[2] for c in cand)
        sparse = [c for c in cand if c[2] < 0.25 * mx]
        cand = [c for c in cand if c[2] >= 0.25 * mx]
    cand = [(m_, i) for m_, i, _ in cand]
    cand.sort(reverse=True)
    if cand:
        top = cand[0][0]
        high = [i for m_, i in cand if m_ >= top - 9]
        midg = [i for m_, i in cand if m_ < top - 9]
        if not midg:
            midg = high[:]
    # poucas tracks e alguma é um piano (duas mãos na mesma track): separa por registro
    pitched_ids = [t['idx'] for t in tracks if not t['drum'] and t['prog'] != 47
                   and sum(1 for e in t['notes'] if a <= e[0] < b) >= 8]
    wide = []
    for i in pitched_ids:
        ps = sorted(e[2] for e in tracks[i]['notes'] if a <= e[0] < b)
        if ps[int(len(ps) * 0.9)] - ps[int(len(ps) * 0.1)] > 24:
            wide.append(i)
    if wide and len(pitched_ids) <= 3:
        cfg_w = {'name': name, 'start_tick': a, 'end_tick': b, 'grid': 'auto', 'max_aux': 2,
                'drum_volume': {'Drum': 80, 'DunDun': 100}, 'parts': [
                    {'instrument': lead, 'tracks': pitched_ids, 'note_range': [60, 127], 'center': 77,
                     'max_poly': 1, 'volume': 110},
                    {'instrument': second, 'tracks': pitched_ids, 'note_range': [60, 127], 'center': 77,
                     'pick': 'second', 'volume': 50},
                    {'instrument': mid, 'tracks': pitched_ids, 'note_range': [0, 59], 'center': 53,
                     'max_poly': 2, 'volume': 60},
                    {'instrument': bass, 'tracks': pitched_ids, 'note_range': [0, 59], 'center': 41,
                     'max_poly': 1, 'pick': 'bottom', 'volume': 120, 'third_below': third_below},
                    {'instrument': 'Piano', 'tracks': 'all', 'fill': True, 'max_poly': 3,
                     'overflow': 'WinterPiano', 'volume': 45, 'durations': False}]}
        for pt in cfg_w['parts']:
            pt.setdefault('spill', SPILL.get(pt['instrument'], []))
        return cfg_w
    parts = []
    cello_pick = 'top'
    by = {t['idx']: t for t in tracks}
    def cols_with(ids, k):
        c = collections.defaultdict(set)
        for i in ids:
            for e in by[i]['notes']:
                if a <= e[0] < b:
                    c[round(e[0] / q16)].add(e[2])
        return sum(1 for v in c.values() if len(v) >= k), len(c)
    if high:
        parts.append({'instrument': lead, 'tracks': high, 'center': 77, 'max_poly': 1, 'volume': 110})
        two, tot = cols_with(high, 2)
        if two >= 0.2 * tot or not midg or midg == high:
            parts.append({'instrument': second, 'tracks': high, 'center': 77, 'pick': 'second', 'volume': 50})
        else:  # naipe agudo é uníssono: violino faz a voz de cima do médio, na região aguda
            parts.append({'instrument': second, 'tracks': midg, 'center': 72, 'max_poly': 1, 'volume': 50})
            cello_pick = 'bottom'
    if midg:
        parts.append({'instrument': mid, 'tracks': midg, 'center': 53, 'max_poly': 2, 'pick': cello_pick,
                      'volume': 60})
    if low:
        parts.append({'instrument': bass, 'tracks': low, 'center': 41, 'max_poly': 1, 'pick': 'bottom',
                      'volume': 120, 'third_below': third_below})
    # preenchimento: tudo que ficou de fora vai pro Piano, e o que passa do topo dele vai pro Winter Piano
    parts.append({'instrument': 'Piano', 'tracks': 'all', 'fill': True, 'max_poly': 3,
                  'overflow': 'WinterPiano', 'volume': 45, 'durations': False})
    # grade: colcheia se quase não há semicolcheias (deixa o bpm menor e a partitura mais limpa)
    allev = [e for t in tracks for e in t['notes'] if a <= e[0] < b]
    odd16 = sum(1 for e in allev if round((e[0] - a) / q16) % 2) / max(1, len(allev))
    for pt in parts:
        pt.setdefault('spill', SPILL.get(pt['instrument'], []))
    return {'name': name, 'start_tick': a, 'end_tick': b, 'grid': 'auto', 'parts': parts,
            'drum_volume': {'Drum': 80, 'DunDun': 100}, 'max_aux': 2}


# ---------------- modo "uma layer por track" ----------------
# programa GM -> instrumento do app
def gm_instrument(prog):
    if prog is None:
        return 'Piano'
    table = [
        (range(0, 8), 'Piano'), (range(8, 9), 'Bells'), (range(9, 10), 'Bells'), (range(10, 11), 'Kalimba'),
        (range(11, 14), 'Xylophone'), (range(14, 15), 'Bells'), (range(15, 16), 'Kalimba'),
        (range(16, 24), 'Harmonica'), (range(24, 32), 'Pipa'), (range(32, 40), 'Contrabass'),
        (range(40, 42), 'Violin'), (range(42, 44), 'Cello'), (range(44, 46), 'Violin'), (range(46, 47), 'Harp'),
        (range(47, 48), 'Contrabass'), (range(48, 52), 'Violin'), (range(52, 56), 'Aurora'),
        (range(56, 57), 'Trumpet'), (range(57, 59), 'Horn'), (range(59, 60), 'Trumpet'), (range(60, 61), 'Horn'),
        (range(61, 64), 'Trumpet'), (range(64, 68), 'Saxophone'), (range(68, 72), 'Flute'),
        (range(72, 73), 'Flute'), (range(73, 74), 'Flute'), (range(74, 75), 'TransverseFlute'),
        (range(75, 76), 'Panflute'), (range(76, 80), 'Ocarina'), (range(80, 104), 'Piano'),
        (range(104, 105), 'Pipa'), (range(105, 106), 'Pipa'), (range(106, 108), 'Kalimba'),
        (range(108, 112), 'Kalimba'), (range(112, 128), 'Piano')]
    for r, name in table:
        if prog in r:
            return name
    return 'Piano'


def best_layer(notes, instr, prefer=None):
    """escolhe escala (12 opções) e oitava que deixam MAIS notas exatamente nas 15 teclas"""
    best = None
    for p in PITCH_OUT:
        for sh in (-36, -24, -12, 0, 12, 24, 36):
            keys = set(layer_range(instr, p))
            hit = sum(1 for n in notes if n + sh in keys)
            cand = (hit, -abs(sh), p == prefer, p, sh)
            if best is None or cand[:3] > best[:3]:
                best = cand
    return best[3], best[4], best[0]


def auto_config_tracks(tracks, a, b, name, tpb=480, max_layers=12):
    q16 = tpb // 4
    groups = []  # (instrumento, [tracks])
    pitched = []
    for t in tracks:
        if t['drum']:
            continue
        ev = [e for e in t['notes'] if a <= e[0] < b]
        if len(ev) < 4:
            continue
        pitched.append((t, ev))
    # junta tracks idênticas (dobras em uníssono)
    sig = {}
    for t, ev in pitched:
        k = tuple(sorted((round(e[0] / q16), e[2]) for e in ev))
        sig.setdefault(k, []).append(t['idx'])
    uniq = [(ids, next(t for t, _ in pitched if t['idx'] == ids[0])) for ids in sig.values()]
    for ids, t in uniq:
        groups.append([gm_instrument(t['prog']), ids])
    # muitas layers: junta as do mesmo instrumento
    if len(groups) > max_layers:
        by = collections.OrderedDict()
        for ins, ids in groups:
            by.setdefault(ins, []).extend(ids)
        groups = [[k, v] for k, v in by.items()]
    allnotes = [e[2] for t, ev in pitched for e in ev]
    song_key = best_key(allnotes) if allnotes else 'C'
    parts = []
    count = collections.Counter(g[0] for g in groups)
    seen = collections.Counter()
    for ins, ids in groups:
        notes = [e[2] for t in tracks if t['idx'] in ids for e in t['notes'] if a <= e[0] < b]
        p, sh, hit = best_layer(notes, ins, prefer=song_key)
        keys = set(layer_range(ins, p))
        left = [n for n in notes if n + sh not in keys]  # fora da escala OU fora do alcance
        aux = []
        if left:
            best2 = max(PITCH_OUT, key=lambda q: sum(1 for n in left if n + sh in set(layer_range(ins, q))))
            gain = sum(1 for n in left if n + sh in set(layer_range(ins, best2)))
            if gain >= max(2, 0.01 * len(notes)):
                aux = [best2]
        seen[ins] += 1
        alias = ins + (f' {seen[ins]}' if count[ins] > 1 else '')
        parts.append({'instrument': ins, 'tracks': ids, 'pitch': p, 'shift': sh, 'aux_pitches': aux,
                      'alias': alias, 'volume': 100, 'aux': True, 'extend_range': True})
    return {'name': name, 'start_tick': a, 'end_tick': b, 'grid': 'auto', 'pitch': song_key,
            'parts': parts, 'drum_volume': {'Drum': 80, 'DunDun': 100}}


def cmd_auto(args):
    m, tracks, meta = read_midi(args.midi)
    if args.mode == 'tracks':
        cfg = auto_config_tracks(tracks, args.start, args.end, args.name, tpb=m.ticks_per_beat)
    else:
        cfg = auto_config(tracks, args.start, args.end, args.name, third_below=args.third_below, tpb=m.ticks_per_beat)
    cfgpath = args.output.replace('.skysheet.json', '') + '.config.json'
    json.dump(cfg, open(cfgpath, 'w'), indent=1, ensure_ascii=False)
    args.config = cfgpath
    cmd_convert(args)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('info'); p.add_argument('midi'); p.add_argument('--start', type=int); p.add_argument('--end', type=int)
    p = sp.add_parser('convert'); p.add_argument('midi'); p.add_argument('config')
    p.add_argument('-o', '--output', required=True); p.add_argument('--template')
    p = sp.add_parser('auto'); p.add_argument('midi'); p.add_argument('--start', type=int, required=True)
    p.add_argument('--end', type=int, required=True); p.add_argument('--name', default='Sem nome')
    p.add_argument('--third-below', action='store_true')
    p.add_argument('--mode', choices=['tracks', 'roles'], default='tracks',
                   help='tracks: uma layer por track do MIDI (instrumento pelo programa GM); roles: melodia/baixo/etc')
    p.add_argument('-o', '--output', required=True); p.add_argument('--template')
    args = ap.parse_args()
    {'info': cmd_info, 'convert': cmd_convert, 'auto': cmd_auto}[args.cmd](args)

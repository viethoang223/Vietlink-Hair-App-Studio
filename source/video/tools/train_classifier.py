"""Trains the clip-type classifier used by the video studio (hair swing C vs close-up B) and writes
video/src/classifier.json, which build.py embeds in the page.

Features per clip, computed exactly as the browser does:
  - motion (4 numbers): mean frame difference, centre/edge motion ratio (capped at 6), burstiness, horizontal pan,
    from 64x36 grey frames at 5 fps over the first 20 s;
  - looks (512 numbers): CLIP ViT-B/32 image embedding (Xenova/clip-vit-base-patch32, vision_model_quantized.onnx,
    the same file transformers.js loads with dtype q8), mean of frames at 25/50/75% of the clip, L2-normalised.
Labels come from vietlink-hair/jobs/*.json (video_type). Wide pan (3 clips) and factory (none) are too few to learn.

Run: python video/tools/train_classifier.py   (needs ffmpeg, numpy, pillow, onnxruntime; model in test/clipmodel/)
"""
import io, json, glob, os, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
JOBS = ROOT.parent / 'vietlink-hair' / 'jobs'
MODEL = ROOT / 'test' / 'clipmodel' / 'vision_model_quantized.onnx'
CACHE = ROOT / 'test' / 'clip_features.npz'
MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)


def motion(path):
    W, H = 64, 36
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-t', '20', '-vf', f'fps=5,scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    d = np.abs(np.diff(fr, axis=0))
    c = d[:, 9:27, 16:48].mean(); e = np.concatenate([d[:, :, :12].ravel(), d[:, :, -12:].ravel()]).mean()
    m = d.mean(axis=(1, 2))
    prof = fr.mean(axis=1); shifts = []
    for a, b in zip(prof[:-1], prof[1:]):
        shifts.append(min(range(-6, 7), key=lambda s: np.abs(np.roll(a, s) - b)[8:-8].mean()))
    return [float(d.mean()), float(min(c / (e + 1e-3), 6)), float(m.std() / (m.mean() + 1e-3)), float(np.abs(shifts).mean())]


def preprocess(img):
    """CLIP preprocessing as in transformers.js: shortest edge 224 (bicubic), centre crop 224, rescale, normalise."""
    img = img.convert('RGB'); w, h = img.size; k = 224 / min(w, h)
    img = img.resize((max(224, round(w * k)), max(224, round(h * k))), Image.BICUBIC)
    w, h = img.size; l, t = (w - 224) // 2, (h - 224) // 2
    a = (np.asarray(img.crop((l, t, l + 224, t + 224)), np.float32) / 255 - MEAN) / STD
    return a.transpose(2, 0, 1)


def looks(sess, path, dur):
    batch = []
    for f in (.25, .5, .75):
        png = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{dur * f:.2f}', '-i', path, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
        batch.append(preprocess(Image.open(io.BytesIO(png))))
    emb = sess.run(None, {'pixel_values': np.stack(batch)})[0]
    emb /= np.linalg.norm(emb, axis=1, keepdims=True)
    v = emb.mean(0); return (v / np.linalg.norm(v)).tolist()


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip() or 0)


def load():
    if CACHE.exists():
        z = np.load(CACHE, allow_pickle=True); return z['M'], z['E'], z['y'], list(z['names'])
    items = []
    for f in sorted(glob.glob(str(JOBS / '*.json'))):
        if f.endswith('.transcript.json'): continue
        j = json.load(open(f, encoding='utf-8'))
        if j.get('video_type') in ('A', 'B', 'C') and os.path.exists(j.get('source', '')): items.append((j['source'], j['video_type']))
    seen, uniq = set(), []
    for p, t in items:
        if p not in seen: seen.add(p); uniq.append((p, t))
    sess = ort.InferenceSession(str(MODEL))
    M, E, y, names = [], [], [], []
    for n, (p, t) in enumerate(uniq):
        try:
            M.append(motion(p)); E.append(looks(sess, p, duration(p))); y.append(t); names.append(os.path.basename(p))
        except Exception as ex: print('skip', p, ex)
        if n % 20 == 0: print(n, '/', len(uniq), flush=True)
    M, E, y = np.array(M, np.float32), np.array(E, np.float32), np.array(y)
    np.savez(CACHE, M=M, E=E, y=y, names=np.array(names)); return M, E, y, names


def fit(X, y, lam=1.0, steps=3000, lr=.1):
    """Logistic regression (y=1 for C), L2 on weights, plain gradient descent."""
    w = np.zeros(X.shape[1]); b = 0.0
    for _ in range(steps):
        p = 1 / (1 + np.exp(-(X @ w + b))); g = p - y
        w -= lr * (X.T @ g / len(y) + lam * w / len(y)); b -= lr * g.mean()
    return w, b


def cv(X, y, lam, folds=5, seed=0):
    idx = np.random.default_rng(seed).permutation(len(y)); ok = 0
    for k in range(folds):
        te = idx[k::folds]; tr = np.setdiff1d(idx, te)
        mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-6
        w, b = fit((X[tr] - mu) / sd, y[tr], lam)
        ok += (((X[te] - mu) / sd @ w + b > 0) == y[te]).sum()
    return ok / len(y)


def main():
    M, E, y, names = load()
    print('clips', dict(zip(*np.unique(y, return_counts=True))))
    keep = (y == 'B') | (y == 'C'); Mb, Eb, yb = M[keep], E[keep], (y[keep] == 'C').astype(float)
    results = {}
    for name, X in [('motion', Mb), ('looks', Eb), ('both', np.hstack([Mb, Eb]))]:
        best = max(((cv(X, yb, lam), lam) for lam in (.3, 1, 3, 10, 30, 100)), key=lambda r: r[0])
        results[name] = best; print(f'{name:7s} 5-fold accuracy {best[0]:.0%} (lambda {best[1]})')
    acc, lam = results['both']
    X = np.hstack([Mb, Eb]); mu, sd = X.mean(0), X.std(0) + 1e-6
    w, b = fit((X - mu) / sd, yb, lam)
    out = {'about': 'Clip type classifier (C hair swing vs B close-up). Features: 4 motion numbers then 512 CLIP numbers. '
                    'score = sum(((x - mean) / std) * w) + b; score > 0 means C. Trained by video/tools/train_classifier.py.',
           'model': 'Xenova/clip-vit-base-patch32', 'dtype': 'q8', 'cv_accuracy': round(float(acc), 3),
           'cv_motion_only': round(float(results['motion'][0]), 3), 'n': {'B': int((yb == 0).sum()), 'C': int((yb == 1).sum())},
           'mean': [round(float(v), 6) for v in mu], 'std': [round(float(v), 6) for v in sd], 'w': [round(float(v), 6) for v in w], 'b': round(float(b), 6)}
    (ROOT / 'video' / 'src' / 'classifier.json').write_text(json.dumps(out), encoding='utf-8')
    print('wrote video/src/classifier.json')


if __name__ == '__main__':
    main()

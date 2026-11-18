"""Sound design for the Le Pontias ad — fully synthesised (no samples).

Timings mirror src/PontiasAd.tsx (30 fps):
  - entrance (phone settles)       frames 0-42
  - camera orbit ("travel")        frames 0-270, cubic-bezier(.33,0,.4,1)
  - haptic buzz                    frames 100-109 and 113-122
  - notification spring            frame 106
  - camera push-in                 frames 128-228, cubic-bezier(.65,0,.35,1)

Output: public/soundtrack.wav (48 kHz, stereo, float32)
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
FPS = 30
DUR = 9.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(19112026)

T_BUZZ = 100 / FPS
T_NOTIF = 106 / FPS
T_PUSH_START = 128 / FPS
T_PUSH_END = 228 / FPS


# ---------------------------------------------------------------- helpers
def cubic_bezier(x1, y1, x2, y2):
    """CSS-style cubic-bezier easing, vectorised."""
    def bez(u, p1, p2):
        return 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u ** 2 * p2 + u ** 3

    def ease(x):
        x = np.clip(x, 0, 1)
        lo = np.zeros_like(x)
        hi = np.ones_like(x)
        for _ in range(40):  # bisection on x(u) = x
            mid = (lo + hi) / 2
            too_big = bez(mid, x1, x2) > x
            hi = np.where(too_big, mid, hi)
            lo = np.where(too_big, lo, mid)
        return bez((lo + hi) / 2, y1, y2)

    return ease


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lowpass(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def highpass(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def time_varying_bandpass(x, centre, q=1.4, block=256):
    """Swept band-pass: process in blocks with per-block filter (state kept)."""
    out = np.zeros_like(x)
    zi = None
    for s in range(0, len(x), block):
        c = float(np.clip(centre[min(s, len(centre) - 1)], 60, SR / 2.3))
        bw = c / q
        sos = butter(2, [max(30, c - bw / 2), min(SR / 2.1, c + bw / 2)],
                     btype="band", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[s:s + block], zi = sosfilt(sos, x[s:s + block], zi=zi)
    return out


def env_adsr(n, a, d, s_level, r, sustain_len):
    a_n, d_n, r_n, s_n = (int(v * SR) for v in (a, d, r, sustain_len))
    e = np.concatenate([
        np.linspace(0, 1, a_n, endpoint=False) ** 0.6,
        np.linspace(1, s_level, d_n, endpoint=False),
        np.full(s_n, s_level),
        np.linspace(s_level, 0, r_n) ** 1.5,
    ])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def place(buf, sig, at, pan=0.0, gain=1.0):
    """Mix mono `sig` into stereo `buf` at time `at` (s) with equal-power pan."""
    i = int(at * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i] * gain
    ang = (pan + 1) * np.pi / 4
    buf[i:i + len(sig), 0] += sig * np.cos(ang)
    buf[i:i + len(sig), 1] += sig * np.sin(ang)


def reverb_ir(seconds=1.6, decay=3.2, bright=6000):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    ir = np.stack([rng.standard_normal(n), rng.standard_normal(n)], axis=1)
    ir *= np.exp(-decay * tt)[:, None]
    ir = np.stack([lowpass(ir[:, 0], bright), lowpass(ir[:, 1], bright)], axis=1)
    ir[: int(0.012 * SR)] = 0  # pre-delay
    return ir / np.abs(ir).sum(axis=0).max() * 6


# ------------------------------------------------- camera speed envelopes
frames = t * FPS
travel = cubic_bezier(0.33, 0.0, 0.4, 1)(frames / 270)
push = cubic_bezier(0.65, 0, 0.35, 1)((frames - 128) / 100)
enter = cubic_bezier(0.16, 1, 0.3, 1)(frames / 42)

# approximate camera speeds (normalised) — same weights as the camera rig
v_travel = np.gradient(travel) * SR
v_push = np.gradient(push) * SR
v_enter = np.gradient(enter) * SR
v_travel /= v_travel.max()
v_push /= v_push.max()
v_enter /= v_enter.max()

mix = np.zeros((N, 2))
fx_dry = np.zeros((N, 2))  # elements that stay mostly dry (haptics)

# ------------------------------------------------------ 1. entrance whoosh
# Phone descends from the white: airy swell that "lands" with the settle.
n_in = int(1.5 * SR)
noise = rng.standard_normal(n_in)
tt = np.arange(n_in) / SR
centre = 3800 * np.exp(-tt * 2.4) + 380
w = time_varying_bandpass(noise, centre, q=1.1)
shape = np.clip(np.interp(tt, [0, 0.12, 0.45, 0.75, 1.5], [0, 0.7, 1, 0.35, 0]), 0, 1)
place(mix, w * shape, 0.0, pan=-0.25, gain=0.3)
place(mix, w * shape, 0.015, pan=0.35, gain=0.22)

# landing: soft low thump + tiny glass/metal contact click
n_th = int(0.5 * SR)
tt = np.arange(n_th) / SR
thump = np.sin(2 * np.pi * (70 + 40 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 14)
click = highpass(rng.standard_normal(n_th), 3500) * np.exp(-tt * 160)
place(mix, thump, 0.62, gain=0.42)
place(mix, click, 0.62, pan=0.1, gain=0.05)

# ------------------------------------------- 2. orbit "air" (camera motion)
# Continuous, very soft air whose level and brightness follow camera speed.
air_noise = rng.standard_normal(N)
speed = np.clip(0.55 * v_travel + 1.0 * v_push + 0.35 * v_enter, 0, None)
speed_s = lowpass(speed, 3)  # smooth
air_centre = 450 + 2600 * speed_s
air = time_varying_bandpass(air_noise, air_centre, q=0.9)
air_l = air * speed_s * 0.11
air_r = time_varying_bandpass(rng.standard_normal(N), air_centre * 1.08, q=0.9) * speed_s * 0.11
fade = np.clip(np.interp(t, [0, 0.4, 8.4, 9.0], [0, 1, 1, 0]), 0, 1)
mix[:, 0] += air_l * fade
mix[:, 1] += air_r * fade

# --------------------------------------- 3. push-in whoosh (direction change)
# Reverse "inhale" into the push, a broad whoosh at peak speed, then a settle.
n_p = int((T_PUSH_END - T_PUSH_START + 0.6) * SR)
tt = np.arange(n_p) / SR
p_env = np.interp(tt, [0, 0.5, 1.66, 2.6, 3.33, 3.9], [0, 0.25, 1, 0.45, 0.08, 0])
p_centre = np.interp(tt, [0, 1.66, 3.33, 3.9], [500, 2400, 700, 400])
pw = time_varying_bandpass(rng.standard_normal(n_p), p_centre, q=1.0)
pw2 = time_varying_bandpass(rng.standard_normal(n_p), p_centre * 0.92, q=1.0)
place(mix, pw * p_env, T_PUSH_START, pan=0.3, gain=0.24)
place(mix, pw2 * p_env, T_PUSH_START + 0.02, pan=-0.3, gain=0.2)
# low sweep under the push (sub "movement" body)
sweep = np.sin(2 * np.pi * np.cumsum(np.interp(tt, [0, 1.66, 3.33], [55, 90, 48])) / SR)
place(mix, lowpass(sweep, 140) * p_env ** 1.5, T_PUSH_START, gain=0.16)

# settle at end of push: soft sub drop + airy shimmer tail
n_s = int(1.6 * SR)
tt = np.arange(n_s) / SR
sub = np.sin(2 * np.pi * (52 + 30 * np.exp(-tt * 8)) * tt) * np.exp(-tt * 3.2) * np.clip(tt / 0.03, 0, 1)
place(mix, sub, T_PUSH_END - 0.08, gain=0.3)
shimmer = highpass(rng.standard_normal(n_s), 6000) * np.exp(-tt * 3.5) * np.clip(tt / 0.25, 0, 1)
place(mix, shimmer, T_PUSH_END - 0.15, pan=-0.2, gain=0.012)
place(mix, highpass(rng.standard_normal(n_s), 6500) * np.exp(-tt * 3.5) * np.clip(tt / 0.25, 0, 1),
      T_PUSH_END - 0.12, pan=0.25, gain=0.012)

# ----------------------------------------------------- 4. haptic vibration
# Linear-resonant-actuator buzz on a hard table: ~170 Hz motor + rattle.
def buzz(length):
    n = int(length * SR)
    tt = np.arange(n) / SR
    f0 = 172 + 3 * np.sin(2 * np.pi * 7 * tt)
    phase = 2 * np.pi * np.cumsum(f0) / SR
    motor = np.tanh(2.2 * np.sin(phase))  # soft-square: rich harmonics
    rattle = bandpass(rng.standard_normal(n), 700, 2600) * (0.5 + 0.5 * np.sin(phase)) ** 4
    body = lowpass(motor, 900) + 0.35 * rattle
    table = bandpass(body, 120, 420) * 0.6  # table resonance
    e = env_adsr(n, 0.012, 0.04, 0.85, 0.05, length - 0.1)
    return (body * 0.7 + table) * e

for k, start in enumerate([T_BUZZ, T_BUZZ + 13 / FPS]):
    b = buzz(0.3)
    place(fx_dry, b, start, pan=0.05 * (-1) ** k, gain=0.12)

# ------------------------------------------------ 5. notification chime
# Original two-note glassy chime (FM bell), not Apple's tri-tone.
def bell(freq, length=1.6, index=2.2, ratio=3.5):
    n = int(length * SR)
    tt = np.arange(n) / SR
    mod_env = np.exp(-tt * 9)
    mod = index * mod_env * np.sin(2 * np.pi * freq * ratio * tt)
    car = np.sin(2 * np.pi * freq * tt + mod)
    car += 0.25 * np.sin(2 * np.pi * freq * 2.01 * tt) * np.exp(-tt * 6)
    att = np.clip(tt / 0.003, 0, 1)
    return car * att * np.exp(-tt * 3.4)

chime_at = T_NOTIF + 0.03
place(mix, bell(1318.5), chime_at, pan=-0.12, gain=0.30)          # E6
place(mix, bell(1975.5, index=1.6), chime_at + 0.115, pan=0.12, gain=0.27)  # B6
place(mix, bell(659.25, length=1.2, index=0.8, ratio=2), chime_at, gain=0.09)  # soft body

# ---------------------------------------------------------- reverb & master
ir = reverb_ir()
wet = np.stack([
    fftconvolve(mix[:, 0], ir[:, 0])[:N],
    fftconvolve(mix[:, 1], ir[:, 1])[:N],
], axis=1)
dry_haptic_wet = np.stack([
    fftconvolve(fx_dry[:, 0], ir[:, 0] * 0.25)[:N],
    fftconvolve(fx_dry[:, 1], ir[:, 1] * 0.25)[:N],
], axis=1)
out = mix + 0.22 * wet + fx_dry + 0.15 * dry_haptic_wet

# gentle master: high-pass rumble, soft-clip, fade out, normalise to -1 dBFS
out = np.stack([highpass(out[:, c], 28) for c in range(2)], axis=1)
out = np.tanh(out * 1.2) / np.tanh(1.2)
out *= np.clip(np.interp(t, [0, 0.01, 8.6, 9.0], [0, 1, 1, 0]), 0, 1)[:, None]
out *= 10 ** (-1 / 20) / np.abs(out).max()

wavfile.write("public/soundtrack.wav", SR, out.astype(np.float32))
print("peak", np.abs(out).max(), "rms dBFS", 20 * np.log10(np.sqrt((out ** 2).mean())))

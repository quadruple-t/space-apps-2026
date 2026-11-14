"""Interpolation step test: fetch 10-min sub-point series, subsample, interpolate, compare."""
import math
from hz import query, table
from compare import COMMON, SITES, topo_azel, vec, angdiff, R_MOON

span = {"START_TIME": "'2027-03-01 00:00'", "STOP_TIME": "'2027-05-01 00:00'", "STEP_SIZE": "'10 m'"}
d, url = query({**COMMON, **span, "COMMAND": "'301'", "CENTER": "'500@399'", "QUANTITIES": "'14,15,19,20'"}, "fine")
hdr, rows, raw = table(d)
print("rows", len(rows), url)
S = [vec(float(r[6]), float(r[5]), float(r[7])) for r in rows]   # Sun vec, Moon-ME frame, km
E = [vec(float(r[4]), float(r[3]), float(r[9])) for r in rows]   # Earth vec
N = len(rows)

def lin(P, i0, k, f):
    a, b = P[i0], P[i0 + k]
    return tuple(a[j] + (b[j] - a[j]) * f for j in range(3))

def cubic(P, i0, k, f):
    """Catmull-Rom (cubic Hermite with central-difference tangents) on Cartesian vectors."""
    im1 = max(i0 - k, 0); ip2 = min(i0 + 2 * k, N - 1)
    p0, p1, p2, p3 = P[im1], P[i0], P[i0 + k], P[ip2]
    f2, f3 = f * f, f * f * f
    return tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * f + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * f2
                        + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * f3) for j in range(3))

def latlon_r(v):
    r = math.sqrt(sum(c * c for c in v))
    return math.degrees(math.asin(v[2] / r)), math.degrees(math.atan2(v[1], v[0])), r

def ang(a, b):
    na = math.sqrt(sum(c*c for c in a)); nb = math.sqrt(sum(c*c for c in b))
    c = sum(a[i]*b[i] for i in range(3)) / (na*nb)
    return math.degrees(math.acos(max(-1, min(1, c))))

print(f"{'step':>5} {'method':>6} | {'Sun dir max':>11} {'Earth dir max':>13} | {'Sun maxdEl':>10} {'Sun max dAz*cosEl':>17} | {'Earth maxdEl':>12} {'Earth max dAz*cosEl':>19}")
for step_min in [60, 120, 180, 240, 360, 720, 1440]:
    k = step_min // 10
    for name, fn in [("linear", lin), ("cubic", cubic)]:
        worst = dict(sd=0, ed=0, sel=0, saz=0, eel=0, eaz=0)
        for i in range(k, N - 2 * k):
            if i % k == 0: continue
            i0 = (i // k) * k; f = (i - i0) / k
            si, ei = fn(S, i0, k, f), fn(E, i0, k, f)
            worst["sd"] = max(worst["sd"], ang(si, S[i])); worst["ed"] = max(worst["ed"], ang(ei, E[i]))
            if i % 3: continue  # az/el on every 3rd point to save time
            for _, lat, lon in SITES:
                for key, vi, vt in (("s", si, S[i]), ("e", ei, E[i])):
                    la, lo, r = latlon_r(vi); az1, el1 = topo_azel(lat, lon, la, lo, r)
                    la, lo, r = latlon_r(vt); az0, el0 = topo_azel(lat, lon, la, lo, r)
                    worst[key+"el"] = max(worst[key+"el"], abs(el1 - el0))
                    worst[key+"az"] = max(worst[key+"az"], abs(angdiff(az1, az0)) * math.cos(math.radians(el0)))
        print(f"{step_min/60:>4.0f}h {name:>6} | {worst['sd']:11.5f} {worst['ed']:13.5f} | {worst['sel']:10.5f} {worst['saz']:17.5f} | {worst['eel']:12.5f} {worst['eaz']:19.5f}")

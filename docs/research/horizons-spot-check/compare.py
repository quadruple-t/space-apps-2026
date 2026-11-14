"""Compare client-side topocentric az/el (from global sub-point series) vs Horizons direct topocentric."""
import math, json, os
from hz import query, table

R_MOON = 1737.4
SITES = [("Apollo 11", 0.67408, 23.47297), ("Shackleton rim", -89.45, -137.31),
         ("S-pole -84.8/33.0", -84.8, 33.0), ("-69.37/32.32", -69.37, 32.32), ("-45.46/177.59", -45.46, 177.59)]
SPAN = {"START_TIME": "'2027-03-01 00:00'", "STOP_TIME": "'2027-03-31 00:00'", "STEP_SIZE": "'5 h'"}
COMMON = {"OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'", "TIME_TYPE": "'UT'",
          "APPARENT": "'AIRLESS'", "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'", "RANGE_UNITS": "'KM'"}

def subpoints(span):
    d, url = query({**COMMON, **span, "COMMAND": "'301'", "CENTER": "'500@399'", "QUANTITIES": "'14,15,19,20'"}, "subpts")
    hdr, rows, raw = table(d)
    out = []
    for r in rows:
        out.append(dict(t=r[0], eLon=float(r[3]), eLat=float(r[4]), sLon=float(r[5]), sLat=float(r[6]),
                        sR=float(r[7]), eR=float(r[9])))
    return out, url, raw

def vec(lat, lon, r=1.0):
    la, lo = math.radians(lat), math.radians(lon)
    return (r*math.cos(la)*math.cos(lo), r*math.cos(la)*math.sin(lo), r*math.sin(la))

def topo_azel(site_lat, site_lon, sub_lat, sub_lon, dist, h=0.0):
    """Topocentric az (0=N, cw) / el (deg) of a body whose sub-point on the Moon is (sub_lat, sub_lon)
    at distance dist (km, from Moon centre), seen from a site on a sphere of radius R_MOON+h."""
    la, lo = math.radians(site_lat), math.radians(site_lon)
    up = (math.cos(la)*math.cos(lo), math.cos(la)*math.sin(lo), math.sin(la))
    east = (-math.sin(lo), math.cos(lo), 0.0)
    north = (-math.sin(la)*math.cos(lo), -math.sin(la)*math.sin(lo), math.cos(la))
    b = vec(sub_lat, sub_lon, dist)
    v = tuple(b[i] - (R_MOON + h)*up[i] for i in range(3))
    n = math.sqrt(sum(c*c for c in v))
    dot = lambda a, c: sum(a[i]*c[i] for i in range(3))
    el = math.degrees(math.asin(dot(v, up)/n))
    az = math.degrees(math.atan2(dot(v, east), dot(v, north))) % 360.0
    return az, el

def angdiff(a, b):
    return (a - b + 180.0) % 360.0 - 180.0

if __name__ == "__main__":
    sp, sp_url, _ = subpoints(SPAN)
    print("sub-point URL:", sp_url, "rows:", len(sp))
    results = {}
    for tgt, name in [("10", "Sun"), ("399", "Earth")]:
        allaz, allel, allazc = [], [], []
        for sname, lat, lon in SITES:
            d, url = query({**COMMON, **SPAN, "COMMAND": f"'{tgt}'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
                            "SITE_COORD": f"'{lon},{lat},0'", "QUANTITIES": "'4'"}, "topo")
            hdr, rows, raw = table(d)
            assert len(rows) == len(sp)
            daz, del_, dazc = [], [], []
            for r, s in zip(rows, sp):
                assert r[0] == s["t"], (r[0], s["t"])
                az_h, el_h = float(r[3]), float(r[4])
                if name == "Sun":
                    az_c, el_c = topo_azel(lat, lon, s["sLat"], s["sLon"], s["sR"])
                else:
                    az_c, el_c = topo_azel(lat, lon, s["eLat"], s["eLon"], s["eR"])
                da = abs(angdiff(az_c, az_h)); de = abs(el_c - el_h)
                daz.append(da); del_.append(de); dazc.append(da*math.cos(math.radians(el_h)))
            results[(name, sname)] = dict(n=len(daz), az_max=max(daz), az_mean=sum(daz)/len(daz),
                azc_max=max(dazc), el_max=max(del_), el_mean=sum(del_)/len(del_), url=url,
                sample=(rows[0][0], rows[0][3], rows[0][4]))
            allaz += daz; allel += del_; allazc += dazc
            print(f"{name:5s} {sname:20s} n={len(daz)} |dAz| max {max(daz):.5f} mean {sum(daz)/len(daz):.5f}  "
                  f"|dAz*cosEl| max {max(dazc):.5f}  |dEl| max {max(del_):.5f} mean {sum(del_)/len(del_):.5f}")
        print(f"{name} ALL: |dAz| max {max(allaz):.5f} mean {sum(allaz)/len(allaz):.5f}; |dEl| max {max(allel):.5f} mean {sum(allel)/len(allel):.5f}")
    json.dump({f"{k[0]}|{k[1]}": v for k, v in results.items()}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results", "compare-results.json"), "w"), indent=1)

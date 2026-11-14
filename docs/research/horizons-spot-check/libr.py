import math
from hz import query, table
from compare import COMMON, SITES, topo_azel, angdiff
d,_ = query({**COMMON, "START_TIME": "'2027-03-01 00:00'", "STOP_TIME": "'2027-05-01 00:00'", "STEP_SIZE": "'10 m'",
             "COMMAND": "'301'", "CENTER": "'500@399'", "QUANTITIES": "'14,15,19,20'"}, "fine")
rows = table(d)[1]
eLon = [((float(r[3])+180)%360)-180 for r in rows]; eLat=[float(r[4]) for r in rows]; sLat=[float(r[6]) for r in rows]; eR=[float(r[9]) for r in rows]
print("sub-Earth lon range", min(eLon), max(eLon), "lat range", min(eLat), max(eLat))
print("sub-Sun lat range", min(sLat), max(sLat), "Earth dist km", min(eR), max(eR))
# effect of ignoring parallax (treating Earth as infinitely far) and of ignoring Sun distance
w_e = 0; w_s = 0
for r in rows[::6]:
    for _,lat,lon in SITES:
        a1,e1 = topo_azel(lat,lon,float(r[4]),float(r[3]),float(r[9]))
        a2,e2 = topo_azel(lat,lon,float(r[4]),float(r[3]),1e12)
        w_e = max(w_e, abs(e1-e2), abs(angdiff(a1,a2))*math.cos(math.radians(e1)))
        a1,e1 = topo_azel(lat,lon,float(r[6]),float(r[5]),float(r[7]))
        a2,e2 = topo_azel(lat,lon,float(r[6]),float(r[5]),1e12)
        w_s = max(w_s, abs(e1-e2), abs(angdiff(a1,a2))*math.cos(math.radians(e1)))
print("max error from ignoring parallax: Earth", w_e, "deg; Sun", w_s, "deg")

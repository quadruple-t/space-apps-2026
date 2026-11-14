import json, base64, struct, math
from hz import query, table
from compare import COMMON, topo_azel
# Apollo 11 client-math check from the geocentric sub-point row
d,_ = query({**COMMON, "TLIST": "'1969-07-20 20:17:40'", "TLIST_TYPE": "'CAL'", "TIME_DIGITS": "'SECONDS'",
             "COMMAND": "'301'", "CENTER": "'500@399'", "QUANTITIES": "'14,15,19,20,21'"}, "sub")
r = table(d)[1][0]
eLon,eLat,sLon,sLat,sR,eR = map(float,(r[3],r[4],r[5],r[6],r[7],r[9]))
for lat,lon in [(0.67408,23.47297),(0.67416,23.47314)]:
    print("A11 client", lat, lon, "Sun", topo_azel(lat,lon,sLat,sLon,sR), "Earth", topo_azel(lat,lon,eLat,eLon,eR))

# float32 precision check across one month of real data
d,_ = query({**COMMON, "START_TIME": "'2027-03-01 00:00'", "STOP_TIME": "'2027-05-01 00:00'", "STEP_SIZE": "'10 m'",
             "COMMAND": "'301'", "CENTER": "'500@399'", "QUANTITIES": "'14,15,19,20'"}, "fine")
rows = table(d)[1]
vals = [[float(r[5]),float(r[6]),float(r[7]),float(r[3]),float(r[4]),float(r[9])] for r in rows[::6]]  # hourly
month = vals[:744]
f32 = lambda x: struct.unpack('<f', struct.pack('<f', x))[0]
maxerr = [max(abs(f32(v[i])-v[i]) for v in vals) for i in range(6)]
print("float32 max rounding err [sLon deg, sLat deg, sR km, eLon deg, eLat deg, eR km]:", maxerr)
flat = [x for v in month for x in v]
raw = struct.pack('<%df' % len(flat), *flat)
b64 = base64.b64encode(raw).decode()
js_full = json.dumps(flat, separators=(',',':'))
js_round = json.dumps([round(x,4) if i%3!=2 else (round(x) if i%6==2 else round(x,1)) for i,x in enumerate(flat)], separators=(',',':'))
print(f"one 31-day month @1h: samples={len(month)} values={len(flat)}")
print(f"  Float32 raw bytes={len(raw)}  base64 chars={len(b64)}  JSON full-precision={len(js_full)}  JSON rounded(4dp deg, 0.1 km Earth, 1 km Sun)={len(js_round)}")
print(f"  Firestore stored size: Bytes field={len(raw)}, base64 string={len(b64)+1}, number array={8*len(flat)} (8 B per double)")

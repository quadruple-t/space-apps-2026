from hz import query, table
base = {"OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
        "TLIST": "'1969-07-20 20:17:40'", "TLIST_TYPE": "'CAL'", "TIME_TYPE": "'UT'", "TIME_DIGITS": "'SECONDS'",
        "APPARENT": "'AIRLESS'", "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'", "RANGE_UNITS": "'KM'"}
tests = [
 ("A: Moon-centre obs, target Sun, q14", {"COMMAND": "'10'", "CENTER": "'500@301'", "QUANTITIES": "'14,20'"}),
 ("B: Geocentre obs, target Moon, q14,15,19,20,21", {"COMMAND": "'301'", "CENTER": "'500@399'", "QUANTITIES": "'14,15,19,20,21'"}),
 ("C: Sun-centre obs, target Moon, q14,20", {"COMMAND": "'301'", "CENTER": "'500@10'", "QUANTITIES": "'14,20'"}),
]
for name, p in tests:
    d, url = query({**base, **p}, "sub")
    print("==", name); print(url)
    try:
        hdr, rows, raw = table(d); print(hdr); print(raw[0])
    except Exception as e:
        print("ERR", str(e)[-1500:])
    r = d["result"]
    for l in r.splitlines():
        if "pole/equ" in l or "Target radii" in l or "longitude" in l.lower() and "positive" in l.lower(): print("  |", l)

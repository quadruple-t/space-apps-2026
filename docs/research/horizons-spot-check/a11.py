from hz import query, table
for site in ["23.47297,0.67408,0", "23.47314,0.67416,0"]:
    for tgt, name in [("10", "Sun"), ("399", "Earth")]:
        d, url = query({"COMMAND": f"'{tgt}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
            "SITE_COORD": f"'{site}'", "TLIST": "'1969-07-20 20:17:40'", "TLIST_TYPE": "'CAL'",
            "TIME_TYPE": "'UT'", "TIME_DIGITS": "'SECONDS'", "QUANTITIES": "'4,20'",
            "APPARENT": "'AIRLESS'", "CSV_FORMAT": "'YES'", "EXTRA_PREC": "'YES'", "RANGE_UNITS": "'KM'"}, "a11")
        hdr, rows, raw = table(d)
        print(name, site); print(" URL:", url); print(" HDR:", hdr); print(" RAW:", raw[0])
d,_=query({"COMMAND":"'10'","OBJ_DATA":"'NO'","MAKE_EPHEM":"'YES'","EPHEM_TYPE":"'OBSERVER'","CENTER":"'coord@301'","COORD_TYPE":"'GEODETIC'","SITE_COORD":"'23.47297,0.67408,0'","TLIST":"'1969-07-20 20:17:40'","TLIST_TYPE":"'CAL'","TIME_TYPE":"'UT'","TIME_DIGITS":"'SECONDS'","QUANTITIES":"'4,20'","APPARENT":"'AIRLESS'","CSV_FORMAT":"'YES'","EXTRA_PREC":"'YES'","RANGE_UNITS":"'KM'"},"a11")
print(d["result"][:4000])

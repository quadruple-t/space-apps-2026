from hz import query
from compare import COMMON
for tag, span in [("lim-big", {"START_TIME": "'2026-01-01'", "STOP_TIME": "'2036-12-31'", "STEP_SIZE": "'1 h'"}),
                  ("lim-hist", {"START_TIME": "'1969-07-13'", "STOP_TIME": "'1969-07-27'", "STEP_SIZE": "'1 h'"})]:
    d, url = query({**COMMON, **span, "COMMAND": "'301'", "CENTER": "'500@399'", "QUANTITIES": "'14,15,19,20'"}, tag)
    r = d["result"]
    print(tag, url); print(r[-800:] if "$$SOE" not in r else f"OK rows={r.count(chr(10), r.index('$$SOE'), r.index('$$EOE'))-1}")

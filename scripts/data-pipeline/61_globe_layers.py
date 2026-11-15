#!/usr/bin/env python3
"""Derive approximate 2026 lunar shower-exposure reference points from curated radiants.
Run before 60_curated.py to reproduce its meteor-streams-2026 fact sheet.
Uses NAIF pck00011 IAU_MOON (ME approximation), not precision MOON_ME ephemerides.
No rates, gravitational focusing, radiant drift, or Earth/Moon velocity correction.
"""
import datetime as dt
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CUR = ROOT / 'scripts/data-pipeline/curated'
RAD = math.pi / 180
# pck00011 BODY3_NUT_PREC_ANGLES, in degrees and degrees/day.
ANGLES = [(125.045,-.0529921),(250.089,-.1059842),(260.008,13.0120009),
          (176.625,13.3407154),(357.529,.9856003),(311.589,26.4057084),
          (134.963,13.064993),(276.617,.3287146),(34.226,1.7484877),
          (15.134,-.1589763),(119.743,.0036096),(239.961,.1643573),(25.053,12.9590088)]
RA = [-3.8787,-.1204,.0700,-.0172,0,.0072,0,0,0,-.0052,0,0,.0043]
DEC = [1.5419,.0239,-.0278,.0068,0,-.0029,.0009,0,0,.0008,0,0,-.0009]
PM = [3.561,.1208,-.0642,.0158,.0252,-.0066,-.0047,-.0046,.0028,.0052,.004,.0019,-.0044]


def subradiant(utc, ra, dec):
    # TT ~ TDB adequate for this broad educational exposure model (2026 leap seconds).
    stamp = dt.datetime.fromisoformat(utc.replace('Z','+00:00'))
    d = (stamp.timestamp() + 69.184) / 86400 + 2440587.5 - 2451545
    t = d / 36525
    angles = [(a+b*d)*RAD for a,b in ANGLES]
    alpha = (269.9949+.0031*t+sum(c*math.sin(e) for c,e in zip(RA,angles)))*RAD
    delta = (66.5392+.013*t+sum(c*math.cos(e) for c,e in zip(DEC,angles)))*RAD
    w = (38.3213+13.17635815*d-1.4e-12*d*d+sum(c*math.sin(e) for c,e in zip(PM,angles)))*RAD
    # Inertial pole, ascending node, and its perpendicular form a right-handed basis.
    pole = [math.cos(delta)*math.cos(alpha),math.cos(delta)*math.sin(alpha),math.sin(delta)]
    node = [-math.sin(alpha),math.cos(alpha),0]
    cross = [-math.sin(delta)*math.cos(alpha),-math.sin(delta)*math.sin(alpha),math.cos(delta)]
    v = [math.cos(dec*RAD)*math.cos(ra*RAD),math.cos(dec*RAD)*math.sin(ra*RAD),math.sin(dec*RAD)]
    dot = lambda a,b: sum(x*y for x,y in zip(a,b))
    x,y,z = dot(v,node),dot(v,cross),dot(v,pole)
    return math.asin(max(-1,min(1,z)))/RAD, ((math.atan2(y,x)-w)/RAD+180)%360-180


def main():
    data = json.loads((CUR/'meteorStreams.json').read_text())
    refs = json.loads((CUR/'refs.json').read_text())
    rows = []
    for stream in data['streams']:
        lat,lon = subradiant(stream['referenceUtc'],stream['raDeg'],stream['decDeg'])
        values = [('UTC',stream['referenceUtc'],'tumMeteor2026'),('RA deg',stream['raDeg'],'tumMeteor2026'),
                  ('Dec deg',stream['decDeg'],'tumMeteor2026'),('latitude deg',round(lat,4),'naifPck11'),
                  ('longitude deg',round(lon,4),'naifPck11')]
        for unit,value,source in values:
            rows.append({'label':stream['name'],'value':value,'unit':unit,'quote':'', 'source':source,'tier':'A',
                         'note':('Derived IAU_MOON sub-radiant from the TUM reference radiant. ' if source=='naifPck11' else 'TUM published reference snapshot. ')+data['note']})
    sheet = {'id':'meteor-streams-2026','title':'2026 lunar meteor-stream exposure reference snapshots','rows':rows}
    facts_path = CUR/'facts.json'
    text = facts_path.read_text()
    match = re.search(r'\{\s*"id":\s*"meteor-streams-2026"', text)
    encoded = json.dumps(sheet, ensure_ascii=False)
    if match:
        _, consumed = json.JSONDecoder().raw_decode(text[match.start():])
        text = text[:match.start()] + encoded + text[match.start()+consumed:]
    else:
        end = text.rfind('\n  ]')
        if end < 0:
            raise ValueError('Cannot locate curated fact sheets')
        text = text[:end].rstrip() + ',\n    ' + encoded + text[end:]
    facts_path.write_text(text)
    # Same SourceRef expansion as stage 60; also emit only this sheet without rewriting other data.
    expanded = [{**r,'source':{**refs[r['source']],'retrievedAt':'2026-11-14'}} for r in rows]
    target = ROOT/'data/seed/facts/meteor-streams-2026.json'
    target.write_text(json.dumps({'title':sheet['title'],'rows':expanded,'updatedAt':'2026-11-14T00:00:00Z'},indent=2)+'\n')


if __name__ == '__main__':
    main()

"""Decode a downloaded YB AllPositions3 feed; never executes remote code.
Usage: python scripts/extract-outliers-track.py /path/to/AllPositions3.bin
Source: https://cf.yb.tl/BIN/r2ak2026/AllPositions3
Team 40 is Outliers in https://cf.yb.tl/JSON/r2ak2026/RaceSetup.
"""
import json,struct,sys
from pathlib import Path
b=Path(sys.argv[1]).read_bytes(); pos=0

def read(fmt):
    global pos
    v=struct.unpack_from('>'+fmt,b,pos)[0];pos+=struct.calcsize('>'+fmt);return v
flags=read('B');epoch=read('I');target=[]
while pos<len(b):
    team=read('H');n=read('H');prev=None
    for _ in range(n):
        delta=bool(b[pos]&128)
        if delta:
            dt=read('H')&32767;lat=read('h');lon=read('h')
        else:
            dt=read('I');lat=read('i');lon=read('i')
        if flags&1:read('h')
        if flags&2:
            read('h' if delta else 'i')
            if flags&4:read('B')
        if flags&8:read('h' if delta else 'i')
        if delta:
            if prev is None:raise ValueError('Delta without anchor')
            lat+=prev[1];lon+=prev[2];timestamp=prev[0]-dt
        else:timestamp=epoch+dt
        prev=(timestamp,lat,lon)
        if team==40:target.append([timestamp,lat/1e5,lon/1e5])
target.sort()
assert target and all(-90<=r[1]<=90 and -180<=r[2]<=180 for r in target)
p=Path(__file__).resolve().parents[1]/'data/outliers-track-june-2026.json'
p.write_text(json.dumps({'source':'https://cf.yb.tl/r2ak2026','feed':'https://cf.yb.tl/BIN/r2ak2026/AllPositions3','team':'Outliers','team_id':40,'columns':['time','lat','lon'],'rows':target},separators=(',',':')))
print(f'Decoded {len(target)} Outliers positions')

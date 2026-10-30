"""Build Victoria-to-finish exhibit using only R2AK tracker coordinates.
No network requests. Source air-quality/weather values remain unchanged.
"""
import bisect,json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
root=Path(__file__).resolve().parents[1];zone=ZoneInfo('America/Vancouver')
# Official Outliers start/finishedAt from YB RaceSetup, in UTC.
race_start=1781722800;race_finish=1782409200
keys=['CO','NO','NO2','O3','CO2','PM2_5','PM1','PM10','T','RH','AQHI']
track=[r for r in json.loads((root/'data/outliers-track-june-2026.json').read_text())['rows'] if race_start<=r[0]<=race_finish]
assert track and track==sorted(track,key=lambda r:r[0])
times=[r[0] for r in track];rows=[];audit=[]
features=json.loads((root/'data/history.geojson').read_text())['features']
for f in features:
    p=f['properties'];dt=datetime.fromisoformat(p['timestamp']);time=int(dt.timestamp())
    if not race_start<=time<=race_finish:continue
    if not times[0]<=time<=times[-1]:raise ValueError('Observation outside race tracker coverage')
    j=bisect.bisect_left(times,time);match=min([track[i] for i in [j-1,j] if 0<=i<len(track)],key=lambda r:abs(r[0]-time))
    offset=match[0]-time
    rows.append([time,match[1],match[2],'yb_outliers']+[p.get(k) for k in keys]+[False,offset])
    original=(f.get('geometry') or {}).get('coordinates') or [None,None]
    audit.append({'time':time,'original_lat':original[1],'original_lon':original[0],'original_coord_source':p.get('coord_source','unspecified'),'reason':'R2AK_only_position_source','tracker_time':match[0],'tracker_lat':match[1],'tracker_lon':match[2],'offset_seconds':offset})
rows.sort(key=lambda r:r[0]);audit.sort(key=lambda r:r['time'])
meta={'source':'https://cf.yb.tl/r2ak2026','team':'Outliers','team_id':40,'position_source':'R2AK tracker only','method':'nearest timestamp; ties select earlier fix; no interpolation or extrapolation','max_offset_seconds':None,'max_actual_offset_seconds':max(abs(a['offset_seconds']) for a in audit),'race_start':race_start,'race_finish':race_finish,'race_times_source':'https://cf.yb.tl/JSON/r2ak2026/RaceSetup','matched_count':len(audit),'exact_count':sum(a['offset_seconds']==0 for a in audit),'tracker_start':times[0],'tracker_end':times[-1]}
archive={'timezone':str(zone),'columns':['time','lat','lon','coord_source']+keys+['gps_stale','tracker_offset_s'],'position_matching':meta,'route_track':{'source':'YB Tracking / Outliers','columns':['time','lat','lon'],'rows':track},'rows':rows}
(root/'data/june-2026.json').write_text(json.dumps(archive,separators=(',',':'),allow_nan=False))
(root/'data/position-matches-june-2026.json').write_text(json.dumps({'metadata':meta,'matches':audit},separators=(',',':'),allow_nan=False))
print(json.dumps(meta,indent=2));print(f'{len(rows):,} observations; {len(track):,} route fixes; {(root/"data/june-2026.json").stat().st_size:,} bytes')

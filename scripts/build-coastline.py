"""Make the inline introductory coastline from Natural Earth's 1:50m land GeoJSON.
Usage: python scripts/build-coastline.py /path/to/ne_50m_land.geojson
Projection matches heroRoute() in js/app.js. No runtime request is needed.
"""
import json,math,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def project(p):return (260+(p[0]+127.5)*math.cos(math.radians(52))*48,270-(p[1]-52)*48)
def clip_poly(points):
    for axis,bound,sign in [(0,20,1),(0,500,-1),(1,55,1),(1,475,-1)]:
        old=points;points=[]
        if not old:break
        a=old[-1];ina=sign*(a[axis]-bound)>=0
        for b in old:
            inb=sign*(b[axis]-bound)>=0
            if ina!=inb:
                t=(bound-a[axis])/(b[axis]-a[axis]);p=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];points.append(p)
            if inb:points.append(b)
            a=b;ina=inb
    return points
def segment(a,b):
    dx=b[0]-a[0];dy=b[1]-a[1];lo=0;hi=1
    for p,q in [(-dx,a[0]-20),(dx,500-a[0]),(-dy,a[1]-55),(dy,475-a[1])]:
        if p==0:
            if q<0:return None
        else:
            r=q/p
            if p<0:lo=max(lo,r)
            else:hi=min(hi,r)
            if lo>hi:return None
    return ((a[0]+lo*dx,a[1]+lo*dy),(a[0]+hi*dx,a[1]+hi*dy))
def path(points,close=False):
    out=[];last=None
    for p in points:
        if last and math.dist(p,last)<.6:continue
        out.append(('M' if not out else 'L')+f'{p[0]:.1f},{p[1]:.1f}');last=p
    return ''.join(out)+('Z' if close and out else '')
fills=[];coasts=[]
for f in json.loads(Path(sys.argv[1]).read_text())['features']:
    g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
    for poly in polys:
        for ring in poly:
            # Ignore rings with no overlap with the introductory map.
            xs=[p[0] for p in ring];ys=[p[1] for p in ring]
            if max(xs)<-136 or min(xs)>-119 or max(ys)<47 or min(ys)>57:continue
            pts=[project(p) for p in ring];clipped=clip_poly(pts)
            if len(clipped)>2:fills.append(path(clipped,True))
            chain=[]
            for a,b in zip(pts,pts[1:]):
                seg=segment(a,b)
                if seg:
                    if chain and math.dist(chain[-1],seg[0])>.1:coasts.append(path(chain));chain=[]
                    if not chain:chain.append(seg[0])
                    chain.append(seg[1])
                elif chain:coasts.append(path(chain));chain=[]
            if chain:coasts.append(path(chain))
markup='<g id="hero-land" aria-hidden="true"><path fill="#b3dcc7" fill-opacity=".055" fill-rule="evenodd" d="'+''.join(fills)+'"/><path fill="none" stroke="#8eaaa4" stroke-opacity=".55" stroke-width=".8" stroke-linejoin="round" d="'+''.join(coasts)+'"/></g>'
p=root/'index.html';s=p.read_text()
if '<g id="hero-land"' in s:s=re.sub(r'<g id="hero-land".*?</g>',markup,s,flags=re.S)
else:s=s.replace('<g id="hero-route">',markup+'<g id="hero-route">')
p.write_text(s);print('Inline coastlines:',len(markup),'bytes')

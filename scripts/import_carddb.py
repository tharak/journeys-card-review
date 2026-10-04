"""Extract the downloaded JiME Card DB scans and merge them without changing IDs."""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import subprocess
import unicodedata
from difflib import SequenceMatcher
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, ImageFilter
from scipy.fft import dctn

SITE = Path(__file__).resolve().parents[1]
ROOT = SITE.parent/'carddb'
DIST = SITE/'dist'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def normalize(text):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode().lower())


def ocr(image, psm=6):
    image = ImageOps.expand(image.convert('L').resize((image.width*3,image.height*3),Image.Resampling.BICUBIC),border=20,fill='white')
    stream=io.BytesIO();image.save(stream,format='PNG')
    for mode in dict.fromkeys((psm,6,11)):
        result=subprocess.run(['tesseract','stdin','stdout','-l','eng','--psm',str(mode),'tsv'],input=stream.getvalue(),capture_output=True,env={**os.environ,'OMP_THREAD_LIMIT':'1'})
        if result.returncode==0:break
    if result.returncode:return '',[]
    rows=list(csv.DictReader(io.StringIO(result.stdout.decode()),delimiter='\t',quoting=csv.QUOTE_NONE))
    words=[r for r in rows if r.get('text','').strip()]
    lines={}
    for r in words:
        key=tuple(r[k] for k in ('block_num','par_num','line_num'))
        lines.setdefault(key,[]).append(r['text'])
    return '\n'.join(' '.join(line) for line in lines.values()),words


def band(image, box):
    w,h=image.size
    return image.crop(tuple(round(v*(w if i%2==0 else h)) for i,v in enumerate(box)))


def title_band(image, box):
    gray=band(image,box).convert('L').point(lambda v:0 if v<105 else 255)
    text,words=ocr(gray,7)
    text=re.sub(r'\s+',' ',text).strip(' |{}[]_,;:~\\/®©"\'.')
    return text, sum(float(w['conf']) for w in words)/len(words) if words else 0


def descriptor(image):
    gray=np.asarray(image.convert('L').resize((32,32),Image.Resampling.LANCZOS),dtype=float)
    frequencies=dctn(gray,norm='ortho')[:8,:8].flatten()
    return (frequencies>np.median(frequencies[1:])).astype(int).tolist()


def extract(row):
    path=ROOT/'cards'/f"{row['id']}.json"
    if path.exists():return json.loads(path.read_text())
    image=Image.open(ROOT/row['file']).convert('RGB')
    slug=row['page_slug']; heading=row['heading']
    text,words=ocr(image)
    landscape=image.width/image.height>1.25
    category='unsorted';subcategory=heading;build_eligible=True
    if '--heroes--' in slug:
        subcategory={'dis':'Dis','freahild':'Freahild','renerien':'Renerien','calaminth':'Calaminth Took'}.get(slug.split('--')[-1],heading)
        if landscape:
            stats=sum(word in text.lower() for word in ('might','wisdom','agility','spirit'))
            category='hero-card' if stats>=2 else 'card-back';build_eligible=False
        else:category='hero'
    elif '--roles--' in slug:category='role'
    elif slug.endswith('--armors'):category='armor'
    elif slug.endswith('--hands'):category='hand-item'
    elif slug.endswith('--trinkets'):category='trinket'
    elif slug.endswith('--mounts'):category='mount'
    elif '--common-cards--' in slug:category=slug.split('--')[-1].removesuffix('s')
    elif slug.endswith('--conditions'):
        category={'Boons':'boon','Banes':'bane','Captured Escapes':'captured'}.get(heading,'unsorted');build_eligible=False
    elif slug.endswith(('--damage','--fear','--terrain')):
        category=slug.split('--')[-1];build_eligible=False
    if category in ('basic','title','weaknes'):category={'weaknes':'weakness'}.get(category,category)
    if landscape:box=(.03,.025,.54,.16)
    elif category in ('damage','fear','boon','bane','captured'):box=(.06,.025,.94,.21)
    else:box=(.08,.43,.94,.57)
    name,name_conf=title_band(image,box)
    # A complete-image OCR often recognizes titles better than the cropped banner.
    low,high=(.025,.16) if landscape else ((.025,.21) if category in ('damage','fear','boon','bane','captured') else (.43,.57))
    candidates=[]
    for r in words:
        x=(float(r['left'])+float(r['width'])/2-20)/(image.width*3)
        y=(float(r['top'])+float(r['height'])/2-20)/(image.height*3)
        if low<=y<=high and .05<=x<=.95:candidates.append(r)
    full_name=' '.join(r['text'] for r in candidates).strip(' |{}[]_,;:~\\/®©"\'.')
    full_conf=sum(float(r['conf']) for r in candidates)/len(candidates) if candidates else 0
    if full_conf>name_conf and len(normalize(full_name))>=3:name=full_name;name_conf=full_conf
    if landscape and category=='hero-card':name=subcategory
    if category=='card-back':name=f'{subcategory} · character back'
    name=name or f'{heading} {row["number"]}'
    footer,_=ocr(band(image,(.1,.90,.94,1.0)),6) if not landscape else ('',[])
    numbers=re.findall(r'\b\d{1,3}\b',footer)
    printed_number=numbers[-1] if numbers else None
    asset=f"assets/carddb/{row['id']}.webp"
    (DIST/'assets/carddb').mkdir(parents=True,exist_ok=True)
    image.save(DIST/asset,'WEBP',lossless=True,method=6)
    record={'id':row['id'],'title':name,'ocrTitle':name,'displayTitle':name,'category':category,
            'subcategory':subcategory,'image':asset,'text':text,'buildEligible':build_eligible,
            'sourceUrl':row['page'],'sourceImageUrl':row['url'],'sourceHeading':heading,
            'sourceImageNumber':row['number'],'originalImage':row['file'],
            'imageSize':{'width':image.width,'height':image.height},
            'printedCardNumber':printed_number,'footerOcr':footer,
            'ocr':{'reviewed':False,'titleConfidence':round(name_conf,1),'engine':'tesseract'},
            'phash':descriptor(image),'imageSha256':hashlib.sha256((ROOT/row['file']).read_bytes()).hexdigest()}
    write_json(path,record)
    return record


def extract_all():
    rows=json.loads((ROOT/'source/downloaded.json').read_text())
    with ThreadPoolExecutor(max_workers=6) as pool:
        records=[]
        for i,record in enumerate(pool.map(extract,rows),1):
            records.append(record)
            if i%50==0:print(f'Extracted {i}/{len(rows)}',flush=True)
    write_json(ROOT/'index.json',records)
    print(f'Extracted {len(records)} images and individual JSON records.',flush=True)


def clean_title(value):
    value=re.sub(r'[^\w\s’\'-]', ' ',value)
    value=re.sub(r'\s+',' ',value).strip(' _-')
    value=re.sub(r'^(?:[a-zA-Z]\s+)+','',value)
    value=re.sub(r'(?:\s+[a-zA-Z])+$','',value)
    return value.strip()


def refine(record):
    image=Image.open(ROOT/record['originalImage']).convert('RGB')
    category=record['category'];number=record['sourceImageNumber']
    if category=='weaknesse':category='weakness'
    if '/heroes/' in record['sourceUrl']:
        # Hero pages explicitly place the front, back, then five numbered skills.
        if number in (1,2) or (record['subcategory']=='Beorn' and number in (8,9)):
            if number in (8,9):record['subcategory']='The Great Bear'
            category='hero-card' if number in (1,8) else 'card-back'
            record['buildEligible']=False
        elif record['subcategory']=='Beorn' and number>=10:
            category='hand-item' if number==10 else 'armor'
            record['subcategory']='Beorn'
        elif record['subcategory']=='Freahild' and number==8:category='hand-item'
        else:record['printedCardNumber']=str(number-2)
    elif category=='role' and record['subcategory'] not in ('Beast-Friend','Smith'):
        record['printedCardNumber']=str(number)
    record['category']=category
    if category in ('hero-card','card-back'):
        name=record['subcategory']+(' · character back' if category=='card-back' else '')
        record.update(title=name,ocrTitle=name,displayTitle=name)
    else:
        if category in ('damage','fear','boon','bane','captured'):box=(.12,.035,.88,.17)
        elif category=='terrain':box=(.12,.04,.88,.19)
        else:box=(.16,.475,.86,.545)
        crop=band(image,box).convert('L').filter(ImageFilter.MedianFilter(3))
        candidates=[]
        for threshold in (120,140,160):
            text,words=ocr(crop.point(lambda v:0 if v<threshold else 255),7)
            name=clean_title(text)
            confidence=sum(float(w['conf']) for w in words)/len(words) if words else 0
            if len(normalize(name))>=3:candidates.append((confidence,name))
        original=clean_title(record['ocrTitle'])
        if len(normalize(original))>=3 and not re.search(r'\d',original):
            candidates.append((record['ocr']['titleConfidence'],original))
        if candidates:
            confidence,name=max(candidates)
            record.update(title=name,ocrTitle=name,displayTitle=name)
            record['ocr']['titleConfidence']=round(confidence,1)
    write_json(ROOT/'cards'/f"{record['id']}.json",record)
    return record


def refine_all():
    records=json.loads((ROOT/'index.json').read_text())
    with ThreadPoolExecutor(max_workers=6) as pool:
        records=list(pool.map(refine,records))
    write_json(ROOT/'index.json',records)
    print(f'Refined titles and source categories for {len(records)} scans.',flush=True)


def merge_all():
    data=json.loads((DIST/'data.json').read_text())
    records=json.loads((ROOT/'index.json').read_text())
    captures={r['id']:r for r in json.loads((SITE.parent/'v2/index.json').read_text())['records']}
    old=[c for c in data['cards'] if c['id'] in captures]
    by_id={c['id']:c for c in data['cards']}
    deleted=set(data.get('deletedCards',[]))
    hashes=np.asarray([descriptor(Image.open(SITE.parent/'v2'/captures[c['id']]['image'])) for c in old])
    new_hashes=np.asarray([r['phash'] for r in records])
    distances=np.count_nonzero(hashes[:,None,:]!=new_hashes[None,:,:],axis=2)
    assignments={}
    reasons={}
    def assign(index,record_id,reason):
        assignments.setdefault(index,set()).add(record_id);reasons.setdefault(index,set()).add(reason)
    def identity(record):
        source=record['source']
        if record['kind']=='character':return ('sheet',normalize(record['title']))
        if source['section_heading']=='Base Cards' and source['columns']==5:
            return ('hero',normalize(source['hero']),str(source['column']))
        return None
    def incoming_identity(record):
        if record['category']=='hero-card':return ('sheet',normalize(record['subcategory']))
        if record['category']=='hero':return ('hero',normalize(record['subcategory']),record['printedCardNumber'])
        return None
    incoming={incoming_identity(r):i for i,r in enumerate(records) if incoming_identity(r)}
    for card in old:
        key=identity(captures[card['id']])
        if key in incoming and card['id'] not in deleted:
            assign(incoming[key],card['id'],'hero page / numbered base skill')
    # Preserve distinct numbered copies and tiers. Image art alone is insufficient.
    for j,record in enumerate(records):
        if record['category'] in ('hero','hero-card','card-back'):continue
        candidates=[]
        for i,card in enumerate(old):
            if card['id'] in deleted:continue
            compatible=card['category']==record['category'] or (record['category']=='hand-item' and card['category'] in ('one-handed','two-handed','unsorted'))
            if not compatible or distances[i,j]>14:continue
            if record['category']=='role' and normalize(card.get('subcategory',''))!=normalize(record['subcategory']):continue
            capture=captures[card['id']]
            old_number=None
            if capture['source']['section_heading']=='Base Class Cards' and capture['source']['columns']==3:
                old_number=str(capture['source']['column'])
            footer=capture['texts'].get('footer','')
            if card['category']=='role':
                match=re.search(re.escape(card.get('subcategory',''))+r'\s+(\d{1,2})\b',footer,re.I) if card.get('subcategory') else None
                if match:old_number=match.group(1)
            if old_number and record['printedCardNumber'] and old_number!=record['printedCardNumber']:continue
            names=[capture['title'],card.get('displayTitle',''),card.get('ocrTitle','')]
            similarity=max(SequenceMatcher(None,normalize(name),normalize(record['title'])).ratio() for name in names if name)
            if similarity<.86:continue
            if card['category']=='role' and not old_number:
                # Unnumbered repeated role titles must have a clearly better full-image match.
                alternatives=[distances[i,k] for k,r in enumerate(records) if k!=j and r['category']=='role' and r['subcategory']==record['subcategory'] and SequenceMatcher(None,normalize(r['title']),normalize(record['title'])).ratio()>.8]
                if alternatives and min(alternatives)-distances[i,j]<4:continue
            candidates.append((card['id'],float(similarity),int(distances[i,j])))
        for record_id,similarity,distance in candidates:
            assign(j,record_id,f'title {similarity:.2f} / image distance {distance}')
    # A previously reviewed record may have several similar candidates. Keep only
    # its strongest match, retaining the other source scans as independent cards.
    reverse={}
    for j,ids in assignments.items():
        for record_id in ids:reverse.setdefault(record_id,[]).append(j)
    old_position={card['id']:i for i,card in enumerate(old)}
    for record_id,indices in reverse.items():
        if len(indices)<=1:continue
        i=old_position[record_id]
        ranked=sorted(indices,key=lambda j:(distances[i,j],-SequenceMatcher(None,normalize(captures[record_id]['title']),normalize(records[j]['title'])).ratio()))
        for j in ranked[1:]:assignments[j].discard(record_id)
    report=[];added=0;linked=0;updated=set()
    for j,record in enumerate(records):
        ids=sorted(assignments.get(j,[]))
        scan={key:record[key] for key in ('id','image','sourceUrl','sourceImageNumber','printedCardNumber','text','ocr')}
        if ids:
            linked+=1
            for record_id in ids:
                card=by_id[record_id]
                scans=[s for s in card.get('sourceScans',[]) if s['id']!=record['id']]
                card['sourceScans']=scans+[scan]
                card['sourceUrl']=record['sourceUrl'];card['sourceHeading']=record['sourceHeading']
                if not card.get('text'):card['text']=record['text'];card['ocr']=record['ocr']
                if not card.get('printedCardNumber'):card['printedCardNumber']=record['printedCardNumber']
                # Preserve the selected v2 artwork. The new scan remains available
                # in sourceScans and in the card detail image selector.
        else:
            ids=[record['id']]
            published={key:value for key,value in record.items() if key not in ('phash','originalImage','imageSha256','sourceImageUrl','footerOcr')}
            if record['id'] not in by_id:
                data['cards'].append(published);by_id[record['id']]=published
            else:
                previous=by_id[record['id']]
                for key in ('category','subcategory','displayTitle','text'):published[key]=previous.get(key,published.get(key))
                previous.update(published)
            added+=1
        record['databaseIds']=ids
        write_json(ROOT/'cards'/f"{record['id']}.json",record)
        report.append({'sourceScanId':record['id'],'databaseIds':ids,'action':'linked' if assignments.get(j) else 'added','matchReasons':sorted(reasons.get(j,[])) if assignments.get(j) else []})
    manifest={'source':'https://sites.google.com/view/jime-carddb/home','importedAt':datetime.now(timezone.utc).isoformat(),
              'pages':len(json.loads((ROOT/'source/page-urls.json').read_text())), 'scans':len(records),
              'newRecords':added,'linkedScans':linked,'updatedImages':len(updated),'databaseRecords':len(data['cards']),
              'activeRecords':sum(c['id'] not in deleted for c in data['cards']),
              'note':'Conservative identity matching; uncertain scans remain separate for review. OCR is unreviewed.', 'records':report}
    write_json(DIST/'data.json',data)
    write_json(SITE/'source/carddb-import.json',manifest)
    write_json(ROOT/'import-report.json',manifest)
    write_json(ROOT/'index.json',records)
    print(json.dumps({key:value for key,value in manifest.items() if key!='records'},indent=2),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('phase',choices=['extract','refine','merge']);args=parser.parse_args()
    {'extract':extract_all,'refine':refine_all,'merge':merge_all}[args.phase]()

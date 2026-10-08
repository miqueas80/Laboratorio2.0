/**
 * @file Local HNSW-like hierarchical navigable small-world cosine index.
 * Deterministic level assignment, bidirectional M-neighbor graph and greedy
 * approximate nearest-neighbor search. No network, runs inside search-worker.
 *
 * This is a JavaScript implementation (not a WASM HNSW library). Accuracy,
 * construction time and Android memory must be benchmarked on target hardware.
 */
function normalized(v,dimensions){
  if(!v||v.length!==dimensions)throw Error('Dimensión vectorial incompatible');
  let n=0;for(const value of v){if(!Number.isFinite(value))throw Error('Embedding inválido');n+=value*value;}
  n=Math.sqrt(n);if(n<1e-8)throw Error('Vector nulo');
  return Float32Array.from(v,x=>x/n);
}
function levelFor(id,m){
  let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);
  const u=((h>>>0)+1)/4294967297;
  return Math.min(8,Math.floor(-Math.log(u)/Math.log(m)));
}
const cosine=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s};
const score=(node,query)=>cosine(node.vector,query);
function descending(a,b){return b.score-a.score||a.id.localeCompare(b.id)}
export class HNSWIndex{
  constructor({dimension=384,m=12,efConstruction=48,efSearch=48}={}){
    if(!Number.isInteger(dimension)||dimension<1||dimension>4096)throw Error('Dimensión inválida');
    if(!Number.isInteger(m)||m<2||m>48)throw Error('Parámetro m inválido');
    if(!Number.isInteger(efConstruction)||efConstruction<m||efConstruction>256)throw Error('efConstruction inválido');
    this.dimension=dimension;this.m=m;this.efConstruction=efConstruction;this.efSearch=efSearch;
    this.nodes=new Map();this.entry=null;this.maxLevel=-1;
  }
  #neighbors(node,layer){return node.links.get(layer)||new Set()}
  #greedy(query,entry,layer){
    let current=entry,best=score(this.nodes.get(entry),query),changed=true;
    while(changed){changed=false;for(const next of this.#neighbors(this.nodes.get(current),layer)){
      const n=this.nodes.get(next);if(!n)continue;
      const value=score(n,query);if(value>best){current=next;best=value;changed=true}
    }}
    return current;
  }
  #layerSearch(query,entry,layer,ef){
    const visited=new Set([entry]);let candidates=[{id:entry,score:score(this.nodes.get(entry),query)}];
    const best=[...candidates];
    while(candidates.length){
      candidates.sort(descending);const current=candidates.shift();
      const worst=best[best.length-1]?.score??-Infinity;
      if(best.length>=ef&&current.score<worst)break;
      for(const candidate of this.#neighbors(this.nodes.get(current.id),layer)){
        if(visited.has(candidate))continue;visited.add(candidate);
        const node=this.nodes.get(candidate);if(!node)continue;
        const similarity=score(node,query);
        if(best.length>=ef&&similarity<=best[best.length-1].score)continue;
        const result={id:candidate,score:similarity};
        candidates.push(result);best.push(result);best.sort(descending);
        if(best.length>ef)best.pop();
      }
    }
    return best;
  }
  #connect(a,b,layer){
    const node=this.nodes.get(a);if(!node.links.has(layer))node.links.set(layer,new Set());
    node.links.get(layer).add(b);
    const list=node.links.get(layer);
    if(list.size>this.m){
      const sorted=[...list].map(id=>({id,score:score(this.nodes.get(id),node.vector)})).sort(descending);
      node.links.set(layer,new Set(sorted.slice(0,this.m).map(x=>x.id)));
    }
  }
  insert(id,vector){
    if(typeof id!=='string'||!id||this.nodes.has(id))throw Error('ID HNSW duplicado');
    const v=normalized(vector,this.dimension),level=levelFor(id,this.m),node={id,vector:v,level,links:new Map()};
    this.nodes.set(id,node);
    if(this.entry===null){this.entry=id;this.maxLevel=level;return}
    let entry=this.entry;
    for(let l=this.maxLevel;l>level;l--)entry=this.#greedy(v,entry,l);
    for(let l=Math.min(this.maxLevel,level);l>=0;l--){
      const nearest=this.#layerSearch(v,entry,l,this.efConstruction);
      for(const neighbor of nearest.slice(0,this.m)){this.#connect(id,neighbor.id,l);this.#connect(neighbor.id,id,l)}
      if(nearest.length)entry=nearest[0].id;
    }
    if(level>this.maxLevel){this.entry=id;this.maxLevel=level}
  }
  addAll(rows){for(const {id,vector} of rows)this.insert(id,vector);return this}
  search(query,{k=20,ef=this.efSearch}={}){
    if(this.entry===null)return [];
    const v=normalized(query,this.dimension);
    let entry=this.entry;
    for(let l=this.maxLevel;l>0;l--)entry=this.#greedy(v,entry,l);
    const results=this.#layerSearch(v,entry,0,Math.max(k,ef));
    return results.slice(0,Math.max(1,k)).map(({id,score})=>({id,similarity:score}));
  }
  stats(){return {count:this.nodes.size,dimension:this.dimension,maxLevel:this.maxLevel,m:this.m,efConstruction:this.efConstruction,efSearch:this.efSearch}}
}

import type { Match } from "./matches";

/* ── Odds ── */
const T1 = new Set(["FRA","ESP","ARG","BRA","GER","ENG","POR","NED","BEL","ITA","MCI","LIV","ARS","CHE","RMA","FCB","BAY","PSG"]);
const T2 = new Set(["URU","CRO","COL","USA","MEX","JPN","KOR","SEN","MAR","NOR","SUI","TOT","MUN","ATM","JUV","BVB"]);

function odds(a: string, b: string): [number,number,number] {
  const s1=T1.has(a)?3:T2.has(a)?2:1, s2=T1.has(b)?3:T2.has(b)?2:1, d=s1-s2;
  const s=((a+b).split("").reduce((x,c)=>x+c.charCodeAt(0),0)%100)/100;
  if(d>=2)return[+(1.3+s*.15).toFixed(2),+(4+s*.5).toFixed(2),+(5+s).toFixed(2)];
  if(d===1)return[+(1.55+s*.25).toFixed(2),+(3.4+s*.4).toFixed(2),+(3+s*.5).toFixed(2)];
  if(d===0)return[+(2.1+s*.3).toFixed(2),+(3.1+s*.3).toFixed(2),+(2.1+s*.3).toFixed(2)];
  if(d===-1)return[+(3+s*.5).toFixed(2),+(3.4+s*.4).toFixed(2),+(1.55+s*.25).toFixed(2)];
  return[+(5+s).toFixed(2),+(4+s*.5).toFixed(2),+(1.3+s*.15).toFixed(2)];
}

/* ── World Cup 2026 ── */
function worldCupFixtures(): Match[] {
  const now = Date.now();
  function mk(id:string,date:string,ko:string,t1:string,t2:string,c1:string,c2:string,venue:string,label:string,o1:number,od:number,o2:number,score?:string):Match {
    const k=new Date(ko), elapsed=now-k.getTime();
    let status:string;
    if(score) status="FINISHED";
    else if(elapsed>5700_000) status="FINISHED";
    else if(elapsed>2700_000) status="IN_PLAY";
    else if(elapsed>2400_000) status="PAUSED";
    else if(elapsed>0) status="IN_PLAY";
    else status="SCHEDULED";
    const h=k.getUTCHours().toString().padStart(2,"0"), m=k.getUTCMinutes().toString().padStart(2,"0");
    return {id,team1:t1,team2:t2,team1Code:c1,team2Code:c2,league:`FIFA World Cup 2026 — ${label}`,leagueCode:"WC",matchday:null,gameDate:date,kickoffTime:k.toISOString(),kickoffLocal:`${h}:${m} UTC`,oddsTeam1:o1,oddsDraw:od,oddsTeam2:o2,status,score:score||undefined,elapsed:status==="IN_PLAY"?Math.min(90,Math.floor(elapsed/60000)):null,venue};
  }
  return [
    mk("wc2026-3rd-fra-eng","2026-07-18","2026-07-18T21:00:00Z","France","England","FRA","ENG","Hard Rock Stadium, Miami","Third Place",1.80,3.40,3.80,"4-6"),
    mk("wc2026-final-esp-arg","2026-07-19","2026-07-19T19:00:00Z","Spain","Argentina","ESP","ARG","MetLife Stadium, New Jersey","Final",2.50,3.10,2.40),
  ];
}

/* ── football-data.org ── */
interface FdMatch {
  id:number;utcDate:string;status:string;matchday:number|null;venue:string|null;
  homeTeam:{name:string;tla:string};awayTeam:{name:string;tla:string};
  competition:{name:string;code:string};score:{fullTime:{home:number|null;away:number|null}};
}

async function fetchFootballData(): Promise<Match[]> {
  const k=process.env.FOOTBALL_DATA_API_KEY;
  const now=new Date(), end=new Date(now); end.setDate(end.getDate()+10);
  const h:HeadersInit={}; if(k) h["X-Auth-Token"]=k;
  const out:Match[]=[];
  for(const c of ["PL","PD","BL1","SA","FL1","CL","EC","WC"]) {
    try {
      const r=await fetch(`https://api.football-data.org/v4/competitions/${c}/matches?dateFrom=${now.toISOString().split("T")[0]}&dateTo=${end.toISOString().split("T")[0]}&status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED`,{headers:h,next:{revalidate:120}});
      if(!r.ok) continue;
      for(const m of ((await r.json()).matches||[]) as FdMatch[]) {
        const ko=new Date(m.utcDate);
        if((now.getTime()-ko.getTime())/3600_000>24&&m.status!=="IN_PLAY") continue;
        const [o1,od,o2]=odds(m.homeTeam.tla||"",m.awayTeam.tla||"");
        const sc=m.score?.fullTime?.home!=null?`${m.score.fullTime.home}-${m.score.fullTime.away}`:undefined;
        const hh=ko.getUTCHours().toString().padStart(2,"0"), mm=ko.getUTCMinutes().toString().padStart(2,"0");
        out.push({id:`fd-${m.id}`,team1:m.homeTeam.name,team2:m.awayTeam.name,team1Code:m.homeTeam.tla||"",team2Code:m.awayTeam.tla||"",league:m.competition.name,leagueCode:m.competition.code||c,matchday:m.matchday,gameDate:ko.toISOString().split("T")[0],kickoffTime:ko.toISOString(),kickoffLocal:`${hh}:${mm} UTC`,oddsTeam1:o1,oddsDraw:od,oddsTeam2:o2,status:m.status,score:sc,elapsed:m.status==="IN_PLAY"?Math.min(90,Math.floor((now.getTime()-ko.getTime())/60000)):null,venue:m.venue||undefined});
      }
    } catch{}
  }
  return out;
}

function dedup(matches:Match[]):Match[] {
  const seen=new Map<string,Match>();
  for(const m of matches) {
    const k=`${m.gameDate}_${m.team1}_${m.team2}`.toLowerCase();
    const ex=seen.get(k);
    if(!ex){seen.set(k,m);continue;}
    if(m.score&&!ex.score) seen.set(k,m);
    if(m.id.startsWith("fd-")) seen.set(k,m);
  }
  return Array.from(seen.values());
}

/** Get all fixtures — can be called from server components directly */
export async function getAllFixtures(): Promise<Match[]> {
  const wc = worldCupFixtures();
  const fd = await fetchFootballData().catch(()=>[]);
  const all = dedup([...wc,...fd]);
  all.sort((a,b)=>{
    const al=a.status==="IN_PLAY"||a.status==="PAUSED"?0:1;
    const bl=b.status==="IN_PLAY"||b.status==="PAUSED"?0:1;
    if(al!==bl) return al-bl;
    const aw=a.league.includes("World Cup")?0:1;
    const bw=b.league.includes("World Cup")?0:1;
    if(aw!==bw) return aw-bw;
    return new Date(a.kickoffTime).getTime()-new Date(b.kickoffTime).getTime();
  });
  return all;
}

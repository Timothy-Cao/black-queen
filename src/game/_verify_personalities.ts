import { freshGame, applyBid, applyPass, applyDeclare, applyPlay, collectTrick } from "./engine";
import { aiBidDecision, aiDeclareDecision, aiPlayDecision } from "./ai";
import { legalPlays } from "./rules";
import { setActiveHardWeights, setGen2HardWeights, DEFAULT_HARD_WEIGHTS } from "./aiHard";
import { readFileSync } from "fs";
import { AIPersonality, PlayerId } from "./types";

const g2 = JSON.parse(readFileSync("./tuned_weights_v1.json","utf8"));
const g3 = JSON.parse(readFileSync("./tuned_weights.json","utf8"));
setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...g2 });
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...g3 });

function mulberry32(a:number){return function(){a|=0;a=a+0x6D2B79F5|0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}}

function runOne(seats: AIPersonality[], seed: number): boolean[] {
  Math.random = mulberry32(seed);
  let s = freshGame(seats.map((p,i)=>({name:"P"+i,isAI:true,aiPersonality:p})), 300);
  let safety=0;
  while(s.phase!=="game_end"){
    if(safety++>100000) throw new Error("stuck");
    const r=s.round;
    if(r.phase==="bidding"){const d=aiBidDecision(s,r.bidTurn!);s=d.bid==="pass"?applyPass(s,r.bidTurn!):applyBid(s,r.bidTurn!,d.bid);}
    else if(r.phase==="declaring"){const d=aiDeclareDecision(s,r.bidder!);s=applyDeclare(s,d.trump,d.partnerCard);}
    else if(r.phase==="playing"){if(r.pendingTrickComplete)s=collectTrick(s);else{const c=aiPlayDecision(s,r.toPlay);const lg=legalPlays(s.round.hands[s.round.toPlay],s.round.currentTrick);if(!lg.some(x=>x.id===c.id))throw new Error("illegal");s=applyPlay(s,s.round.toPlay,c);}}
    else throw new Error("phase");
  }
  const r=s.round;const team=new Set<PlayerId>([r.bidder!,...(r.partners??[])]);
  const cap=([0,1,2,3,4] as PlayerId[]).filter(p=>team.has(p)).reduce<number>((a,p)=>a+(r.roundPoints?.[p]??0),0);
  const made=cap>=(r.winningBid??0);
  return ([0,1,2,3,4] as PlayerId[]).map(p=>made?team.has(p):!team.has(p));
}

function head2head(A: AIPersonality, B: AIPersonality, N: number){
  let aW=0,aS=0,bW=0,bS=0;
  for(let i=0;i<N;i++){
    const rnd=mulberry32(7+i*1009);
    const seats: AIPersonality[]=[];for(let k=0;k<5;k++)seats.push(rnd()<0.5?A:B);
    if(!seats.includes(A))seats[0]=A;if(!seats.includes(B))seats[1]=B;
    const w=runOne(seats,12345+i*7919);
    for(let k=0;k<5;k++){if(seats[k]===A){aS++;if(w[k])aW++;}else{bS++;if(w[k])bW++;}}
    const m=seats.map(s=>s===A?B:A) as AIPersonality[];
    const w2=runOne(m,12345+i*7919);
    for(let k=0;k<5;k++){if(m[k]===A){aS++;if(w2[k])aW++;}else{bS++;if(w2[k])bW++;}}
  }
  return {aR:aW/aS,bR:bW/bS};
}

const N=1500;
const m1=head2head("hard-3","hard-2",N);
const m2=head2head("hard-3","hard",N);
const m3=head2head("hard-2","hard",N);
console.log("hard-3 vs hard-2: "+((m1.aR-m1.bR)*100).toFixed(2)+"pp ("+(m1.aR*100).toFixed(1)+"% vs "+(m1.bR*100).toFixed(1)+"%)");
console.log("hard-3 vs hard:   "+((m2.aR-m2.bR)*100).toFixed(2)+"pp ("+(m2.aR*100).toFixed(1)+"% vs "+(m2.bR*100).toFixed(1)+"%)");
console.log("hard-2 vs hard:   "+((m3.aR-m3.bR)*100).toFixed(2)+"pp ("+(m3.aR*100).toFixed(1)+"% vs "+(m3.bR*100).toFixed(1)+"%)");

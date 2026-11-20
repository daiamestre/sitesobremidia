// F-355 — tira os pontos PRETOS de dentro de uma logo (sombras quase pretas no fundo vermelho) e deixa a logo opaca.
// A sombra vira um vermelho mais fechado (o volume continua), nunca preto; branco, amarelo e o cinza das letras brancas ficam.
// Uso: node scripts/studio/tirar-preto-da-logo.mjs <entrada.png> <saida.png>
import s from 'sharp';
(async()=>{const [f,out]=process.argv.slice(2);const {data,info}=await s(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let n=0,R=0,G=0,B=0;for(let i=0;i<data.length;i+=4){if(data[i+3]>200&&data[i]>170&&data[i+1]<70&&data[i+2]<70){R+=data[i];G+=data[i+1];B+=data[i+2];n++;}}
R/=n;G/=n;B/=n;console.log('vermelho do disco',R|0,G|0,B|0,'amostras',n);
let mud=0;
for(let i=0;i<data.length;i+=4){
  if(data[i+3]>=235)data[i+3]=255; // a logo inteira opaca (vinha com 253: escurecia sobre fundo escuro)
  if(data[i+3]===0)continue;
  const r=data[i],g=data[i+1],b=data[i+2],V=Math.max(r,g,b),mn=Math.min(r,g,b),sat=V?(V-mn)/V:0;
  if(V>=175)continue;
  const avermelhado=r>=g&&r>=b, quasePreto=V<70;
  if(!avermelhado&&!quasePreto)continue;
  if(!quasePreto&&sat<0.3)continue; // cinza do volume das letras brancas fica
  const w=Math.min(1,(175-V)/90);
  const lum=0.62+0.38*(V/175); // sombra vira vermelho mais fechado, nunca preto
  data[i]=Math.round(r*(1-w)+R*lum*w);data[i+1]=Math.round(g*(1-w)+G*lum*w);data[i+2]=Math.round(b*(1-w)+B*lum*w);mud++;
}
let esc=0;for(let i=0;i<data.length;i+=4){if(data[i+3]>20&&data[i]+data[i+1]+data[i+2]<90)esc++;}
console.log('ajustados',mud,'escuros restantes',esc);
await s(data,{raw:{width:info.width,height:info.height,channels:4}}).png({compressionLevel:9}).toFile(out);})();

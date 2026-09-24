// easyapply-helpers.js — injected into the LinkedIn Easy Apply page by easyapply.mjs.
// Every personal answer comes from window.__A, which easyapply.mjs sets from
// config/easyapply-answers.json before this file runs. Nothing personal lives here.
window.__A = window.__A || {};
window.__dlg=()=>document.querySelector('dialog[open]')||document.querySelector('dialog');
window.__lab=e=>{let l=(e.labels&&e.labels[0]?.innerText)||e.getAttribute('aria-label')||'';if(!l){let x=e;for(let k=0;k<5&&x;k++){x=x.parentElement;const lg=x&&x.querySelector('legend,label,span[class*=title]');if(lg&&lg.innerText.trim()){l=lg.innerText;break;}}}return l.replace(/\s+/g,' ').trim();};
// Answer rules, in order. Returns a string answer, null (leave blank on purpose) or undefined (no rule: stop).
window.__ans=q=>{
  const A=window.__A, l=q.toLowerCase(), yn=b=>b?'Yes':'No';
  const needs=A.needsSponsorship!==false;
  // CRITICAL ORDER: "without sponsorship" / "indefinite right" / "settled status" questions ask whether
  // you can work with NO sponsorship, so they must be answered before the generic /sponsor/ rule below.
  if(/without (the )?(need|needing|requiring|requirement)( for| of)? (visa )?sponsor|without sponsorship|unrestricted right|indefinite (leave|right)|settled status|british citizen/.test(l))return A.unrestrictedRightToWork?'Yes':'No';
  // Your own rules from the config, [regex, answer] pairs, checked after the sponsorship rule above.
  for(const [re,ans] of (A.extraRules||[])){if(new RegExp(re,'i').test(q))return ans;}
  if(/based in the uk|live in the uk|reside in the uk|currently in the uk/.test(l))return yn(A.basedInUK!==false);
  if(/gdpr|privacy notice/.test(l))return 'Yes';
  if(/pronoun/.test(l))return A.pronouns||null;
  if(/proficiency in english|english proficiency|level of english/.test(l))return A.englishLevel||'Professional';
  if(/middle name|preferred name|suffix|address line 2|website|portfolio|github|twitter|cover letter|headline|summary/.test(l))return null;
  if(/phone country/.test(l))return A.phoneCountry||'United Kingdom (+44)';
  if(/postal|post code|postcode|zip/.test(l))return A.postcode;
  if(/mobile phone|phone number/.test(l))return A.phone;
  if(/^country|country\*|country of residence/.test(l))return A.country||'United Kingdom';
  if(/address line 1|street address|^address/.test(l))return A.address1;
  if(/agree|gdpr|privacy notice|consent|acknowledge/.test(l))return 'Yes';
  if(/sponsor/.test(l))return yn(needs);
  if(/legally permitted|permitted to work|proof of eligib|eiligib|right to work|authori[sz]ed to work|legally (able|entitled)|eligible to work/.test(l))return yn(A.rightToWork!==false);
  if(/relocat|commut|on-?site|office|hybrid|willing to work|travel/.test(l))return yn(A.willingToRelocateOrCommute!==false);
  if(/criminal|convict|previously (worked|employed)|worked (for|at) .* before|referred|relative|family member/.test(l))return 'No';
  if(/salary|compensation|pay expect|remuneration/.test(l))return A.salary;
  if(/notice/.test(l))return A.notice||'Available immediately';
  if(/how many years|years of (work )?experience|years experience/.test(l)){const Y=A.years||{};return new RegExp(Y.relevantPattern||'sql|python|data|analy','i').test(l)?String(Y.relevant??'1'):String(Y.other??'0');}
  if(/degree|bachelor|master|graduat/.test(l))return yn(A.hasDegree!==false);
  if(/city|location|where are you based|town/.test(l))return A.city;
  if(/gender/.test(l))return A.gender;
  if(/ethnic/.test(l))return A.ethnicity;
  if(/disab/.test(l))return A.disability||'No';
  if(/veteran|armed forces/.test(l))return A.veteran||'No';
  if(/linkedin/.test(l))return A.linkedin||null;
  if(/english|fluent/.test(l))return 'Yes';
  if(/driv/.test(l))return yn(!!A.drivingLicence);
  return undefined;
};
window.__setv=(el,v)=>{const P=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(P,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
window.__rl=r=>((r.labels&&r.labels[0]?.innerText)||document.querySelector(`label[for="${r.id}"]`)?.innerText||r.getAttribute('aria-label')||r.value||'').trim();
window.__rq=fs=>{let q=(fs.querySelector('legend')?.innerText||'').trim();if(q.replace(/\b(Yes|No)\b/g,'').trim().length<5){let x=fs;for(let k=0;k<4&&x;k++){x=x.parentElement;const t=x.innerText.replace(fs.innerText,'').trim();if(t.length>8){q=t;break;}}}return q.replace(/\s+/g,' ').trim();};
window.__fillPage=()=>{const d=__dlg();const log=[];const pc=window.__A.phoneCountry||'United Kingdom (+44)';for(const e of d.querySelectorAll('select')){if(e.offsetParent&&/phone country/i.test(__lab(e))&&(e.options[e.selectedIndex]?.text||'').trim()!==pc){const o=[...e.options].find(o=>o.text.trim()===pc);if(o)__setv(e,o.value);}}for(const e of d.querySelectorAll('input[type=text],input[type=number],input[type=tel],textarea,select')){if(!e.offsetParent)continue;const q=__lab(e);if(/first name|last name|email|phone country|location \(city\)/i.test(q))continue;const cur=e.tagName==='SELECT'?(e.selectedIndex>0?e.options[e.selectedIndex].text:''):e.value;if(cur&&!/select an option/i.test(cur))continue;const a=__ans(q);if(a===null)continue;if(a===undefined){log.push('UNKNOWN: '+q.slice(0,140));continue;}if(e.tagName==='SELECT'){const o=[...e.options].find(o=>o.text.trim().toLowerCase()===a.toLowerCase())||[...e.options].find(o=>o.text.trim().toLowerCase().startsWith(a.toLowerCase()));if(o){__setv(e,o.value);log.push('set '+q.slice(0,40)+'='+o.text);}else log.push('UNKNOWN-OPT: '+q.slice(0,80)+' want '+a+' opts '+[...e.options].map(o=>o.text).slice(1,8).join('/'));}else{__setv(e,a);log.push('set '+q.slice(0,40)+'='+a);}}for(const fs of d.querySelectorAll('fieldset')){const rs=[...fs.querySelectorAll('input[type=radio]')];if(!rs.length||rs.some(r=>r.checked))continue;const q=__rq(fs);const a=__ans(q);if(!a){log.push('UNKNOWN-RADIO: '+q.slice(0,160));continue;}let r=rs.find(r=>__rl(r).toLowerCase()===a.toLowerCase());if(!r){const order=fs.innerText.split(/\n+/).map(s=>s.trim()).filter(s=>/^(Yes|No)$/.test(s));const i=order.findIndex(s=>s.toLowerCase()===a.toLowerCase());if(i>=0&&rs[i])r=rs[i];}if(r){r.click();log.push('radio '+q.slice(0,50)+'='+a);}else log.push('UNKNOWN-RADIO-OPT: '+q.slice(0,80));}for(const c of d.querySelectorAll('input[type=checkbox]')){const l=__lab(c);if(!c.checked&&/consent|agree|privacy|terms|acknowledge/i.test(l)){c.click();log.push('tick '+l.slice(0,40));}}return log;};
// Optional: LinkedIn copies your profile's Work Experience description into the form. If that text
// is wrong for applications, set workExperienceFix {match, replacement} in the config to swap it.
window.__fixDesc=async()=>{const F=window.__A.workExperienceFix;const re=new RegExp(F.match,'i');const d=__dlg();const ed=[...d.querySelectorAll('button')].find(b=>/Edit/.test(b.getAttribute('aria-label')||'')&&/Work Experience/i.test(b.getAttribute('aria-label')||''));if(!ed)return 'no edit btn';ed.click();await new Promise(r=>setTimeout(r,1500));const ta=[...__dlg().querySelectorAll('textarea')].find(t=>re.test(t.value));if(!ta)return 'no matching textarea';__setv(ta,F.replacement);await new Promise(r=>setTimeout(r,500));[...__dlg().querySelectorAll('button')].find(b=>b.innerText.trim()==='Save')?.click();await new Promise(r=>setTimeout(r,2000));return re.test(__dlg().innerText)?'STILL OLD TEXT':'description fixed';};
// Education rows: degree + field of study chosen per school from the config's education list.
window.__fixEdu=async()=>{const out=[];const E=window.__A.education||[];const dflt=window.__A.educationDefault||{degree:'High School',fields:['Mathematics']};for(let k=0;k<4;k++){const d=__dlg();const sels=[...d.querySelectorAll('select')].filter(e=>e.offsetParent);const deg=sels.find(s=>/Degree/.test(__lab(s)));const fos=sels.find(s=>/Field of Study/.test(__lab(s)));if(!deg||!fos)break;const school=[...d.querySelectorAll('input')].find(e=>e.offsetParent&&/School/.test(__lab(e)))?.value||'';const row=E.find(x=>new RegExp(x.schoolMatch,'i').test(school))||dflt;const dv=row.degree,fv=row.fields||[];const o1=[...deg.options].find(o=>o.text===dv)||[...deg.options].find(o=>o.text.startsWith(dv.slice(0,5)));if(o1)__setv(deg,o1.value);let o2=null;for(const f of fv){o2=[...fos.options].find(o=>o.text===f);if(o2)break;}if(o2)__setv(fos,o2.value);out.push(school+': '+(o1?o1.text:'?')+' / '+(o2?o2.text:'?'));[...d.querySelectorAll('button')].find(b=>b.innerText.trim()==='Save')?.click();await new Promise(r=>setTimeout(r,2000));[...__dlg().querySelectorAll('button')].find(b=>/^(Next|Review)$/.test(b.innerText.trim()))?.click();await new Promise(r=>setTimeout(r,2500));if(!/Education/.test(__dlg().innerText.slice(0,200)))break;}return out.join('; ');};
window.__step=async()=>{const d=__dlg();if(!d)return 'NO DIALOG';const t=d.innerText;const head=t.slice(0,90).replace(/\n+/g,' | ');if(/Review your application/.test(t))return 'AT REVIEW';if(/Upload resume/.test(t)&&!window.__cvdone)return 'RESUME PAGE';const F=window.__A.workExperienceFix;if(F&&F.match&&/Work experience/.test(t)&&new RegExp(F.match,'i').test(t)){const r=await __fixDesc();if(r!=='description fixed')return 'DESC '+r;}const edu=[...d.querySelectorAll('select')].some(s=>s.offsetParent&&/Field of Study/.test(__lab(s))&&s.selectedIndex<1);if(edu){return 'EDU '+await __fixEdu();}const log=__fillPage();if(log.some(x=>/UNKNOWN/.test(x)))return 'STOP '+head+'\n'+log.join('\n');const b=[...d.querySelectorAll('button')].find(b=>/^(Next|Review|Continue)$/.test(b.innerText.trim()));if(!b)return 'NO NEXT '+head;b.click();await new Promise(r=>setTimeout(r,2500));if(__dlg()&&__dlg().innerText.slice(0,90).replace(/\n+/g,' | ')===head&&!/Review your application/.test(__dlg().innerText))return 'STUCK '+head+' '+log.join('; ');return 'NEXT OK '+head;};
window.__run=async(n=8)=>{let r=[];for(let i=0;i<n;i++){const s=await __step();r.push(s.slice(0,500));if(!/^(NEXT OK|EDU)/.test(s))break;}return r.join('\n').replace(/[=?&%]/g,':').replace(/https?:\S+/g,'');};
window.__stashUpload=()=>{if(!window.__patched){const orig=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='file'){this.id='__cvinput';this.style.display='block';if(!this.isConnected)document.body.appendChild(this);window.__stash=this;return;}return orig.call(this);};window.__patched=true;}function walk(root,out){for(const el of root.querySelectorAll('*')){if(el.tagName==='BUTTON'&&/Upload resume/i.test(el.getAttribute('aria-label')||el.innerText))out.push(el);if(el.shadowRoot)walk(el.shadowRoot,out);}return out;}const bs=walk(document,[]);if(bs[0])setTimeout(()=>bs[0].click(),10);return 'buttons '+bs.length;};
window.__review=()=>{const d=__dlg();if(!d)return 'no dialog';return d.innerText.replace(/\n\s*\n+/g,'\n').replace(/Edit\n/g,'').slice(0,2500).replace(/[=?&%]/g,':').replace(/https?:\S+/g,'');};
window.__submit=async(company,cvname)=>{const d=__dlg();const t=d.innerText;if(!(new RegExp(company).test(t)&&/Review your application/.test(t)&&t.includes(cvname)))return 'ABORT: not at review for '+company;const b=[...d.querySelectorAll('button')].find(b=>/^Submit application$/i.test(b.innerText.trim()));if(!b)return 'no submit';b.click();await new Promise(r=>setTimeout(r,4000));return (document.body.innerText.match(/application was sent[^\n]{0,60}|Application sent|Applied[^\n]{0,30}/i)||['sent? check'])[0];};
window.__pickCV=name=>{const d=__dlg();for(const r of d.querySelectorAll('input[type=radio]')){let x=r;for(let k=0;k<5;k++)x=x.parentElement;if(x.innerText.includes(name)){r.click();return 'picked '+name;}}return 'not found';};
window.__cvdone=false;'helpers ready';

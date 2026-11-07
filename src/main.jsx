import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Church, Users, CalendarDays, ClipboardCheck, ChartNoAxesCombined, Settings, LogOut, Wifi, WifiOff, Plus, RefreshCw, Download, ShieldCheck, UserRoundPlus, Mic2, Trash2, KeyRound, User, Mail, LockKeyhole, Search, CheckCircle2 } from 'lucide-react';
import './styles.css';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = url.startsWith('https://') && anon && !anon.includes('VOTRE_') ? createClient(url, anon) : null;
const KEY = 'communaute-plus-v02-cache';
const PROFILE_KEY = 'communaute-plus-v02-profile';
const QUEUE = 'communaute-plus-v02-queue';
const uuid = () => crypto.randomUUID();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmt = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const norm = s => (s||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const empty = { people:[], meetings:[], attendance:[], profiles:[], community:null };
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJson = (key,val) => localStorage.setItem(key, JSON.stringify(val));

function App(){
 const [session,setSession]=useState(null), [profile,setProfile]=useState(null), [community,setCommunity]=useState(null);
 const [data,setData]=useState(empty), [queue,setQueue]=useState(()=>readJson(QUEUE,[]));
 const [online,setOnline]=useState(navigator.onLine), [loading,setLoading]=useState(true), [notice,setNotice]=useState('');
 const [authMode,setAuthMode]=useState('login'), [email,setEmail]=useState(''), [password,setPassword]=useState(''), [displayName,setDisplayName]=useState(''), [authBusy,setAuthBusy]=useState(false);
 const [setupMode,setSetupMode]=useState('create'), [communityName,setCommunityName]=useState('Ma communauté'), [joinCode,setJoinCode]=useState('');
 const [tab,setTab]=useState('dashboard'), [group,setGroup]=useState('Toutes'), [query,setQuery]=useState('');
 const [personName,setPersonName]=useState(''), [phone,setPhone]=useState(''), [personGroup,setPersonGroup]=useState('Peuple');
 const [meetingTitle,setMeetingTitle]=useState('Culte'), [meetingDate,setMeetingDate]=useState(today()), [preacher,setPreacher]=useState(''), [notes,setNotes]=useState(''), [selectedMeeting,setSelectedMeeting]=useState('');
 const [selectedPerson,setSelectedPerson]=useState(''), [manualCategory,setManualCategory]=useState('Auto');
 const [showPerson,setShowPerson]=useState(false), [showMeeting,setShowMeeting]=useState(false);
 
 // --- AJOUT POUR LES DÉPARTEMENTS DYNAMIQUES ---
 const [groupsList, setGroupsList] = useState([]);

 useEffect(()=>{ const on=()=>setOnline(true),off=()=>setOnline(false); addEventListener('online',on);addEventListener('offline',off); return()=>{removeEventListener('online',on);removeEventListener('offline',off)};},[]);
 useEffect(()=>{ if(!supabase){setLoading(false);return;} supabase.auth.getSession().then(({data:{session}})=>{setSession(session);if(!session)setLoading(false)}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s); if(!s){setProfile(null);setCommunity(null);setLoading(false)}}); return()=>subscription.unsubscribe();},[]);
 
 useEffect(()=>{ if(!session||!supabase)return; let cancelled=false; (async()=>{setLoading(true); try { 
   const {data:p,error}=await supabase.from('profiles').select('*').eq('user_id',session.user.id).maybeSingle(); if(error)throw error; if(cancelled)return; 
   if(p?.community_id){
     setProfile(p);writeJson(PROFILE_KEY,p); const cached=readJson(`${KEY}:${p.community_id}`,empty); setData(cached); 
     const {data:c}=await supabase.from('communities').select('id,name').eq('id',p.community_id).maybeSingle(); 
     let cm=c||cached.community||null; 
     if(p.role==='admin'){const {data:code}=await supabase.rpc('get_join_code');if(cm)cm={...cm,join_code:code};} 
     if(!cancelled)setCommunity(cm); 
     
     // Chargement des départements
     const { data: deps } = await supabase.from('departments').select('*').order('name');
     if (deps) setGroupsList(deps.map(d => d.name));

     await syncFromServer(p.community_id,cm); 
   } else {setProfile(p||null);setData(empty);setCommunity(null);} 
 } catch(e){
   const cachedProfile=readJson(PROFILE_KEY,null);
   if(cachedProfile?.community_id){setProfile(cachedProfile);const cached=readJson(`${KEY}:${cachedProfile.community_id}`,empty);setData(cached);setCommunity(cached.community||null);setNotice('Mode hors connexion : les données déjà chargées sont disponibles. Les nouvelles opérations seront synchronisées au retour du réseau.');}
   else setNotice(`Connexion aux données impossible : ${e.message}. Connecte-toi une première fois en ligne sur cet appareil.`)
 } finally{if(!cancelled)setLoading(false)} })(); return()=>{cancelled=true}; },[session]);

 useEffect(()=>{ if(profile?.community_id)writeJson(`${KEY}:${profile.community_id}`,{...data,community:community||data.community}); },[data,community,profile?.community_id]);
 useEffect(()=>{writeJson(QUEUE,queue)},[queue]);
 useEffect(()=>{ if(online&&profile?.community_id&&supabase){flushQueue().then(()=>syncFromServer(profile.community_id,community));} },[online,profile?.community_id]);
 useEffect(()=>{ if(online&&profile?.community_id&&queue.length>0&&supabase){flushQueue().then(()=>syncFromServer(profile.community_id,community));} },[queue.length,online,profile?.community_id]);
 
 async function syncFromServer(cid, comm){ if(!supabase||!navigator.onLine||!cid)return; try { const [p,m,a,pr]=await Promise.all([supabase.from('people').select('*').eq('community_id',cid).order('full_name'),supabase.from('meetings').select('*').eq('community_id',cid).order('meeting_date',{ascending:false}),supabase.from('attendance').select('*').eq('community_id',cid),supabase.from('profiles').select('user_id,display_name,role').eq('community_id',cid)]); const err=[p,m,a,pr].find(x=>x.error);if(err)throw err; const merged={people:p.data||[],meetings:m.data||[],attendance:a.data||[],profiles:pr.data||[],community:comm||community}; setData(merged);writeJson(`${KEY}:${cid}`,merged); }catch(e){setNotice(`Synchronisation non terminée : ${e.message}`)} }
 async function flushQueue(){ if(!supabase||!navigator.onLine||!profile?.community_id)return; let q=[...readJson(QUEUE,[])]; if(!q.length)return; const remaining=[]; for(const item of q){ try{const {error}=await supabase.from(item.table).upsert(item.row,{onConflict:item.conflict||'id'});if(error)throw error;}catch(e){remaining.push(item);setNotice(`Synchronisation en attente : ${e.message}`)} } setQueue(remaining); if(q.length>remaining.length)setNotice(`${q.length-remaining.length} opération(s) synchronisée(s).`); }
 function enqueue(table,row,conflict){ setQueue(old=>[...old,{table,row,conflict}]); }
 
 async function authenticate(e){e.preventDefault();if(!supabase)return;setAuthBusy(true);setNotice('');try{ if(authMode==='signup'){const {error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName}}});if(error)throw error;setNotice('Compte créé. Si une confirmation par e-mail est activée, confirme ton adresse puis connecte-toi.');setAuthMode('login');}else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;} }catch(e){setNotice(e.message)}finally{setAuthBusy(false)}}
 async function createCommunity(e){e.preventDefault();if(!supabase||!session)return;setAuthBusy(true);try{const {data:r,error}=await supabase.rpc('bootstrap_community',{p_name:communityName,p_display_name:displayName||session.user.email.split('@')[0]});if(error)throw error;setNotice(`Communauté créée. Code responsable : ${r.join_code} — conserve-le et partage-le uniquement avec les responsables.`);const {data:p}=await supabase.from('profiles').select('*').eq('user_id',session.user.id).single();setProfile(p);writeJson(PROFILE_KEY,p);setCommunity({id:r.community_id,name:r.community_name,join_code:r.join_code});setData({...empty,community:{id:r.community_id,name:r.community_name,join_code:r.join_code}});await syncFromServer(r.community_id,{id:r.community_id,name:r.community_name,join_code:r.join_code});}catch(e){setNotice(e.message)}finally{setAuthBusy(false)}}
 async function joinCommunity(e){e.preventDefault();if(!supabase||!session)return;setAuthBusy(true);try{const {data:r,error}=await supabase.rpc('join_community',{p_code:joinCode,p_display_name:displayName||session.user.email.split('@')[0]});if(error)throw error;const {data:p}=await supabase.from('profiles').select('*').eq('user_id',session.user.id).single();setProfile(p);writeJson(PROFILE_KEY,p);setCommunity({id:r.community_id,name:r.community_name});await syncFromServer(r.community_id,{id:r.community_id,name:r.community_name});setNotice(`Tu as rejoint ${r.community_name}.`)}catch(e){setNotice(e.message)}finally{setAuthBusy(false)}}
 async function signOut(){await supabase?.auth.signOut();setSession(null);setProfile(null);localStorage.removeItem(PROFILE_KEY);setCommunity(null);setData(empty);}
 
 function addPerson(e){e.preventDefault();if(!personName.trim())return;const existing=data.people.find(p=>norm(p.full_name)===norm(personName)&&p.group_name===personGroup);if(existing){setNotice('Cette personne existe déjà dans cette catégorie.');return;}const row={id:uuid(),community_id:profile.community_id,full_name:personName.trim(),phone:phone.trim(),group_name:personGroup,created_by:session.user.id};setData(old=>({...old,people:[...old.people,row]}));enqueue('people',row);setPersonName('');setPhone('');setShowPerson(false);setNotice(online?'Personne ajoutée. Synchronisation en cours.':'Personne enregistrée hors ligne ; elle sera synchronisée à la reconnexion.');}
 function addMeeting(e){e.preventDefault();if(!meetingTitle.trim()||!meetingDate)return;const row={id:uuid(),community_id:profile.community_id,title:meetingTitle.trim(),meeting_date:meetingDate,preacher:preacher.trim(),notes:notes.trim(),created_by:session.user.id};setData(old=>({...old,meetings:[row,...old.meetings] }));enqueue('meetings',row);setSelectedMeeting(row.id);setShowMeeting(false);setMeetingTitle('Culte');setPreacher('');setNotes('');setNotice('Rencontre enregistrée.');}
 
 function addAttendance(e){
   e.preventDefault();
   const p=data.people.find(x=>x.id===selectedPerson),m=data.meetings.find(x=>x.id===selectedMeeting);
   if(!p||!m){setNotice('Choisis une personne et une rencontre.');return;}
   if(data.attendance.some(a=>a.meeting_id===m.id&&a.person_id===p.id)){setNotice('Cette personne est déjà enregistrée pour cette rencontre.');return;}
   const past=data.attendance.filter(a=>a.person_id===p.id&&data.meetings.some(x=>x.id===a.meeting_id&&x.meeting_date<m.meeting_date)).sort((a,b)=>{
     const ma=data.meetings.find(x=>x.id===a.meeting_id),mb=data.meetings.find(x=>x.id===b.meeting_id);
     return (mb?.meeting_date||'').localeCompare(ma?.meeting_date||'')
   })[0];
   const lastDate=past?data.meetings.find(x=>x.id===past.meeting_id)?.meeting_date:null;
   const gap=lastDate?Math.floor((new Date(m.meeting_date+'T12:00:00')-new Date(lastDate+'T12:00:00'))/86400000):null;
   const category=manualCategory==='Auto'?(!past?'Nouvelle':gap>=28?'Revenue':'Ancienne'):manualCategory;
   const row={id:uuid(),community_id:profile.community_id,meeting_id:m.id,person_id:p.id,category,created_by:session.user.id};
   setData(old=>({...old,attendance:[...old.attendance,row]}));enqueue('attendance',row,'meeting_id,person_id');setNotice(`Présence enregistrée : ${category}.`);setSelectedPerson('');setManualCategory('Auto');
 }

 // --- FONCTIONS DE SUPPRESSION ET DÉPARTEMENTS (CORRIGÉES) ---
 const handleDeletePerson = async (id) => {
   if (!window.confirm("Es-tu sûr de vouloir supprimer cette personne ?")) return;
   const { error } = await supabase.from('people').delete().eq('id', id);
   if (error) {
     alert("Erreur : " + error.message);
   } else {
     setData(prev => ({ ...prev, people: prev.people.filter(p => p.id !== id) }));
     alert("Personne supprimée !");
   }
 };

 const handleDeleteMeeting = async (id) => {
   if (!window.confirm("Es-tu sûr de vouloir supprimer cette rencontre ?")) return;
   const { error } = await supabase.from('meetings').delete().eq('id', id);
   if (error) {
     alert("Erreur : " + error.message);
   } else {
     setData(prev => ({ ...prev, meetings: prev.meetings.filter(m => m.id !== id) }));
     alert("Rencontre supprimée !");
   }
 };

 const addDepartment = async (e) => {
   e.preventDefault();
   const newDeptName = prompt("Nom du nouveau département (ex: Jeunesse) :");
   if (!newDeptName) return;
   const { error } = await supabase.from('departments').insert([{ 
     name: newDeptName.toUpperCase(),
     community_id: profile.community_id 
   }]);
   if (error) {
     alert("Erreur : " + error.message);
   } else {
     alert("Département ajouté avec succès !");
     setGroupsList(prev => [...prev, newDeptName.toUpperCase()]);
   }
 };
 // -----------------------------------------------------------

 async function rotateCode(){try{const {data:code,error}=await supabase.rpc('rotate_join_code');if(error)throw error;setCommunity(old=>({...old,join_code:code}));setNotice(`Nouveau code d'inscription : ${code}. L'ancien code ne fonctionne plus.`)}catch(e){setNotice(e.message)}}
 function exportCsv(){const rows=[['Nom','Téléphone','Catégorie de groupe','Rencontre','Date','Statut de présence']];for(const a of data.attendance){const p=data.people.find(x=>x.id===a.person_id),m=data.meetings.find(x=>x.id===a.meeting_id);rows.push([p?.full_name||'',p?.phone||'',p?.group_name||'',m?.title||'',m?.meeting_date||'',a.category]);}const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\r\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='communaute-plus-presences.csv';a.click();URL.revokeObjectURL(u);}
 
 const people=useMemo(()=>data.people.filter(p=>(group==='Toutes'||p.group_name===group)&&norm(p.full_name+' '+p.phone).includes(norm(query))).sort((a,b)=>a.full_name.localeCompare(b.full_name,'fr')),[data.people,group,query]);
 const currentMeeting=data.meetings.find(m=>m.id===selectedMeeting); const currentAtt=data.attendance.filter(a=>a.meeting_id===selectedMeeting);
 const counts=useMemo(()=>({total:data.attendance.length,people:data.people.length,meetings:data.meetings.length,new:data.attendance.filter(a=>a.category==='Nouvelle').length,returned:data.attendance.filter(a=>a.category==='Revenue').length}),[data]);
 
 // Utilisation de groupsList au lieu de GROUPS
 const groupStats=groupsList.map(g=>({name:g,people:data.people.filter(p=>p.group_name===g).length,visits:data.attendance.filter(a=>data.people.find(p=>p.id===a.person_id)?.group_name===g).length}));

 if(!supabase)return <div className="center-wrap"><div className="auth-card"><div className="logo"><Church/></div><h1>Communauté+</h1><p>La configuration de la base de données n'est pas terminée.</p><div className="notice">Copie le fichier <code>.env.example</code> en <code>.env</code>, puis renseigne l'URL du projet Supabase et la clé publique anon. Le guide README explique les étapes.</div></div></div>;
 if(!session)return <div className="center-wrap"><form className="auth-card" onSubmit={authenticate}><div className="logo"><Church/></div><h1>Communauté+</h1><p>Suivi des présences, des visiteurs et des départements.</p><div className="segmented"><button type="button" className={authMode==='login'?'active':''} onClick={()=>setAuthMode('login')}>Connexion</button><button type="button" className={authMode==='signup'?'active':''} onClick={()=>setAuthMode('signup')}>Créer un compte</button></div>{authMode==='signup'&&<label>Nom affiché<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Ton nom"/></label>}<label><Mail size={16}/> Adresse e-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nom@exemple.com"/></label><label><LockKeyhole size={16}/> Mot de passe<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="8 caractères minimum"/></label><button className="primary full" disabled={authBusy}>{authBusy?'Patiente…':authMode==='login'?'Se connecter':'Créer mon compte'}</button>{notice&&<div className="notice">{notice}</div>}<small>Les données de la communauté ne sont visibles que par les comptes autorisés.</small></form></div>;
 if(loading)return <div className="center-wrap"><div className="auth-card"><RefreshCw className="spin"/><h2>Chargement de Communauté+</h2><p>Vérification du compte et des données…</p></div></div>;
 if(!profile?.community_id)return <div className="center-wrap"><div className="auth-card wide"><div className="logo"><Church/></div><h1>Bienvenue dans Communauté+</h1><p>Ton compte est connecté. Crée l'espace de la communauté si tu es la première personne, ou rejoins l'espace existant avec le code fourni par l'administrateur.</p><div className="segmented"><button className={setupMode==='create'?'active':''} onClick={()=>setSetupMode('create')}>Créer la communauté</button><button className={setupMode==='join'?'active':''} onClick={()=>setSetupMode('join')}>Rejoindre avec un code</button></div>{setupMode==='create'?<form onSubmit={createCommunity}><label>Nom de la communauté<input required value={communityName} onChange={e=>setCommunityName(e.target.value)}/></label><label>Ton nom<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nom et prénom"/></label><button className="primary full" disabled={authBusy}>Créer et devenir administrateur</button><small>La création n'est possible que si aucun espace n'a encore été créé dans ce projet Supabase.</small></form>:<form onSubmit={joinCommunity}><label>Ton nom<input required value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label><label><KeyRound size={16}/> Code de la communauté<input required value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="CODE FOURNI PAR L'ADMIN"/></label><button className="primary full" disabled={authBusy}>Rejoindre la communauté</button></form>}{notice&&<div className="notice">{notice}</div>}<button className="text-button" onClick={signOut}>Se déconnecter</button></div></div>;
 
 return <div className="layout"><aside className="sidebar"><div className="brand"><span className="brand-mark"><Church/></span><div><b>Communauté+</b><small>{community?.name||'Espace communauté'}</small></div></div><div className="status"><span className={online?'dot online':'dot'}></span>{online?'Connecté':'Hors connexion'}<span className="pending">{queue.length?`${queue.length} en attente`:''}</span></div><nav>{[['dashboard','Tableau de bord',ChartNoAxesCombined],['attendance','Présences',ClipboardCheck],['people','Personnes',Users],['meetings','Rencontres',CalendarDays],['stats','Statistiques',ChartNoAxesCombined],['admin','Administration',Settings]].map(([id,label,Icon])=><button key={id} className={tab===id?'nav-active':''} onClick={()=>setTab(id)}><Icon size={18}/>{label}</button>)}</nav><div className="sidebar-bottom"><div className="profile-mini"><span className="avatar"><User/></span><div><b>{profile.display_name||session.user.email}</b><small>{profile.role==='admin'?'Administrateur':'Responsable'}</small></div></div><button className="logout" onClick={signOut}><LogOut size={17}/> Se déconnecter</button></div></aside>
 <main className="main"><header className="topbar"><div><div className="eyebrow">ESPACE DE GES

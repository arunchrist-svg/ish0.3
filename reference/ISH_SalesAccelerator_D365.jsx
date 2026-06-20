import { useState } from "react";

// ── DATA ─────────────────────────────────────────────────────────────────────
const QUEUE = [
  { id:"l1", name:"Rajan Nair", action:"First customer call", type:"Lead", date:"6.20.2026 9:14 am", score:90, icon:"📧", company:"Bosch India", title:"HR Director" },
  { id:"l2", name:"Priya Menon", action:"Follow up mail", type:"Lead", date:"6.20.2026 9:14 am", score:83, icon:"📞", company:"Prestige Group", title:"VP Sales" },
  { id:"l3", name:"Arun Kumar", action:"First customer call", type:"Lead", date:"6.20.2026 9:14 am", score:92, icon:"📞", company:"Toyota Kirloskar", title:"Admin Head" },
  { id:"l4", name:"Deepika Rao", action:"Follow up mail", type:"Lead", date:"3 weeks ago", score:95, icon:"📧", company:"Infosys Mysore", title:"Chief People Officer" },
  { id:"l5", name:"Suresh Babu", action:"First customer call", type:"Lead", date:"3 weeks ago", score:72, icon:"📞", company:"Titan Company", title:"Plant HR Manager" },
];

const RECORD = {
  name:"Rajan Nair",
  leadSource:"LinkedIn",
  rating:"Warm",
  status:"New",
  owner:"ISH Cluster Mgr",
  tags:["Lead","Gifting Signal"],
  contact: {
    topic:"500 Diwali Gift Boxes — Pure Ghee Mithai",
    firstName:"Rajan", lastName:"Nair", jobTitle:"HR Director",
    businessPhone:"080-555-0168", mobilePhone:"+91 98450-12345",
    email:"rajan.nair@boschindia.com",
  },
  company: { name:"Bosch India", website:"boschindia.com", employees:"8,500", city:"Hosur" },
  upNext: [
    { title:"Send Tasting Box", step:"Step 1 · Due today 3:00 pm", desc:"Courier complimentary tasting box to office", icon:"📦", active:true, primaryAction:"Mark Sent" },
    { title:"Follow-up Call", step:"Step 2", desc:"Call 24hrs after delivery confirmation", icon:"📞", active:false },
    { title:"Send Quote", step:"Step 3 · Due 6.24.2026", desc:"Volume pricing for 500+ box order", icon:"📄", active:false },
  ],
  score: { value:90, grade:"Grade A", trend:"Steady", factors:[
    { label:"Purchase timeframe is", bold:"next quarter" },
    { label:"Purchase process is", bold:"individual" },
    { label:"Lead is", bold:"relatively new" },
    { label:"Estimated budget is", bold:"₹18,00,000" },
  ]},
  network: [
    { name:"Arun Krishnan", email:"arun.k@boschindia.com" },
    { name:"Meera Pillai", email:"meera.p@boschindia.com" },
  ],
};

const STAGES = ["Identify", "Tasting Sent", "Negotiate", "Closed"];

// ── THEME ────────────────────────────────────────────────────────────────────
const C = {
  outer:"#6B6878",
  appBg:"#EFEFF0",
  white:"#FFFFFF",
  ink:"#1A1A1F",
  inkSoft:"#6B6975",
  inkFaint:"#A8A6B0",
  border:"#E7E6EA",
  yellow:"#F4F25A",
  yellowSoft:"#F9F8C8",
  yellowGrad:"linear-gradient(135deg,#F4F25A 0%,#FDEAA8 50%,#FCD9C4 100%)",
  pink:"#FAD9D0",
  pinkSoft:"#FCEEEA",
  green:"#3FBE82",
  greenSoft:"#E0F7EC",
  black:"#15151A",
  shadowSm:"0 1px 2px rgba(20,20,30,0.05)",
  shadow:"0 2px 8px rgba(20,20,30,0.06), 0 8px 24px rgba(20,20,30,0.05)",
  shadowFloat:"0 24px 60px rgba(20,16,30,0.22)",
};
const sans = { fontFamily:"'Segoe UI','Inter',system-ui,sans-serif" };
const AVATAR_BG = ["#F2C9A0","#F2A8A8","#A8C9F2","#C9A8F2","#A8F2C9","#F2DCA8"];
const bgFor = i => AVATAR_BG[i % AVATAR_BG.length];

// ── ATOMS ────────────────────────────────────────────────────────────────────
function Avatar({ name, idx, size=40 }) {
  const initials = (name||"??").split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", background:bgFor(idx),
      display:"flex", alignItems:"center", justifyContent:"center",
      fontWeight:700, fontSize:size*0.34, color:"#5A4838", flexShrink:0,
      border:"2px solid #fff", boxShadow:C.shadowSm,
    }}>{initials}</div>
  );
}

function ToolbarBtn({ icon, label, dark }) {
  return (
    <button style={{
      display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:18,
      background: dark ? C.black : "rgba(255,255,255,0.55)", color: dark ? "#fff" : C.ink,
      border:"none", fontSize:12.5, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", ...sans,
    }}><span style={{fontSize:13}}>{icon}</span>{label}</button>
  );
}

function CircleBtn({ children, size=36, active }) {
  return (
    <button style={{
      width:size, height:size, borderRadius:"50%",
      background: active ? C.black : C.white, border:"none",
      display:"flex", alignItems:"center", justifyContent:"center",
      color: active ? "#fff" : C.inkSoft, fontSize:14, cursor:"pointer",
      boxShadow:C.shadowSm, flexShrink:0,
    }}>{children}</button>
  );
}

function ScoreBadge({ score }) {
  const color = score>85 ? C.black : score>65 ? "#D9A53A" : "#D97070";
  const bg = score>85 ? "#1A1A1F" : score>65 ? "#FBE9C4" : "#FBE0DE";
  return (
    <div style={{
      width:38, height:38, borderRadius:"50%", background: score>85?C.black:bg,
      color: score>85 ? "#fff" : C.ink, display:"flex", alignItems:"center", justifyContent:"center",
      fontWeight:800, fontSize:14, flexShrink:0,
    }}>{score}</div>
  );
}

function QueueItem({ item, idx, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: active ? C.yellowGrad : C.white,
      borderRadius:18, padding:"16px 16px", marginBottom:10, cursor:"pointer",
      boxShadow: active ? "0 6px 18px rgba(244,242,90,0.35)" : C.shadowSm,
      transition:"all 0.15s",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div style={{ display:"flex", gap:11 }}>
          <Avatar name={item.name} idx={idx} size={42}/>
          <div>
            <div style={{ fontWeight:700, fontSize:14.5, color:C.ink }}>{item.name}</div>
            <div style={{ fontSize:12, color:C.inkSoft, marginTop:1 }}>{item.action}</div>
          </div>
        </div>
        <div style={{ width:30, height:30, borderRadius:"50%", background:"rgba(255,255,255,0.6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>{item.icon}</div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:10.5, fontWeight:700, color:C.inkSoft, background:"rgba(255,255,255,0.55)", padding:"3px 9px", borderRadius:7 }}>{item.type}</span>
          <span style={{ fontSize:11, color:C.inkFaint }}>{item.date}</span>
        </div>
        <ScoreBadge score={item.score}/>
      </div>
    </div>
  );
}

function StageNode({ label, active, done, isLast }) {
  return (
    <div style={{ display:"flex", alignItems:"center", flex: isLast?"0 0 auto":1 }}>
      <div style={{
        display:"flex", alignItems:"center", gap:8, padding: active ? "9px 18px" : "9px 14px",
        borderRadius:20, background: active ? C.black : "rgba(255,255,255,0.5)",
        color: active ? "#fff" : C.inkSoft, fontSize:12.5, fontWeight:600, whiteSpace:"nowrap",
      }}>
        {active ? <span style={{
          width:16, height:16, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.4)",
          borderTopColor:"#fff", display:"inline-block", animation:"d365-spin 0.8s linear infinite",
        }}/> : <span>{done ? "✓" : "🔒"}</span>}
        {label}
      </div>
      {!isLast && <div style={{ flex:1, height:1, background:"rgba(20,20,30,0.12)", minWidth:16 }}/>}
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:"9px 18px", borderRadius:14, border:"none", cursor:"pointer",
      background: active ? C.black : "transparent", color: active ? "#fff" : C.inkSoft,
      fontSize:13, fontWeight:600, ...sans,
    }}>{label}</button>
  );
}

function FieldRow({ label, value, action }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:11, color:C.inkFaint, fontWeight:600, marginBottom:4 }}>{label}</div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:13.5, color:C.ink, fontWeight:500 }}>{value}</div>
        {action && <span style={{ fontSize:14, color:C.inkFaint }}>{action}</span>}
      </div>
    </div>
  );
}

function UpNextCard({ task, idx }) {
  return (
    <div style={{
      background: task.active ? C.yellowGrad : C.white,
      borderRadius:16, padding:"14px 16px", marginBottom:10,
      boxShadow: task.active ? "0 4px 14px rgba(244,242,90,0.3)" : C.shadowSm,
    }}>
      <div style={{ display:"flex", gap:11, marginBottom: task.active ? 10 : 0 }}>
        <div style={{
          width:34, height:34, borderRadius:"50%",
          background: task.active ? C.black : "#F2F1F4", color: task.active ? "#fff" : C.inkSoft,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0,
        }}>{task.icon}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:13.5, color:C.ink }}>{task.title}</div>
          <div style={{ fontSize:11, color:C.inkSoft, marginTop:1 }}>{task.step}</div>
          {!task.active && <div style={{ fontSize:11.5, color:C.inkFaint, marginTop:3 }}>{task.desc}</div>}
        </div>
      </div>
      {task.active && (
        <>
          <div style={{ fontSize:12.5, color:C.ink, marginBottom:12, paddingLeft:45 }}>{task.desc}</div>
          <div style={{ display:"flex", gap:8, paddingLeft:45 }}>
            <button style={{ background:C.black, color:"#fff", border:"none", borderRadius:12, padding:"8px 16px", fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>📦 {task.icon==="📦"?"Ship Box":"Call"}</button>
            <button style={{ background:"rgba(255,255,255,0.6)", color:C.ink, border:"none", borderRadius:12, padding:"8px 16px", fontSize:12, fontWeight:600, cursor:"pointer" }}>{task.primaryAction || "Mark Complete"}</button>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreGauge({ score, grade, trend }) {
  const r=70, circ=2*Math.PI*r, segments=40, gap=2.2;
  const filled = Math.round((score/100)*segments);
  return (
    <div style={{ position:"relative", width:170, height:170, margin:"0 auto" }}>
      <svg width="170" height="170" style={{ transform:"rotate(-90deg)" }}>
        {Array.from({length:segments}).map((_,i)=>{
          const angle = (360/segments)*i;
          const rad = (angle * Math.PI)/180;
          const x1 = 85 + (r-8)*Math.cos(rad), y1 = 85 + (r-8)*Math.sin(rad);
          const x2 = 85 + (r+8)*Math.cos(rad), y2 = 85 + (r+8)*Math.sin(rad);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i<filled? C.green : "#E5E4E8"} strokeWidth="4" strokeLinecap="round"/>;
        })}
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:46, fontWeight:800, color:C.ink, lineHeight:1 }}>{score}</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function ISHSalesAccelerator() {
  const [activeQueue, setActiveQueue] = useState(QUEUE[0].id);
  const [activeTab, setActiveTab] = useState("Summary");
  const [stage, setStage] = useState(1);
  const record = RECORD;
  const current = QUEUE.find(q=>q.id===activeQueue) || QUEUE[0];

  return (
    <div style={{ background:C.outer, minHeight:"100vh", padding:34, ...sans }}>
      <style>{`
        @keyframes d365-spin{to{transform:rotate(360deg)}}
        @keyframes d365-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        button:hover{filter:brightness(0.97)}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#D2D0D8;border-radius:3px}
      `}</style>

      <div style={{ background:C.appBg, borderRadius:24, boxShadow:C.shadowFloat, maxWidth:1620, margin:"0 auto", overflow:"hidden" }}>

        {/* TOP BAR */}
        <div style={{ display:"flex", alignItems:"center", padding:"16px 28px", background:C.white, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16, color:C.inkFaint }}>⠿</span>
            <span style={{ fontSize:20 }}>🪔</span>
            <span style={{ fontWeight:700, fontSize:15, color:C.ink }}>India Sweet House</span>
            <span style={{ color:C.border, fontWeight:300 }}>|</span>
            <span style={{ fontSize:14, color:C.inkSoft }}>Sales Hub</span>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
            {["🔍","◎","➕","💡","▽","⚙️","❓","🔔"].map((ic,i)=><CircleBtn key={i}>{ic}</CircleBtn>)}
            <Avatar name="ISH Owner" idx={3} size={36}/>
          </div>
        </div>

        {/* BODY */}
        <div style={{ display:"flex" }}>

          {/* LEFT NAV MENU */}
          <div style={{ width:200, background:C.white, padding:"22px 16px", borderRight:`1px solid ${C.border}`, flexShrink:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
              <span style={{ fontWeight:700, fontSize:18, color:C.ink }}>Menu</span>
              <CircleBtn size={28}>‹</CircleBtn>
            </div>
            {[["🏠","Home"],["🕐","Recent"],["📌","Pinned"]].map(([ic,l])=>(
              <div key={l} style={{ display:"flex", gap:11, alignItems:"center", padding:"9px 8px", fontSize:13.5, color:C.inkSoft }}><span>{ic}</span>{l}</div>
            ))}
            <div style={{ fontSize:11, fontWeight:700, color:C.inkFaint, margin:"18px 0 6px 8px", letterSpacing:0.5 }}>MY WORK</div>
            {[["🚀","Lead Accelerator",true],["▦","Dashboards"],["◷","Activities"]].map(([ic,l,act])=>(
              <div key={l} style={{ display:"flex", gap:11, alignItems:"center", padding:"9px 8px", borderRadius:10, fontSize:13.5, fontWeight: act?700:500, color:C.ink, background: act?C.yellow:"transparent", marginBottom:2 }}><span>{ic}</span>{l}</div>
            ))}
            <div style={{ fontSize:11, fontWeight:700, color:C.inkFaint, margin:"18px 0 6px 8px", letterSpacing:0.5 }}>CUSTOMERS</div>
            {[["👤","Accounts"],["📇","Contacts"]].map(([ic,l])=>(
              <div key={l} style={{ display:"flex", gap:11, alignItems:"center", padding:"9px 8px", fontSize:13.5, color:C.inkSoft }}><span>{ic}</span>{l}</div>
            ))}
            <div style={{ fontSize:11, fontWeight:700, color:C.inkFaint, margin:"18px 0 6px 8px", letterSpacing:0.5 }}>PIPELINE</div>
            {[["🎯","Leads"],["💼","Opportunities"]].map(([ic,l])=>(
              <div key={l} style={{ display:"flex", gap:11, alignItems:"center", padding:"9px 8px", fontSize:13.5, color:C.inkSoft }}><span>{ic}</span>{l}</div>
            ))}
            <div style={{ fontSize:11, fontWeight:700, color:C.inkFaint, margin:"18px 0 6px 8px", letterSpacing:0.5 }}>PERFORMANCE</div>
            {[["🎯","Targets"],["📈","Forecasts"]].map(([ic,l])=>(
              <div key={l} style={{ display:"flex", gap:11, alignItems:"center", padding:"9px 8px", fontSize:13.5, color:C.inkSoft }}><span>{ic}</span>{l}</div>
            ))}
          </div>

          {/* QUEUE PANEL */}
          <div style={{ width:330, background:C.appBg, padding:"22px 18px", flexShrink:0, borderRight:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontWeight:700, fontSize:20, color:C.ink }}>My Leads</span>
              <div style={{ display:"flex", gap:6 }}>{["↻","📅","🔍"].map((ic,i)=><CircleBtn key={i} size={30}>{ic}</CircleBtn>)}</div>
            </div>
            <div style={{ fontSize:12, color:C.inkFaint, fontWeight:600, margin:"16px 0 10px" }}>TODAY</div>
            {QUEUE.slice(0,3).map((item,i)=>(
              <QueueItem key={item.id} item={item} idx={i} active={activeQueue===item.id} onClick={()=>setActiveQueue(item.id)}/>
            ))}
            <div style={{ display:"flex", alignItems:"center", gap:10, margin:"18px 0 12px" }}>
              <div style={{ flex:1, height:1, background:C.border }}/>
              <span style={{ fontSize:11.5, color:C.inkFaint, fontWeight:600 }}>3 WEEKS AGO</span>
              <div style={{ flex:1, height:1, background:C.border }}/>
            </div>
            {QUEUE.slice(3).map((item,i)=>(
              <QueueItem key={item.id} item={item} idx={i+3} active={activeQueue===item.id} onClick={()=>setActiveQueue(item.id)}/>
            ))}
          </div>

          {/* RECORD WORKSPACE */}
          <div style={{ flex:1, padding:"22px 26px", minWidth:0, overflow:"hidden" }}>

            {/* TOOLBAR */}
            <div style={{ background:C.yellowGrad, borderRadius:"22px 22px 0 0", padding:"16px 22px", display:"flex", gap:8, flexWrap:"wrap" }}>
              <ToolbarBtn icon="💾" label="Save"/>
              <ToolbarBtn icon="＋" label="New" dark/>
              <ToolbarBtn icon="🗑" label="Delete"/>
              <ToolbarBtn icon="↻" label="Refresh"/>
              <ToolbarBtn icon="🔓" label="Check Access"/>
              <ToolbarBtn icon="📄" label="To PDF"/>
              <ToolbarBtn icon="📞" label="Quality"/>
              <ToolbarBtn icon="⛓" label="Process"/>
              <ToolbarBtn icon="•••" label=""/>
            </div>

            {/* RECORD HEADER */}
            <div style={{ background:C.yellowGrad, padding:"22px 22px 26px", display:"flex", alignItems:"flex-start", gap:18 }}>
              <Avatar name={current.name} idx={0} size={64}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:26, fontWeight:800, color:C.ink, marginBottom:8 }}>{current.name}</div>
                <div style={{ display:"flex", gap:8 }}>
                  {record.tags.map(t=>(
                    <span key={t} style={{ fontSize:11.5, fontWeight:600, color:C.ink, background:"rgba(255,255,255,0.55)", padding:"4px 12px", borderRadius:10 }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", gap:34, paddingTop:4 }}>
                {[["Lead Source",record.leadSource],["Rating",record.rating],["Status",record.status]].map(([l,v])=>(
                  <div key={l}>
                    <div style={{ fontSize:10.5, color:"rgba(20,20,30,0.55)", fontWeight:600, marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{v}</div>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize:10.5, color:"rgba(20,20,30,0.55)", fontWeight:600, marginBottom:3 }}>Owner</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <Avatar name={record.owner} idx={5} size={20}/>
                    <span style={{ fontSize:13, fontWeight:700, color:C.ink }}>{record.owner}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PIPELINE STEPPER */}
            <div style={{ background:C.yellowGrad, padding:"0 22px 22px", display:"flex", alignItems:"center", gap:0 }}>
              <div style={{ background:"rgba(255,255,255,0.4)", borderRadius:16, padding:"12px 18px", marginRight:14, flexShrink:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>Diwali Gifting Pipeline</div>
                <div style={{ fontSize:11, color:"rgba(20,20,30,0.6)", marginTop:2 }}>Active for {current.score>85?2:5} Days</div>
              </div>
              <CircleBtn size={28}>‹</CircleBtn>
              <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"0 10px", overflow:"hidden" }}>
                {STAGES.map((s,i)=>(
                  <StageNode key={s} label={i===stage?`${s} (3 D)`:s} active={i===stage} done={i<stage} isLast={i===STAGES.length-1}/>
                ))}
              </div>
              <CircleBtn size={28}>›</CircleBtn>
            </div>

            {/* TABS */}
            <div style={{ background:C.white, padding:"16px 22px 0", display:"flex", gap:6 }}>
              {["Summary","Relationship Analytics","Details","Related"].map(t=>(
                <TabBtn key={t} label={t} active={activeTab===t} onClick={()=>setActiveTab(t)}/>
              ))}
            </div>

            {/* GRID: Contact | Up Next | Lead Score */}
            <div style={{ background:C.white, padding:"18px 22px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>

              {/* CONTACT CARD */}
              <div style={{ background: C.pinkSoft, borderRadius:20, padding:"20px 20px" }}>
                <div style={{ fontWeight:700, fontSize:16, color:C.ink, marginBottom:16 }}>Contact</div>
                <FieldRow label="Topic" value={record.contact.topic}/>
                <FieldRow label="First Name" value={record.contact.firstName}/>
                <FieldRow label="Last Name" value={record.contact.lastName}/>
                <FieldRow label="Job Title" value={current.title}/>
                <FieldRow label="Business Phone" value={record.contact.businessPhone} action="📞"/>
                <FieldRow label="Mobile Phone" value={record.contact.mobilePhone} action="📞"/>
                <FieldRow label="Email" value={record.contact.email} action="✉️"/>

                <div style={{ fontWeight:700, fontSize:16, color:C.ink, margin:"20px 0 12px" }}>Company</div>
                <FieldRow label="Company" value={current.company}/>
                <FieldRow label="Employees" value={record.company.employees}/>
                <FieldRow label="City" value={record.company.city}/>
              </div>

              {/* UP NEXT CARD */}
              <div style={{ background:C.yellowSoft, borderRadius:20, padding:"20px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontWeight:700, fontSize:16, color:C.ink }}>Up Next</div>
                  <CircleBtn size={28}>↻</CircleBtn>
                </div>
                <div style={{ background:"rgba(255,255,255,0.6)", borderRadius:12, padding:"8px 14px", fontSize:12, color:C.inkSoft, fontWeight:600, marginBottom:14 }}>
                  Sequence: Diwali Tasting → Close
                </div>
                {record.upNext.map((t,i)=><UpNextCard key={i} task={t} idx={i}/>)}
              </div>

              {/* LEAD SCORE CARD */}
              <div style={{ background:C.greenSoft, borderRadius:20, padding:"20px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontWeight:700, fontSize:16, color:C.ink }}>Lead Score</div>
                  <div style={{ display:"flex", gap:6 }}>
                    <CircleBtn size={28}>•••</CircleBtn>
                    <CircleBtn size={28}>↗</CircleBtn>
                  </div>
                </div>
                <ScoreGauge score={current.score}/>
                <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, marginTop:-6, marginBottom:18 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:C.ink }}>Grade {current.score>85?"A":current.score>65?"B":"C"}</span>
                  <span style={{ fontSize:11.5, fontWeight:600, color:"#1F8050", background:"rgba(63,190,130,0.18)", padding:"3px 10px", borderRadius:8 }}>→ Steady</span>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
                  {record.score.factors.map((f,i)=>(
                    <div key={i} style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
                      <span style={{ color:C.green, fontSize:14, marginTop:1 }}>▲</span>
                      <div style={{ fontSize:12.5, color:C.ink, lineHeight:1.5 }}>{f.label} <b>{f.bold}</b></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* BOTTOM ROW: Company detail | Timeline | Who Knows Whom */}
            <div style={{ background:C.white, padding:"0 22px 22px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <div style={{ background:C.pinkSoft, borderRadius:20, padding:"18px 20px" }}>
                <div style={{ fontWeight:700, fontSize:15, color:C.ink, marginBottom:12 }}>Gifting Intelligence</div>
                <div style={{ fontSize:12.5, color:C.inkSoft, lineHeight:1.8 }}>
                  Posted about employee appreciation on LinkedIn. Approved last 2 vendor contracts. Open to outreach — replied to similar vendor within 48hrs historically.
                </div>
              </div>

              <div style={{ background:C.yellowSoft, borderRadius:20, padding:"18px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontWeight:700, fontSize:15, color:C.ink }}>Timeline</div>
                  <div style={{ display:"flex", gap:6 }}>{["➕","▽","•••"].map((ic,i)=><CircleBtn key={i} size={26}>{ic}</CircleBtn>)}</div>
                </div>
                <div style={{ background:"rgba(255,255,255,0.6)", borderRadius:12, padding:"8px 14px", fontSize:12, color:C.inkFaint, marginBottom:10 }}>🔍 Search Timeline</div>
                <div style={{ fontSize:12, color:C.inkSoft }}>No activity logged yet — sequence starts on first contact.</div>
              </div>

              <div style={{ background:C.greenSoft, borderRadius:20, padding:"18px 20px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontWeight:700, fontSize:15, color:C.ink }}>Who Knows Whom</div>
                  <CircleBtn size={26}>⎇</CircleBtn>
                </div>
                {record.network.map((p,i)=>(
                  <div key={p.name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <Avatar name={p.name} idx={i+1} size={34}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{p.name}</div>
                      <div style={{ fontSize:11, color:C.inkFaint }}>{p.email}</div>
                    </div>
                    <span style={{ display:"flex", gap:2 }}>{[1,2,3,4].map(i=><span key={i} style={{width:4,height:4,borderRadius:"50%",background:C.green}}/>)}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

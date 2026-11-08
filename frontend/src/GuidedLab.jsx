import { useState } from "react";
import "./GuidedLab.css";

const stateName = status => ({
  healthy: "תקין", degraded: "תפקוד חלקי", unhealthy: "לא תקין",
  stopped: "נעצר", unknown: "לא ידוע"
})[status] || "לא ידוע";

function Observation({ title, snapshot }) {
  return <div className="guide-observation">
    <h4>{title}</h4>
    {!snapshot ? <p>עדיין אין מדידה שמורה. לחץ על ״שמור מדידה״ כדי לראות תוצאה אמיתית.</p> : <>
      <div><span>Docker — שרת API</span><strong>{snapshot.api ? stateName(snapshot.api.status) : "לא זמין"}</strong></div>
      <div><span>Docker — שרת Nginx</span><strong>{snapshot.proxy ? stateName(snapshot.proxy.status) : "לא זמין"}</strong></div>
      <div><span>בקשת HTTP דרך Nginx</span><strong>{snapshot.probe ? (snapshot.probe.httpStatus ? "HTTP " + snapshot.probe.httpStatus : "אין תגובה") : "לא זמין"}</strong></div>
      <small>נמדד: {new Date(snapshot.at).toLocaleTimeString()} · מצב Docker ובדיקת HTTP, לא נתוני הדגמה</small>
    </>}
  </div>;
}

export default function GuidedLab({ topology, probe, authenticated, busy, onExperiment, onRefresh }) {
  const [step, setStep] = useState(0);
  const [before, setBefore] = useState(null);
  const [during, setDuring] = useState(null);
  const [after, setAfter] = useState(null);
  const [explain, setExplain] = useState(false);

  const api = topology?.services?.find(s => s.id === "api");
  const capture = setter => {
    if (!topology || !probe || !api?.observed) return;
    setter({
      at: new Date().toISOString(),
      api: { status: api.status, containerStatus: api.containerStatus },
      proxy: topology.services.find(s => s.id === "proxy"),
      probe: { httpStatus: probe.httpStatus, healthy: probe.healthy, reachable: probe.reachable }
    });
  };
  const valid = Boolean(topology && probe && api?.observed);
  const steps = ["היכרות עם המערכת", "לפני התקלה", "ניסוי תקלה", "התאוששות ומסקנות"];

  return <section className="guided-lab" dir="rtl">
    <header className="guided-header">
      <div><span className="guide-eyebrow">מעבדה אינטראקטיבית · ניסוי 01</span>
        <h2>למה לא מספיק שהשרת פשוט פועל?</h2>
        <p>נבדוק מה קורה לבקשה אמיתית כשה־API נעצר, ולמה צריך גם בדיקת תקינות ולא רק רשימת קונטיינרים.</p>
      </div>
      <span className="guide-safety">סביבת Docker מבודדת · רק API ניסיוני</span>
    </header>

    <nav className="guide-steps" aria-label="שלבי המעבדה">
      {steps.map((name, index) => <button type="button" key={name} className={step === index ? "active" : ""} onClick={() => { setStep(index); setExplain(false); }}>
        <span>{index + 1}</span>{name}
      </button>)}
    </nav>

    <div className="guide-content">
      {step === 0 && <>
        <h3>מה בנינו, ולמה כל רכיב נמצא כאן?</h3>
        <p>כשאתה פותח אתר, הבקשה עוברת בין שירותים. כל שירות אחראי על משהו אחר — אבל לא כל מערכת חייבת את כולם.</p>
        <div className="guide-pipeline">
          <div><b>דפדפן</b><small>שולח בקשת HTTP</small></div><span>←</span>
          <div><b>Nginx</b><small>מקבל ומנתב את הבקשה</small></div><span>←</span>
          <div><b>Node.js API</b><small>מבצע את פעולת השרת</small></div><span>←</span>
          <div><b>PostgreSQL</b><small>שומר נתונים בין בקשות</small></div>
        </div>
        <p><strong>למה Nginx?</strong> במעבדה הוא כתובת הכניסה היחידה מהמחשב ומנתב ל־API ברשת Docker הפנימית. אתר קטן יכול לעבוד גם בלעדיו; הוא אינו חובה בכל פרויקט.</p>
        <p><strong>למה API?</strong> הוא מכיל את הלוגיקה שמקבלת את הבקשה ופונה למסד הנתונים. בלי API היינו צריכים לשנות את מבנה המערכת או להסתפק בקבצים סטטיים.</p>
        <p><strong>למה PostgreSQL?</strong> כדי לשמור נתונים לאורך זמן. אם לא צריך מידע מתמשך, אפשר לבנות שירות בלי מסד נתונים.</p>
        <p><strong>למה Docker?</strong> כדי להפעיל את שלושת הרכיבים בסביבה נפרדת ובתצורה שחוזרת על עצמה. אפשר להפעיל תוכנות גם בלי Docker, אבל אז צריך לנהל התקנות ותלויות אחרת.</p>
        <div className="guide-insight"><strong>השאלה שנבדוק:</strong> האם ״הקונטיינר רץ״ אומר שהמשתמש מצליח לקבל תשובה? הניסוי הבא יבדוק את זה בפועל.</div>
        <button type="button" className="guide-primary" onClick={() => setStep(1)}>ממשיכים לבדיקה ←</button>
      </>}

      {step === 1 && <>
        <h3>קודם מודדים מצב תקין</h3>
        <p>לפני שמקלקלים משהו, צריך לדעת איך המערכת נראית כשהיא עובדת. נבדוק גם את מצב Docker וגם בקשת HTTP אמיתית.</p>
        <div className="guide-insight">Docker מדווח אם תהליך הקונטיינר פועל. בקשת HTTP בודקת אם המסלול דרך Nginx באמת מחזיר תשובה. אלה שתי שאלות שונות.</div>
        <Observation title="מדידה לפני התקלה" snapshot={before} />
        <div className="guide-actions"><button type="button" onClick={onRefresh}>רענן נתונים</button><button type="button" className="guide-primary" disabled={!valid} onClick={() => capture(setBefore)}>שמור מדידה נוכחית</button></div>
        {!valid && <p className="guide-warning">אין כרגע נתוני Docker ו־HTTP מאומתים. בדוק שה־Backend והמעבדה פועלים.</p>}
        <button type="button" className="guide-primary" disabled={!before} onClick={() => setStep(2)}>לניסוי התקלה ←</button>
      </>}

      {step === 2 && <>
        <h3>מה יקרה אם נעצור רק את ה־API?</h3>
        <p>אנחנו לא נוגעים ב־Nginx או במסד הנתונים. נעצור רק את קונטיינר ה־API הניסיוני ונראה אם בקשת HTTP עדיין מצליחה.</p>
        <div className="guide-insight"><strong>מה כדאי לשים לב אליו:</strong> האם Nginx ממשיך לפעול? האם בקשת HTTP מצליחה? אם לא, האם זה אומר ש־Nginx עצמו קרס?</div>
        <div className="guide-actions">
          <button type="button" className="guide-stop" disabled={!authenticated || busy || api?.containerStatus !== "running"} onClick={() => onExperiment("stop")}>עצור API ניסיוני</button>
          <button type="button" onClick={onRefresh}>רענן מדידות</button>
          <button type="button" className="guide-primary" disabled={!valid} onClick={() => capture(setDuring)}>שמור תוצאה אחרי התקלה</button>
        </div>
        {!authenticated && <p className="guide-warning">כדי לבצע עצירה צריך להתחבר דרך Admin Login הקיים. אפשר לקרוא את ההסברים גם בלי להתחבר.</p>}
        <div className="guide-comparison"><Observation title="לפני" snapshot={before} /><Observation title="אחרי העצירה" snapshot={during} /></div>
        {during && <div className="guide-insight"><strong>מה נמדד?</strong> {during.api?.containerStatus === "exited" ? "ה־API אכן נעצר. " : "ה־API לא נצפה במצב עצור במדידה הזו. "}{during.probe?.httpStatus === 200 ? "בקשת HTTP עדיין הצליחה — כדאי לבדוק למה." : "בקשת HTTP כבר לא החזירה 200."} זה לא מוכיח אוטומטית מהי סיבת כל תקלה אחרת.</div>}
        <button type="button" className="guide-primary" disabled={!during} onClick={() => setStep(3)}>לבדיקת ההתאוששות ←</button>
      </>}

      {step === 3 && <>
        <h3>האם Restart באמת פתר את הבעיה?</h3>
        <p>הפעלה מחדש של קונטיינר אינה הוכחה שהאפליקציה חזרה לעבוד. צריך לבדוק שוב בקשת HTTP, ולהשוות למדידה המקורית.</p>
        <div className="guide-actions">
          <button type="button" className="guide-recover" disabled={!authenticated || busy || api?.containerStatus !== "exited"} onClick={() => onExperiment("start")}>הפעל מחדש את ה־API</button>
          <button type="button" onClick={onRefresh}>רענן מדידות</button>
          <button type="button" className="guide-primary" disabled={!valid} onClick={() => capture(setAfter)}>שמור מדידה אחרי התאוששות</button>
        </div>
        <div className="guide-comparison"><Observation title="בזמן התקלה" snapshot={during} /><Observation title="אחרי ההתאוששות" snapshot={after} /></div>
        {after && <div className="guide-insight"><strong>מסקנה לפי המדידה:</strong> {after.api?.status === "healthy" && after.probe?.httpStatus === 200 ? "ה־API תקין לפי Docker ובקשת HTTP דרך Nginx הצליחה. ההתאוששות נצפתה בשתי הבדיקות." : "עדיין אין הוכחה מלאה להתאוששות: צריך גם שירות תקין וגם HTTP 200. אפשר להמתין ולמדוד שוב."}</div>}
        <button type="button" className="guide-explain" onClick={() => setExplain(value => !value)}>{explain ? "הסתר הסבר" : "למה צריך בכלל Health Check?"}</button>
        {explain && <div className="guide-insight"><strong>ההבדל החשוב:</strong> תהליך יכול לרוץ אבל להחזיר שגיאות. Docker Health Check בודק תנאי תקינות מוגדרים, בעוד בדיקת HTTP מבחוץ מאמתת מסלול בקשה מסוים. אף אחת מהבדיקות לא מבטיחה שכל תכונה באפליקציה עובדת. גם Restart אינו תמיד הפתרון: אם מסד הנתונים לא זמין, למשל, הפעלה מחדש של ה־API לבדה לא בהכרח תעזור.</div>}
        <button type="button" onClick={() => { setStep(0); setBefore(null); setDuring(null); setAfter(null); }}>התחל ניסוי מחדש</button>
      </>}
    </div>
    <footer className="guide-footer">הניסוי משתמש בנתונים אמיתיים מה־Backend. המדידות נשמרות בזיכרון הדפדפן בלבד ולא נחשבות להיסטוריית אירועים קבועה. אין שאלות חובה.</footer>
  </section>;
}

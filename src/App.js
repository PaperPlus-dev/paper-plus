import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "firebase/auth";

function App() {
  const [page, setPage] = useState("login");
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [tier, setTier] = useState("Higher");
  const [examBoard, setExamBoard] = useState("AQA");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [currentQ, setCurrentQ] = useState(1);
  const [marksScored, setMarksScored] = useState(0);
  const [msVisible, setMsVisible] = useState(false);
  const [markSelected, setMarkSelected] = useState(false);
  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dashTab, setDashTab] = useState("overview");
  const [selectedMarks, setSelectedMarks] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [topicScores, setTopicScores] = useState({});
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState("");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [hasPaidForSciences, setHasPaidForSciences] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setPage("setup");
        try {
          const userRef = doc(db, "users", u.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.topicScores) setTopicScores(data.topicScores);
            if (data.sessionHistory) setSessionHistory(data.sessionHistory);
            if (data.hasPaidForSciences) setHasPaidForSciences(true);
          }
        } catch (err) {
          console.log("Error loading scores:", err);
        }
      } else {
        setPage("login");
      }
    });
    return unsub;
  }, []);

  // Check for payment success in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (paymentStatus === 'success' && sessionId && user) {
      setCheckingPayment(true);
      fetch('https://paper-plus.onrender.com/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })
      .then(res => res.json())
      .then(async (data) => {
        if (data.paymentStatus === 'paid') {
          // Update Firestore
          const userRef = doc(db, "users", user.uid);
          await setDoc(userRef, {
            hasPaidForSciences: true,
            paidAt: new Date().toISOString()
          }, { merge: true });
          setHasPaidForSciences(true);
          alert('🎉 Payment successful! Sciences unlocked!');
        }
        setCheckingPayment(false);
        // Clean up URL
        window.history.replaceState({}, '', '/');
      })
      .catch(err => {
        console.log('Payment verification error:', err);
        setCheckingPayment(false);
      });
    }
  }, [user]);

  const subjects = {
    Biology: { icon: "🧬", topics: ["Cell biology","Organisation","Bioenergetics","Infection & response","Homeostasis","Inheritance","Ecology"] },
    Chemistry: { icon: "⚗️", topics: ["Atomic structure","Bonding","Quantitative chemistry","Chemical changes","Energy changes","Rates of reaction","Organic chemistry","Electrolysis"] },
    Physics: { icon: "⚡", topics: ["Energy","Electricity","Particle model","Atomic structure","Forces","Waves","Magnetism"] },
    Maths: { icon: "📐", topics: ["Number","Algebra","Ratio","Geometry","Probability","Statistics","Trigonometry"] },
  };

  const examBoards = ["AQA", "Edexcel", "OCR"];

  async function handleAuth() {
    setAuthError("");
    if (!email || !password) { setAuthError("Please fill in all fields."); return; }
    if (authMode === "signup" && !name) { setAuthError("Please enter your name."); return; }
    if (password.length < 6) { setAuthError("Password must be at least 6 characters."); return; }
    try {
      if (authMode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setAuthError(err.message.replace("Firebase: ", "").replace(/\(.*\)/, ""));
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setSessionHistory([]);
    setTopicScores({});
  }

  async function unlockSciences() {
    if (!user) {
      alert('Please log in first');
      return;
    }

    try {
      const response = await fetch('https://paper-plus.onrender.com/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.uid,
          userEmail: user.email 
        })
      });
      
      const { url } = await response.json();
      window.location.href = url; // Redirect to Stripe checkout
    } catch (error) {
      console.error('Payment error:', error);
      alert('Failed to start payment. Please try again.');
    }
  }

  function toggleSubject(name) {
    // Lock sciences if not paid
    if (!hasPaidForSciences && (name === 'Biology' || name === 'Chemistry' || name === 'Physics')) {
      unlockSciences();
      return;
    }
    
    setSelectedSubjects(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
    setSelectedTopics([]);
  }

  function toggleTopic(topic) {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  }

  async function generateQuestion() {
    setLoading(true);
    setMsVisible(false);
    setMarkSelected(false);
    setSelectedMarks(null);
    setQuestion(null);

    const subject = selectedSubjects[Math.floor(Math.random() * selectedSubjects.length)];
    const topicPool = selectedTopics.length > 0 ? selectedTopics : subjects[subject].topics;
    const topic = topicPool[Math.floor(Math.random() * topicPool.length)];
    const marks = [2, 3, 4, 5, 6][Math.floor(Math.random() * 5)];

    const prompt = `You are a ${examBoard} GCSE ${subject} examiner. Generate a single hard exam question for the topic "${topic}" at ${tier} tier worth ${marks} marks.

If the question involves calculations, make sure that no rounding occurs until the final answer. All working should be shown, and rounding should only be done at the final step. For non-calculation questions (e.g., theory or explanation), there should be no need to round.

Respond in this exact JSON format with no markdown or extra text:
{
  "subject": "${subject}",
  "topic": "${topic}",
  "marks": ${marks},
  "question": "the full question text here",
  "markscheme": ["mark point 1", "mark point 2", "mark point 3"]
}`;

    try {
      const response = await fetch("https://paper-plus.onrender.com/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await response.json();
      const text = data.content[0].text;
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setQuestion(parsed);
    } catch (err) {
      setQuestion({ subject, topic, marks, question: "Error generating question. Please try again.", markscheme: [] });
    }
    setLoading(false);
  }

  function startQuiz() {
    if (selectedSubjects.length === 0) return;
    setCurrentQ(1);
    setMarksScored(0);
    setPage("quiz");
    generateQuestion();
  }

  async function nextQuestion() {
    if (currentQ >= questionCount) {
      const newSession = {
        title: `${selectedSubjects.join(" + ")} — ${tier}`,
        sub: `${examBoard} · ${questionCount} questions`,
        score: marksScored,
        date: "Today"
      };
      setSessionHistory(prev => [newSession, ...prev.slice(0, 9)]);
      
      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userRef);
          const existingHistory = userDoc.exists() ? (userDoc.data().sessionHistory || []) : [];
          await setDoc(userRef, {
            sessionHistory: [newSession, ...existingHistory.slice(0, 9)]
          }, { merge: true });
        } catch (err) {
          console.log("Error saving session:", err);
        }
      }
      setPage("dashboard");
      return;
    }
    setCurrentQ(q => q + 1);
    generateQuestion();
  }

  async function handleMarkSelect(val) {
    if (markSelected) return;
    setSelectedMarks(val);
    setMarksScored(s => s + val);
    setMarkSelected(true);
    if (question) {
      const newTopicScores = { ...topicScores };
      const key = question.topic;
      const existing = newTopicScores[key] || { scored: 0, total: 0 };
      newTopicScores[key] = { scored: existing.scored + val, total: existing.total + question.marks };
      setTopicScores(newTopicScores);

      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const existingTopics = userDoc.data().topicScores || {};
            const existingTopic = existingTopics[key] || { scored: 0, total: 0 };
            await updateDoc(userRef, {
              [`topicScores.${key}`]: {
                scored: existingTopic.scored + val,
                total: existingTopic.total + question.marks
              }
            });
          } else {
            await setDoc(userRef, {
              topicScores: {
                [key]: { scored: val, total: question.marks }
              },
              sessionHistory: []
            });
          }
        } catch (err) {
          console.log("Error saving score:", err);
        }
      }
    }
  }
  
  const styles = {
    app: { fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "0 auto", padding: "1rem", background: "#f8f8f6", minHeight: "100vh" },
    nav: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "1.5rem" },
    logo: { fontSize: 22, fontWeight: 500 },
    logoSpan: { color: "#185FA5" },
    navBtn: { fontSize: 13, color: "#888", background: "none", border: "none", cursor: "pointer" },
    card: { background: "white", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" },
    cardTitle: { fontSize: 16, fontWeight: 500, marginBottom: "0.5rem" },
    cardSub: { fontSize: 13, color: "#888", marginBottom: "1rem", lineHeight: 1.5 },
    subjectGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "0.5rem" },
    subjectBtn: (selected) => ({ background: selected ? "#E6F1FB" : "white", border: selected ? "2px solid #185FA5" : "0.5px solid #e0e0e0", borderRadius: 8, padding: 12, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }),
    subjectIcon: { fontSize: 20, display: "block", marginBottom: 6 },
    subjectName: { fontSize: 14, fontWeight: 500, color: "#1a1a1a" },
    tierToggle: { display: "flex", background: "#f0f0ee", borderRadius: 8, padding: 3, gap: 3 },
    tierBtn: (active) => ({ flex: 1, padding: 8, border: active ? "0.5px solid #e0e0e0" : "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, background: active ? "white" : "none", color: active ? "#1a1a1a" : "#888", transition: "all 0.15s" }),
    topicList: { display: "flex", flexWrap: "wrap", gap: 6 },
    topicTag: (selected) => ({ padding: "5px 10px", borderRadius: 999, border: selected ? "0.5px solid #185FA5" : "0.5px solid #e0e0e0", fontSize: 12, cursor: "pointer", background: selected ? "#E6F1FB" : "white", color: selected ? "#0C447C" : "#888", transition: "all 0.15s" }),
    primaryBtn: (disabled) => ({ width: "100%", padding: 12, background: disabled ? "#e0e0e0" : "#185FA5", color: disabled ? "#aaa" : "white", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer" }),
    progressWrap: { background: "#e0e0e0", borderRadius: 999, height: 4, margin: "0.5rem 0 1rem" },
    progressBar: (pct) => ({ background: "#185FA5", height: 4, borderRadius: 999, width: `${pct}%`, transition: "width 0.3s" }),
    qMeta: { display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap" },
    badge: (bg, color) => ({ fontSize: 11, padding: "3px 8px", borderRadius: 999, fontWeight: 500, background: bg, color }),
    qText: { fontSize: 15, lineHeight: 1.7, marginBottom: "1.25rem", color: "#1a1a1a" },
    btnRow: { display: "flex", gap: 8 },
    secBtn: { flex: 1, padding: 10, border: "0.5px solid #ccc", borderRadius: 8, background: "none", fontSize: 13, cursor: "pointer", color: "#1a1a1a" },
    msSection: { borderTop: "0.5px solid #e0e0e0", paddingTop: "1rem", marginTop: "1rem" },
    msTitle: { fontSize: 12, fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: "0.75rem" },
    msPoint: { display: "flex", gap: 8, marginBottom: 6, fontSize: 14, lineHeight: 1.5 },
    msTick: { color: "#1D9E75", fontWeight: 500, flexShrink: 0 },
    marksRow: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: "1rem", paddingTop: "1rem", borderTop: "0.5px solid #e0e0e0" },
    marksLabel: { fontSize: 13, color: "#888" },
    markBubble: (selected) => ({ width: 32, height: 32, borderRadius: "50%", border: selected ? "none" : "0.5px solid #e0e0e0", background: selected ? "#185FA5" : "white", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: selected ? "white" : "#1a1a1a" }),
    dashGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" },
    metric: { background: "#f0f0ee", borderRadius: 8, padding: "1rem" },
    metricLabel: { fontSize: 12, color: "#888", marginBottom: 4 },
    metricValue: { fontSize: 24, fontWeight: 500, color: "#1a1a1a" },
    metricSub: { fontSize: 11, color: "#888", marginTop: 2 },
    navTabs: { display: "flex", background: "#f0f0ee", borderRadius: 8, padding: 3, gap: 3, marginBottom: "1.5rem" },
    navTab: (active) => ({ flex: 1, padding: 8, border: active ? "0.5px solid #e0e0e0" : "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500, background: active ? "white" : "none", color: active ? "#1a1a1a" : "#888", textAlign: "center" }),
    barRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
    barLabel: { fontSize: 12, color: "#888", width: 90, flexShrink: 0 },
    barTrack: { flex: 1, background: "#f0f0ee", borderRadius: 999, height: 8 },
    barFill: (pct, color) => ({ height: 8, borderRadius: 999, background: color || "#185FA5", width: `${pct}%` }),
    barPct: { fontSize: 12, color: "#888", width: 32, textAlign: "right" },
    examBoardToggle: { display: "flex", background: "#f0f0ee", borderRadius: 8, padding: 3, gap: 3 },
    examBoardBtn: (active) => ({ flex: 1, padding: 8, border: active ? "0.5px solid #e0e0e0" : "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, background: active ? "white" : "none", color: active ? "#1a1a1a" : "#888", transition: "all 0.15s" }),
    input: { width: "100%", padding: "10px 12px", border: "0.5px solid #e0e0e0", borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: "border-box", background: "white", color: "#1a1a1a" },
    authToggle: { fontSize: 13, color: "#888", textAlign: "center", marginTop: "1rem" },
    authLink: { color: "#185FA5", cursor: "pointer", marginLeft: 4 },
    errorMsg: { fontSize: 13, color: "#E24B4A", marginBottom: 10, textAlign: "center" },
  };

  if (authLoading) return (
    <div style={{ ...styles.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 14, color: "#888" }}>Loading...</div>
    </div>
  );

  if (page === "login") return (
    <div style={styles.app}>
      <div style={{ textAlign: "center", padding: "2rem 0 1.5rem" }}>
        <div style={styles.logo}>Paper<span style={styles.logoSpan}>Plus</span></div>
        <div style={{ fontSize: 14, color: "#888", marginTop: 6 }}>GCSE exam practice, powered by AI</div>
      </div>
      <div style={styles.card}>
        <div style={styles.navTabs}>
          <button style={styles.navTab(authMode === "login")} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Log in</button>
          <button style={styles.navTab(authMode === "signup")} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>Sign up</button>
        </div>
        {authMode === "signup" && (
          <input style={styles.input} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
        )}
        <input style={styles.input} placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
        <input style={styles.input} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        {authError && <div style={styles.errorMsg}>{authError}</div>}
        <button style={styles.primaryBtn(false)} onClick={handleAuth}>
          {authMode === "login" ? "Log in" : "Create account"}
        </button>
        <div style={styles.authToggle}>
          {authMode === "login" ? (
            <>Don't have an account?<span style={styles.authLink} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>Sign up</span></>
          ) : (
            <>Already have an account?<span style={styles.authLink} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Log in</span></>
          )}
        </div>
      </div>
    </div>
  );

  if (page === "setup") return (
    <div style={styles.app}>
      <div style={styles.nav}>
        <div style={styles.logo}>Paper<span style={styles.logoSpan}>Plus</span></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button style={styles.navBtn} onClick={() => setPage("dashboard")}>Dashboard</button>
          <button style={styles.navBtn} onClick={handleLogout}>Log out</button>
        </div>
      </div>

      {user && <div style={{ fontSize: 13, color: "#888", marginBottom: "1rem" }}>Welcome back, {user.displayName || user.email} 👋</div>}

      <div style={styles.card}>
        <div style={styles.cardTitle}>Exam board</div>
        <div style={styles.cardSub}>Select your exam board.</div>
        <div style={styles.examBoardToggle}>
          {examBoards.map(board => (
            <button key={board} style={styles.examBoardBtn(examBoard === board)} onClick={() => setExamBoard(board)}>{board}</button>
          ))}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Choose your subjects</div>
        <div style={styles.cardSub}>Select one or more subjects for your paper.</div>
        <div style={styles.subjectGrid}>
          {Object.entries(subjects).map(([name, data]) => {
            const isScience = name === 'Biology' || name === 'Chemistry' || name === 'Physics';
            const isLocked = isScience && !hasPaidForSciences;
            
            return (
              <button 
                key={name} 
                style={{
                  ...styles.subjectBtn(selectedSubjects.includes(name)),
                  opacity: isLocked ? 0.6 : 1,
                  position: 'relative'
                }} 
                onClick={() => toggleSubject(name)}
              >
                <span style={styles.subjectIcon}>{data.icon}</span>
                <div style={styles.subjectName}>
                  {name}
                  {isLocked && <span style={{ marginLeft: 4 }}>🔒</span>}
                </div>
                {isLocked && (
                  <div style={{ 
                    fontSize: 10, 
                    color: '#185FA5', 
                    marginTop: 4,
                    fontWeight: 500
                  }}>
                    £9.99 to unlock
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Tier</div>
        <div style={styles.tierToggle}>
          {["Foundation", "Higher"].map(t => (
            <button key={t} style={styles.tierBtn(tier === t)} onClick={() => setTier(t)}>{t}</button>
          ))}
        </div>
      </div>

      {selectedSubjects.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Topics</div>
          <div style={styles.cardSub}>Filter by topic or leave all unselected for a mixed paper.</div>
          <div style={styles.topicList}>
            {selectedSubjects.flatMap(s => subjects[s].topics).filter((v, i, a) => a.indexOf(v) === i).map(topic => (
              <span key={topic} style={styles.topicTag(selectedTopics.includes(topic))} onClick={() => toggleTopic(topic)}>{topic}</span>
            ))}
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.cardTitle}>Number of questions</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "0.5rem" }}>
          <input
            type="number"
            min="1"
            max="50"
            value={questionCount}
            onChange={e => setQuestionCount(Number(e.target.value))}
            style={{ width: 80, padding: "8px 12px", border: "0.5px solid #e0e0e0", borderRadius: 8, fontSize: 15, fontWeight: 500 }}
          />
          <span style={{ fontSize: 13, color: "#888" }}>questions (max 50)</span>
        </div>
      </div>

      <button style={styles.primaryBtn(selectedSubjects.length === 0)} onClick={startQuiz} disabled={selectedSubjects.length === 0}>Generate paper</button>
    </div>
  );

  if (page === "quiz") return (
    <div style={styles.app}>
      <div style={styles.nav}>
        <div style={styles.logo}>Paper<span style={styles.logoSpan}>Plus</span></div>
        <button style={styles.navBtn} onClick={() => setPage("setup")}>Exit</button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#888" }}>Question {currentQ} of {questionCount}</span>
        <span style={{ fontSize: 12, color: "#888" }}>{marksScored} marks scored</span>
      </div>
      <div style={styles.progressWrap}>
        <div style={styles.progressBar((currentQ / questionCount) * 100)}></div>
      </div>

      <div style={styles.card}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "#888", fontSize: 14 }}>Generating question...</div>
        ) : question ? (
          <>
            <div style={styles.qMeta}>
              <span style={styles.badge("#E6F1FB", "#0C447C")}>{question.subject}</span>
              <span style={styles.badge("#EEEDFE", "#3C3489")}>{question.topic}</span>
              <span style={styles.badge("#EAF3DE", "#3B6D11")}>{examBoard}</span>
              <span style={styles.badge("#f0f0ee", "#888")}>{question.marks} marks</span>
            </div>
            <div style={styles.qText}>{question.question}</div>
            <div style={styles.btnRow}>
              <button style={styles.secBtn} onClick={() => setMsVisible(v => !v)}>{msVisible ? "Hide mark scheme" : "Show mark scheme"}</button>
              <button style={styles.secBtn} onClick={nextQuestion}>{currentQ >= questionCount ? "Finish" : "Next question"}</button>
            </div>
            {msVisible && (
              <div style={styles.msSection}>
                <div style={styles.msTitle}>Mark scheme</div>
                {question.markscheme.map((point, i) => (
                  <div key={i} style={styles.msPoint}><span style={styles.msTick}>✓</span><span>{point}</span></div>
                ))}
                <div style={styles.marksRow}>
                  <span style={styles.marksLabel}>How many marks?</span>
                  {Array.from({ length: question.marks + 1 }, (_, i) => (
                    <div key={i} style={styles.markBubble(selectedMarks === i)} onClick={() => handleMarkSelect(i)}>{i}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );

  if (page === "dashboard") return (
    <div style={styles.app}>
      <div style={styles.nav}>
        <div style={styles.logo}>Paper<span style={styles.logoSpan}>Plus</span></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button style={styles.navBtn} onClick={() => setPage("setup")}>New paper</button>
          <button style={styles.navBtn} onClick={handleLogout}>Log out</button>
        </div>
      </div>
      <div style={styles.navTabs}>
        {["overview", "topics", "history"].map(t => (
          <button key={t} style={styles.navTab(dashTab === t)} onClick={() => setDashTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {dashTab === "overview" && (
        <>
          <div style={styles.dashGrid}>
            <div style={styles.metric}><div style={styles.metricLabel}>Total marks</div><div style={styles.metricValue}>{marksScored}</div><div style={styles.metricSub}>this session</div></div>
            <div style={styles.metric}><div style={styles.metricLabel}>Questions done</div><div style={styles.metricValue}>{currentQ - 1}</div><div style={styles.metricSub}>this session</div></div>
          </div>
          {Object.keys(topicScores).length > 0 ? (
            <div style={styles.card}>
              <div style={{ ...styles.cardTitle, marginBottom: "1rem" }}>Your scores by topic</div>
              {Object.entries(topicScores).map(([topic, { scored, total }]) => {
                const pct = Math.round((scored / total) * 100);
                const color = pct > 70 ? "#185FA5" : pct > 50 ? "#EF9F27" : "#E24B4A";
                return (
                  <div key={topic} style={styles.barRow}>
                    <span style={styles.barLabel}>{topic}</span>
                    <div style={styles.barTrack}><div style={styles.barFill(pct, color)}></div></div>
                    <span style={styles.barPct}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={styles.card}>
              <div style={{ fontSize: 14, color: "#888", textAlign: "center", padding: "1rem 0" }}>Complete a session to see your scores here.</div>
            </div>
          )}
        </>
      )}

      {dashTab === "topics" && (
        <div style={styles.card}>
          {Object.keys(topicScores).length > 0 ? (
            <>
              <div style={{ ...styles.cardTitle, marginBottom: "1rem" }}>Topic breakdown</div>
              {Object.entries(topicScores).map(([topic, { scored, total }]) => {
                const pct = Math.round((scored / total) * 100);
                const color = pct > 70 ? "#185FA5" : pct > 50 ? "#EF9F27" : "#E24B4A";
                return (
                  <div key={topic} style={styles.barRow}>
                    <span style={styles.barLabel}>{topic}</span>
                    <div style={styles.barTrack}><div style={styles.barFill(pct, color)}></div></div>
                    <span style={styles.barPct}>{pct}%</span>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ fontSize: 14, color: "#888", textAlign: "center", padding: "1rem 0" }}>Complete a session to see topic scores.</div>
          )}
        </div>
      )}

      {dashTab === "history" && (
        <div style={styles.card}>
          <div style={{ ...styles.cardTitle, marginBottom: "1rem" }}>Recent sessions</div>
          {sessionHistory.length === 0 ? (
            <div style={{ fontSize: 14, color: "#888", textAlign: "center", padding: "1rem 0" }}>No sessions yet. Complete a paper to see your history.</div>
          ) : (
            sessionHistory.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < sessionHistory.length - 1 ? "0.5px solid #e0e0e0" : "none" }}>
                <div><div style={{ fontSize: 14, fontWeight: 500 }}>{s.title}</div><div style={{ fontSize: 12, color: "#888" }}>{s.sub}</div></div>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontWeight: 500, color: "#185FA5" }}>{s.score} marks</div><div style={{ fontSize: 12, color: "#888" }}>{s.date}</div></div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default App;
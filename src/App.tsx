/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  User, 
  ChevronRight, 
  Send, 
  BarChart3, 
  RefreshCcw, 
  LogOut,
  CheckCircle2,
  AlertCircle,
  BrainCircuit,
  Quote,
  Clock,
  Target,
  Info,
  Lightbulb,
  HeartPulse,
  LayoutGrid,
  ChevronLeft,
  Timer,
  MessageSquare,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  TrendingUp,
  Award
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { auth, db, googleProvider } from "./firebase";
import { signInWithPopup, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { 
  collection, 
  getDocs, 
  addDoc, 
  setDoc, 
  doc, 
  query, 
  where, 
  getDoc,
  writeBatch
} from "firebase/firestore";
import { PERSONAS as LOCAL_PERSONAS, SCENARIOS as LOCAL_SCENARIOS, HYUNDAI_COLORS } from "./constants";
import { Message, Persona, FeedbackReport, Scenario } from "./types";
import { getPersonaResponse, generateFeedback } from "./services/geminiService";

export default function App() {
  const [step, setStep] = useState<"login" | "persona_selection" | "scenario_selection" | "chat" | "report">("login");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [personaTab, setPersonaTab] = useState<'영업' | '서비스'>('영업');
  const [scenarioCategory, setScenarioCategory] = useState<string>('목표/평가면담');
  const [achievedGoalIndices, setAchievedGoalIndices] = useState<number[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [showDashboard, setShowDashboard] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // STT 초기화
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'ko-KR';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('STT Error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const speakText = (text: string) => {
    if (!isTtsEnabled) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // 1단계: Firebase 인증 상태 감지 및 데이터 시딩/로딩
  // Step 1: Detect Firebase Auth state and handle data seeding/loading
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setStep("persona_selection");
        await initializeData();
      } else {
        setUser(null);
        setStep("login");
      }
    });
    return () => unsubscribe();
  }, []);

  // 타이머 기능
  // Timer functionality
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isTimerActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      finishSimulation();
    }
    return () => clearInterval(timer);
  }, [isTimerActive, timeLeft]);

  // 자동 스크롤 기능
  // Auto scroll functionality
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [messages]);

  // 2단계: Firestore 데이터 초기화 (시딩 및 로딩)
  // Step 2: Initialize Firestore data (Seeding and Loading)
  const initializeData = async () => {
    setIsLoading(true);
    try {
      // 페르소나 데이터 확인 및 시딩
      // Check and seed persona data
      const personaSnap = await getDocs(collection(db, "personas"));
      let currentPersonas: Persona[] = [];
      
      if (personaSnap.empty) {
        console.log("Seeding personas...");
        const batch = writeBatch(db);
        LOCAL_PERSONAS.forEach((p) => {
          const docRef = doc(collection(db, "personas"), p.id);
          batch.set(docRef, p);
        });
        await batch.commit();
        currentPersonas = LOCAL_PERSONAS;
      } else {
        currentPersonas = personaSnap.docs.map(doc => doc.data() as Persona);
      }
      setPersonas(currentPersonas);

      // 시나리오 데이터 확인 및 시딩
      // Check and seed scenario data
      const scenarioSnap = await getDocs(collection(db, "scenarios"));
      let currentScenarios: Scenario[] = [];

      if (scenarioSnap.empty) {
        console.log("Seeding scenarios...");
        const batch = writeBatch(db);
        LOCAL_SCENARIOS.forEach((s) => {
          const docRef = doc(collection(db, "scenarios"), s.id);
          batch.set(docRef, s);
        });
        await batch.commit();
        currentScenarios = LOCAL_SCENARIOS;
      } else {
        currentScenarios = scenarioSnap.docs.map(doc => doc.data() as Scenario);
      }
      setScenarios(currentScenarios);

    } catch (error) {
      console.error("Error initializing data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 3단계: 구글 로그인 처리
  // Step 3: Handle Google Login
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  // 4단계: 로그아웃 처리
  // Step 4: Handle Logout
  const handleLogout = async () => {
    try {
      await auth.signOut();
      setStep("login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const selectPersona = (persona: Persona) => {
    setSelectedPersona(persona);
    setStep("scenario_selection");
  };

  const startSimulation = (scenario: Scenario) => {
    if (!selectedPersona) return;
    setSelectedScenario(scenario);
    setMessages([
      { 
        role: "assistant", 
        content: `반갑습니다, 지점장님. ${selectedPersona.name}입니다. 무슨 일로 부르셨나요?`, 
        timestamp: Date.now(),
        analysis: { sentiment: "무덤덤함", cooperation: 50, intent: "면담 시작 대기" }
      }
    ]);
    setStep("chat");
    setTimeLeft(15 * 60);
    setIsTimerActive(true);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !selectedPersona || !selectedScenario) return;

    const userMessage: Message = { role: "user", content: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { content, analysis } = await getPersonaResponse(
        selectedPersona, 
        selectedScenario, 
        [...messages, userMessage]
      );
      
      if (analysis.achievedGoalIndices) {
        setAchievedGoalIndices(prev => {
          const combined = Array.from(new Set([...prev, ...analysis.achievedGoalIndices]));
          return combined;
        });
      }

      setMessages(prev => [...prev, { 
        role: "assistant", 
        content, 
        timestamp: Date.now(),
        analysis 
      }]);
      speakText(content);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const finishSimulation = async () => {
    if (!selectedPersona || !selectedScenario || messages.length < 10) {
      if (messages.length < 10) {
        alert("최소 10턴 이상의 대화가 필요합니다. (현재: " + messages.length + "턴)");
      }
      return;
    }
    setIsTimerActive(false);
    setIsLoading(true);
    try {
      const feedback = await generateFeedback(selectedPersona, selectedScenario, messages);
      setReport(feedback);
      
      // 5단계: 시뮬레이션 결과 Firestore에 저장
      // Step 5: Save simulation results to Firestore
      if (user) {
        await addDoc(collection(db, "2026_simulation"), {
          userId: user.uid,
          userEmail: user.email,
          personaId: selectedPersona.id,
          scenarioId: selectedScenario.id,
          timestamp: Date.now(),
          score: feedback.overallScore,
          report: feedback,
          messages: messages
        });
      }

      setStep("report");
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setStep("persona_selection");
    setSelectedPersona(null);
    setSelectedScenario(null);
    setMessages([]);
    setReport(null);
    setIsTimerActive(false);
    setTimeLeft(15 * 60);
    setAchievedGoalIndices([]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getGrade = (score: number) => {
    if (score >= 90) return { label: "S", color: "text-yellow-400", bg: "bg-yellow-400/10" };
    if (score >= 80) return { label: "A", color: "text-blue-400", bg: "bg-blue-400/10" };
    if (score >= 70) return { label: "B", color: "text-emerald-400", bg: "bg-emerald-400/10" };
    if (score >= 60) return { label: "C", color: "text-amber-400", bg: "bg-amber-400/10" };
    return { label: "D", color: "text-rose-400", bg: "bg-rose-400/10" };
  };

  const fetchUserHistory = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "2026_simulation"),
        where("userId", "==", user.uid)
      );
      const snap = await getDocs(q);
      const history = snap.docs.map(doc => doc.data());
      setUserHistory(history);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const lastAnalysis = messages.length > 0 ? messages[messages.length - 1].analysis : null;

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 selection:bg-[#007FA8]/30 ${
      theme === "dark" ? "bg-[#0B0E14] text-white" : "bg-[#F6F3ED] text-[#002C5F]"
    }`}>
      {/* Background Decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {theme === "dark" ? (
          <>
            <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#002C5F]/10 blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#007FA8]/10 blur-[120px]" />
          </>
        ) : (
          <>
            <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#007FA8]/5 blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#E5E1D8]/30 blur-[120px]" />
          </>
        )}
      </div>

      <header className={`sticky top-0 z-50 w-full border-b backdrop-blur-xl transition-colors duration-300 ${
        theme === "dark" ? "border-white/5 bg-[#0B0E14]/60" : "border-[#002C5F]/10 bg-[#F6F3ED]/80"
      }`}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#007FA8] rounded-lg flex items-center justify-center shadow-lg shadow-[#007FA8]/20">
              <span className="text-white font-bold text-xs">H</span>
            </div>
            <h1 className={`font-bold text-lg tracking-tight ${theme === "dark" ? "text-white/90" : "text-[#002C5F]"}`}>
              AI 성과관리 면담 시뮬레이션
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleTheme}
              className={`rounded-full ${theme === "dark" ? "text-white/40 hover:text-white hover:bg-white/5" : "text-[#002C5F]/40 hover:text-[#002C5F] hover:bg-[#002C5F]/5"}`}
            >
              {theme === "dark" ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {/* Using Volume icons as placeholders for theme toggle if Sun/Moon not imported, but let's use LayoutGrid/BrainCircuit if needed. Actually let's use BrainCircuit for dark and Lightbulb for light */}
              {theme === "dark" ? <BrainCircuit className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
            </Button>
            {user && (
              <div className="flex items-center gap-2 sm:gap-4">
                {isTimerActive && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full font-mono font-bold ${
                    timeLeft < 60 
                      ? "bg-red-500/20 text-red-400 animate-pulse" 
                      : theme === "dark" ? "bg-white/5 text-white/70" : "bg-[#002C5F]/5 text-[#002C5F]/70"
                  }`}>
                    <Timer className="w-4 h-4" />
                    {formatTime(timeLeft)}
                  </div>
                )}
                <span className={`text-sm font-medium hidden sm:inline ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>
                  {user.displayName} 책임매니저님
                </span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={theme === "dark" ? "text-white/40 hover:text-white hover:bg-white/5" : "text-[#002C5F]/40 hover:text-[#002C5F] hover:bg-[#002C5F]/5"} 
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 relative z-10">
        <AnimatePresence mode="wait">
          {step === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto mt-20"
            >
              <Card className={`border-none shadow-2xl rounded-[2.5rem] overflow-hidden transition-colors duration-300 ${
                theme === "dark" ? "bg-white/5 backdrop-blur-2xl" : "bg-white shadow-xl"
              }`}>
                <CardHeader className="text-center space-y-4 pt-10">
                  <div className="mx-auto w-20 h-20 bg-[#007FA8] rounded-3xl flex items-center justify-center shadow-lg shadow-[#007FA8]/20">
                    <User className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <CardTitle className={`text-3xl font-bold ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>현장 리더 실습 🚗</CardTitle>
                    <CardDescription className={theme === "dark" ? "text-white/40 text-lg" : "text-[#002C5F]/40 text-lg"}>AI 성과관리 면담 시뮬레이션</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pb-10 space-y-6">
                  <Button 
                    onClick={handleGoogleLogin} 
                    className={`w-full h-14 rounded-2xl font-bold flex items-center justify-center gap-3 text-lg transition-all active:scale-95 ${
                      theme === "dark" ? "bg-white text-black hover:bg-white/90" : "bg-[#002C5F] text-white hover:bg-[#002C5F]/90"
                    }`}
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
                    Google 계정으로 시작하기
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === "persona_selection" && (
            <motion.div
              key="persona_selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-10"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => { fetchUserHistory(); setShowDashboard(true); }}
                    className={`gap-2 ${theme === "dark" ? "text-white/40 hover:text-white hover:bg-white/5" : "text-[#002C5F]/40 hover:text-[#002C5F] hover:bg-[#002C5F]/5"}`}
                  >
                    <TrendingUp className="w-4 h-4" /> 나의 성장
                  </Button>
                  <Avatar className="w-12 h-12 border-2 border-[#007FA8]">
                    <AvatarImage src={user?.photoURL || ""} />
                    <AvatarFallback>{user?.displayName?.[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className={`font-bold ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>{user?.displayName}님, 환영합니다!</p>
                    <Button variant="link" onClick={handleLogout} className={`p-0 h-auto text-xs ${theme === "dark" ? "text-white/40 hover:text-white" : "text-[#002C5F]/40 hover:text-[#002C5F]"}`}>로그아웃</Button>
                  </div>
                </div>
                <div className="text-center flex-1 pr-20">
                  <h2 className={`text-4xl font-bold tracking-tight ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>면담 대상자 선택 👥</h2>
                  <p className={theme === "dark" ? "text-white/40 text-lg" : "text-[#002C5F]/40 text-lg"}>실습을 진행할 구성원 페르소나를 선택하세요</p>
                </div>
              </div>

              <div className={`flex justify-center gap-2 p-1 rounded-2xl w-fit mx-auto ${theme === "dark" ? "bg-white/5" : "bg-[#002C5F]/5"}`}>
                {(['영업', '서비스'] as const).map((tab) => (
                  <Button
                    key={tab}
                    variant={personaTab === tab ? "default" : "ghost"}
                    onClick={() => setPersonaTab(tab)}
                    className={`px-8 h-12 rounded-xl transition-all ${
                      personaTab === tab 
                        ? "bg-[#007FA8] text-white shadow-lg shadow-[#007FA8]/20" 
                        : theme === "dark" ? "text-white/40 hover:text-white hover:bg-white/5" : "text-[#002C5F]/40 hover:text-[#002C5F] hover:bg-[#002C5F]/5"
                    }`}
                  >
                    {tab} 부문
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {personas.filter(p => p.department === personaTab).map((persona) => (
                  <motion.div
                    key={persona.id}
                    whileHover={{ y: -8 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <Card className={`h-full border-none shadow-xl hover:shadow-2xl transition-all cursor-pointer group overflow-hidden rounded-3xl ${
                      theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"
                    }`}
                      onClick={() => selectPersona(persona)}
                    >
                      <div className={`h-2 ${persona.department === '영업' ? 'bg-[#007FA8]' : 'bg-[#A36B4F]'} opacity-40 group-hover:opacity-100 transition-opacity`} />
                      <CardHeader className="pb-4">
                        <div className="flex justify-between items-start mb-4">
                          <div className="text-4xl">{persona.emoji}</div>
                          <Badge variant={persona.difficulty === "상" ? "destructive" : persona.difficulty === "중" ? "default" : "secondary"} className="rounded-lg px-2 py-0.5 text-[10px]">
                            난이도 {persona.difficulty}
                          </Badge>
                        </div>
                        <CardTitle className={`text-2xl ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>{persona.name}</CardTitle>
                        <CardDescription className="font-medium text-[#007FA8]">{persona.role}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <p className={`text-sm leading-relaxed line-clamp-3 ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>
                          {persona.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {persona.traits.map(trait => (
                            <span key={trait} className={`text-[10px] px-2.5 py-1 rounded-lg border ${
                              theme === "dark" ? "bg-white/5 text-white/40 border-white/5" : "bg-[#002C5F]/5 text-[#002C5F]/40 border-[#002C5F]/5"
                            }`}>
                              #{trait}
                            </span>
                          ))}
                          {persona.mbti && <span className="text-[10px] px-2.5 py-1 bg-[#007FA8]/10 rounded-lg text-[#007FA8] font-bold border border-[#007FA8]/20">{persona.mbti}</span>}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0 pb-8">
                        <Button variant="ghost" className={`w-full h-12 rounded-xl transition-all border border-transparent ${
                          theme === "dark" 
                            ? "group-hover:bg-white/10 group-hover:text-white text-white/40 group-hover:border-white/10" 
                            : "group-hover:bg-[#002C5F]/5 group-hover:text-[#002C5F] text-[#002C5F]/40 group-hover:border-[#002C5F]/10"
                        }`}>
                          선택하기 <ChevronRight className="ml-2 w-4 h-4" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {step === "scenario_selection" && selectedPersona && (
            <motion.div
              key="scenario_selection"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-10"
            >
              <div className="flex items-center justify-between">
                <Button 
                  variant="ghost" 
                  className={`rounded-xl ${theme === "dark" ? "text-white/40 hover:text-white hover:bg-white/5" : "text-[#002C5F]/40 hover:text-[#002C5F] hover:bg-[#002C5F]/5"}`} 
                  onClick={() => setStep("persona_selection")}
                >
                  <ChevronLeft className="mr-2 w-4 h-4" /> 뒤로가기
                </Button>
                <div className="text-center flex-1 pr-20">
                  <h2 className={`text-4xl font-bold tracking-tight ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>면담 상황 선택 🎯</h2>
                  <p className={theme === "dark" ? "text-white/40 text-lg" : "text-[#002C5F]/40 text-lg"}>{selectedPersona.name}님과 진행할 시나리오를 선택하세요</p>
                </div>
              </div>

              <div className={`flex justify-center flex-wrap gap-2 p-1 rounded-2xl w-fit mx-auto ${theme === "dark" ? "bg-white/5" : "bg-[#002C5F]/5"}`}>
                {['목표/평가면담', '인사통보', '직원케어', '성과관리'].map((cat) => (
                  <Button
                    key={cat}
                    variant={scenarioCategory === cat ? "default" : "ghost"}
                    onClick={() => setScenarioCategory(cat)}
                    className={`px-6 h-12 rounded-xl transition-all ${
                      scenarioCategory === cat 
                        ? "bg-[#007FA8] text-white shadow-lg shadow-[#007FA8]/20" 
                        : theme === "dark" ? "text-white/40 hover:text-white hover:bg-white/5" : "text-[#002C5F]/40 hover:text-[#002C5F] hover:bg-[#002C5F]/5"
                    }`}
                  >
                    {cat}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {scenarios.filter(s => s.category === scenarioCategory).map((scenario) => (
                  <motion.div
                    key={scenario.id}
                    whileHover={{ scale: 1.02 }}
                  >
                    <Card className={`h-full border-none shadow-xl hover:shadow-2xl transition-all cursor-pointer group rounded-3xl overflow-hidden flex flex-col ${
                      theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"
                    }`}
                      onClick={() => startSimulation(scenario)}
                    >
                      <CardHeader className="pb-4">
                        <div className="w-12 h-12 bg-[#007FA8]/10 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-[#007FA8] transition-all shadow-inner">
                          <LayoutGrid className="w-6 h-6 text-[#007FA8] group-hover:text-white" />
                        </div>
                        <CardTitle className={`text-xl transition-colors ${theme === "dark" ? "text-white group-hover:text-[#007FA8]" : "text-[#002C5F] group-hover:text-[#007FA8]"}`}>{scenario.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 flex-1">
                        <p className={`text-sm leading-relaxed line-clamp-2 ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>
                          {scenario.description}
                        </p>
                        <div className={`space-y-3 pt-4 border-t ${theme === "dark" ? "border-white/5" : "border-[#002C5F]/5"}`}>
                          <div className={`p-3 rounded-xl border ${theme === "dark" ? "bg-white/5 border-white/5" : "bg-[#002C5F]/5 border-[#002C5F]/5"}`}>
                            <p className="text-[10px] font-bold text-[#007FA8] uppercase mb-1">목표</p>
                            <p className={`text-xs leading-snug ${theme === "dark" ? "text-white/80" : "text-[#002C5F]/80"}`}>{scenario.goal}</p>
                          </div>
                          <div className="p-3 bg-amber-400/5 rounded-xl border border-amber-400/10">
                            <p className="text-[10px] font-bold text-amber-400 uppercase mb-1">핵심 가이드</p>
                            <p className="text-xs text-amber-600 leading-snug">{scenario.coreGuide}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {step === "chat" && selectedPersona && selectedScenario && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-[1600px] mx-auto h-[calc(100vh-10rem)] flex gap-6"
            >
              {/* Left Sidebar: Info & Checklist */}
              <div className="w-80 hidden xl:flex flex-col gap-4 overflow-y-auto pr-2">
                <Card className={`border-none shadow-xl shrink-0 rounded-3xl ${theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className={`text-sm flex items-center gap-2 ${theme === "dark" ? "text-white/90" : "text-[#002C5F]/90"}`}>
                      <Info className="w-4 h-4 text-[#007FA8]" /> 면담 대상자 정보
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl">{selectedPersona.emoji}</div>
                      <div>
                        <p className={`text-base font-bold ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>{selectedPersona.name}</p>
                        <p className={theme === "dark" ? "text-white/40 text-xs" : "text-[#002C5F]/40 text-xs"}>{selectedPersona.role}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${theme === "dark" ? "text-white/20" : "text-[#002C5F]/20"}`}>성향 및 특성</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedPersona.traits.map(t => (
                          <Badge key={t} variant="secondary" className={`text-[10px] px-2 py-0.5 border-none ${theme === "dark" ? "bg-white/5 text-white/60" : "bg-[#002C5F]/5 text-[#002C5F]/60"}`}>{t}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-none shadow-xl shrink-0 rounded-3xl ${theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-[#007FA8]">
                      <Target className="w-4 h-4" /> 면담 목표 달성 현황
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      {selectedScenario.subGoals.map((goal, index) => (
                        <div key={index} className={`flex items-start gap-3 p-2.5 rounded-xl transition-all border ${
                          achievedGoalIndices.includes(index) 
                            ? "bg-[#007FA8]/10 border-[#007FA8]/20" 
                            : theme === "dark" ? "bg-white/5 border-white/5" : "bg-[#002C5F]/5 border-[#002C5F]/5"
                        }`}>
                          <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border ${achievedGoalIndices.includes(index) ? "bg-[#007FA8] border-[#007FA8]" : theme === "dark" ? "border-white/20" : "border-[#002C5F]/20"}`}>
                            {achievedGoalIndices.includes(index) && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <span className={`text-xs leading-relaxed ${
                            achievedGoalIndices.includes(index) 
                              ? theme === "dark" ? "text-white font-medium" : "text-[#002C5F] font-medium"
                              : theme === "dark" ? "text-white/40" : "text-[#002C5F]/40"
                          }`}>
                            {goal}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-none shadow-xl flex-1 rounded-3xl ${theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className={`text-sm flex items-center gap-2 ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>
                      <Lightbulb className="w-4 h-4 text-amber-400" /> 면담 방향성 가이드
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-amber-400/5 rounded-2xl border border-amber-400/10 text-xs text-amber-600 leading-relaxed italic">
                      {selectedScenario.guideDirection}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Chat Area */}
              <Card className={`flex-1 flex flex-col border-none shadow-2xl overflow-hidden rounded-[2.5rem] ${theme === "dark" ? "bg-white/5 backdrop-blur-2xl" : "bg-white"}`}>
                <CardHeader className={`border-b py-5 ${theme === "dark" ? "border-white/5 bg-white/5" : "border-[#002C5F]/5 bg-[#002C5F]/5"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-3xl">{selectedPersona.emoji}</div>
                      <div>
                        <CardTitle className={`text-lg ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>{selectedPersona.name} {selectedPersona.role}</CardTitle>
                        <CardDescription className={theme === "dark" ? "text-white/40 text-xs" : "text-[#002C5F]/40 text-xs"}>
                          {selectedScenario.title} 진행 중
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold ${theme === "dark" ? "bg-white/5 text-white/60" : "bg-[#002C5F]/5 text-[#002C5F]/60"}`}>
                        <MessageSquare className="w-3.5 h-3.5" /> {messages.length} 턴
                      </div>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={finishSimulation}
                        disabled={messages.length < 10 || isLoading}
                        className="bg-[#007FA8] hover:bg-[#0096C7] text-white border-none text-xs h-9 px-4 rounded-xl shadow-lg shadow-[#007FA8]/20"
                      >
                        면담 종료 및 결과보기
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <ScrollArea className="flex-1 p-8" ref={scrollRef}>
                  <div className="space-y-8">
                    {messages.map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`max-w-[75%] flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                          {msg.role === "assistant" && (
                            <div className="text-3xl mt-1">{selectedPersona.emoji}</div>
                          )}
                          <div className={`space-y-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                            <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-lg ${
                              msg.role === "user" 
                                ? "bg-[#007FA8] text-white rounded-tr-none" 
                                : theme === "dark" ? "bg-white/10 text-white/90 border border-white/5 rounded-tl-none" : "bg-[#002C5F]/5 text-[#002C5F]/90 border border-[#002C5F]/10 rounded-tl-none"
                            }`}>
                              {msg.content}
                            </div>
                            <span className={`text-[10px] px-1 ${theme === "dark" ? "text-white/20" : "text-[#002C5F]/20"}`}>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className={`border px-5 py-3.5 rounded-2xl rounded-tl-none flex gap-2 items-center ${theme === "dark" ? "bg-white/5 border-white/5" : "bg-[#002C5F]/5 border-[#002C5F]/5"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${theme === "dark" ? "bg-white/20" : "bg-[#002C5F]/20"}`} />
                          <span className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.2s] ${theme === "dark" ? "bg-white/20" : "bg-[#002C5F]/20"}`} />
                          <span className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.4s] ${theme === "dark" ? "bg-white/20" : "bg-[#002C5F]/20"}`} />
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <CardFooter className={`p-6 border-t flex flex-col gap-4 ${theme === "dark" ? "border-white/5 bg-white/5" : "border-[#002C5F]/5 bg-[#002C5F]/5"}`}>
                  <div className="w-full flex gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={toggleListening}
                      className={`h-12 w-12 rounded-xl border transition-all ${
                        isListening 
                          ? "bg-rose-500 text-white animate-pulse" 
                          : theme === "dark" ? "bg-white/5 text-white/40 border-white/10 hover:text-white" : "bg-white text-[#002C5F]/40 border-[#002C5F]/10 hover:text-[#002C5F]"
                      }`}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </Button>
                    <Input
                      placeholder="메시지를 입력하세요..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(e)}
                      disabled={isLoading}
                      className={`h-12 border rounded-xl focus:ring-[#007FA8] ${
                        theme === "dark" ? "bg-white/5 border-white/10 text-white placeholder:text-white/20" : "bg-white border-[#002C5F]/10 text-[#002C5F] placeholder:text-[#002C5F]/20"
                      }`}
                    />
                    <Button type="submit" size="icon" onClick={handleSendMessage} disabled={isLoading || !input.trim()} className="h-12 w-12 bg-[#007FA8] hover:bg-[#0096C7] rounded-xl shadow-lg shadow-[#007FA8]/20">
                      <Send className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className={`w-full flex items-center justify-between text-[11px] ${theme === "dark" ? "text-white/20" : "text-[#002C5F]/20"}`}>
                    <p>✨ 팁: 구성원의 감정에 먼저 공감해보세요.</p>
                    <p className="font-mono">{formatTime(timeLeft)} 후 자동 종료</p>
                  </div>
                </CardFooter>
              </Card>

              {/* Right Sidebar: Analysis & Hints */}
              <div className="w-80 hidden lg:flex flex-col gap-4 overflow-y-auto pl-2">
                <Card className={`border-none shadow-xl shrink-0 rounded-3xl ${theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-rose-400">
                      <HeartPulse className="w-4 h-4" /> 실시간 심리 분석
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {lastAnalysis ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 aspect-square">
                          {[
                            { label: "신뢰도", key: "trust", color: "text-blue-400" },
                            { label: "수용성", key: "acceptance", color: "text-emerald-400" },
                            { label: "안정감", key: "stability", color: "text-amber-400" },
                            { label: "몰입도", key: "engagement", color: "text-purple-400" }
                          ].map((m) => (
                            <div key={m.key} className={`rounded-2xl p-4 flex flex-col items-center justify-center border relative overflow-hidden group ${
                              theme === "dark" ? "bg-white/5 border-white/5" : "bg-[#002C5F]/5 border-[#002C5F]/5"
                            }`}>
                              <div className={`absolute inset-0 bg-current opacity-0 group-hover:opacity-5 transition-opacity ${m.color}`} />
                              <span className={`text-[10px] font-bold mb-2 ${theme === "dark" ? "text-white/40" : "text-[#002C5F]/40"}`}>{m.label}</span>
                              <div className="relative w-full flex items-center justify-center">
                                <span className={`text-xl font-black ${m.color}`}>
                                  {lastAnalysis.metrics?.[m.key as keyof typeof lastAnalysis.metrics] || 50}
                                </span>
                                <span className={`text-[10px] ml-1 ${theme === "dark" ? "text-white/20" : "text-[#002C5F]/20"}`}>%</span>
                              </div>
                              <div className={`w-full h-1 rounded-full mt-3 overflow-hidden ${theme === "dark" ? "bg-white/5" : "bg-[#002C5F]/5"}`}>
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${lastAnalysis.metrics?.[m.key as keyof typeof lastAnalysis.metrics] || 50}%` }}
                                  className={`h-full bg-current ${m.color}`}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-3 pt-2">
                          <div className="flex justify-between text-xs">
                            <span className={theme === "dark" ? "text-white/40" : "text-[#002C5F]/40"}>현재 감정</span>
                            <Badge variant="secondary" className="bg-rose-500/20 text-rose-400 border-none rounded-lg">{lastAnalysis.sentiment}</Badge>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className={theme === "dark" ? "text-white/40" : "text-[#002C5F]/40"}>종합 협조도</span>
                            <span className={`font-bold ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>{lastAnalysis.cooperation}%</span>
                          </div>
                          <div className={`h-2 rounded-full overflow-hidden ${theme === "dark" ? "bg-white/5" : "bg-[#002C5F]/5"}`}>
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${lastAnalysis.cooperation}%` }}
                              className={`h-full ${lastAnalysis.cooperation > 70 ? 'bg-green-500' : lastAnalysis.cooperation > 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            />
                          </div>
                        </div>
                        
                        <div className={`p-4 rounded-2xl border text-[11px] leading-relaxed ${
                          theme === "dark" ? "bg-rose-500/5 border-rose-500/10 text-rose-200/70" : "bg-rose-500/5 border-rose-500/10 text-rose-700"
                        }`}>
                          <p className="font-bold text-rose-400 mb-2 flex items-center gap-1.5">
                            <BrainCircuit className="w-3.5 h-3.5" /> 심리 상태 요약
                          </p>
                          {lastAnalysis.intent}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-10 space-y-3">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${theme === "dark" ? "bg-white/5" : "bg-[#002C5F]/5"}`}>
                          <BrainCircuit className={`w-6 h-6 ${theme === "dark" ? "text-white/10" : "text-[#002C5F]/10"}`} />
                        </div>
                        <p className={`text-xs ${theme === "dark" ? "text-white/20" : "text-[#002C5F]/20"}`}>대화가 시작되면 분석을 시작합니다</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className={`border-none shadow-xl flex-1 rounded-3xl overflow-hidden flex flex-col ${theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"}`}>
                  <CardHeader className="pb-3 shrink-0">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                        <Lightbulb className="w-4 h-4" /> 면담 힌트 💡
                      </CardTitle>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-8 w-8 ${theme === "dark" ? "text-white/20 hover:text-white" : "text-[#002C5F]/20 hover:text-[#002C5F]"}`}
                        onClick={() => setIsTtsEnabled(!isTtsEnabled)}
                      >
                        {isTtsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto space-y-4">
                    {lastAnalysis?.coachAdvice && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-[#007FA8]/10 rounded-2xl border border-[#007FA8]/20"
                      >
                        <p className="text-[10px] font-bold text-[#007FA8] mb-2 flex items-center gap-1.5">
                          <BrainCircuit className="w-3.5 h-3.5" /> AI 실시간 코치
                        </p>
                        <p className={`text-xs leading-relaxed italic ${theme === "dark" ? "text-white/80" : "text-[#002C5F]/80"}`}>
                          "{lastAnalysis.coachAdvice}"
                        </p>
                      </motion.div>
                    )}
                    <div className="space-y-2">
                      {selectedScenario.hints.map((hint, i) => (
                        <div key={i} className={`p-4 rounded-2xl border text-xs leading-relaxed italic ${
                          theme === "dark" ? "bg-amber-400/5 border-amber-400/10 text-amber-200/60" : "bg-amber-400/5 border-amber-400/10 text-amber-700"
                        }`}>
                          "{hint}"
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {step === "report" && report && selectedPersona && selectedScenario && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="max-w-5xl mx-auto space-y-10 pb-20"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-4xl font-bold tracking-tight ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>면담 분석 리포트 📊</h2>
                  <p className={theme === "dark" ? "text-white/40 text-lg" : "text-[#002C5F]/40 text-lg"}>{selectedPersona.name}님과의 [{selectedScenario.title}] 결과입니다</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className={`rounded-xl border transition-all ${theme === "dark" ? "text-white/40 hover:text-white hover:bg-white/5 border-white/10" : "text-[#002C5F]/40 hover:text-[#002C5F] hover:bg-[#002C5F]/5 border-[#002C5F]/10"}`} onClick={reset}>
                    <RefreshCcw className="mr-2 w-4 h-4" /> 다시 하기
                  </Button>
                  <Button className="bg-[#007FA8] hover:bg-[#0096C7] rounded-xl shadow-lg shadow-[#007FA8]/20">
                    리포트 저장
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Score Card */}
                <Card className="lg:col-span-1 border-none shadow-2xl bg-gradient-to-br from-[#007FA8] to-[#002C5F] text-white overflow-hidden relative rounded-[2.5rem]">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl" />
                  <CardHeader>
                    <CardTitle className="text-white/60 text-xs font-bold uppercase tracking-widest">Overall Score</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <div className="relative">
                      <svg className="w-48 h-48">
                        <circle className="text-white/10" strokeWidth="10" stroke="currentColor" fill="transparent" r="85" cx="96" cy="96" />
                        <circle 
                          className="text-white" 
                          strokeWidth="10" 
                          strokeDasharray={534}
                          strokeDashoffset={534 - (534 * report.overallScore) / 100}
                          strokeLinecap="round" 
                          stroke="currentColor" 
                          fill="transparent" 
                          r="85" cx="96" cy="96" 
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className={`w-16 h-16 ${getGrade(report.overallScore).bg} rounded-2xl flex items-center justify-center mb-2 border border-white/10`}>
                          <span className={`text-3xl font-black ${getGrade(report.overallScore).color}`}>{getGrade(report.overallScore).label}</span>
                        </div>
                        <span className="text-4xl font-black tracking-tighter">{report.overallScore}</span>
                        <span className="text-white/60 text-xs font-bold">점</span>
                      </div>
                    </div>
                    <p className="mt-10 text-center text-white/90 text-sm leading-relaxed font-medium px-6">
                      {report.overallScore >= 80 ? "훌륭한 코칭 역량을 보여주셨습니다! 🌟" : 
                       report.overallScore >= 60 ? "안정적인 면담 능력을 갖추고 계십니다. 👍" : 
                       "조금 더 연습이 필요한 단계입니다. 💪"}
                    </p>
                  </CardContent>
                </Card>

                {/* Detailed Analysis */}
                <Card className={`lg:col-span-2 border-none shadow-2xl rounded-[2.5rem] ${theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"}`}>
                  <CardHeader>
                    <CardTitle className={`flex items-center gap-3 ${theme === "dark" ? "text-white/90" : "text-[#002C5F]/90"}`}>
                      <BarChart3 className="w-6 h-6 text-[#007FA8]" /> 세부 역량 분석
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-4">
                    {Object.entries(report.detailedAnalysis).map(([key, value]) => (
                      <div key={key} className="space-y-4">
                        <div className="flex justify-between text-sm">
                          <span className={`font-bold ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>
                            {key === "empathy" ? "공감 능력" : 
                             key === "listening" ? "경청 태도" : 
                             key === "questioning" ? "질문 스킬" : "해결 중심"}
                          </span>
                          <span className="text-[#007FA8] font-black">{value}%</span>
                        </div>
                        <div className={`h-2.5 rounded-full overflow-hidden ${theme === "dark" ? "bg-white/5" : "bg-[#002C5F]/5"}`}>
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${value}%` }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            className="h-full bg-[#007FA8] shadow-[0_0_15px_rgba(0,127,168,0.5)]"
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Strengths & Weaknesses */}
                <Card className={`lg:col-span-2 border-none shadow-2xl rounded-[2.5rem] ${theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"}`}>
                  <CardHeader>
                    <CardTitle className={theme === "dark" ? "text-white/90" : "text-[#002C5F]/90"}>면담 총평 📝</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-green-400 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" /> 잘한 점
                        </h4>
                        <div className="space-y-3">
                          {report.strengths.map((s, i) => (
                            <div key={i} className={`text-sm p-4 rounded-2xl border leading-relaxed ${
                              theme === "dark" ? "text-white/70 bg-green-400/5 border-green-400/10" : "text-green-800 bg-green-50 border-green-100"
                            }`}>
                              {s}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> 보완할 점
                        </h4>
                        <div className="space-y-3">
                          {report.weaknesses.map((w, i) => (
                            <div key={i} className={`text-sm p-4 rounded-2xl border leading-relaxed ${
                              theme === "dark" ? "text-white/70 bg-amber-400/5 border-amber-400/10" : "text-amber-800 bg-amber-50 border-amber-100"
                            }`}>
                              {w}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Plan */}
                <Card className={`lg:col-span-1 border-none shadow-2xl rounded-[2.5rem] ${theme === "dark" ? "bg-white/5 backdrop-blur-xl" : "bg-white"}`}>
                  <CardHeader>
                    <CardTitle className={`flex items-center gap-3 ${theme === "dark" ? "text-white/90" : "text-[#002C5F]/90"}`}>
                      <BrainCircuit className="w-6 h-6 text-[#007FA8]" /> Action Plan 🚀
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative pt-4">
                    <Quote className={`absolute top-0 left-0 w-12 h-12 -ml-4 -mt-4 ${theme === "dark" ? "text-white/5" : "text-[#002C5F]/5"}`} />
                    <p className={`text-sm leading-relaxed italic relative z-10 font-medium ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>
                      "{report.actionPlan}"
                    </p>
                    <div className={`mt-10 pt-6 border-t ${theme === "dark" ? "border-white/5" : "border-[#002C5F]/5"}`}>
                      <p className={`text-[10px] leading-relaxed ${theme === "dark" ? "text-white/20" : "text-[#002C5F]/20"}`}>
                        * 이 리포트는 AI 분석 결과이며, 실제 현장 상황에 맞춰 유연하게 적용하시기 바랍니다.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Growth Dashboard Modal */}
        <AnimatePresence>
          {showDashboard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowDashboard(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className={`w-full max-w-4xl border rounded-[2.5rem] overflow-hidden shadow-2xl ${
                  theme === "dark" ? "bg-[#0B0E14] border-white/10" : "bg-[#F6F3ED] border-[#002C5F]/10"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`p-8 border-b flex items-center justify-between ${theme === "dark" ? "border-white/5" : "border-[#002C5F]/5"}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#007FA8]/10 rounded-2xl flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-[#007FA8]" />
                    </div>
                    <div>
                      <h3 className={`text-2xl font-bold ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>나의 성장 대시보드 📈</h3>
                      <p className={theme === "dark" ? "text-white/40 text-sm" : "text-[#002C5F]/40 text-sm"}>실습 이력 및 역량 변화 추이</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowDashboard(false)} className={theme === "dark" ? "text-white/20 hover:text-white" : "text-[#002C5F]/20 hover:text-[#002C5F]"}>
                    <ChevronLeft className="w-6 h-6" />
                  </Button>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Card className={`border-none rounded-3xl p-6 ${theme === "dark" ? "bg-white/5" : "bg-white shadow-md"}`}>
                    <CardTitle className={`text-sm font-bold mb-6 flex items-center gap-2 ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>
                      <Clock className="w-4 h-4" /> 최근 점수 추이
                    </CardTitle>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={userHistory.slice(-5)}>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#ffffff10" : "#002C5F10"} vertical={false} />
                          <XAxis 
                            dataKey="timestamp" 
                            tickFormatter={(val) => new Date(val).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            stroke={theme === "dark" ? "#ffffff40" : "#002C5F40"}
                            fontSize={10}
                          />
                          <YAxis stroke={theme === "dark" ? "#ffffff40" : "#002C5F40"} fontSize={10} domain={[0, 100]} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: theme === "dark" ? '#1A1D24' : '#fff', 
                              border: 'none', 
                              borderRadius: '12px', 
                              color: theme === "dark" ? '#fff' : '#002C5F' 
                            }}
                            itemStyle={{ color: '#007FA8' }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="score" 
                            stroke="#007FA8" 
                            strokeWidth={3} 
                            dot={{ fill: '#007FA8', r: 4 }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className={`border-none rounded-3xl p-6 ${theme === "dark" ? "bg-white/5" : "bg-white shadow-md"}`}>
                    <CardTitle className={`text-sm font-bold mb-6 flex items-center gap-2 ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>
                      <Target className="w-4 h-4" /> 영역별 평균 역량
                    </CardTitle>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                          { subject: '공감', A: userHistory.reduce((acc, curr) => acc + (curr.report?.detailedAnalysis?.empathy || 0), 0) / (userHistory.length || 1) },
                          { subject: '경청', A: userHistory.reduce((acc, curr) => acc + (curr.report?.detailedAnalysis?.listening || 0), 0) / (userHistory.length || 1) },
                          { subject: '질문', A: userHistory.reduce((acc, curr) => acc + (curr.report?.detailedAnalysis?.questioning || 0), 0) / (userHistory.length || 1) },
                          { subject: '해결', A: userHistory.reduce((acc, curr) => acc + (curr.report?.detailedAnalysis?.solutionFocus || 0), 0) / (userHistory.length || 1) },
                        ]}>
                          <PolarGrid stroke={theme === "dark" ? "#ffffff10" : "#002C5F10"} />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: theme === "dark" ? '#ffffff60' : '#002C5F60', fontSize: 10 }} />
                          <Radar name="평균 역량" dataKey="A" stroke="#007FA8" fill="#007FA8" fillOpacity={0.6} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>

                <div className="p-8 pt-0">
                  <Card className={`border-none rounded-3xl p-6 ${theme === "dark" ? "bg-white/5" : "bg-white shadow-md"}`}>
                    <CardTitle className={`text-sm font-bold mb-4 ${theme === "dark" ? "text-white/60" : "text-[#002C5F]/60"}`}>최근 실습 기록</CardTitle>
                    <div className="space-y-3">
                      {userHistory.slice(-3).reverse().map((h, i) => (
                        <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border ${
                          theme === "dark" ? "bg-white/5 border-white/5" : "bg-[#002C5F]/5 border-[#002C5F]/5"
                        }`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 ${getGrade(h.score).bg} rounded-xl flex items-center justify-center border border-white/5`}>
                              <span className={`font-bold ${getGrade(h.score).color}`}>{getGrade(h.score).label}</span>
                            </div>
                            <div>
                              <p className={`text-sm font-bold ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>{h.scenarioId}</p>
                              <p className={theme === "dark" ? "text-white/40 text-[10px]" : "text-[#002C5F]/40 text-[10px]"}>{new Date(h.timestamp).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-lg font-black ${theme === "dark" ? "text-white" : "text-[#002C5F]"}`}>{h.score}<span className={`text-[10px] ml-0.5 ${theme === "dark" ? "text-white/20" : "text-[#002C5F]/20"}`}>점</span></p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

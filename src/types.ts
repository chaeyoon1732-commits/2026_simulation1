export interface Persona {
  id: string;
  name: string;
  role: string;
  department: '영업' | '서비스';
  description: string;
  traits: string[];
  mbti?: string;
  difficulty: '상' | '중' | '하';
  emoji: string;
}

export type ScenarioCategory = '목표/평가면담' | '인사통보' | '직원케어' | '성과관리';

export interface Scenario {
  id: string;
  category: ScenarioCategory;
  title: string;
  description: string;
  context: string; // Detailed background for the briefing step
  goal: string;
  coreGuide: string;
  subGoals: string[]; // For the real-time checklist
  guideDirection: string; // High-level direction instead of direct steps
  hints: string[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  analysis?: {
    sentiment: string;
    cooperation: number; // 0-100
    intent: string;
    achievedGoalIndices: number[]; // Indices of subGoals achieved so far
    metrics: {
      trust: number;      // 신뢰도
      acceptance: number; // 수용성
      stability: number;  // 안정감
      engagement: number; // 몰입도
    };
    coachAdvice?: string; // 실시간 AI 코치 조언
  };
}

export interface FeedbackReport {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  actionPlan: string;
  detailedAnalysis: {
    empathy: number;
    listening: number;
    questioning: number;
    solutionFocus: number;
  };
  sbiAnalysis: {
    situation: string;
    behavior: string;
    impact: string;
  };
  growModel: {
    goal: string;
    reality: string;
    options: string;
    will: string;
  };
}

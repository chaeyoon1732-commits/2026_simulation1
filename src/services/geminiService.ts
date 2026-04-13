import { GoogleGenAI, Type } from "@google/genai";
import { Message, Persona, FeedbackReport, Scenario } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getPersonaResponse(
  persona: Persona,
  scenario: Scenario,
  history: Message[]
): Promise<{ content: string; analysis: Message['analysis'] }> {
  const systemInstruction = `
    당신은 현대자동차의 구성원 '${persona.name}'(${persona.role})입니다.
    
    [페르소나 설정]
    - 부서: ${persona.department}
    - 성격/상황: ${persona.description}
    - 특징: ${persona.traits.join(", ")}
    - MBTI: ${persona.mbti}
    - 난이도: ${persona.difficulty}

    [면담 시나리오]
    - 주제: ${scenario.title}
    - 상황 설명: ${scenario.description}
    - 리더의 목표: ${scenario.goal}

    [대화 가이드라인]
    1. 설정된 페르소나에 완전히 몰입하여 대화하세요.
    2. 처음에는 시나리오 상황에 따라 방어적이거나 본인의 입장만 고수할 수 있습니다.
    3. 상대방(리더)이 공감, 경청, 열린 질문을 적절히 사용하면 조금씩 마음을 여는 모습을 보여주세요.
    4. 너무 쉽게 수긍하지 마세요. 실제 현장에서 겪을 법한 갈등 상황을 리얼하게 연출하세요.
    5. 답변은 1~3문장 내외로 간결하게 하되, 감정이 느껴지도록 하세요.
    6. 전문 용어(카마스터, 하이테크센터 등)를 자연스럽게 사용하세요.

    [응답 형식]
    반드시 다음 JSON 구조로 응답하세요:
    {
      "content": "페르소나의 답변 내용",
      "analysis": {
        "sentiment": "현재 감정 상태 (예: 방어적, 서운함, 기대감, 분노 등)",
        "cooperation": 0~100 사이의 협조도 점수,
        "intent": "현재 발화의 숨은 의도나 심리 상태 요약",
        "achievedGoalIndices": [현재까지 리더가 달성한 하위 목표의 인덱스 번호 리스트 (0부터 시작)],
        "metrics": {
          "trust": 0~100 사이의 신뢰도 점수,
          "acceptance": 0~100 사이의 수용성 점수,
          "stability": 0~100 사이의 안정감 점수,
          "engagement": 0~100 사이의 몰입도 점수
        },
        "coachAdvice": "리더에게 주는 실시간 코칭 조언 (한 문장, 예: '지금은 질문보다 공감이 필요한 타이밍입니다.')"
      }
    }

    [하위 목표 리스트]
    ${scenario.subGoals.map((g, i) => `${i}: ${g}`).join("\n")}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: history.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      })),
      config: {
        systemInstruction,
        temperature: 0.8,
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text || "{}");
    return {
      content: result.content || "죄송합니다. 잠시 생각을 정리 중입니다.",
      analysis: result.analysis
    };
  } catch (error) {
    console.error("Gemini API Error (Chat):", error);
    return {
      content: "대화 도중 오류가 발생했습니다. 다시 시도해주세요.",
      analysis: { 
        sentiment: "오류", 
        cooperation: 50, 
        intent: "시스템 오류 발생", 
        achievedGoalIndices: [],
        metrics: { trust: 50, acceptance: 50, stability: 50, engagement: 50 }
      }
    };
  }
}

export async function generateFeedback(
  persona: Persona,
  scenario: Scenario,
  history: Message[]
): Promise<FeedbackReport> {
  const conversationText = history
    .map(msg => `${msg.role === "user" ? "리더" : persona.name}: ${msg.content}`)
    .join("\n");

  const prompt = `
    다음은 현대자동차 리더와 구성원(${persona.name}) 간의 성과관리 면담 대화록입니다.
    시나리오(${scenario.title})의 목표(${scenario.goal}) 달성 여부와 리더의 면담 스킬을 분석하여 상세 리포트를 작성해주세요.

    [대화록]
    ${conversationText}

    [분석 기준]
    1. 공감(Empathy): 구성원의 상황과 감정을 얼마나 이해하고 표현했는가?
    2. 경청(Listening): 구성원의 말을 끊지 않고 충분히 들었는가?
    3. 질문(Questioning): '열린 질문' 비율이 높은가? 해결책을 강요하기보다 스스로 답을 찾게 했는가?
    4. 해결 중심(Solution Focus): '지시적 화법' 빈도를 줄이고 구체적인 개선 방안이나 Action Plan을 도출했는가?

    [응답 형식]
    반드시 다음 JSON 구조로 응답하세요:
    {
      "overallScore": 0~100 사이의 점수,
      "strengths": ["잘한 점 1", "잘한 점 2"],
      "weaknesses": ["보완할 점 1", "보완할 점 2"],
      "actionPlan": "향후 실제 현장 실습 시 적용할 구체적인 Action Plan 제안",
      "detailedAnalysis": {
        "empathy": 0~100,
        "listening": 0~100,
        "questioning": 0~100,
        "solutionFocus": 0~100
      },
      "sbiAnalysis": {
        "situation": "면담 중 발생한 특정 상황 요약",
        "behavior": "리더가 보인 구체적인 행동이나 발언",
        "impact": "그 행동이 구성원에게 미친 영향(심리적/성과적)"
      },
      "growModel": {
        "goal": "면담을 통해 합의된 목표",
        "reality": "현재의 객관적인 상황 파악 내용",
        "options": "도출된 해결 대안들",
        "will": "구성원의 실행 의지 및 향후 계획"
      }
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text || "{}");
    return result as FeedbackReport;
  } catch (error) {
    console.error("Gemini API Error (Feedback):", error);
    throw error;
  }
}

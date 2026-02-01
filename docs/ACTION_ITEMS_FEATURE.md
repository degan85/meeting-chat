# 액션 아이템 연동 기능

> **작성일:** 2026-02-01  
> **상태:** 구현 완료  
> **관련 앱:** meeting-mind, schedule-manager

---

## 📋 개요

meeting-chat에서 회의 전사 내용뿐만 아니라 **액션 아이템(Action Items)**도 함께 조회하고 분석할 수 있는 기능입니다.

### 주요 기능
- 🔍 액션 아이템 키워드 자동 감지
- 📊 상태별 필터링 (미완료/완료/전체)
- 🔗 Task/Issue 변환 상태 추적
- 👤 담당자 기반 필터링

---

## 🎯 사용 시나리오

### 예시 질문

```
"미완료 액션 아이템 보여줘"
"지난주 회의에서 나온 할 일 뭐 있어?"
"내가 담당인 태스크 진행 상황은?"
"SGC 프로젝트 액션 아이템 중 완료 안 된 거"
"이번 주 마감인 액션 아이템"
```

### 응답 예시

```markdown
## 📋 미완료 액션 아이템 (3건)

### 📁 SGC 프로젝트

⏳ **API 설계 문서 작성**
   - 담당: 대근 | 마감: 2월 5일
   - 회의: 킥오프 미팅 (1월 28일)
   - 🔄 Task로 변환됨 (상태: IN_PROGRESS)

⏳ **테스트 케이스 정리**
   - 담당: 미배정 | 마감일 없음
   - 회의: 개발 회의 (1월 30일)

### 📋 기타

⏳ **주간 보고서 제출**
   - 담당: 대근 | 마감: 2월 2일
   - 회의: 팀 미팅 (1월 31일)
```

---

## 🏗️ 아키텍처

### 데이터 흐름

```
┌─────────────────────────────────────────────────────┐
│                    ActionItem                        │
│  - meetingId (원본 회의)                              │
│  - status: todo / in_progress / done                │
│  - assigneeId, assigneeName                         │
│  - convertedToType: "task" | "issue" | null         │
│  - convertedToId: Task.id 또는 Issue.id             │
└──────────────────────┬──────────────────────────────┘
                       │ 변환?
                       ▼
┌─────────────────────────────────────────────────────┐
│                      Task                            │
│  - status: TODO / IN_PROGRESS / DONE / ...          │
│  - projectId (프로젝트 연결)                          │
│  - assigneeId (담당자)                               │
│  - dueDate (마감일)                                  │
└─────────────────────────────────────────────────────┘
```

### DB 관계

```
Meeting (1) ──────< ActionItem (N)
                         │
                         │ actionItemId (1:1)
                         ▼
                       Task ──────> Project
```

---

## 📁 파일 구조

```
src/
├── app/api/
│   ├── action-items/
│   │   └── route.ts        # 액션 아이템 API
│   └── chat/
│       └── route.ts        # 수정됨 - 액션 아이템 연동
└── lib/
    └── action-items.ts     # 헬퍼 함수
```

---

## 🔧 API 명세

### GET /api/action-items

액션 아이템 목록 조회

#### Query Parameters

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `projectId` | string | 특정 프로젝트의 아이템만 조회 |
| `meetingId` | string | 특정 회의의 아이템만 조회 |
| `status` | `all` \| `todo` \| `done` | 상태 필터 (기본: all) |
| `mine` | boolean | 본인 담당만 조회 |
| `format` | `json` \| `markdown` | 응답 형식 |

#### Response (JSON)

```json
{
  "items": [
    {
      "id": "clx...",
      "title": "API 설계 문서 작성",
      "status": "todo",
      "priority": "high",
      "assigneeName": "대근",
      "meetingId": "clx...",
      "meetingTitle": "킥오프 미팅",
      "meetingDate": "2026-01-28T09:00:00Z",
      "convertedToType": "task",
      "convertedToId": "clx...",
      "taskStatus": "IN_PROGRESS",
      "taskDueDate": "2026-02-05T00:00:00Z",
      "projectName": "SGC 프로젝트",
      "projectId": "clx..."
    }
  ],
  "stats": {
    "total": 10,
    "todo": 7,
    "done": 3,
    "convertedToTask": 5,
    "convertedToIssue": 1,
    "unassigned": 2
  },
  "count": 10
}
```

---

## 🔄 Chat API 변경사항

### 키워드 감지

다음 키워드가 포함되면 액션 아이템 모드 활성화:

```typescript
const keywords = [
  '액션 아이템', '액션아이템', 'action item',
  '할 일', '할일', 'todo', '투두',
  '미완료', '완료 안', '안 된',
  '담당', '배정', '맡은',
  '진행 상황', '진행률',
  '태스크', 'task'
]
```

### 상태 필터 자동 파싱

| 질문 예시 | 감지된 필터 |
|----------|------------|
| "미완료 액션 아이템" | `status: 'todo'` |
| "완료된 할 일" | `status: 'done'` |
| "모든 액션 아이템" | `status: 'all'` |
| "내 담당 태스크" | `assigneeOnly: true` |

### 프롬프트 확장

액션 아이템 관련 질문 시 추가 규칙:

```
6. 액션 아이템의 상태를 명확히 표시하세요:
   - ⏳ 진행중 (todo/in_progress)
   - ✅ 완료 (done)
   - 🔄 Task로 변환됨
   - 🐛 Issue로 변환됨
7. 담당자와 마감일 정보가 있으면 포함하세요.
8. Task로 변환된 경우 Task의 최신 상태를 우선 표시하세요.
```

---

## ✅ 상태 아이콘

| 아이콘 | 의미 |
|-------|------|
| ⏳ | 진행중 (todo / in_progress) |
| ✅ | 완료 (done) |
| 🔄 | Task로 변환됨 / 진행중 |
| 👀 | 검토중 (IN_REVIEW) |
| 🚫 | 차단됨 (BLOCKED) |
| 🐛 | Issue로 변환됨 |

---

## 🧪 테스트 케이스

### 1. 기본 조회
```
입력: "액션 아이템 보여줘"
기대: 전체 액션 아이템 목록 반환
```

### 2. 상태 필터
```
입력: "미완료 할 일"
기대: status != 'done' 인 아이템만 반환
```

### 3. 프로젝트 필터
```
설정: projectId 선택된 상태
입력: "이 프로젝트 액션 아이템"
기대: 해당 프로젝트 회의의 아이템만 반환
```

### 4. 담당자 필터
```
입력: "내가 담당인 태스크"
기대: assigneeId = 현재 사용자인 아이템만 반환
```

### 5. Task 변환 추적
```
입력: "태스크로 변환된 액션 아이템 상태"
기대: convertedToType = 'task'인 아이템과 Task 상태 함께 표시
```

---

## 🚀 향후 개선 아이디어

### Phase 2
- [ ] 마감일 기반 검색 ("이번 주 마감인 할 일")
- [ ] 우선순위 필터 ("긴급한 액션 아이템")
- [ ] 담당자별 통계 ("팀원별 할 일 현황")

### Phase 3
- [ ] 액션 아이템 → Task 직접 변환 (채팅에서)
- [ ] 상태 업데이트 (채팅에서 "완료 처리해줘")
- [ ] 알림 연동 (마감 임박 알림)

---

## 📚 관련 문서

- [schedule-manager/CLAUDE.md](https://github.com/Import-Corp/schedule-manager/blob/main/CLAUDE.md) - Task 모델 상세
- [meeting-mind/CLAUDE.md](https://github.com/Import-Corp/meeting-mind/blob/main/CLAUDE.md) - ActionItem 추출 로직

---

**작성:** 우버 🤖  
**검토:** 대근

'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; content: string }[]
}

interface Meeting {
  id: string
  title: string
  createdAt: string
}

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchMeetings()
    }
  }, [session])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings')
      if (res.status === 401) {
        return
      }
      const data = await res.json()
      if (data.meetings) setMeetings(data.meetings)
    } catch (e) {
      console.error('Failed to fetch meetings:', e)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          meetingId: selectedMeeting || undefined
        }),
      })

      if (res.status === 401) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '로그인이 필요합니다. 다시 로그인해 주세요.'
        }])
        setIsLoading(false)
        return
      }

      if (res.status === 403) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '해당 회의에 접근 권한이 없습니다.'
        }])
        setIsLoading(false)
        return
      }

      const data = await res.json()

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || '응답을 생성할 수 없습니다.',
        sources: data.sources
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '오류가 발생했습니다. 다시 시도해주세요.'
      }])
    }
    setIsLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const selectMeeting = (meetingId: string) => {
    setSelectedMeeting(meetingId)
    setSidebarOpen(false)
  }

  const exampleQuestions = [
    '오늘 회의에서 결정된 사항이 뭐야?',
    '마케팅 관련 논의 내용 정리해줘',
    '지난 주 회의에서 나온 액션 아이템 알려줘',
  ]

  // 로딩 중
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 미로그인 상태 - /login으로 리다이렉트
  if (!session) {
    return null
  }

  // 로그인 상태
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          {/* 햄버거 메뉴 (모바일) */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-800 rounded-lg lg:hidden"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-bold">미팅챗</h1>
        </div>

        {/* 프로필 & 로그아웃 */}
        <div className="flex items-center gap-3">
          {session.user?.image && (
            <img
              src={session.user.image}
              alt="Profile"
              className="w-8 h-8 rounded-full"
            />
          )}
          <span className="text-sm hidden sm:block">{session.user?.name}</span>
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* 오버레이 (모바일에서 사이드바 열릴 때) */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 사이드바 */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-30
          w-72 bg-gray-900 border-r border-gray-800
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col pt-0 lg:pt-0
        `}>
          {/* 모바일 사이드바 헤더 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-800 lg:hidden">
            <span className="font-bold">회의 목록</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-gray-800 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 회의 필터 */}
          <div className="p-4 border-b border-gray-800">
            <label className="text-xs text-gray-400 block mb-2">회의 선택</label>
            <select
              value={selectedMeeting}
              onChange={(e) => selectMeeting(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">전체 회의에서 검색</option>
              {meetings.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          {/* 최근 회의 */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-xs text-gray-400 mb-3">최근 회의</h3>
            {meetings.length === 0 ? (
              <p className="text-xs text-gray-500">접근 가능한 회의가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {meetings.slice(0, 10).map(m => (
                  <button
                    key={m.id}
                    onClick={() => selectMeeting(m.id)}
                    className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                      selectedMeeting === m.id
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'hover:bg-gray-800 text-gray-300'
                    }`}
                  >
                    <div className="truncate">{m.title}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* 메인 채팅 영역 */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* 선택된 회의 표시 (모바일) */}
          {selectedMeeting && (
            <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-800 lg:hidden">
              <p className="text-xs text-gray-400">
                선택된 회의: <span className="text-blue-400">{meetings.find(m => m.id === selectedMeeting)?.title}</span>
              </p>
            </div>
          )}

          {/* 채팅 메시지 */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="text-5xl sm:text-6xl mb-4">🎙️</div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">회의 내용에 대해 물어보세요</h2>
                <p className="text-gray-400 mb-6 sm:mb-8 max-w-md text-sm sm:text-base">
                  전사된 회의 내용을 AI가 분석하여 필요한 정보를 찾아드립니다
                </p>

                <div className="space-y-2 w-full max-w-md">
                  <p className="text-xs text-gray-500 mb-2">예시 질문</p>
                  {exampleQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="block w-full text-left px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-sm text-gray-300 transition-colors"
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-3 sm:px-4 py-2 sm:py-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                    }`}>
                      <div className="whitespace-pre-wrap text-sm sm:text-base">{msg.content}</div>

                      {/* 출처 표시 */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <p className="text-xs text-gray-400 mb-2">📄 참고한 내용:</p>
                          {msg.sources.map((src, j) => (
                            <div key={j} className="text-xs bg-gray-900/50 rounded p-2 mb-1">
                              <div className="font-medium text-gray-300">{src.title}</div>
                              <div className="text-gray-500 truncate">{src.content}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 입력 영역 */}
          <div className="border-t border-gray-800 p-3 sm:p-4 shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2 sm:gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="회의 내용에 대해 질문하세요..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base focus:outline-none focus:border-blue-500 transition-colors"
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !input.trim()}
                  className="px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-medium transition-colors text-sm sm:text-base"
                >
                  전송
                </button>
              </div>
              {/* 데스크톱에서 선택된 회의 표시 */}
              {selectedMeeting && (
                <p className="text-xs text-gray-500 mt-2 hidden lg:block">
                  🎯 선택된 회의: {meetings.find(m => m.id === selectedMeeting)?.title}
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
